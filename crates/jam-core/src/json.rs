//! User JSON files may start with a UTF-8 BOM (Windows Notepad). serde_json
//! treats that as malformed; strip it before every disk parse.

use serde::de::DeserializeOwned;

const UTF8_BOM: &[u8] = &[0xEF, 0xBB, 0xBF];

pub fn strip_bom(text: &str) -> &str {
    text.strip_prefix('\u{feff}').unwrap_or(text)
}

pub fn from_str<T: DeserializeOwned>(text: &str) -> Result<T, serde_json::Error> {
    serde_json::from_str(strip_bom(text))
}

pub fn from_slice<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, serde_json::Error> {
    serde_json::from_slice(bytes.strip_prefix(UTF8_BOM).unwrap_or(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize, PartialEq)]
    struct Doc {
        id: String,
    }

    #[test]
    fn bom_prefixed_json_parses() {
        let text = "\u{feff}{\"id\":\"ok\"}";
        assert_eq!(from_str::<Doc>(text).unwrap(), Doc { id: "ok".into() });
        let mut bytes = UTF8_BOM.to_vec();
        bytes.extend_from_slice(br#"{"id":"ok"}"#);
        assert_eq!(from_slice::<Doc>(&bytes).unwrap(), Doc { id: "ok".into() });
    }

    #[test]
    fn json_without_a_bom_is_unchanged() {
        assert_eq!(
            from_str::<Doc>(r#"{"id":"plain"}"#).unwrap(),
            Doc { id: "plain".into() }
        );
    }
}
