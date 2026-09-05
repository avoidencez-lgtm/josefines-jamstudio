# E2E completion and known gaps — 2026-09-05

PR #77 resumes Claude's saved testing work. Native commands run on Tauri's mock
runtime; frontend store scenarios use the preview engine. Built desktop smoke
checks startup on Windows and macOS. These complement each other; they do not
replace mouse-driven or physical-hardware acceptance testing.

## Completion changes

- Finished seven native scenario files and four frontend scenario files.
- Each native scenario serializes access to its process-specific temporary root,
  resets its files and may boot multiple studios inside that scenario. This
  prevents cross-test settings/library contamination without new dependencies.
- The telemetry scenario runs one mock event-loop iteration to execute the real
  setup hook. Building a Tauri app alone does not run setup. The narrowly allowed
  deprecated call is one-shot, never a busy loop.
- Corrected the bundled Fractal ID, checked each test's own document instead of
  global library counts, accounted for energy-follow intensity and waited for
  complete chart-load telemetry before asserting mutes.
- Fresh Windows/macOS CI exposed two asynchronous snapshot assumptions: the
  input-gap counter may advance between status reads, and the first tuner pitch
  window can be skewed by startup gaps. The tests now check a monotonic counter
  and await a captured tuner snapshot within the original five-cent tolerance.
- Fixed frontend lint/formatting, formatted Rust scenarios and corrected the
  nonexistent `tests/e2e/stage.test.ts` documentation command.

## Explicitly excluded regressions

Claude's draft already contained these **14 skipped/ignored repro candidates**.
They remain visible and excluded from passing coverage; no active failing test
was changed to skipped. They describe behavior changes or bug fixes outside this
harness completion. Some need product decisions: take deletion currently hides
its manifest and preserves audio; this PR does not make deletion irreversible.
These candidates are not proof that every stated behavior is a confirmed defect.
Three older optional Rust unit tests are also ignored independently of this list.

| File | Scenario | Draft's stated reason |
|---|---|---|
| `src-tauri/tests/ipc_library.rs` | `an_inline_chart_sets_the_transport_tempo_like_a_library_chart_does` | app bug: band_load_chart_inline adopts the chart's meter and style but not its defaultBpm |
| `src-tauri/tests/ipc_net.rs` | `keys_set_names_the_length_limit_when_the_key_is_too_long` | app bug: a 4097-byte key is refused with the 'non-empty' message, which never mentions the length limit |
| `src-tauri/tests/ipc_net.rs` | `cost_log_lives_under_the_user_root_and_starts_empty` | app bug: the headless cost log is one fixed file in the OS temp folder shared by every process, not under JAM_USER_DIR |
| `src-tauri/tests/ipc_originals.rs` | `audition_of_a_take_whose_audio_file_is_missing_names_the_take_or_file` | app bug: clip_audition reports a missing take file as a bare OS error naming neither the take nor the file |
| `src-tauri/tests/ipc_originals.rs` | `save_refuses_a_document_without_a_version_list` | app bug: originals_save accepts a document without `versions`, which originals_list then reports as damaged |
| `src-tauri/tests/ipc_rig_media.rs` | `rig_send_program_refuses_a_program_above_127` | app bug: rig_send_program masks a program above 127 (200 is sent as PC 72) instead of refusing it the way rig_set_control refuses CC 200 |
| `src-tauri/tests/ipc_rig_media.rs` | `media_refresh_names_an_unknown_job_id` | app bug: media_refresh with an unknown job id answers with a raw OS error (\"os error 2\") that does not name the job |
| `src-tauri/tests/ipc_rig_media.rs` | `media_render_names_a_missing_soundtrack_asset` | app bug: media_render with an audioId that has no asset document answers with a raw OS error (\"os error 2\") that does not name the asset |
| `src-tauri/tests/ipc_takes.rs` | `takes_delete_removes_the_take_folder_from_disk` | app bug: takes_delete only flags take.json hidden; the folder the UI promises to delete permanently stays on disk |
| `tests/e2e/rooms.test.ts` | preview candidate | app bug: preview rig_set_section_mapping accepts sceneIdx -1 (the desktop rejects it) and then throws inside tick when the section plays |
| `tests/e2e/rooms.test.ts` | preview candidate | app bug: preview rig_set_control logs CC 200 as MIDI instead of rejecting it like the desktop (CC above 127) |
| `tests/e2e/sessions.test.ts` | preview candidate | app bug: stopping when nothing is recording invents a zero-second take in the preview instead of refusing like the desktop (No active recording) |
| `tests/e2e/sessions.test.ts` | preview candidate | app bug: starting a second take while one is recording silently restarts in the preview instead of refusing like the desktop (A take is already recording) |
| `tests/e2e/sessions.test.ts` | preview candidate | app bug: a preview take reports sessionId "preview" instead of the session it was recorded for, so Write cannot group it under its song |

Run a selected native candidate with `JAM_HEADLESS=1 cargo test -p src-tauri --test
<file> <scenario> -- --ignored`; keep `JAM_LIVE` unset. Frontend candidates remain
`it.skip` until their production behavior is deliberately addressed. Never count
ignored or skipped scenarios as passing tests.

## Validation and limits

The full local frontend run passed 160 tests in 26 files, with 5 candidates skipped.
The Windows desktop smoke completed its frontend handshake and exited 0 after 25 seconds. The full native workspace passed 223 tests, with 12 ignored (9 draft candidates plus 3 older optional tests); its exact CI results are attached to PR #77.
No paid providers, installed-agent requests or physical audio/MIDI hardware were
used. The initial Windows run blocked one new executable through Application
Control; a normal later run executed it without changing policy. Initial sandbox
TypeScript resolution errors disappeared with normal dependency access.

The work was recovered from `C:\Users\Vegar\Claude\josefines-jamstudio` at
`86b483d`, backed up before changes, and completed sequentially. Physical owner
gates remain open. Ponytail review retained the existing harness and dependencies;
file-sandbox serialization is the deliberate ceiling until per-AppState paths
are needed. The review removed redundant per-area locks, duplicate clean-boot
logic and media busy-retry wrappers after shared scenario isolation made them
unnecessary. An initial Vite build printed a Node shutdown assertion; a repeat
completed cleanly with exit code 0.

The CI timing follow-up passed all 13 settings scenarios six consecutive times
locally and passed Clippy/format checks. A full local rerun then hit Windows
Application Control error 4551 on an unchanged native executable; one normal
retry progressed further but blocked another unchanged executable. No system
policy was changed. The full fresh Windows/macOS CI run remains the merge gate.
