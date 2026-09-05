//! store: SQLite index cache at ~/JosefinesJamstudio/index.sqlite.
//! Per ADR 0005, files under ~/JosefinesJamstudio/ are the source of truth; SQLite is a cache that can be deleted.

use jam_audio::recorder::TakeMetadata;
use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;

pub fn db_path() -> PathBuf {
    crate::library::Library::default_user_root().join("index.sqlite")
}

pub struct IndexStore {
    conn: Connection,
}

impl IndexStore {
    pub fn open() -> Result<Self, String> {
        let path = db_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        Self::init_schema(&conn)?;
        Ok(Self { conn })
    }

    pub fn open_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        Self::init_schema(&conn)?;
        Ok(Self { conn })
    }

    fn init_schema(conn: &Connection) -> Result<(), String> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS library_index (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS takes (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                duration_secs REAL NOT NULL,
                style_id TEXT NOT NULL,
                chart_id TEXT NOT NULL,
                tempo REAL NOT NULL,
                sample_count INTEGER NOT NULL,
                path_input TEXT NOT NULL,
                path_band TEXT NOT NULL,
                path_master TEXT NOT NULL,
                waveform_peaks TEXT NOT NULL,
                notes TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        let has_manifest: bool = conn
            .prepare("PRAGMA table_info(takes)")
            .map_err(|e| e.to_string())?
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .any(|name| name.is_ok_and(|name| name == "manifest"));
        if !has_manifest {
            conn.execute("ALTER TABLE takes ADD COLUMN manifest TEXT", [])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn insert_take(&self, take: &TakeMetadata) -> Result<(), String> {
        let peaks_json =
            serde_json::to_string(&take.waveform_peaks).unwrap_or_else(|_| "[]".into());
        self.conn
            .execute(
                "INSERT OR REPLACE INTO takes (
                id, session_id, timestamp, duration_secs, style_id, chart_id,
                tempo, sample_count, path_input, path_band, path_master,
                waveform_peaks, notes, manifest
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    take.id,
                    take.session_id,
                    take.timestamp,
                    take.duration_secs,
                    take.style_id,
                    take.chart_id,
                    take.tempo,
                    take.sample_count as i64,
                    take.path_input,
                    take.path_band,
                    take.path_master,
                    peaks_json,
                    take.notes,
                    serde_json::to_string(take).map_err(|e| e.to_string())?
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Lists cached takes. The cache never decides what exists (ADR 0005): a manifest
    /// column another app version wrote falls back to the plain columns, and a row that
    /// cannot be read at all is skipped with a warning instead of hiding every take.
    pub fn list_takes(&self) -> Result<(Vec<TakeMetadata>, Vec<String>), String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, session_id, timestamp, duration_secs, style_id, chart_id,
                    tempo, sample_count, path_input, path_band, path_master,
                    waveform_peaks, notes, manifest
             FROM takes ORDER BY timestamp DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                if let Some(manifest) = row.get::<_, Option<String>>(13)? {
                    if let Ok(take) = serde_json::from_str::<TakeMetadata>(&manifest) {
                        return Ok(take);
                    }
                }
                let peaks_str: String = row.get(11)?;
                let peaks: Vec<f32> = serde_json::from_str(&peaks_str).unwrap_or_default();
                Ok(TakeMetadata {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    timestamp: row.get(2)?,
                    duration_secs: row.get(3)?,
                    style_id: row.get(4)?,
                    chart_id: row.get(5)?,
                    tempo: row.get(6)?,
                    sample_count: row.get::<_, i64>(7)? as usize,
                    path_input: row.get(8)?,
                    path_band: row.get(9)?,
                    path_master: row.get(10)?,
                    waveform_peaks: peaks,
                    notes: row.get(12)?,
                    ..Default::default()
                })
            })
            .map_err(|e| e.to_string())?;

        let mut takes = Vec::new();
        let mut skipped = Vec::new();
        for (i, r) in rows.enumerate() {
            match r {
                Ok(take) => takes.push(take),
                Err(e) => skipped.push(format!(
                    "Skipped unreadable take index row {}: {e}. Takes with a take.json on disk stay available; delete index.sqlite to rebuild the cache.",
                    i + 1
                )),
            }
        }
        Ok((takes, skipped))
    }

    pub fn delete_take(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM takes WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn rebuild_index(&mut self) -> Result<usize, String> {
        let mut count = 0;
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let library_dir = home.join("JosefinesJamstudio");

        if !library_dir.exists() {
            return Ok(0);
        }

        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM library_index", [])
            .map_err(|e| e.to_string())?;

        let subdirs = ["songs", "recordings", "backups"];
        for sub in subdirs {
            let path = library_dir.join(sub);
            if let Ok(entries) = fs::read_dir(path) {
                for entry in entries.flatten() {
                    if let Ok(ft) = entry.file_type() {
                        if ft.is_file() {
                            let file_name = entry.file_name().to_string_lossy().to_string();
                            let file_path = entry.path().to_string_lossy().to_string();
                            let id = format!("{}:{}", sub, file_name);

                            tx.execute(
                                "INSERT INTO library_index (id, kind, name, file_path, updated_at)
                                 VALUES (?1, ?2, ?3, ?4, strftime('%s', 'now'))",
                                params![id, sub, file_name, file_path],
                            )
                            .map_err(|e| e.to_string())?;
                            count += 1;
                        }
                    }
                }
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_open_and_rebuild() {
        let mut store = IndexStore::open_in_memory().expect("in-memory db opens");
        let count = store.rebuild_index().expect("rebuild succeeds");
        assert_eq!(count, 0);
    }

    #[test]
    fn test_takes_insert_list_and_delete() {
        let store = IndexStore::open_in_memory().expect("in-memory db opens");
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
            ..Default::default()
        };

        let mut take = take;
        take.sample_rate = 48_000;
        take.stems.insert("drums".into(), "/tmp/drums.wav".into());
        take.extra
            .insert("favourite".into(), serde_json::json!(true));
        take.snapshot = serde_json::json!({"timeSignature": [6, 8]});
        store.insert_take(&take).expect("insert succeeds");

        let (list, skipped) = store.list_takes().expect("list succeeds");
        assert!(skipped.is_empty());
        assert_eq!(list.len(), 1);
        assert_eq!(
            serde_json::to_value(&list[0]).unwrap(),
            serde_json::to_value(&take).unwrap()
        );
        assert_eq!(list[0].id, "take-123");
        assert_eq!(list[0].waveform_peaks, vec![0.1, 0.5, 0.9]);

        store.delete_take("take-123").expect("delete succeeds");
        let (empty_list, _) = store.list_takes().expect("list succeeds");
        assert_eq!(empty_list.len(), 0);
    }

    /// Issue #33: one stale or broken cache row must never hide the other takes.
    #[test]
    fn stale_or_broken_cache_rows_never_hide_other_takes() {
        let store = IndexStore::open_in_memory().expect("in-memory db opens");
        store
            .insert_take(&TakeMetadata {
                id: "good".into(),
                timestamp: "2026-09-05T10:00:00Z".into(),
                ..Default::default()
            })
            .expect("insert succeeds");
        let columns = "id, session_id, timestamp, duration_secs, style_id, chart_id, tempo, \
             sample_count, path_input, path_band, path_master, waveform_peaks, notes, manifest";
        // A manifest written by a future app version that no longer deserialises: the
        // plain columns still describe the take.
        store
            .conn
            .execute(
                &format!("INSERT INTO takes ({columns}) VALUES ('stale', 's', '2026-09-05T11:00:00Z', 1.5, 'blues-shuffle', 'blues-12-bar', 100.0, 72000, 'in.wav', 'band.wav', 'master.wav', '[0.5]', 'note', '{{\"id\":\"stale\",\"unexpected\":')"),
                [],
            )
            .unwrap();
        // A row whose columns cannot be read at all is skipped, not fatal.
        store
            .conn
            .execute(
                &format!("INSERT INTO takes ({columns}) VALUES ('broken', 's', '2026-09-05T12:00:00Z', 'not a number', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', NULL)"),
                [],
            )
            .unwrap();
        let (takes, skipped) = store.list_takes().expect("listing tolerates bad rows");
        assert_eq!(
            takes.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            ["stale", "good"]
        );
        assert_eq!(takes[0].duration_secs, 1.5);
        assert_eq!(takes[0].waveform_peaks, vec![0.5]);
        assert_eq!(skipped.len(), 1);
        assert!(skipped[0].contains("row 1"), "{}", skipped[0]);
    }
}
