use jam_core::chart::Chart;
use jam_core::registry::{
    ControlMapManifest, SeamRegistry, BUNDLED_CHARTS, BUNDLED_CONTROLS, BUNDLED_STYLES,
};
use jam_core::style::Style;

#[test]
fn test_bundled_registries_load() {
    let mut style_reg = SeamRegistry::<Style>::new();
    let style_count = style_reg
        .load_from_dir(&BUNDLED_STYLES)
        .expect("styles load");
    assert!(style_count > 0, "Expected at least 1 bundled style");
    assert!(style_reg.get("blues-shuffle").is_some());

    let mut chart_reg = SeamRegistry::<Chart>::new();
    let chart_count = chart_reg
        .load_from_dir(&BUNDLED_CHARTS)
        .expect("charts load");
    assert!(chart_count > 0, "Expected at least 1 bundled chart");
    assert!(chart_reg.get("blues-12-bar").is_some());

    let mut control_reg = SeamRegistry::<ControlMapManifest>::new();
    let control_count = control_reg
        .load_from_dir(&BUNDLED_CONTROLS)
        .expect("controls load");
    assert!(control_count > 0, "Expected at least 1 bundled control map");
    assert!(control_reg.get("black-spirit-200").is_some());
    assert!(control_reg.get("default").is_some());
    for map in control_reg.list() {
        assert!(
            !map.bindings.is_empty(),
            "{} must declare bindings the app dispatches",
            map.id
        );
        for binding in &map.bindings {
            assert!(
                binding.get("action").and_then(|a| a.as_str()).is_some(),
                "{} binding needs an action",
                map.id
            );
        }
    }
}
