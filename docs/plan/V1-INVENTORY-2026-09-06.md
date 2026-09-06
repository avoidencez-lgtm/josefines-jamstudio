# V1 open issue and PR reconciliation — 2026-09-06

Observed 2026-09-06T17:26:55.645616+00:00; main `6b3a4c6fe07838a3f69dd5db4c497d0d39884584`. **42 issues / 30 PRs**, all open at this snapshot. Exact heads, bases, changed-file lists, diff hashes and all five check links are in [snapshot](V1-SNAPSHOT-2026-09-06.json). The lists below contain each number exactly once; repeated links in the requirements are cross-references. No merge/closure is proposed as an automatic action.

## Issues

| Issue | Requirements | Status and disposition |
|---|---|---|

| [#35](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/35) [P3] Cmd+Q on macOS likely bypasses the unsaved-work close guard | [R46](V1-REQUIREMENTS-2026-09-06.md#r46) | **Implemented guard; native verification pending.** ExitRequested now routes through close protection. Preserve developer macOS CmdQ test; only friend-specific Mac session is V2. |

| [#45](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/45) [P3] Small follow-ups from the September reviews | [R33](V1-REQUIREMENTS-2026-09-06.md#r33), [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R40](V1-REQUIREMENTS-2026-09-06.md#r40), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R50](V1-REQUIREMENTS-2026-09-06.md#r50) | **Mixed: earlier fixes plus unverified provider catalog.** Meter message/lyric duplication/rig persistence/phantom snapshot have later fixes; inspect current originals, Jo context and Settings buffer wording in T43. Catalog model IDs still require T01/T26 primary/provider acceptance; no bulk closure. |

| [#46](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/46) Review follow-ups after #28 (tracking) | [R40](V1-REQUIREMENTS-2026-09-06.md#r40), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R49](V1-REQUIREMENTS-2026-09-06.md#r49), [R50](V1-REQUIREMENTS-2026-09-06.md#r50) | **Historical tracking, not a second implementation backlog.** Parent checklist refers to old review #28/#29 and fixes #66–74; open child titles are not current implementation evidence. Remaining themes are mapped here; maintainer may reconcile checkboxes after individual evidence, never auto-close tracker. |

| [#141](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/141) [bugsweep] Take analysis invents timing and dynamics scores (silence scores 100/100, no take can score below 65/70 %) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37) | **Partially fixed on main.** Artificial score floors removed and nullable measurements persisted; constant-grid timing/bends/chord agreement and grounded review remain T31/T32. |

| [#142](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/142) [bugsweep] Exported band MIDI misses cue hits and note-offs at loop wraps / stop / ending (hanging notes in REAPER) | [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R39](V1-REQUIREMENTS-2026-09-06.md#r39) | **Open defect; #228 needs repair.** Cue and termination MIDI parity needs event/span chronology test, not only helper note-off test; see #228 and #245. |

| [#143](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/143) [bugsweep] Follow-energy re-clones the pattern every 256-frame block and can switch intensity tiers mid-bar | [R17](V1-REQUIREMENTS-2026-09-06.md#r17) | **Open defect; #234 incomplete.** Pattern cloned/tier chosen perblock; queued auto tier in PR survives disable. T10 handles priority and cancellation. |

| [#144](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/144) [bugsweep] Engine robustness follow-ups: SMF VLQ panic, unbounded tempo/meter in export, hung device open joins forever, silent DI-channel fallback, one-sided humanise jitter, tuner gate at -26 dBFS | [R04](V1-REQUIREMENTS-2026-09-06.md#r04), [R05](V1-REQUIREMENTS-2026-09-06.md#r05), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R16](V1-REQUIREMENTS-2026-09-06.md#r16), [R39](V1-REQUIREMENTS-2026-09-06.md#r39) | **Mixed robustness tracker.** Export VLQ/tempo/meter now strictly reject invalid input on main; #235 saturation is superseded there. Device timeout/DI #236, jitter #245, tuner #246, loopbounds/repeats #237 and native chart meter validation remain separately assessed. |

| [#145](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/145) [bugsweep] Charts and styles drop unknown JSON fields on rewrite and no registry checks schemaVersion (invariant 6) | [R08](V1-REQUIREMENTS-2026-09-06.md#r08) | **Open preservation gap.** #224 only selected structs; T03 checks nested fields and actual TS/native saves plus schema refusal. |

| [#147](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/147) [bugsweep] Media generation cannot be cancelled: a hung provider blocks all media work and the close guard for up to 10 minutes | [R25](V1-REQUIREMENTS-2026-09-06.md#r25), [R41](V1-REQUIREMENTS-2026-09-06.md#r41) | **Open cancellation gap.** #232 HTTP select helps responsiveness but cost receipt ordering and current stem callers need repair; T04. |

| [#149](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/149) [bugsweep] Takes deleted outside the app stay listed until manually removed; insert_take failures are handled inconsistently; SQLite has no busy_timeout | [R07](V1-REQUIREMENTS-2026-09-06.md#r07) | **Open cache gap.** #223 candidate after rebase; file truth plus cache failure behavior checked in T02. |

| [#153](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/153) [bugsweep] Installed agents: cancelling an npm .cmd shim kills cmd.exe but leaves node.exe running; executable path is only checked for absolute + extension | [R41](V1-REQUIREMENTS-2026-09-06.md#r41) | **Open process lifecycle/security gap.** #249 does not yet prove descendant termination/timeout cleanup; benign subprocess test and executable boundary audit T04; no agent launch here. |

| [#156](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/156) [bugsweep] The controls/ seam is a phantom: black-spirit-200.json has no bindings, ControlMapManifest has no consumer, and the seams test validates a file nothing reads | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R18](V1-REQUIREMENTS-2026-09-06.md#r18) | **Open V1 consumer/proof gap.** Real controller.json is consumed; controls manifests are not. #252 only documents that fact. Do not delete required control-map capability by treating documentation as implementation. |

| [#158](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/158) main has no branch protection or ruleset: CI is not a merge gate, force-push and direct push are allowed | [R49](V1-REQUIREMENTS-2026-09-06.md#r49) | **Verified admin prerequisite.** GET main/protection returned404 Branch not protected; rulesets[] at audit. Configure only under separate admin authority; local policy and green CI do not enforce GitHub protection. |

| [#159](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/159) CI hardening: Dependabot, scheduled advisory scan, SHA-pinned actions, concurrency cancellation, job timeouts, MSRV job, --locked, pnpm cache | [R01](V1-REQUIREMENTS-2026-09-06.md#r01), [R49](V1-REQUIREMENTS-2026-09-06.md#r49) | **Hardening backlog; separate required gates from options.** Current five CI jobs pass main. No explicit action-SHA pinning/scheduled advisory/MSRV job/concurrency/timeouts/locked-Rust assurance; T41 assesses changes. Dependabot/cache/matrix TS are engineering choices, not invented V1 musical gates. |

| [#160](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/160) Release process: the only tag (v0.1.0) points at the "100% BUILD COMPLETE" stub commit and never produced a release; release.yml attaches no checksums and does not depend on CI | [R48](V1-REQUIREMENTS-2026-09-06.md#r48) | **Release prerequisite open.** No releases returned. Old v0.1.0 tag is not current app acceptance; release workflow draft builds have no CI dependency/checksums. T44 prepares tested candidate; no tag change/publish authorized. |

| [#161](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/161) Repo hygiene: issue/PR templates, P1 + area labels, milestones matching the status board, CONTRIBUTING, SECURITY.md, CODEOWNERS, changelog | [R49](V1-REQUIREMENTS-2026-09-06.md#r49), [R50](V1-REQUIREMENTS-2026-09-06.md#r50) | **Repository hygiene proposal; mostly outside required feature scope.** CONTRIBUTING/templates/labels/milestones/CODEOWNERS/changelog are optional process choices. Security disclosure/gate documentation belongs T41/T43; no new framework or mandatory blanket file set. |

| [#162](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/162) docs: ARCHITECTURE.md describes a repository layout, IPC contract, provider traits, data model, capabilities and logging that do not match the tree; split "as built" from "target design" | [R10](V1-REQUIREMENTS-2026-09-06.md#r10), [R50](V1-REQUIREMENTS-2026-09-06.md#r50) | **Current/target documentation still mixed.** App is largely consolidated lib.rs/native modules; old src/ai/domain layout/Provider traits remain target text. Preserve architecture and distinguish concrete paths; T43, not broad product rewrite. |

| [#163](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/163) docs: status board marks M0, M1b and M1d complete with unmet acceptance criteria; ARCHITECTURE section 9.1-9.3 lists tolerance tests that do not exist | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R50](V1-REQUIREMENTS-2026-09-06.md#r50), [R51](V1-REQUIREMENTS-2026-09-06.md#r51) | **Confirmed acceptance/evidence debt.** Historical M0/M1b/M1d ticks are not passes: placeholder assets, no consumed controlmap proof, synthetic goldens insufficient; this ledger supersedes status inference. |

| [#164](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/164) docs: stale paths, commands and recipes in AGENTS.md, plan, DESIGN.md, EXTENDING.md, ADR 0006 and the spike files | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R50](V1-REQUIREMENTS-2026-09-06.md#r50), [R51](V1-REQUIREMENTS-2026-09-06.md#r51) | **Partly updated, still stale recipes/commands.** New S3/S4/S5/native appendices help; older package/path/provider commands and fixture assumptions persist. T42 executes recipes; T43 repairs docs without deleting requirements. |

| [#172](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/172) [bugsweep] Offline Jo parser answers "Got it!" to anything, re-runs after provider failures and can execute transport commands the user did not ask for; style ids are hard-coded outside the registry | [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R42](V1-REQUIREMENTS-2026-09-06.md#r42) | **Partly fixed; parser/cancel residual.** No blanket Got it/provider-error fallback on current path. #247 registry parser still steals stop straight away; overlap new load-song/reference branches. T27. |

| [#173](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/173) [bugsweep] UI robustness follow-ups: solo helper misreads CM/sus2, Film undo per keystroke, optimistic state not rolled back, numeric nits, circular save-conflict message, raw ZodError blobs | [R16](V1-REQUIREMENTS-2026-09-06.md#r16), [R21](V1-REQUIREMENTS-2026-09-06.md#r21), [R40](V1-REQUIREMENTS-2026-09-06.md#r40), [R42](V1-REQUIREMENTS-2026-09-06.md#r42), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R46](V1-REQUIREMENTS-2026-09-06.md#r46) | **Open mixed UI fixes.** CM/sus2 #238, Filmundo #239, numeric/time #240, optimistic #241, Writecopy #242, errors #243, subscriptions #244, Filmcopy #248 each separately evaluated; green CI does not settle review defects. |

| [#174](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/174) docs: manual and DESIGN.md promises that the UI does not keep (Save video vs Save project, Escape-from-help, 48 kHz claim, Songs formats, design tokens) | [R03](V1-REQUIREMENTS-2026-09-06.md#r03), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45), [R50](V1-REQUIREMENTS-2026-09-06.md#r50) | **Partly stale descriptions; UI/help audit remains.** Native Songs supports formats now; bilingual manual has freshness tests. Actual48 kHz gap remains R03; labels/Escape/tokens and historical DESIGN voice promises require T38/T43. |

| [#175](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/175) feat: real instrument sounds - asset pipeline (manifest, SHA-256 download, assets_ensure) plus a CC0 multisampled drum kit and SoundFont bass/keys | [R12](V1-REQUIREMENTS-2026-09-06.md#r12), [R13](V1-REQUIREMENTS-2026-09-06.md#r13), [R14](V1-REQUIREMENTS-2026-09-06.md#r14), [R15](V1-REQUIREMENTS-2026-09-06.md#r15) | **Missing real asset/instrument delivery.** Do not count sine-based Sf2Synth and empty SHA as completed band. T16–18 plus T40 musical/performance evidence. |

| [#176](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/176) feat: automatic latency calibration by loopback, with the engine reporting its own lookahead (M1e) | [R19](V1-REQUIREMENTS-2026-09-06.md#r19) | **PR-only implementation; physical gate open.** #274 at recorded head is candidate under no-merge hold; requires fixed-rate integration, estimate semantics and five-run developer loopback evidence. |

| [#177](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/177) feat: Jo by voice - push-to-talk, STT, TTS, voice bus with ducking, 30-utterance fixture (M2) | [R22](V1-REQUIREMENTS-2026-09-06.md#r22), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R24](V1-REQUIREMENTS-2026-09-06.md#r24) | **Implemented speech path, incomplete acceptance.** PTT/globalkey/pedal/nativeSTT/TTS/duck exist; 30 recorded utterances and live 10turnmedian remain V1 developer gates. |

| [#178](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/178) feat: real songs - stem separation, beats/chords/key analysis, minus-guitar mix and time-stretch/transpose (M3) | [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R27](V1-REQUIREMENTS-2026-09-06.md#r27), [R28](V1-REQUIREMENTS-2026-09-06.md#r28), [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30) | **Extensive main implementation; M3 incomplete.** Native import/canonical storage, stems, stretch/transposition/manualgrids/ramps exist. Automatic provider analysis/recorded shapes/known-stem≤−6dB and device listening remain; residual gate is not silently V2. |

| [#179](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/179) feat: Lyria RealTime steerable stream on the ai bus, plus generated tracks landing analysed in the library (M4) | [R31](V1-REQUIREMENTS-2026-09-06.md#r31), [R32](V1-REQUIREMENTS-2026-09-06.md#r32), [R33](V1-REQUIREMENTS-2026-09-06.md#r33) | **Stream absent; generation partial.** S4 standalone synthetic probe not app. Reuse generation/import; T24–26 contract/buffer/UI/cost/live acceptance. |

| [#180](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/180) feat: rig scheduler with 50 ms lookahead on the timeline, MIDI clock, panic, dry-run and CC learn mode (M5 remainder) | [R34](V1-REQUIREMENTS-2026-09-06.md#r34), [R35](V1-REQUIREMENTS-2026-09-06.md#r35) | **Partial rig, scheduler/clock/panic missing.** Current scenes called by telemetry, MemorySink logging exists; dedicated50 ms worker/24 ppqn/panic and virtualport acceptance T15/T15b. Personal HeadRush+BlackSpirit V2. |

| [#181](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/181) feat: LLM take review from evidence, progress trends over the last 20 takes, SMF round-trip test (M6 remainder) | [R36](V1-REQUIREMENTS-2026-09-06.md#r36), [R37](V1-REQUIREMENTS-2026-09-06.md#r37), [R38](V1-REQUIREMENTS-2026-09-06.md#r38), [R39](V1-REQUIREMENTS-2026-09-06.md#r39) | **Analysis/export partial; review/trends absent.** SMF reparse/recorded reference tempo map now implemented. Do not rebuild; still bend-aware analysis/structuredreview/last20/exporttime/alignment acceptance. |

| [#182](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/182) feat: onboarding wizard (devices, latency, keys with "test key", rig ports, assets), diagnostics log export, and code signing / notarisation (M7 remainder) | [R43](V1-REQUIREMENTS-2026-09-06.md#r43), [R46](V1-REQUIREMENTS-2026-09-06.md#r46), [R48](V1-REQUIREMENTS-2026-09-06.md#r48) | **Onboarding/diagnostics/release prerequisites open.** Settings are not the wizard. Signing historically backlog but latest V1 decision says prerequisite stays open pending completion or explicit owner decision. No account/signing change authorized here. |

| [#183](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/183) feat: extensibility proofs - six synthetic seam fixtures, a changed-files scope check, a Rust IPC_VERSION mirror and a TS/Rust contract round-trip test (DoD 9, invariant 12) | [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R10](V1-REQUIREMENTS-2026-09-06.md#r10) | **Open full seam/contract proof.** Existing tests validate bundles and some fixture consumers; not all six additions with zero core changes or every EXTENDING recipe. T42 lists each. |

| [#184](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/184) decision: invariant 2 "48 kHz internally, always" is not implemented - the engine follows the device rate; implement edge resampling or supersede the invariant by ADR | [R03](V1-REQUIREMENTS-2026-09-06.md#r03) | **Implementation required; architecture decision already retained.** User explicitly preserves48 kHz invariant. Choose edge resampling (T07); do not use issue alternative to supersede ADR/rules. |

| [#185](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/185) feat: guitarist-facing engine features that fall out of existing seams - loop-pass takes, bar-quantised capture keep, chord markers in the tempo map, loop tempo trainer, section count-in | [R11](V1-REQUIREMENTS-2026-09-06.md#r11), [R20](V1-REQUIREMENTS-2026-09-06.md#r20), [R30](V1-REQUIREMENTS-2026-09-06.md#r30), [R39](V1-REQUIREMENTS-2026-09-06.md#r39) | **Mixed suggestions and accepted overlaps.** Reference loop tempo ramp is now implemented (plus #269 residual); bar-quantised recording/count-in and chordmarkers overlap V1. Loop-pass takes/section-specific count-in enhancements require separate acceptance before expanding V1. |

| [#186](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/186) improvement: app-layer housekeeping - native file picker for imports, open_url/reveal-in-folder, single instance, usage-log rotation, media_delete, settings range validation and schemaVersion gate, cost:state from media/agent calls | [R06](V1-REQUIREMENTS-2026-09-06.md#r06), [R25](V1-REQUIREMENTS-2026-09-06.md#r25), [R26](V1-REQUIREMENTS-2026-09-06.md#r26), [R41](V1-REQUIREMENTS-2026-09-06.md#r41), [R46](V1-REQUIREMENTS-2026-09-06.md#r46) | **Mixed implementation, required safety and optional enhancements.** Native Songs picker/drop and open_url exist; Film picker/reveal, settings validation and accounting/diagnostics remain. Single-instance/media-delete/dead-command tidy are proposals unless a concrete data-loss requirement needs them. |

| [#187](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/187) improvement: UI affordances a guitarist will miss - Undo/Redo shortcuts, persistent tempo and bar:beat readout, recording counter, Jo echoes applied state, take notes/rename, error boundary | [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R21](V1-REQUIREMENTS-2026-09-06.md#r21), [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R46](V1-REQUIREMENTS-2026-09-06.md#r46) | **Mixed affordances and accepted workflows.** Take notes/rating are M1e; applied Jo replies and Stage readouts/shortcuts are required. Rename/general error-boundary/extra counters need bounded demonstrated need; no broad UI rewrite. |

| [#254](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/254) [bugsweep] Replacing a reference still plays the previous song from the output ring | [R29](V1-REQUIREMENTS-2026-09-06.md#r29) | **Open source-switch defect.** #255 addresses stale output but fails to clear live serial when loading chart/original; T08 tests all transitions. |

| [#259](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/259) [bugsweep] Offline Jo swallows loop-the-verse while a reference is loaded | [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R18](V1-REQUIREMENTS-2026-09-06.md#r18) | **Open parser regression.** #260 candidate for zero confirmed-section matches falling back to songwriting sections; preserve unique/ambiguous reference handling. |

| [#263](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/263) [bugsweep] Offline Jo load song keeps punctuation and and-play so the title misses | [R23](V1-REQUIREMENTS-2026-09-06.md#r23) | **Open song-query defect.** #264 handles plain trailing punctuation but quoted-title-plus-period still fails; exact helper reproduction retained. T27 also decides applied response to and play explicitly. |

| [#268](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/268) [bugsweep] Stop on a section-looped practice ramp counts bars before the loop | [R30](V1-REQUIREMENTS-2026-09-06.md#r30) | **Open late-loop Stop regression.** #269 candidate resets ramp Stop to section start and recorder snapshot; test with recorded tempo spans on integration base. |

| [#271](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/271) [bugsweep] Playing reference telemetry publishes prepared speed, not the speed in the output queue | [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30) | **Open heard-state reporting defect.** #272 candidate reads speed/semitones from consumed stamp. Reverify with #255 source changes and record snapshots. |

| [#275](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/275) [bugsweep] Band tempo while a reference is loaded claims there is no beat grid | [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R50](V1-REQUIREMENTS-2026-09-06.md#r50) | **Open error-message defect.** #276 candidate removes obsolete make-practice-copy instruction; both gridded/ungridded reference clock exclusion must remain truthful. |

| [#277](https://github.com/avoidencez-lgtm/josefines-jamstudio/issues/277) [bugsweep] Bracket transpose unloads a reference and starts the chart | [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R29](V1-REQUIREMENTS-2026-09-06.md#r29) | **Open bracket/source-switch defect.** #278 candidate guards shortcuts/store using current telemetry reference; verify actual native refusal and explicit chart-load behavior separately. |

## Pull requests

No submitted formal review is present on these 30 PRs in the fetched review endpoint. Substantive review/self-review discussion is on PR comments and was inspected; this is not independent approval. CodeRabbit skip notices (repository threshold) are not review passes. Source-only findings below require the stated integrated check; five exact-source JavaScript reproductions are documented in the baseline. No old PR full suite was rerun.

**CI scope:** all five observed head checks passed except #235 (both Rust jobs failed), #243 (TS Vitest assertions failed), and #260/#269 (TS Biome formatting failed). Green checks on an old PR do not certify its integration with this main. “dirty” below is GitHub mergeability conflict status, not a dirty author worktree. All target main; exact base SHAs remain per PR.

<a id="pr-223"></a>

### PR #223 — fix: drop take cache rows whose folder is gone

[223](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/223) · head `fed6f5e4fe43f426ec89d00a436872c31e8d8b9f` · base `4b7ea1f2667c6076cd6668bdbcd4649c15ccef6a` (`main`) · mergeability `dirty`.

Requirements: [R07](V1-REQUIREMENTS-2026-09-06.md#r07). **Disposition: Candidate after rebase.**

Removes ghostcache rows with missing WAV/manifest, sets5sbusy timeout, preserves saved capture on cache failure; conflicts with main take-path changes. Existing positive tests plus corruptmanifest/stale-source cases required.

CI: 5/5 passed; Comments inspected; no formal review submitted. [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993516009/job/101379827694); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993516009/job/101379827649); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993516009/job/101379827623); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993516009/job/101379827580); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993516009/job/101379827441).

Changed paths: [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/fed6f5e4fe43f426ec89d00a436872c31e8d8b9f/src-tauri/src/lib.rs), [src-tauri/src/originals.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/fed6f5e4fe43f426ec89d00a436872c31e8d8b9f/src-tauri/src/originals.rs), [src-tauri/src/store.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/fed6f5e4fe43f426ec89d00a436872c31e8d8b9f/src-tauri/src/store.rs), [src-tauri/tests/ipc_takes.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/fed6f5e4fe43f426ec89d00a436872c31e8d8b9f/src-tauri/tests/ipc_takes.rs).

<a id="pr-224"></a>

### PR #224 — fix: keep unknown chart and style fields on rewrite

[224](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/224) · head `e41a013f2430a79e482217e05b7002da5013b698` · base `4b7ea1f2667c6076cd6668bdbcd4649c15ccef6a` (`main`) · mergeability `clean`.

Requirements: [R08](V1-REQUIREMENTS-2026-09-06.md#r08). **Disposition: Needs repair/coverage.**

Adds top style/chart/section extras and future-version refusal; nested BarChord/arrangement/style pattern fields and TS reconstruction are not covered. Main does not have full preservation. Source inspection; no fresh native run.

CI: 5/5 passed; Comments inspected; no formal review submitted. [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993751591/job/101380442613); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993751591/job/101380442511); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993751591/job/101380442504); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993751591/job/101380442493); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33993751591/job/101380442455).

Changed paths: [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e41a013f2430a79e482217e05b7002da5013b698/crates/jam-audio/src/engine.rs), [crates/jam-band/src/sequencer.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e41a013f2430a79e482217e05b7002da5013b698/crates/jam-band/src/sequencer.rs), [crates/jam-core/src/chart.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e41a013f2430a79e482217e05b7002da5013b698/crates/jam-core/src/chart.rs), [crates/jam-core/src/registry.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e41a013f2430a79e482217e05b7002da5013b698/crates/jam-core/src/registry.rs), [crates/jam-core/src/style.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e41a013f2430a79e482217e05b7002da5013b698/crates/jam-core/src/style.rs), [crates/jam-rig/src/profiles.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e41a013f2430a79e482217e05b7002da5013b698/crates/jam-rig/src/profiles.rs), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e41a013f2430a79e482217e05b7002da5013b698/src-tauri/src/lib.rs), [src-tauri/src/library.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e41a013f2430a79e482217e05b7002da5013b698/src-tauri/src/library.rs).

<a id="pr-228"></a>

### PR #228 — fix: put cue hits and wrap note-offs in exported MIDI

[228](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/228) · head `25601fc7b0506d64811efe4bb9e746f9914d0621` · base `16c79a53e18d4c8761d8a69bbf298ad5f6b1011b` (`main`) · mergeability `clean`.

Requirements: [R15](V1-REQUIREMENTS-2026-09-06.md#r15), [R39](V1-REQUIREMENTS-2026-09-06.md#r39). **Disposition: Needs repair.**

RenderContext processes timeline events before rendering spans; cut before wrap cannot cut notes created later by prewrap render. Helper test misses integrated sequence. Coordinate #245; source/review finding, native repro blocked.

CI: 5/5 passed; Comments inspected; no formal review submitted. [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33995513798/job/101385264239); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33995513798/job/101385264181); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33995513798/job/101385264173); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33995513798/job/101385264165); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33995513798/job/101385264053).

Changed paths: [crates/jam-band/src/sequencer.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/25601fc7b0506d64811efe4bb9e746f9914d0621/crates/jam-band/src/sequencer.rs).

<a id="pr-230"></a>

### PR #230 — fix: honour reduced motion and name transport controls

[230](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/230) · head `e35c7c98e8d3c599bf4a5ea7b1b756e947aabcfc` · base `461360ef4563d0b3a027a7a854f88fef1a854881` (`main`) · mergeability `dirty`.

Requirements: [R44](V1-REQUIREMENTS-2026-09-06.md#r44), [R45](V1-REQUIREMENTS-2026-09-06.md#r45). **Disposition: Candidate after rebase.**

Reducedmotion and accessible names are useful; remote mergeability dirty. Recheck current Stage/reference/Jo controls and all animation paths; not full accessibility certification.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33996242181/job/101387186245); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33996242181/job/101387186222); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33996242181/job/101387186170); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33996242181/job/101387186154); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33996242181/job/101387186054).

Changed paths: [src/components/TransportBar.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e35c7c98e8d3c599bf4a5ea7b1b756e947aabcfc/src/components/TransportBar.tsx), [src/screens/Stage.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e35c7c98e8d3c599bf4a5ea7b1b756e947aabcfc/src/screens/Stage.tsx), [src/screens/studio.css](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e35c7c98e8d3c599bf4a5ea7b1b756e947aabcfc/src/screens/studio.css), [tests/invariants/studio-workspaces.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e35c7c98e8d3c599bf4a5ea7b1b756e947aabcfc/tests/invariants/studio-workspaces.test.ts).

<a id="pr-232"></a>

### PR #232 — fix: abort media generate and download when Cancel is pressed

[232](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/232) · head `f044891da122cbbdc6eff01dfc078ebefdab77c1` · base `275d709fa483f477da482d6775653cffbfe57448` (`main`) · mergeability `dirty`.

Requirements: [R25](V1-REQUIREMENTS-2026-09-06.md#r25), [R41](V1-REQUIREMENTS-2026-09-06.md#r41). **Disposition: Needs repair/rebase.**

select cancellation wraps requests but cost append is after awaited work, so cancelled paid/unknown attempt unlogged. Audit current stem upload/generation callers and correct operation-specific Cancel label. Source/review, no paid experiment.

CI: 5/5 passed; Comments inspected; no formal review submitted. [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998280936/job/101392511644); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998280936/job/101392511545); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998280936/job/101392511499); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998280936/job/101392511494); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998280936/job/101392511398).

Changed paths: [docs/ARCHITECTURE.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f044891da122cbbdc6eff01dfc078ebefdab77c1/docs/ARCHITECTURE.md), [docs/EXTENDING.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f044891da122cbbdc6eff01dfc078ebefdab77c1/docs/EXTENDING.md), [docs/guide/music-video.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f044891da122cbbdc6eff01dfc078ebefdab77c1/docs/guide/music-video.md), [src-tauri/src/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f044891da122cbbdc6eff01dfc078ebefdab77c1/src-tauri/src/media.rs), [src/lib/media.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f044891da122cbbdc6eff01dfc078ebefdab77c1/src/lib/media.ts), [src/screens/MusicVideo.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f044891da122cbbdc6eff01dfc078ebefdab77c1/src/screens/MusicVideo.tsx), [src/screens/Songs.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f044891da122cbbdc6eff01dfc078ebefdab77c1/src/screens/Songs.tsx), [tests/invariants/media.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f044891da122cbbdc6eff01dfc078ebefdab77c1/tests/invariants/media.test.ts), [tests/invariants/practice-copy.test.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f044891da122cbbdc6eff01dfc078ebefdab77c1/tests/invariants/practice-copy.test.tsx).

<a id="pr-234"></a>

### PR #234 — fix: apply follow-energy intensity at the next bar

[234](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/234) · head `36b41f90c478d7b5b4410200ed26465511684476` · base `4f68d330a8cb4e7009eab297aab9ac84222c9ee9` (`main`) · mergeability `clean`.

Requirements: [R17](V1-REQUIREMENTS-2026-09-06.md#r17). **Disposition: Needs repair.**

Next-bar queue removes perblock updates; queued follow-energy state survives toggleoff and shares explicit-user slot. Add disable/priority case; do not trust enabled-only test.

CI: 5/5 passed; Comments inspected; no formal review submitted. [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998756558/job/101393752152); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998756558/job/101393752068); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998756558/job/101393752047); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998756558/job/101393752046); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33998756558/job/101393752023).

Changed paths: [crates/jam-band/src/sequencer.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/36b41f90c478d7b5b4410200ed26465511684476/crates/jam-band/src/sequencer.rs).

<a id="pr-235"></a>

### PR #235 — fix: bound SMF VLQ and refuse non-binary meters

[235](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/235) · head `4cabf65d931253043f015c263eefd20ae9f102cc` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `dirty`.

Requirements: [R16](V1-REQUIREMENTS-2026-09-06.md#r16), [R39](V1-REQUIREMENTS-2026-09-06.md#r39). **Disposition: Superseded export portion; isolate residual repair.**

Main strict SMF result validation rejects oversize delta/tempo/meter before overwriting export. PR clamps/saturates, weakening truthful export; do not integrate that portion. Native librarymeter guard may remain. RustCI red; rebase conflicts.

CI: failed: rust (windows-latest), rust (macos-latest); Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33999913465/job/101396804381); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33999913465/job/101396804302); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33999913465/job/101396804259); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33999913465/job/101396804239); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/33999913465/job/101396804207).

Changed paths: [crates/jam-audio/src/export.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/4cabf65d931253043f015c263eefd20ae9f102cc/crates/jam-audio/src/export.rs), [src-tauri/src/library.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/4cabf65d931253043f015c263eefd20ae9f102cc/src-tauri/src/library.rs).

<a id="pr-236"></a>

### PR #236 — fix: detach hung device opens and report a missing DI channel

[236](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/236) · head `f04d02a277b5e2678d8fd7bddbd5133c26e21ee0` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R04](V1-REQUIREMENTS-2026-09-06.md#r04). **Disposition: Candidate for review.**

Bounds device-open wait and avoids joining timed-out worker; exposes DI fallback. Fresh perattempt flags required. Existing fake-driver tests support slice; no physical device proof.

CI: 5/5 passed; Comments inspected; no formal review submitted. [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34001607915/job/101401353469); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34001607915/job/101401353456); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34001607915/job/101401353438); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34001607915/job/101401353410); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34001607915/job/101401353350).

Changed paths: [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f04d02a277b5e2678d8fd7bddbd5133c26e21ee0/crates/jam-audio/src/engine.rs), [crates/jam-audio/src/io.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f04d02a277b5e2678d8fd7bddbd5133c26e21ee0/crates/jam-audio/src/io.rs).

<a id="pr-237"></a>

### PR #237 — fix: clamp loop start and treat zero repeats as once

[237](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/237) · head `0206f9b55195f4af017a2ba9098f7ee69ae3bf4a` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R16](V1-REQUIREMENTS-2026-09-06.md#r16). **Disposition: Candidate for review.**

Checked loop bounds and zero-repeat normalization; empty chart already produces silence on main. Preserve saved-file validation and reconcile #224/#235 native validation, no unsupported zero-repeat expansion.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34003289649/job/101405869013); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34003289649/job/101405869011); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34003289649/job/101405869001); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34003289649/job/101405868991); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34003289649/job/101405868936).

Changed paths: [crates/jam-core/src/chart.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/0206f9b55195f4af017a2ba9098f7ee69ae3bf4a/crates/jam-core/src/chart.rs), [crates/jam-core/src/timeline.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/0206f9b55195f4af017a2ba9098f7ee69ae3bf4a/crates/jam-core/src/timeline.rs), [tests/chart/text.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/0206f9b55195f4af017a2ba9098f7ee69ae3bf4a/tests/chart/text.test.ts).

<a id="pr-238"></a>

### PR #238 — fix: read CM as major and give sus2 its own solo recipe

[238](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/238) · head `be8756186459d9b83bf66db6906c5dc1dadd98f2` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R16](V1-REQUIREMENTS-2026-09-06.md#r16). **Disposition: Candidate for review.**

Recognizes uppercase CM as major and sus2 degree2/5; bounded theory tests. Does not replace all 12 keys/preset band acceptance.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34004994200/job/101410440797); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34004994200/job/101410440759); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34004994200/job/101410440745); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34004994200/job/101410440661); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34004994200/job/101410440614).

Changed paths: [src/lib/theory/solo.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/be8756186459d9b83bf66db6906c5dc1dadd98f2/src/lib/theory/solo.ts), [tests/theory/solo.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/be8756186459d9b83bf66db6906c5dc1dadd98f2/tests/theory/solo.test.ts).

<a id="pr-239"></a>

### PR #239 — fix: coalesce Film typing into one Undo step

[239](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/239) · head `32f76cce16230d4665c1383b4b1e514511695560` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R40](V1-REQUIREMENTS-2026-09-06.md#r40), [R41](V1-REQUIREMENTS-2026-09-06.md#r41). **Disposition: Candidate for review.**

Coalesces Film same-field edits1.5s and resets on history/open; verify save/focus/switch boundaries. Shared media store overlaps #248.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34006755985/job/101415265546); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34006755985/job/101415265512); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34006755985/job/101415265511); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34006755985/job/101415265502); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34006755985/job/101415265361).

Changed paths: [src/lib/media.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/32f76cce16230d4665c1383b4b1e514511695560/src/lib/media.ts), [src/screens/MusicVideo.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/32f76cce16230d4665c1383b4b1e514511695560/src/screens/MusicVideo.tsx), [tests/invariants/media.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/32f76cce16230d4665c1383b4b1e514511695560/tests/invariants/media.test.ts).

<a id="pr-240"></a>

### PR #240 — fix: keep jam time, BPM and shot seconds as honest numbers

[240](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/240) · head `deb3b7f58b81ead4c30a38cf80bbc74d1d52100e` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `dirty`.

Requirements: [R21](V1-REQUIREMENTS-2026-09-06.md#r21), [R44](V1-REQUIREMENTS-2026-09-06.md#r44). **Disposition: Needs repair/rebase.**

Duration carry correction reusable; Film clamps numeric input onChange so intermediate 0.5 / empty draft difficult. Scientific-notation precision edge source-only; use existing NumberField commit pattern and actual UI edit test.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34008413669/job/101419753170); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34008413669/job/101419753077); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34008413669/job/101419753043); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34008413669/job/101419753030); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34008413669/job/101419752945).

Changed paths: [src/lib/media.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/deb3b7f58b81ead4c30a38cf80bbc74d1d52100e/src/lib/media.ts), [src/lib/numberField.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/deb3b7f58b81ead4c30a38cf80bbc74d1d52100e/src/lib/numberField.ts), [src/lib/sessions/stats.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/deb3b7f58b81ead4c30a38cf80bbc74d1d52100e/src/lib/sessions/stats.ts), [src/screens/MusicVideo.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/deb3b7f58b81ead4c30a38cf80bbc74d1d52100e/src/screens/MusicVideo.tsx), [tests/components/number-field.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/deb3b7f58b81ead4c30a38cf80bbc74d1d52100e/tests/components/number-field.test.ts), [tests/invariants/media.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/deb3b7f58b81ead4c30a38cf80bbc74d1d52100e/tests/invariants/media.test.ts), [tests/sessions/stats.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/deb3b7f58b81ead4c30a38cf80bbc74d1d52100e/tests/sessions/stats.test.ts).

<a id="pr-241"></a>

### PR #241 — fix: roll tuner, tone and volumes back when IPC fails

[241](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/241) · head `dc5949f0fc5569e9ac05e1f126faec6742b6bb20` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R44](V1-REQUIREMENTS-2026-09-06.md#r44). **Disposition: Needs repair.**

Exact store-method repro: start 0.5; requests0.6 then 0.4; bothfail→display0.6, not0.5. Sequential test misses overlapping calls. Also latefail must not undo newer success.

CI: 5/5 passed; Comments inspected; no formal review submitted. [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34010064200/job/101424197625); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34010064200/job/101424197603); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34010064200/job/101424197558); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34010064200/job/101424197515); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34010064200/job/101424197381).

Changed paths: [src/store/engine.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/dc5949f0fc5569e9ac05e1f126faec6742b6bb20/src/store/engine.ts), [tests/sessions/optimistic-controls.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/dc5949f0fc5569e9ac05e1f126faec6742b6bb20/tests/sessions/optimistic-controls.test.ts).

<a id="pr-242"></a>

### PR #242 — fix: point save conflicts at Save copy

[242](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/242) · head `f50fb3d5f51b18109ca4f3f49c64c19dfcd71d41` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R40](V1-REQUIREMENTS-2026-09-06.md#r40). **Disposition: Candidate for review.**

Write conflict exposes Savecopy on relevant views and native error; copy retains newer draft during await. Check with #244 selections and current revision guard; no broad workflow rewrite.

CI: 5/5 passed; Comments inspected; no formal review submitted. [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34011797231/job/101428802758); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34011797231/job/101428802730); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34011797231/job/101428802729); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34011797231/job/101428802667); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34011797231/job/101428802606).

Changed paths: [src-tauri/src/originals.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f50fb3d5f51b18109ca4f3f49c64c19dfcd71d41/src-tauri/src/originals.rs), [src-tauri/tests/ipc_originals.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f50fb3d5f51b18109ca4f3f49c64c19dfcd71d41/src-tauri/tests/ipc_originals.rs), [src/ipc/preview.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f50fb3d5f51b18109ca4f3f49c64c19dfcd71d41/src/ipc/preview.ts), [src/screens/Originals.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f50fb3d5f51b18109ca4f3f49c64c19dfcd71d41/src/screens/Originals.tsx), [tests/e2e/writing.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f50fb3d5f51b18109ca4f3f49c64c19dfcd71d41/tests/e2e/writing.test.ts).

<a id="pr-243"></a>

### PR #243 — fix: show a next step instead of raw Zod dumps

[243](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/243) · head `7a5ae01e34ca4129ad48b915604de9f227ed3049` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `unstable`.

Requirements: [R46](V1-REQUIREMENTS-2026-09-06.md#r46). **Disposition: Needs repair.**

Shared readable-error formatting fails TS sessions expectations on this head; title hint1–100 differs SongLab80 and providerbadJSON advice refers to invisible input. Correct field/context messages and update exact tests without weakening save guards.

CI: failed: ts (lint, types, test, licenses, build); Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34013435094/job/101433063354); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34013435094/job/101433063306); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34013435094/job/101433063278); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34013435094/job/101433063238); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34013435094/job/101433063143).

Changed paths: [src/components/AiSettings.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/src/components/AiSettings.tsx), [src/components/SongLab.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/src/components/SongLab.tsx), [src/components/StudioAssistant.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/src/components/StudioAssistant.tsx), [src/components/tools/CoachTool.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/src/components/tools/CoachTool.tsx), [src/components/tools/shared.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/src/components/tools/shared.tsx), [src/lib/jo/providers.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/src/lib/jo/providers.ts), [src/lib/jo/songLab.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/src/lib/jo/songLab.ts), [src/lib/media.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/src/lib/media.ts), [src/lib/userError.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/src/lib/userError.ts), [tests/invariants/user-error.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/7a5ae01e34ca4129ad48b915604de9f227ed3049/tests/invariants/user-error.test.ts).

<a id="pr-244"></a>

### PR #244 — fix: subscribe Write screens to selected store fields

[244](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/244) · head `c4f336d72891734886a9a0d7483d58151e645b71` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R40](V1-REQUIREMENTS-2026-09-06.md#r40), [R42](V1-REQUIREMENTS-2026-09-06.md#r42), [R47](V1-REQUIREMENTS-2026-09-06.md#r47). **Disposition: Needs repair.**

Exact fingerprint-expression repro: stored studio fingerprint wraps song JSON string, memo wraps song object. Fresh proposal disabled. Keep common representation and behavior test; regex subscription tests cannot establish usability.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34015096690/job/101437380682); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34015096690/job/101437380609); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34015096690/job/101437380602); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34015096690/job/101437380592); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34015096690/job/101437380494).

Changed paths: [src/components/FinishingDesk.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/c4f336d72891734886a9a0d7483d58151e645b71/src/components/FinishingDesk.tsx), [src/components/SongLab.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/c4f336d72891734886a9a0d7483d58151e645b71/src/components/SongLab.tsx), [src/components/StudioAssistant.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/c4f336d72891734886a9a0d7483d58151e645b71/src/components/StudioAssistant.tsx), [src/components/WritingDesk.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/c4f336d72891734886a9a0d7483d58151e645b71/src/components/WritingDesk.tsx), [src/screens/Originals.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/c4f336d72891734886a9a0d7483d58151e645b71/src/screens/Originals.tsx), [tests/invariants/store-subscriptions.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/c4f336d72891734886a9a0d7483d58151e645b71/tests/invariants/store-subscriptions.test.ts).

<a id="pr-245"></a>

### PR #245 — fix: let humanise jitter cross a 256-frame span

[245](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/245) · head `4f84a439f852143f10e2d57cab39c34bc64fc330` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R15](V1-REQUIREMENTS-2026-09-06.md#r15). **Disposition: Needs repair/rebase.**

Negative jitter branch can emit beat0 again in later span; lookaround may drop negatively advanced strummed strings whose nominal owner is nextwindow. Source/review only, require integrated partition invariance with #228.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34016870420/job/101442069620); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34016870420/job/101442069609); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34016870420/job/101442069575); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34016870420/job/101442069555); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34016870420/job/101442069412).

Changed paths: [crates/jam-band/src/sequencer.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/4f84a439f852143f10e2d57cab39c34bc64fc330/crates/jam-band/src/sequencer.rs).

<a id="pr-246"></a>

### PR #246 — fix: drop tuner power gate from -26 dBFS to -45

[246](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/246) · head `c8c97bfe837c37b0723054e93b4af25b047af9c4` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R05](V1-REQUIREMENTS-2026-09-06.md#r05), [R36](V1-REQUIREMENTS-2026-09-06.md#r36). **Disposition: Candidate for review.**

MPM energygate lowered from−26 to−45dBFS with quiet/noise fixtures; shared tuner/analysis/melody consequences require decay/noise confidence tests. Numeric pitch tolerance unchanged.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34018507054/job/101446642583); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34018507054/job/101446642543); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34018507054/job/101446642453); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34018507054/job/101446642411); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34018507054/job/101446642351).

Changed paths: [crates/jam-dsp/src/pitch.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/c8c97bfe837c37b0723054e93b4af25b047af9c4/crates/jam-dsp/src/pitch.rs).

<a id="pr-247"></a>

### PR #247 — fix: stop offline Jo guessing transport from questions

[247](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/247) · head `44471e5419a7bebdb35e74f761a64ba101256d9d` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `dirty`.

Requirements: [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R42](V1-REQUIREMENTS-2026-09-06.md#r42). **Disposition: Needs repair/rebase.**

Exact parser with catalog: stop straight away→set_style rock-straight, no stop. Rejects question-form requests by punctuation. Overlaps later reference/song arguments; retain cancellation generation guards and modern dispatcher.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34020382042/job/101451741046); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34020382042/job/101451741010); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34020382042/job/101451740973); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34020382042/job/101451740958); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34020382042/job/101451740928).

Changed paths: [src/components/StudioAssistant.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/44471e5419a7bebdb35e74f761a64ba101256d9d/src/components/StudioAssistant.tsx), [src/lib/jo/conversation.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/44471e5419a7bebdb35e74f761a64ba101256d9d/src/lib/jo/conversation.ts), [src/lib/jo/intent.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/44471e5419a7bebdb35e74f761a64ba101256d9d/src/lib/jo/intent.ts), [tests/jo/conversation.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/44471e5419a7bebdb35e74f761a64ba101256d9d/tests/jo/conversation.test.ts), [tests/jo/intent.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/44471e5419a7bebdb35e74f761a64ba101256d9d/tests/jo/intent.test.ts).

<a id="pr-248"></a>

### PR #248 — fix: point Film save conflicts at Save copy

[248](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/248) · head `510ed4485a1dd2103e1ae0ada8358569ca27b1ae` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R40](V1-REQUIREMENTS-2026-09-06.md#r40), [R41](V1-REQUIREMENTS-2026-09-06.md#r41). **Disposition: Needs repair.**

Exact videoSaveCopy:148×ø title296UTF8bytes→copy303bytes; native limit300 rejects it. Use actual byte/schema contract; preserve concurrent drafts; overlaps #239.

CI: 5/5 passed; Comments inspected; no formal review submitted. [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34022203443/job/101456713025); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34022203443/job/101456713017); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34022203443/job/101456713006); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34022203443/job/101456712965); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34022203443/job/101456712811).

Changed paths: [src-tauri/src/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/510ed4485a1dd2103e1ae0ada8358569ca27b1ae/src-tauri/src/media.rs), [src-tauri/tests/ipc_rig_media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/510ed4485a1dd2103e1ae0ada8358569ca27b1ae/src-tauri/tests/ipc_rig_media.rs), [src/lib/media.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/510ed4485a1dd2103e1ae0ada8358569ca27b1ae/src/lib/media.ts), [src/screens/MusicVideo.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/510ed4485a1dd2103e1ae0ada8358569ca27b1ae/src/screens/MusicVideo.tsx), [tests/invariants/media.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/510ed4485a1dd2103e1ae0ada8358569ca27b1ae/tests/invariants/media.test.ts).

<a id="pr-249"></a>

### PR #249 — fix: kill the Windows agent process tree on Cancel

[249](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/249) · head `e13b230b457bca4948fc55f77bfdf53b9a176c9a` · base `744a2ed0370694c43801a4b9cf18cc6cbec19e60` (`main`) · mergeability `clean`.

Requirements: [R41](V1-REQUIREMENTS-2026-09-06.md#r41). **Disposition: Needs repair.**

media run timeout uses ? inside select so exits before kill_tree cleanup below. Current test checks parent command rather than child tree; taskkill/native placement and stderr redaction require verification. No model launched.

CI: 5/5 passed; Comments inspected; no formal review submitted. [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34024055468/job/101461768454); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34024055468/job/101461768449); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34024055468/job/101461768434); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34024055468/job/101461768399); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34024055468/job/101461768302).

Changed paths: [src-tauri/src/agents.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e13b230b457bca4948fc55f77bfdf53b9a176c9a/src-tauri/src/agents.rs), [src-tauri/src/media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e13b230b457bca4948fc55f77bfdf53b9a176c9a/src-tauri/src/media.rs), [src-tauri/src/platform/mod.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/e13b230b457bca4948fc55f77bfdf53b9a176c9a/src-tauri/src/platform/mod.rs).

<a id="pr-252"></a>

### PR #252 — fix: tell the truth about the live pedal-map seam

[252](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/252) · head `19c8a2dc1a818f4378311cbce24f30d8de6eb30a` · base `54e272f734925936206608eae9c11c191e81f147` (`main`) · mergeability `dirty`.

Requirements: [R09](V1-REQUIREMENTS-2026-09-06.md#r09), [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R50](V1-REQUIREMENTS-2026-09-06.md#r50). **Disposition: Candidate documentation subset; insufficient for issue156.**

Adds controller fixture/docs but leaves consumed-controls requirement absent; src/ai/tools recipe/table stale. Preserve honest scope and fix docs; not authority to remove V1 controlmap or accept M1d tick.

CI: 5/5 passed; Comments inspected; no formal review submitted. [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34026396854/job/101468015626); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34026396854/job/101468015533); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34026396854/job/101468015520); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34026396854/job/101468015481); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34026396854/job/101468015397).

Changed paths: [controls/black-spirit-200.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/19c8a2dc1a818f4378311cbce24f30d8de6eb30a/controls/black-spirit-200.json), [crates/jam-core/src/registry.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/19c8a2dc1a818f4378311cbce24f30d8de6eb30a/crates/jam-core/src/registry.rs), [docs/ARCHITECTURE.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/19c8a2dc1a818f4378311cbce24f30d8de6eb30a/docs/ARCHITECTURE.md), [docs/EXTENDING.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/19c8a2dc1a818f4378311cbce24f30d8de6eb30a/docs/EXTENDING.md), [docs/plan/00-README.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/19c8a2dc1a818f4378311cbce24f30d8de6eb30a/docs/plan/00-README.md), [docs/plan/03-build-plan.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/19c8a2dc1a818f4378311cbce24f30d8de6eb30a/docs/plan/03-build-plan.md), [tests/invariants/seams.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/19c8a2dc1a818f4378311cbce24f30d8de6eb30a/tests/invariants/seams.test.ts).

<a id="pr-255"></a>

### PR #255 — fix: silence leftover reference frames after a source change

[255](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/255) · head `b33808ac54023710caf1625c6df47240f4ab06d2` · base `dfd34e85d20be7554d4e9e777dbc599612fbf5ba` (`main`) · mergeability `dirty`.

Requirements: [R29](V1-REQUIREMENTS-2026-09-06.md#r29). **Disposition: Needs repair.**

Source serial prevents old song output. Direct reference.take in band_load_chart/configure_song does not reset live_reference_serial. New frame serial0 is rejected against old nonzero serial, including other buses. Source trace proven; native test blocked. Test reference→chart/original/voice and silent tail.

CI: 5/5 passed; Comments inspected; no formal review submitted. [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34029621353/job/101476645307); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34029621353/job/101476645135); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34029621353/job/101476645082); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34029621353/job/101476645043); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34029621353/job/101476644871).

Changed paths: [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/b33808ac54023710caf1625c6df47240f4ab06d2/crates/jam-audio/src/engine.rs), [crates/jam-audio/src/song.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/b33808ac54023710caf1625c6df47240f4ab06d2/crates/jam-audio/src/song.rs), [docs/ARCHITECTURE.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/b33808ac54023710caf1625c6df47240f4ab06d2/docs/ARCHITECTURE.md).

<a id="pr-260"></a>

### PR #260 — fix: let offline Jo fall through when loop is not a reference section

[260](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/260) · head `f71e302df2a95b402541129776d3a465afb72ae2` · base `e91896f59a9c0ab0fb7de3510dd75e941b20f4ef` (`main`) · mergeability `unstable`.

Requirements: [R23](V1-REQUIREMENTS-2026-09-06.md#r23), [R18](V1-REQUIREMENTS-2026-09-06.md#r18). **Disposition: Candidate for review.** Red at head: the TS job fails Biome formatting in `tests/jo/reference-practice.test.ts`; repair formatting before review.

Zero matches in confirmed reference sections now allow songwriting interpretation. Unique/ambiguous reference matches remain distinct; native action/source switching needs integration test with latest parser and #278.

CI: failed: ts (lint, types, test, licenses, build); Comments inspected; no formal review submitted. [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34031484296/job/101481689424); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34031484296/job/101481689410); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34031484296/job/101481689407); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34031484296/job/101481689358); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34031484296/job/101481689290).

Changed paths: [src/lib/jo/intent.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f71e302df2a95b402541129776d3a465afb72ae2/src/lib/jo/intent.ts), [tests/jo/reference-practice.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/f71e302df2a95b402541129776d3a465afb72ae2/tests/jo/reference-practice.test.ts).

<a id="pr-264"></a>

### PR #264 — fix: strip punctuation and and-play from Jo song titles

[264](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/264) · head `9e16ead2c48bc21dfa3fc8bf46cd64715cd372b1` · base `82c7e048a2a92a20c81e6f14d3fbcd88a0c2f4b1` (`main`) · mergeability `clean`.

Requirements: [R23](V1-REQUIREMENTS-2026-09-06.md#r23). **Disposition: Needs repair.**

Exact songQuery helper on quoted Blå natt plus period leaves quotes and fails title matching. Exact punctuation-bearing library titles also need precedence before cleanup. Plain punctuation and andplay cases alone insufficient.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34035416845/job/101492464363); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34035416845/job/101492464354); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34035416845/job/101492464331); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34035416845/job/101492464322); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34035416845/job/101492464295).

Changed paths: [src/lib/jo/intent.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/9e16ead2c48bc21dfa3fc8bf46cd64715cd372b1/src/lib/jo/intent.ts), [src/lib/jo/loadSong.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/9e16ead2c48bc21dfa3fc8bf46cd64715cd372b1/src/lib/jo/loadSong.ts), [src/lib/jo/songQuery.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/9e16ead2c48bc21dfa3fc8bf46cd64715cd372b1/src/lib/jo/songQuery.ts), [tests/invariants/load-song.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/9e16ead2c48bc21dfa3fc8bf46cd64715cd372b1/tests/invariants/load-song.test.ts).

<a id="pr-269"></a>

### PR #269 — fix: return section-looped practice ramps to the loop downbeat on Stop

[269](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/269) · head `643dfe6d743b8363a6bb61c61f066185fb64e402` · base `1cb8f93d811b9edc6a68f326337ea870bf78107a` (`main`) · mergeability `unstable`.

Requirements: [R30](V1-REQUIREMENTS-2026-09-06.md#r30). **Disposition: Candidate for review.** Red at head: the TS job fails Biome formatting in `src/components/ReferencePlayer.tsx`; repair formatting before review.

Stop resets active ramp loop to loopstart and fromstart recorder snapshot agrees. Focused late-section test; reconcile old manual DAW-tempo warning with now-implemented main export. No independent physical listening.

CI: failed: ts (lint, types, test, licenses, build); Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34039661271/job/101503990703); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34039661271/job/101503990684); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34039661271/job/101503990636); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34039661271/job/101503990601); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34039661271/job/101503990481).

Changed paths: [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/643dfe6d743b8363a6bb61c61f066185fb64e402/crates/jam-audio/src/engine.rs), [crates/jam-audio/src/song.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/643dfe6d743b8363a6bb61c61f066185fb64e402/crates/jam-audio/src/song.rs), [crates/jam-audio/src/song/ramp.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/643dfe6d743b8363a6bb61c61f066185fb64e402/crates/jam-audio/src/song/ramp.rs), [docs/ARCHITECTURE.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/643dfe6d743b8363a6bb61c61f066185fb64e402/docs/ARCHITECTURE.md), [docs/EXTENDING.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/643dfe6d743b8363a6bb61c61f066185fb64e402/docs/EXTENDING.md), [docs/guide/manual-en.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/643dfe6d743b8363a6bb61c61f066185fb64e402/docs/guide/manual-en.md), [docs/guide/manual-nb.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/643dfe6d743b8363a6bb61c61f066185fb64e402/docs/guide/manual-nb.md), [docs/guide/manual.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/643dfe6d743b8363a6bb61c61f066185fb64e402/docs/guide/manual.json), [src/components/ReferencePlayer.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/643dfe6d743b8363a6bb61c61f066185fb64e402/src/components/ReferencePlayer.tsx).

<a id="pr-272"></a>

### PR #272 — fix: publish the queued reference speed while playing

[272](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/272) · head `04ad5f0e3b55f9dd70e9c3c444f705bac56fa68b` · base `41e44879a6bea897342cbebc198917f62fd286b1` (`main`) · mergeability `clean`.

Requirements: [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R30](V1-REQUIREMENTS-2026-09-06.md#r30). **Disposition: Candidate for review.**

Speed/semitones copied from consumed reference stamp rather than prepared state. Preserve paused/stopped armedreadout and test with source transitions, ramps and recording.

CI: 5/5 passed; Comments inspected; no formal review submitted. [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34041746619/job/101509646396); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34041746619/job/101509646388); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34041746619/job/101509646369); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34041746619/job/101509646366); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34041746619/job/101509646245).

Changed paths: [crates/jam-audio/src/song.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/04ad5f0e3b55f9dd70e9c3c444f705bac56fa68b/crates/jam-audio/src/song.rs), [docs/ARCHITECTURE.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/04ad5f0e3b55f9dd70e9c3c444f705bac56fa68b/docs/ARCHITECTURE.md).

<a id="pr-274"></a>

### PR #274 — feat: measure guitar recording latency with loopback clicks

[274](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/274) · head `cb2f232a564f381fc5e1f39aab2e24aa87d9257d` · base `6b3a4c6fe07838a3f69dd5db4c497d0d39884584` (`main`) · mergeability `clean`.

Requirements: [R19](V1-REQUIREMENTS-2026-09-06.md#r19), [R20](V1-REQUIREMENTS-2026-09-06.md#r20). **Disposition: Candidate under explicit no-merge hold.**

Three-codedclick algorithm, callback tag, profile save-before-apply, estimate/refusal and UI/fixture tests. Main still manual only. Two-buffer estimate explicitly lacks device nominal latency; reconcile old target wording, fixed48 kHz and UI profile refresh. Synthetic±1sample is not five-run physical±2sample proof.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34043935519/job/101515499299); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34043935519/job/101515499276); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34043935519/job/101515499275); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34043935519/job/101515499212); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34043935519/job/101515499098).

Changed paths: [crates/jam-audio/src/calibration.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/crates/jam-audio/src/calibration.rs), [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/crates/jam-audio/src/engine.rs), [crates/jam-audio/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/crates/jam-audio/src/lib.rs), [docs/ARCHITECTURE.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/docs/ARCHITECTURE.md), [docs/EXTENDING.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/docs/EXTENDING.md), [docs/guide/manual-en.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/docs/guide/manual-en.md), [docs/guide/manual-nb.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/docs/guide/manual-nb.md), [docs/guide/manual.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/docs/guide/manual.json), [docs/plan/00-README.md](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/docs/plan/00-README.md), [src-tauri/src/lib.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/src-tauri/src/lib.rs), [src-tauri/src/settings.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/src-tauri/src/settings.rs), [src-tauri/tests/ipc_settings.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/src-tauri/tests/ipc_settings.rs), [src/ipc/preview.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/src/ipc/preview.ts), [src/screens/Sessions.tsx](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/src/screens/Sessions.tsx), [src/store/engine.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/src/store/engine.ts), [tests/e2e/sessions.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/tests/e2e/sessions.test.ts), [tests/invariants/latency-calibration.json](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/cb2f232a564f381fc5e1f39aab2e24aa87d9257d/tests/invariants/latency-calibration.json).

<a id="pr-276"></a>

### PR #276 — fix: tell the truth when band tempo hits a loaded reference

[276](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/276) · head `9c6a859a39027c96100ae7addf0877d283103b25` · base `6b3a4c6fe07838a3f69dd5db4c497d0d39884584` (`main`) · mergeability `clean`.

Requirements: [R29](V1-REQUIREMENTS-2026-09-06.md#r29), [R50](V1-REQUIREMENTS-2026-09-06.md#r50). **Disposition: Candidate for review.**

Truthful separate-clock error for reference playback; tests gridded/ungridded references. Does not implement Band-to-reference-grid synchronization or license shrinking that V1 remainder.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34045867143/job/101520680707); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34045867143/job/101520680657); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34045867143/job/101520680645); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34045867143/job/101520680639); [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34045867143/job/101520680531).

Changed paths: [crates/jam-audio/src/engine.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/9c6a859a39027c96100ae7addf0877d283103b25/crates/jam-audio/src/engine.rs), [src-tauri/tests/ipc_rig_media.rs](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/9c6a859a39027c96100ae7addf0877d283103b25/src-tauri/tests/ipc_rig_media.rs).

<a id="pr-278"></a>

### PR #278 — fix: keep a loaded reference when [ or ] is pressed

[278](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/278) · head `be6d74b32b4ff79be20431c88c8acf617a4b7d69` · base `6b3a4c6fe07838a3f69dd5db4c497d0d39884584` (`main`) · mergeability `clean`.

Requirements: [R18](V1-REQUIREMENTS-2026-09-06.md#r18), [R29](V1-REQUIREMENTS-2026-09-06.md#r29). **Disposition: Candidate for review.**

Bracket guard in shortcut/store when telemetry shows reference; tests keyboard path. Add store/native transition coverage; explicit library chart loads still intentionally switch source and must satisfy #255 repair.

CI: 5/5 passed; Comments inspected; no formal review submitted. [rust (macos-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34047930433/job/101526232506); [rust (windows-latest)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34047930433/job/101526232463); [secret scan (gitleaks)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34047930433/job/101526232462); [ts (lint, types, test, licenses, build)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34047930433/job/101526232446); [markdown links (offline)](https://github.com/avoidencez-lgtm/josefines-jamstudio/actions/runs/34047930433/job/101526232381).

Changed paths: [src/lib/shortcuts.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/be6d74b32b4ff79be20431c88c8acf617a4b7d69/src/lib/shortcuts.ts), [src/store/engine.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/be6d74b32b4ff79be20431c88c8acf617a4b7d69/src/store/engine.ts), [tests/invariants/studio-workspaces.test.ts](https://github.com/avoidencez-lgtm/josefines-jamstudio/blob/be6d74b32b4ff79be20431c88c8acf617a4b7d69/tests/invariants/studio-workspaces.test.ts).
