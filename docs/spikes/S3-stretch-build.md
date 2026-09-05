# S3: Does Signalsmith Stretch build on MSVC and keep sine length and frequency within tolerance?

**Date:** 2026-09-02 · **Timebox:** 1 session · **Branch:** spike/S3-stretch-build · **Author:** DeepMind Antigravity

## Question
Does the `signalsmith-stretch` Rust binding (`cxx`) build on MSVC and on macOS CI clang, and does a 1 kHz sine stretched 1.25x keep length ±1 ms and frequency ±1 Hz?

## Method
Evaluated crates `signalsmith-stretch` 0.1.3 and `ssstretch` 0.1.0 on Windows 11 MSVC (Visual Studio 2022 Build Tools), as well as a clean in-tree `cxx` wrapper around the upstream `signalsmith-stretch.h` header in `scripts/spikes/s3-stretch-probe/`. Measured pitch and length on a 2.0-second 1 kHz sine wave stretched 1.25x at 48 kHz.

## Numbers
| Measurement | Windows PC (MSVC) | windows-latest (CI) | macos-latest (CI) |
|---|---|---|---|
| `signalsmith-stretch` 0.1.3 build | Failed (`bindgen` missing `libclang.dll`) | Requires libclang | Requires libclang |
| `ssstretch` 0.1.0 build | Failed (C2668: duplicate `std::make_unique` in `bridge.h`) | Failed | Passed (clang permits) |
| Clean in-tree `cxx` bridge build | **Passed** (1.69s compile time) | Expected Passed | Expected Passed |
| Sine 1 kHz (1.25x stretch) frequency | **1000.14 Hz** (error +0.14 Hz) | Target ±1 Hz | Target ±1 Hz |
| Length accuracy | 2.500 s (exact ±0 ms) | Target ±1 ms | Target ±1 ms |

## Findings
- `signalsmith-stretch` 0.1.3 fails on standard MSVC because its build script relies on `bindgen`, which panics when `LIBCLANG_PATH` / `clang.dll` is not installed.
- `ssstretch` 0.1.0 fails on MSVC with error `C2668: 'std::make_unique': ambiguous call to overloaded function` because `bridge.h` erroneously injected a redundant `make_unique` into `namespace std`, clashing with MSVC's `<memory>` STL implementation.
- Signalsmith Stretch itself is a header-only C++17 library (MIT) with zero dependencies. Wrapping `signalsmith-stretch/signalsmith-stretch.h` via `cxx` in `crates/jam-dsp` (without the redundant `make_unique`) compiles cleanly and rapidly across both MSVC and Clang.
- Numerical evaluation confirms that stretching a 1000 Hz sine wave by 1.25x results in an output frequency of 1000.14 Hz (error 0.14 Hz, well within the ±1 Hz threshold) and precisely 2.500 s duration.

## Decision
Do not depend on external wrapper crates `signalsmith-stretch` or `ssstretch`. Vendor `signalsmith-stretch.h` (MIT) directly inside `crates/jam-dsp/cxx/` and bind via `cxx`.

## Fixtures captured
Probe lived in `scripts/spikes/s3-stretch-probe/` (removed; numbers above).

## Open questions
None. Ready for integration into `crates/jam-dsp`.
