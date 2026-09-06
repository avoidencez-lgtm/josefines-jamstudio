# V1 requirement-to-evidence ledger — 2026-09-06

Baseline `6b3a4c6fe07838a3f69dd5db4c497d0d39884584`. Read [observation/evidence](V1-BASELINE-2026-09-06.md), [inventory](V1-INVENTORY-2026-09-06.md), [queue](V1-QUEUE-2026-09-06.md) and [machine-readable source coverage](V1-SNAPSHOT-2026-09-06.json) together.

Each R row is a musician capability, with all governing clauses mapped by source units below. **Present** means the implementation path exists, not that its complete acceptance passed. **Partial** includes implemented paths with missing subfeatures. **Absent** means no product implementation; a spike/fixture is not a product. The source clauses remain binding even when the acceptance summary is shorter.

Verification common to every row: **source inspected**; baseline main CI passed its five jobs, including Windows/macOS headless suites and built-desktop smoke. This is aggregate suite evidence, not proof of every numerical target. Local frontend suite passed279 tests; native Rust tests/build were blocked by OS4551. Unless a row explicitly says otherwise, **native interactive, live-provider and physical acceptance are unverified**. No V1-00 native/paid/hardware pass is claimed. Individual code/test links show what was inspected, not a newly executed isolated test.

Every row inherits its owner/harness, independent reviewer, fallback and dependencies from its linked queue task; risk and external prerequisite are explicit below. PR evidence links resolve to the one inventory record and exact head/base/checks in the snapshot. If several tasks reference a row, all of their required acceptance contributes to closing it.

<a id="r01"></a>

## R01 — Build the locked desktop stack on Windows and macOS

**Implementation: present. Risk: medium.**

Governing sources: [U007](#u007), [U008](#u008), [U009](#u009), [U010](#u010), [U011](#u011), [U012](#u012), [U013](#u013), [U014](#u014), [U015](#u015), [U151](#u151), [U166](#u166), [U212](#u212), [U244](#u244), [U250](#u250), [U255](#u255), [U288](#u288).

Code: [Cargo.toml](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/Cargo.toml), [package.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/package.json), [src-tauri/tauri.conf.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tauri.conf.json), [.github/workflows/ci.yml](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/.github/workflows/ci.yml). Tests inspected: [tests/invariants/desktop-startup.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/desktop-startup.test.ts).

Current state / remaining work: Missing rust-toolchain.toml is an unreconciled scaffold detail, not a proven pin. Reconcile historical edition 2024/MSRV 1.85 scaffolding with governing AGENTS edition 2021/MSRV 1.88; do not recreate scaffold. Native install is R48.

Acceptance: Frozen JS install, lint/types/build/licenses; fmt/Clippy/workspace tests/deny, S4 probe and embedded 25-second smoke on both OSes.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GLM-5.3-Flash / ZCode**; reviewer: Opus 5 / Claude Code. Primary task: [T43](V1-QUEUE-2026-09-06.md#t43); dependencies: T42, T38.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r02"></a>

## R02 — Keep audio, time and keys native; protect the guitar path

**Implementation: partial. Risk: high.**

Governing sources: [U007](#u007), [U016](#u016), [U017](#u017), [U018](#u018), [U019](#u019), [U020](#u020), [U021](#u021), [U144](#u144), [U146](#u146), [U166](#u166), [U167](#u167), [U168](#u168), [U214](#u214), [U215](#u215), [U217](#u217), [U218](#u218), [U286](#u286).

Code: [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/engine.rs), [crates/jam-audio/src/io.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/io.rs), [src-tauri/src/net.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net.rs), [src-tauri/src/keys.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/keys.rs). Tests inspected: [tests/invariants/voice.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/voice.test.ts), [tests/jo/keychain.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/jo/keychain.test.ts).

Current state / remaining work: Preserve native playback and hardware tone. Audit existing input-monitor audition against governing no-monitor rule; no new monitoring/plugin host. Prove callback bounds and bundled-secret absence.

Acceptance: No callback allocation/lock/log/IPC; no WebView audio/key values; test event stream and bundle with a fake sentinel; headless networking denied.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Grok 4.6 / Grok Build**; reviewer: Astra / Codex. Primary task: [T41](V1-QUEUE-2026-09-06.md#t41); dependencies: T04.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r03"></a>

## R03 — Use 48 kHz internally at every device rate

**Implementation: partial. Risk: high.**

Governing sources: [U007](#u007), [U016](#u016), [U017](#u017), [U018](#u018), [U019](#u019), [U020](#u020), [U021](#u021), [U145](#u145), [U168](#u168), [U188](#u188), [U217](#u217), [U220](#u220), [U273](#u273).

Code: [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/engine.rs), [crates/jam-audio/src/io.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/io.rs), [crates/jam-audio/src/import.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/import.rs). Tests inspected: [crates/jam-audio/tests/input_rate.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/tests/input_rate.rs).

Current state / remaining work: Import resampling exists; engine reclocks timeline/recorder to effective device rate and rejects mismatched live input. Add device-edge conversion without changing the invariant.

Acceptance: 44.1/48/96 kHz input/output, mismatched pairs, drift/queue pressure, constant internal 48 kHz and consumed-output alignment; callback stays bounded.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer devices for independent rate/driver measurements.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T07](V1-QUEUE-2026-09-06.md#t07); dependencies: T06.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r04"></a>

## R04 — Select real input/output channels and recover device startup

**Implementation: partial. Risk: high.**

Governing sources: [U007](#u007), [U016](#u016), [U017](#u017), [U018](#u018), [U019](#u019), [U020](#u020), [U021](#u021), [U156](#u156), [U188](#u188), [U219](#u219), [U224](#u224).

Code: [crates/jam-audio/src/devices.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/devices.rs), [crates/jam-audio/src/io.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/io.rs), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/lib.rs). Tests inspected: [crates/jam-audio/tests/input_rate.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/tests/input_rate.rs).

Current state / remaining work: Enumerate/select/headless paths exist. Hung open and quiet DI fallback remain; assess #236. Capture developer four-channel/channel-3 evidence.

Acceptance: Bounded startup timeout, no joining hung open; explicit fallback/error; channel-3 signal preserved, headless no-device pass on both OSes.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer multichannel interface; personal HeadRush setup is V2.

Owner: **Grok 4.6 / Grok Build**; reviewer: Astra / Codex. Primary task: [T06](V1-QUEUE-2026-09-06.md#t06); dependencies: REVIEW.

Open-PR evidence: [#236](V1-INVENTORY-2026-09-06.md#pr-236).

<a id="r05"></a>

## R05 — Tune and meter quiet guitar reliably

**Implementation: partial. Risk: high.**

Governing sources: [U007](#u007), [U016](#u016), [U017](#u017), [U018](#u018), [U019](#u019), [U020](#u020), [U021](#u021), [U176](#u176), [U240](#u240), [U269](#u269), [U270](#u270).

Code: [crates/jam-dsp/src/pitch.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-dsp/src/pitch.rs), [crates/jam-dsp/src/level.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-dsp/src/level.rs), [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/engine.rs). Tests inspected: [tests/e2e/startup.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/e2e/startup.test.ts).

Current state / remaining work: MPM precision and meters exist. Evaluate #246 gate change; stationary sine tests do not establish plucked E2 decay/noise performance.

Acceptance: E2 82.4 Hz within ±3 cents, pitch confidence/noise refusal, peak/RMS accuracy, documented 20/30 Hz signals; audible 440 Hz/click demo.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer listening/output device.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T12](V1-QUEUE-2026-09-06.md#t12); dependencies: REVIEW.

Open-PR evidence: [#246](V1-INVENTORY-2026-09-06.md#pr-246).

<a id="r06"></a>

## R06 — Protect settings and credentials across restart

**Implementation: partial. Risk: high.**

Governing sources: [U007](#u007), [U022](#u022), [U023](#u023), [U024](#u024), [U025](#u025), [U026](#u026), [U027](#u027), [U028](#u028), [U147](#u147), [U203](#u203), [U235](#u235).

Code: [src-tauri/src/settings.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/settings.rs), [src-tauri/src/keys.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/keys.rs), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/lib.rs). Tests inspected: [src-tauri/tests/ipc_settings.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_settings.rs), [tests/jo/keychain.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/jo/keychain.test.ts).

Current state / remaining work: Keychain set/has/delete and recovery exist; settings range/version and nested unknown-field audits remain. UI never receives secrets.

Acceptance: Future schema refused without overwrite; unknown fields preserved; invalid ranges rejected; restart retains key; sentinel absent from logs/events.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: OS keychain for native restart check.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T03](V1-QUEUE-2026-09-06.md#t03); dependencies: REVIEW.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r07"></a>

## R07 — Keep take files authoritative when the cache fails

**Implementation: partial. Risk: high.**

Governing sources: [U007](#u007), [U025](#u025), [U026](#u026), [U027](#u027), [U028](#u028), [U149](#u149), [U170](#u170), [U235](#u235).

Code: [src-tauri/src/store.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/store.rs), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/lib.rs), [crates/jam-audio/src/recorder.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/recorder.rs). Tests inspected: [src-tauri/tests/ipc_takes.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_takes.rs).

Current state / remaining work: Corrupt-cache fallback exists. #223 addresses stale rows, busy timeout and capture-cache warnings; rebase and inspect all callers.

Acceptance: Delete only disposable cache, rebuild from manifests, external deletion removes ghosts, unreadable manifests stay visible, cache failure never loses saved WAV.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Grok 4.6 / Grok Build**; reviewer: Astra / Codex. Primary task: [T02](V1-QUEUE-2026-09-06.md#t02); dependencies: REVIEW.

Open-PR evidence: [#223](V1-INVENTORY-2026-09-06.md#pr-223).

<a id="r08"></a>

## R08 — Preserve versioned library data and unknown fields

**Implementation: partial. Risk: high.**

Governing sources: [U007](#u007), [U149](#u149), [U170](#u170), [U192](#u192), [U235](#u235).

Code: [crates/jam-core/src/chart.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-core/src/chart.rs), [crates/jam-core/src/style.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-core/src/style.rs), [src-tauri/src/library.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/library.rs), [crates/jam-core/src/json.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-core/src/json.rs). Tests inspected: [src-tauri/tests/ipc_library.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_library.rs).

Current state / remaining work: Main chart/style structs drop fields. #224 adds selected flatten maps; nested fields and TS save paths still need full round trips.

Acceptance: Future schema and corrupt file refused intact; nested chart sections/bars/arrangements and style patterns/feel extras survive load-edit-save; one migration per bump.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T03](V1-QUEUE-2026-09-06.md#t03); dependencies: REVIEW.

Open-PR evidence: [#224](V1-INVENTORY-2026-09-06.md#pr-224).

<a id="r09"></a>

## R09 — Prove extension registries rather than validate unused manifests

**Implementation: partial. Risk: high.**

Governing sources: [U001](#u001), [U007](#u007), [U029](#u029), [U030](#u030), [U031](#u031), [U155](#u155), [U164](#u164), [U177](#u177), [U181](#u181), [U182](#u182), [U183](#u183), [U184](#u184), [U185](#u185), [U186](#u186), [U196](#u196), [U202](#u202), [U238](#u238), [U242](#u242).

Code: [crates/jam-core/src/registry.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-core/src/registry.rs), [src/lib/jo/tools.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/tools.ts), [src/lib/jo/providers.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/providers.ts), [src/screens/registry.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/registry.ts). Tests inspected: [tests/invariants/seams.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/seams.test.ts), [crates/jam-core/tests/seams.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-core/tests/seams.rs).

Current state / remaining work: Bundled data and registries exist, but six fixture/no-core-edit proof is incomplete; controls manifest is not consumed and planned src/ai paths are stale.

Acceptance: Add synthetic style/chart/rig/control/tool/provider through real consumers with zero core edits; compare changed paths; execute every current recipe once.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T42](V1-QUEUE-2026-09-06.md#t42); dependencies: T03, T15b, T25, T30.

Open-PR evidence: [#252](V1-INVENTORY-2026-09-06.md#pr-252).

<a id="r10"></a>

## R10 — Maintain an additive, mirrored IPC contract

**Implementation: partial. Risk: high.**

Governing sources: [U007](#u007), [U022](#u022), [U023](#u023), [U024](#u024), [U029](#u029), [U030](#u030), [U031](#u031), [U155](#u155), [U164](#u164), [U168](#u168), [U191](#u191), [U225](#u225), [U226](#u226), [U227](#u227), [U242](#u242).

Code: [src/ipc/contract.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/ipc/contract.ts), [src/ipc/client.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/ipc/client.ts), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/lib.rs). Tests inspected: [tests/invariants/ipc.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/ipc.test.ts), [src-tauri/tests/ipc_e2e.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_e2e.rs).

Current state / remaining work: Current commands and mock-runtime scenarios exist; comprehensive Rust IPC_VERSION mirror and serialization proof need completion, not renamed parallel domains.

Acceptance: Serialize representative request/event/response including optional/unknown fields in Rust and validate TS; breaking change requires version/ADR.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T42](V1-QUEUE-2026-09-06.md#t42); dependencies: T03, T15b, T25, T30.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r11"></a>

## R11 — Drive click, count-in, loops and next-bar changes from one clock

**Implementation: partial. Risk: high.**

Governing sources: [U034](#u034), [U035](#u035), [U036](#u036), [U037](#u037), [U038](#u038), [U039](#u039), [U040](#u040), [U041](#u041), [U145](#u145), [U220](#u220), [U240](#u240), [U276](#u276), [U277](#u277).

Code: [crates/jam-core/src/timeline.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-core/src/timeline.rs), [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/engine.rs). Tests inspected: [src-tauri/tests/ipc_transport.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_transport.rs).

Current state / remaining work: Extensive timeline/engine tests exist. Certify full random-map/count-in/demo tolerance at fixed rate after T07; no UI timer becomes a clock.

Acceptance: 10,000 random three-tempo round trips <1e-9 beats; four-bar 120 bpm loop ±1 sample; next-bar change exact; count-in frames equal beats×48000×60/BPM.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T08](V1-QUEUE-2026-09-06.md#t08); dependencies: T07.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r12"></a>

## R12 — Download and verify real licensed instrument packs

**Implementation: absent. Risk: high.**

Governing sources: [U042](#u042), [U043](#u043), [U044](#u044), [U045](#u045), [U046](#u046), [U047](#u047), [U048](#u048), [U049](#u049), [U050](#u050), [U051](#u051), [U149](#u149), [U150](#u150), [U152](#u152), [U171](#u171), [U287](#u287).

Code: [assets/manifest.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/assets/manifest.json), [assets/LICENSES.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/assets/LICENSES.md). Tests inspected: [crates/jam-band/tests/golden.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/tests/golden.rs).

Current state / remaining work: Manifest standard-rock-kit has empty-file SHA e3b0c442…b855, 1024-byte placeholder and no published asset; no assets_ensure downloader. Audit pack before any release.

Acceptance: Provenance/license, real size/SHA, bounded extraction, resume/interruption recovery, checksum rejection; Settings/Stage missing/download/error/retry states on both OSes.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Permissive kit/SoundFont redistribution provenance; explicit asset-publication authority.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T16](V1-QUEUE-2026-09-06.md#t16); dependencies: T01.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r13"></a>

## R13 — Play multisampled drums with musical articulation

**Implementation: partial. Risk: high.**

Governing sources: [U042](#u042), [U043](#u043), [U044](#u044), [U045](#u045), [U046](#u046), [U047](#u047), [U048](#u048), [U049](#u049), [U050](#u050), [U051](#u051), [U150](#u150), [U157](#u157), [U187](#u187).

Code: [crates/jam-band/src/sampler.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/src/sampler.rs), [crates/jam-band/src/instruments.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/src/instruments.rs). Tests inspected: [crates/jam-band/tests/golden.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/tests/golden.rs).

Current state / remaining work: Sampler primitives exist; shipped synthetic substitutes do not establish real layers, round robin, choke groups and release fades. Wire audited kit.

Acceptance: Known velocity-layer/round-robin/choke fixtures; no open-hat tail after close; bounded polyphony and documented listening renders.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Audited pack from T16; developer listening.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T17](V1-QUEUE-2026-09-06.md#t17); dependencies: T16.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r14"></a>

## R14 — Play real bass and comp instruments

**Implementation: partial. Risk: high.**

Governing sources: [U052](#u052), [U053](#u053), [U054](#u054), [U055](#u055), [U056](#u056), [U057](#u057), [U058](#u058), [U059](#u059), [U060](#u060), [U061](#u061), [U150](#u150), [U157](#u157), [U187](#u187).

Code: [crates/jam-band/src/instruments.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/src/instruments.rs), [crates/jam-band/src/voicing.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/src/voicing.rs), [crates/jam-band/src/sequencer.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/src/sequencer.rs). Tests inspected: [crates/jam-band/tests/golden.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/tests/golden.rs).

Current state / remaining work: Sf2Synth is sine/harmonic synthesis, not SoundFont playback. Reuse Instrument seam, implement accepted real instrument path with permissive library/assets.

Acceptance: Bass E1–G3 and comp C3–C6, no voice crossing, roots/approach notes/strum timing; compare licensed instrument renders and clear setup errors.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Audited SoundFont and developer listening.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T18](V1-QUEUE-2026-09-06.md#t18); dependencies: T16, T17.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r15"></a>

## R15 — Schedule six styles, fills, endings and MIDI without lost notes

**Implementation: partial. Risk: high.**

Governing sources: [U042](#u042), [U043](#u043), [U044](#u044), [U045](#u045), [U046](#u046), [U047](#u047), [U048](#u048), [U049](#u049), [U050](#u050), [U051](#u051), [U052](#u052), [U053](#u053), [U054](#u054), [U055](#u055), [U056](#u056), [U057](#u057), [U058](#u058), [U059](#u059), [U060](#u060), [U061](#u061), [U157](#u157), [U181](#u181), [U240](#u240), [U241](#u241).

Code: [crates/jam-band/src/sequencer.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/src/sequencer.rs), [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/engine.rs), [styles](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/styles). Tests inspected: [crates/jam-band/tests/golden.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/tests/golden.rs).

Current state / remaining work: Six styles/three tiers exist; #228 MIDI boundary cuts and #245 signed jitter need repair together. Synthetic repeatability is not onset/RMS golden acceptance.

Acceptance: Six styles, 40–240 bpm, keys/meters; seed42 eight bars100bpm onset±1 sample/RMS±0.05dB/exact frames; cue MIDI and note-offs match audio across block/bar/wrap/stop.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T09](V1-QUEUE-2026-09-06.md#t09); dependencies: T08.

Open-PR evidence: [#228](V1-INVENTORY-2026-09-06.md#pr-228), [#245](V1-INVENTORY-2026-09-06.md#pr-245).

<a id="r16"></a>

## R16 — Parse, transpose and play chart presets in every key

**Implementation: partial. Risk: high.**

Governing sources: [U052](#u052), [U053](#u053), [U054](#u054), [U055](#u055), [U056](#u056), [U057](#u057), [U058](#u058), [U059](#u059), [U060](#u060), [U061](#u061), [U157](#u157), [U182](#u182).

Code: [src/lib/chart/text.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/chart/text.ts), [src/lib/chart/transpose.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/chart/transpose.ts), [crates/jam-core/src/chart.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-core/src/chart.rs), [charts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/charts). Tests inspected: [tests/chart/text.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/chart/text.test.ts).

Current state / remaining work: Current text parser/arrangement exist. #237 bounds/zero repeat compatibility and #238 CM/sus2 fix are bounded candidates; retain native meter validation.

Acceptance: All presets all 12 keys; slash/%/xN forms; no empty A7 default; checked loop arithmetic; invalid meter rejected; nextChord correct each bar.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T11](V1-QUEUE-2026-09-06.md#t11); dependencies: T03.

Open-PR evidence: [#235](V1-INVENTORY-2026-09-06.md#pr-235), [#237](V1-INVENTORY-2026-09-06.md#pr-237), [#238](V1-INVENTORY-2026-09-06.md#pr-238).

<a id="r17"></a>

## R17 — Follow energy and apply intentional changes at the next bar

**Implementation: partial. Risk: high.**

Governing sources: [U062](#u062), [U063](#u063), [U064](#u064), [U065](#u065), [U066](#u066), [U067](#u067), [U068](#u068), [U069](#u069), [U157](#u157).

Code: [crates/jam-dsp/src/energy.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-dsp/src/energy.rs), [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/engine.rs), [src/screens/Stage.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Stage.tsx). Tests inspected: [crates/jam-band/tests/golden.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/tests/golden.rs).

Current state / remaining work: Main follow-energy updates pattern per block. #234 defers change but queued auto-change survives toggle-off. Preserve explicit user priority.

Acceptance: 300 ms attack/1.5s release, hysteresis, fixture intensity rises≤2s; no mid-bar tier flip, no repeated clone/xrun, disabling cancels only automatic pending changes.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T10](V1-QUEUE-2026-09-06.md#t10); dependencies: T08.

Open-PR evidence: [#234](V1-INVENTORY-2026-09-06.md#pr-234).

<a id="r18"></a>

## R18 — Control Stage by keyboard, pedals and Jo through consumed maps

**Implementation: partial. Risk: high.**

Governing sources: [U029](#u029), [U030](#u030), [U031](#u031), [U034](#u034), [U035](#u035), [U036](#u036), [U037](#u037), [U038](#u038), [U039](#u039), [U040](#u040), [U041](#u041), [U062](#u062), [U063](#u063), [U064](#u064), [U065](#u065), [U066](#u066), [U067](#u067), [U068](#u068), [U069](#u069), [U157](#u157), [U184](#u184).

Code: [src/lib/controller.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/controller.ts), [src/lib/shortcuts.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/shortcuts.ts), [src-tauri/src/controller.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/controller.rs), [controls](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/controls). Tests inspected: [tests/jo/reference-ramp.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/jo/reference-ramp.test.ts).

Current state / remaining work: Learned controller registry works; controls/default.json/consumer missing. #252 only documents unused seam. Finish bindings validation and complete shortcuts.

Acceptance: Every Stage action has discoverable shortcut, invalid bindings rejected, user overrides consumed; PC/CC/note duplicate filtering; input fields protected; actual native action/error.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Gemini 3.8 Flash High / Antigravity**; reviewer: Opus 5 / Claude Code. Primary task: [T30](V1-QUEUE-2026-09-06.md#t30); dependencies: T08, T27.

Open-PR evidence: [#252](V1-INVENTORY-2026-09-06.md#pr-252), [#260](V1-INVENTORY-2026-09-06.md#pr-260), [#278](V1-INVENTORY-2026-09-06.md#pr-278).

<a id="r19"></a>

## R19 — Calibrate recorder offset without risking saved work

**Implementation: partial. Risk: high.**

Governing sources: [U070](#u070), [U071](#u071), [U072](#u072), [U073](#u073), [U074](#u074), [U075](#u075), [U076](#u076), [U077](#u077), [U078](#u078), [U156](#u156), [U221](#u221), [U279](#u279).

Code: [crates/jam-audio/src/recorder.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/recorder.rs), [src/screens/Sessions.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Sessions.tsx), [src-tauri/src/settings.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/settings.rs). Tests inspected: [src-tauri/tests/ipc_settings.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_settings.rs).

Current state / remaining work: Main has manual offset only. Preserve #274; candidate three-click measurement/profile path needs baseline rebase review and developer cable evidence, no merge here. Nominal latency unavailable is explicit estimate limitation.

Acceptance: Impulse/click recording±1 sample; estimates never overwrite measurement; device/channel/rate/buffer restore; noise/clipping/dropout refusal; five physical runs stable±2 samples.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer loopback cable/interface; physical gate remains unverified.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T13](V1-QUEUE-2026-09-06.md#t13); dependencies: T07.

Open-PR evidence: [#274](V1-INVENTORY-2026-09-06.md#pr-274).

<a id="r20"></a>

## R20 — Save sample-aligned takes and recover crash/disk failure

**Implementation: partial. Risk: high.**

Governing sources: [U070](#u070), [U071](#u071), [U072](#u072), [U073](#u073), [U074](#u074), [U075](#u075), [U076](#u076), [U077](#u077), [U078](#u078), [U162](#u162), [U170](#u170), [U218](#u218), [U235](#u235), [U256](#u256), [U279](#u279).

Code: [crates/jam-audio/src/recorder.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/recorder.rs), [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/engine.rs), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/lib.rs). Tests inspected: [tests/sessions/recording-error.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/sessions/recording-error.test.ts), [src-tauri/tests/ipc_takes.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_takes.rs).

Current state / remaining work: Consumed-output capture and partial-save error UI exist. Audit track list (DI/amp/mic/all buses), ten-second manifest checkpoints, disk-full/permission and abrupt termination recovery.

Acceptance: 60-second stems equal length to sample; ±1sample input alignment target; crash recovery ≤10s metadata checkpoint; blocked disk emits actionable path and preserves partial WAV/MIDI.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T14](V1-QUEUE-2026-09-06.md#t14); dependencies: T13.

Open-PR evidence: [#274](V1-INVENTORY-2026-09-06.md#pr-274).

<a id="r21"></a>

## R21 — Browse, replay, rate and annotate takes

**Implementation: partial. Risk: medium.**

Governing sources: [U070](#u070), [U071](#u071), [U072](#u072), [U073](#u073), [U074](#u074), [U075](#u075), [U076](#u076), [U077](#u077), [U078](#u078).

Code: [src/screens/Sessions.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Sessions.tsx), [src/lib/sessions/stats.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/sessions/stats.ts), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/lib.rs). Tests inspected: [tests/e2e/sessions.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/e2e/sessions.test.ts).

Current state / remaining work: List/peaks/play/favourite exist; complete persistent notes/rating and truthful durations. #240 duration correction reusable independently of numeric defects.

Acceptance: Native list/peaks/play/delete in disposable folder; restart retains rating/notes; 59m50s/1h59m50s labels carry correctly; missing-file feedback.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Gemini 3.8 Flash High / Antigravity**; reviewer: Opus 5 / Claude Code. Primary task: [T35](V1-QUEUE-2026-09-06.md#t35); dependencies: T02, T14.

Open-PR evidence: [#240](V1-INVENTORY-2026-09-06.md#pr-240).

<a id="r22"></a>

## R22 — Capture bounded PTT from button, global key and learned MIDI

**Implementation: present. Risk: high.**

Governing sources: [U079](#u079), [U080](#u080), [U081](#u081), [U082](#u082), [U083](#u083), [U084](#u084), [U085](#u085), [U086](#u086), [U087](#u087), [U088](#u088), [U089](#u089), [U090](#u090), [U091](#u091), [U205](#u205), [U213](#u213), [U223](#u223), [U231](#u231).

Code: [src-tauri/src/voice.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/voice.rs), [src-tauri/src/platform/voice_shortcut.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/platform/voice_shortcut.rs), [src/lib/jo/voice.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/voice.ts), [src-tauri/src/net/voice.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net/voice.rs). Tests inspected: [tests/invariants/voice.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/voice.test.ts).

Current state / remaining work: Native path exists, opt-in shortcut and toggle pedal; selected-rate upload/TTS24k→engine conversion differs from old 16k/48 kHz target. Validate actual supported wire contract, not rebuild VoiceSession.

Acceptance: 20 s bound, source/channel/downmix fixture, key-repeat coalescing, barge-in/cancel, no implicit listening on restart; recording/close transitions.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Headset/global key/MIDI native demo.

Owner: **Opus 5 / Claude Code / claude-opus-5**; reviewer: Astra / Codex. Primary task: [T28](V1-QUEUE-2026-09-06.md#t28); dependencies: T01, T07, T27.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r23"></a>

## R23 — Ground Jo actions in validated intent and applied state

**Implementation: partial. Risk: high.**

Governing sources: [U079](#u079), [U080](#u080), [U081](#u081), [U082](#u082), [U083](#u083), [U084](#u084), [U085](#u085), [U086](#u086), [U087](#u087), [U088](#u088), [U089](#u089), [U090](#u090), [U091](#u091), [U158](#u158), [U185](#u185), [U228](#u228), [U230](#u230).

Code: [src/lib/jo/intent.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/intent.ts), [src/lib/jo/dispatcher.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/dispatcher.ts), [src/lib/jo/conversation.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/conversation.ts), [src/lib/jo/tools.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/tools.ts). Tests inspected: [tests/jo/dispatcher.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/jo/dispatcher.test.ts), [tests/jo/conversation.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/jo/conversation.test.ts).

Current state / remaining work: Provider fallback no longer blindly executes; #247 still misreads stop straight away; #260/#264 modern reference/song branches overlap. Complete 30 recorded utterances, ambiguity/negation/cancel and applied-state replies.

Acceptance: ≥27/30 exact intended actions; no stale action after cancel; no action on negation/ambiguity; EN/NB songs/ramps/rig/controlmap share dispatcher; no invented success.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Recorded scrubbed provider fixtures; live spend authority only for later capture.

Owner: **Opus 5 / Claude Code / claude-opus-5**; reviewer: Astra / Codex. Primary task: [T27](V1-QUEUE-2026-09-06.md#t27); dependencies: T08, T05b.

Open-PR evidence: [#247](V1-INVENTORY-2026-09-06.md#pr-247), [#260](V1-INVENTORY-2026-09-06.md#pr-260), [#264](V1-INVENTORY-2026-09-06.md#pr-264).

<a id="r24"></a>

## R24 — Speak quickly and duck/recover the band smoothly

**Implementation: partial. Risk: high.**

Governing sources: [U079](#u079), [U080](#u080), [U081](#u081), [U082](#u082), [U083](#u083), [U084](#u084), [U085](#u085), [U086](#u086), [U087](#u087), [U088](#u088), [U089](#u089), [U090](#u090), [U091](#u091), [U158](#u158), [U205](#u205), [U213](#u213), [U231](#u231).

Code: [crates/jam-audio/src/voice.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/voice.rs), [src-tauri/src/net/voice.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net/voice.rs), [src/lib/jo/voice.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/voice.ts). Tests inspected: [tests/invariants/voice.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/voice.test.ts).

Current state / remaining work: STT/TTS and voice bus exist; synthetic fixtures do not prove ten-turn headset latency or recorded voice/model availability.

Acceptance: Default−9dB duck over150 ms; recover≤300 ms; median≤2.5s PTTrelease→firstaudio across10turns; log each turn, audio not requests/keys.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: ElevenLabs account/key/authorized spend, headset, developer listening.

Owner: **Opus 5 / Claude Code / claude-opus-5**; reviewer: Astra / Codex. Primary task: [T28](V1-QUEUE-2026-09-06.md#t28); dependencies: T01, T07, T27.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r25"></a>

## R25 — Track provider cost and cancellation honestly

**Implementation: partial. Risk: high.**

Governing sources: [U079](#u079), [U080](#u080), [U081](#u081), [U082](#u082), [U083](#u083), [U084](#u084), [U085](#u085), [U086](#u086), [U087](#u087), [U088](#u088), [U089](#u089), [U090](#u090), [U091](#u091), [U148](#u148), [U169](#u169), [U186](#u186), [U196](#u196), [U206](#u206), [U228](#u228), [U229](#u229), [U251](#u251), [U258](#u258), [U287](#u287).

Code: [src-tauri/src/net.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net.rs), [src-tauri/src/net/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net/media.rs), [src-tauri/src/net/voice.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net/voice.rs), [src/lib/jo/providers.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/providers.ts). Tests inspected: [tests/invariants/providers.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/providers.test.ts), [src-tauri/tests/ipc_voice.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_voice.rs).

Current state / remaining work: Voice usage receipts and media log exist; #232 drops pending paid request before cost append; media/agent totals and log rotation remain. Unknown spend is not zero.

Acceptance: Cancel returns promptly, request state idle, temp cleaned, saved asset intact; log attempted/unknown/known usage without payloads; limits/confirmation block requests before send.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Provider prices/protocol checked by T01; no paid call during V1-00.

Owner: **Grok 4.6 / Grok Build**; reviewer: Astra / Codex. Primary task: [T04](V1-QUEUE-2026-09-06.md#t04); dependencies: T01.

Open-PR evidence: [#232](V1-INVENTORY-2026-09-06.md#pr-232).

<a id="r26"></a>

## R26 — Import supported formats into durable canonical songs

**Implementation: present. Risk: high.**

Governing sources: [U092](#u092), [U093](#u093), [U094](#u094), [U095](#u095), [U096](#u096), [U097](#u097), [U098](#u098), [U099](#u099), [U100](#u100), [U159](#u159), [U175](#u175), [U210](#u210), [U211](#u211), [U235](#u235), [U236](#u236), [U237](#u237).

Code: [crates/jam-audio/src/import.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/import.rs), [src-tauri/src/media/songs.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/media/songs.rs), [src-tauri/src/platform/song_dialog.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/platform/song_dialog.rs), [src/lib/media.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/media.ts). Tests inspected: [src-tauri/tests/ipc_rig_media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_rig_media.rs), [tests/invariants/practice-copy.test.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/practice-copy.test.tsx).

Current state / remaining work: Native Symphonia/Rubato/dialog/drop and canonical source.wav/song.json exist. Preserve sourceHash, originals and migration; complex/protected M4A refusal is documented. Finish codec/native acceptance rather than rebuild.

Acceptance: WAV/MP3/FLAC/M4A/AIFF; duration/phase/resample/priming bounds; malformed input cancellation, stale hash/future canonical refusal, unknown fields/relative paths across restart.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T21](V1-QUEUE-2026-09-06.md#t21); dependencies: T03.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r27"></a>

## R27 — Separate and mix stems with measured guitar reduction

**Implementation: partial. Risk: high.**

Governing sources: [U092](#u092), [U093](#u093), [U094](#u094), [U095](#u095), [U096](#u096), [U097](#u097), [U098](#u098), [U099](#u099), [U100](#u100), [U159](#u159), [U209](#u209), [U263](#u263).

Code: [src-tauri/src/media/stems.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/media/stems.rs), [src-tauri/src/net/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net/media.rs), [crates/jam-audio/src/song.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/song.rs). Tests inspected: [src-tauri/tests/ipc_rig_media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_rig_media.rs).

Current state / remaining work: ElevenLabs separation/ZIP and native per-stem mixing exist with explicit upload consent; fixtures synthetic, no known-stem residual acceptance.

Acceptance: Recorded scrubbed response/ZIP tests offline; archive size/path/checksum bounds; minus-guitar residual≤−6dB on known mix plus backing-damage listening; mute/gain persists.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Licensed isolated-stem corpus; ElevenLabs account and separately authorized fixture capture.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T22](V1-QUEUE-2026-09-06.md#t22); dependencies: T01, T21.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r28"></a>

## R28 — Automatically analyse beats, downbeats, chords, key and sections

**Implementation: partial. Risk: high.**

Governing sources: [U092](#u092), [U093](#u093), [U094](#u094), [U095](#u095), [U096](#u096), [U097](#u097), [U098](#u098), [U099](#u099), [U100](#u100), [U159](#u159), [U169](#u169), [U175](#u175), [U180](#u180), [U189](#u189), [U234](#u234), [U261](#u261), [U271](#u271), [U272](#u272).

Code: [src-tauri/src/media/analysis.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/media/analysis.rs), [src-tauri/src/media/grid.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/media/grid.rs), [crates/jam-dsp/src/offline.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-dsp/src/offline.rs), [src/lib/songAnalysis.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/songAnalysis.ts). Tests inspected: [tests/invariants/song-analysis.test.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/song-analysis.test.tsx).

Current state / remaining work: Low-confidence local tempo/chroma/key and manual confirmed sections exist; Music.ai workflows/recorded fixtures, automatic downbeats/sections and richer provenance/tempoMap/chart remain.

Acceptance: Known C–F–G90 fixture ≥90% beat-chord agreement and tempo±1bpm; recorded provider responses, confidence/manual correction, cancel/restart, analysis[] provider/cost/version/sourceHash saved.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Verified Music.ai workflow contract, account/authorization for recorded fixtures.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T23](V1-QUEUE-2026-09-06.md#t23); dependencies: T08, T20, T22.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r29"></a>

## R29 — Hear accurate reference timing, speed, pitch and loops

**Implementation: partial. Risk: high.**

Governing sources: [U092](#u092), [U093](#u093), [U094](#u094), [U095](#u095), [U096](#u096), [U097](#u097), [U098](#u098), [U099](#u099), [U100](#u100), [U159](#u159), [U207](#u207), [U208](#u208), [U222](#u222), [U259](#u259), [U260](#u260), [U262](#u262), [U264](#u264), [U265](#u265), [U268](#u268), [U274](#u274), [U275](#u275).

Code: [crates/jam-audio/src/song.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/song.rs), [crates/jam-audio/src/song/grid.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/song/grid.rs), [crates/jam-dsp/src/stretch.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-dsp/src/stretch.rs). Tests inspected: [src-tauri/tests/ipc_rig_media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_rig_media.rs).

Current state / remaining work: 50–150%, ±12 semitones, stems, source-second cursor, manual grids already implemented. #255 stale source repair has direct-clear hole; #272 heard settings, #276 truthful clock error, #278 brackets are candidates.

Acceptance: Length±1ms, pitch±5c; chord readout±100ms to grid; section wraps downbeat, consumed cursor within source frame; source switch cannot leak old audio or silence new chart.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer 50%/+2 listening and zero-dropout device run.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T08](V1-QUEUE-2026-09-06.md#t08); dependencies: T07.

Open-PR evidence: [#255](V1-INVENTORY-2026-09-06.md#pr-255), [#272](V1-INVENTORY-2026-09-06.md#pr-272), [#276](V1-INVENTORY-2026-09-06.md#pr-276), [#278](V1-INVENTORY-2026-09-06.md#pr-278).

<a id="r30"></a>

## R30 — Practice ramps and export follow what was actually heard

**Implementation: partial. Risk: high.**

Governing sources: [U092](#u092), [U093](#u093), [U094](#u094), [U095](#u095), [U096](#u096), [U097](#u097), [U098](#u098), [U099](#u099), [U100](#u100), [U179](#u179), [U264](#u264).

Code: [crates/jam-audio/src/song/ramp.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/song/ramp.rs), [crates/jam-audio/src/reference_timing.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/reference_timing.rs), [src/lib/referenceRamp.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/referenceRamp.ts). Tests inspected: [tests/jo/reference-ramp.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/jo/reference-ramp.test.ts).

Current state / remaining work: Ramp and recorded tempo spans now exist; old manual still says DAW map missing. #269 fixes Stop in late-section loop; grid integration with band/rig remains separate.

Acceptance: Complete bars only, partial-start/loop/stop/seek/pause; target clamp; recorded snapshots and consumed tempo spans agree; existing ≤3-output-sample ramp boundary test retained.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T08](V1-QUEUE-2026-09-06.md#t08); dependencies: T07.

Open-PR evidence: [#269](V1-INVENTORY-2026-09-06.md#pr-269), [#272](V1-INVENTORY-2026-09-06.md#pr-272).

<a id="r31"></a>

## R31 — Run Lyria streaming on the existing AI bus

**Implementation: absent. Risk: high.**

Governing sources: [U101](#u101), [U102](#u102), [U103](#u103), [U104](#u104), [U105](#u105), [U106](#u106), [U107](#u107), [U108](#u108), [U109](#u109), [U154](#u154), [U160](#u160), [U169](#u169), [U175](#u175), [U232](#u232).

Code: [scripts/spikes/lyria-ws/src/main.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/scripts/spikes/lyria-ws/src/main.rs), [docs/spikes/S4-lyria-ws.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/spikes/S4-lyria-ws.md), [src-tauri/src/net.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net.rs). Tests inspected: [scripts/spikes/lyria-ws/src/main.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/scripts/spikes/lyria-ws/src/main.rs).

Current state / remaining work: Standalone synthetic probe is not application adapter. Resolve endpoint/version/rate/session cap; build setup/controls/decode/session lifecycle in Rust only.

Acceptance: Transcript ordering/auth refusal, weighted prompts/config/play/pause/stop/reset; 1s prefill/500 ms target, underrun250 msfade, reconnect250 mscrossfade; Band/Lyria exclusive, requested BPM not chart time.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Verified Lyria account/model/format/cap and recorded fixture.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T24](V1-QUEUE-2026-09-06.md#t24); dependencies: T01, T07.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r32"></a>

## R32 — Steer streaming music with cost bounds and measured continuity

**Implementation: absent. Risk: high.**

Governing sources: [U101](#u101), [U102](#u102), [U103](#u103), [U104](#u104), [U105](#u105), [U106](#u106), [U107](#u107), [U108](#u108), [U109](#u109), [U154](#u154), [U160](#u160), [U232](#u232).

Code: [src/screens/Stage.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Stage.tsx), [src/lib/jo/tools.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/tools.ts), [src-tauri/src/net.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net.rs). Tests inspected: [tests/jo/dispatcher.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/jo/dispatcher.test.ts).

Current state / remaining work: No product Lyria controls/spend enforcement. Add prompt weights/density/brightness/mutes and Jo actions to existing paths after T24.

Acceptance: Confirm per-minute/monthly caps before start; BPM/scale change count-in+reset without click; 10 min with reconnect and ≤1 audible gap<300 ms, buffer statistics and listening; stop cannot restart.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Authorized paid10 min live session, developer listening.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T25](V1-QUEUE-2026-09-06.md#t25); dependencies: T24.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r33"></a>

## R33 — Generate a track and open it analysed in Songs

**Implementation: partial. Risk: high.**

Governing sources: [U101](#u101), [U102](#u102), [U103](#u103), [U104](#u104), [U105](#u105), [U106](#u106), [U107](#u107), [U108](#u108), [U109](#u109), [U160](#u160), [U169](#u169), [U198](#u198), [U233](#u233).

Code: [src-tauri/src/net/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net/media.rs), [src-tauri/src/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/media.rs), [src/lib/media.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/media.ts). Tests inspected: [tests/invariants/generated-audio.test.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/generated-audio.test.tsx), [src-tauri/tests/ipc_rig_media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_rig_media.rs).

Current state / remaining work: Generation/catalog/canonical saves exist; live model IDs and exact recorded shapes unverified; ensure success triggers complete T23 analysis and actual load.

Acceptance: Offline recorded generation→source/song.json→analysis→Songmode; progress/cancel/retry/cost; original preserved; explicit not-configured if unavailable.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Provider/model availability and separately authorized recorded fixture.

Owner: **Fable 5.1 / Claude Code / claude-fable-5-1**; reviewer: Astra / Codex. Primary task: [T26](V1-QUEUE-2026-09-06.md#t26); dependencies: T20, T21.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r34"></a>

## R34 — Send rig scenes, learn controls and monitor real bytes

**Implementation: partial. Risk: high.**

Governing sources: [U110](#u110), [U111](#u111), [U112](#u112), [U113](#u113), [U114](#u114), [U115](#u115), [U116](#u116), [U117](#u117), [U118](#u118), [U161](#u161), [U183](#u183).

Code: [crates/jam-rig/src/profiles.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-rig/src/profiles.rs), [crates/jam-rig/src/orchestrator.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-rig/src/orchestrator.rs), [src/lib/controller.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/controller.ts), [src/screens/Rig.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Rig.tsx). Tests inspected: [src-tauri/tests/ipc_rig_media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_rig_media.rs).

Current state / remaining work: Profiles/scenes/PC/CC, learned input, monitor and MemorySink no-port logging exist. Audit official Black Spirit map and distinguish existing dry logging from full clock UI.

Acceptance: Validated profile/clamps/PC0–127, learn and port persistence, no duplicate/echo action; scene editor/send-now and actual virtual-port bytes.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Official hardware manual; loopMIDI/developer virtual port; personal rig V2.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T15](V1-QUEUE-2026-09-06.md#t15); dependencies: T08.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r35"></a>

## R35 — Schedule rig changes and MIDI clock from the timeline

**Implementation: absent. Risk: high.**

Governing sources: [U110](#u110), [U111](#u111), [U112](#u112), [U113](#u113), [U114](#u114), [U115](#u115), [U116](#u116), [U117](#u117), [U118](#u118), [U161](#u161), [U278](#u278).

Code: [crates/jam-rig/src/orchestrator.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-rig/src/orchestrator.rs), [crates/jam-rig/src/midi.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-rig/src/midi.rs), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/lib.rs). Tests inspected: [src-tauri/tests/ipc_rig_media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_rig_media.rs).

Current state / remaining work: on_section_change runs from telemetry after change, not dedicated 50 ms lookahead. Implement section bindings for songs, clock24 ppqn/start/stop/continue and panic.

Acceptance: MemorySink bytes±1ms at boundary−50 ms; tick spacing60–240bpm; pause/seek/loop/ramp; panic all-notes-off/reset controllers; virtual port agrees; no callback I/O.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: loopMIDI/virtual MIDI installation permission if missing.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T15](V1-QUEUE-2026-09-06.md#t15); dependencies: T08.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r36"></a>

## R36 — Measure takes without inventing musical scores

**Implementation: partial. Risk: high.**

Governing sources: [U119](#u119), [U120](#u120), [U121](#u121), [U122](#u122), [U123](#u123), [U124](#u124), [U125](#u125), [U126](#u126), [U176](#u176), [U189](#u189), [U235](#u235), [U240](#u240), [U257](#u257), [U271](#u271), [U272](#u272).

Code: [crates/jam-audio/src/analysis.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/analysis.rs), [src/lib/sessions/analysis.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/sessions/analysis.ts), [src/lib/sessions/stats.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/sessions/stats.ts). Tests inspected: [tests/sessions/analysis.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/sessions/analysis.test.ts).

Current state / remaining work: Null evidence and analyzer-v2 persistence exist. Quarter-note-from-file0 timing and no bend exclusion/chord agreement remain. Use recorded tempo/latency metadata, not fixed-grid assumptions.

Acceptance: Timing±2ms/pitch±3c for valid fixture notes; bend/vibrato excluded; swing/offbeat intent not error; chord agreement/confidence; silence/short/low confidence→unknown.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Opus 5 / Claude Code / claude-opus-5**; reviewer: Astra / Codex. Primary task: [T31](V1-QUEUE-2026-09-06.md#t31); dependencies: T12, T14.

Open-PR evidence: [#246](V1-INVENTORY-2026-09-06.md#pr-246).

<a id="r37"></a>

## R37 — Give structured coaching grounded in measured evidence

**Implementation: partial. Risk: high.**

Governing sources: [U119](#u119), [U120](#u120), [U121](#u121), [U122](#u122), [U123](#u123), [U124](#u124), [U125](#u125), [U126](#u126).

Code: [src/lib/sessions/stats.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/sessions/stats.ts), [src/lib/jo/tools.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/tools.ts), [src/screens/Sessions.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Sessions.tsx). Tests inspected: [tests/sessions/stats.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/sessions/stats.test.ts).

Current state / remaining work: Current Evidence & exercise is deterministic local text, not stored LLM summary/strengths/drills/focus bars. Reuse validated analysis and provider proxy.

Acceptance: Recorded structured response cites actual measured bars/coverage, rejects invented values and unavailable evidence; session.review persists; Jo coach_tip reads it; failed review preserves take.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Recorded scrubbed review fixture; live generation requires separate authority.

Owner: **Opus 5 / Claude Code / claude-opus-5**; reviewer: Astra / Codex. Primary task: [T32](V1-QUEUE-2026-09-06.md#t32); dependencies: T31.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r38"></a>

## R38 — Show practice progress across the last twenty takes

**Implementation: partial. Risk: medium.**

Governing sources: [U119](#u119), [U120](#u120), [U121](#u121), [U122](#u122), [U123](#u123), [U124](#u124), [U125](#u125), [U126](#u126).

Code: [src/lib/sessions/stats.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/sessions/stats.ts), [src/screens/Sessions.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Sessions.tsx). Tests inspected: [tests/sessions/stats.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/sessions/stats.test.ts).

Current state / remaining work: Streak/time summary exists; sessions/week, chart-tempo records and last20 timing/pitch trends incomplete.

Acceptance: Known 20+ take fixture ordered by time, chart/rate/version comparable groups, missing data labelled, session/week/minutes and tempo records correct; no fabricated trend.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Opus 5 / Claude Code / claude-opus-5**; reviewer: Astra / Codex. Primary task: [T33](V1-QUEUE-2026-09-06.md#t33); dependencies: T31.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r39"></a>

## R39 — Export stems, actual MIDI, tempo and markers to Logic/REAPER

**Implementation: partial. Risk: high.**

Governing sources: [U119](#u119), [U120](#u120), [U121](#u121), [U122](#u122), [U123](#u123), [U124](#u124), [U125](#u125), [U126](#u126), [U162](#u162), [U178](#u178), [U195](#u195), [U266](#u266), [U267](#u267).

Code: [crates/jam-audio/src/export.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/export.rs), [crates/jam-audio/src/reference_timing.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/reference_timing.rs). Tests inspected: [tests/reaper-import.lua](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/reaper-import.lua), [src-tauri/tests/ipc_takes.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_takes.rs).

Current state / remaining work: SMF reparse, tempo validation, recorded reference maps and REAPER helper now exist. #235 saturating export conflicts with stricter main rejection. Cue/wrap MIDI T09 and track completeness T14 remain.

Acceptance: 24-bit48 kHz WAV bar1; <1ms drift5 min including ramps/loops/partial start; three-tempo SMFreparse; meter/section/user/chord markers, README/folder layout; five-minute export<10s.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer timing/storage measurements; personal Logic/REAPER gates V2.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T34](V1-QUEUE-2026-09-06.md#t34); dependencies: T08, T09, T14.

Open-PR evidence: [#228](V1-INVENTORY-2026-09-06.md#pr-228), [#235](V1-INVENTORY-2026-09-06.md#pr-235).

<a id="r40"></a>

## R40 — Preserve Write, composition and finishing workflows

**Implementation: present. Risk: high.**

Governing sources: [U194](#u194), [U199](#u199), [U282](#u282).

Code: [src/lib/originals.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/originals.ts), [src/lib/writingTools.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/writingTools.ts), [src/lib/finishing.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/finishing.ts), [src/components/WritingDesk.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/components/WritingDesk.tsx). Tests inspected: [tests/e2e/writing.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/e2e/writing.test.ts), [tests/invariants/finishing.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/finishing.test.ts).

Current state / remaining work: Accepted focused songwriting workflows already native/persistent; #239 Film undo, #242 Write copy, #248 Film copy and #244 subscriptions require distinct bounded handling. No broad redesign.

Acceptance: Conflict copy preserves concurrent saved/draft versions; unknowns/Unicode titles; undo boundaries; composition/versions/rig/guitar references retained; real native error path.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Gemini 3.8 Flash High / Antigravity**; reviewer: Opus 5 / Claude Code. Primary task: [T05](V1-QUEUE-2026-09-06.md#t05); dependencies: REVIEW.

Open-PR evidence: [#239](V1-INVENTORY-2026-09-06.md#pr-239), [#242](V1-INVENTORY-2026-09-06.md#pr-242), [#244](V1-INVENTORY-2026-09-06.md#pr-244), [#248](V1-INVENTORY-2026-09-06.md#pr-248).

<a id="r41"></a>

## R41 — Keep Film and media operations safe and cancellable

**Implementation: partial. Risk: high.**

Governing sources: [U281](#u281).

Code: [src-tauri/src/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/media.rs), [src-tauri/src/agents.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/agents.rs), [src/lib/media.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/media.ts), [src/screens/MusicVideo.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/MusicVideo.tsx). Tests inspected: [tests/invariants/media.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/media.test.ts), [tests/invariants/agents.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/agents.test.ts).

Current state / remaining work: FFmpeg Film pipeline and installed-agent bridge exist; #249 timeout early return misses cleanup, parent-only test does not prove descendants. Film copy/undo and error improvements still pending.

Acceptance: Benign disposable subprocess tree cancelled/timeout on both OSes; executable boundary validated; stderr redacted; no model launched in tests; saved project/assets survive failure.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Installed FFmpeg for optional real-tool fixture; no model launch permitted here.

Owner: **Grok 4.6 / Grok Build**; reviewer: Astra / Codex. Primary task: [T04b](V1-QUEUE-2026-09-06.md#t04b); dependencies: T04.

Open-PR evidence: [#232](V1-INVENTORY-2026-09-06.md#pr-232), [#239](V1-INVENTORY-2026-09-06.md#pr-239), [#248](V1-INVENTORY-2026-09-06.md#pr-248), [#249](V1-INVENTORY-2026-09-06.md#pr-249).

<a id="r42"></a>

## R42 — Apply assistant proposals only to the intended current draft

**Implementation: partial. Risk: high.**

Governing sources: [U197](#u197), [U252](#u252).

Code: [src/components/StudioAssistant.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/components/StudioAssistant.tsx), [src/lib/jo/studioTools.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/studioTools.ts), [src/lib/jo/conversation.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/conversation.ts). Tests inspected: [tests/invariants/store-subscriptions.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/store-subscriptions.test.ts).

Current state / remaining work: Main guarded proposals work; #244 memo changes fingerprint representation so Apply always disables. #247 cancellation overlaps. Repair without accepting stale edits.

Acceptance: Fresh proposal Apply enabled, song/film edit disables, stale/cancelled reply never mutates; actual store subscriptions/render tests, not source regex alone.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Gemini 3.8 Flash High / Antigravity**; reviewer: Opus 5 / Claude Code. Primary task: [T05b](V1-QUEUE-2026-09-06.md#t05b); dependencies: T05.

Open-PR evidence: [#244](V1-INVENTORY-2026-09-06.md#pr-244), [#247](V1-INVENTORY-2026-09-06.md#pr-247).

<a id="r43"></a>

## R43 — Finish onboarding as a rerunnable native workflow

**Implementation: absent. Risk: high.**

Governing sources: [U127](#u127), [U128](#u128), [U129](#u129), [U130](#u130), [U131](#u131), [U132](#u132), [U133](#u133), [U134](#u134), [U135](#u135), [U150](#u150), [U156](#u156), [U165](#u165), [U253](#u253).

Code: [src/screens/Settings.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Settings.tsx), [src/screens/Rig.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Rig.tsx), [src/screens/Sessions.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Sessions.tsx). Tests inspected: [tests/e2e/startup.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/e2e/startup.test.ts).

Current state / remaining work: Individual settings exist, no devices→calibration→keys test→rig→assets wizard. Reuse existing commands and truthful incomplete states.

Acceptance: Fresh/restarted setup, missing device/key/network/assets and retry; calibration estimates explained; cheapest key test only with authorized user action; rerun preserves saved preferences.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer device/key and audited assets; spend authority for test endpoint.

Owner: **Gemini 3.8 Flash High / Antigravity**; reviewer: Opus 5 / Claude Code. Primary task: [T36](V1-QUEUE-2026-09-06.md#t36); dependencies: T13, T16, T04.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r44"></a>

## R44 — Make Stage and rooms usable at distance and by keyboard

**Implementation: partial. Risk: medium.**

Governing sources: [U022](#u022), [U023](#u023), [U024](#u024), [U062](#u062), [U063](#u063), [U064](#u064), [U065](#u065), [U066](#u066), [U067](#u067), [U068](#u068), [U069](#u069), [U127](#u127), [U128](#u128), [U129](#u129), [U130](#u130), [U131](#u131), [U132](#u132), [U133](#u133), [U134](#u134), [U135](#u135), [U165](#u165), [U190](#u190), [U200](#u200), [U283](#u283).

Code: [src/screens/Stage.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Stage.tsx), [src/design/tokens.css](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/design/tokens.css), [src/lib/shortcuts.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/shortcuts.ts), [src/lib/numberField.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/numberField.ts). Tests inspected: [tests/components/number-field.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/components/number-field.test.ts), [tests/e2e/rooms.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/e2e/rooms.test.ts).

Current state / remaining work: Two-metre Stage exists; #230 reduced motion and names, #240 numeric edits, #241 rollback concurrency need review. Complete pending/readout/record state and focus audit.

Acceptance: DESIGN preflight at1440×900/min1100×700; keyboard/focus/labels/overflow; valid intermediate numeric drafts; confirmed-state rollback under overlapping failures; no xrun from controls.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Gemini 3.8 Flash High / Antigravity**; reviewer: Opus 5 / Claude Code. Primary task: [T37](V1-QUEUE-2026-09-06.md#t37); dependencies: T08, T05.

Open-PR evidence: [#230](V1-INVENTORY-2026-09-06.md#pr-230), [#240](V1-INVENTORY-2026-09-06.md#pr-240), [#241](V1-INVENTORY-2026-09-06.md#pr-241).

<a id="r45"></a>

## R45 — Keep English and Bokmål contextual help accurate

**Implementation: present. Risk: medium.**

Governing sources: [U127](#u127), [U128](#u128), [U129](#u129), [U130](#u130), [U131](#u131), [U132](#u132), [U133](#u133), [U134](#u134), [U135](#u135), [U153](#u153), [U165](#u165), [U174](#u174), [U201](#u201), [U204](#u204), [U254](#u254), [U283](#u283).

Code: [docs/guide/manual.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/guide/manual.json), [src/lib/help.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/help.ts), [docs/guide/manual-en.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/guide/manual-en.md), [docs/guide/manual-nb.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/guide/manual-nb.md). Tests inspected: [tests/invariants/manual.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/manual.test.ts), [tests/invariants/help.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/help.test.ts).

Current state / remaining work: Accepted ADR0009 bilingual help and generated guides exist. Correct stale ramp-export, clock and UI labels after feature contracts settle; #252 stale tool paths must not spread.

Acceptance: Every topic in both languages matches actual labels/actions, Escape/focus returns correctly, user-facing unavailable features explicit; manual freshness tests pass.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GLM-5.3-Flash / ZCode**; reviewer: Opus 5 / Claude Code. Primary task: [T38](V1-QUEUE-2026-09-06.md#t38); dependencies: T30, T36, T37.

Open-PR evidence: [#230](V1-INVENTORY-2026-09-06.md#pr-230).

<a id="r46"></a>

## R46 — Protect close/restart and show recoverable native errors

**Implementation: partial. Risk: high.**

Governing sources: [U127](#u127), [U128](#u128), [U129](#u129), [U130](#u130), [U131](#u131), [U132](#u132), [U133](#u133), [U134](#u134), [U135](#u135), [U150](#u150), [U203](#u203), [U249](#u249), [U253](#u253).

Code: [src/lib/closeGuard.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/closeGuard.ts), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/lib.rs), [src/lib/openUrl.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/openUrl.ts), [src/screens/Settings.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Settings.tsx). Tests inspected: [tests/invariants/close-guard.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/close-guard.test.ts), [tests/sessions/recording-error.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/sessions/recording-error.test.ts).

Current state / remaining work: ExitRequested guard now exists (#35 title stale); developer Mac path unverified. #243 readable errors fails TS and has wrong shared title limit. Add reveal/log export only through native safe paths.

Acceptance: Unsaved song/chart/film/take survives close/restart; app.error message+nextstep; no raw secrets/JSON; developer CmdQ/window close; loading/empty/error every room.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer macOS native close/installed app; friend Mac session V2.

Owner: **Gemini 3.8 Flash High / Antigravity**; reviewer: Opus 5 / Claude Code. Primary task: [T39](V1-QUEUE-2026-09-06.md#t39); dependencies: T04b, T05b, T37.

Open-PR evidence: [#243](V1-INVENTORY-2026-09-06.md#pr-243).

<a id="r47"></a>

## R47 — Meet combined audio/UI performance budgets

**Implementation: partial. Risk: high.**

Governing sources: [U042](#u042), [U043](#u043), [U044](#u044), [U045](#u045), [U046](#u046), [U047](#u047), [U048](#u048), [U049](#u049), [U050](#u050), [U051](#u051), [U127](#u127), [U128](#u128), [U129](#u129), [U130](#u130), [U131](#u131), [U132](#u132), [U133](#u133), [U134](#u134), [U135](#u135), [U145](#u145), [U215](#u215), [U248](#u248), [U280](#u280), [U283](#u283).

Code: [crates/jam-band/tests/golden.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-band/tests/golden.rs), [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-audio/src/engine.rs), [src/screens/Stage.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Stage.tsx). Tests inspected: [tests/invariants/store-subscriptions.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/store-subscriptions.test.ts).

Current state / remaining work: Band budget test exists but synthetic/current path not busiest real instruments+stretch+recording. No measured full idle/IPC/canvas release evidence.

Acceptance: 10,000blocks<25%real time onCI; xruns0 for5 min buffer512 at60–200bpm; idleCPU<3%PC;60 fpsmeter/waveform;30 HzIPC/20 Hztuner; worst-block and audio-listening logs.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer device and CPU/GPU measurements.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T40](V1-QUEUE-2026-09-06.md#t40); dependencies: T18, T23, T28, T14.

Open-PR evidence: [#244](V1-INVENTORY-2026-09-06.md#pr-244).

<a id="r48"></a>

## R48 — Distribute verified installers and diagnostics

**Implementation: partial. Risk: high.**

Governing sources: [U015](#u015), [U127](#u127), [U128](#u128), [U129](#u129), [U130](#u130), [U131](#u131), [U132](#u132), [U133](#u133), [U134](#u134), [U135](#u135), [U142](#u142), [U151](#u151), [U156](#u156), [U165](#u165).

Code: [.github/workflows/release.yml](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/.github/workflows/release.yml), [src-tauri/tauri.conf.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tauri.conf.json), [docs/guide/manual-en.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/guide/manual-en.md), [src/screens/Settings.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Settings.tsx). Tests inspected: [tests/invariants/desktop-startup.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/desktop-startup.test.ts).

Current state / remaining work: Workflow builds draft Windows/AppleSilicon/Intel installers, but no release exists, no CI dependency/checksums. No signing/notarisation proof; planned setup.md is absent (existing bilingual manual carries setup guidance). Do not publish/retag v0.1.0. Diagnostics export remains.

Acceptance: Candidate exacthead gates before package, SHA256+version/notes, Windows install and developer AppleSilicon dmg launch, redacted log export, updater disabled until trusted signing.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer Mac/installer access; signing identities/account or explicit owner decision; separate publish authority.

Owner: **Grok 4.6 / Grok Build**; reviewer: Astra / Codex. Primary task: [T44](V1-QUEUE-2026-09-06.md#t44); dependencies: T41, T43.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r49"></a>

## R49 — Enforce security, licenses and accountable repository gates

**Implementation: partial. Risk: high.**

Governing sources: [U001](#u001), [U008](#u008), [U009](#u009), [U010](#u010), [U011](#u011), [U012](#u012), [U013](#u013), [U014](#u014), [U015](#u015), [U025](#u025), [U026](#u026), [U027](#u027), [U028](#u028), [U148](#u148), [U152](#u152), [U153](#u153), [U163](#u163), [U171](#u171), [U247](#u247), [U249](#u249), [U284](#u284), [U288](#u288).

Code: [.github/workflows/ci.yml](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/.github/workflows/ci.yml), [deny.toml](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/deny.toml), [scripts/check-js-licences.mjs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/scripts/check-js-licences.mjs), [src-tauri/capabilities/default.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/capabilities/default.json). Tests inspected: [tests/invariants/js-licences.test.mjs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/js-licences.test.mjs), [tests/invariants/providers.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/providers.test.ts).

Current state / remaining work: CI secrets/licenses/links exist. main protection404/rulesets[]; action/dependency/update hardening and release gate gaps remain. Hygiene suggestions are separately scoped, not mandatory bulk scaffolding.

Acceptance: No GPL/LGPL/AGPL; provenance perasset; no network in headless; least capabilities; exacthead mandatory gates, branch/force protection when admin authorized; diagnostic/usage redaction.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Repository admin for protection; signing/provider/license access only as separately authorized.

Owner: **Grok 4.6 / Grok Build**; reviewer: Astra / Codex. Primary task: [T41](V1-QUEUE-2026-09-06.md#t41); dependencies: T04.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r50"></a>

## R50 — Keep governing documentation truthful without changing architecture

**Implementation: partial. Risk: medium.**

Governing sources: [U001](#u001), [U153](#u153), [U163](#u163), [U177](#u177), [U202](#u202), [U212](#u212), [U216](#u216), [U244](#u244), [U250](#u250), [U255](#u255), [U284](#u284).

Code: [AGENTS.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md), [docs/ARCHITECTURE.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md), [docs/EXTENDING.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md), [docs/plan/00-README.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md), [docs/DESIGN.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/DESIGN.md). Tests inspected: [tests/invariants/manual.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/manual.test.ts).

Current state / remaining work: Historical green milestone markers and old src/ai, IPC/layout/fixtures commands conflict with current implementations. Ledger separates target from implemented appendices; later focused docs repair needed.

Acceptance: Every current command/path resolves/runs; no acceptance silently lowered; preserve accepted ADR0001–0011 and ownerV2 distinction; mark targets rather than rewrite history.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **GLM-5.3-Flash / ZCode**; reviewer: Opus 5 / Claude Code. Primary task: [T43](V1-QUEUE-2026-09-06.md#t43); dependencies: T42, T38.

Open-PR evidence: [#252](V1-INVENTORY-2026-09-06.md#pr-252), [#276](V1-INVENTORY-2026-09-06.md#pr-276).

<a id="r51"></a>

## R51 — Resolve S1–S5 evidence before using their conclusions

**Implementation: partial. Risk: high.**

Governing sources: [U002](#u002), [U003](#u003), [U004](#u004), [U005](#u005), [U006](#u006), [U007](#u007), [U032](#u032), [U033](#u033), [U243](#u243), [U287](#u287).

Code: [docs/spikes/S1-binary-ipc.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/spikes/S1-binary-ipc.md), [docs/spikes/S2-cpal-multichannel.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/spikes/S2-cpal-multichannel.md), [docs/spikes/S3-stretch-build.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/spikes/S3-stretch-build.md), [docs/spikes/S4-lyria-ws.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/spikes/S4-lyria-ws.md), [docs/spikes/S5-jo-voice.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/spikes/S5-jo-voice.md). Tests inspected: [scripts/spikes/lyria-ws/src/main.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/scripts/spikes/lyria-ws/src/main.rs), [crates/jam-dsp/src/stretch.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/crates/jam-dsp/src/stretch.rs).

Current state / remaining work: S1 unmeasured: IPC fallback prohibited without proof. S2 historical no retained probe/current developer multichannel missing. S3 synthetic compiled tests; S4 synthetic600s not provider. S5 shapes/latency not live acceptance.

Acceptance: S1 bidirectional10 min188KB/s minimized stats if fallback needed; S2 dumps; S3 1kHz1.25x length±1ms/frequency±1Hz; S4 exact transcript/cap/rate; S5 3s utterance latency and recorded STT/TTS/voices.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Official provider contract and authorized recorded/live fixtures; developer device/desktop.

Owner: **Opus 5 / Claude Code / claude-opus-5**; reviewer: Astra / Codex. Primary task: [T01](V1-QUEUE-2026-09-06.md#t01); dependencies: REVIEW.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r52"></a>

## R52 — Complete the full developer release rehearsal

**Implementation: partial. Risk: high.**

Governing sources: [U001](#u001), [U165](#u165), [U239](#u239), [U245](#u245), [U246](#u246), [U284](#u284), [U285](#u285).

Code: [docs/plan/03-build-plan.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md), [docs/plan/06-owner-verification.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/06-owner-verification.md), [docs/guide/manual-en.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/guide/manual-en.md). Tests inspected: [tests/e2e/rooms.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/e2e/rooms.test.ts), [src-tauri/tests/ipc_transport.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_transport.rs).

Current state / remaining work: Individual demos/tests exist; no full end-to-end V1 musical/install proof. Personal owner gates remain V2, not all hardware/provider verification.

Acceptance: Setup→six-stylejam→Jo→import/separate/practice/ramp→record/review/export; full exactheadCI, all required recipes, licensed rendered corpus and developer listening; no required V1 row unverified at declaration.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer Mac, audio/MIDI equipment, recorded/live provider authorization, installer/signing decision.

Owner: **GPT-6 Astra / Codex / gpt-6-astra / high**; reviewer: Fable 5.1 / Claude Code. Primary task: [T45](V1-QUEUE-2026-09-06.md#t45); dependencies: T32, T33, T34, T35, T39, T40, T44.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r53"></a>

## R53 — Retain the agreed focused songwriting and personalization

**Implementation: partial. Risk: medium.**

Governing sources: [U165](#u165), [U194](#u194), [U200](#u200), [U282](#u282), [U286](#u286).

Code: [src/screens/Originals.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/Originals.tsx), [src/lib/originals.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/originals.ts), [src/lib/jo/providers.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/providers.ts), [src/lib/settingsView.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/settingsView.ts), [src-tauri/src/settings.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/settings.rs). Tests inspected: [tests/invariants/studio-workspaces.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/studio-workspaces.test.ts), [tests/e2e/writing.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/e2e/writing.test.ts).

Current state / remaining work: Focused room views, song/rig/AI preferences exist. The V1 decision requires personalization but does not enumerate a new general profile system; independently verify agreed persisted choices and identify any missing acceptance detail, without inventing scope.

Acceptance: Song defaults/versions/locks, AI/voice/rig preferences and focused views survive intended navigation/restart; EN/NB help stays beside features; no lost draft, no automatic paid/action side effect.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: None for offline work.

Owner: **Gemini 3.8 Flash High / Antigravity**; reviewer: Opus 5 / Claude Code. Primary task: [T36](V1-QUEUE-2026-09-06.md#t36); dependencies: T13, T16, T04.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r54"></a>

## R54 — Keep installed assistants opt-in, bounded and proposal-only

**Implementation: partial. Risk: high.**

Governing sources: [U144](#u144), [U148](#u148), [U172](#u172), [U197](#u197), [U252](#u252).

Code: [src-tauri/src/agents.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/agents.rs), [src-tauri/src/platform/mod.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/platform/mod.rs), [src/lib/jo/studioTools.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/lib/jo/studioTools.ts), [src/components/StudioAssistant.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/components/StudioAssistant.tsx). Tests inspected: [tests/invariants/agents.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/agents.test.ts), [src-tauri/tests/ipc_net.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_net.rs).

Current state / remaining work: ADR0007 allows explicit native Codex/Claude CLI exception; no bundled sidecar/token access. Existing bounds/proposal validation need lifecycle T04 and installed-version acceptance; historical Codex check is not current Claude/macOS verification.

Acceptance: One request,128 KiB input/2 MiB perpipe/3 min, credentials stripped, no built-in tools/writes; validate clone before edit; reject stale/recording/locked state. Benign fixtures only unless separately authorized real model.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Supported trusted installed CLI/account and separate model-launch authority for live acceptance.

Owner: **Grok 4.6 / Grok Build**; reviewer: Astra / Codex. Primary task: [T04b](V1-QUEUE-2026-09-06.md#t04b); dependencies: T04.

Open-PR evidence: None; do not infer completion from absent PRs.

<a id="r55"></a>

## R55 — Preserve the accepted Film rendering and provider boundaries

**Implementation: partial. Risk: high.**

Governing sources: [U144](#u144), [U148](#u148), [U173](#u173), [U198](#u198), [U281](#u281).

Code: [src-tauri/src/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/media.rs), [src-tauri/src/net/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/src/net/media.rs), [src/screens/MusicVideo.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src/screens/MusicVideo.tsx). Tests inspected: [src-tauri/tests/ipc_rig_media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/src-tauri/tests/ipc_rig_media.rs), [tests/invariants/media.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/tests/invariants/media.test.ts).

Current state / remaining work: ADR0008 implemented file-backed Film/external FFmpeg and fixed-loopback ComfyUI; synthetic protocols are not provider/GPU verification. Keep muted video-only preview exception and original soundtrack unchanged.

Acceptance: 30fps cumulative timing/720p,120 shots/10 min; film duration≤0.1s (fixture≤50 ms), stereo AAC RMSE<0.015;128MiBdownload/192 MiBresponse/512 MiBimport; receipt recovery, signed URL/key never IPC/log; no bundled tools/models.

Verification: CI baseline; local Rust blocked; native/live/physical unverified. External prerequisite: Developer FFmpeg/native player; configured ComfyUI/provider access separately verified.

Owner: **Gemini 3.8 Flash High / Antigravity**; reviewer: Opus 5 / Claude Code. Primary task: [T29](V1-QUEUE-2026-09-06.md#t29); dependencies: T05.

Open-PR evidence: None; do not infer completion from absent PRs.

## Source coverage and recipe index

288 source units map to 55 capability rows. Build-plan bullets, goals, acceptance/demo paragraphs, S1–S5, the CI specification, nine DoD targets and twelve invariants are individually enumerated. Architecture sections and each EXTENDING heading are mapped in full, plus accepted ADRs and governing context/design/method documents. Whole-section mappings intentionally retain all contained constraints.

| Unit | Governing range | Capability rows / scope |
|---|---|---|

| <a id="u001"></a> U001 | [docs/plan/03-build-plan.md:5–5](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L5-L5) (common gate) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R49](V1-REQUIREMENTS-2026-09-06.md#r49), [R50](V1-REQUIREMENTS-2026-09-06.md#r50), [R52](V1-REQUIREMENTS-2026-09-06.md#r52); V1 |

| <a id="u002"></a> U002 | [docs/plan/03-build-plan.md:26–26](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L26-L26) (spike) | [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u003"></a> U003 | [docs/plan/03-build-plan.md:27–27](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L27-L27) (spike) | [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u004"></a> U004 | [docs/plan/03-build-plan.md:28–28](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L28-L28) (spike) | [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u005"></a> U005 | [docs/plan/03-build-plan.md:29–29](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L29-L29) (spike) | [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u006"></a> U006 | [docs/plan/03-build-plan.md:30–30](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L30-L30) (spike) | [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u007"></a> U007 | [docs/plan/03-build-plan.md:36–36](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L36-L36) (requirement) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R04](V1-REQUIREMENTS-2026-09-06.md#r04), [R05](V1-REQUIREMENTS-2026-09-06.md#r05), [R06](V1-REQUIREMENTS-2026-09-06.md#r06), [R07](V1-REQUIREMENTS-2026-09-06.md#r07), [R08](V1-REQUIREMENTS-2026-09-06.md#r08), [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R10](V1-REQUIREMENTS-2026-09-06.md#r10), [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u008"></a> U008 | [docs/plan/03-build-plan.md:39–39](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L39-L39) (requirement) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u009"></a> U009 | [docs/plan/03-build-plan.md:40–40](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L40-L40) (requirement) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u010"></a> U010 | [docs/plan/03-build-plan.md:41–41](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L41-L41) (requirement) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u011"></a> U011 | [docs/plan/03-build-plan.md:42–42](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L42-L42) (requirement) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u012"></a> U012 | [docs/plan/03-build-plan.md:43–43](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L43-L43) (requirement) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u013"></a> U013 | [docs/plan/03-build-plan.md:44–44](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L44-L44) (requirement) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u014"></a> U014 | [docs/plan/03-build-plan.md:45–45](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L45-L45) (requirement) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u015"></a> U015 | [docs/plan/03-build-plan.md:48–58](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L48-L58) (CI specification) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R48](V1-REQUIREMENTS-2026-09-06.md#r48), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u016"></a> U016 | [docs/plan/03-build-plan.md:62–62](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L62-L62) (requirement) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R04](V1-REQUIREMENTS-2026-09-06.md#r04), [R05](V1-REQUIREMENTS-2026-09-06.md#r05); V1 |

| <a id="u017"></a> U017 | [docs/plan/03-build-plan.md:63–63](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L63-L63) (requirement) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R04](V1-REQUIREMENTS-2026-09-06.md#r04), [R05](V1-REQUIREMENTS-2026-09-06.md#r05); V1 |

| <a id="u018"></a> U018 | [docs/plan/03-build-plan.md:64–64](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L64-L64) (requirement) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R04](V1-REQUIREMENTS-2026-09-06.md#r04), [R05](V1-REQUIREMENTS-2026-09-06.md#r05); V1 |

| <a id="u019"></a> U019 | [docs/plan/03-build-plan.md:65–65](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L65-L65) (requirement) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R04](V1-REQUIREMENTS-2026-09-06.md#r04), [R05](V1-REQUIREMENTS-2026-09-06.md#r05); V1 |

| <a id="u020"></a> U020 | [docs/plan/03-build-plan.md:66–66](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L66-L66) (requirement) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R04](V1-REQUIREMENTS-2026-09-06.md#r04), [R05](V1-REQUIREMENTS-2026-09-06.md#r05); V1 |

| <a id="u021"></a> U021 | [docs/plan/03-build-plan.md:67–67](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L67-L67) (requirement) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R04](V1-REQUIREMENTS-2026-09-06.md#r04), [R05](V1-REQUIREMENTS-2026-09-06.md#r05); V1 |

| <a id="u022"></a> U022 | [docs/plan/03-build-plan.md:70–70](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L70-L70) (requirement) | [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R10](V1-REQUIREMENTS-2026-09-06.md#r10), [R06](V1-REQUIREMENTS-2026-09-06.md#r06); V1 |

| <a id="u023"></a> U023 | [docs/plan/03-build-plan.md:71–71](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L71-L71) (requirement) | [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R10](V1-REQUIREMENTS-2026-09-06.md#r10), [R06](V1-REQUIREMENTS-2026-09-06.md#r06); V1 |

| <a id="u024"></a> U024 | [docs/plan/03-build-plan.md:72–72](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L72-L72) (requirement) | [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R10](V1-REQUIREMENTS-2026-09-06.md#r10), [R06](V1-REQUIREMENTS-2026-09-06.md#r06); V1 |

| <a id="u025"></a> U025 | [docs/plan/03-build-plan.md:75–75](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L75-L75) (requirement) | [R06](V1-REQUIREMENTS-2026-09-06.md#r06), [R07](V1-REQUIREMENTS-2026-09-06.md#r07), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u026"></a> U026 | [docs/plan/03-build-plan.md:76–76](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L76-L76) (requirement) | [R06](V1-REQUIREMENTS-2026-09-06.md#r06), [R07](V1-REQUIREMENTS-2026-09-06.md#r07), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u027"></a> U027 | [docs/plan/03-build-plan.md:77–77](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L77-L77) (requirement) | [R06](V1-REQUIREMENTS-2026-09-06.md#r06), [R07](V1-REQUIREMENTS-2026-09-06.md#r07), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u028"></a> U028 | [docs/plan/03-build-plan.md:78–78](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L78-L78) (requirement) | [R06](V1-REQUIREMENTS-2026-09-06.md#r06), [R07](V1-REQUIREMENTS-2026-09-06.md#r07), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u029"></a> U029 | [docs/plan/03-build-plan.md:81–81](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L81-L81) (requirement) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R10](V1-REQUIREMENTS-2026-09-06.md#r10), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u030"></a> U030 | [docs/plan/03-build-plan.md:82–82](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L82-L82) (requirement) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R10](V1-REQUIREMENTS-2026-09-06.md#r10), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u031"></a> U031 | [docs/plan/03-build-plan.md:83–83](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L83-L83) (requirement) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R10](V1-REQUIREMENTS-2026-09-06.md#r10), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u032"></a> U032 | [docs/plan/03-build-plan.md:88–88](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L88-L88) (acceptance) | [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u033"></a> U033 | [docs/plan/03-build-plan.md:90–90](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L90-L90) (demo) | [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u034"></a> U034 | [docs/plan/03-build-plan.md:96–96](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L96-L96) (requirement) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u035"></a> U035 | [docs/plan/03-build-plan.md:98–98](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L98-L98) (requirement) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u036"></a> U036 | [docs/plan/03-build-plan.md:99–99](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L99-L99) (requirement) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u037"></a> U037 | [docs/plan/03-build-plan.md:100–100](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L100-L100) (requirement) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u038"></a> U038 | [docs/plan/03-build-plan.md:101–101](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L101-L101) (requirement) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u039"></a> U039 | [docs/plan/03-build-plan.md:102–102](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L102-L102) (requirement) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u040"></a> U040 | [docs/plan/03-build-plan.md:104–104](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L104-L104) (acceptance) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u041"></a> U041 | [docs/plan/03-build-plan.md:106–106](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L106-L106) (demo) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u042"></a> U042 | [docs/plan/03-build-plan.md:112–112](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L112-L112) (requirement) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u043"></a> U043 | [docs/plan/03-build-plan.md:114–114](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L114-L114) (requirement) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u044"></a> U044 | [docs/plan/03-build-plan.md:115–115](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L115-L115) (requirement) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u045"></a> U045 | [docs/plan/03-build-plan.md:116–116](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L116-L116) (requirement) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u046"></a> U046 | [docs/plan/03-build-plan.md:117–117](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L117-L117) (requirement) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u047"></a> U047 | [docs/plan/03-build-plan.md:118–118](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L118-L118) (requirement) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u048"></a> U048 | [docs/plan/03-build-plan.md:119–119](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L119-L119) (requirement) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u049"></a> U049 | [docs/plan/03-build-plan.md:120–120](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L120-L120) (requirement) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u050"></a> U050 | [docs/plan/03-build-plan.md:122–122](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L122-L122) (acceptance) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u051"></a> U051 | [docs/plan/03-build-plan.md:124–124](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L124-L124) (demo) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u052"></a> U052 | [docs/plan/03-build-plan.md:130–130](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L130-L130) (requirement) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u053"></a> U053 | [docs/plan/03-build-plan.md:132–132](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L132-L132) (requirement) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u054"></a> U054 | [docs/plan/03-build-plan.md:133–133](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L133-L133) (requirement) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u055"></a> U055 | [docs/plan/03-build-plan.md:134–134](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L134-L134) (requirement) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u056"></a> U056 | [docs/plan/03-build-plan.md:135–135](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L135-L135) (requirement) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u057"></a> U057 | [docs/plan/03-build-plan.md:136–136](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L136-L136) (requirement) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u058"></a> U058 | [docs/plan/03-build-plan.md:137–137](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L137-L137) (requirement) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u059"></a> U059 | [docs/plan/03-build-plan.md:138–138](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L138-L138) (requirement) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u060"></a> U060 | [docs/plan/03-build-plan.md:140–140](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L140-L140) (acceptance) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u061"></a> U061 | [docs/plan/03-build-plan.md:142–142](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L142-L142) (demo) | [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u062"></a> U062 | [docs/plan/03-build-plan.md:148–148](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L148-L148) (requirement) | [R17](V1-REQUIREMENTS-2026-09-06.md#r17), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R44](V1-REQUIREMENTS-2026-09-06.md#r44); V1 |

| <a id="u063"></a> U063 | [docs/plan/03-build-plan.md:150–150](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L150-L150) (requirement) | [R17](V1-REQUIREMENTS-2026-09-06.md#r17), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R44](V1-REQUIREMENTS-2026-09-06.md#r44); V1 |

| <a id="u064"></a> U064 | [docs/plan/03-build-plan.md:151–151](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L151-L151) (requirement) | [R17](V1-REQUIREMENTS-2026-09-06.md#r17), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R44](V1-REQUIREMENTS-2026-09-06.md#r44); V1 |

| <a id="u065"></a> U065 | [docs/plan/03-build-plan.md:152–152](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L152-L152) (requirement) | [R17](V1-REQUIREMENTS-2026-09-06.md#r17), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R44](V1-REQUIREMENTS-2026-09-06.md#r44); V1 |

| <a id="u066"></a> U066 | [docs/plan/03-build-plan.md:153–153](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L153-L153) (requirement) | [R17](V1-REQUIREMENTS-2026-09-06.md#r17), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R44](V1-REQUIREMENTS-2026-09-06.md#r44); V1 |

| <a id="u067"></a> U067 | [docs/plan/03-build-plan.md:154–154](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L154-L154) (requirement) | [R17](V1-REQUIREMENTS-2026-09-06.md#r17), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R44](V1-REQUIREMENTS-2026-09-06.md#r44); V1 |

| <a id="u068"></a> U068 | [docs/plan/03-build-plan.md:156–156](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L156-L156) (acceptance) | [R17](V1-REQUIREMENTS-2026-09-06.md#r17), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R44](V1-REQUIREMENTS-2026-09-06.md#r44); V1 |

| <a id="u069"></a> U069 | [docs/plan/03-build-plan.md:158–158](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L158-L158) (demo) | [R17](V1-REQUIREMENTS-2026-09-06.md#r17), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R44](V1-REQUIREMENTS-2026-09-06.md#r44); V1 |

| <a id="u070"></a> U070 | [docs/plan/03-build-plan.md:164–164](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L164-L164) (requirement) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R21](V1-REQUIREMENTS-2026-09-06.md#r21); V1 |

| <a id="u071"></a> U071 | [docs/plan/03-build-plan.md:166–166](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L166-L166) (requirement) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R21](V1-REQUIREMENTS-2026-09-06.md#r21); V1 |

| <a id="u072"></a> U072 | [docs/plan/03-build-plan.md:167–167](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L167-L167) (requirement) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R21](V1-REQUIREMENTS-2026-09-06.md#r21); V1 |

| <a id="u073"></a> U073 | [docs/plan/03-build-plan.md:168–168](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L168-L168) (requirement) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R21](V1-REQUIREMENTS-2026-09-06.md#r21); V1 |

| <a id="u074"></a> U074 | [docs/plan/03-build-plan.md:169–169](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L169-L169) (requirement) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R21](V1-REQUIREMENTS-2026-09-06.md#r21); V1 |

| <a id="u075"></a> U075 | [docs/plan/03-build-plan.md:170–170](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L170-L170) (requirement) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R21](V1-REQUIREMENTS-2026-09-06.md#r21); V1 |

| <a id="u076"></a> U076 | [docs/plan/03-build-plan.md:171–171](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L171-L171) (requirement) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R21](V1-REQUIREMENTS-2026-09-06.md#r21); V1 |

| <a id="u077"></a> U077 | [docs/plan/03-build-plan.md:173–173](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L173-L173) (acceptance) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R21](V1-REQUIREMENTS-2026-09-06.md#r21); V1 |

| <a id="u078"></a> U078 | [docs/plan/03-build-plan.md:175–175](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L175-L175) (demo) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R21](V1-REQUIREMENTS-2026-09-06.md#r21); V1 |

| <a id="u079"></a> U079 | [docs/plan/03-build-plan.md:181–181](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L181-L181) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u080"></a> U080 | [docs/plan/03-build-plan.md:183–183](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L183-L183) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u081"></a> U081 | [docs/plan/03-build-plan.md:184–184](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L184-L184) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u082"></a> U082 | [docs/plan/03-build-plan.md:185–185](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L185-L185) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u083"></a> U083 | [docs/plan/03-build-plan.md:186–186](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L186-L186) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u084"></a> U084 | [docs/plan/03-build-plan.md:187–187](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L187-L187) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u085"></a> U085 | [docs/plan/03-build-plan.md:188–188](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L188-L188) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u086"></a> U086 | [docs/plan/03-build-plan.md:189–189](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L189-L189) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u087"></a> U087 | [docs/plan/03-build-plan.md:190–190](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L190-L190) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u088"></a> U088 | [docs/plan/03-build-plan.md:191–191](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L191-L191) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u089"></a> U089 | [docs/plan/03-build-plan.md:192–192](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L192-L192) (requirement) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u090"></a> U090 | [docs/plan/03-build-plan.md:194–194](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L194-L194) (acceptance) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u091"></a> U091 | [docs/plan/03-build-plan.md:196–196](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L196-L196) (demo) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u092"></a> U092 | [docs/plan/03-build-plan.md:202–202](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L202-L202) (requirement) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u093"></a> U093 | [docs/plan/03-build-plan.md:204–204](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L204-L204) (requirement) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u094"></a> U094 | [docs/plan/03-build-plan.md:205–205](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L205-L205) (requirement) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u095"></a> U095 | [docs/plan/03-build-plan.md:206–206](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L206-L206) (requirement) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u096"></a> U096 | [docs/plan/03-build-plan.md:207–207](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L207-L207) (requirement) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u097"></a> U097 | [docs/plan/03-build-plan.md:208–208](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L208-L208) (requirement) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u098"></a> U098 | [docs/plan/03-build-plan.md:209–209](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L209-L209) (requirement) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u099"></a> U099 | [docs/plan/03-build-plan.md:211–211](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L211-L211) (acceptance) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u100"></a> U100 | [docs/plan/03-build-plan.md:213–213](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L213-L213) (demo) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u101"></a> U101 | [docs/plan/03-build-plan.md:219–219](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L219-L219) (requirement) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u102"></a> U102 | [docs/plan/03-build-plan.md:221–221](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L221-L221) (requirement) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u103"></a> U103 | [docs/plan/03-build-plan.md:222–222](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L222-L222) (requirement) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u104"></a> U104 | [docs/plan/03-build-plan.md:223–223](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L223-L223) (requirement) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u105"></a> U105 | [docs/plan/03-build-plan.md:224–224](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L224-L224) (requirement) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u106"></a> U106 | [docs/plan/03-build-plan.md:225–225](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L225-L225) (requirement) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u107"></a> U107 | [docs/plan/03-build-plan.md:226–226](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L226-L226) (requirement) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u108"></a> U108 | [docs/plan/03-build-plan.md:228–228](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L228-L228) (acceptance) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u109"></a> U109 | [docs/plan/03-build-plan.md:230–230](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L230-L230) (demo) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u110"></a> U110 | [docs/plan/03-build-plan.md:236–236](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L236-L236) (requirement) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u111"></a> U111 | [docs/plan/03-build-plan.md:238–238](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L238-L238) (requirement) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u112"></a> U112 | [docs/plan/03-build-plan.md:239–239](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L239-L239) (requirement) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u113"></a> U113 | [docs/plan/03-build-plan.md:240–240](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L240-L240) (requirement) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u114"></a> U114 | [docs/plan/03-build-plan.md:241–241](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L241-L241) (requirement) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u115"></a> U115 | [docs/plan/03-build-plan.md:242–242](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L242-L242) (requirement) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u116"></a> U116 | [docs/plan/03-build-plan.md:243–243](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L243-L243) (requirement) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u117"></a> U117 | [docs/plan/03-build-plan.md:245–245](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L245-L245) (acceptance) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u118"></a> U118 | [docs/plan/03-build-plan.md:247–247](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L247-L247) (demo) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u119"></a> U119 | [docs/plan/03-build-plan.md:253–253](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L253-L253) (requirement) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37), [R38](V1-REQUIREMENTS-2026-09-06.md#r38), [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u120"></a> U120 | [docs/plan/03-build-plan.md:255–255](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L255-L255) (requirement) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37), [R38](V1-REQUIREMENTS-2026-09-06.md#r38), [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u121"></a> U121 | [docs/plan/03-build-plan.md:256–256](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L256-L256) (requirement) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37), [R38](V1-REQUIREMENTS-2026-09-06.md#r38), [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u122"></a> U122 | [docs/plan/03-build-plan.md:257–257](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L257-L257) (requirement) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37), [R38](V1-REQUIREMENTS-2026-09-06.md#r38), [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u123"></a> U123 | [docs/plan/03-build-plan.md:258–258](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L258-L258) (requirement) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37), [R38](V1-REQUIREMENTS-2026-09-06.md#r38), [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u124"></a> U124 | [docs/plan/03-build-plan.md:259–259](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L259-L259) (requirement) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37), [R38](V1-REQUIREMENTS-2026-09-06.md#r38), [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u125"></a> U125 | [docs/plan/03-build-plan.md:261–261](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L261-L261) (acceptance) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37), [R38](V1-REQUIREMENTS-2026-09-06.md#r38), [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u126"></a> U126 | [docs/plan/03-build-plan.md:263–263](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L263-L263) (demo) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37), [R38](V1-REQUIREMENTS-2026-09-06.md#r38), [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u127"></a> U127 | [docs/plan/03-build-plan.md:269–269](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L269-L269) (requirement) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R47](V1-REQUIREMENTS-2026-09-06.md#r47), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u128"></a> U128 | [docs/plan/03-build-plan.md:271–271](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L271-L271) (requirement) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R47](V1-REQUIREMENTS-2026-09-06.md#r47), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u129"></a> U129 | [docs/plan/03-build-plan.md:272–272](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L272-L272) (requirement) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R47](V1-REQUIREMENTS-2026-09-06.md#r47), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u130"></a> U130 | [docs/plan/03-build-plan.md:273–273](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L273-L273) (requirement) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R47](V1-REQUIREMENTS-2026-09-06.md#r47), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u131"></a> U131 | [docs/plan/03-build-plan.md:274–274](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L274-L274) (requirement) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R47](V1-REQUIREMENTS-2026-09-06.md#r47), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u132"></a> U132 | [docs/plan/03-build-plan.md:275–275](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L275-L275) (requirement) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R47](V1-REQUIREMENTS-2026-09-06.md#r47), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u133"></a> U133 | [docs/plan/03-build-plan.md:276–276](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L276-L276) (requirement) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R47](V1-REQUIREMENTS-2026-09-06.md#r47), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u134"></a> U134 | [docs/plan/03-build-plan.md:278–278](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L278-L278) (acceptance) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R47](V1-REQUIREMENTS-2026-09-06.md#r47), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u135"></a> U135 | [docs/plan/03-build-plan.md:280–280](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L280-L280) (demo) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R47](V1-REQUIREMENTS-2026-09-06.md#r47), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u136"></a> U136 | [docs/plan/03-build-plan.md:288–288](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L288-L288) (backlog) | ; Unscheduled; not V1 without user scope change |

| <a id="u137"></a> U137 | [docs/plan/03-build-plan.md:289–289](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L289-L289) (backlog) | ; Unscheduled; not V1 without user scope change |

| <a id="u138"></a> U138 | [docs/plan/03-build-plan.md:290–290](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L290-L290) (backlog) | ; Unscheduled; not V1 without user scope change |

| <a id="u139"></a> U139 | [docs/plan/03-build-plan.md:291–291](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L291-L291) (backlog) | ; Unscheduled; not V1 without user scope change |

| <a id="u140"></a> U140 | [docs/plan/03-build-plan.md:292–292](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L292-L292) (backlog) | ; Unscheduled; not V1 without user scope change |

| <a id="u141"></a> U141 | [docs/plan/03-build-plan.md:293–293](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L293-L293) (backlog) | ; Unscheduled; not V1 without user scope change |

| <a id="u142"></a> U142 | [docs/plan/03-build-plan.md:294–294](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L294-L294) (backlog) | [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 prerequisite pending owner decision |

| <a id="u143"></a> U143 | [docs/plan/03-build-plan.md:295–295](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/03-build-plan.md#L295-L295) (backlog) | ; Unscheduled; not V1 without user scope change |

| <a id="u144"></a> U144 | [AGENTS.md:7–7](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L7-L7) (invariant) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R54](V1-REQUIREMENTS-2026-09-06.md#r54), [R55](V1-REQUIREMENTS-2026-09-06.md#r55); V1 |

| <a id="u145"></a> U145 | [AGENTS.md:8–8](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L8-L8) (invariant) | [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u146"></a> U146 | [AGENTS.md:9–9](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L9-L9) (invariant) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02); V1 |

| <a id="u147"></a> U147 | [AGENTS.md:10–10](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L10-L10) (invariant) | [R06](V1-REQUIREMENTS-2026-09-06.md#r06); V1 |

| <a id="u148"></a> U148 | [AGENTS.md:11–11](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L11-L11) (invariant) | [R25](V1-REQUIREMENTS-2026-09-06.md#r25), [R49](V1-REQUIREMENTS-2026-09-06.md#r49), [R54](V1-REQUIREMENTS-2026-09-06.md#r54), [R55](V1-REQUIREMENTS-2026-09-06.md#r55); V1 |

| <a id="u149"></a> U149 | [AGENTS.md:12–12](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L12-L12) (invariant) | [R07](V1-REQUIREMENTS-2026-09-06.md#r07), [R08](V1-REQUIREMENTS-2026-09-06.md#r08), [R12](V1-REQUIREMENTS-2026-09-06.md#r12); V1 |

| <a id="u150"></a> U150 | [AGENTS.md:13–13](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L13-L13) (invariant) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R46](V1-REQUIREMENTS-2026-09-06.md#r46); V1 |

| <a id="u151"></a> U151 | [AGENTS.md:14–14](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L14-L14) (invariant) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u152"></a> U152 | [AGENTS.md:15–15](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L15-L15) (invariant) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u153"></a> U153 | [AGENTS.md:16–16](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L16-L16) (invariant) | [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R49](V1-REQUIREMENTS-2026-09-06.md#r49), [R50](V1-REQUIREMENTS-2026-09-06.md#r50); V1 |

| <a id="u154"></a> U154 | [AGENTS.md:17–17](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L17-L17) (invariant) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32); V1 |

| <a id="u155"></a> U155 | [AGENTS.md:18–18](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/AGENTS.md#L18-L18) (invariant) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R10](V1-REQUIREMENTS-2026-09-06.md#r10); V1 |

| <a id="u156"></a> U156 | [docs/plan/00-README.md:56–56](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L56-L56) (DoD) | [R04](V1-REQUIREMENTS-2026-09-06.md#r04), [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R48](V1-REQUIREMENTS-2026-09-06.md#r48); V1 |

| <a id="u157"></a> U157 | [docs/plan/00-README.md:57–57](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L57-L57) (DoD) | [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16), [R17](V1-REQUIREMENTS-2026-09-06.md#r17), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u158"></a> U158 | [docs/plan/00-README.md:58–58](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L58-L58) (DoD) | [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24); V1 |

| <a id="u159"></a> U159 | [docs/plan/00-README.md:59–59](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L59-L59) (DoD) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u160"></a> U160 | [docs/plan/00-README.md:60–60](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L60-L60) (DoD) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u161"></a> U161 | [docs/plan/00-README.md:61–61](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L61-L61) (DoD) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u162"></a> U162 | [docs/plan/00-README.md:62–62](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L62-L62) (DoD) | [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u163"></a> U163 | [docs/plan/00-README.md:63–63](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L63-L63) (DoD) | [R49](V1-REQUIREMENTS-2026-09-06.md#r49), [R50](V1-REQUIREMENTS-2026-09-06.md#r50); V1 |

| <a id="u164"></a> U164 | [docs/plan/00-README.md:64–64](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L64-L64) (DoD) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R10](V1-REQUIREMENTS-2026-09-06.md#r10); V1 |

| <a id="u165"></a> U165 | [docs/plan/00-README.md:44–52](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/00-README.md#L44-L52) (V1 scope decision) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R48](V1-REQUIREMENTS-2026-09-06.md#r48), [R52](V1-REQUIREMENTS-2026-09-06.md#r52), [R53](V1-REQUIREMENTS-2026-09-06.md#r53); V1 |

| <a id="u166"></a> U166 | [docs/adr/0001-tauri-rust-not-juce.md:1–33](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0001-tauri-rust-not-juce.md#L1-L33) (accepted ADR) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R02](V1-REQUIREMENTS-2026-09-06.md#r02); V1 |

| <a id="u167"></a> U167 | [docs/adr/0002-listen-dont-process.md:1–19](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0002-listen-dont-process.md#L1-L19) (accepted ADR) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02); V1 |

| <a id="u168"></a> U168 | [docs/adr/0003-rust-owns-bytes-js-owns-text.md:1–22](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0003-rust-owns-bytes-js-owns-text.md#L1-L22) (accepted ADR) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R10](V1-REQUIREMENTS-2026-09-06.md#r10); V1 |

| <a id="u169"></a> U169 | [docs/adr/0004-providers-suno-out-lyria-elevenlabs-musicai.md:1–28](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0004-providers-suno-out-lyria-elevenlabs-musicai.md#L1-L28) (accepted ADR) | [R25](V1-REQUIREMENTS-2026-09-06.md#r25), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u170"></a> U170 | [docs/adr/0005-files-are-truth-sqlite-is-cache.md:1–18](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0005-files-are-truth-sqlite-is-cache.md#L1-L18) (accepted ADR) | [R07](V1-REQUIREMENTS-2026-09-06.md#r07), [R08](V1-REQUIREMENTS-2026-09-06.md#r08), [R20](V1-REQUIREMENTS-2026-09-06.md#r20); V1 |

| <a id="u171"></a> U171 | [docs/adr/0006-licence-allowlist-and-assets.md:1–20](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0006-licence-allowlist-and-assets.md#L1-L20) (accepted ADR) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u172"></a> U172 | [docs/adr/0007-installed-studio-agents.md:1–64](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0007-installed-studio-agents.md#L1-L64) (accepted ADR) | [R54](V1-REQUIREMENTS-2026-09-06.md#r54); V1 |

| <a id="u173"></a> U173 | [docs/adr/0008-music-video-workspace.md:1–70](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0008-music-video-workspace.md#L1-L70) (accepted ADR) | [R55](V1-REQUIREMENTS-2026-09-06.md#r55); V1 |

| <a id="u174"></a> U174 | [docs/adr/0009-bilingual-help.md:1–18](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0009-bilingual-help.md#L1-L18) (accepted ADR) | [R45](V1-REQUIREMENTS-2026-09-06.md#r45); V1 |

| <a id="u175"></a> U175 | [docs/adr/0010-remove-unbuilt-m3-m4-code.md:1–38](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0010-remove-unbuilt-m3-m4-code.md#L1-L38) (accepted ADR) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R31](V1-REQUIREMENTS-2026-09-06.md#r31); V1 |

| <a id="u176"></a> U176 | [docs/adr/0011-pitch-measurement-precision.md:1–57](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0011-pitch-measurement-precision.md#L1-L57) (accepted ADR) | [R05](V1-REQUIREMENTS-2026-09-06.md#r05), [R36](V1-REQUIREMENTS-2026-09-06.md#r36); V1 |

| <a id="u177"></a> U177 | [docs/EXTENDING.md:1–2](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L1-L2) (extension recipe/section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R50](V1-REQUIREMENTS-2026-09-06.md#r50); V1 |

| <a id="u178"></a> U178 | [docs/EXTENDING.md:3–17](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L3-L17) (extension recipe/section) | [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u179"></a> U179 | [docs/EXTENDING.md:18–38](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L18-L38) (extension recipe/section) | [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u180"></a> U180 | [docs/EXTENDING.md:39–83](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L39-L83) (extension recipe/section) | [R28](V1-REQUIREMENTS-2026-09-06.md#r28); V1 |

| <a id="u181"></a> U181 | [docs/EXTENDING.md:84–93](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L84-L93) (extension recipe/section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R15](V1-REQUIREMENTS-2026-09-06.md#r15); V1 |

| <a id="u182"></a> U182 | [docs/EXTENDING.md:94–107](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L94-L107) (extension recipe/section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R16](V1-REQUIREMENTS-2026-09-06.md#r16); V1 |

| <a id="u183"></a> U183 | [docs/EXTENDING.md:108–113](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L108-L113) (extension recipe/section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R34](V1-REQUIREMENTS-2026-09-06.md#r34); V1 |

| <a id="u184"></a> U184 | [docs/EXTENDING.md:114–119](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L114-L119) (extension recipe/section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R18](V1-REQUIREMENTS-2026-09-06.md#r18); V1 |

| <a id="u185"></a> U185 | [docs/EXTENDING.md:120–148](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L120-L148) (extension recipe/section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R23](V1-REQUIREMENTS-2026-09-06.md#r23); V1 |

| <a id="u186"></a> U186 | [docs/EXTENDING.md:149–157](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L149-L157) (extension recipe/section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u187"></a> U187 | [docs/EXTENDING.md:158–163](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L158-L163) (extension recipe/section) | [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R14](V1-REQUIREMENTS-2026-09-06.md#r14); V1 |

| <a id="u188"></a> U188 | [docs/EXTENDING.md:164–167](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L164-L167) (extension recipe/section) | [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R04](V1-REQUIREMENTS-2026-09-06.md#r04); V1 |

| <a id="u189"></a> U189 | [docs/EXTENDING.md:168–174](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L168-L174) (extension recipe/section) | [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R36](V1-REQUIREMENTS-2026-09-06.md#r36); V1 |

| <a id="u190"></a> U190 | [docs/EXTENDING.md:175–180](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L175-L180) (extension recipe/section) | [R44](V1-REQUIREMENTS-2026-09-06.md#r44); V1 |

| <a id="u191"></a> U191 | [docs/EXTENDING.md:181–186](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L181-L186) (extension recipe/section) | [R10](V1-REQUIREMENTS-2026-09-06.md#r10); V1 |

| <a id="u192"></a> U192 | [docs/EXTENDING.md:187–191](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L187-L191) (extension recipe/section) | [R08](V1-REQUIREMENTS-2026-09-06.md#r08); V1 |

| <a id="u193"></a> U193 | [docs/EXTENDING.md:192–194](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L192-L194) (extension recipe/section) | ; Unscheduled; not V1 without user scope change |

| <a id="u194"></a> U194 | [docs/EXTENDING.md:195–226](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L195-L226) (extension recipe/section) | [R40](V1-REQUIREMENTS-2026-09-06.md#r40), [R53](V1-REQUIREMENTS-2026-09-06.md#r53); V1 |

| <a id="u195"></a> U195 | [docs/EXTENDING.md:227–242](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L227-L242) (extension recipe/section) | [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u196"></a> U196 | [docs/EXTENDING.md:243–259](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L243-L259) (extension recipe/section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u197"></a> U197 | [docs/EXTENDING.md:260–279](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L260-L279) (extension recipe/section) | [R54](V1-REQUIREMENTS-2026-09-06.md#r54), [R42](V1-REQUIREMENTS-2026-09-06.md#r42); V1 |

| <a id="u198"></a> U198 | [docs/EXTENDING.md:280–300](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L280-L300) (extension recipe/section) | [R33](V1-REQUIREMENTS-2026-09-06.md#r33), [R55](V1-REQUIREMENTS-2026-09-06.md#r55); V1 |

| <a id="u199"></a> U199 | [docs/EXTENDING.md:301–314](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L301-L314) (extension recipe/section) | [R40](V1-REQUIREMENTS-2026-09-06.md#r40); V1 |

| <a id="u200"></a> U200 | [docs/EXTENDING.md:315–328](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L315-L328) (extension recipe/section) | [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R53](V1-REQUIREMENTS-2026-09-06.md#r53); V1 |

| <a id="u201"></a> U201 | [docs/EXTENDING.md:329–333](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L329-L333) (extension recipe/section) | [R45](V1-REQUIREMENTS-2026-09-06.md#r45); V1 |

| <a id="u202"></a> U202 | [docs/EXTENDING.md:334–344](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L334-L344) (extension recipe/section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R50](V1-REQUIREMENTS-2026-09-06.md#r50); V1 |

| <a id="u203"></a> U203 | [docs/EXTENDING.md:345–347](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L345-L347) (extension recipe/section) | [R06](V1-REQUIREMENTS-2026-09-06.md#r06), [R46](V1-REQUIREMENTS-2026-09-06.md#r46); V1 |

| <a id="u204"></a> U204 | [docs/EXTENDING.md:348–353](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L348-L353) (extension recipe/section) | [R45](V1-REQUIREMENTS-2026-09-06.md#r45); V1 |

| <a id="u205"></a> U205 | [docs/EXTENDING.md:354–375](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L354-L375) (extension recipe/section) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R24](V1-REQUIREMENTS-2026-09-06.md#r24); V1 |

| <a id="u206"></a> U206 | [docs/EXTENDING.md:376–385](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L376-L385) (extension recipe/section) | [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u207"></a> U207 | [docs/EXTENDING.md:386–411](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L386-L411) (extension recipe/section) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u208"></a> U208 | [docs/EXTENDING.md:412–443](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L412-L443) (extension recipe/section) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u209"></a> U209 | [docs/EXTENDING.md:444–464](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L444-L464) (extension recipe/section) | [R27](V1-REQUIREMENTS-2026-09-06.md#r27); V1 |

| <a id="u210"></a> U210 | [docs/EXTENDING.md:465–478](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L465-L478) (extension recipe/section) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26); V1 |

| <a id="u211"></a> U211 | [docs/EXTENDING.md:479–495](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/EXTENDING.md#L479-L495) (extension recipe/section) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26); V1 |

| <a id="u212"></a> U212 | [docs/ARCHITECTURE.md:1–15](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L1-L15) (architecture contract/implemented section) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R50](V1-REQUIREMENTS-2026-09-06.md#r50); V1 |

| <a id="u213"></a> U213 | [docs/ARCHITECTURE.md:16–35](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L16-L35) (architecture contract/implemented section) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R24](V1-REQUIREMENTS-2026-09-06.md#r24); V1 |

| <a id="u214"></a> U214 | [docs/ARCHITECTURE.md:36–48](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L36-L48) (architecture contract/implemented section) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02); V1 |

| <a id="u215"></a> U215 | [docs/ARCHITECTURE.md:49–64](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L49-L64) (architecture contract/implemented section) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u216"></a> U216 | [docs/ARCHITECTURE.md:65–105](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L65-L105) (architecture contract/implemented section) | [R50](V1-REQUIREMENTS-2026-09-06.md#r50); V1 |

| <a id="u217"></a> U217 | [docs/ARCHITECTURE.md:106–107](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L106-L107) (architecture contract/implemented section) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R03](V1-REQUIREMENTS-2026-09-06.md#r03); V1 |

| <a id="u218"></a> U218 | [docs/ARCHITECTURE.md:108–111](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L108-L111) (architecture contract/implemented section) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R20](V1-REQUIREMENTS-2026-09-06.md#r20); V1 |

| <a id="u219"></a> U219 | [docs/ARCHITECTURE.md:112–128](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L112-L128) (architecture contract/implemented section) | [R04](V1-REQUIREMENTS-2026-09-06.md#r04); V1 |

| <a id="u220"></a> U220 | [docs/ARCHITECTURE.md:129–135](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L129-L135) (architecture contract/implemented section) | [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R11](V1-REQUIREMENTS-2026-09-06.md#r11); V1 |

| <a id="u221"></a> U221 | [docs/ARCHITECTURE.md:136–139](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L136-L139) (architecture contract/implemented section) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19); V1 |

| <a id="u222"></a> U222 | [docs/ARCHITECTURE.md:140–143](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L140-L143) (architecture contract/implemented section) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u223"></a> U223 | [docs/ARCHITECTURE.md:144–147](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L144-L147) (architecture contract/implemented section) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22); V1 |

| <a id="u224"></a> U224 | [docs/ARCHITECTURE.md:148–151](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L148-L151) (architecture contract/implemented section) | [R04](V1-REQUIREMENTS-2026-09-06.md#r04); V1 |

| <a id="u225"></a> U225 | [docs/ARCHITECTURE.md:152–153](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L152-L153) (architecture contract/implemented section) | [R10](V1-REQUIREMENTS-2026-09-06.md#r10); V1 |

| <a id="u226"></a> U226 | [docs/ARCHITECTURE.md:154–162](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L154-L162) (architecture contract/implemented section) | [R10](V1-REQUIREMENTS-2026-09-06.md#r10); V1 |

| <a id="u227"></a> U227 | [docs/ARCHITECTURE.md:163–258](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L163-L258) (architecture contract/implemented section) | [R10](V1-REQUIREMENTS-2026-09-06.md#r10); V1 |

| <a id="u228"></a> U228 | [docs/ARCHITECTURE.md:259–272](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L259-L272) (architecture contract/implemented section) | [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u229"></a> U229 | [docs/ARCHITECTURE.md:273–288](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L273-L288) (architecture contract/implemented section) | [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u230"></a> U230 | [docs/ARCHITECTURE.md:289–292](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L289-L292) (architecture contract/implemented section) | [R23](V1-REQUIREMENTS-2026-09-06.md#r23); V1 |

| <a id="u231"></a> U231 | [docs/ARCHITECTURE.md:293–302](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L293-L302) (architecture contract/implemented section) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R24](V1-REQUIREMENTS-2026-09-06.md#r24); V1 |

| <a id="u232"></a> U232 | [docs/ARCHITECTURE.md:303–306](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L303-L306) (architecture contract/implemented section) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32); V1 |

| <a id="u233"></a> U233 | [docs/ARCHITECTURE.md:307–310](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L307-L310) (architecture contract/implemented section) | [R33](V1-REQUIREMENTS-2026-09-06.md#r33); V1 |

| <a id="u234"></a> U234 | [docs/ARCHITECTURE.md:311–314](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L311-L314) (architecture contract/implemented section) | [R28](V1-REQUIREMENTS-2026-09-06.md#r28); V1 |

| <a id="u235"></a> U235 | [docs/ARCHITECTURE.md:315–316](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L315-L316) (architecture contract/implemented section) | [R06](V1-REQUIREMENTS-2026-09-06.md#r06), [R07](V1-REQUIREMENTS-2026-09-06.md#r07), [R08](V1-REQUIREMENTS-2026-09-06.md#r08), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R36](V1-REQUIREMENTS-2026-09-06.md#r36); V1 |

| <a id="u236"></a> U236 | [docs/ARCHITECTURE.md:317–378](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L317-L378) (architecture contract/implemented section) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26); V1 |

| <a id="u237"></a> U237 | [docs/ARCHITECTURE.md:379–478](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L379-L478) (architecture contract/implemented section) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26); V1 |

| <a id="u238"></a> U238 | [docs/ARCHITECTURE.md:479–499](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L479-L499) (architecture contract/implemented section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09); V1 |

| <a id="u239"></a> U239 | [docs/ARCHITECTURE.md:500–501](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L500-L501) (architecture contract/implemented section) | [R52](V1-REQUIREMENTS-2026-09-06.md#r52); V1 |

| <a id="u240"></a> U240 | [docs/ARCHITECTURE.md:502–518](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L502-L518) (architecture contract/implemented section) | [R05](V1-REQUIREMENTS-2026-09-06.md#r05), [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R36](V1-REQUIREMENTS-2026-09-06.md#r36); V1 |

| <a id="u241"></a> U241 | [docs/ARCHITECTURE.md:519–522](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L519-L522) (architecture contract/implemented section) | [R15](V1-REQUIREMENTS-2026-09-06.md#r15); V1 |

| <a id="u242"></a> U242 | [docs/ARCHITECTURE.md:523–526](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L523-L526) (architecture contract/implemented section) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R10](V1-REQUIREMENTS-2026-09-06.md#r10); V1 |

| <a id="u243"></a> U243 | [docs/ARCHITECTURE.md:527–530](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L527-L530) (architecture contract/implemented section) | [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u244"></a> U244 | [docs/ARCHITECTURE.md:531–534](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L531-L534) (architecture contract/implemented section) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R50](V1-REQUIREMENTS-2026-09-06.md#r50); V1 |

| <a id="u245"></a> U245 | [docs/ARCHITECTURE.md:535–538](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L535-L538) (architecture contract/implemented section) | [R52](V1-REQUIREMENTS-2026-09-06.md#r52); V1 |

| <a id="u246"></a> U246 | [docs/ARCHITECTURE.md:539–556](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L539-L556) (architecture contract/implemented section) | [R52](V1-REQUIREMENTS-2026-09-06.md#r52); V1 |

| <a id="u247"></a> U247 | [docs/ARCHITECTURE.md:557–563](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L557-L563) (architecture contract/implemented section) | [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u248"></a> U248 | [docs/ARCHITECTURE.md:564–570](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L564-L570) (architecture contract/implemented section) | [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u249"></a> U249 | [docs/ARCHITECTURE.md:571–582](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L571-L582) (architecture contract/implemented section) | [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |

| <a id="u250"></a> U250 | [docs/ARCHITECTURE.md:583–635](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L583-L635) (architecture contract/implemented section) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R50](V1-REQUIREMENTS-2026-09-06.md#r50); V1 |

| <a id="u251"></a> U251 | [docs/ARCHITECTURE.md:636–670](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L636-L670) (architecture contract/implemented section) | [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u252"></a> U252 | [docs/ARCHITECTURE.md:671–689](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L671-L689) (architecture contract/implemented section) | [R54](V1-REQUIREMENTS-2026-09-06.md#r54), [R42](V1-REQUIREMENTS-2026-09-06.md#r42); V1 |

| <a id="u253"></a> U253 | [docs/ARCHITECTURE.md:690–725](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L690-L725) (architecture contract/implemented section) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R46](V1-REQUIREMENTS-2026-09-06.md#r46); V1 |

| <a id="u254"></a> U254 | [docs/ARCHITECTURE.md:726–732](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L726-L732) (architecture contract/implemented section) | [R45](V1-REQUIREMENTS-2026-09-06.md#r45); V1 |

| <a id="u255"></a> U255 | [docs/ARCHITECTURE.md:733–740](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L733-L740) (architecture contract/implemented section) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R50](V1-REQUIREMENTS-2026-09-06.md#r50); V1 |

| <a id="u256"></a> U256 | [docs/ARCHITECTURE.md:741–780](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L741-L780) (architecture contract/implemented section) | [R20](V1-REQUIREMENTS-2026-09-06.md#r20); V1 |

| <a id="u257"></a> U257 | [docs/ARCHITECTURE.md:781–830](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L781-L830) (architecture contract/implemented section) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36); V1 |

| <a id="u258"></a> U258 | [docs/ARCHITECTURE.md:831–846](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L831-L846) (architecture contract/implemented section) | [R25](V1-REQUIREMENTS-2026-09-06.md#r25); V1 |

| <a id="u259"></a> U259 | [docs/ARCHITECTURE.md:847–868](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L847-L868) (architecture contract/implemented section) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u260"></a> U260 | [docs/ARCHITECTURE.md:869–908](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L869-L908) (architecture contract/implemented section) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u261"></a> U261 | [docs/ARCHITECTURE.md:909–931](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L909-L931) (architecture contract/implemented section) | [R28](V1-REQUIREMENTS-2026-09-06.md#r28); V1 |

| <a id="u262"></a> U262 | [docs/ARCHITECTURE.md:932–954](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L932-L954) (architecture contract/implemented section) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u263"></a> U263 | [docs/ARCHITECTURE.md:955–1006](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L955-L1006) (architecture contract/implemented section) | [R27](V1-REQUIREMENTS-2026-09-06.md#r27); V1 |

| <a id="u264"></a> U264 | [docs/ARCHITECTURE.md:1007–1072](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L1007-L1072) (architecture contract/implemented section) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30); V1 |

| <a id="u265"></a> U265 | [docs/ARCHITECTURE.md:1073–1117](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L1073-L1117) (architecture contract/implemented section) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u266"></a> U266 | [docs/ARCHITECTURE.md:1118–1141](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L1118-L1141) (architecture contract/implemented section) | [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u267"></a> U267 | [docs/ARCHITECTURE.md:1142–1179](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L1142-L1179) (architecture contract/implemented section) | [R39](V1-REQUIREMENTS-2026-09-06.md#r39); V1 |

| <a id="u268"></a> U268 | [docs/ARCHITECTURE.md:1180–1186](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L1180-L1186) (architecture contract/implemented section) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u269"></a> U269 | [docs/ARCHITECTURE.md:506–506](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L506-L506) (numeric acceptance) | [R05](V1-REQUIREMENTS-2026-09-06.md#r05); V1 |

| <a id="u270"></a> U270 | [docs/ARCHITECTURE.md:507–507](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L507-L507) (numeric acceptance) | [R05](V1-REQUIREMENTS-2026-09-06.md#r05); V1 |

| <a id="u271"></a> U271 | [docs/ARCHITECTURE.md:508–508](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L508-L508) (numeric acceptance) | [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R36](V1-REQUIREMENTS-2026-09-06.md#r36); V1 |

| <a id="u272"></a> U272 | [docs/ARCHITECTURE.md:509–509](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L509-L509) (numeric acceptance) | [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R36](V1-REQUIREMENTS-2026-09-06.md#r36); V1 |

| <a id="u273"></a> U273 | [docs/ARCHITECTURE.md:510–510](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L510-L510) (numeric acceptance) | [R03](V1-REQUIREMENTS-2026-09-06.md#r03); V1 |

| <a id="u274"></a> U274 | [docs/ARCHITECTURE.md:511–511](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L511-L511) (numeric acceptance) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u275"></a> U275 | [docs/ARCHITECTURE.md:512–512](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L512-L512) (numeric acceptance) | [R29](V1-REQUIREMENTS-2026-09-06.md#r29); V1 |

| <a id="u276"></a> U276 | [docs/ARCHITECTURE.md:513–513](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L513-L513) (numeric acceptance) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11); V1 |

| <a id="u277"></a> U277 | [docs/ARCHITECTURE.md:514–514](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L514-L514) (numeric acceptance) | [R11](V1-REQUIREMENTS-2026-09-06.md#r11); V1 |

| <a id="u278"></a> U278 | [docs/ARCHITECTURE.md:515–515](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L515-L515) (numeric acceptance) | [R35](V1-REQUIREMENTS-2026-09-06.md#r35); V1 |

| <a id="u279"></a> U279 | [docs/ARCHITECTURE.md:516–516](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L516-L516) (numeric acceptance) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20); V1 |

| <a id="u280"></a> U280 | [docs/ARCHITECTURE.md:517–517](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/ARCHITECTURE.md#L517-L517) (numeric acceptance) | [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u281"></a> U281 | [docs/adr/0008-music-video-workspace.md:1–70](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/adr/0008-music-video-workspace.md#L1-L70) (accepted Film lifecycle) | [R41](V1-REQUIREMENTS-2026-09-06.md#r41), [R55](V1-REQUIREMENTS-2026-09-06.md#r55); V1 |

| <a id="u282"></a> U282 | [PRODUCT.md:1–28](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/PRODUCT.md#L1-L28) (focused songwriting scope; latest V1 decision governs remainder) | [R40](V1-REQUIREMENTS-2026-09-06.md#r40), [R53](V1-REQUIREMENTS-2026-09-06.md#r53); V1 |

| <a id="u283"></a> U283 | [docs/DESIGN.md:1–192](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/DESIGN.md#L1-L192) (design acceptance) | [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R47](V1-REQUIREMENTS-2026-09-06.md#r47); V1 |

| <a id="u284"></a> U284 | [docs/plan/02-working-method.md:1–88](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/02-working-method.md#L1-L88) (working method) | [R49](V1-REQUIREMENTS-2026-09-06.md#r49), [R50](V1-REQUIREMENTS-2026-09-06.md#r50), [R52](V1-REQUIREMENTS-2026-09-06.md#r52); V1 |

| <a id="u285"></a> U285 | [docs/plan/06-owner-verification.md:1–25](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/06-owner-verification.md#L1-L25) (owner procedure; personal checks V2) | [R52](V1-REQUIREMENTS-2026-09-06.md#r52); V1 |

| <a id="u286"></a> U286 | [docs/plan/01-context.md:1–96](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/01-context.md#L1-L96) (context) | [R02](V1-REQUIREMENTS-2026-09-06.md#r02), [R53](V1-REQUIREMENTS-2026-09-06.md#r53); V1 |

| <a id="u287"></a> U287 | [docs/plan/04-research.md:1–176](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/04-research.md#L1-L176) (protocol/license research) | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R25](V1-REQUIREMENTS-2026-09-06.md#r25), [R51](V1-REQUIREMENTS-2026-09-06.md#r51); V1 |

| <a id="u288"></a> U288 | [docs/plan/05-kickoff.md:1–64](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/6b3a4c6fe07838a3f69dd5db4c497d0d39884584/docs/plan/05-kickoff.md#L1-L64) (toolchain prerequisite) | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R49](V1-REQUIREMENTS-2026-09-06.md#r49); V1 |
