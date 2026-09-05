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
                "no API key for \"{provider}\": add it under Settings → API credentials"
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
    format!("keychain unavailable: {reason}. Unlock or allow access to the OS keychain, then retry in Settings.")
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
        let entry = keyring::Entry::new(&self.service, provider).map_err(keychain_unavailable)?;
        entry.set_password(secret).map_err(keychain_unavailable)?;
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
        let mut map = self.secrets.lock().unwrap();
        map.insert(provider.to_string(), secret.to_string());
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
    fn delete_propagates_store_errors() {
        assert!(delete_result(Ok(())).is_ok());
        assert!(delete_result(Err(keyring::Error::NoEntry)).is_ok());
        let err = delete_result(Err(keyring::Error::NoStorageAccess(Box::new(
            std::io::Error::other("secret platform details"),
        ))))
        .unwrap_err();
        assert!(err.contains("access denied"), "{err}");
        assert!(!err.contains("secret"), "{err}");
        let err = keychain_unavailable(keyring::Error::BadEncoding(b"secret".to_vec()));
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
        assert!(!err.contains("no API key"), "{err}");
        assert!(!err.contains("secret"), "{err}");
    }

    #[test]
    fn require_missing_key_tells_the_user_to_add_one() {
        let store = MemoryStore::default();
        let err = store.require("gemini").unwrap_err();
        assert!(err.contains("no API key for \"gemini\""), "{err}");
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
