use jam_core::registry::{
    ChartManifest, ControlMapManifest, RigManifest, SeamRegistry, StyleManifest, BUNDLED_CHARTS,
    BUNDLED_CONTROLS, BUNDLED_RIGS, BUNDLED_STYLES,
};

#[test]
fn test_bundled_registries_load() {
    let mut style_reg = SeamRegistry::<StyleManifest>::new();
    let style_count = style_reg
        .load_from_dir(&BUNDLED_STYLES)
        .expect("styles load");
    assert!(style_count > 0, "Expected at least 1 bundled style");
    assert!(style_reg.get("blues-shuffle").is_some());

    let mut chart_reg = SeamRegistry::<ChartManifest>::new();
    let chart_count = chart_reg
        .load_from_dir(&BUNDLED_CHARTS)
        .expect("charts load");
    assert!(chart_count > 0, "Expected at least 1 bundled chart");
    assert!(chart_reg.get("blues-12-bar").is_some());

    let mut rig_reg = SeamRegistry::<RigManifest>::new();
    let rig_count = rig_reg.load_from_dir(&BUNDLED_RIGS).expect("rigs load");
    assert!(rig_count > 0, "Expected at least 1 bundled rig");
    assert!(rig_reg.get("headrush-pedalboard").is_some());

    let mut control_reg = SeamRegistry::<ControlMapManifest>::new();
    let control_count = control_reg
        .load_from_dir(&BUNDLED_CONTROLS)
        .expect("controls load");
    assert!(control_count > 0, "Expected at least 1 bundled control map");
    assert!(control_reg.get("black-spirit-200").is_some());
}
