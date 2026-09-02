fn main() {
    cxx_build::bridge("src/main.rs")
        .file("src/bridge.cpp")
        .include("src")
        .flag_if_supported("/std:c++17")
        .flag_if_supported("-std=c++17")
        .compile("signalsmith-bridge");
    println!("cargo:rerun-if-changed=src/main.rs");
    println!("cargo:rerun-if-changed=src/bridge.cpp");
    println!("cargo:rerun-if-changed=src/bridge.h");
}
