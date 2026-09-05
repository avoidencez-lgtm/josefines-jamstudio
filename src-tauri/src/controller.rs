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
        .map(|name| jam_rig::controller::ControllerInput::open(&name))
        .transpose()?;
    *state.controller.lock() = connection;
    Ok(())
}
fn validate(doc: &Value) -> Result<(), String> {
    let bindings = doc["bindings"].as_array().ok_or("Missing pedal bindings")?;
    if doc["schemaVersion"] != 1 || bindings.len() > 16 || doc.to_string().len() > 32_000 {
        return Err("Invalid pedal configuration".into());
    }
    let mut seen = std::collections::BTreeSet::new();
    for b in bindings {
        let action = b["action"].as_str().unwrap_or("");
        let p: jam_rig::controller::PedalPress =
            serde_json::from_value(b["press"].clone()).map_err(|e| e.to_string())?;
        if !["keep", "record", "play", "loop", "next", "version"].contains(&action)
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
#[tauri::command]
pub fn controller_save(document: Value) -> Result<(), String> {
    validate(&document)?;
    let root = Library::default_user_root();
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let temp = root.join("controller.json.tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(&document).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temp, root.join("controller.json")).map_err(|e| e.to_string())
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
        let b = json!({"action":"keep","press":{"kind":"program","channel":1,"number":12}});
        assert!(validate(&json!({"schemaVersion":1,"bindings":[b.clone()]})).is_ok());
        assert!(validate(&json!({"schemaVersion":1,"bindings":[b.clone(),b]})).is_err());
        assert!(validate(&json!({"schemaVersion":1,"bindings":[{"action":"delete","press":{"kind":"cc","channel":1,"number":12}}]})).is_err());
    }
}
