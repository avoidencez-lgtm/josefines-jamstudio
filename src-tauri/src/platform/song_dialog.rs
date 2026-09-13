//! The system picker returns a path only; the shared native import validates the file.
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn song_pick_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
) -> Result<Option<String>, String> {
    pick_local_file(
        app,
        window,
        "Audio",
        &["wav", "mp3", "flac", "m4a", "aac", "aiff", "aif", "ogg"],
    )
    .await
}

#[tauri::command]
pub async fn chart_pick_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
) -> Result<Option<String>, String> {
    pick_local_file(app, window, "Charts", &["json"]).await
}

async fn pick_local_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    filter_name: &str,
    extensions: &[&str],
) -> Result<Option<String>, String> {
    if cfg!(test) || std::env::var("JAM_HEADLESS").as_deref() == Ok("1") {
        return Err("The file picker is unavailable in headless mode. Supply a local path.".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(filter_name, extensions)
        .set_parent(&window)
        .pick_file(move |file| {
            let _ = send.send(file);
        });
    receive
        .await
        .map_err(|_| "File picker closed unexpectedly")?
        .map(|file| {
            file.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|e| e.to_string())
        })
        .transpose()
}

#[cfg(test)]
mod tests {
    #[test]
    fn native_picker_is_parented_to_the_invoking_studio_window() {
        let src = include_str!("song_dialog.rs");
        for name in ["song_pick_file", "chart_pick_file"] {
            assert!(
                src.contains(&format!("pub async fn {name}")),
                "{name} must exist"
            );
        }
        let helper = src.split("async fn pick_local_file").nth(1).unwrap_or(src);
        assert!(
            helper.contains("window: tauri::WebviewWindow<R>"),
            "the native picker must take the invoking WebviewWindow"
        );
        assert!(
            helper.contains("set_parent(&window)"),
            "the native picker must be modal to the studio window"
        );
        let parent = helper.find("set_parent(&window)").unwrap();
        let pick = helper.find(".pick_file").unwrap();
        assert!(
            parent < pick,
            "set_parent must run before pick_file so IFileDialog is not Show(NULL)"
        );
        assert!(
            src.contains(r#"&["wav", "mp3", "flac", "m4a", "aac", "aiff", "aif", "ogg"]"#),
            "the picker must offer the audio extensions the importer accepts"
        );
    }
}
