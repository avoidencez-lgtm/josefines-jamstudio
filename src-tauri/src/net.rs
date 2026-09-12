//! net: the only road from the WebView to an AI provider. TypeScript hands over a
//! provider *name*, a path and a body; Rust checks the provider against an
//! allow-list, injects the key from the keychain, performs the request and writes
//! one line to a local usage log (provider, path, status, bytes, duration and
//! optional token/speech units; never a body, never a key).

use crate::keys::SecretStore;
pub mod lyria;
pub mod media;
pub mod musicai;
pub mod review;
pub mod voice;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
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
        id: "musicai",
        base_url: "https://api.music.ai",
        auth: AuthScheme::HeaderKey("Authorization"),
        description: "Music.ai (beats, chords, key, sections)",
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_error: Option<String>,
}

pub fn providers_info(store: &dyn SecretStore) -> Vec<ProviderInfo> {
    PROVIDERS
        .iter()
        .map(|p| {
            let status = store.has(p.id);
            ProviderInfo {
                id: p.id.to_string(),
                description: p.description.to_string(),
                has_key: status.as_ref().copied().unwrap_or(false),
                key_error: status.err(),
            }
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
        .ok_or_else(|| format!("Provider \"{}\" is not on the allow-list.", req.provider))?;
    let path = req.path.as_str();
    if !path.starts_with('/') || path.starts_with("//") {
        return Err(format!(
            "The path must start with a single '/'. Got {path:?}."
        ));
    }
    if path.contains("://") || path.contains('@') || path.contains("..") || path.contains('\\') {
        return Err(format!(
            "The path may not point outside the provider. Got {path:?}."
        ));
    }
    if path.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("The path contains whitespace or control characters.".into());
    }
    match req.method.to_ascii_uppercase().as_str() {
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" => {}
        m => return Err(format!("Method {m} is not allowed.")),
    }
    for k in req.headers.keys() {
        if RESERVED_HEADERS.contains(&k.to_ascii_lowercase().as_str()) {
            return Err(format!(
                "Header \"{k}\" is set by the app, not by the caller."
            ));
        }
    }
    Ok((entry, format!("{}{}", entry.base_url, path)))
}

/// One line of measured usage and the request's optional cost estimate.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
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
    /// Submitted units, including failed/uncertain requests; not billed usage.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stt_seconds: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tts_characters: Option<u64>,
    /// Provider-reported LLM tokens. Absent on speech/media and older log lines.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completion_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u64>,
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
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create {}. {e}", parent.display()))?;
        }
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .map_err(|e| format!("Cannot write {}. {e}", self.path.display()))?;
        let line = serde_json::to_string(entry).map_err(|e| e.to_string())?;
        writeln!(f, "{line}").map_err(|e| e.to_string())
    }

    /// Newest last. Invalid UTF-8 and unparseable lines are skipped so a torn
    /// or binary line cannot hide later entries. Only the last `limit` valid
    /// rows are kept, so Settings does not buffer the whole log.
    pub fn list(&self, limit: usize) -> Vec<CostEntry> {
        if limit == 0 {
            return Vec::new();
        }
        let Ok(f) = std::fs::File::open(&self.path) else {
            return Vec::new();
        };
        let mut reader = std::io::BufReader::new(f);
        let mut buf = Vec::new();
        let mut entries: VecDeque<CostEntry> = VecDeque::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    if buf.last() == Some(&b'\n') {
                        buf.pop();
                    }
                    if buf.last() == Some(&b'\r') {
                        buf.pop();
                    }
                    if buf.is_empty() {
                        continue;
                    }
                    let Ok(line) = std::str::from_utf8(&buf) else {
                        continue;
                    };
                    let Ok(entry) = serde_json::from_str(line) else {
                        continue;
                    };
                    if entries.len() == limit {
                        entries.pop_front();
                    }
                    entries.push_back(entry);
                }
                Err(_) => break,
            }
        }
        entries.into_iter().collect()
    }

    const TOTALS_TAIL: usize = 10_000;

    /// Totals per provider for the summary line in Settings.
    pub fn totals(&self) -> Vec<CostTotal> {
        let mut by: HashMap<String, CostTotal> = HashMap::new();
        for e in self.list(Self::TOTALS_TAIL) {
            let t = by.entry(e.provider.clone()).or_insert_with(|| CostTotal {
                provider: e.provider.clone(),
                ..CostTotal::default()
            });
            t.calls += 1;
            t.bytes_in += e.bytes_in;
            t.bytes_out += e.bytes_out;
            t.stt_seconds += e.stt_seconds.unwrap_or(0.0);
            t.tts_characters += e.tts_characters.unwrap_or(0);
            t.prompt_tokens += e.prompt_tokens.unwrap_or(0);
            t.completion_tokens += e.completion_tokens.unwrap_or(0);
            t.total_tokens += e.total_tokens.unwrap_or(0);
            if let Some(cost) = e.estimated_cost_usd.filter(|v| v.is_finite() && *v >= 0.0) {
                *t.estimated_cost_usd.get_or_insert(0.0) += cost;
            } else {
                t.unpriced_calls += 1;
            }
            if !(200..300).contains(&e.status) || e.error.is_some() {
                t.failures += 1;
            }
        }
        let mut v: Vec<CostTotal> = by.into_values().collect();
        v.sort_by(|a, b| a.provider.cmp(&b.provider));
        v
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CostTotal {
    pub provider: String,
    pub calls: u64,
    pub failures: u64,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub stt_seconds: f64,
    pub tts_characters: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub estimated_cost_usd: Option<f64>,
    pub unpriced_calls: u64,
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
    provider_fetch_notifying(req, store, log, |_| {}).await
}

/// Same as [`provider_fetch`], and tells the desktop command when the usage
/// log could not be written so it can emit `app:error`.
pub async fn provider_fetch_notifying(
    req: FetchRequest,
    store: &dyn SecretStore,
    log: &CostLog,
    on_log_error: impl FnOnce(&str),
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
        ..CostEntry::default()
    };

    let result = async {
        let mut resp = builder
            .send()
            .await
            .map_err(|e| format!("The {} request failed. {e}", entry.id))?;
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
            .map_err(|e| format!("The {} request failed. {e}", entry.id))?
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
            let tokens = llm_tokens(&r.body);
            cost.prompt_tokens = tokens.prompt;
            cost.completion_tokens = tokens.completion;
            cost.total_tokens = tokens.total;
        }
        Err(e) => cost.error = Some(e.clone()),
    }
    persist_cost(log, &cost, on_log_error);
    result
}

#[derive(Default)]
struct LlmTokens {
    prompt: Option<u64>,
    completion: Option<u64>,
    total: Option<u64>,
}

/// Reads provider-reported token counts. The body is not stored.
fn llm_tokens(body: &str) -> LlmTokens {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return LlmTokens::default();
    };
    if let Some(usage) = value.get("usageMetadata") {
        return LlmTokens {
            prompt: usage.get("promptTokenCount").and_then(|v| v.as_u64()),
            completion: usage.get("candidatesTokenCount").and_then(|v| v.as_u64()),
            total: usage.get("totalTokenCount").and_then(|v| v.as_u64()),
        };
    }
    let Some(usage) = value.get("usage") else {
        return LlmTokens::default();
    };
    let prompt = usage
        .get("prompt_tokens")
        .or_else(|| usage.get("input_tokens"))
        .and_then(|v| v.as_u64());
    let completion = usage
        .get("completion_tokens")
        .or_else(|| usage.get("output_tokens"))
        .and_then(|v| v.as_u64());
    let total = usage
        .get("total_tokens")
        .and_then(|v| v.as_u64())
        .or_else(|| match (prompt, completion) {
            (Some(p), Some(c)) => Some(p.saturating_add(c)),
            _ => None,
        });
    LlmTokens {
        prompt,
        completion,
        total,
    }
}

fn persist_cost(log: &CostLog, cost: &CostEntry, on_log_error: impl FnOnce(&str)) {
    if let Err(e) = log.append(cost) {
        tracing::warn!("usage log: {e}");
        on_log_error(&e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::{FailingStore, MemoryStore};
    use std::io::Write;

    #[test]
    fn speech_units_include_uncertain_requests_and_old_logs_stay_readable() {
        let dir = std::env::temp_dir().join(format!("jam-speech-cost-{}", std::process::id()));
        let log = CostLog::new(dir.join("usage.jsonl"));
        let old = r#"{"atMs":1,"provider":"elevenlabs","method":"POST","path":"/old","status":200,"durationMs":1,"bytesOut":1,"bytesIn":2}"#;
        let old: CostEntry = serde_json::from_str(old).unwrap();
        assert_eq!(old.stt_seconds, None);
        assert_eq!(old.tts_characters, None);
        assert_eq!(old.prompt_tokens, None);
        assert_eq!(old.completion_tokens, None);
        assert_eq!(old.total_tokens, None);
        for entry in [
            old,
            CostEntry {
                provider: "elevenlabs".into(),
                status: 200,
                stt_seconds: Some(3.5),
                estimated_cost_usd: Some(0.007),
                ..CostEntry::default()
            },
            CostEntry {
                provider: "elevenlabs".into(),
                status: 0,
                tts_characters: Some(12),
                estimated_cost_usd: Some(0.006),
                error: Some("Connection interrupted".into()),
                ..CostEntry::default()
            },
        ] {
            log.append(&entry).unwrap();
        }
        let totals = log.totals();
        assert_eq!(totals[0].calls, 3);
        assert_eq!(totals[0].failures, 1);
        assert_eq!(totals[0].unpriced_calls, 1);
        assert_eq!(totals[0].stt_seconds, 3.5);
        assert_eq!(totals[0].tts_characters, 12);
        assert!((totals[0].estimated_cost_usd.unwrap() - 0.013).abs() < 1e-12);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn provider_token_counts_are_read_without_keeping_the_body() {
        let gemini = llm_tokens(
            r#"{"candidates":[{"content":{"parts":[{"text":"secret prompt copy"}]}}],"usageMetadata":{"promptTokenCount":12,"candidatesTokenCount":3,"totalTokenCount":15}}"#,
        );
        assert_eq!(
            (gemini.prompt, gemini.completion, gemini.total),
            (Some(12), Some(3), Some(15))
        );
        let openai = llm_tokens(r#"{"usage":{"input_tokens":8,"output_tokens":2}}"#);
        assert_eq!(
            (openai.prompt, openai.completion, openai.total),
            (Some(8), Some(2), Some(10))
        );
        let chat =
            llm_tokens(r#"{"usage":{"prompt_tokens":4,"completion_tokens":6,"total_tokens":10}}"#);
        assert_eq!(chat.total, Some(10));
        assert_eq!(llm_tokens("not-json").total, None);
        assert_eq!(llm_tokens(r#"{"ok":true}"#).prompt, None);
        let dir = std::env::temp_dir().join(format!("jam-token-cost-{}", std::process::id()));
        let log = CostLog::new(dir.join("usage.jsonl"));
        log.append(&CostEntry {
            provider: "gemini".into(),
            status: 200,
            prompt_tokens: Some(12),
            completion_tokens: Some(3),
            total_tokens: Some(15),
            estimated_cost_usd: Some(0.0),
            ..CostEntry::default()
        })
        .unwrap();
        let line = std::fs::read_to_string(log.path()).unwrap();
        assert!(!line.contains("secret"));
        assert!(line.contains("promptTokens"));
        assert_eq!(log.totals()[0].total_tokens, 15);
        std::fs::remove_dir_all(dir).unwrap();
    }

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
        assert!(validate(&req("musicai", "/v1/upload")).is_ok());
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
        assert!(err.contains("No API key"), "{err}");
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
        assert!(!err.contains("No API key"), "{err}");
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
                ..CostEntry::default()
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

    #[test]
    fn cost_log_skips_invalid_utf8_and_keeps_later_entries() {
        let dir = std::env::temp_dir().join(format!("jam-costlog-utf8-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let log = CostLog::new(dir.join("usage.jsonl"));
        log.append(&CostEntry {
            at_ms: 1,
            provider: "gemini".into(),
            method: "POST".into(),
            path: "/v1/early".into(),
            status: 200,
            ..CostEntry::default()
        })
        .unwrap();
        std::fs::OpenOptions::new()
            .append(true)
            .open(log.path())
            .unwrap()
            .write_all(b"\n\x80\xff not utf8\n")
            .unwrap();
        log.append(&CostEntry {
            at_ms: 2,
            provider: "gemini".into(),
            method: "GET".into(),
            path: "/v1/later".into(),
            status: 200,
            bytes_in: 9,
            ..CostEntry::default()
        })
        .unwrap();
        let listed = log.list(10);
        assert_eq!(listed.len(), 2, "{listed:?}");
        assert_eq!(listed[0].at_ms, 1);
        assert_eq!(listed[1].at_ms, 2);
        assert_eq!(listed[1].path, "/v1/later");
        assert_eq!(log.totals()[0].calls, 2);
        assert_eq!(log.list(1)[0].at_ms, 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn usage_log_write_failure_is_reported() {
        let dir = std::env::temp_dir().join(format!("jam-costlog-fail-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let blocker = dir.join("not-a-folder");
        std::fs::write(&blocker, b"x").unwrap();
        let log = CostLog::new(blocker.join("usage.jsonl"));
        let mut reported = None;
        persist_cost(
            &log,
            &CostEntry {
                at_ms: 1,
                provider: "gemini".into(),
                method: "POST".into(),
                path: "/v1/x".into(),
                status: 200,
                duration_ms: 1,
                bytes_out: 0,
                bytes_in: 0,
                error: None,
                model: None,
                estimated_cost_usd: None,
                ..CostEntry::default()
            },
            |e| reported = Some(e.to_string()),
        );
        let err = reported.expect("append failure is reported");
        assert!(
            err.starts_with("Cannot ")
                && (err.contains("not-a-folder") || err.contains("usage.jsonl")),
            "{err}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
