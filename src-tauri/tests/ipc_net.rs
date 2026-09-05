//! The network edge of the desktop app through IPC: API keys on the headless
//! `MemoryStore` (`keys_set` / `keys_has` / `keys_delete`, `providers_list`), the
//! `provider_fetch` proxy refused by `net::live_guard` before a byte can leave, the
//! usage log (`cost_log_list` / `cost_log_totals`) and the local agent bridge
//! (`agent_status` / `agent_request` / `agent_cancel`). Nothing here reaches the
//! network or starts a program: every executable path is one that does not exist,
//! and every test ends by checking that `JAM_LIVE` is still unset.
mod common;

use common::{unique, user_dir, Studio};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Listener, Manager};

/// The second sentence of every `live_guard` refusal.
const GUARD_SUFFIX: &str = "An explicitly authorised live check requires JAM_LIVE=1.";
/// The message for an unsupported provider or blank key.
const KEYS_SET_REFUSED: &str = "Choose a supported provider and enter a non-empty API key.";

/// The harness never sets `JAM_LIVE`; every test re-checks after driving the commands.
fn assert_offline() {
    assert_eq!(
        std::env::var_os("JAM_LIVE"),
        None,
        "JAM_LIVE must stay unset in the IPC tests"
    );
}

fn cost_log_path(studio: &Studio) -> PathBuf {
    studio
        .app()
        .state::<app_lib::AppState>()
        .cost_log
        .path()
        .clone()
}

/// What the app reads back from the usage log on disk: the parseable lines, in
/// file order, in the camelCase shape the WebView receives.
fn entries_on_disk(path: &Path) -> Vec<Value> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    text.lines()
        .filter_map(|line| serde_json::from_str::<app_lib::net::CostEntry>(line).ok())
        .map(|entry| serde_json::to_value(entry).unwrap())
        .collect()
}

/// The whole usage log through IPC (the frontend default is the newest 50).
fn full_log(studio: &Studio) -> Vec<Value> {
    studio
        .ok("cost_log_list", json!({"limit": 1_000_000}))
        .as_array()
        .cloned()
        .unwrap()
}

/// A request exactly as `src/lib/net/providerFetch.ts` sends it.
fn fetch_request(provider: &str, path: &str) -> Value {
    json!({"provider": provider, "path": path, "method": "POST", "headers": {}, "body": null})
}

/// An absolute path that no test process creates, so no agent can be found or run.
fn missing_executable() -> PathBuf {
    let path = user_dir().join(format!("{}.exe", unique("no-such-agent")));
    assert!(!path.exists());
    path
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

#[test]
fn keys_round_trip_on_the_memory_store_and_show_up_in_providers_list() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let state = studio.app().state::<app_lib::AppState>();
    let has_key = |provider: &str| studio.ok("keys_has", json!({"provider": provider}));
    let providers_with_keys = || -> Vec<String> {
        studio
            .ok("providers_list", json!({}))
            .as_array()
            .unwrap()
            .iter()
            .filter(|p| p["hasKey"] == json!(true))
            .map(|p| p["id"].as_str().unwrap().to_string())
            .collect()
    };

    assert_eq!(has_key("elevenlabs"), json!(false));
    assert!(providers_with_keys().is_empty());

    // Stored verbatim: the surrounding spaces survive, nothing is trimmed away.
    let key = format!(" {} ", unique("key"));
    assert_eq!(
        studio.ok("keys_set", json!({"provider": "elevenlabs", "key": key})),
        Value::Null
    );
    assert_eq!(has_key("elevenlabs"), json!(true));
    assert_eq!(
        state.secret_store.get("elevenlabs").as_deref(),
        Some(key.as_str())
    );
    assert_eq!(providers_with_keys(), ["elevenlabs"]);

    // Setting again replaces the key for that provider only.
    let replacement = unique("key");
    studio.ok(
        "keys_set",
        json!({"provider": "elevenlabs", "key": replacement}),
    );
    assert_eq!(
        state.secret_store.get("elevenlabs").as_deref(),
        Some(replacement.as_str())
    );
    assert_eq!(providers_with_keys(), ["elevenlabs"]);

    // Delete, then delete again: gone, and the second delete is not an error.
    assert_eq!(
        studio.ok("keys_delete", json!({"provider": "elevenlabs"})),
        Value::Null
    );
    assert_eq!(has_key("elevenlabs"), json!(false));
    assert_eq!(state.secret_store.get("elevenlabs"), None);
    assert!(providers_with_keys().is_empty());
    assert_eq!(
        studio.ok("keys_delete", json!({"provider": "elevenlabs"})),
        Value::Null
    );
    assert_offline();
}

#[test]
fn keys_set_rejects_unknown_providers_and_blank_or_oversized_keys() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let state = studio.app().state::<app_lib::AppState>();

    // The allow-list is exact (case included) and the key must have visible text.
    for (provider, key) in [
        ("bogus", "k"),
        ("Gemini", "k"),
        ("", "k"),
        ("gemini", ""),
        ("gemini", "   "),
        ("gemini", "\t\n"),
    ] {
        assert_eq!(
            studio.err("keys_set", json!({"provider": provider, "key": key})),
            KEYS_SET_REFUSED,
            "provider {provider:?}, key {key:?}"
        );
    }
    for provider in ["bogus", "Gemini", "", "gemini"] {
        assert!(!state.secret_store.has(provider), "{provider:?} got a key");
        assert_eq!(
            studio.ok("keys_has", json!({"provider": provider})),
            json!(false)
        );
    }

    // 4096 bytes is the longest accepted key; one byte more is refused and stores nothing.
    let longest = "k".repeat(4096);
    assert_eq!(
        studio.ok(
            "keys_set",
            json!({"provider": "openrouter", "key": longest})
        ),
        Value::Null
    );
    assert_eq!(
        state.secret_store.get("openrouter").as_deref(),
        Some(longest.as_str())
    );
    let too_long = "k".repeat(4097);
    assert_eq!(
        studio.err(
            "keys_set",
            json!({"provider": "anthropic", "key": too_long})
        ),
        "API key is too long. The limit is 4096 bytes."
    );
    assert_eq!(
        studio.ok("keys_has", json!({"provider": "anthropic"})),
        json!(false)
    );
    assert_eq!(
        state.secret_store.get("openrouter").as_deref(),
        Some(longest.as_str()),
        "a refused key leaves the other providers alone"
    );

    // Deleting a provider that cannot have a key is a no-op that succeeds.
    assert_eq!(
        studio.ok("keys_delete", json!({"provider": "bogus"})),
        Value::Null
    );

    // Missing or mistyped arguments are refused by the IPC layer, naming the command.
    let err = studio.err("keys_set", json!({"provider": "gemini"}));
    assert!(
        err.contains("keys_set") && err.contains("missing required key key"),
        "{err}"
    );
    let err = studio.err("keys_set", json!({"provider": "gemini", "key": 42}));
    assert!(
        err.contains("keys_set") && err.contains("invalid type"),
        "{err}"
    );
    let err = studio.err("keys_has", json!({}));
    assert!(err.contains("missing required key provider"), "{err}");
    let err = studio.err("keys_delete", json!({}));
    assert!(err.contains("missing required key provider"), "{err}");
    assert!(!state.secret_store.has("gemini"));
    assert_offline();
}

#[test]
fn keys_set_names_the_length_limit_when_the_key_is_too_long() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let saved = unique("existing-key");
    studio.ok("keys_set", json!({"provider": "gemini", "key": saved}));
    let err = studio.err(
        "keys_set",
        json!({"provider": "gemini", "key": "k".repeat(4097)}),
    );
    assert!(
        err.contains("4096") || err.to_ascii_lowercase().contains("too long"),
        "{err}"
    );
    assert_eq!(
        studio
            .app()
            .state::<app_lib::AppState>()
            .secret_store
            .get("gemini"),
        Some(saved)
    );
    assert_offline();
}

#[test]
fn providers_list_mirrors_the_allow_list_and_never_carries_key_material() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let list = studio.ok("providers_list", json!({}));
    let list = list.as_array().unwrap();

    let expected: Vec<(&str, &str)> = app_lib::net::PROVIDERS
        .iter()
        .map(|p| (p.id, p.description))
        .collect();
    let listed: Vec<(&str, &str)> = list
        .iter()
        .map(|p| {
            (
                p["id"].as_str().unwrap(),
                p["description"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(listed, expected);
    let ids: Vec<&str> = listed.iter().map(|(id, _)| *id).collect();
    assert_eq!(
        ids,
        [
            "minimax",
            "runway",
            "gemini",
            "elevenlabs",
            "openai",
            "anthropic",
            "openrouter"
        ]
    );
    for p in list {
        assert_eq!(p["hasKey"], json!(false), "{p}");
        assert!(!p["description"].as_str().unwrap().is_empty(), "{p}");
        assert_eq!(
            p.as_object().unwrap().len(),
            3,
            "id, description, hasKey and nothing else: {p}"
        );
    }

    let secret = unique("key");
    studio.ok("keys_set", json!({"provider": "minimax", "key": secret}));
    let after = studio.ok("providers_list", json!({}));
    assert!(
        !after.to_string().contains(&secret),
        "providers_list must never return a key"
    );
    let flags: Vec<(&str, bool)> = after
        .as_array()
        .unwrap()
        .iter()
        .map(|p| (p["id"].as_str().unwrap(), p["hasKey"].as_bool().unwrap()))
        .collect();
    assert_eq!(
        flags,
        [
            ("minimax", true),
            ("runway", false),
            ("gemini", false),
            ("elevenlabs", false),
            ("openai", false),
            ("anthropic", false),
            ("openrouter", false)
        ]
    );
    assert_offline();
}

#[test]
fn headless_secrets_stay_in_memory_per_studio_and_never_reach_the_disk() {
    let _scenario = common::scenario();
    let first = Studio::boot();
    let second = Studio::boot();
    let secret = unique("key");
    first.ok("keys_set", json!({"provider": "runway", "key": secret}));
    assert_eq!(
        first.ok("keys_has", json!({"provider": "runway"})),
        json!(true)
    );
    assert_eq!(
        second.ok("keys_has", json!({"provider": "runway"})),
        json!(false)
    );
    let runway = second.ok("providers_list", json!({}));
    let runway = runway
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == "runway")
        .unwrap()
        .clone();
    assert_eq!(runway["hasKey"], json!(false));

    // No file under the user folder, and not the usage log either, holds the key.
    let mut pending = vec![user_dir()];
    while let Some(dir) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if let Ok(bytes) = std::fs::read(&path) {
                assert!(
                    !contains_bytes(&bytes, secret.as_bytes()),
                    "{} contains the API key",
                    path.display()
                );
            }
        }
    }
    let log = std::fs::read(cost_log_path(&first)).unwrap_or_default();
    assert!(!contains_bytes(&log, secret.as_bytes()));
    assert_offline();
}

#[test]
fn provider_fetch_is_refused_by_the_live_guard_before_any_byte_leaves() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let path = cost_log_path(&studio);
    let before = entries_on_disk(&path);
    let totals_before = studio.ok("cost_log_totals", json!({}));

    // Settings listens for `cost.state` (":" on the wire) after every provider call.
    let seen: Arc<Mutex<Vec<Value>>> = Arc::default();
    let sink = Arc::clone(&seen);
    studio.app().listen_any("cost:state", move |event| {
        sink.lock()
            .unwrap()
            .push(serde_json::from_str(event.payload()).unwrap());
    });

    studio.ok(
        "keys_set",
        json!({"provider": "gemini", "key": unique("key")}),
    );
    let started = Instant::now();
    let err = studio.err(
        "provider_fetch",
        json!({"request": fetch_request("gemini", "/v1beta/models")}),
    );
    assert!(
        started.elapsed() < Duration::from_secs(3),
        "refused without waiting on a socket, took {:?}",
        started.elapsed()
    );
    assert_eq!(
        err,
        format!("Headless tests cannot call provider \"gemini\". {GUARD_SUFFIX}")
    );
    assert_eq!(
        err,
        app_lib::net::live_guard("provider \"gemini\"").unwrap_err(),
        "the IPC error is the guard's own text"
    );

    // A lower-case GET with a query and no body passes validation and is refused the same way.
    let err = studio.err(
        "provider_fetch",
        json!({"request": {"provider": "gemini", "path": "/v1beta/models?pageSize=1", "method": "get"}}),
    );
    assert!(
        err.starts_with("Headless tests cannot call provider \"gemini\"."),
        "{err}"
    );

    // Nothing was logged, on disk or through IPC, and the totals event still kept Settings in sync.
    assert_eq!(entries_on_disk(&path), before);
    assert_eq!(full_log(&studio).len(), before.len());
    let deadline = Instant::now() + Duration::from_secs(3);
    while seen.lock().unwrap().len() < 2 && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    let events = seen.lock().unwrap().clone();
    assert_eq!(
        events.len(),
        2,
        "one cost:state per provider_fetch: {events:?}"
    );
    assert_eq!(events[0], totals_before);
    assert_eq!(events[1], studio.ok("cost_log_totals", json!({})));
    assert_offline();
}

#[test]
fn provider_fetch_checks_the_allow_list_and_the_key_before_the_live_guard() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let allow_list = "provider \"bogus\" is not on the allow-list";

    // An unknown provider is refused by validation, even when the path is wrong too.
    assert_eq!(
        studio.err(
            "provider_fetch",
            json!({"request": fetch_request("bogus", "/v1/x")})
        ),
        allow_list
    );
    assert_eq!(
        studio.err(
            "provider_fetch",
            json!({"request": fetch_request("bogus", "no-slash")})
        ),
        allow_list
    );
    // ...but the size checks come even before the allow-list.
    let mut oversized = fetch_request("bogus", "/v1/x");
    oversized["body"] = json!("x".repeat(128 * 1024 + 1));
    assert_eq!(
        studio.err("provider_fetch", json!({"request": oversized})),
        "Provider request exceeds the text limit or has invalid cost metadata."
    );

    // A known provider without a key: the key check names the provider and precedes the guard.
    assert_eq!(
        studio.ok("keys_has", json!({"provider": "openai"})),
        json!(false)
    );
    assert_eq!(
        studio.err(
            "provider_fetch",
            json!({"request": fetch_request("openai", "/v1/responses")})
        ),
        "no API key for \"openai\": add it under Settings → API credentials"
    );

    // With a key the guard is the last gate.
    studio.ok(
        "keys_set",
        json!({"provider": "openai", "key": unique("key")}),
    );
    assert_eq!(
        studio.err(
            "provider_fetch",
            json!({"request": fetch_request("openai", "/v1/responses")})
        ),
        format!("Headless tests cannot call provider \"openai\". {GUARD_SUFFIX}")
    );

    // Missing fields are Tauri's error, naming the command and the field.
    let err = studio.err("provider_fetch", json!({"request": {"provider": "openai"}}));
    assert!(
        err.contains("provider_fetch") && err.contains("missing field `path`"),
        "{err}"
    );
    let err = studio.err("provider_fetch", json!({}));
    assert!(err.contains("missing required key request"), "{err}");
    assert_offline();
}

#[test]
fn provider_fetch_validation_through_ipc_rejects_escapes_methods_headers_and_metadata() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok(
        "keys_set",
        json!({"provider": "gemini", "key": unique("key")}),
    );
    let refused = |request: Value| studio.err("provider_fetch", json!({"request": request}));
    // With a key stored, anything that gets past validation ends at the guard.
    let guard = "Headless tests cannot call provider \"gemini\".";
    let limit = "Provider request exceeds the text limit or has invalid cost metadata.";

    for path in [
        "https://evil.example/x",
        "//evil.example/x",
        "v1beta/models",
    ] {
        assert_eq!(
            refused(fetch_request("gemini", path)),
            format!("path must start with a single '/': {path:?}")
        );
    }
    for path in ["/a/../b", "/x@y", "/v1beta\\models"] {
        assert_eq!(
            refused(fetch_request("gemini", path)),
            format!("path may not point outside the provider: {path:?}")
        );
    }
    for path in ["/with space", "/line\nbreak", "/tab\t"] {
        assert_eq!(
            refused(fetch_request("gemini", path)),
            "path contains whitespace or control characters"
        );
    }

    let mut request = fetch_request("gemini", "/v1beta/models");
    request["method"] = json!("TRACE");
    assert_eq!(refused(request.clone()), "method TRACE is not allowed");
    request["method"] = json!("patch");
    assert!(refused(request.clone()).starts_with(guard));

    for header in [
        "Authorization",
        "X-GOOG-API-KEY",
        "xi-api-key",
        "Cookie",
        "host",
    ] {
        request["headers"] = json!({ header: "stolen" });
        assert_eq!(
            refused(request.clone()),
            format!("header \"{header}\" is set by the app, not by the caller")
        );
    }
    request["headers"] = json!({"content-type": "application/json"});
    assert!(refused(request.clone()).starts_with(guard));

    // Boundaries: 128 KiB of body, 160 characters of model and a zero cost pass;
    // one more byte, one more character or a negative cost do not.
    request["headers"] = json!({});
    request["body"] = json!("x".repeat(128 * 1024));
    assert!(refused(request.clone()).starts_with(guard));
    request["body"] = json!("x".repeat(128 * 1024 + 1));
    assert_eq!(refused(request.clone()), limit);
    request["body"] = json!(null);
    request["model"] = json!("m".repeat(160));
    assert!(refused(request.clone()).starts_with(guard));
    request["model"] = json!("m".repeat(161));
    assert_eq!(refused(request.clone()), limit);
    request["model"] = json!("gpt\u{7}");
    assert_eq!(refused(request.clone()), limit);
    request["model"] = json!("gemini-2.5-flash");
    request["estimatedCostUsd"] = json!(0.0);
    assert!(refused(request.clone()).starts_with(guard));
    request["estimatedCostUsd"] = json!(-0.01);
    assert_eq!(refused(request.clone()), limit);

    // A wrong type never reaches validation: Tauri names the command.
    request["estimatedCostUsd"] = json!("free");
    let err = refused(request);
    assert!(
        err.contains("provider_fetch") && err.contains("invalid type"),
        "{err}"
    );
    assert_offline();
}

#[test]
fn cost_log_list_and_totals_mirror_the_usage_log_on_disk_and_honour_the_limit() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let path = cost_log_path(&studio);
    let on_disk = entries_on_disk(&path);

    let all = full_log(&studio);
    assert_eq!(
        all,
        on_disk,
        "cost_log_list returns exactly the parseable lines of {}",
        path.display()
    );
    if !path.exists() {
        assert!(all.is_empty(), "no file, no entries");
    }
    if let Some(entry) = all.first() {
        let mut keys: Vec<&str> = entry
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "atMs",
                "bytesIn",
                "bytesOut",
                "durationMs",
                "error",
                "estimatedCostUsd",
                "method",
                "model",
                "path",
                "provider",
                "status"
            ]
        );
    }

    // No limit (or a null one) means the newest 50; the limit counts from the end.
    let newest_50 = on_disk[on_disk.len().saturating_sub(50)..].to_vec();
    assert_eq!(
        studio.ok("cost_log_list", json!({})).as_array().unwrap(),
        &newest_50
    );
    assert_eq!(
        studio
            .ok("cost_log_list", json!({"limit": null}))
            .as_array()
            .unwrap(),
        &newest_50
    );
    assert_eq!(studio.ok("cost_log_list", json!({"limit": 0})), json!([]));
    let newest = studio.ok("cost_log_list", json!({"limit": 1}));
    assert_eq!(newest.as_array().unwrap().len(), on_disk.len().min(1));
    assert_eq!(newest.as_array().unwrap().last(), on_disk.last());

    // Totals: one row per provider, sorted by provider, counting every entry.
    let totals = studio.ok("cost_log_totals", json!({}));
    let totals = totals.as_array().unwrap();
    let mut providers: Vec<&str> = on_disk
        .iter()
        .map(|e| e["provider"].as_str().unwrap())
        .collect();
    providers.sort_unstable();
    providers.dedup();
    let listed: Vec<&str> = totals
        .iter()
        .map(|t| t["provider"].as_str().unwrap())
        .collect();
    assert_eq!(listed, providers);
    if on_disk.is_empty() {
        assert!(totals.is_empty(), "no entries, no totals");
    }
    for total in totals {
        let mine: Vec<&Value> = on_disk
            .iter()
            .filter(|e| e["provider"] == total["provider"])
            .collect();
        let sum = |field: &str| mine.iter().map(|e| e[field].as_u64().unwrap()).sum::<u64>();
        let failures = mine
            .iter()
            .filter(|e| {
                let status = e["status"].as_u64().unwrap();
                !(200..300).contains(&status) || !e["error"].is_null()
            })
            .count() as u64;
        assert_eq!(
            total["calls"].as_u64().unwrap(),
            mine.len() as u64,
            "{total}"
        );
        assert_eq!(total["failures"].as_u64().unwrap(), failures, "{total}");
        assert_eq!(
            total["bytesIn"].as_u64().unwrap(),
            sum("bytesIn"),
            "{total}"
        );
        assert_eq!(
            total["bytesOut"].as_u64().unwrap(),
            sum("bytesOut"),
            "{total}"
        );
        assert_eq!(total.as_object().unwrap().len(), 5, "{total}");
    }

    // The limit is a count: negative or non-numeric values are refused by the IPC layer.
    let err = studio.err("cost_log_list", json!({"limit": -1}));
    assert!(
        err.contains("cost_log_list") && err.contains("limit"),
        "{err}"
    );
    let err = studio.err("cost_log_list", json!({"limit": "ten"}));
    assert!(err.contains("invalid type"), "{err}");
    assert_offline();
}

#[test]
#[ignore = "app bug: the headless cost log is one fixed file in the OS temp folder shared by every process, not under JAM_USER_DIR"]
fn cost_log_lives_under_the_user_root_and_starts_empty() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let path = cost_log_path(&studio);
    assert!(
        path.starts_with(user_dir()),
        "{} is not under {}",
        path.display(),
        user_dir().display()
    );
    assert_eq!(studio.ok("cost_log_list", json!({})), json!([]));
    assert_eq!(studio.ok("cost_log_totals", json!({})), json!([]));
    assert_offline();
}

#[test]
fn agent_status_reports_unknown_and_missing_agents_without_launching_anything() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let status = |provider: &str, executable: &str| {
        studio.ok(
            "agent_status",
            json!({"provider": provider, "executable": executable}),
        )
    };
    let not_a_file = json!({
        "installed": false,
        "message": "Choose the full path to the installed agent executable."
    });

    // The provider is checked first, so an unknown one never searches PATH.
    assert_eq!(
        status("bogus", ""),
        json!({"installed": false, "message": "Unknown local agent."})
    );
    assert_eq!(
        status("claude", ""),
        json!({"installed": false, "message": "Unknown local agent."}),
        "the provider id is claude-code, not the executable name"
    );

    // An explicit path must be absolute and an existing file; a missing one, a bare
    // name and a folder are all refused before anything could be started.
    let missing = missing_executable();
    for provider in ["codex", "claude-code"] {
        assert_eq!(
            status(provider, &missing.to_string_lossy()),
            not_a_file,
            "{provider}"
        );
    }
    assert_eq!(status("codex", "codex"), not_a_file);
    assert_eq!(
        status("claude-code", &user_dir().to_string_lossy()),
        not_a_file
    );
    assert!(!missing.exists(), "detection created nothing");

    // Both arguments are required, as AiSettings sends them.
    let err = studio.err("agent_status", json!({"provider": "codex"}));
    assert!(
        err.contains("agent_status") && err.contains("missing required key executable"),
        "{err}"
    );
    let err = studio.err("agent_status", json!({"executable": ""}));
    assert!(err.contains("missing required key provider"), "{err}");
    assert_offline();
}

#[test]
fn agent_request_is_refused_offline_before_looking_for_an_agent_and_logs_nothing() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let path = cost_log_path(&studio);
    let before = entries_on_disk(&path);
    let guard = format!("Headless tests cannot call a signed-in agent. {GUARD_SUFFIX}");
    let missing = missing_executable();
    let request = |provider: &str| {
        json!({"request": {
            "provider": provider,
            "prompt": "must not be sent",
            "model": "default",
            "executable": missing.to_string_lossy(),
        }})
    };

    assert_eq!(studio.err("agent_request", request("codex")), guard);
    assert_eq!(studio.err("agent_request", request("claude-code")), guard);
    assert_eq!(
        studio.err("agent_request", request("bogus")),
        guard,
        "the guard comes before the provider check"
    );
    assert_eq!(
        studio.err(
            "agent_request",
            json!({"request": {"provider": "codex", "prompt": "x", "model": ""}})
        ),
        guard,
        "the guard comes before the model check and the executable lookup"
    );
    // A refusal releases the runner: the next request is refused for the same reason,
    // not as "already working".
    assert_eq!(studio.err("agent_request", request("codex")), guard);

    let err = studio.err(
        "agent_request",
        json!({"request": {"provider": "codex", "prompt": "x"}}),
    );
    assert!(
        err.contains("agent_request") && err.contains("missing field `model`"),
        "{err}"
    );
    let err = studio.err("agent_request", json!({}));
    assert!(err.contains("missing required key request"), "{err}");

    assert_eq!(
        entries_on_disk(&path),
        before,
        "a refused request is not logged"
    );
    assert_eq!(full_log(&studio).len(), before.len());
    assert!(!missing.exists());
    assert_offline();
}

#[test]
fn agent_cancel_is_a_harmless_no_op_without_a_running_agent() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    assert_eq!(studio.ok("agent_cancel", json!({})), Value::Null);
    assert_eq!(studio.ok("agent_cancel", json!({})), Value::Null);
    assert_eq!(
        studio.ok("agent_cancel", json!({"reason": "ignored"})),
        Value::Null
    );

    // The commands around it are unchanged by a pending cancel.
    let missing = missing_executable();
    assert_eq!(
        studio.ok(
            "agent_status",
            json!({"provider": "codex", "executable": missing.to_string_lossy()})
        ),
        json!({
            "installed": false,
            "message": "Choose the full path to the installed agent executable."
        })
    );
    assert_eq!(
        studio.err(
            "agent_request",
            json!({"request": {
                "provider": "codex",
                "prompt": "x",
                "model": "default",
                "executable": missing.to_string_lossy(),
            }})
        ),
        format!("Headless tests cannot call a signed-in agent. {GUARD_SUFFIX}")
    );
    assert_eq!(studio.ok("agent_cancel", json!({})), Value::Null);
    assert_eq!(
        studio
            .ok("providers_list", json!({}))
            .as_array()
            .unwrap()
            .len(),
        7
    );
    assert_offline();
}
