//! Voice never opens a real microphone or calls a provider in headless tests.
mod common;
use common::Studio;
use serde_json::json;

#[test]
fn voice_commands_are_registered_guarded_and_cancelled_by_generation() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let initial = studio.ok("voice_status", json!({}));
    assert_eq!(initial["phase"], "idle");
    assert!(initial["shortcut"].is_null());
    assert!(studio
        .invoke(
            "voice_shortcut",
            json!({"shortcut":"CommandOrControl+Shift+J"})
        )
        .unwrap_err()
        .to_string()
        .contains("headless"));
    studio.ok("controller_save", json!({"document":{"schemaVersion":1,"bindings":[{"action":"voice","press":{"kind":"program","channel":1,"number":12}}]}}));
    assert_eq!(
        studio.ok("controller_config", json!({}))["bindings"][0]["action"],
        "voice"
    );
    assert!(studio.invoke("voice_ptt", json!({"down": false})).is_err());
    studio.ok(
        "keys_set",
        json!({"provider": "elevenlabs", "key": "fixture-only-not-a-real-key"}),
    );
    let refused = studio
        .invoke("voice_ptt", json!({"down": true}))
        .unwrap_err()
        .to_string();
    assert!(refused.contains("Headless tests cannot call"), "{refused}");
    studio.ok("voice_cancel", json!({}));
    let cancelled = studio.ok("voice_status", json!({}));
    assert_eq!(cancelled["generation"], 1);
    studio.ok("voice_cancel", json!({"generation": 0}));
    assert_eq!(studio.ok("voice_status", json!({}))["generation"], 1);
    assert!(studio
        .invoke(
            "voice_speak",
            json!({"text":"Do not speak", "generation":0})
        )
        .is_err());
    assert_eq!(std::env::var_os("JAM_LIVE"), None);
    let mut settings = studio.ok("settings_get", json!({}));
    settings["voice"] =
        json!({"voiceId":"fixture","sttUsdPerHour":0.22,"ttsUsdPer1k":0.05,"futureField":true});
    studio.ok("settings_set", json!({"settings":settings}));
    assert_eq!(
        studio.ok("settings_get", json!({}))["voice"],
        settings["voice"]
    );
    settings["voice"]["ttsUsdPer1k"] = json!(-1);
    studio.ok("settings_set", json!({"settings":settings}));
    let refused = studio
        .invoke("voice_speak", json!({"text":"No request", "generation":1}))
        .unwrap_err()
        .to_string();
    assert!(refused.contains("Speech prices"), "{refused}");
}
