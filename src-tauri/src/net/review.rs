//! LLM take review from analysis numbers. Never from audio. Live calls stay gated.
use serde_json::{json, Value};

pub const NOT_CONFIGURED: &str = "Take review is not configured. Analyze the take first, add a text-provider key in Settings, and set JAM_LIVE=1 before this command may call a provider. JAM_REVIEW_FIXTURE=1 writes the recorded review from those numbers only. This is not a listening review and does not measure Logic Pro drift.";

pub fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/providers/review/take-review.json"
    ))
    .expect("take review fixture")
}

pub fn recorded(analysis: &Value) -> Result<Value, String> {
    match std::env::var("JAM_REVIEW_FIXTURE") {
        Ok(value) if value == "1" => Ok(from_analysis(analysis)),
        _ => Err(NOT_CONFIGURED.into()),
    }
}

pub fn from_analysis(analysis: &Value) -> Value {
    let mut review = fixture();
    review["analysisSummary"] = analysis
        .get("summary")
        .cloned()
        .unwrap_or_else(|| json!(""));
    review["meanAbsCents"] = analysis.get("meanAbsCents").cloned().unwrap_or(json!(null));
    review["meanGridDistanceMs"] = analysis
        .get("meanGridDistanceMs")
        .cloned()
        .unwrap_or(json!(null));
    review["fromAudio"] = json!(false);
    review
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn review_copies_numbers_and_never_claims_audio() {
        let review = from_analysis(&json!({
            "summary": "Detected 1 attack candidates.",
            "meanAbsCents": 1.5,
            "meanGridDistanceMs": null
        }));
        assert_eq!(review["fromAudio"], false);
        assert_eq!(review["meanAbsCents"], 1.5);
        assert_eq!(review["origin"], "synthetic-analysis");
        assert!(review["summary"].as_str().unwrap().contains("numbers"));
    }
}
