//! Durable preparation around the existing local analyzer. Audio is already saved.
use super::*;

fn status(source: &mut Asset, state: &str, message: &str) -> Result<(), String> {
    let value = source
        .extra
        .entry("analysisStatus".into())
        .or_insert(json!({"schemaVersion":1}));
    if value["schemaVersion"] != 1 || !value.is_object() {
        return Err("Unsupported analysis status version. Song left intact.".into());
    }
    value["state"] = json!(state);
    value["message"] = json!(message);
    value["analyzer"] = json!("local-chroma-v1");
    Ok(())
}

/// A failed/canceled estimate is a saved song with an explicit retryable status.
/// Metadata/storage errors remain errors; the published audio is never removed.
pub(super) async fn prepare(base: &Path, asset_id: &str) -> Result<Asset, String> {
    let mut source = reference_asset(base, asset_id)?;
    status(&mut source, "running", "Local analysis interrupted or still running. Retry in Songs after the current operation finishes.")?;
    save_asset(base, &source)?;
    let (state, message) = if source.seconds < 2.0 {
        (
            "unavailable",
            "Audio saved. Local analysis needs at least two seconds.".into(),
        )
    } else {
        match analyze_source(base, asset_id).await {
            Ok(analyzed) => {
                source = analyzed;
                (
                    "ready",
                    "Local tempo, chord and key estimates saved. Check them by ear.".into(),
                )
            }
            Err(error) => {
                // Preserve the last successful measurements and external metadata.
                source = asset(base, asset_id)?;
                (
                    if CANCEL.load(Ordering::Relaxed) {
                        "canceled"
                    } else {
                        "failed"
                    },
                    format!("Audio kept; analysis did not finish: {error} Retry in Songs."),
                )
            }
        }
    };
    status(&mut source, state, &message)?;
    save_asset(base, &source).map_err(|e| {
        format!("Song {asset_id} is saved, but analysis status could not be saved: {e}")
    })?;
    Ok(source)
}

pub(super) fn message(source: &Asset) -> &str {
    source
        .extra
        .get("analysisStatus")
        .and_then(|s| s["message"].as_str())
        .unwrap_or("")
}
