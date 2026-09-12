//! keys: SecretStore seam for OS keychain access with MemoryStore test fallback.

use std::collections::HashMap;
use std::sync::Mutex;

pub trait SecretStore: Send + Sync {
    fn set(&self, provider: &str, secret: &str) -> Result<(), String>;
    fn has(&self, provider: &str) -> Result<bool, String> {
        self.get(provider).map(|secret| secret.is_some())
    }
    fn delete(&self, provider: &str) -> Result<(), String>;
    /// The secret itself. Only `net::provider_fetch` (and media) may call this;
    /// no IPC command returns a key to the WebView.
    ///
    /// `Ok(None)` means the provider has no saved key. `Err` means the keychain
    /// could not be read (locked, access denied, decode failure) and must not
    /// be reported as a missing key.
    fn get(&self, provider: &str) -> Result<Option<String>, String>;

    fn require(&self, provider: &str) -> Result<String, String> {
        match self.get(provider)? {
            Some(secret) => Ok(secret),
            None => Err(format!(
                "No API key for \"{provider}\". Add it under Settings → API credentials."
            )),
        }
    }
}

fn keychain_unavailable(err: keyring::Error) -> String {
    // Never format credential payloads or platform error details into IPC/logs.
    let reason = match err {
        keyring::Error::NoStorageAccess(_) => "access denied or locked",
        keyring::Error::BadEncoding(_) => "saved credential could not be decoded",
        keyring::Error::Ambiguous(_) => "multiple matching credentials",
        _ => "secure storage operation failed",
    };
    format!("The keychain is unavailable ({reason}). Unlock or allow access to the OS keychain, then retry in Settings.")
}

/// Windows Credential Manager blobs are capped at 2560 bytes; reject control
/// characters and trim surrounding whitespace before any OS keychain call.
pub(crate) const SECRET_MAX_BYTES: usize = 2560;

pub(crate) fn prepare_secret(secret: &str) -> Result<String, String> {
    let trimmed = secret.trim_matches([' ', '\t', '\n', '\r']);
    if trimmed.is_empty() {
        return Err("API key is empty. Paste the key without extra spaces.".into());
    }
    if trimmed.bytes().any(|b| b < 0x20 || b == 0x7f) {
        return Err(
            "API key contains control characters. Paste the key without line breaks.".into(),
        );
    }
    if trimmed.len() > SECRET_MAX_BYTES {
        return Err(format!(
            "API key is too long. The limit is {SECRET_MAX_BYTES} bytes."
        ));
    }
    Ok(trimmed.to_string())
}

fn delete_result(result: keyring::Result<()>) -> Result<(), String> {
    match result {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(keychain_unavailable(error)),
    }
}

/// KeyringStore: Production implementation using OS Keychain via keyring crate.
pub struct KeyringStore {
    service: String,
}

impl Default for KeyringStore {
    fn default() -> Self {
        Self {
            service: "josefines-jamstudio".into(),
        }
    }
}

impl SecretStore for KeyringStore {
    fn set(&self, provider: &str, secret: &str) -> Result<(), String> {
        let secret = prepare_secret(secret)?;
        let entry = keyring::Entry::new(&self.service, provider).map_err(keychain_unavailable)?;
        entry.set_password(&secret).map_err(keychain_unavailable)?;
        Ok(())
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(&self.service, provider).map_err(keychain_unavailable)?;
        delete_result(entry.delete_credential())
    }

    fn get(&self, provider: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(&self.service, provider).map_err(keychain_unavailable)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(keychain_unavailable(e)),
        }
    }
}

/// MemoryStore: In-memory store for headless testing without touching OS keychain.
#[derive(Default)]
pub struct MemoryStore {
    secrets: Mutex<HashMap<String, String>>,
}

impl SecretStore for MemoryStore {
    fn set(&self, provider: &str, secret: &str) -> Result<(), String> {
        let secret = prepare_secret(secret)?;
        let mut map = self.secrets.lock().unwrap();
        map.insert(provider.to_string(), secret);
        Ok(())
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        let mut map = self.secrets.lock().unwrap();
        map.remove(provider);
        Ok(())
    }

    fn get(&self, provider: &str) -> Result<Option<String>, String> {
        Ok(self.secrets.lock().unwrap().get(provider).cloned())
    }
}

/// Test double that can fail `get` / `delete` the way a locked keychain does.
#[cfg(test)]
pub struct FailingStore {
    pub get_error: Option<String>,
    pub delete_error: Option<String>,
}

#[cfg(test)]
impl SecretStore for FailingStore {
    fn set(&self, _provider: &str, _secret: &str) -> Result<(), String> {
        Err("FailingStore refuses set".into())
    }

    fn delete(&self, _provider: &str) -> Result<(), String> {
        match &self.delete_error {
            Some(error) => Err(error.clone()),
            None => Ok(()),
        }
    }

    fn get(&self, _provider: &str) -> Result<Option<String>, String> {
        match &self.get_error {
            Some(error) => Err(error.clone()),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_secret_store() {
        let store = MemoryStore::default();
        assert!(!store.has("gemini").unwrap());

        store.set("gemini", "secret_key_value").unwrap();
        assert!(store.has("gemini").unwrap());
        assert_eq!(
            store.get("gemini").unwrap().as_deref(),
            Some("secret_key_value")
        );

        store.delete("gemini").unwrap();
        assert!(!store.has("gemini").unwrap());
        assert_eq!(store.get("gemini").unwrap(), None);
        store.delete("gemini").unwrap();
    }

    #[test]
    fn secret_store_trims_whitespace_and_rejects_control_chars_and_oversize() {
        let store = MemoryStore::default();
        store
            .set("gemini", "  sk-live\r\n")
            .expect("surrounding whitespace and CRLF are stripped");
        assert_eq!(store.get("gemini").unwrap().as_deref(), Some("sk-live"));

        let empty = store.set("openai", " \r\n\t ").unwrap_err();
        assert!(empty.contains("empty"), "{empty}");
        assert!(!store.has("openai").unwrap());

        let control = store.set("anthropic", "sk-live\0hidden").unwrap_err();
        assert!(control.contains("control characters"), "{control}");
        assert!(!store.has("anthropic").unwrap());

        let longest = "k".repeat(SECRET_MAX_BYTES);
        store.set("openrouter", &longest).unwrap();
        assert_eq!(
            store.get("openrouter").unwrap().as_deref(),
            Some(longest.as_str())
        );
        let too_long = store
            .set("minimax", &"k".repeat(SECRET_MAX_BYTES + 1))
            .unwrap_err();
        assert!(
            too_long.contains(&SECRET_MAX_BYTES.to_string()) && too_long.contains("too long"),
            "{too_long}"
        );
        assert!(!store.has("minimax").unwrap());
    }

    #[test]
    fn delete_propagates_store_errors() {
        assert!(delete_result(Ok(())).is_ok());
        assert!(delete_result(Err(keyring::Error::NoEntry)).is_ok());
        let err = delete_result(Err(keyring::Error::NoStorageAccess(Box::new(
            std::io::Error::other("secret platform details"),
        ))))
        .unwrap_err();
        assert!(err.starts_with("The keychain is unavailable"), "{err}");
        assert!(err.contains("access denied"), "{err}");
        assert!(!err.contains("secret"), "{err}");
        let err = keychain_unavailable(keyring::Error::BadEncoding(b"secret".to_vec()));
        assert!(err.starts_with("The keychain is unavailable"), "{err}");
        assert!(!err.contains("secret"), "{err}");
    }

    #[test]
    fn get_propagates_store_errors_instead_of_missing_key() {
        let store = FailingStore {
            get_error: Some("keychain unavailable: locked".into()),
            delete_error: None,
        };
        let err = store.get("gemini").unwrap_err();
        assert!(err.contains("keychain unavailable"), "{err}");
        let err = store.require("gemini").unwrap_err();
        assert!(err.contains("keychain unavailable"), "{err}");
        assert!(!err.contains("No API key"), "{err}");
        assert!(!err.contains("secret"), "{err}");
    }

    #[test]
    fn require_missing_key_tells_the_user_to_add_one() {
        let store = MemoryStore::default();
        let err = store.require("gemini").unwrap_err();
        assert!(err.contains("No API key for \"gemini\""), "{err}");
    }

    #[test]
    fn keychain_failure_survives_provider_status_and_media_preflight() {
        let store = FailingStore {
            get_error: Some("keychain unavailable: locked".into()),
            delete_error: None,
        };
        let providers = serde_json::to_value(crate::net::providers_info(&store)).unwrap();
        assert!(providers
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p["keyError"] == "keychain unavailable: locked"));
        for model in crate::net::media::catalog() {
            let result =
                serde_json::to_value(crate::net::media::configured(&model, &store)).unwrap();
            if model.protocol == "comfy" {
                assert_eq!(result, serde_json::json!({"Ok": true}));
            } else {
                assert_eq!(
                    result,
                    serde_json::json!({"Err": "keychain unavailable: locked"})
                );
            }
        }
    }
}
