//! keys: SecretStore seam for OS keychain access with MemoryStore test fallback.

use std::collections::HashMap;
use std::sync::Mutex;

pub trait SecretStore: Send + Sync {
    fn set(&self, provider: &str, secret: &str) -> Result<(), String>;
    fn has(&self, provider: &str) -> bool;
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

fn keychain_unavailable(err: impl std::fmt::Display) -> String {
    format!("keychain unavailable: {err}")
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
        let entry = keyring::Entry::new(&self.service, provider)
            .map_err(|e| format!("Keyring entry error: {}", e))?;
        entry
            .set_password(secret)
            .map_err(|e| format!("Failed to set key for {}: {}", provider, e))?;
        Ok(())
    }

    fn has(&self, provider: &str) -> bool {
        matches!(self.get(provider), Ok(Some(_)))
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(&self.service, provider).map_err(keychain_unavailable)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Could not remove the API key for {provider}: {e}")),
        }
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

    fn has(&self, provider: &str) -> bool {
        let map = self.secrets.lock().unwrap();
        map.contains_key(provider)
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

    fn has(&self, _provider: &str) -> bool {
        false
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
        assert!(!store.has("gemini"));

        store.set("gemini", "secret_key_value").unwrap();
        assert!(store.has("gemini"));
        assert_eq!(
            store.get("gemini").unwrap().as_deref(),
            Some("secret_key_value")
        );

        store.delete("gemini").unwrap();
        assert!(!store.has("gemini"));
        assert_eq!(store.get("gemini").unwrap(), None);
        store.delete("gemini").unwrap();
    }

    #[test]
    fn delete_propagates_store_errors() {
        let store = FailingStore {
            get_error: None,
            delete_error: Some("Could not remove the API key for gemini: access denied".into()),
        };
        let err = store.delete("gemini").unwrap_err();
        assert!(err.contains("access denied"), "{err}");
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
}
