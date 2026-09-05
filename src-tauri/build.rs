fn main() {
    tauri_build::build();
    link_windows_manifest_into_tests();
}

/// tauri-build embeds the Windows application manifest (Common Controls v6, which the
/// menu crate's `TaskDialogIndirect` import needs) into bin targets only. The IPC tests
/// build the app on Tauri's mock runtime and link the same window code, so without the
/// manifest the test binary dies at load with STATUS_ENTRYPOINT_NOT_FOUND before any test
/// runs. Link the resource tauri-build already compiled into test binaries as well.
fn link_windows_manifest_into_tests() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let Some(out_dir) = std::env::var_os("OUT_DIR") else {
        return;
    };
    let resource = std::path::PathBuf::from(out_dir).join("resource.lib");
    if resource.exists() {
        println!("cargo:rustc-link-arg-tests={}", resource.display());
    }
}
