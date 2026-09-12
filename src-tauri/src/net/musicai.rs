//! Music.ai documented job and module JSON. Live upload is not configured.
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const NOT_CONFIGURED: &str = "Music.ai analysis is not configured. Add a Music.ai key in Settings, set JAM_LIVE=1, and record a SUCCEEDED job before this command may upload. Local Analyze tempo and chords stays available.";

const KINDS: &[&str] = &["beats", "chords", "key", "sections"];

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAnalysis {
    pub schema_version: u32,
    pub provider: String,
    pub analyzer: String,
    pub confidence: String,
    pub bpm: Option<f64>,
    pub beats: Vec<f64>,
    pub chords: Vec<ChordSpan>,
    pub key: Option<String>,
    pub sections: Vec<SectionSpan>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_hash: Option<String>,
    #[serde(default)]
    pub drives_grid: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ChordSpan {
    pub start: f64,
    pub end: f64,
    pub chord: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SectionSpan {
    pub start: f64,
    pub end: f64,
    pub name: String,
}

pub fn kinds_ok(kinds: &[String]) -> Result<(), String> {
    if kinds.is_empty() || kinds.iter().any(|k| !KINDS.contains(&k.as_str())) {
        return Err("Choose beats, chords, key or sections.".into());
    }
    Ok(())
}

pub fn job_status(job: &Value) -> Result<&str, String> {
    match job["status"].as_str() {
        Some("SUCCEEDED") => Ok("SUCCEEDED"),
        Some("FAILED") => Err(job["error"]["message"]
            .as_str()
            .unwrap_or("Music.ai job failed.")
            .to_string()),
        Some(status) => Err(format!("Music.ai job is {status}. Wait or cancel.")),
        None => Err("Music.ai job is missing a status.".into()),
    }
}

pub fn read_recorded(doc: &Value) -> Result<ProviderAnalysis, String> {
    job_status(&doc["job"])?;
    let bpm = number(&doc["job"]["result"]["bpm"]).or_else(|| first_bpm(&doc["beats"]));
    let beats = if doc["beatMap"].is_array() {
        beat_starts(&doc["beatMap"])?
    } else {
        beat_starts(&doc["beats"])?
    };
    Ok(ProviderAnalysis {
        schema_version: 1,
        provider: "musicai".into(),
        analyzer: "musicai-documented-v1".into(),
        confidence: "unverified".into(),
        bpm,
        beats,
        chords: chord_spans(&doc["chords"])?,
        key: text(&doc["key"]).or_else(|| text(&doc["job"]["result"]["key"])),
        sections: section_spans(&doc["sections"])?,
        source_hash: None,
        drives_grid: false,
    })
}

/// Headless tests persist the documented fixture. Live upload stays not configured.
pub fn recorded_for_persist() -> Result<ProviderAnalysis, String> {
    match std::env::var("JAM_MUSICAI_FIXTURE") {
        Ok(value) if value == "1" => read_recorded(
            &serde_json::from_str(include_str!(
                "../../../tests/fixtures/providers/musicai/recorded.json"
            ))
            .map_err(|e| e.to_string())?,
        ),
        _ => Err(NOT_CONFIGURED.into()),
    }
}

fn beat_starts(value: &Value) -> Result<Vec<f64>, String> {
    let rows = rows(value, "beatMap")?;
    let mut starts = Vec::with_capacity(rows.len());
    for row in rows {
        let start = number(&row["start"]).ok_or("Each beat needs a start time.")?;
        if !start.is_finite() || start < 0.0 {
            return Err("Beat start times must be finite and not negative.".into());
        }
        starts.push(start);
    }
    if starts.windows(2).any(|w| w[1] < w[0]) {
        return Err("Beat start times must be in order.".into());
    }
    Ok(starts)
}

fn first_bpm(value: &Value) -> Option<f64> {
    value
        .as_array()
        .and_then(|rows| rows.iter().find_map(|row| number(&row["bpm"])))
}

fn ordered_span(start: f64, end: f64) -> Result<(f64, f64), String> {
    if start > end {
        return Err("Span start must not exceed end.".into());
    }
    Ok((start, end))
}

fn chord_spans(value: &Value) -> Result<Vec<ChordSpan>, String> {
    let rows = rows(value, "chordMap")?;
    rows.iter()
        .map(|row| {
            let (start, end) = ordered_span(
                bound(&row["start"], "chord start")?,
                bound(&row["end"], "chord end")?,
            )?;
            Ok(ChordSpan {
                start,
                end,
                chord: text(&row["chord"]).or_else(|| text(&row["label"])),
            })
        })
        .collect()
}

fn section_spans(value: &Value) -> Result<Vec<SectionSpan>, String> {
    let rows = rows(value, "sectionsMap")?;
    rows.iter()
        .map(|row| {
            let name = text(&row["section"])
                .or_else(|| text(&row["name"]))
                .ok_or_else(|| "Each section needs a name.".to_string())?;
            let (start, end) = ordered_span(
                bound(&row["start"], "section start")?,
                bound(&row["end"], "section end")?,
            )?;
            Ok(SectionSpan { start, end, name })
        })
        .collect()
}

fn rows<'a>(value: &'a Value, map: &str) -> Result<&'a Vec<Value>, String> {
    if let Some(rows) = value.as_array() {
        return Ok(rows);
    }
    value
        .get(map)
        .and_then(Value::as_array)
        .or_else(|| value.get("annotations").and_then(Value::as_array))
        .ok_or_else(|| format!("Music.ai {map} must be an array."))
}

fn bound(value: &Value, label: &str) -> Result<f64, String> {
    let n = number(value).ok_or_else(|| format!("Each {label} must be a number."))?;
    if n.is_finite() && n >= 0.0 {
        Ok(n)
    } else {
        Err(format!("{label} must be finite and not negative."))
    }
}

fn number(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| value.as_u64().map(|n| n as f64))
}

fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn recorded() -> Value {
        serde_json::from_str(include_str!(
            "../../../tests/fixtures/providers/musicai/recorded.json"
        ))
        .unwrap()
    }

    #[test]
    fn recorded_docs_yield_beats_chords_key_and_sections() {
        let analysis = read_recorded(&recorded()).unwrap();
        assert_eq!(analysis.provider, "musicai");
        assert_eq!(analysis.confidence, "unverified");
        assert!(!analysis.drives_grid);
        assert_eq!(analysis.bpm, Some(120.0));
        assert_eq!(analysis.beats, vec![0.0, 0.5, 1.0, 1.5]);
        assert_eq!(analysis.key.as_deref(), Some("C Major"));
        assert_eq!(analysis.chords[1].chord.as_deref(), Some("F"));
        assert_eq!(analysis.sections[0].name, "Verse");
        assert_eq!(analysis.sections[1].name, "Chorus");
    }

    #[test]
    fn file_format_beat_rows_are_accepted_when_beat_map_is_absent() {
        let mut doc = recorded();
        doc.as_object_mut().unwrap().remove("beatMap");
        let analysis = read_recorded(&doc).unwrap();
        assert_eq!(analysis.beats, vec![0.0, 0.5, 1.0, 1.5]);
        assert_eq!(analysis.bpm, Some(120.0));
    }

    #[test]
    fn failed_jobs_surface_the_provider_message() {
        let err = job_status(&recorded()["failedJob"]).unwrap_err();
        assert!(err.contains("File not found"), "{err}");
    }

    #[test]
    fn kinds_are_the_documented_analysis_steps() {
        assert!(kinds_ok(&["beats".into(), "sections".into()]).is_ok());
        assert!(kinds_ok(&["stems".into()]).is_err());
        assert!(kinds_ok(&[]).is_err());
    }

    #[test]
    fn unordered_beats_are_refused() {
        let err = beat_starts(&json!([{"start": 1.0}, {"start": 0.2}])).unwrap_err();
        assert!(err.contains("order"), "{err}");
    }

    #[test]
    fn inverted_chord_and_section_spans_are_refused() {
        let err = chord_spans(&json!([{"start": 10.0, "end": 2.0, "chord": "Am"}])).unwrap_err();
        assert!(err.contains("Span start must not exceed end"), "{err}");
        let err =
            section_spans(&json!([{"start": 8.0, "end": 1.0, "section": "Verse"}])).unwrap_err();
        assert!(err.contains("Span start must not exceed end"), "{err}");
        assert!(chord_spans(&json!([{"start": 1.0, "end": 1.0, "chord": "C"}])).is_ok());
    }
}
