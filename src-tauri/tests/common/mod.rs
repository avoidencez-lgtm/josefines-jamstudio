//! Shared harness for the IPC end-to-end tests: the real `AppState` (headless
//! engine, memory secret store, in-memory index, files under a temporary user
//! folder) and the real command table, driven through Tauri's mock runtime exactly
//! the way the WebView invokes them. No hardware, no network, no window server; runs
//! on the Windows and macOS CI runners.
//!
//! Every test binary under `tests/` uses `mod common;` and `common::Studio::boot()`.
//! `scenario()` serializes tests and resets their process-specific temporary root.
//! `unique("song")` separates documents and multiple studios within a scenario.
#![allow(dead_code)]

use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, Once};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{ipc::InvokeBody, WebviewWindow};

static ENV: Once = Once::new();
static COUNTER: AtomicU64 = AtomicU64::new(0);
// ponytail: file paths are process-wide; serialize scenarios until roots become per-AppState.
static SCENARIO: Mutex<()> = Mutex::new(());

/// A fresh file sandbox for each scenario; multiple studios within it can share persistence.
pub fn scenario() -> MutexGuard<'static, ()> {
    let guard = SCENARIO.lock().unwrap_or_else(|e| e.into_inner());
    isolate();
    let root = user_dir();
    if root.exists() {
        std::fs::remove_dir_all(&root).expect("clear this test process's temporary files");
    }
    std::fs::create_dir_all(root).unwrap();
    guard
}

/// The temporary user folder for this test process (`JAM_USER_DIR`).
pub fn user_dir() -> PathBuf {
    std::env::temp_dir().join(format!(
        "jam-ipc-e2e-{}-{}",
        std::process::id(),
        env!("CARGO_CRATE_NAME")
    ))
}

/// Sets the process-wide environment once: headless engine, memory secret store,
/// in-memory index, and every file under [`user_dir`]. `JAM_LIVE` is never set, so
/// nothing can leave the machine (see `net::live_guard`).
fn isolate() {
    ENV.call_once(|| {
        let root = user_dir();
        std::fs::create_dir_all(&root).unwrap();
        std::env::set_var("JAM_HEADLESS", "1");
        std::env::set_var("JAM_USER_DIR", &root);
        std::env::set_var("JAM_DATA_DIR", root.join("data"));
        std::env::remove_var("JAM_LIVE");
    });
}

/// An id that no other test in this process produces: `<prefix>-<pid>-<n>`.
pub fn unique(prefix: &str) -> String {
    format!(
        "{prefix}-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

pub struct Studio {
    app: tauri::App<tauri::test::MockRuntime>,
    webview: WebviewWindow<tauri::test::MockRuntime>,
}

impl Studio {
    /// The desktop app on the mock runtime: same state, same setup hook, same
    /// command table as `app_lib::run`. Setup runs when `start_events` is called.
    /// Several studios may exist in one process.
    pub fn boot() -> Self {
        isolate();
        let app = app_lib::configure(mock_builder(), app_lib::build_state())
            .build(mock_context(noop_assets()))
            .expect("app builds on the mock runtime");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("main window");
        Self { app, webview }
    }

    /// The Tauri app, for `listen_any`, `state::<AppState>()` and friends.
    pub fn app(&self) -> &tauri::App<tauri::test::MockRuntime> {
        &self.app
    }

    /// Run the real setup hook and one mock event-loop iteration for event scenarios.
    #[allow(deprecated)] // One iteration only: runs setup, never the deprecated busy loop.
    pub fn start_events(&mut self) {
        self.app.run_iteration(|_, _| {});
    }

    /// Invokes a command as the frontend would; `Err` carries the command's error value.
    /// The origin is the platform's local one (`http://tauri.localhost` on Windows and
    /// Android, `tauri://localhost` elsewhere): the ACL treats any other origin as
    /// remote and refuses every app command.
    pub fn invoke(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        let origin = if cfg!(any(windows, target_os = "android")) {
            "http://tauri.localhost"
        } else {
            "tauri://localhost"
        };
        get_ipc_response(
            &self.webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: origin.parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().expect("json response"))
    }

    /// Invokes and panics with the error if the command fails.
    pub fn ok(&self, cmd: &str, args: Value) -> Value {
        self.invoke(cmd, args)
            .unwrap_or_else(|e| panic!("{cmd} failed: {e}"))
    }

    /// Invokes and returns the error text; panics if the command succeeds.
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
