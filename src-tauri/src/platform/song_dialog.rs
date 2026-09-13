//! The system picker returns a path only; the shared native import validates the file.
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn song_pick_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
) -> Result<Option<String>, String> {
    if cfg!(test) || std::env::var("JAM_HEADLESS").as_deref() == Ok("1") {
        return Err("The file picker is unavailable in headless mode. Supply a local path.".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(
            "Audio",
            &["wav", "mp3", "flac", "m4a", "aac", "aiff", "aif", "ogg"],
        )
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
        let command = src
            .split("pub async fn song_pick_file")
            .nth(1)
            .unwrap_or(src);
        assert!(
            command.contains("window: tauri::WebviewWindow<R>"),
            "song_pick_file must take the invoking WebviewWindow"
        );
        assert!(
            command.contains("set_parent(&window)"),
            "the native picker must be modal to the studio window"
        );
        assert!(
            command.contains(".set_parent(&window)")
                && command.find("set_parent(&window)").unwrap()
                    < command.find("pick_file").unwrap(),
            "set_parent must run before pick_file so IFileDialog is not Show(NULL)"
        );
        assert!(
            command.contains(r#"&["wav", "mp3", "flac", "m4a", "aac", "aiff", "aif", "ogg"]"#),
            "the picker must offer the audio extensions the importer accepts"
        );
    }
}
