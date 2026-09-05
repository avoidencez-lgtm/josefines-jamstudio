//! net: the only road from the WebView to an AI provider. TypeScript hands over a
//! provider *name*, a path and a body; Rust checks the provider against an
//! allow-list, injects the key from the keychain, performs the request and writes
//! one line to a local usage log (provider, path, status, bytes, duration; never a
//! body, never a key).

use crate::keys::SecretStore;
pub mod media;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthScheme {
    /// The key goes in this header verbatim.
    HeaderKey(&'static str),
    /// `Authorization: Bearer <key>`.
    Bearer,
}

#[derive(Debug, Clone, Copy)]
pub struct ProviderEntry {
    pub id: &'static str,
    pub base_url: &'static str,
    pub auth: AuthScheme,
    pub description: &'static str,
}

/// Hosts the app is allowed to talk to. Adding a provider is one line here plus a
/// key in Settings; nothing else in the app can reach the network.
pub const PROVIDERS: &[ProviderEntry] = &[
    ProviderEntry {
        id: "minimax",
        base_url: "https://api.minimax.io",
        auth: AuthScheme::Bearer,
        description: "MiniMax Music (existing paid API accounts only)",
    },
    ProviderEntry {
        id: "runway",
        base_url: "https://api.dev.runwayml.com",
        auth: AuthScheme::Bearer,
        description: "Runway (Gen-4.5 and Veo music-video shots)",
    },
    ProviderEntry {
        id: "gemini",
        base_url: "https://generativelanguage.googleapis.com",
        auth: AuthScheme::HeaderKey("x-goog-api-key"),
        description: "Google Gemini (Jo's brain, Lyria RealTime)",
    },
    ProviderEntry {
        id: "elevenlabs",
        base_url: "https://api.elevenlabs.io",
        auth: AuthScheme::HeaderKey("xi-api-key"),
        description: "ElevenLabs (Jo's voice, speech to text)",
    },
    ProviderEntry {
        id: "openai",
        base_url: "https://api.openai.com",
        auth: AuthScheme::Bearer,
        description: "OpenAI (alternative LLM)",
    },
    ProviderEntry {
        id: "anthropic",
        base_url: "https://api.anthropic.com",
        auth: AuthScheme::HeaderKey("x-api-key"),
        description: "Anthropic Claude (alternative LLM)",
    },
    ProviderEntry {
        id: "openrouter",
        base_url: "https://openrouter.ai",
        auth: AuthScheme::Bearer,
        description: "OpenRouter (choose a text model for Jo and Song Lab)",
    },
];

pub fn provider(id: &str) -> Option<&'static ProviderEntry> {
    PROVIDERS.iter().find(|p| p.id == id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub description: String,
    pub has_key: bool,
}

pub fn providers_info(store: &dyn SecretStore) -> Vec<ProviderInfo> {
    PROVIDERS
        .iter()
        .map(|p| ProviderInfo {
            id: p.id.to_string(),
            description: p.description.to_string(),
            has_key: store.has(p.id),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    pub provider: String,
    /// Path and query relative to the provider base URL, starting with `/`.
    pub path: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub estimated_cost_usd: Option<f64>,
}

fn default_method() -> String {
    "POST".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

/// Headers the WebView may not set: authentication is Rust's job.
const RESERVED_HEADERS: &[&str] = &[
    "authorization",
    "x-goog-api-key",
    "xi-api-key",
    "x-api-key",
    "cookie",
    "host",
];

/// Everything that can be checked without touching the network. Returns the
/// provider and the full URL.
pub fn validate(req: &FetchRequest) -> Result<(&'static ProviderEntry, String), String> {
    if req.body.as_ref().is_some_and(|b| b.len() > 128 * 1024)
        || req
            .model
            .as_ref()
            .is_some_and(|m| m.len() > 160 || m.chars().any(|c| c.is_control()))
        || req
            .estimated_cost_usd
            .is_some_and(|v| !v.is_finite() || v < 0.0)
    {
        return Err("Provider request exceeds the text limit or has invalid cost metadata.".into());
    }
    let entry = provider(&req.provider)
        .ok_or_else(|| format!("provider \"{}\" is not on the allow-list", req.provider))?;
    let path = req.path.as_str();
    if !path.starts_with('/') || path.starts_with("//") {
        return Err(format!("path must start with a single '/': {path:?}"));
    }
    if path.contains("://") || path.contains('@') || path.contains("..") || path.contains('\\') {
        return Err(format!("path may not point outside the provider: {path:?}"));
    }
    if path.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("path contains whitespace or control characters".into());
    }
    match req.method.to_ascii_uppercase().as_str() {
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" => {}
        m => return Err(format!("method {m} is not allowed")),
    }
    for k in req.headers.keys() {
        if RESERVED_HEADERS.contains(&k.to_ascii_lowercase().as_str()) {
            return Err(format!(
                "header \"{k}\" is set by the app, not by the caller"
            ));
        }
    }
    Ok((entry, format!("{}{}", entry.base_url, path)))
}

/// One line of the usage log. Estimated cost is left to the UI (it knows the model);
/// the log records what is measurable.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CostEntry {
    /// Unix time in milliseconds.
    pub at_ms: u64,
    pub provider: String,
    pub method: String,
    /// Path without the query string.
    pub path: String,
    pub status: u16,
    pub duration_ms: u64,
    pub bytes_out: u64,
    pub bytes_in: u64,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub estimated_cost_usd: Option<f64>,
}

pub struct CostLog {
    path: PathBuf,
}

impl CostLog {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn default_path() -> PathBuf {
        crate::library::Library::default_user_root().join("usage-log.jsonl")
    }

    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    pub fn append(&self, entry: &CostEntry) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
        }
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .map_err(|e| format!("{}: {e}", self.path.display()))?;
        let line = serde_json::to_string(entry).map_err(|e| e.to_string())?;
        writeln!(f, "{line}").map_err(|e| e.to_string())
    }

    /// Newest last. Lines that do not parse are skipped (a half-written line after
    /// a crash must not hide the rest).
    pub fn list(&self, limit: usize) -> Vec<CostEntry> {
        let Ok(f) = std::fs::File::open(&self.path) else {
            return Vec::new();
        };
        let entries: Vec<CostEntry> = std::io::BufReader::new(f)
            .lines()
            .map_while(Result::ok)
            .filter_map(|l| serde_json::from_str(&l).ok())
            .collect();
        let skip = entries.len().saturating_sub(limit);
        entries.into_iter().skip(skip).collect()
    }

    /// Totals per provider for the summary line in Settings.
    pub fn totals(&self) -> Vec<CostTotal> {
        let mut by: HashMap<String, CostTotal> = HashMap::new();
        for e in self.list(usize::MAX) {
            let t = by.entry(e.provider.clone()).or_insert_with(|| CostTotal {
                provider: e.provider.clone(),
                ..CostTotal::default()
            });
            t.calls += 1;
            t.bytes_in += e.bytes_in;
            t.bytes_out += e.bytes_out;
            if !(200..300).contains(&e.status) || e.error.is_some() {
                t.failures += 1;
            }
        }
        let mut v: Vec<CostTotal> = by.into_values().collect();
        v.sort_by(|a, b| a.provider.cmp(&b.provider));
        v
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CostTotal {
    pub provider: String,
    pub calls: u64,
    pub failures: u64,
    pub bytes_in: u64,
    pub bytes_out: u64,
}

fn strip_query(path: &str) -> String {
    path.split('?').next().unwrap_or(path).to_string()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn provider_client() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(90))
        .user_agent("josefines-jamstudio/0.1")
}

/// Automated and headless runs never bill an account: unit tests (`cfg!(test)`) and
/// anything started with `JAM_HEADLESS=1` (CI, the smoke harness, `tauri dev` per
/// AGENTS.md) are refused before a byte leaves the app. `JAM_LIVE=1` is the explicit
/// opt-in for a manually authorised live check (docs/plan/02-working-method.md).
pub fn live_guard(target: &str) -> Result<(), String> {
    let headless = cfg!(test) || std::env::var("JAM_HEADLESS").as_deref() == Ok("1");
    if headless && std::env::var("JAM_LIVE").as_deref() != Ok("1") {
        return Err(format!(
            "Headless tests cannot call {target}. An explicitly authorised live check requires JAM_LIVE=1."
        ));
    }
    Ok(())
}

/// Performs the request. The key never leaves this function.
pub async fn provider_fetch(
    req: FetchRequest,
    store: &dyn SecretStore,
    log: &CostLog,
) -> Result<FetchResponse, String> {
    let (entry, url) = validate(&req)?;
    let key = store.require(entry.id)?;
    live_guard(&format!("provider \"{}\"", entry.id))?;

    let client = provider_client().build().map_err(|e| e.to_string())?;
    let method = reqwest::Method::from_bytes(req.method.to_ascii_uppercase().as_bytes())
        .map_err(|e| e.to_string())?;
    let mut builder = client.request(method, &url);
    for (k, v) in &req.headers {
        builder = builder.header(k, v);
    }
    builder = match entry.auth {
        AuthScheme::HeaderKey(h) => builder.header(h, key),
        AuthScheme::Bearer => builder.bearer_auth(key),
    };
    let bytes_out = req.body.as_ref().map(|b| b.len() as u64).unwrap_or(0);
    if let Some(body) = req.body {
        if !req
            .headers
            .keys()
            .any(|k| k.eq_ignore_ascii_case("content-type"))
        {
            builder = builder.header("content-type", "application/json");
        }
        builder = builder.body(body);
    }

    let started = Instant::now();
    let mut cost = CostEntry {
        at_ms: now_ms(),
        provider: entry.id.to_string(),
        method: req.method.to_ascii_uppercase(),
        path: strip_query(&req.path),
        status: 0,
        duration_ms: 0,
        bytes_out,
        bytes_in: 0,
        error: None,
        model: req.model,
        estimated_cost_usd: req.estimated_cost_usd,
    };

    let result = async {
        let mut resp = builder
            .send()
            .await
            .map_err(|e| format!("{}: {e}", entry.id))?;
        let status = resp.status().as_u16();
        let headers: HashMap<String, String> = resp
            .headers()
            .iter()
            .filter(|(k, _)| !k.as_str().eq_ignore_ascii_case("set-cookie"))
            .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
            .collect();
        let mut bytes = Vec::new();
        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| format!("{}: {e}", entry.id))?
        {
            if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                return Err("Provider response exceeds the 2 MB text limit.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let body =
            String::from_utf8(bytes).map_err(|_| "Provider returned non-text data.".to_string())?;
        Ok::<FetchResponse, String>(FetchResponse {
            status,
            headers,
            body,
        })
    }
    .await;

    cost.duration_ms = started.elapsed().as_millis() as u64;
    match &result {
        Ok(r) => {
            cost.status = r.status;
            cost.bytes_in = r.body.len() as u64;
        }
        Err(e) => cost.error = Some(e.clone()),
    }
    if let Err(e) = log.append(&cost) {
        tracing::warn!("usage log: {e}");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::{FailingStore, MemoryStore};

    fn req(provider: &str, path: &str) -> FetchRequest {
        FetchRequest {
            provider: provider.into(),
            path: path.into(),
            method: "POST".into(),
            headers: HashMap::new(),
            body: Some("{}".into()),
            model: None,
            estimated_cost_usd: None,
        }
    }

    #[test]
    fn only_allow_listed_providers_and_relative_paths() {
        let (router, url) = validate(&req("openrouter", "/api/v1/chat/completions")).unwrap();
        assert_eq!(router.auth, AuthScheme::Bearer);
        assert_eq!(url, "https://openrouter.ai/api/v1/chat/completions");
        let mut oversized = req("openai", "/v1/responses");
        oversized.body = Some("x".repeat(128 * 1024 + 1));
        assert!(validate(&oversized).is_err());
        assert!(validate(&req("gemini", "/v1beta/models")).is_ok());
        let (_, url) = validate(&req("gemini", "/v1beta/models?x=1")).unwrap();
        assert_eq!(
            url,
            "https://generativelanguage.googleapis.com/v1beta/models?x=1"
        );

        assert!(validate(&req("evil", "/x"))
            .unwrap_err()
            .contains("allow-list"));
        assert!(validate(&req("gemini", "https://evil.example/x")).is_err());
        assert!(validate(&req("gemini", "//evil.example/x")).is_err());
        assert!(validate(&req("gemini", "/a/../b")).is_err());
        assert!(validate(&req("gemini", "/x@y")).is_err());
        assert!(validate(&req("gemini", "/with space")).is_err());
        let mut r = req("gemini", "/x");
        r.method = "TRACE".into();
        assert!(validate(&r).is_err());
    }

    #[test]
    fn callers_cannot_inject_auth_headers() {
        let mut r = req("openai", "/v1/chat/completions");
        r.headers
            .insert("Authorization".into(), "Bearer stolen".into());
        assert!(validate(&r).unwrap_err().contains("Authorization"));
        let mut r = req("gemini", "/v1beta/x");
        r.headers.insert("X-GOOG-API-KEY".into(), "k".into());
        assert!(validate(&r).is_err());
        let mut r = req("gemini", "/v1beta/x");
        r.headers
            .insert("content-type".into(), "application/json".into());
        assert!(validate(&r).is_ok());
    }

    #[tokio::test]
    async fn provider_client_never_follows_a_redirect_with_credentials() {
        use std::io::Read;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = [0; 4096];
            let _ = stream.read(&mut request).unwrap();
            write!(stream, "HTTP/1.1 302 Found\r\nLocation: http://{address}/other\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        let response = provider_client()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap()
            .get(format!("http://{address}/test"))
            .header("x-api-key", "test-only")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::FOUND);
        server.join().unwrap();
    }

    #[tokio::test]
    async fn missing_key_fails_before_any_network() {
        let store = MemoryStore::default();
        let dir = std::env::temp_dir().join(format!("jam-net-{}", std::process::id()));
        let log = CostLog::new(dir.join("usage.jsonl"));
        let err = provider_fetch(req("gemini", "/v1beta/models"), &store, &log)
            .await
            .unwrap_err();
        assert!(err.contains("no API key"), "{err}");
        assert!(
            log.list(10).is_empty(),
            "nothing is logged when nothing was sent"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn keychain_failure_is_not_reported_as_missing_key() {
        let store = FailingStore {
            get_error: Some("keychain unavailable: locked".into()),
            delete_error: None,
        };
        let dir = std::env::temp_dir().join(format!("jam-net-keychain-{}", std::process::id()));
        let log = CostLog::new(dir.join("usage.jsonl"));
        let err = provider_fetch(req("gemini", "/v1beta/models"), &store, &log)
            .await
            .unwrap_err();
        assert!(err.contains("keychain unavailable"), "{err}");
        assert!(!err.contains("no API key"), "{err}");
        assert!(
            log.list(10).is_empty(),
            "nothing is logged when the keychain cannot be read"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A saved key on a test or headless machine must not be billed (issue #59).
    #[tokio::test]
    async fn headless_runs_never_send_a_keyed_request() {
        if std::env::var("JAM_LIVE").as_deref() == Ok("1") {
            return;
        }
        let store = MemoryStore::default();
        store.set("gemini", "test-only-key").unwrap();
        let dir = std::env::temp_dir().join(format!("jam-net-guard-{}", std::process::id()));
        let log = CostLog::new(dir.join("usage.jsonl"));
        let err = provider_fetch(req("gemini", "/v1beta/models"), &store, &log)
            .await
            .unwrap_err();
        assert!(err.contains("Headless tests cannot call"), "{err}");
        assert!(log.list(10).is_empty(), "the refused request is not logged");
        assert!(live_guard("x").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cost_log_round_trips_and_strips_queries() {
        let dir = std::env::temp_dir().join(format!("jam-costlog-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let log = CostLog::new(dir.join("usage.jsonl"));
        for i in 0..5u16 {
            log.append(&CostEntry {
                at_ms: 1000 + u64::from(i),
                provider: if i % 2 == 0 { "gemini" } else { "elevenlabs" }.into(),
                method: "POST".into(),
                path: strip_query("/v1/x?key=SECRET"),
                status: if i == 4 { 500 } else { 200 },
                duration_ms: 10,
                bytes_out: 100,
                bytes_in: 200,
                error: None,
                model: Some("test-model".into()),
                estimated_cost_usd: Some(0.01),
            })
            .unwrap();
        }
        // A torn line must not break reading.
        std::fs::OpenOptions::new()
            .append(true)
            .open(log.path())
            .unwrap()
            .write_all(b"{ torn")
            .unwrap();

        let last2 = log.list(2);
        assert_eq!(last2.len(), 2);
        assert_eq!(last2[1].at_ms, 1004);
        assert_eq!(last2[1].path, "/v1/x");
        assert_eq!(last2[1].model.as_deref(), Some("test-model"));
        assert_eq!(last2[1].estimated_cost_usd, Some(0.01));
        assert!(!std::fs::read_to_string(log.path())
            .unwrap()
            .contains("SECRET"));

        let totals = log.totals();
        assert_eq!(totals.len(), 2);
        let g = totals.iter().find(|t| t.provider == "gemini").unwrap();
        assert_eq!(g.calls, 3);
        assert_eq!(g.failures, 1);
        assert_eq!(g.bytes_in, 600);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
