//! keys: SecretStore seam for OS keychain access with MemoryStore test fallback.

use std::collections::HashMap;
use std::sync::Mutex;

pub trait SecretStore: Send + Sync {
    fn set(&self, provider: &str, secret: &str) -> Result<(), String>;
    fn has(&self, provider: &str) -> bool;
    fn delete(&self, provider: &str) -> Result<(), String>;
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
        if let Ok(entry) = keyring::Entry::new(&self.service, provider) {
            entry.get_password().is_ok()
        } else {
            false
        }
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        if let Ok(entry) = keyring::Entry::new(&self.service, provider) {
            let _ = entry.delete_credential();
        }
        Ok(())
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

        store.delete("gemini").unwrap();
        assert!(!store.has("gemini"));
    }
}
