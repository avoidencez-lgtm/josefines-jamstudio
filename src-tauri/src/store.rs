//! store: take list at ~/JosefinesJamstudio/takes.json.

use jam_audio::recorder::TakeMetadata;
use std::fs;
use std::path::PathBuf;

fn takes_path() -> PathBuf {
    let mut dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("JosefinesJamstudio");
    dir.push("takes.json");
    dir
}

pub struct IndexStore {
    path: Option<PathBuf>,
    takes: Vec<TakeMetadata>,
}

impl IndexStore {
    pub fn open() -> Result<Self, String> {
        let path = takes_path();
        let takes = if path.exists() {
            let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            Vec::new()
        };
        Ok(Self {
            path: Some(path),
            takes,
        })
    }

    pub fn open_in_memory() -> Result<Self, String> {
        Ok(Self {
            path: None,
            takes: Vec::new(),
        })
    }

    fn persist(&self) -> Result<(), String> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(
            path,
            serde_json::to_vec(&self.takes).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())
    }

    pub fn insert_take(&mut self, take: &TakeMetadata) -> Result<(), String> {
        self.takes.retain(|t| t.id != take.id);
        self.takes.insert(0, take.clone());
        self.persist()
    }

    pub fn list_takes(&self) -> Result<Vec<TakeMetadata>, String> {
        Ok(self.takes.clone())
    }

    pub fn delete_take(&mut self, id: &str) -> Result<(), String> {
        self.takes.retain(|t| t.id != id);
        self.persist()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_takes_insert_list_and_delete() {
        let mut store = IndexStore::open_in_memory().expect("in-memory store opens");
        let take = TakeMetadata {
            id: "take-123".into(),
            session_id: "session-abc".into(),
            timestamp: "2026-09-02T20:00:00Z".into(),
            duration_secs: 12.5,
            style_id: "blues-shuffle".into(),
            chart_id: "blues-12-bar".into(),
            tempo: 110.0,
            sample_count: 600_000,
            path_input: "/tmp/in.wav".into(),
            path_band: "/tmp/band.wav".into(),
            path_master: "/tmp/master.wav".into(),
            waveform_peaks: vec![0.1, 0.5, 0.9],
            notes: "Great first take".into(),
        };

        store.insert_take(&take).expect("insert succeeds");

        let list = store.list_takes().expect("list succeeds");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "take-123");
        assert_eq!(list[0].waveform_peaks, vec![0.1, 0.5, 0.9]);

        store.delete_take("take-123").expect("delete succeeds");
        let empty_list = store.list_takes().expect("list succeeds");
        assert_eq!(empty_list.len(), 0);
    }
}
