//! Bundled style and chart loaders. Adding a JSON file under styles/ or charts/ is enough.

use crate::chart::Chart;
use crate::style::Style;
use include_dir::{include_dir, Dir};

static BUNDLED_STYLES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../styles");
static BUNDLED_CHARTS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../charts");

fn parse_all<T: for<'de> serde::Deserialize<'de>>(dir: &Dir) -> Vec<T> {
    dir.files()
        .filter(|f| f.path().extension().is_some_and(|e| e == "json"))
        .filter_map(|f| f.contents_utf8())
        .filter_map(|s| serde_json::from_str::<T>(s).ok())
        .collect()
}

pub fn list_styles() -> Vec<Style> {
    parse_all(&BUNDLED_STYLES)
}

pub fn list_charts() -> Vec<Chart> {
    parse_all(&BUNDLED_CHARTS)
}

pub fn load_style(id: &str) -> Result<Style, String> {
    list_styles()
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("Unknown style id: {id}"))
}

pub fn load_chart(id: &str) -> Result<Chart, String> {
    list_charts()
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| format!("Unknown chart id: {id}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_styles_include_blues_shuffle() {
        assert!(load_style("blues-shuffle").is_ok());
        assert!(list_styles().len() >= 6);
    }

    #[test]
    fn bundled_charts_include_blues_12() {
        assert!(load_chart("blues-12-bar").is_ok());
        assert!(list_charts().len() >= 6);
    }
}
