//! Replace a document only after its bytes and optional backup are staged.
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

// ponytail: serialize document commits; use per-path locks if disk saves become a bottleneck.
static WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn regular_file_exists(path: &Path) -> io::Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_file() => Ok(true),
        Ok(_) => Err(io::Error::other(format!(
            "{} is not a regular file. Move it aside before saving.",
            path.display()
        ))),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

fn stage(path: &Path, mut source: impl Read) -> io::Result<PathBuf> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut name = path.as_os_str().to_os_string();
    name.push(format!(".tmp.{}.{stamp}", std::process::id()));
    let temp = PathBuf::from(name);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    let result = io::copy(&mut source, &mut file).and_then(|_| file.sync_all());
    drop(file);
    if let Err(e) = result {
        let _ = fs::remove_file(&temp);
        return Err(e);
    }
    Ok(temp)
}

/// Callers retain their revision locks and create the parent directory.
/// A failed final replacement restores the prior backup. Failed restoration
/// reports the retained recovery file; it is never deleted by cleanup.
pub(crate) fn write(path: &Path, bytes: &[u8], backup: Option<&Path>) -> io::Result<()> {
    let _lock = WRITE_LOCK.lock().map_err(|_| {
        io::Error::other("Document saving was interrupted. Restart the app before saving again.")
    })?;
    let temp = stage(path, bytes)?;
    let mut next_backup = None;
    let mut previous_backup = None;
    let mut backup_replaced = false;
    let mut result = (|| {
        let backup = if regular_file_exists(path)? {
            backup
        } else {
            None
        };
        if let Some(backup) = backup {
            let source = File::open(path)?;
            let permissions = source.metadata()?.permissions();
            next_backup = Some(stage(backup, source)?);
            fs::set_permissions(next_backup.as_ref().unwrap(), permissions)?;
            if regular_file_exists(backup)? {
                // Reserve our own recovery name before moving the old backup.
                let saved = stage(backup, io::empty())?;
                if let Err(e) = fs::rename(backup, &saved) {
                    let _ = fs::remove_file(&saved);
                    return Err(e);
                }
                previous_backup = Some(saved);
            }
            fs::rename(next_backup.as_ref().unwrap(), backup)?;
            backup_replaced = true;
        }
        fs::rename(&temp, path)
    })();
    if let Some(backup) = backup {
        if let Err(ref original) = result {
            if let Some(previous) = &previous_backup {
                if let Err(restore) = fs::rename(previous, backup) {
                    result = Err(io::Error::other(format!(
                        "{original}. Cannot restore the backup: {restore}. Its bytes are kept at {}.",
                        previous.display()
                    )));
                }
            } else if backup_replaced {
                if let Err(cleanup) = fs::remove_file(backup) {
                    result = Err(io::Error::other(format!(
                        "{original}. Cannot remove the new backup at {}: {cleanup}.",
                        backup.display()
                    )));
                }
            }
        } else if let Some(previous) = &previous_backup {
            let _ = fs::remove_file(previous);
        }
    }
    for file in [Some(temp), next_backup].into_iter().flatten() {
        let _ = fs::remove_file(file);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_commits_leave_complete_current_and_previous_documents() {
        let root = std::env::temp_dir().join(format!("jam-save-concurrent-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("song.json");
        let backup = root.join("song.json.bak");
        fs::write(&path, b"initial").unwrap();
        let start = std::sync::Barrier::new(6);
        std::thread::scope(|scope| {
            for value in 1..=6 {
                let (path, backup, start) = (&path, &backup, &start);
                scope.spawn(move || {
                    start.wait();
                    write(path, &vec![value; 8192], Some(backup)).unwrap();
                });
            }
        });
        let current = fs::read(&path).unwrap();
        let previous = fs::read(&backup).unwrap();
        for bytes in [&current, &previous] {
            assert_eq!(bytes.len(), 8192);
            assert!(bytes.iter().all(|byte| *byte == bytes[0]));
        }
        assert_ne!(current[0], previous[0]);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn interrupted_staging_keeps_the_destination_and_cleans_its_partial_file() {
        struct Broken;
        impl Read for Broken {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("read interrupted"))
            }
        }
        let root = std::env::temp_dir().join(format!("jam-stage-failure-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("song.json");
        fs::write(&path, b"current").unwrap();
        let error = stage(&path, b"partial".as_slice().chain(Broken)).unwrap_err();
        assert!(error.to_string().contains("read interrupted"));
        assert_eq!(fs::read(&path).unwrap(), b"current");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
}
