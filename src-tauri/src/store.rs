//! store: SQLite index cache at ~/JosefinesJamstudio/index.sqlite.
//! Per ADR 0005, files under ~/JosefinesJamstudio/ are the source of truth; SQLite is a cache that can be deleted.

use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;

pub fn db_path() -> PathBuf {
    let mut dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("JosefinesJamstudio");
    dir.push("index.sqlite");
    dir
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

        Ok(Self { conn })
    }

    pub fn open_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
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

        Ok(Self { conn })
    }

    pub fn rebuild_index(&mut self) -> Result<usize, String> {
        let mut count = 0;
        let mut root = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        root.push("JosefinesJamstudio");

        self.conn
            .execute("DELETE FROM library_index", [])
            .map_err(|e| e.to_string())?;

        for sub in &["styles", "charts", "rigs", "takes", "songs"] {
            let mut p = root.clone();
            p.push(sub);
            if let Ok(entries) = fs::read_dir(p) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                    let id = path.file_stem().unwrap_or_default().to_string_lossy();

                    self.conn
                        .execute(
                            "INSERT OR REPLACE INTO library_index (id, kind, name, file_path, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                            params![id, *sub, file_name, path.to_string_lossy(), 0],
                        )
                        .map_err(|e| e.to_string())?;
                    count += 1;
                }
            }
        }

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_open_and_rebuild() {
        let mut store = IndexStore::open_in_memory().unwrap();
        assert!(store.rebuild_index().is_ok());
    }
}
