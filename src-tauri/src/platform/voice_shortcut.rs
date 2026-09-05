//! An explicitly enabled, session-only OS shortcut. No keyboard hook in the UI.
use tauri::{Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn parse(text: &str) -> Result<Shortcut, String> {
    if text.len() > 100 {
        return Err("Shortcut is too long.".into());
    }
    let shortcut: Shortcut = text
        .parse()
        .map_err(|_| "Use a shortcut such as CommandOrControl+Shift+J.")?;
    if !shortcut
        .mods
        .intersects(Modifiers::CONTROL | Modifiers::SUPER | Modifiers::ALT)
    {
        return Err("Include Control, Command or Alt in the voice shortcut.".into());
    }
    Ok(shortcut)
}

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _, event| {
            let _ = app.emit("voice:ptt", event.state() == ShortcutState::Pressed);
        })
        .build()
}

pub fn set<R: Runtime>(
    app: &tauri::AppHandle<R>,
    current: &mut Option<String>,
    next: Option<String>,
) -> Result<(), String> {
    if cfg!(test) || std::env::var("JAM_HEADLESS").ok().as_deref() == Some("1") {
        return Err("Global voice shortcuts require the desktop app outside headless mode.".into());
    }
    let key = next.as_deref().map(parse).transpose()?;
    if let Some(old) = current.as_deref() {
        if Some(parse(old)?) == key {
            return Ok(());
        }
        app.global_shortcut()
            .unregister(parse(old)?)
            .map_err(|e| format!("Could not disable voice shortcut: {e}"))?;
        *current = None;
    }
    if let Some(key) = key {
        app.global_shortcut().register(key).map_err(|_| {
            "Shortcut unavailable. Choose another combination; voice shortcut is now off."
        })?;
        *current = next;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shortcuts_require_an_os_modifier_and_parse_portably() {
        assert!(parse("CommandOrControl+Shift+J").is_ok());
        assert!(parse("Alt+J").is_ok());
        assert!(parse("J").is_err());
        assert!(parse("Shift+J").is_err());
        assert!(parse("not a shortcut").is_err());
    }
}
