//! Provider HTTP proxy. Keys stay in Rust; the WebView never sees them.

use crate::keys::SecretStore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct ProviderFetchRequest {
    pub provider: String,
    pub path: String,
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProviderFetchResponse {
    pub status: u16,
    pub body: String,
}

fn base_url(provider: &str) -> Result<&'static str, String> {
    match provider {
        "gemini" => Ok("https://generativelanguage.googleapis.com"),
        "elevenlabs" => Ok("https://api.elevenlabs.io"),
        _ => Err(format!("unknown provider: {provider}")),
    }
}

fn auth_header(provider: &str, key: &str) -> (&'static str, String) {
    match provider {
        "gemini" => ("x-goog-api-key", key.to_string()),
        "elevenlabs" => ("xi-api-key", key.to_string()),
        _ => ("authorization", format!("Bearer {key}")),
    }
}

pub fn provider_fetch(
    req: ProviderFetchRequest,
    store: &dyn SecretStore,
) -> Result<ProviderFetchResponse, String> {
    let base = base_url(&req.provider)?;
    let key = store.get(&req.provider)?;
    let url = if req.path.starts_with("http") {
        req.path.clone()
    } else {
        format!(
            "{base}{}",
            if req.path.starts_with('/') {
                req.path.clone()
            } else {
                format!("/{}", req.path)
            }
        )
    };

    let client = reqwest::blocking::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())?;
    let method =
        reqwest::Method::from_bytes(req.method.as_bytes()).unwrap_or(reqwest::Method::POST);
    let mut builder = client.request(method, &url);
    let (auth_name, auth_val) = auth_header(&req.provider, &key);
    builder = builder.header(auth_name, auth_val);
    for (k, v) in &req.headers {
        if k.eq_ignore_ascii_case("authorization") || k.eq_ignore_ascii_case("x-goog-api-key") {
            continue;
        }
        builder = builder.header(k, v);
    }
    if let Some(body) = &req.body {
        builder = builder.body(body.clone());
    }

    let response = builder.send().map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().map_err(|e| e.to_string())?;
    Ok(ProviderFetchResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::MemoryStore;

    #[test]
    fn missing_key_fails_loud() {
        let store = MemoryStore::default();
        let err = provider_fetch(
            ProviderFetchRequest {
                provider: "gemini".into(),
                path: "/v1/models".into(),
                method: "GET".into(),
                headers: HashMap::new(),
                body: None,
            },
            &store,
        )
        .unwrap_err();
        assert!(err.contains("not configured"));
    }

    #[test]
    fn unknown_provider_fails() {
        let store = MemoryStore::default();
        let err = provider_fetch(
            ProviderFetchRequest {
                provider: "suno".into(),
                path: "/".into(),
                method: "GET".into(),
                headers: HashMap::new(),
                body: None,
            },
            &store,
        )
        .unwrap_err();
        assert!(err.contains("unknown provider"));
    }
}
