//! Lyria RealTime session and audio-engine bridge.
use crate::net::lyria::{self, Config, LiveSocket, Machine, Status};
use crate::AppState;
use parking_lot::Mutex;
use serde_json::Value;
use std::{sync::Arc, time::Instant};
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::mpsc;

enum Control {
    Send(Vec<Value>),
    Stop,
}

#[derive(Default)]
pub struct Session {
    machine: Option<Machine>,
    control: Option<mpsc::UnboundedSender<Control>>,
    generation: u64,
    request: u64,
}

fn idle() -> Status {
    Status {
        phase: "idle".into(),
        requested_bpm: 0.0,
        scale: String::new(),
        buffering: false,
        live: false,
        drives_clock: false,
        outbound: 0,
    }
}

impl Session {
    fn fixture(config: Config) -> Result<(Machine, Vec<i16>), String> {
        lyria::validate(&config)?;
        let mut machine = lyria::recorded_for_session()?;
        machine.apply(config)?;
        Ok((machine, lyria::recorded_audio()?))
    }

    fn reserve(&mut self) -> u64 {
        self.request = self.request.wrapping_add(1);
        self.request
    }

    fn commit(
        &mut self,
        generation: u64,
        machine: Machine,
        control: Option<mpsc::UnboundedSender<Control>>,
    ) -> Result<Status, String> {
        if generation != self.request {
            return Err("Lyria start was cancelled.".into());
        }
        if let Some(previous) = self.control.take() {
            let _ = previous.send(Control::Stop);
        }
        self.machine = Some(machine);
        self.control = control;
        self.generation = generation;
        Ok(self.status())
    }

    fn finish(&mut self, generation: u64) -> bool {
        if generation != self.generation || self.machine.is_none() {
            return false;
        }
        self.control = None;
        self.machine = None;
        true
    }

    pub fn stop(&mut self) -> Status {
        self.request = self.request.wrapping_add(1);
        self.generation = self.request;
        if let Some(control) = self.control.take() {
            let _ = control.send(Control::Stop);
        }
        self.machine = None;
        idle()
    }

    pub fn status(&self) -> Status {
        self.machine
            .as_ref()
            .map(Machine::status)
            .unwrap_or_else(idle)
    }

    fn set(&mut self, patch: Config) -> Result<Status, String> {
        let machine = self
            .machine
            .as_mut()
            .ok_or("Start Lyria before changing it.")?;
        let previous = machine.clone();
        let first_new = machine.outbound.len();
        machine.apply(patch)?;
        if let Some(control) = &self.control {
            let messages = machine.outbound[first_new..].to_vec();
            if control.send(Control::Send(messages)).is_err() {
                *machine = previous;
                return Err("The Lyria connection has ended. Start it again.".into());
            }
        }
        Ok(machine.status())
    }

    pub fn config(&self) -> Option<Config> {
        self.machine.as_ref().map(|m| m.config.clone())
    }
}

fn emit<R: Runtime>(app: &AppHandle<R>, status: &Status) {
    let _ = app.emit("lyria:state", status);
}

async fn stream<R: Runtime>(
    mut socket: LiveSocket,
    mut controls: mpsc::UnboundedReceiver<Control>,
    generation: u64,
    app: AppHandle<R>,
    session: Arc<Mutex<Session>>,
    engine: Arc<Mutex<jam_audio::engine::AudioEngine>>,
) {
    let result = loop {
        tokio::select! {
            control = controls.recv() => match control {
                Some(Control::Send(messages)) => {
                    if let Err(error) = socket.send_all(&messages).await {
                        break Err(error);
                    }
                }
                Some(Control::Stop) | None => {
                    socket.stop().await;
                    break Ok(());
                }
            },
            audio = socket.next_audio() => match audio {
                Ok(samples) => {
                    if let Err(error) = engine.lock().lyria_push_pcm16(&samples) {
                        break Err(error);
                    }
                }
                Err(error) => break Err(error),
            }
        }
    };
    if session.lock().finish(generation) {
        engine.lock().lyria_stop();
        emit(&app, &idle());
        if let Err(error) = result {
            tracing::warn!("Lyria session ended: {error}");
            let _ = app.emit("app:error", format!("Lyria stopped. {error}"));
        }
    }
}

#[tauri::command]
pub async fn lyria_start<R: Runtime>(
    config: Option<Config>,
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Status, String> {
    let config = config.unwrap_or_default();
    lyria::validate(&config)?;
    state.engine.lock().ensure_timing_editable()?;
    let fixture = std::env::var("JAM_LYRIA_FIXTURE").as_deref() == Ok("1");
    let key = if fixture {
        None
    } else {
        if std::env::var("JAM_LIVE").as_deref() != Ok("1") {
            return Err(lyria::NOT_CONFIGURED.into());
        }
        Some(state.secret_store.require("gemini")?)
    };
    let generation = state.lyria.lock().reserve();

    let (machine, audio, live) = if let Some(key) = key {
        let started = Instant::now();
        let connected = LiveSocket::connect(config, &key).await;
        let entry = crate::net::CostEntry {
            at_ms: crate::net::now_ms(),
            provider: "gemini".into(),
            method: "WEBSOCKET".into(),
            path: lyria::USAGE_PATH.into(),
            status: if connected.is_ok() { 101 } else { 0 },
            duration_ms: started.elapsed().as_millis() as u64,
            model: Some(lyria::MODEL.into()),
            error: connected.as_ref().err().cloned(),
            ..crate::net::CostEntry::default()
        };
        if let Err(error) = state.cost_log.append(&entry) {
            let _ = app.emit(
                "app:error",
                format!("Could not save the usage log. {error}"),
            );
        }
        crate::emit_cost_state(&app, &state.cost_log);
        let (socket, machine) = connected?;
        (machine, None, Some(socket))
    } else {
        let (machine, audio) = Session::fixture(config)?;
        (machine, Some(audio), None)
    };
    let (sender, receiver) = mpsc::unbounded_channel();
    let live_control = live.as_ref().map(|_| sender);
    let committed = {
        let mut engine = state.engine.lock();
        let mut session = state.lyria.lock();
        if generation != session.request {
            None
        } else {
            engine.unload_reference()?;
            engine.transport_stop();
            engine.lyria_start();
            if let Some(audio) = &audio {
                engine.lyria_push_pcm16(audio)?;
            }
            Some(session.commit(generation, machine, live_control)?)
        }
    };
    let Some(status) = committed else {
        if let Some(socket) = live {
            socket.stop().await;
        }
        return Err("Lyria start was cancelled.".into());
    };
    emit(&app, &status);
    if let Some(socket) = live {
        tokio::spawn(stream(
            socket,
            receiver,
            generation,
            app,
            Arc::clone(&state.lyria),
            Arc::clone(&state.engine),
        ));
    }
    Ok(status)
}

#[tauri::command]
pub fn lyria_set<R: Runtime>(
    patch: Config,
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Status, String> {
    let status = state.lyria.lock().set(patch)?;
    emit(&app, &status);
    Ok(status)
}

#[tauri::command]
pub fn lyria_stop<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> Status {
    state.engine.lock().lyria_stop();
    let status = state.lyria.lock().stop();
    emit(&app, &status);
    status
}

#[tauri::command]
pub fn lyria_status(state: State<'_, AppState>) -> Status {
    state.lyria.lock().status()
}

pub fn stop_and_emit<R: Runtime>(app: &AppHandle<R>, state: &AppState) {
    state.engine.lock().lyria_stop();
    let status = state.lyria.lock().stop();
    emit(app, &status);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_starts_do_not_make_the_active_stream_stale() {
        let mut session = Session::default();
        let first = session.reserve();
        session
            .commit(first, Machine::from_fixture().unwrap(), None)
            .unwrap();
        let second = session.reserve();
        assert!(session.finish(first));
        session
            .commit(second, Machine::from_fixture().unwrap(), None)
            .unwrap();
        session.stop();
        assert!(session
            .commit(second, Machine::from_fixture().unwrap(), None)
            .is_err());
    }
}
