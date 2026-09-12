use crate::{library::Library, AppState};
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub fn controller_ports() -> Result<Vec<String>, String> {
    jam_rig::controller::ControllerInput::ports()
}
#[tauri::command]
pub fn controller_open(port: Option<String>, state: State<'_, AppState>) -> Result<(), String> {
    let connection = port
        .map(|name| {
            let toggle = controller_config()?["ccToggle"].as_bool().unwrap_or(false);
            jam_rig::controller::ControllerInput::open(&name, toggle)
        })
        .transpose()?;
    *state.controller.lock() = connection;
    Ok(())
}
fn validate(doc: &Value) -> Result<(), String> {
    let bindings = doc["bindings"].as_array().ok_or("Missing pedal bindings")?;
    if doc["schemaVersion"] != 1 || bindings.len() > 16 || doc.to_string().len() > 32_000 {
        return Err("Invalid pedal configuration".into());
    }
    if doc.get("ccToggle").is_some_and(|v| !v.is_boolean()) {
        return Err("Choose momentary or toggle CC pedals.".into());
    }
    let mut seen = std::collections::BTreeSet::new();
    for b in bindings {
        let action = b["action"].as_str().unwrap_or("");
        let p: jam_rig::controller::PedalPress =
            serde_json::from_value(b["press"].clone()).map_err(|e| e.to_string())?;
        if ![
            "keep", "record", "play", "loop", "next", "version", "voice", "ramp",
        ]
        .contains(&action)
            || !["program", "cc", "note"].contains(&p.kind.as_str())
            || !(1..=16).contains(&p.channel)
            || p.number > 127
            || !seen.insert((p.kind, p.channel, p.number))
        {
            return Err("A pedal press must have one valid action.".into());
        }
    }
    Ok(())
}
#[tauri::command]
pub fn controller_config() -> Result<Value, String> {
    let path = Library::default_user_root().join("controller.json");
    if !path.exists() {
        return Ok(json!({"schemaVersion":1,"bindings":[]}));
    }
    let doc = jam_core::json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    validate(&doc)?;
    Ok(doc)
}
/// Publish without deleting the previous configuration if rename fails.
fn replace_file(from: &std::path::Path, to: &std::path::Path) -> Result<(), String> {
    let published = std::fs::rename(from, to).map_err(|e| e.to_string());
    if published.is_err() {
        let _ = std::fs::remove_file(from);
    }
    published
}

#[tauri::command]
pub fn controller_save(document: Value) -> Result<(), String> {
    validate(&document)?;
    let root = Library::default_user_root();
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let dest = root.join("controller.json");
    let temp = root.join("controller.json.tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(&document).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    replace_file(&temp, &dest)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn duplicate_or_unsupported_pedal_actions_are_rejected() {
        let fixture: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/seams/controller.json"))
                .unwrap();
        assert!(validate(&fixture).is_ok());
        for toggle in [true, false] {
            assert!(validate(&json!({"schemaVersion":1,"bindings":[],"ccToggle":toggle})).is_ok());
        }
        assert!(validate(&json!({"schemaVersion":1,"bindings":[],"ccToggle":"false"})).is_err());
        assert!(validate(&json!({"schemaVersion":1,"bindings":[{"action":"ramp","press":{"kind":"note","channel":1,"number":60}}]})).is_ok());
        let b = json!({"action":"keep","press":{"kind":"program","channel":1,"number":12}});
        assert!(validate(&json!({"schemaVersion":1,"bindings":[b.clone()]})).is_ok());
        assert!(validate(&json!({"schemaVersion":1,"bindings":[b.clone(),b]})).is_err());
        assert!(validate(&json!({"schemaVersion":1,"bindings":[{"action":"delete","press":{"kind":"cc","channel":1,"number":12}}]})).is_err());
    }

    #[test]
    fn controller_save_replaces_an_existing_file_and_cleans_up_temp_on_error() {
        let root = std::env::temp_dir().join(format!(
            "jam-controller-save-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let dest = root.join("controller.json");
        let temp = root.join("controller.json.tmp");
        std::fs::write(&dest, b"old").unwrap();
        std::fs::write(&temp, b"new").unwrap();
        replace_file(&temp, &dest).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"new");
        assert!(!temp.exists());
        assert!(replace_file(&temp, &dest).is_err());
        assert_eq!(std::fs::read(&dest).unwrap(), b"new");

        std::fs::write(&temp, b"again").unwrap();
        std::fs::remove_file(&dest).unwrap();
        std::fs::create_dir(&dest).unwrap();
        assert!(replace_file(&temp, &dest).is_err());
        assert!(
            !temp.exists(),
            "a failed replace must not leave controller.json.tmp"
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}
