//! End-to-end tests of the IPC surface: the real `AppState` (headless engine,
//! memory secret store, in-memory index, files under a temporary user folder) and
//! the real command table, driven through Tauri's mock runtime exactly the way the
//! WebView invokes them. No hardware, no network, no window server; runs on the
//! Windows and macOS CI runners.
use serde_json::{json, Value};
use std::sync::Once;
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{ipc::InvokeBody, WebviewWindow};

static ENV: Once = Once::new();

/// One temporary user folder per test process; every test uses unique ids inside it.
fn isolate() {
    ENV.call_once(|| {
        let root = std::env::temp_dir().join(format!("jam-ipc-e2e-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::env::set_var("JAM_HEADLESS", "1");
        std::env::set_var("JAM_USER_DIR", &root);
        std::env::set_var("JAM_DATA_DIR", root.join("data"));
    });
}

pub struct Studio {
    _app: tauri::App<tauri::test::MockRuntime>,
    webview: WebviewWindow<tauri::test::MockRuntime>,
}

impl Studio {
    /// The desktop app on the mock runtime: same state, same commands, same setup.
    pub fn boot() -> Self {
        isolate();
        let app = app_lib::configure(mock_builder(), app_lib::build_state())
            .build(mock_context(noop_assets()))
            .expect("app builds on the mock runtime");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("main window");
        Self { _app: app, webview }
    }

    /// Invokes a command as the frontend would; `Err` carries the command's error value.
    pub fn invoke(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        get_ipc_response(
            &self.webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().expect("json response"))
    }

    pub fn ok(&self, cmd: &str, args: Value) -> Value {
        self.invoke(cmd, args)
            .unwrap_or_else(|e| panic!("{cmd} failed: {e}"))
    }

    pub fn err(&self, cmd: &str, args: Value) -> String {
        match self.invoke(cmd, args) {
            Ok(v) => panic!("{cmd} unexpectedly succeeded: {v}"),
            Err(e) => e
                .as_str()
                .map(String::from)
                .unwrap_or_else(|| e.to_string()),
        }
    }
}

#[test]
fn boots_headless_and_answers_the_startup_handshake() {
    let studio = Studio::boot();
    let status = studio.ok("engine_status", json!({}));
    assert_eq!(status["mode"], "Headless");
    assert_eq!(status["sample_rate"], 48000);
    let settings = studio.ok("settings_get", json!({}));
    assert_eq!(settings["schemaVersion"], 1);
    assert_eq!(
        studio.ok("settings_recovery_notice", json!({})),
        Value::Null
    );
    let charts = studio.ok("band_list_charts", json!({}));
    assert!(charts.as_array().is_some_and(|c| c.len() >= 8));
    assert!(studio
        .err("band_load_chart", json!({"chartId": "no-such-chart"}))
        .contains("no-such-chart"));
}
