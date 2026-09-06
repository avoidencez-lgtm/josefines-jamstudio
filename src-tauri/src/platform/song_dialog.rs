//! The system picker returns a path only; the shared native import validates the file.
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn song_pick_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    if cfg!(test) || std::env::var("JAM_HEADLESS").as_deref() == Ok("1") {
        return Err("The file picker is unavailable in headless mode. Supply a local path.".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(
            "Audio",
            &["wav", "mp3", "flac", "m4a", "aiff", "aif", "ogg"],
        )
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
