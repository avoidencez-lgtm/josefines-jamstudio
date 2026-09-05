fn main() {
    cxx_build::bridge("src/stretch.rs")
        .file("cxx/stretch.cc")
        .include("cxx")
        .std("c++17")
        .opt_level(3)
        .flag_if_supported("/bigobj")
        .compile("jam-stretch");
    println!("cargo:rerun-if-changed=src/stretch.rs");
    println!("cargo:rerun-if-changed=cxx");
}
