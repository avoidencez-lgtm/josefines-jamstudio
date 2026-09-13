//! Lyria RealTime session. Live WebSocket stays not configured.
use crate::net::lyria::{self, Config, Machine, Status};
use crate::AppState;
use tauri::{AppHandle, Emitter, Runtime, State};

#[derive(Default)]
pub struct Session {
    machine: Option<Machine>,
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
    fn arm(config: Config) -> Result<(Machine, Vec<i16>), String> {
        lyria::validate(&config)?;
        let mut machine = lyria::recorded_for_session()?;
        machine.apply(config)?;
        Ok((machine, lyria::recorded_audio()?))
    }

    fn commit(&mut self, machine: Machine) -> Status {
        self.machine = Some(machine);
        self.status()
    }

    pub fn stop(&mut self) -> Status {
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
        machine.apply(patch)?;
        Ok(machine.status())
    }

    pub fn config(&self) -> Option<Config> {
        self.machine.as_ref().map(|m| m.config.clone())
    }
}

fn emit<R: Runtime>(app: &AppHandle<R>, status: &Status) {
    let _ = app.emit("lyria:state", status);
}

#[tauri::command]
pub fn lyria_start<R: Runtime>(
    config: Option<Config>,
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Status, String> {
    let (machine, audio) = Session::arm(config.unwrap_or_default())?;
    {
        let mut eng = state.engine.lock();
        eng.ensure_timing_editable()?;
        eng.unload_reference()?;
        eng.transport_stop();
        eng.lyria_start();
        eng.lyria_push_pcm16(&audio)?;
    }
    let status = state.lyria.lock().commit(machine);
    emit(&app, &status);
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
