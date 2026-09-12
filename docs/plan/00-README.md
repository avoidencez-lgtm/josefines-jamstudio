# Build plan for Josefines Jamstudio

This folder is the **governing plan** for building Josefines Jamstudio. It was written by Claude (Fable 5.1, architect and lead planner) on 2026-09-02 for **Gemini 3.8 Flash running in Google Antigravity** on Vegar's Windows PC, which builds the product. Everything here is written to be read cold: no knowledge of earlier sessions is needed beyond this repository.

## The goal, in Vegar's words

> "Målet er å lage software til Windows og Mac, så han kan jamme på høyt nivå, og integrere AI i jamsessions. Målet er å lage et mye bedre oppsett for ham enn det hardware-produsentene har gjort. Dette skal være premium. Det må være enkelt å bruke og det må funke. Og det må kunne bygges på i det hinsides."

In English: desktop software for macOS and Windows that lets Vegar's friend jam at a high level with AI in the loop, a far better setup than the hardware makers ship, premium, simple to use, working, and extensible without limit.

Who it is for: one guitarist and his rig (see [01-context.md](01-context.md)). "Josefine" is a dedication. The AI bandleader persona is called **Jo**.

What "better than the manufacturers" means, concretely (from the competitive research in [04-research.md](04-research.md)):

1. Desktop-native with a big screen, real audio I/O and multitrack recording. Every competing AI-jam feature lives on a phone.
2. Analyses the clean DI signal the HeadRush already sends over USB, not a room microphone.
3. Drives the actual rig over MIDI (HeadRush rigs, Black Spirit presets and parameters) as the song moves.
4. Exports real stems and a tempo map into Logic Pro. Every competitor is a walled garden.
5. Talks: a voice bandleader that changes the band while his hands are on the guitar.
6. Stays extensible: styles, charts, rig profiles, tools and providers are seams anyone can add to.

## Reading order

| File | What | When |
|---|---|---|
| [01-context.md](01-context.md) | The rig, the signal flow, what each box can do, the product's modes and boundaries | First session, and whenever something is unclear |
| [02-working-method.md](02-working-method.md) | Toolchain on Windows, the gates, git flow, spikes, reporting, per-task checklist | Every session (checklist) |
| [03-build-plan.md](03-build-plan.md) | Milestones M0 to M7 and spikes S1 to S5 with tasks, files and acceptance criteria | Governs the work |
| [04-research.md](04-research.md) | Verified facts about APIs, libraries and prices, with sources and "verify before coding" flags | When a milestone touches a provider or library |
| [05-kickoff.md](05-kickoff.md) | Prerequisites on the PC and the copy-paste prompts for Antigravity | At the start of every session |
| [06-owner-verification.md](06-owner-verification.md) | The gates only the real rig on the Mac can prove | At the end of milestones that touch hardware |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | Process model, buses, clock, IPC contract, data model, seams | Before writing any engine, IPC or provider code |
| [../EXTENDING.md](../EXTENDING.md) | Recipes for adding styles, charts, rigs, tools, providers, instruments, screens | Whenever something new is added |
| [../DESIGN.md](../DESIGN.md) | The design system and screen inventory | Before writing any UI |
| [../adr/](../adr/) | The decisions and why | When tempted to change an architectural choice |
| [../hardware/](../hardware/) | Per-device fact sheets, cabling, shopping list | M0 (device selection), M5 (rig), owner gates |

`AGENTS.md` in the repository root is the law. This folder adds *what* to build and *how* we work; it never overrides the invariants.

## Definition of Done for the project

These are the original full-product targets, not claims about the current preview. The V1/V2 decision below supersedes references to friend-led owner acceptance as a V1 release blocker throughout this plan.

### V1 delivery and V2 friend testing (user decision, 2026-09-05)

Vegar wants a finished, polished product to hand to his friend. The friend's usability sessions and checks on his personal Mac/rig are deferred to **V2**. Do not request those sessions to unblock V1, and do not mark them passed. Keep their procedures in [06-owner-verification.md](06-owner-verification.md), labelled **deferred to V2**.

This changes who must test before handoff, not the promised feature scope. Unbuilt voice, stem separation, analysis, time-stretch, realtime generation, calibration and other agreed capabilities remain unfinished work; the deferral does not turn placeholders into completed features. Document external service or hardware requirements and failures clearly.

V1 still requires completed workflows, the agreed focused songwriting UI and personalization, accessible controls, and English/Bokmål help available beside the relevant features. The builder verifies persistence and recovery, audio/export behavior with synthetic fixtures, keyboard/accessibility behavior, rendered UI, and install/startup behavior on the available platforms. Required CI, security, licence and packaging checks remain release gates. Automated checks do not prove the friend's subjective experience or his physical setup.

For each milestone, report implementation status, developer verification evidence and deferred V2 friend checks separately. A passing narrow regression or a merged PR is not proof that the whole milestone is finished. Signing/notarisation and any other missing release prerequisite remain open until completed or explicitly decided by Vegar.

### Original product targets

1. **Installs and runs on the guitarist's Apple Silicon Mac** from a GitHub Release. Onboarding completes with the HeadRush Pedalboard selected as a 4-channel input (dry DI on channel 3) and the HeadRush USB return as output. Latency calibration returns a stable offset within ±2 samples across 5 runs.
2. **Band.** At least 6 styles, any key, 40 to 240 bpm (charts, Write and setlist). Transport clamps 20–300 so Stage can play outside a style's feel; that wider clamp is not a shrink of the 40–240 product range. Chart editor with presets, count-in, cues (fill, crash, stop, ending), intensity following the guitarist's energy.
3. **Jo.** At least 90 % correct actions on the 30-utterance script in `tests/fixtures/jo/script.json` (mocked STT), and a median of at most 2.5 s from push-to-talk release to the first spoken word on the Mac.
4. **Songs.** Import a local audio file and get stems, chords, beats and key; a minus-guitar mix with residual guitar at or below -6 dB; time-stretch from 50 % to 150 % with transposition; section looping.
5. **AI music.** Lyria RealTime plays for at least 10 minutes continuously including one reconnect; a generated track (Lyria 3 or ElevenLabs Music) lands in the library already analysed.
6. **Rig.** Section-bound scenes change the HeadRush rig and the Black Spirit preset on the real rig (owner gate 5).
7. **Sessions.** Every jam is recorded; recorded stems open in Logic Pro 12 at bar 1 with less than 1 ms drift over 5 minutes; the exported Standard MIDI File imports with the correct tempo map and markers.
8. **Gates.** CI green on Windows and macOS on `main`; gitleaks, `cargo deny` and the JavaScript licence check green; docs current.
9. **Extensibility proven.** `tests/invariants/` adds a synthetic style, chart, rig profile, control map, Jo tool and provider from fixtures with zero changes to core files, and every recipe in `docs/EXTENDING.md` has been executed once as a test.

## Status board (the builder updates this after every milestone)

2026-09-12 ShortcutsHelp-clear-search leftover
(working tree, uncommitted): Clear this search.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ShortcutsHelp-close-help leftover
(working tree, uncommitted): Close this help.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Manuals-save-voice-setup-remembers leftover
(working tree, uncommitted): Save this voice setup remembers
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Manuals-then-save-voice-setup leftover
(working tree, uncommitted): then Save this voice setup.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Manuals-and-save-voice-setup leftover
(working tree, uncommitted): and Save this voice setup.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 JoVoice-save-voice-setup-remember leftover
(working tree, uncommitted): Save this voice setup to remember
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 JoVoice-and-save-voice-setup leftover
(working tree, uncommitted): and Save this voice setup.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 JoVoice-save-voice-setup leftover
(working tree, uncommitted): Save this voice setup.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 SongLab-dismiss-proposal leftover
(working tree, uncommitted): Dismiss this proposal.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film-dismiss-proposal leftover
(working tree, uncommitted): Dismiss this proposal.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film-get-ffmpeg leftover
(working tree, uncommitted): Get this FFmpeg.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film-new-project leftover
(working tree, uncommitted): Start this new project.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 JoVoice-optional-estimates leftover
(working tree, uncommitted): These are optional estimates; enter your account's rates and Save voice setup.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Transport-bar-colon-beat leftover
(working tree, uncommitted): {transport.bar} · {transport.beat}
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage-bar-colon-beat leftover
(working tree, uncommitted): ${transport.bar} · ${transport.beat}
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Restart-this-audio-semicolon splice
(working tree, uncommitted): use Restart this audio; the refusal clears after a matching restart.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Loop-this-range-semicolon splice
(working tree, uncommitted): then Loop this range; Loop off disables it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Play-the-reference-pause splice
(working tree, uncommitted): use Play the reference, Pause the reference and Stop the reference,
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Alternative-chords-bridge splice
(working tree, uncommitted): Choose These are alternative chords, This is a contrasting bridge, This is a lyric seed or This is arrangement feedback.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Match-the-os-always splice
(working tree, uncommitted): Reduced motion is Match the OS, Always reduce motion or Never reduce motion.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep-this-riff-record splice
(working tree, uncommitted): Actions include Keep this riff, Record or save this take, Play or stop this, Loop this selected section, Loop this next section and Keep this version.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write chord-cell aria splice
(working tree, uncommitted): Bar ${i + 1}, chord ${j + 1} is ${c.chord} for ${c.beats} beats.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep-current-tone-sends splice
(working tree, uncommitted): Keep the current tone sends nothing.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setup check-key-status-looks splice
(working tree, uncommitted): Check this key status looks only in the keychain.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setup test-this-key-stays splice
(working tree, uncommitted): Test this key stays not configured.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Manuals test-this-key-stays splice
(working tree, uncommitted): Test this key stays not configured;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Manuals check-key-status-os-keychain splice
(working tree, uncommitted): Check this key status looks only in the OS keychain.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Check-key-status-os-keychain splice
(working tree, uncommitted): Check this key status looks only in the OS keychain.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Check-key-status-looks splice
(working tree, uncommitted): Check this key status looks only in the keychain.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Test-this-key-stays splice
(working tree, uncommitted): Test this key stays not configured.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 You-jo-sender leftover period
(working tree, uncommitted): You / Jo
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Residual-then-load-mix splice
(working tree, uncommitted): then Check this guitar residual, then Load this mix only after that check passes.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Check-sample-packs-after-unpack splice
(working tree, uncommitted): Check these sample packs After unpack, the band plays kit.json/WAVs and FreePats bass.sf2/comp.sf2 from JosefinesJamstudio/assets.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Play-this-song-reloads-validates splice
(working tree, uncommitted): Play this song reloads and validates it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save-this-song-writes-document splice
(working tree, uncommitted): Save this song writes the current document and its versions to disk.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep-this-variation-or splice
(working tree, uncommitted): then Keep this variation or Discard this preview.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Loop-these-bars-to-hear splice
(working tree, uncommitted): Loop these bars {start}–{end} to hear the lead-in and arrival.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep-that-take-or splice
(working tree, uncommitted): Keep that take. H is the shortcut or a learned pedal saves the recent buffer as a take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Original-mix-hvis splice
(working tree, uncommitted): Velg Load this original mix hvis lagrede innstillinger er ugyldige.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Song-map-write-words splice
(working tree, uncommitted): in This is the song map Write words for this section stores
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Song-map-viser splice
(working tree, uncommitted): This is the song map viser avspillingsrekkefølgen
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Recall-snapshot-validates splice
(working tree, uncommitted): Recall this snapshot to the rig validates the saved values
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Capture-current-tone-stores splice
(working tree, uncommitted): Capture this current tone stores the current profile ID, scene and controller values in that song.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Check-virtual-midi-sends splice
(working tree, uncommitted): Check this virtual MIDI sends two program changes
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Start-new-comparison-resets splice
(working tree, uncommitted): Start this new comparison resets the round.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Reveal-identities-shows splice
(working tree, uncommitted): Reveal these identities shows which recording was which.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Guitar-offset-is splice
(working tree, uncommitted): Enter the guitar offset is the round-trip sample delay.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save-this-take-waits splice
(working tree, uncommitted): Save this take waits briefly for queued audio before closing the files.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Analyze-again-for splice
(working tree, uncommitted): Use Analyze again for older results.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Preview-aligned-cuts-rounds splice
(working tree, uncommitted): Preview these aligned cuts rounds internal cut positions to that grid.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Brain-direct-returns splice
(working tree, uncommitted): Let the selected brain direct this returns editable shot descriptions from text/timing only.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Build-cuts-uses splice
(working tree, uncommitted): Build these cuts from the song sections uses the take’s saved chart, or the open Write song, then fits four-bar shots to the soundtrack length.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Play-film-opens splice
(working tree, uncommitted): Play this film with sound opens the native player.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Render-music-video-requires splice
(working tree, uncommitted): Render this music video requires all clips and a matching timeline.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Fit-cuts-scales splice
(working tree, uncommitted): Fit all these cuts to the song length scales durations proportionally.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Use-this-take-builds splice
(working tree, uncommitted): Use this take builds a clean starting mix
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Use-this-take-from splice
(working tree, uncommitted): or Use this take from a saved studio take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save-this-project-keeps splice
(working tree, uncommitted): Save this project keeps it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Arrangement-brief-compiles splice
(working tree, uncommitted): Build this arrangement brief compiles the current original’s key, tempo, meter, form, chords and band intensity locally.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Cancel-local-work-stops splice
(working tree, uncommitted): Cancel this local work stops preparation;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Retry-local-analysis-uses splice
(working tree, uncommitted): Retry this local analysis uses the same song ID and makes no new generation request.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Refresh-this-job-completes splice
(working tree, uncommitted): Refresh this job completes a saved request.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Refresh-this-job-polls splice
(working tree, uncommitted): Refresh this job polls an existing task and never resubmits it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Toggle-ramp-pedal splice
(working tree, uncommitted): Toggle this reference practice ramp pedal use
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Start-the-ramp-arms splice
(working tree, uncommitted): Start the ramp arms the settings;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Build-up-the-speed-in splice
(working tree, uncommitted): Build up the speed in Songs or Stage increases
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Reference-volume-uses splice
(working tree, uncommitted): This is the reference volume uses the shared band volume.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Loop-off-disables splice
(working tree, uncommitted): Loop off disables it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Return-to-the-band-stops splice
(working tree, uncommitted): Return to the band stops the reference and restores the chart band;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Test-key-er splice
(working tree, uncommitted): Test this key er ikke konfigurert;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Check-key-ser splice
(working tree, uncommitted): Check this key status ser bare i operativsystemets nøkkelring.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Minus-guitar-mix-comma splice
(working tree, uncommitted): Load this minus-guitar mix, Sessions Progress
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Talk-send-jo-and splice
(working tree, uncommitted): learn Talk or send this to Jo and enable pedal actions.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Remove-profile-deletes splice
(working tree, uncommitted): Remove this profile deletes only the profile, not the active setup.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Never-reduce-keeps splice
(working tree, uncommitted): Never reduce motion keeps CSS motion even when the OS asks to reduce it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Always-reduce-stops splice
(working tree, uncommitted): Always reduce motion stops CSS motion except meters and the playhead
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Match-os-follows splice
(working tree, uncommitted): Match the OS follows prefers-reduced-motion.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Export-logs-writes splice
(working tree, uncommitted): Export these logs writes to ~/JosefinesJamstudio/logs.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Idle-cpu-reads splice
(working tree, uncommitted): Sample this idle CPU reads this process.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Analysis-help-beside splice
(working tree, uncommitted): Use Open analysis help beside the take to open this explanation.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Evidence-exercise-opens splice
(working tree, uncommitted): Evidence and exercise opens the local summary and practice suggestion.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Evidence-exercise-and splice
(working tree, uncommitted): open Evidence and exercise and use Analyze again.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Listen-guitar-auditions splice
(working tree, uncommitted): Listen to the guitar auditions the selected input without the band.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Review-numbers-writes splice
(working tree, uncommitted): Review the numbers writes a recorded coaching note from the analysis figures only.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Section-ends-is splice
(working tree, uncommitted): This section ends before this bar is excluded
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Section-starts-is splice
(working tree, uncommitted): This section starts at this bar is included
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Confirm-bars-in splice
(working tree, uncommitted): Confirm these bars and sections in Songs.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Analyze-chords-then splice
(working tree, uncommitted): Analyze tempo and chords, then open Confirm these bars and sections.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Analyze-again-replaces splice
(working tree, uncommitted): Analyze again replaces only its analysis metadata, retaining unknown fields.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Musicai-estimates-writes splice
(working tree, uncommitted): Apply these Music.ai estimates writes unverified fixture results only when JAM_MUSICAI_FIXTURE=1.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Analyze-chords-or splice
(working tree, uncommitted): choose Analyze tempo and chords or Analyze again.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Analyze-chords-stays splice
(working tree, uncommitted): local Analyze tempo and chords stays available.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Test-key-stays splice
(working tree, uncommitted): Test this key stays not configured and does not call a cheapest provider endpoint.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Check-key-under splice
(working tree, uncommitted): then use Check this key status under API keys.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keychain-unavailable-means splice
(working tree, uncommitted): The keychain is unavailable means the saved key could not be checked, not that it is missing.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save-ai-persists splice
(working tree, uncommitted): Save these AI settings persists the chosen model/limits.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Preview-form-shows splice
(working tree, uncommitted): Preview this new form shows the result before applying it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Local-file-in splice
(working tree, uncommitted): open This is the local file in Songs
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Original-mix-bypasses splice
(working tree, uncommitted): Load this original mix bypasses saved stems and processing without deleting their settings.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Practice-speed-in splice
(working tree, uncommitted): Practice the speed and key in Songs or Stage.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Use-in-film-sets splice
(working tree, uncommitted): Use this in Film sets the selected asset as the current film soundtrack.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep-notes-appends splice
(working tree, uncommitted): Keep this in the song notes appends one suggestion with version and Undo protection.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Draft-in-jo-places splice
(working tree, uncommitted): Draft this in Jo places one experiment in the conversation input for your review
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Test-agent-or splice
(working tree, uncommitted): Test this agent or send a request from Assistant.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Detect-agent-or splice
(working tree, uncommitted): Detect this installed agent or provide its full executable path.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Test-model-sends splice
(working tree, uncommitted): Test this model sends a small billable request only when pressed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Load-models-fetches splice
(working tree, uncommitted): Load these provider models fetches a catalog
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Flash-priced-then splice
(working tree, uncommitted): Flash v2.5 is priced in USD per 1,000 characters, then Save voice setup.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Scribe-priced-and splice
(working tree, uncommitted): Scribe v2 is priced in USD per hour and
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Voice-setup-enter splice
(working tree, uncommitted): Open the voice setup, enter your Scribe v2
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Enable-shortcut-registers splice
(working tree, uncommitted): Enable this shortcut for this session registers it until disabled
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Voice-setup-also splice
(working tree, uncommitted): Open the voice setup also accepts a global shortcut
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Conversation-setup-opens splice
(working tree, uncommitted): Open the conversation and voice setup opens Jo AI
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Type-command-disclosure splice
(working tree, uncommitted): has a Type a command disclosure.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Hold-talk-with splice
(working tree, uncommitted): Hold this to talk with the pointer,
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Voice-setup-choose splice
(working tree, uncommitted): Open Jo AI → Open the voice setup, choose a microphone,
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Voice-setup-is splice
(working tree, uncommitted): Open the voice setup is separate from the guitar input.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Study-stage-cues splice
(working tree, uncommitted): Study this in Stage cues a matching chart without starting it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Play-chart-loads splice
(working tree, uncommitted): Play this chart loads the edited chart for the band.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Create-chart-starts splice
(working tree, uncommitted): Create this new chart starts a template.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Cue-next-to splice
(working tree, uncommitted): or Cue the next entry to prepare the following entry.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Remove-entry-change splice
(working tree, uncommitted): Remove this entry change the order.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Move-up-and splice
(working tree, uncommitted): Move this up and Remove this entry
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Update-entry-saves splice
(working tree, uncommitted): Update this entry saves its new chart,
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Edit-entry-loads splice
(working tree, uncommitted): Edit this entry loads an entry into the controls
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setlist-at splice
(working tree, uncommitted): Open This is the rehearsal setlist at the top of Stage.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 No-audio-or splice
(working tree, uncommitted): There is no audio or a headless status means
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Exit-loop-returns splice
(working tree, uncommitted): Exit this loop returns to the full form.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Charts-loading-appears splice
(working tree, uncommitted): The charts are loading appears while charts are fetched.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs-open splice
(working tree, uncommitted): Open these Songs open those rooms.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Library-and splice
(working tree, uncommitted): Go to this Library and Open these Songs
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Discard-close-abandons splice
(working tree, uncommitted): Discard these edits and close abandons unsaved edits.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep-edits-lets splice
(working tree, uncommitted): Keep these edits lets you save
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save-copy-to splice
(working tree, uncommitted): use Save this copy to preserve your draft,
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Listen-selection-then splice
(working tree, uncommitted): Listen to this selection then Use this performance.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep-variation-creates-section splice
(working tree, uncommitted): Keep this variation creates a separate section for that form entry,
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Preview-space-lowers splice
(working tree, uncommitted): Preview more of this space lowers drums and comp intensity, leaving the bass steady.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Preview-lift-increases splice
(working tree, uncommitted): Preview this lift increases the intensity of audible, unlocked drums, bass and comp.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save-take-finishes splice
(working tree, uncommitted): Save this take finishes it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Record-take-in-Write splice
(working tree, uncommitted): Record this take in Write saves and loads the song,
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Fit-tempo-riff-uses splice
(working tree, uncommitted): Fit the tempo to this riff uses the selected bar count and trimmed duration to change the band tempo.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Listen-trim-auditions splice
(working tree, uncommitted): Listen to this trim auditions it once through the native engine;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Generate-idea-uses splice
(working tree, uncommitted): Generate this idea uses the selected AI connection.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save-song-persists splice
(working tree, uncommitted): Save this song persists both, and Undo/Versions include them.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Make-variation-separates splice
(working tree, uncommitted): Make this variation separates them.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Song-notebook-holds splice
(working tree, uncommitted): This is the song notebook holds shared ideas, images and performance notes.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Phrase-reference-shows splice
(working tree, uncommitted): the adjacent This is the phrase reference shows its chords.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write-words-stores splice
(working tree, uncommitted): Write words for this section stores up to 12,000 UTF-16 characters with the section;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep-variation-creates splice
(working tree, uncommitted): Keep this as a section variation creates an idea outside the form, preserving the current arrangement and guitar timeline.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Extract-notes-in splice
(working tree, uncommitted): then Extract these notes in the desktop app.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Melody-harmony-at splice
(working tree, uncommitted): Open This turns melody into harmony at the top of Write.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Play-song-reloads-draft splice
(working tree, uncommitted): Play this song reloads your draft;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Next-colour-offers splice
(working tree, uncommitted): Find the next colour offers in-key chords, borrowed parallel-key chords and secondary dominants.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Transform-phrase-rotates splice
(working tree, uncommitted): Transform this phrase rotates, reverses or repeats the bars.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Remove-bar-keeps splice
(working tree, uncommitted): Remove this bar keeps at least one.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Add-bar-copies splice
(working tree, uncommitted): Add this bar copies the selected bar;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Loop-section-and splice
(working tree, uncommitted): Loop this section and Record also load the draft.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save-song-writes-disk splice
(working tree, uncommitted): Save this song writes to disk without changing playback.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Edit-order-moves splice
(working tree, uncommitted): Edit the order and repeats moves, removes or repeats form entries;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Add-section-copies splice
(working tree, uncommitted): Add this section copies the selected chords with default band settings.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Help-and-guides-opens splice
(working tree, uncommitted): Open help and guides opens this searchable manual without discarding the room you were using.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Record-take-to splice
(working tree, uncommitted): or Record this take to start an overdub from bar 1.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Play-song-to splice
(working tree, uncommitted): Press Play this song to load this draft into the band.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stem-ZIP-is-local splice
(working tree, uncommitted): Import this stem ZIP is local and free of provider calls.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Restore-guitar-unmutes splice
(working tree, uncommitted): Restore this guitar unmutes the identified track.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Apply-mix-or splice
(working tree, uncommitted): then Apply and save this mix or Minus this guitar.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Original-mix-plays splice
(working tree, uncommitted): Load this original mix plays the original stereo file while keeping the saved stems, including when a stem is damaged.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jamstudio-reloads splice
(working tree, uncommitted): After preparation, Load this in Jamstudio reloads the saved stem set.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Minus-guitar-plays-help splice
(working tree, uncommitted): Load this minus-guitar mix plays that WAV in the native engine after the check passes;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Residual-measures splice
(working tree, uncommitted): Check this guitar residual measures leak of a marked guitar stem into the other tracks, writes minus-guitar.wav next to the song, and is not configured without those stems.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Cancel-stops-local splice
(working tree, uncommitted): Cancel this current operation stops local work;
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Cancel-stops-preparation splice
(working tree, uncommitted): Cancel this current operation stops preparation and removes the incomplete output.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Media-player-to-hear splice
(working tree, uncommitted): use Listen in the media player to hear it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Practice-copy-creates splice
(working tree, uncommitted): Make this practice copy creates a new 48 kHz stereo WAV.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jamstudio-to-use splice
(working tree, uncommitted): Load this in Jamstudio to use the native player. Listen in the media player opens the saved file in the system player.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Residual-again splice
(working tree, uncommitted): Run Check this guitar residual again after the check has passed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sample-packs-with splice
(working tree, uncommitted): Run Settings → Check these sample packs with JAM_LIVE=1.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Original-mix-then splice
(working tree, uncommitted): Load this original mix then apply valid speed and transpose settings.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Play-loop-auditions splice
(working tree, uncommitted): Play this song or Loop this section auditions the band.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Test-model-before splice
(working tree, uncommitted): use Test this model before relying on one.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Choose-audio-or splice
(working tree, uncommitted): Use Choose an audio file or paste its path.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Play-reference-or splice
(working tree, uncommitted): Use Play the reference or the top transport to start.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Media-player-to splice
(working tree, uncommitted): Choose Listen in the media player to hear it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Minus-guitar first-run splice
(working tree, uncommitted): Check this guitar residual, then Load this minus-guitar mix.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Minus-guitar stays splice
(working tree, uncommitted): Load this minus-guitar mix stays not configured until a pass.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Minus-guitar plays splice
(working tree, uncommitted): Load this minus-guitar mix plays minus-guitar.wav after Check this guitar residual passes.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jamstudio-plays splice
(working tree, uncommitted): Load this in Jamstudio plays the reference through the native audio engine.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jamstudio-to splice
(working tree, uncommitted): Load this in Jamstudio to play it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Cancel-work splice
(working tree, uncommitted): Cancel this local work keeps any received provider output.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Undo-edit splice
(working tree, uncommitted): Undo this edit is available in Film.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Finishing delete splice
(working tree, uncommitted): or use Delete this section to let it go.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Add-bar splice
(working tree, uncommitted): Use Add this bar for a longer phrase.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Variation-creates splice
(working tree, uncommitted): Make this variation creates a separate draft.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Delete-section splice
(working tree, uncommitted): Delete this section removes a section that is no longer in the form.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Variation-for splice
(working tree, uncommitted): Make this variation for an independent edit.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 H-works leftover
(working tree, uncommitted): Keep that take. H is the shortcut.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Arm-capture splice
(working tree, uncommitted): Arm this capture before playing.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Play-song splice
(working tree, uncommitted): Play this song loads your current draft.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Create-song splice
(working tree, uncommitted): Create this new song, then use Record & layers to capture a riff.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 SongAnalysis splice
(working tree, uncommitted): Analyze again to replace it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Analyze-again splice
(working tree, uncommitted): Analyze again to refresh the measurements.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Strong record-take splice
(working tree, uncommitted): Hit Record a new take to record multi-track stems.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Record-take splice
(working tree, uncommitted): Hit Record a new take, then
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Analyze-take splice
(working tree, uncommitted): Analyze this take for timing and pitch trends.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Two-press pedal splice
(working tree, uncommitted): In Write → Hands-free controls, learn the two-press pedal.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Voice-setup splice
(working tree, uncommitted): Open the voice setup in Jo AI. Provider charges apply.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Talk-or-send splice
(working tree, uncommitted): This uses one press to start listening and another to send.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo timestamp
(working tree, uncommitted): This is Jo.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Review
(working tree, uncommitted): This is a review.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Applied
(working tree, uncommitted): This is applied.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Disconnected
(working tree, uncommitted): This is disconnected.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Unknown
(working tree, uncommitted): The price is unknown.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Swung
(working tree, uncommitted): This is swung.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Yours
(working tree, uncommitted): This is yours.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Editing
(working tree, uncommitted): This is editing.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Working
(working tree, uncommitted): This is working.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Estimated
(working tree, uncommitted): This is estimated.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Listening
(working tree, uncommitted): This is listening. Release this to send.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Transcribing
(working tree, uncommitted): This is transcribing.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo ready
(working tree, uncommitted): This is ready.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Driving groove
(working tree, uncommitted): This is driving a straight 8th rock groove.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 No matches
(working tree, uncommitted): This has no matches. Dette har ingen treff.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings headless
(working tree, uncommitted): This is headless. This has no audio device.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings hardware
(working tree, uncommitted): This is hardware. This is stopped.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions idle
(working tree, uncommitted): This is idle.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Recording stopped
(working tree, uncommitted): This recording is stopped. Analyze again. already a sentence.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Got it
(working tree, uncommitted): This is understood. This is underway.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Tapping tempo
(working tree, uncommitted): This is tapping the tempo. This is rolling.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Drums back in
(working tree, uncommitted): This is bringing the drums back in. The count-in is off.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Count-in is off
(working tree, uncommitted): The count-in is off. This is muting the drums.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Loop is off
(working tree, uncommitted): The loop is off. These Lyria prompts are updated.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Looping
(working tree, uncommitted): The loop is on. This playback is stopping.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Tuner on
(working tree, uncommitted): The tuner is on. The tuner is off.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Started playback
(working tree, uncommitted): This playback is started. This playback is paused. This playback is stopped.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Last edit undone
(working tree, uncommitted): This last edit is undone. This rhythm section is updated.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Section selected
(working tree, uncommitted): This section is selected. This part lock is updated.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo text commands
(working tree, uncommitted): These are text commands and optional ElevenLabs voice. This mix is applied and saved.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo tempo cues
(working tree, uncommitted): These cover tempo, cues, styles and recording. This audio setup profile is saved.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Test this key
(working tree, uncommitted): Test this key. This stays not configured. These voice settings are saved.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keychain look
(working tree, uncommitted): This looks only in the keychain. These AI settings are saved.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Key access
(working tree, uncommitted): Open these AI settings. This checks key access. This key is removed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Logged only
(working tree, uncommitted): This is logged only. These are offline commands.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setlist saved
(working tree, uncommitted): This setlist is saved. This recording is updated.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 This is saved
(working tree, uncommitted): This is saved. This idea is saved.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Song saved
(working tree, uncommitted): This song is saved. These are unsaved changes.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Source seconds
(working tree, uncommitted): This is {pos} / {sec} seconds of the source. This video is saved.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Target reached
(working tree, uncommitted): This target is reached. This has {n} beats per bar.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Complete bars
(working tree, uncommitted): {n} bars are complete. This ramp is armed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rendered locally
(working tree, uncommitted): This is rendered locally. This duration matches.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Saved locally
(working tree, uncommitted): This is saved locally.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Unsaved edits
(working tree, uncommitted): These are unsaved edits. This ramp is off, or waiting for updated output.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Fix file
(working tree, uncommitted): {error}. Fix the file or move it aside. {error}. Open Settings → First run for the next step.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Usage log
(working tree, uncommitted): {error}. Check ~/JosefinesJamstudio and retry. {error}. Open Settings → AI & models.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stop take
(working tree, uncommitted): {error}. Stop the current take first. {error}. Free disk space or restore the take folder, then retry.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Open Library
(working tree, uncommitted): {error}. Open Library; fix the file or restore the bundled copy. {error}. Start a take first.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Open Rig
(working tree, uncommitted): {error}. Open Rig, then Rescan or pick another port. {error}. Open Settings → Audio devices and pick the same interface for input and output.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Listed rig
(working tree, uncommitted): {error}. Pick a listed rig profile. {error}. Pick a listed chart or style, or a chart you saved.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Scene pick
(working tree, uncommitted): {error}. Pick a scene this profile can play. {error}. Use a CC from 0 to 127.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Voice setup
(working tree, uncommitted): Open Jo. Open the voice setup and choose a microphone. {error}. Retry after the OS allows the window to close.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep edits
(working tree, uncommitted): Keep these edits before you close. Release this to send up to 20 seconds to ElevenLabs.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Titles dialogue
(working tree, uncommitted): This has no titles or dialogue. This has no dialogue or on-screen text.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Natural room
(working tree, uncommitted): This is natural room sound and human dynamics. This has a clear verse and chorus, with no lead melody or vocals.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Fingerpicked verses
(working tree, uncommitted): This has fingerpicked verses, a warm melodic chorus, and a short instrumental ending. This uses warm electric bass, tight drums, and understated organ.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Live-room sound
(working tree, uncommitted): This is warm live-room sound. This is an original guitar-free backing track.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Intimate verse
(working tree, uncommitted): This is an intimate verse, a soaring chorus, and a short instrumental bridge. This is original instrumental guitar music.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Soulful song
(working tree, uncommitted): This is a soulful original guitar song. This is an intimate original acoustic guitar song.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rehearsal room
(working tree, uncommitted): This is a guitarist alone in a warm rehearsal room, with a close-up of hands, then a slow reveal of the room. This uses warm tungsten light, deep shadows, and subtle film grain.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Default shot
(working tree, uncommitted): This is a single continuous shot. This is an intimate live-performance film.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Shot lift
(working tree, uncommitted): This opens the space with bold camera movement and an emotional lift. This uses intimate framing, a slow camera move, and attentive performance detail.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Instrumental vocals
(working tree, uncommitted): This is instrumental with no vocals. This is a single continuous music-video shot for {section}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Arrangement intent
(working tree, uncommitted): The arrangement intent is adapted to the selected generation duration. The tempo is {bpm} BPM, {key}, {meter}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Brief intensity
(working tree, uncommitted): Band intensity is {n}%. Chords are {chords}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Harmony tones
(working tree, uncommitted): These tones are {notes}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Form repeats
(working tree, uncommitted): Bars {start}–{end}, repeated {n} times.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Band intensity
(working tree, uncommitted): Band intensity is {n}%. This section has {n} lines and {n} words.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 WritingDesk bars
(working tree, uncommitted): This song is {n} bars and {mm}:{ss} at {bpm} BPM.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 MIDI channel
(working tree, uncommitted): CC {n} is on channel {n}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Section bars
(working tree, uncommitted): This is {section}, bars {start}–{end}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Opening
(working tree, uncommitted): This is the opening.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ChordStrip jump
(working tree, uncommitted): This is bar {n} ({section}). Click it to jump. Shift-click it to loop.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Shot
(working tree, uncommitted): This is shot {n}. This is before {label}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Saved chart
(working tree, uncommitted): This saved {chart.name}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Exported stems
(working tree, uncommitted): This exported {n} stem(s) and the tempo map. Missing stem files were missing on disk.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Audio running at
(working tree, uncommitted): Audio is running at {sample_rate} Hz.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Engine status
(working tree, uncommitted): The engine status failed. The restart audio failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Audio devices
(working tree, uncommitted): The audio devices failed. The settings failed. The settings recovery failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Take review
(working tree, uncommitted): The take review failed. The export take failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 MIDI port closed
(working tree, uncommitted): The MIDI port is closed. The analyze take failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Virtual MIDI
(working tree, uncommitted): The virtual MIDI failed. The sample packs failed. The log export failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig program
(working tree, uncommitted): The rig program failed. The rig monitor failed. The MIDI port failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig scene
(working tree, uncommitted): The rig scene failed. The rig mapping failed. The rig follow failed. The rig control failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig profiles
(working tree, uncommitted): The rig profiles failed. The rig state failed. The rig profile failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Latency offset
(working tree, uncommitted): The latency offset failed. The takes failed. The delete take failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Transpose song
(working tree, uncommitted): The transpose song failed. The record failed. The stop recording failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save chart
(working tree, uncommitted): The save chart failed. The delete chart failed. The play chart failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Styles
(working tree, uncommitted): The styles failed. The charts failed. The library failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Load chart
(working tree, uncommitted): The load chart failed. The band failed. The Lyria failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Style
(working tree, uncommitted): The style failed. The intensity failed. The cue failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Loop
(working tree, uncommitted): The loop failed. The play failed. The pause failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Tone
(working tree, uncommitted): The tone failed. The tuner failed. The count-in failed. The time signature failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Click volume
(working tree, uncommitted): The click volume failed. The band volume failed. Choose the click volume.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Audio
(working tree, uncommitted): This audio is unnamed. This input is not connected. This buffer is the driver default.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Untitled chart
(working tree, uncommitted): This is an untitled chart.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Guitar
(working tree, uncommitted): This is guitar 1.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Version
(working tree, uncommitted): This is version 1.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Generate music
(working tree, uncommitted): Generate this music. Compose and arrange this. Nearby screen descriptions are sentences.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Alternative chords
(working tree, uncommitted): These are alternative chords. This is arrangement feedback. This is a contrasting bridge. This is a lyric seed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 New section
(working tree, uncommitted): This is a new section.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Default input
(working tree, uncommitted): These are the scene defaults. already a sentence. This is the default input. This is the default output.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rotate bars
(working tree, uncommitted): Rotate these bars. Reverse these bars. Repeat this phrase.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 estimated
(working tree, uncommitted): Section loops start at the estimated downbeat. Section loops start at the confirmed downbeat. This reference is playing.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 unknown
(working tree, uncommitted): This chord is unknown. Next is unknown.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 heard
(working tree, uncommitted): 120% is heard. 120% is set. Reset to 100% and the original key.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Key unknown
(working tree, uncommitted): This key is unknown. This is outside named sections.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 No analysed beat at this position
(working tree, uncommitted): No analysed beat at this position. Beat n of m.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Use soundtrack
(working tree, uncommitted): Use this soundtrack. Use this for this shot.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Remove this section's form entries first
(working tree, uncommitted): Remove this section's form entries first. Delete this unused section with its lyrics and band settings.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save your current video first
(working tree, uncommitted): Save your current video first. Start a new video.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Make the chorus lift
(working tree, uncommitted): Make the chorus lift. Add an eight-bar bridge.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Fit all cuts to song length
(working tree, uncommitted): Fit all these cuts to the song length. Let {brain} direct this.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Checking guitar residual
(working tree, uncommitted): Checking this guitar residual. Separating these stems.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Refreshing audio library
(working tree, uncommitted): Refreshing this audio library. Analyzing this song locally.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Planning section cuts
(working tree, uncommitted): Planning these section cuts. Opening this generated song.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Pull toward home
(working tree, uncommitted): This pulls toward home. This is in your key.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep the recent guitar idea
(working tree, uncommitted): Keep this recent guitar idea. Capture must be armed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Mute drums / bass / comp
(working tree, uncommitted): Mute drums, bass or comp. Intensity rises or falls by 5%.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Start / stop recording a take
(working tree, uncommitted): Start or stop recording a take. Cue a fill or a crash at the next bar.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Toggle loop
(working tree, uncommitted): Toggle this loop. Play or pause this.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jump to bar
(working tree, uncommitted): Jump to this bar. The range is 1–9 from the start of the form.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Transpose down ([)
(working tree, uncommitted): Transpose this down a semitone with [. Transpose this up a semitone with ].
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 No chord
(working tree, uncommitted): This is a rest or no chord. This is an untitled music video.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Drop the bass
(working tree, uncommitted): Drop the bass. Play a fill. Set tempo to 100.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Follows your playing
(working tree, uncommitted): This follows your playing. This is fixed intensity.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Choose a profile
(working tree, uncommitted): Choose this profile. Choose this chart.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Proposed intensity changes
(working tree, uncommitted): These are the proposed intensity changes. Preview this lift. Preview more of this space.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Silent shot preview
(working tree, uncommitted): This is a silent shot preview. Play this silent preview.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 RoomTools titles
(working tree, uncommitted): This is a blind take comparison. This is a song tone snapshot. These are the audio setup profiles.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Blind comparison label
(working tree, uncommitted): This is a blind comparison.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep that riff pedal
(working tree, uncommitted): Keep this riff. Record or save this take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Reference map confirmation
(working tree, uncommitted): Confirm these bars and sections.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Library shortcut titles
(working tree, uncommitted): Play this with Ctrl/Cmd+Enter. Save this with Ctrl/Cmd+S.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Library playable status
(working tree, uncommitted): This chart is not playable yet. This is unsaved.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Library editor titles
(working tree, uncommitted): Open this chart in the editor. Load this into the band. This adopts its tempo and style. This is a preview of this form.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Preview clip label
(working tree, uncommitted): This is a preview.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 This song take-list label
(working tree, uncommitted): This is from this song. This is a captured idea. This is a take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Song settings legend
(working tree, uncommitted): These are the song settings.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write Help with view
(working tree, uncommitted): Open help for {WRITING_HELP[w.view].label}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write play-from-start title
(working tree, uncommitted): This loads the current song edits and plays from the beginning.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write record start title
(working tree, uncommitted): This starts at bar 1 and records a new take while guitar layers play.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write Record idle label
(working tree, uncommitted): Record this take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Save take
(working tree, uncommitted): Save this take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keep that (H)
(working tree, uncommitted): Keep that take. H works.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Arm capture
(working tree, uncommitted): Arm this capture. Disarm this capture.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Conversation and voice setup
(working tree, uncommitted): Open the conversation and voice setup. Review these studio changes.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Enable shortcut for this session
(working tree, uncommitted): Enable this shortcut for this session. Disable this global shortcut.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Check ElevenLabs prices
(working tree, uncommitted): Check these ElevenLabs prices. Open these AI settings.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Topics in this chapter aria-label
(working tree, uncommitted): These are the topics in this chapter. Dette er emnene i kapitlet.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Workspace view aria-label
(working tree, uncommitted): These are the workspace views.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Help with loaded arrangement aria-label
(working tree, uncommitted): Help with this loaded arrangement. These are the writing views. Choose a groove to try. This is the retrospective capture. Choose the capture length.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Studio rooms aria-label
(working tree, uncommitted): These are the studio rooms.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Reduced motion aria-label
(working tree, uncommitted): Choose the reduced motion.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Confirm reference bars aria-label
(working tree, uncommitted): Confirm these bars and sections.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo on Stage aria-label
(working tree, uncommitted): This is Jo on Stage.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Studio assistant aria-label
(working tree, uncommitted): This is the studio assistant. Hide this studio assistant.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo voice aria-label
(working tree, uncommitted): This is the Jo voice.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo Message Jo aria-label
(working tree, uncommitted): Type a message for Jo. These are the suggested prompts. Review these studio changes.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Saved song analysis aria-label
(working tree, uncommitted): This is the estimated harmony. These are the estimated chord passages.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Reference player aria-label
(working tree, uncommitted): This is the reference player. These are the bars and sections. This is the current chord estimate. Practice the speed and key. Build up the speed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Library Search charts aria-label
(working tree, uncommitted): Search the library. Choose the chart collection. This is the chart editor.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs Search songs aria-label
(working tree, uncommitted): Search the library. This is the audio library. Speed is {speed}%.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions Search takes aria-label
(working tree, uncommitted): Find a take. This is the recorded waveform. These are the take measurements.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Music.ai estimates aria-label
(working tree, uncommitted): These are the Music.ai estimates. Apply these Music.ai estimates.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stems Apply and save mix
(working tree, uncommitted): Apply and save this mix. Minus this guitar. Restore this guitar.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stem mixer aria-label
(working tree, uncommitted): This is the stem mixer. These are the track levels and mutes.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film readiness aria-label
(working tree, uncommitted): This is the film readiness. These are the music prompt starters.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage Drums aria-label
(working tree, uncommitted): Drums are muted. / Drums are playing. Bass and Comp match. startup Load chart failed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage Chart aria-label
(working tree, uncommitted): Choose the chart. Transpose this down. Transpose this up. Choose the style. Choose the intensity. Choose the band volume. Choose the click volume.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig Send PC button
(working tree, uncommitted): Send this PC {programInput}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig section scene aria-label
(working tree, uncommitted): This is the {sec} scene. This is the program number.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AudioProfiles Recall profile button
(working tree, uncommitted): Recall this {name}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AudioProfiles Remove profile aria-label
(working tree, uncommitted): Remove this profile {name}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setlist Edit entry aria-label
(working tree, uncommitted): Edit this entry {i + 1}. Move this entry {i + 1} up. Remove this entry {i + 1}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ChordShapes Shape aria-label
(working tree, uncommitted): Shape {i + 1} is {shape}. These are shapes for {now}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write Song arrangement aria-label
(working tree, uncommitted): This is the song arrangement. This is the chord grid. This is the harmony explorer. These are the section lyrics.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write Section energy aria-label
(working tree, uncommitted): Section energy is {amount}%.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write palette Use chord aria-label
(working tree, uncommitted): Use {chord}. {reason}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Finish review title periods
(working tree, uncommitted): Give this original a name. {section.name} is outside the form. {section.name} has no lyric draft.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Finish clip colon titles
(working tree, uncommitted): {clip.label} is missing its source take. {clip.label} needs its trim checked.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write Rest / no chord
(working tree, uncommitted): This is a rest or no chord.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write harmony Borrow from the parallel key
(working tree, uncommitted): Borrow from the parallel key. Dominants that lead somewhere.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write harmony {section.name} chords
(working tree, uncommitted): These are the {section.name} chords.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Finish unused-section Delete section
(working tree, uncommitted): Delete this section.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write map Add section
(working tree, uncommitted): Add this section. Make this variation. Delete this section.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 SongLab Keep in song notes
(working tree, uncommitted): Keep this in the song notes. Generate this idea.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Coach Ask three perspectives
(working tree, uncommitted): Ask these three perspectives. Draft this in Jo. Keep this in the song notes.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 BeatCuts Preview aligned cuts
(working tree, uncommitted): Preview these aligned cuts. Apply these aligned cuts.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Melody Preview chord choices
(working tree, uncommitted): Preview these chord choices. Extract these notes. Keep this as a section variation.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 RigSnapshot Capture current tone
(working tree, uncommitted): Capture this current tone. Recall this snapshot to the rig.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Blueprint Preview new form
(working tree, uncommitted): Preview this new form. Apply this blueprint to the original.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AudioProfiles Save current setup
(working tree, uncommitted): Save this current setup.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film Play film with sound
(working tree, uncommitted): Play this film with sound.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Originals empty-state Create a song
(working tree, uncommitted): Create this new song.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film Apply to storyboard
(working tree, uncommitted): Apply this to the storyboard. Render this music video. Open this audio library. Cancel this local work.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 BriefTool build/use-prompt buttons
(working tree, uncommitted): Build this arrangement brief. Use this prompt in AI Music.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 DiscoveryTool current-original option
(working tree, uncommitted): This current original is. Study this in Stage.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 BriefTool instrumental-brief label
(working tree, uncommitted): This brief is instrumental.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ComparisonTool Listen/Keep A-B left compact
(working tree, uncommitted): Listen A/B and Keep A/B stay compact A/B chrome.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ComparisonTool start-blind button
(working tree, uncommitted): Start this blind comparison.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film import-clip button
(working tree, uncommitted): Import this clip for this shot.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ComparisonTool reveal/new buttons
(working tree, uncommitted): Reveal these identities. Start this new comparison.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 voice.rs Hold-to-talk quote
(working tree, uncommitted): Hold this to talk., speak
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 JoVoice set-up button
(working tree, uncommitted): Open the voice setup.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 JoVoice hold/release buttons
(working tree, uncommitted): Hold this to talk. Release this to send.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 FinishingDesk listen-selection button
(working tree, uncommitted): Listen to this selection.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 JoVoice load/cancel buttons
(working tree, uncommitted): Load these voices. Cancel this voice.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 FinishingDesk variation buttons
(working tree, uncommitted): Keep this variation. Discard this preview. Use this performance.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 WritingDesk Loop-section quote
(working tree, uncommitted): Loop this section. auditions the band.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Originals song/section buttons
(working tree, uncommitted): Create this new song. Save this song. Play this song.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 SongAnalysis passage buttons
(working tree, uncommitted): Show these previous passages. Show these next passages.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo dispatcher Undo-edit quote
(working tree, uncommitted): Undo this edit. is available in Film
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 SongAnalysis Analyze-again quote
(working tree, uncommitted): Analyze again. to replace it.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film undo/save/take/shot buttons
(working tree, uncommitted): Undo this edit. Save this project. Use this take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions Analyze-again button
(working tree, uncommitted): Analyze again.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film API-settings buttons
(working tree, uncommitted): Open these AI settings.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 api-options Test-model acceptance quote
(working tree, uncommitted): run Test this model.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions offset-title quote
(working tree, uncommitted): or enter the guitar offset.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 manual DAW-measurement quote
(working tree, uncommitted): You can still Enter the guitar offset.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 manual guitar-offset quote
(working tree, uncommitted): Enter the guitar offset. is the round-trip sample delay.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 StudioAssistant Cancel request left compact
(working tree, uncommitted): Cancel request stays compact abort chrome, same class as Cancel.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 api-options response-limits quote
(working tree, uncommitted): These are the response limits and cost estimate. Cancel request stays compact abort chrome.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 api-options model-button quotes
(working tree, uncommitted): Load these provider models. Detect this installed agent. Test this agent.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 api-options API-keys quote
(working tree, uncommitted): API keys. Stored in the OS keychain. Save these AI settings. Test this model.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 README Help-and-guides quotes
(working tree, uncommitted): Open help and guides. Use this in Film.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 studio-rooms Play-this quote
(working tree, uncommitted): Play this chart. Exit this loop. Use this in Film.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 setup guitar-offset quote
(working tree, uncommitted): enter the guitar offset.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ShortcutsHelp Close help left compact
(working tree, uncommitted): Close help / Lukk hjelp stay compact dismiss chrome, same class as Cancel.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 setup key-status quotes
(working tree, uncommitted): Test this key. Check this key status. Sample this idle CPU.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 setup MIDI and pack quotes
(working tree, uncommitted): then Check this virtual MIDI. Settings → Check these sample packs.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ShortcutsHelp heading sentences
(working tree, uncommitted): Open help and guides. Åpne hjelp og veiledninger.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 App Help-and-guides sentence
(working tree, uncommitted): Open help and guides.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 App close-dialog body quote
(working tree, uncommitted): Keep these edits. to save them before closing.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo key-access help quote
(working tree, uncommitted): Open these AI settings. to check key access.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AiSettings Open-API-keys sentence
(working tree, uncommitted): Open these API keys below to retry the check. use Test this model. before relying on one.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings first-run checklist quotes
(working tree, uncommitted): then Check this virtual MIDI. Check these sample packs.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 FootControls rescan sentence
(working tree, uncommitted): Rescan these inputs.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings first-run API-keys sentence
(working tree, uncommitted): Open these API keys.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Library editor sentences
(working tree, uncommitted): This is the chart editor. How to write this chart.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Library New-chart sentences
(working tree, uncommitted): Create this new chart. Reload this folder. Play this chart.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Library Stage sentence
(working tree, uncommitted): Go to this Stage. Discard these draft changes.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stems upload-import sentences
(working tree, uncommitted): Upload and separate these stems. Import this stem ZIP.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig Rescan left compact
(working tree, uncommitted): Rescan stays one-word recovery chrome, same class as Cancel.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig virtual-MIDI sentence
(working tree, uncommitted): Check this virtual MIDI.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings Rig-ports sentences
(working tree, uncommitted): Open these Rig ports. Refresh this usage.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings idle-CPU sentence
(working tree, uncommitted): Sample this idle CPU.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings packs-logs sentences
(working tree, uncommitted): Check these sample packs. Export these logs. Rescan these devices.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo proposal sentences
(working tree, uncommitted): Apply these proposed edits. Dismiss this proposal.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings restart-audio sentence
(working tree, uncommitted): Restart this audio.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage exit-loop sentence
(working tree, uncommitted): Exit this loop.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage audio-devices sentence
(working tree, uncommitted): Open these audio devices.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage empty-state sentences
(working tree, uncommitted): Go to this Library. Open these Songs. Open this First run.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AiSettings docs-link sentences
(working tree, uncommitted): Open the account and subscription documentation. Check the current pricing.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AiSettings agent sentences
(working tree, uncommitted): Test this agent. Detect this installed agent.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AiSettings load-models sentences
(working tree, uncommitted): Load these provider models. Test this model.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage open-AI-settings sentence
(working tree, uncommitted): Open these AI settings. Save these AI settings.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 SongLab AI-settings sentence
(working tree, uncommitted): Open these AI settings.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 App close-dialog sentences
(working tree, uncommitted): Keep these edits. Discard these edits and close.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo choose-AI sentence
(working tree, uncommitted): Choose this AI and model.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs use-in-film sentence
(working tree, uncommitted): Use this in Film.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs import-cancel sentences
(working tree, uncommitted): Import this audio. Cancel this current operation.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs refresh-library sentence
(working tree, uncommitted): Refresh this library.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs create-copy sentences
(working tree, uncommitted): Create this practice copy. Keep these song files together.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs practice-copy sentences
(working tree, uncommitted): Make this practice copy. Choose an audio file.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs Load in Jamstudio sentence
(working tree, uncommitted): Load this in Jamstudio. media.rs Load this original mix.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs original-mix sentences
(working tree, uncommitted): Load this original mix. Listen in the media player.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs minus-guitar mix sentence
(working tree, uncommitted): Load this minus-guitar mix.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stems residual button sentence
(working tree, uncommitted): Check this guitar residual.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings residual first-run quote
(working tree, uncommitted): Check this guitar residual.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Key-test error quotes
(working tree, uncommitted): Check this key status. only looks in the OS keychain.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings first-run key quotes
(working tree, uncommitted): Test this key. is not configured. Check this key status. only looks in the keychain.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AiSettings check-test sentences
(working tree, uncommitted): Check this key status. Test this key.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AiSettings key-button sentences
(working tree, uncommitted): Remove this key. Save this key.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Originals keep-version sentence
(working tree, uncommitted): Keep this version.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Originals tempo-trim sentences
(working tree, uncommitted): Fit the tempo to this riff. Listen to this trim.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferenceGrid save-map sentence
(working tree, uncommitted): Save this confirmed map.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferenceGrid confirm sentences
(working tree, uncommitted): Confirm these bars and sections. These are the estimated beats per bar. This is the name of section {n}.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferenceGrid bar-field sentences
(working tree, uncommitted): This section starts at this bar. This section ends before this bar.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferenceGrid section sentences
(working tree, uncommitted): Remove this section {n}. Add this section.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Originals remove sentences
(working tree, uncommitted): Remove this layer. Remove this version.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 WritingDesk bar sentences
(working tree, uncommitted): Remove this bar. Add this bar. Remove this section.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setlist missing-chart sentences
(working tree, uncommitted): This chart is missing. Remove this profile.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film remove-shot sentences
(working tree, uncommitted): Remove this shot. Edit this entry.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setlist numbered-cue sentences
(working tree, uncommitted): Cue entry {n}. Film Move this up.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setlist cue-next sentences
(working tree, uncommitted): Cue the next entry. Remove this entry.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setlist cancel-edit sentences
(working tree, uncommitted): Cancel this edit. Move this up.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Setlist add-button sentences
(working tree, uncommitted): Add this to the setlist. Update this entry.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 TransportBar meter-title sentences
(working tree, uncommitted): Meter follows the loaded chart. Start the ramp.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferencePlayer loop-button sentences
(working tree, uncommitted): Loop this range. Loop off.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferencePlayer play-button sentences
(working tree, uncommitted): Play the reference. Return to the band.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferencePlayer transpose-label sentences
(working tree, uncommitted): Reference transpose is in semitones. This is the reference volume.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 TransportBar record-label sentences
(working tree, uncommitted): Record a new take. Stop recording.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 EngineStatusPill label sentences
(working tree, uncommitted): Waiting for the audio. There is no audio device.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 StudioAssistant apply-button sentences
(working tree, uncommitted): Apply the proposed actions. Agent account limits apply.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 StudioAssistant field-label sentences
(working tree, uncommitted): Ask your studio assistant. This is the action JSON.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 StudioAssistant heading sentences
(working tree, uncommitted): Make the next move. Choose the assistant connection.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 FinishingDesk heading sentences
(working tree, uncommitted): Make this song land. Build your guitar performance.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferencePlayer ramp-field sentences
(working tree, uncommitted): Start speed is in percent. Apply and save the speed and key.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferencePlayer ramp-heading sentences
(working tree, uncommitted): Build up the speed. Practice the speed and key.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions delete-button sentences
(working tree, uncommitted): Delete this take. Delete this take…
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions listen and export sentences
(working tree, uncommitted): Listen to the guitar. Export the stems.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions favourite and layer sentences
(working tree, uncommitted): This is a favourite. Keep this take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions record and analyze sentences
(working tree, uncommitted): Stop recording. Record a new take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings measuring-loopback sentence
(working tree, uncommitted): Measuring the loopback. DESIGN full
copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings engine status-pill sentences
(working tree, uncommitted): The engine is running. There is no
audio. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings sample-pack and diagnostics sentences
(working tree, uncommitted): These are the sample packs. These are
the diagnostics. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Help search and shortcut sentences
(working tree, uncommitted): Search the manual. These are the
keyboard shortcuts. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Help empty-option and language sentences
(working tree, uncommitted): No matches. Choose the language.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig status-pill and monitor-dot sentences
(working tree, uncommitted): No MIDI port is open. Sent to the port.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig knobs and follow-sections sentences
(working tree, uncommitted): These are the knobs. Follow the chart
sections. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig Program Change and monitor sentences
(working tree, uncommitted): Send a Program Change. This is the MIDI
monitor. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Blueprint and Rig MIDI-out sentences
(working tree, uncommitted): Use a named reference. Choose the MIDI
output. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write and Setlist empty-option sentences
(working tree, uncommitted): Choose a section. Choose a chart.
Edit shot n. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write empty-state and save-state sentences
(working tree, uncommitted): Start with your own idea. Unsaved
changes. Saved. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Songs path and stem-ZIP sentences
(working tree, uncommitted): Enter the audio file path. Paste the
full path. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write version and lyric-notebook sentences
(working tree, uncommitted): A chorus with space. These are the
section lyrics. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions search and take-list sentences
(working tree, uncommitted): Search song, style, tempo or notes.
Find a take. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AI settings placeholder and field sentences
(working tree, uncommitted): Enter a provider name. The price is
unknown. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo chat speaker and timestamp sentences
(working tree, uncommitted): You. Jo. Review. DESIGN full copy-audit
stays ☐. Goal stays incomplete.

2026-09-12 Jo composer and Stage command sentences
(working tree, uncommitted): Type a command. Examples are faster.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo status-pill and review-heading sentences
(working tree, uncommitted): Jo is thinking. Ready. DESIGN full
copy-audit stays ☐. Goal stays incomplete.

2026-09-12 AI key-row and Jo keychain sentences
(working tree, uncommitted): Name. A key is saved. The keychain is
unavailable. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Rig snapshot and nav-title sentences
(working tree, uncommitted): Profile. Scene. CC n is v. DESIGN full
copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo voice latency and phase sentences
(working tree, uncommitted): N ms. Ready. DESIGN full copy-audit stays
☐. Goal stays incomplete.

2026-09-12 Comparison reveal and Music.ai estimate sentences
(working tree, uncommitted): Timestamp. Id. These are the Music.ai
estimates. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 SoloHelper chord-tone and scale sentences
(working tree, uncommitted): These are the chord tones. These scales
fit. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage chart-select loading and unsaved sentences
(working tree, uncommitted): The charts are loading. Name is unsaved.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage source-pill and part-row sentences
(working tree, uncommitted): Lyria is not live. This is the jam band.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage tempo and bar readout sentences
(working tree, uncommitted): This is the tempo. This is the bar.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage tempo-trainer panel and count-in sentences
(working tree, uncommitted): This is the tempo trainer. This is the
count-in. Get ready. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Stage tempo-trainer field sentences
(working tree, uncommitted): Choose the start tempo. Choose the target
tempo. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage source and mix-eyebrow sentences
(working tree, uncommitted): Choose the source. Choose the chart.
Hear the tuner. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Finish performance and take-timestamp sentences
(working tree, uncommitted): Choose the performance. Timestamp. Id.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Transport loop and count-in sentences
(working tree, uncommitted): Loop bars n to n. Count-in is off.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions guitar-offset sentences
(working tree, uncommitted): Enter the guitar offset. N samples. N
ms. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings output and usage-log sentences
(working tree, uncommitted): This is the output. Name. N channels.
Format. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage chart-setup and rehearse sentences
(working tree, uncommitted): These are the chart and band settings.
Rehearse this section. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Transport reference and engine-status sentences
(working tree, uncommitted): The reference is at n of n s. Device.
kHz. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Song analysis harmony sentences
(working tree, uncommitted): This is the estimated harmony. Tempo
was not found. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Write mute and tone-follow sentences
(working tree, uncommitted): Mute this layer. Let this song change
my rig tones. Change unlocked parts. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Write groove and part-mix sentences
(working tree, uncommitted): Choose a groove to try. Swing is a
percent. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write song-name and key-setting sentences
(working tree, uncommitted): Name this song. Open a saved song.
Tempo is in BPM. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Write version and trim-field sentences
(working tree, uncommitted): These are the saved versions. Name this
version. Trim start is in seconds. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Write section and guitar-layer sentences
(working tree, uncommitted): Edit this section. Name this section.
These are the guitar layers. DESIGN full copy-audit stays ☐. Goal
stays incomplete.

2026-09-12 Stem mixer and stem-preparation sentences
(working tree, uncommitted): Your account price is in USD per
minute. This guitar track is not identified. DESIGN full copy-audit
stays ☐. Goal stays incomplete.

2026-09-12 Song Lab explore and direction sentences
(working tree, uncommitted): Choose what to explore. Write your
direction. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write hands-free and pedal sentences
(working tree, uncommitted): Hands-free controls are enabled. Choose
the MIDI input. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Jo voice-setup and price sentences
(working tree, uncommitted): Open the voice setup. Scribe v2 is
priced in USD per hour. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Settings motion and device sentences
(working tree, uncommitted): Always reduce motion. Never reduce
motion. Choose the output device. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Write map and phrase sentences
(working tree, uncommitted): This is the song map. Transform this
phrase. This is the phrase reference. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Finish contrast and transition sentences
(working tree, uncommitted): Contrast strength is n%. This is the
transition lab. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Library collection and search sentences
(working tree, uncommitted): Show all charts. Show your charts.
Search the library. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Songs empty-search and analyze sentences
(working tree, uncommitted): No matching songs. Analyze tempo and
chords. Analyze again. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Songs import-summary and search sentences
(working tree, uncommitted): Import a finished mix or reference.
Search the library. Stored on your computer. DESIGN full copy-audit
stays ☐. Goal stays incomplete.

2026-09-12 Songs local-file and speed sentences
(working tree, uncommitted): This is the local file. Speed is n%.
Choose the transpose. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Film catalog and prompt-starter sentences
(working tree, uncommitted): Models include Lyria, MiniMax, Eleven
and local. Start from an acoustic sketch. DESIGN full copy-audit
stays ☐. Goal stays incomplete.

2026-09-12 Film eyebrow and shot-status sentences
(working tree, uncommitted): This section is the soundtrack. This
shot needs a clip. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Film project-settings and step sentences
(working tree, uncommitted): Open the project settings. Step 1 is
the soundtrack. Unsaved edits. DESIGN full copy-audit stays ☐. Goal
stays incomplete.

2026-09-12 Film tools-check and readiness sentences
(working tree, uncommitted): Checking local media tools. Choose the
song. Shots are assigned. DESIGN full copy-audit stays ☐. Goal stays
incomplete.

2026-09-12 Film job-filter and lyrics sentences
(working tree, uncommitted): Show these jobs. Show all jobs. Open
the generated lyrics and structure. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Film creative-direction and proposal sentences
(working tree, uncommitted): Set the creative direction. Describe
the look, subject and recurring details. Review the director’s
proposal. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film song-generator and empty-option sentences
(working tree, uncommitted): Generate a song. Start from an idea.
Choose audio. Choose a recording. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Film instrumental and project sentences
(working tree, uncommitted): This track is instrumental. This is a
new unsaved project. Open the workflow documentation.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film node-ID and path sentences
(working tree, uncommitted): Enter the prompt node ID. Enter the
full local file path. Set the preview position.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film model and footage sentences
(working tree, uncommitted): Choose a music/video model. Requested
and generate length are in seconds. Choose footage for this shot.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film take and shot-name sentences
(working tree, uncommitted): Choose a studio take. Name this shot.
Timeline length is in seconds. Choose a melody recording. Choose
the first/second take.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Film frame and Setlist chart sentences
(working tree, uncommitted): Choose the frame. 720p. 30 fps. Chart
for this entry. Groove for this entry. Choose a source section.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 BriefTool and Setlist field sentences
(working tree, uncommitted): This musical direction is editable.
Review and edit the generation prompt. Name this setup. Count-in
is in bars. Landscape is 16:9.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Blueprint reference and Film take sentences
(working tree, uncommitted): Reference audio is optional. Find
movements related to this source. Soundtrack tempo is in BPM.
Film takes say timestamp. duration.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Room-tool field and take-option sentences
(working tree, uncommitted): Write one section per line as Name |
bars | energy. Excerpt start is in seconds. Cut grid is in beats.
Take options are timestamp. n s. id.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 MelodyTool and Songs analysis sentences
(working tree, uncommitted): Editable melody. Note, start seconds,
and duration seconds. Bar n. No notes. Audio. Analysis is saved.
Channel is n. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Seek, Song Lab and locked/muted sentences
(working tree, uncommitted): Seek to a time in seconds. Song Lab.
Explore another direction. Part is locked/muted. Open one in Write.
API keys. Stored in the OS keychain.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Library yours/swung and nearby middots
(working tree, uncommitted): Yours. Swung. Generate song. Uses API
credits. Reference speed is n%. Section energy is n%.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 ReferenceGrid and middot sentences
(working tree, uncommitted): First downbeat is the estimated beat
number. Preview only. Messages are logged. Working. Editing.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage form and estimate sentences
(working tree, uncommitted): The form is {section}. Sessions/Settings
offset says Estimated. Usage says Estimated cost is $n.
Compact bar : beat stayed. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Stage mute-button sentences
(working tree, uncommitted): Drums are muted. Bass/Comp is muted.
AT names stay Drums/Bass/Comp. DI dynamics. Compact bar : beat stayed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage Press play and strip hints
(working tree, uncommitted): Press play. The band starts… Click a
bar to jump. Compact bar : beat stayed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Stage next-bar and tuner sentences
(working tree, uncommitted): Next bar is {cue/style/intensity}.
Play a single note. Compact bar : beat stayed.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions waveform and streak sentences
(working tree, uncommitted): No waveform is available. Practice
streak has no days yet. Recorded jam time is a sentence. Write-first
tooltip keeps its imperative and ends with a period.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Sessions measurement and Progress sentences
(working tree, uncommitted): The take has N detected attacks. Grid
distance/bias/spread are sentences. Timing does not have enough evidence.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 SoloHelper, ReferenceGrid and preview chord none
(working tree, uncommitted): No guide tones. No beat time. Preview
empty chord is blank so Stage shows No chord.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Jo chart/mute none-states and Stage No chord
(working tree, uncommitted): No chart is loaded. No parts are muted.
Stage empty chord says No chord. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Jo Film and songwriting none-states
(working tree, uncommitted): No Film project is open. No songwriting
document is open. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings engine-status sentences
(working tree, uncommitted): The stream has N errors. The input has
N gaps. Headless. No audio device. No output/input device.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 MemorySink and preview device sentences
(working tree, uncommitted): No MIDI port is open. Messages are only
logged. Preview Input/Output/MIDI Out are simulated.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Preview MIDI port sentences
(working tree, uncommitted): No MIDI port is open. Browser preview
only logs messages. Port is open in browser preview. Nothing is sent.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Open-URL host and stem-recovery sentences
(working tree, uncommitted): This host is not on the open-in-browser
list. The stem recovery folder is. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Provider-fetch and take-analysis sentences
(working tree, uncommitted): Provider is not on the allow-list.
The path contains whitespace. Method is not allowed. Header is set
by the app. Grid distance and attack-level variation are sentences.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Song-import and take-index skip sentences
(working tree, uncommitted): Song was imported and kept. Preparation
failed. Skipped unreadable take index row.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 MIDI open/send and sample-format sentences
(working tree, uncommitted): Could not open MIDI port. MIDI send
failed. Sample format is not supported.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Keychain and missing-key sentences
(working tree, uncommitted): The keychain is unavailable.
No API key for the provider. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Usage-log and provider-path sentences
(working tree, uncommitted): Cannot create/write the usage log.
The request failed. The path must start with a single slash.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Take delete and default-device sentences
(working tree, uncommitted): Could not delete take. Could not inspect
take. No default device. Has no default output/input config.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Engine status device sentences
(working tree, uncommitted): The output audio device failed. The input
audio device failed. Cannot enumerate devices. Cannot start the audio
stream. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Recorder path and stream sentences
(working tree, uncommitted): Cannot create {path}. Cannot save {path}.
Cannot open {path}. Cannot open the output/input stream.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Band kit and instrument path sentences
(working tree, uncommitted): Cannot read {path}. Cannot start {path}.
kit.json is invalid. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Chart import and save path sentences
(working tree, uncommitted): Cannot read {path}. Cannot create {path}.
Cannot write {path}. Cannot delete {path}. DESIGN full copy-audit
stays ☐. Goal stays incomplete.

2026-09-12 Library load-error sentences
(working tree, uncommitted): The bundled styles could not load.
The bundled charts could not load. Chart {id} is invalid.
The bundled rigs could not load. The rig is invalid.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Originals and take-read sentences
(working tree, uncommitted): Cannot read {path}. Cannot read take {id}
at {path}. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Media-document and analysis-finish sentences
(working tree, uncommitted): Cannot read media document. Invalid media
document. Audio kept; analysis did not finish. Cannot write media
document. DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Settings read and song-list sentences
(working tree, uncommitted): Cannot read {path}. Cannot recover {path}.
The song {id} is invalid. The file {path} is invalid. File left intact.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Voice-shortcut and take-analysis sentences
(working tree, uncommitted): Could not disable the voice shortcut.
Could not publish the song folder. Cannot save the take analysis
beside. Cannot save the take review beside. DESIGN full copy-audit
stays ☐. Goal stays incomplete.

2026-09-12 Usage-log and stem-ZIP sentences
(working tree, uncommitted): Could not save the usage log.
Cannot read session.json. Could not save the paid stem ZIP.
session.json is not JSON. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Media-tool and session-folder sentences
(working tree, uncommitted): The media tool could not start.
Cannot create the session folder. The reference timing is invalid.
Cannot write session.json. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Cue and video-project sentences
(working tree, uncommitted): The cue is unknown. The take index is
unavailable. The video project is invalid. The song is invalid.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Recording and import error sentences
(working tree, uncommitted): Recording was interrupted. Cannot record.
The audio is damaged. Import stopped. MIDI output is unavailable.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Shortcut count-in and shift sentences
(working tree, uncommitted): Count-in cycles off, 1 bar, or 2 bars.
Shift changes tempo by 5. Manuals EN+nb exported. Coach prompt
drops Label: prefixes. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Load-song and open-url sentences
(working tree, uncommitted): Several songs match uses exact ID as a
sentence. Open-url says Copy it into your browser. Preview analysis
needs the desktop app. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Assistant dump and Coach sentences
(working tree, uncommitted): Tool args say {k} is {v}. Coach drafts
say Propose changes for review. Brain test says {name} responded.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Generation brief sentences
(working tree, uncommitted): Briefs say The original song is / The
direction is / {section} has {n} bars. Tool rows and StudioAssistant
state lines match. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Solo why and Gemini sentences
(working tree, uncommitted): Remaining SoloHelper why-lines are
sentences. Gemini context is Transport/Style/Chart is. DESIGN full
copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Snapshot CC and scale sentences
(working tree, uncommitted): Rig snapshots say CC {n} is {value}.
Provider HTTP errors use a period. SoloHelper Ionian/natural-minor/
key-centre why-lines are sentences. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Rig and chart command sentences
(working tree, uncommitted): Store command errors say {label} failed.
Rig scene/profile/mapping/control and Delete chart use that factory.
BriefTool directions are sentences. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Browser preview banner sentences
(working tree, uncommitted): Library, Film and StudioAssistant banners
say This browser preview…. Preview last_error matches. Unknown tool
and unknown room are sentences. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Write apply and recall sentences
(working tree, uncommitted): Write bar errors say The change was not
applied. Voice cancel is Could not stop voice. Rig recall is Could not
finish recalling the rig. Jo discard is The proposal was set aside.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Close quit and startup sentences
(working tree, uncommitted): Close/quit/startup errors are Could not
watch/start. Live updates are unavailable. File drop is unavailable.
DESIGN full copy-audit stays ☐. Goal stays incomplete.

2026-09-12 Write capture and export sentences
(working tree, uncommitted): Capture is armed for the last {n} seconds.
Export is incomplete. {n} stems are missing. MIDI output is {port}.
This pedal is assigned to {action}. Cost is unknown. Rig errors say
The rig reported a problem. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Help chapter and Rig program sentences
(working tree, uncommitted): Help live region is Chapter {title}.
Rig options say Program {n} is {name}. BeatCuts times say goes from.
Help language save errors are a sentence. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-12 Engine status and usage sentences
(working tree, uncommitted): EngineStatusPill tooltip and labels are
sentences. Settings usage is {provider} has {n} calls. Chart parse
errors say Line {n}. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-11 Write load line and Rig port
(working tree, uncommitted): Write says {name} is loaded in the band;
manuals EN+nb match. Rig pill is Open on {port}. Sessions progress
lines are sentences. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-11 Chord now/next sentences
(working tree, uncommitted): ReferencePlayer and Stage say This chord
is / Next is. SoloHelper aims at the next chord without a colon.
Originals Loaded in band and the manuals stay. DESIGN full copy-audit
stays ☐. Goal stays incomplete.

2026-09-11 SoloHelper and Film job copy
(working tree, uncommitted): whole-tune and guide-tone chrome are
sentences. Film shows Provider job {id}. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-11 Sessions drill and Coach copy
(working tree, uncommitted): take drills stand as sentences; Coach says
Try this. Library folder paths are sentences. DESIGN full copy-audit
stays ☐. Goal stays incomplete.

2026-09-11 Stage follow-energy sentences
(working tree, uncommitted): Stage toggle is Follows your playing or
Fixed intensity. Jo voice shortcut line is a sentence. DESIGN full
copy-audit stays ☐. Goal stays incomplete.

2026-09-11 Practice and Jo readout sentences
(working tree, uncommitted): ReferencePlayer states playing speed and
transpose as a sentence. Jo says which model last replied. DESIGN full
copy-audit stays ☐. Goal stays incomplete.

2026-09-11 Jo colon-labels to sentences
(working tree, uncommitted): conversation tool failures and Studio
assistant history are sentences with a next step. Practice library
refresh failure names Songs. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-11 Jo dispatcher acks and take analysis
(working tree, uncommitted): Jo tool results are sentences, not
colon-labels or JSON dumps. Take analysis and review point at Sessions.
The `!` copy grep covers Jo UI files. DESIGN full copy-audit stays ☐.
Goal stays incomplete.

2026-09-11 Room-tool Status and Jo copy
(working tree, uncommitted): Comparison and Blueprint Status name the
next step. Jo confirmations dropped exclamation marks. DESIGN full
copy-audit / two-metre / 60 fps / signing stay ☐.
Goal stays incomplete.

2026-09-11 Accessible names on chrome
(working tree, uncommitted): Play/Pause, Stop, engine status and
Stage transpose now have aria-label. `a11y-names` fails on unlabeled
buttons and bare fields. Discovery cue Status names Play.
DESIGN two-metre / 60 fps / signing / full copy audit stay ☐.
Goal stays incomplete.

2026-09-11 Hit-target floor and Stage live regions
(working tree, uncommitted): studio CSS floors nav, header, room
controls and toast dismiss to 32 px. Chord next is aria-live polite;
meters are aria-live off. DESIGN two-metre / 60 fps / signing stay ☐.
Goal stays incomplete.

2026-09-11 Room-tool alerts and focus rings
(working tree, uncommitted): useTool Status errors, Jo voice errors and
key-check errors now go through withNextStep. Library, Jo and Rig no
longer set outline-none, so DESIGN 2px accent focus rings apply.
DESIGN visual/signing/60 fps boxes stay ☐. Goal stays incomplete.

2026-09-11 Loud error toasts name a next step
(working tree, uncommitted): notify, recorder.error and MIDI port
errors that had no next step now get one (Settings, Rig Rescan,
Library, disk, First run). Copy that already names the next step is
unchanged. Live Music.ai / Lyria / PTT / HeadRush / Logic-open /
signing stay not configured. DESIGN 60 fps stays ☐. Goal stays
incomplete.

2026-09-11 Empty/error next-step leftovers
(working tree, uncommitted): Stage, Library, Sessions, Rig, Help and Jo
empty/error banners that already named the next step now also offer a
button (Library/Songs, First run, Audio devices, AI settings, Clear
search, Rescan). Designed Stage copy is unchanged. Live PTT stays not
configured. Live Music.ai / Lyria / HeadRush / Logic-open / signing
stay not configured. DESIGN 60 fps stays ☐. Goal stays incomplete.

2026-09-11 Sessions Progress from take files
(working tree, uncommitted): Sessions Progress shows sessions this
week, recorded minutes, highest tempo per chart, and timing/pitch
means from analyzed takes among the last 20. Empty takes stay loud.
Numbers are file activity, not a quality score. Live Music.ai / Lyria
/ PTT / HeadRush / Logic-open / signing stay not configured. DESIGN
60 fps stays ☐. Goal stays incomplete.

2026-09-11 Load minus-guitar mix from residual WAV
(working tree, uncommitted): Songs Load minus-guitar mix calls
media_reference_load useMinusGuitar after a passed residual check
and an existing minus-guitar.wav. Missing check or file stays loud
not-configured. First-run lists residual + README.txt export next
steps. Opening Logic, real-song -6 dB, live Music.ai / Lyria / PTT /
HeadRush / signing stay not configured. DESIGN 60 fps stays ☐. Goal
stays incomplete.

2026-09-11 Logic README.txt and minus-guitar mix write
(working tree, uncommitted): DAW export now writes README.txt with
Logic File > Open / keep tempo / bar 1 steps. Opening Logic stays V2.
Guitar residual with marked stems writes minus-guitar.wav and saves
minusGuitar on the song. Real-song -6 dB, live Music.ai / Lyria / PTT /
HeadRush / signing stay not configured. DESIGN 60 fps stays ☐. Idle 3%
already met. Goal stays incomplete.

2026-09-11 foreground Play still 0.0 fps; meters on Perform
(working tree, uncommitted): HWND_TOPMOST + AttachThreadInput +
SW_RESTORE + AppActivate got `SetForegroundWindow=True` and a visible
Josefines Jamstudio window. Smoke `transport_play` ran. Latest log
lines stay `canvas fps meter=0.0 playhead=0.0`. WebView rAF did not
count. DESIGN 60 fps stays ☐. Perform now shows input/master meters
(DESIGN wireframe); Levels keeps its pair, live only on the visible
view. Goal stays incomplete.

2026-09-11 Stage fps after Play is 0.0; 60 fps stays ☐
(working tree, uncommitted): SetForegroundWindow was false, so Space
did not reach the WebView. Smoke now calls `transport_play` after
opening Stage (`smoke: transport_play` in jamstudio.log). Stage waits
1.2 s of a live clock before `diagnostics_report_fps`. Latest desktop
line (`JAM_HEADLESS` unset, window Josefines Jamstudio):
`canvas fps meter=0.0 playhead=0.0`. rAF did not count (document hidden
or not focused). That is not ≥60. DESIGN 60 fps stays ☐. Goal stays
incomplete.

2026-09-11 render-ahead pause, idle 3% met
(working tree, uncommitted): When transport is Stopped and nothing needs
audio (no tone, tuner, monitor, capture, record, voice, audition, calib,
or reference play), the render-ahead worker parks 5 ms and does not fill
the output ring. The output callback still writes silence and keeps the
frame counter; cpal stays up. Desktop remasure (JAM_HEADLESS unset,
window Josefines Jamstudio, transport stopped): 2.34%, 0.97%, then 0.31%
of one core. DESIGN idle 3% is ticked. Goal stays incomplete.

2026-09-11 idle rAF and telemetry cut, 3% still failed
(working tree, uncommitted): Meter and playhead rAF now run only while
playing/counting-in and the document is visible. Idle 30 Hz IPC repeats
are skipped; the emitter sleeps 250 ms when the clock is stopped.
Desktop remasure (JAM_HEADLESS unset, window Josefines Jamstudio,
transport stopped): 3.90% then 4.68% of one core. Both ≥3%. DESIGN 3%
stays failed/☐. Goal stays incomplete.

2026-09-11 tempo and plan-path honesty
(working tree, uncommitted): M0 plan no longer names `src-tauri/src/ipc/`.
Transport stays 20–300; charts/Write/setlist stay 40–240. Live PTT
latency stays not configured (needs JAM_LIVE=1, key, hardware, ten
turns). Stage fps and smoke Stage-sample catches stay silent
(diagnostics-only). app_version and app.open-stage now notify.
Goal stays incomplete.

2026-09-11 completion audit vs current dirty tree
(working tree, uncommitted): Software completion is unproven. Table
✅ M0–M1d is merged-PR history, not this tree. Lint was dirty (Biome
format/import). Tuner-off default broke startup e2e until tests reset
`tuner_set`. `03-build-plan.md` still named LGPL oxisynth; code uses
MIT rustysynth. ARCHITECTURE/EXTENDING pointed at `src-tauri/src/ipc/`
and `src/analysis/steps.rs` (those paths do not exist). Asset
`NOT_CONFIGURED` still claimed an empty-file hash after real SHAs
landed in `assets/manifest.json`. `ipc_settings` failed because
`rig.send_clock` is now serialized and the fixtures omitted it.
After those fixes: `pnpm lint/typecheck/test/licenses` 318/318;
`scripts/cargo-test-workspace-4551.ps1` WORKSPACE_OK. rustfmt/clippy/
deny skipped (WDAC 4551). DESIGN §10 boxes 143–152 stay ☐. DoD
live/hardware/signing/two-metre/60 fps/idle-3%/PTT/Logic stay
unproven. Goal stays incomplete.

2026-09-11 two-metre Stage check attempted, box stays unchecked
(working tree, uncommitted): `pnpm tauri dev` with JAM_HEADLESS unset
opened Josefines Jamstudio. PrintWindow captured client 1440×900 and
1100×700. Chord now was A7. Ink height ~100 px at 1440 (clamp 144 px
font) and ~76 px at 1100 (clamp 110 px). SetForegroundWindow was
false. That is not a human two-metre reading on the owner display, so
DESIGN stays ☐. Tuner defaulted on and hid tempo/bar; default is now
off so those 48 px readouts show. Goal stays incomplete.

2026-09-11 bilingual help for reduced motion and empty/error
(working tree, uncommitted): `docs/guide/manual.json` documents
Settings → Diagnostics / Reduced motion and the designed empty/error
strings in EN and Bokmål. Offline Jo phrases cover count-in, tap
tempo, seek bar, transpose and tuner. Stage no longer swallows
`assets_status` failures. Two-metre, 60 fps, idle 3 % and copy-audit
stay unchecked. Goal stays incomplete.

2026-09-11 DESIGN radius, nested panels, motion, empty/error copy
(working tree, uncommitted): hardcoded 5–8 px radii and Tailwind
`rounded` / `rounded-lg` now use `--radius-s`/`-m`/`-l`. Colour
transitions were removed; only `transform`/`opacity` (and
`animate-pulse`) remain. `prefers-reduced-motion` and
`ui.reducedMotion` collapse CSS motion. Designed empty/error strings
are in the screens; the screen-recording box stays unchecked.
Two-metre, 60 fps, idle 3 % and copy-audit stay unchecked. Goal stays
incomplete.

2026-09-11 DESIGN palette, shadows and contrast (working tree,
uncommitted): token contrast is computed — `--fg-0`/`--bg-0` > 15:1,
`--fg-1`/`--bg-1` > 7:1, `--accent`/`--bg-1` > 4.5:1. UI hex/rgb and
Tailwind palette classes must match `tokens.css`. Flat drop shadows
are refused; `--shadow` stays on floating Notices/Assistant only.
Focus rings are accent 2 px / offset 2 px. Off-palette emerald, amber-400
and `--danger` fallbacks were replaced with `--ok` / `--accent` /
`--record`. Two-metre, 60 fps, idle 3 % and copy-audit stay unchecked.
Goal stays incomplete.

2026-09-11 Stage actions aligned with control-map and Jo tools
(working tree, uncommitted): `controls/default.json` binds each Stage
band action to a Jo tool (plus PTT). New tools `set_count_in`,
`tap_tempo`, `seek_bar`, `transpose_chart`, `toggle_tuner` run through
the existing dispatcher. `tests/invariants/controls.test.ts` refuses
unknown actions and requires shortcut + tool + default-map binding.
Focus steal on the smoke window failed (`SetForegroundWindow` false);
last fps line remains `meter=0.0 playhead=0.0`. DESIGN 60 fps stays
unchecked. Goal stays incomplete.

2026-09-11 desktop Stage rAF fps recorded, not 60 (working tree,
uncommitted): `Start-Process` on `target/debug/src-tauri.exe` is still
WDAC 4551. `pnpm tauri dev` with `JAM_HEADLESS` unset and
`JAM_SMOKE_SECONDS=28` ran the same exe via cargo; handshake exit 0.
`jamstudio.log` now has `canvas fps meter=0.0 playhead=0.0` after Stage
mounted. That is not ≥60. DESIGN 60 fps stays unchecked. Goal stays
incomplete.

2026-09-11 home log write proven; Stage fps blocked (working tree,
uncommitted): `append_user_log` creates `~/JosefinesJamstudio/logs` and
appends `jamstudio.log`. A desktop run (`JAM_HEADLESS` unset, smoke
handshake exit 0) wrote `Josefines Jamstudio 0.1.0 starting` into
`C:\Users\Vegar\JosefinesJamstudio\logs\jamstudio.log` (was 0 bytes
dated 2026-09-06). Unit and IPC tests append a canary line. Stage now
reports rAF fps into that file after a smoke handshake opens Stage.
A second desktop launch to capture those numbers was blocked by WDAC
Application Control on the new `src-tauri.exe`. DESIGN 60 fps stays
unchecked. Goal stays incomplete.

2026-09-11 desktop idle CPU not proven (working tree, uncommitted):
`pnpm tauri build --debug --no-bundle` produced
`target/debug/src-tauri.exe`. Started with `JAM_HEADLESS` unset and
`JAM_SMOKE_SECONDS` 30/40. Window title Josefines Jamstudio; smoke
handshake exit 0 (`engine_status` from the WebView). Process CPU of
that pid (same GetProcessTimes math as `diagnostics_idle_cpu`, one
core) was 4.61% after ~14 s and 6.20% after ~25 s, transport not
started. Both ≥3 %. `proven` stays false. DESIGN 3% stays unchecked.
Do not treat a later headless percent as a pass. Goal stays incomplete.

2026-09-11 idle CPU sample stays not proven (working tree, uncommitted):
`diagnostics_idle_cpu` samples this process (Windows GetProcessTimes /
Unix getrusage) over 1 s and always returns `proven: false`. Settings →
Sample idle CPU shows the percent when present, plus "Idle CPU is not
proven" / desktop WebView+engine fixture. Headless IPC and preview do
not tick DESIGN 3 %. Home `logs_export` names
`C:\Users\Vegar\JosefinesJamstudio\logs` when that folder exists.
DESIGN pre-flight boxes stay unchecked. Goal stays incomplete.

2026-09-11 home-dir asset unpack (working tree, uncommitted):
`JAM_LIVE=1` `assets_ensure` wrote into the real
`C:\Users\Vegar\JosefinesJamstudio\assets` (Windows `~/JosefinesJamstudio`).
Only `logs/` and `music-videos/` existed first; `assets/` was created.
`standard-rock-kit.zip` SHA-256
`afb6b9c5239d65f0630e5bab7770750db72aa146d4ea7c32a156ad0d5085cf75`
(334392 bytes) unpacks `kit.json` + WAVs.
`freepats-bass-comp.zip` SHA-256
`73cd2192f8f6422602e77c150e127c556214677a31e9c1440e28c9b96892465f`
(11286874 bytes) unpacks `bass.sf2` + `comp.sf2`.
`keys_test` stays loud not-configured (keychain). A human listen is not
proven. DESIGN boxes stay unchecked. Goal stays incomplete.

2026-09-11 pitch-shift, tempo map, render budget (working tree, uncommitted):
ARCHITECTURE §9.1 pitch-shift: 1 kHz +2 semitones measures f0 = 1122.5
±5 Hz. Tempo map: `TempoPoint.at_beats` plus piecewise
`map_beats_to_samples` / `map_samples_to_beats`; 3 changes × 10 000
random beats round-trip under 1e-9. Render budget: 10 000 × 256 frames
of funk-16 (busiest style) finished in 0.35 s vs 13.33 s (25% RT).
§9.1 software rows now have tests. DESIGN boxes stay unchecked.
Goal stays incomplete.

2026-09-11 resampler Pearson and time-stretch bin (working tree, uncommitted):
ARCHITECTURE §9.1 resampler: 1 kHz sine 48k → 44.1k → 48k has Pearson
r ≥ 0.999 after alignment and residual ≤ -80 dBFS. Downsample uses the
same even-FFT rubato setup as import; upsample is `Converter`.
Time-stretch 1 kHz × 1.25 keeps length ±1 ms and the dominant FFT bin
at 1000 ±1 Hz. DESIGN boxes stay unchecked. Goal stays incomplete.

2026-09-11 pitch sweep and chroma 24+24 (working tree, uncommitted):
ARCHITECTURE §9.1 pitch: 55–1319 Hz log sweep, +40 dB SNR, 2048-frame
window; median ≤10 cents, max ≤25, no octave errors. McLeod `tau_max` is
`sr/55 + window/8` so 55 Hz can close its NSDF lobe without E2
octave-down. Chroma: 24 major + 24 minor 3-partial stacks are 100 % root
and quality; 7ths (dom7/maj7/m7) ≥90 %. DESIGN boxes stay unchecked.
Goal stays incomplete.

2026-09-11 engine transport loop and level meter (working tree, uncommitted):
ARCHITECTURE §9.1 transport loop is now on the engine path: Headless
`NullOutput` opens, then the same `render_block` the worker uses advances
exactly 4 bars at 120 bpm / 48 kHz (384000 samples) and wraps to sample 0
±1. The Timeline unit test is not the only check. Level meter: 1 s 1 kHz
sine at -20.0 dBFS RMS is -20.00 ±0.10 dB RMS and peak within ±0.01 dB of
theory. DESIGN pre-flight boxes stay unchecked. Goal stays incomplete.

2026-09-11 later software audit (working tree, uncommitted):
Supersedes earlier same-day notes that said the sampler is synthetic-only
and that the assets-v1 SHA is the empty-file placeholder. Current evidence:
`assets/manifest.json` records `standard-rock-kit.zip`
`afb6b9c5239d65f0630e5bab7770750db72aa146d4ea7c32a156ad0d5085cf75` and
`freepats-bass-comp.zip`
`73cd2192f8f6422602e77c150e127c556214677a31e9c1440e28c9b96892465f`.
`read_manifest` strips a UTF-8 BOM. Isolated `JAM_LIVE=1` unpack into a
temp user dir loaded kit.json/WAVs and bass.sf2/comp.sf2 (`kit_source=file`,
`bass_source=sf2`). Home `~/JosefinesJamstudio/assets` is not proven. A
human listen is not proven. `band_render_offline` writes a 48 kHz 24-bit
WAV under the user dir, returns per-bus RMS that repeats within 0.05 dB,
and returns drum `onsets` that land within ±1 sample of a zero-humanize
kick grid (synthetic style; not asserted on live `timingMs` styles).
`tests/invariants/bundle-scan.test.ts` greps `src/` (and `dist/` when
present) for key-like tokens. FileInput impulse at sample 24000 and the
rendered click sit within ±1 sample after the recorder offset. Local
hop-256 click-track onsets stay within ±12 ms with no extras or misses.
A MemorySink program change at bar 5 beat 1 emits at the timeline sample
minus 50 ms lookahead, within ±1 ms. MIDI clock is 24 ppqn with start/stop/
continue; tick spacing is exact at 60, 120 and 240 bpm. Play/pause/stop
drive start/continue/stop and ticks (silent until `rig_set_clock`).
`rig_dry_run` still logs. `rig_panic` sends CC 123 and CC 121.
Meter and ChordStrip playhead draw on canvas and report rAF fps; idle CPU
under 3 % is met on the 2026-09-11 desktop fixture (2.34 %, 0.97 %, 0.31 %).
`keys_test` stays not configured. DESIGN pre-flight boxes stay unchecked.
M1b–M7 stay open on this uncommitted tree. CI on `main` is not re-proven
here.

2026-09-11 assets-v1 synthetic kit release:
GitHub Release `assets-v1` publishes `standard-rock-kit.zip` (CC0
synthetic percussion from jam-band formulas; SHA-256
`afb6b9c5239d65f0630e5bab7770750db72aa146d4ea7c32a156ad0d5085cf75`).
`assets_ensure` resumes, checksums and unpacks behind `JAM_LIVE=1`.
The sampler still plays the in-process synthetic kit. This is not an
acoustic VCSL kit and does not close M1b/M7.

2026-09-11 ARCHITECTURE aliases, session.json.review, EXTENDING recipes:
Additive commands `transport_locate`, `mixer_set_bus`, `export_logic`,
`generate_track` and `lyria_vibe` are registered beside the existing
names (`IPC_VERSION` stays 2). `takes_review` also writes
`sessions/<id>/session.json.review`. Extending fixtures now parse and
run: style golden, 12-key transpose, MemorySink PC, control-map vs Jo
tools, fixture tool run, unknown provider refuse. DESIGN em-dashes
removed from UI; 32 px button floor and reduced-motion CSS are tested.
Pre-flight visual/60 fps/signing boxes stay unchecked. assets-v1 stays
not configured. This does not close M1e–M7.

2026-09-11 assets_ensure and setup.md:
`assets_status` / `assets_ensure` read `assets/manifest.json`. The recorded
SHA-256 is the empty-file placeholder, so download stays explicitly not
configured and no zip is fetched. `JAM_ASSETS_FIXTURE=1` reports the
bundled synthetic kit only. Settings → First run and Stage name the next
step. `docs/guide/setup.md` covers cabling, first-run, the unsigned Mac
note and troubleshooting. Diagnostics show version, xruns and a log-export
path (not configured until `~/JosefinesJamstudio/logs` exists). This does
not publish assets-v1, sign installers, or close M1b/M7.

2026-09-11 M3 persist, estimated grid, guitar residual:
`analysis_start` writes unverified `providerAnalysis` from
`JAM_MUSICAI_FIXTURE=1` into `song.json` and never touches
`referenceGrid`. Without that fixture, a Music.ai key and `JAM_LIVE=1`
remain explicitly not configured in Songs. Local analysis now also
saves an `estimated-local` 4/4 grid (first beat as downbeat, chord
sections) for transport loops; ramps still require a confirmed map.
`media_guitar_residual` measures stem leak against −6 dB when a guitar
track is marked, and is not configured without those stems. This does
not claim a live SUCCEEDED Music.ai job or real-song guitar-removal
acceptance.

2026-09-11 M3 Music.ai fixtures: `musicai` is on the provider
allow-list (`https://api.music.ai`, Authorization header). Recorded
public-doc shapes in `tests/fixtures/providers/musicai/recorded.json`
parse to beats, chords, key and sections with confidence `unverified`.
`analysis_start` / `analysis_cancel` exist; without `JAM_LIVE=1` and a
recorded SUCCEEDED job they stay explicitly not configured. This does
not drive the transport grid, detect downbeats, remove guitar, or close
M3. Local Analyze tempo & chords is unchanged.

2026-09-11 M2 script, tokens and PTT gate: `tests/fixtures/jo/script.json`
holds 30 mocked-STT transcripts; `tests/jo/script.test.ts` runs them against
recorded Gemini fixtures and requires ≥27/30 expected tools.
`provider_fetch` stores provider-reported LLM tokens without logging bodies.
`voice_live_latency` measures release-to-first-audio; without `JAM_LIVE=1` it
is explicitly not configured. Ten live headset turns and a median ≤2.5 s remain
an opt-in developer check, not a CI claim. This does not close M1e owner gate 2
or M3–M7.

2026-09-11 M5–M7 offline slices: `rig_virtual_check` records expected
program-change bytes on MemorySink and refuses a missing loopMIDI/IAC
port. `takes_review` writes a recorded coaching note from analysis
numbers; live LLM review stays not configured. Export tests keep a
five-minute SMF marker within 1 ms on paper. Settings → First run and
`tests/invariants/extending.test.ts` cover onboarding and seam proofs.
Signing stays not configured. Owner gates 5, 9 and 10 remain V2. This
does not close M5–M7.

2026-09-11 M4 Lyria RealTime seams: `lyria_start` / `lyria_set` / `lyria_stop`
and `lyria_status` are registered. Rust owns the documented protocol, jitter
buffer and exclusivity with band/song. Without a Gemini key, `JAM_LIVE=1` and
a recorded provider session the command is explicitly not configured and
opens no WebSocket. `JAM_LYRIA_FIXTURE=1` walks the synthetic specimen only
and never feeds the output bus. BPM is a request, not the clock. This does
not claim a live 10-minute stream, reconnect or spend meter, and does not
close M4–M7.

2026-09-11 M1e loopback calibration: `audio_calibrate_latency` plays three clicks
on the output clock, pairs guitar input at the callback, and measures round-trip
frames with a click-template detector. A cable loopback stores the offset per
device and trims the guitar stem; silence or a tuner sine is not a loopback and
returns a 2× buffer estimate. Synthetic FileInput never applies that estimate, so
headless takes stay aligned at offset 0. Manual Guitar offset remains. Settings
and Sessions expose Measure loopback. Owner gate 2 stays V2. This does not close
M2–M7 or signing.

2026-09-06 S4 protocol probe: a standalone Rust WebSocket helper verifies setup
ordering, controls, two connections and 28,800,000 synthetic stereo frames with
zero mismatches. The old unmeasured S4 claims are replaced by
[current findings](../spikes/S4-lyria-ws.md). Google documentation conflicts on
API version/output format; an actual provider session remains unverified and
the local Gemini key is absent. No live or paid request was made. The reusable
helper is outside the application dependency graph, and both CI platforms must
run its checks. This is progress on the prerequisite, not S4 or M4 completion.
Live streaming, jitter/reconnect/spend controls and the complete V1 scope remain.

2026-09-06 M6 recorded reference timing: new confirmed-grid takes retain consumed
source positions and ramp speeds. MIDI/REAPER export follows beat intervals,
speed steps and repeated section loops while retaining original WAV timing.
Legacy takes explicitly keep constant tempo; malformed/future traces fail before
replacing exports. Native tests cover queue lead, accepted recording frames,
44.1/48/96 kHz ramps and <1 ms SMF drift over five minutes. Lua tests cover tempo
points without stretching audio. Full Windows/macOS CI remains the merge gate;
actual DAW import and physical drift are not claimed. Full band/MIDI/rig reference
synchronisation, Music.ai, realtime generation and release work remain V1 work.
Friend-operated rig checks remain V2.

2026-09-06 M6 export validation: oversized MIDI deltas, malformed meters/tempos,
misordered section markers and invalid note frames/bytes now fail before bundle
writes. Existing exports and source recordings survive validation failures;
legacy take sample rates are recovered from WAV. Synthetic native and IPC tests
cover refusal, preservation and compound-meter timing. A CI-discovered reference
readout race is also fixed: old queued positions cannot undo Stop or paused edits.
Cross-platform CI remains the merge gate. This repairs the existing constant-tempo path; recorded reference
beat/ramp trajectories, remaining providers/realtime and release work stay open.
Friend-operated rig checks remain V2.

2026-09-06 M3 practice ramps: Songs/Stage, Q, a learned Ramp pedal and Jo now
arm native speed progression over complete confirmed bars. The render worker
counts loop boundaries and applies each step to all reference tracks. Pause,
Stop, manual edits, target clamping, queued readouts and recording snapshots
have synthetic regression coverage. Ramp choices are session-only and loading
never arms one. Full Windows/macOS CI remains the merge gate. Music.ai,
automatic downbeats/sections, band/MIDI/DAW tempo-map integration, realtime
generation and release work remain V1 requirements. Friend checks stay V2.

2026-09-06 automatic local preparation (M3/M4): imported and generated audio
now runs the existing low-confidence tempo/chord/key analyzer automatically.
Versioned status survives interruption; failed/canceled estimates keep the
audio and previous results. Generated-job recovery reuses a reserved song ID,
including after the raw duplicate is removed, and never creates another paid
request. AI Music opens completed tracks for native practice without starting
playback. Audio generation/import no longer depends on the Film FFmpeg check.
Synthetic native/IPC and UI regressions cover the flow; cross-platform CI is
still the merge gate. Music.ai fixtures/orchestration, automatic downbeats and
sections, reference ramps, realtime generation and distribution remain open.
Friend-operated checks remain deferred to V2; no provider quality is claimed.

2026-09-06 M3 Jo song loading: `load_song(query)` searches fresh native library
metadata and loads an exact title/ID or unique title fragment through the
existing reference player. English `load song …` and Bokmål `last inn sangen …`
work offline; configured speech uses the same dispatcher. Ambiguous matches,
recording, busy media work and native failures are explicit. Stage opens paused
with saved stems/practice settings. Songs shares the accepted-load UI reset.
Jo command sequences stop at a failed action, preserving the previous source
instead of playing it after a failed load. Synthetic invariant tests cover the
flow; cross-platform CI remains required before merge. This is one M3 slice;
provider analysis, automatic sections, reference ramps, realtime generation,
developer hardware/voice acceptance and distribution still remain V1 work.

2026-09-05 build integration: PRs #200 (chart duration precision), #204 (count-in
destination) and #207 (native logging) are merged. PR #192 replaces estimated
render-lead delays with output-callback frame pairing and drains the queued take
tail before finalisation. Synthetic callback alignment and WAV/MIDI onset checks
cover the implementation; current-head Windows/macOS CI remains the merge gate.
This does not complete the remaining V1 capabilities or signing, and friend-led
hardware checks remain deferred to V2.

PR #210 integrates #192 while moving file preparation and finalisation outside
the render/recorder locks. Recording activates atomically with song playback;
metadata uses the song tempo and failed capture saves preserve the idea buffer.
Current-head CI remains required before merge. The remaining V1 scope is unchanged.

2026-09-05 Jo action results (issue #166): transport, band and recording refusals
reach Jo as explicit failures while retaining the normal UI notice. Success uses
the accepted command value, including clamped tempo, and unchanged document edits
are reported without claiming a change. Failing-IPC regressions cover every legacy
engine action. This advances reliable AI control; voice and other unbuilt V1
capabilities remain unfinished. Friend-led testing remains deferred to V2.

2026-09-05 Write follow-up ([PR #119](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/119), merged): the workspace names the arrangement loaded in the band and distinguishes it from the current draft, including band settings and guitar layers. Play, loop and record share the accepted-snapshot update; failed loads preserve the previous indicator. Contextual help and both exported manuals explain Save versus Play versus Space.

2026-09-05 rig persistence follow-up ([PR #117](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/117), merged): profile, section mapping, follow-section and MIDI connection changes save before replacing the active configuration. IPC regression coverage verifies corrupt-file and write failures leave the previous runtime state and settings file intact, including an existing synthetic MIDI connection. Hardware verification is not claimed.

2026-09-05: PR #77 completes the IPC/store test harness and built-app startup smoke.
See [coverage and excluded regression candidates](../reviews/2026-09-05-e2e-completion.md); this does not close physical owner gates.

2026-09-05 (bug sweep, later the same day): PRs #66 to #74 closed 24 review issues, split the bundle, and added section deletion, setlist grooves, an always-open Jo composer and chord shapes; see [the bug-sweep report](../reviews/2026-09-05-bugsweep.md). Earlier that day: ten room tools merged in #57. The storage-recovery follow-up addresses #31/#48 and records the already-authorized bilingual-help exception (#49). See [issue triage](../reviews/issues-2026-09-05.md) for all 25 reviewed reports, including the per-open help-language claim that was not reproduced. Other follow-ups and owner hardware gates remain open.


| Milestone | Content | Status | PR / release |
|---|---|---|---|
| M0 | Foundation: scaffold, crates, gates, CI, design shell, keychain settings, seam registries, tuner, metronome, spikes S1 to S3 | ✅ | #2, reworked in #28 |
| M1a | Transport, timeline, click, count-in | ✅ | #4, #28 |
| M1b | Drums: sampler, style engine, cues, render-ahead worker | ✅ | #6, #28 |
| M1c | Bass, comp, chart, six styles, chart presets, golden renders | ✅ | #8, #28 |
| M1d | Live steering and the Stage screen | ✅ | #10, #28 |
| M1e | Recorder, latency calibration, take browser | ⏳ | #12, #28 |
| M2 | Jo v1: push-to-talk, STT, LLM tools, TTS, persona (spike S5) | ⏳ | #14, #28 |
| M3 | Real songs: import, analysis, stems, stretch, chord timeline, looping | ⏳ | native stem mixing, ElevenLabs upload, live per-stem speed/key and Jo controls added; real provider/guitar-removal acceptance, provider analysis, automatic downbeats/sections and full transport-grid integration pending; confirmed section loops and canonical song-file storage added |
| M4 | AI music: Lyria RealTime, Lyria 3, ElevenLabs Music (spike S4) | ⏳ | file-generation catalog/workflows in #29; RealTime seams/protocol fixture in the working tree; live stream and owner acceptance pending |
| M5 | Rig orchestration over MIDI | ⏳ | #20, #28; virtual MIDI monitor check in the working tree; owner gate 5 remains V2 |
| M6 | Sessions: take analysis, LLM review, Logic export, progress | ⏳ | #22, #28; recorded take-review fixture and SMF 5-minute paper drift in the working tree; Logic owner gate remains V2 |
| M7 | Polish and distribution | ⏳ | #28; first-run checklist, unsigned-installer next step and fixture extensibility proofs in the working tree; signing remains not configured |

What remains, per open milestone:

- **M1e**: takes record as 24-bit WAV stems and the take browser works. Loopback calibration plays three clicks, measures round-trip frames on a cable (or returns a 2× buffer estimate), stores the offset per device and trims the guitar stem. Headless/FileInput never applies an estimate. Owner gate 2 (five hardware runs ±2 samples) remains deferred to V2.
- **M2**: typed Jo, configurable providers, offline intents and installed-agent proposals are available. Native STT/TTS and the voice bus are implemented with bounded capture, cancellation and synthetic tests. Stage presence, an explicitly enabled global hold shortcut and two-press MIDI activation now share the same conversation and voice lifecycle. Submitted STT seconds, TTS characters, configurable estimates and provider-reported LLM tokens appear in the usage log. The 30-utterance script and recorded Gemini fixtures run in CI (≥27/30). The live PTT latency gate exists and is not configured without `JAM_LIVE=1`; ten headset turns with median ≤2.5 s remain an opt-in live check. Browser speech has been removed.
- **M3**, **M4**: local media import/reference playback, music/video generation, ComfyUI workflows and Film rendering exist in #29. Local Signalsmith practice copies change speed and pitch without replacing the source. Native references now share transport/recording, seconds loops, stem mixing and live speed/key processing. Songs saves low-confidence tempo/chord/key estimates with the source hash. ElevenLabs separation submission and local ZIP import exist. Music.ai is allow-listed; recorded fixtures persist as unverified `providerAnalysis` without driving the confirmed grid. Local analysis writes an estimated 4/4 grid for section loops. Live Music.ai jobs, confirmed-grid replacement and real-song guitar-removal acceptance remain unfinished. Lyria RealTime has `lyria_start` / `lyria_set` / `lyria_stop`, a synthetic protocol/jitter machine and an explicit not-configured path; it does not open a WebSocket or play provider audio. Live 10-minute stream, reconnect and spend meter remain unfinished. Friend-operated model/GPU acceptance is deferred to V2.
- **M5**: six rig profiles, real MIDI out, section-bound scenes and a monitor are in and tested against a memory sink. `rig_virtual_check` proves expected monitor bytes on MemorySink (`JAM_MIDI_FIXTURE=1`) and is explicitly not configured without a named loopMIDI/IAC port plus `JAM_LIVE=1`. Owner gate 5 (the real HeadRush and Black Spirit) remains V2.
- **M6**: analysis reads the recorded DI (timing, dynamics, McLeod-based intonation) and export writes stems, a tempo map with the chart's markers and a sidecar. `takes_review` / `coach_tip` persist a recorded review from analysis numbers (`JAM_REVIEW_FIXTURE=1`) on both `take.extra.review` and `session.json.review`; live provider review stays not configured. A five-minute SMF marker stays within 1 ms on paper. Opening that export in Logic Pro remains V2. `export_logic` is an additive alias of `takes_export_daw`.
- **M7**: CI is green on Windows and macOS on merged `main`, not proven on this uncommitted tree. `release.yml` builds bundles on a tag. Settings → First run walks devices, loopback, keys, virtual MIDI, sample packs and the unsigned-installer next step. `docs/guide/setup.md` exists. Extending fixtures now execute the style golden, 12-key transpose, MemorySink PC, control-map, fixture-tool and unknown-provider recipes without entering bundled registries. `assets-v1` records CC0 `standard-rock-kit.zip` and `freepats-bass-comp.zip` behind `JAM_LIVE=1`. The sampler loads unpacked `kit.json` + WAVs; `Sf2Synth` loads FreePats `bass.sf2`/`comp.sf2` via MIT rustysynth (oxisynth is LGPL and is unused). Missing packs stay loud-synthetic/sine. `band_render_offline` writes WAV under the user dir, returns per-bus RMS that must repeat within 0.05 dB, and returns drum onsets within ±1 sample of a zero-humanize kick grid. Canvas meters and the ChordStrip playhead report rAF fps; idle CPU under 3 % is met on the 2026-09-11 desktop fixture (2.34 %, 0.97 %, 0.31 %). Stage chord clamp is 96–160 px and tempo/bar readouts are 48 px; the two-metre visual check stays unchecked. `keys_test` is an explicit not-configured cheapest-endpoint call. Signing and notarisation stay not configured. DESIGN.md pre-flight visual/60 fps/signing boxes stay unchecked. A tagged signed release remains open.

History: PRs #2 to #25 marked every milestone ✅ while most of M3, M4 and M6 were stubs returning fixed data. #28 replaced the stubs with working code where it could and honest refusals where it could not, and reset this board to match.

Rules for the board: ☐ becomes ⏳ when work starts, and ✅ only when the implementation and developer acceptance criteria in [03-build-plan.md](03-build-plan.md) are verified and CI is green on both operating systems. Friend-led owner checks are separately recorded as deferred to V2, never as passed. Write the PR number or release tag in the last column. Partially implemented or unverified work stays ⏳ with one line saying what remains. Historical entries below retain their original evidence; read their owner-gate wording under the V1/V2 decision above.

## Where the truth lives

- Invariants: [`AGENTS.md`](../../AGENTS.md).
- Architecture, contracts, seams: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/EXTENDING.md`](../EXTENDING.md).
- Decisions and their reasons: [`docs/adr/`](../adr/).
- Facts about hardware and providers: [`docs/hardware/`](../hardware/), [`04-research.md`](04-research.md).
- Spike findings: [`docs/spikes/`](../spikes/).
- Code (from M0): `crates/`, `src-tauri/`, `src/`, `tests/`, `styles/`, `charts/`, `rigs/`, `controls/`.
- The guitarist's data at runtime: `~/JosefinesJamstudio/` (files are truth; SQLite is a cache).
# Songwriting slice: writing and recording originals

Added on top of the real-band rebuild: Write editor, independent section parts and
groove locks, optional rolling capture, trimmed guitar layers, overdub recording,
undo/versions, favourite takes, durable song/take files and separated DAW exports.
The follow-up adds learned PC/CC/note pedals, section rehearsal loops, guitar/trim
audition, and optional song-owned rig scenes with MIDI echo suppression.
Complete exports now also include a REAPER session builder for aligned tracks,
section markers and editable band MIDI; Logic export remains available.
See [the user guide and owner acceptance session](../guide/songwriting.md).
This does not complete the broader M3/M4 provider work or the hardware/Logic gates.
Verification results belong in the associated PR; owner acceptance remains pending.

The API follow-up connects OpenAI Responses, Claude Messages and OpenRouter
alongside Gemini, with shared editable model/limit settings and a Song Lab for
reviewable chords, bridges, lyric seeds and arrangement advice. This is text-only;
At that stage cloud audio was unimplemented. Live provider/account acceptance is
pending; documented synthetic fixtures are not live API evidence.
See [the current API guide](../guide/api-options.md).

The installed-agent slice adds a persistent in-app assistant, dynamic API model
catalogs, Codex/Claude Code CLI connections and six practical studio tools. A live
Codex structured-reply check passed with this host's saved ChatGPT login. Claude
Code was unavailable locally; live Claude and Mac owner acceptance remain pending.
Studio action groups preserve versions and reject stale/invalid/locked edits.
The installed-agent slice does not implement an embedded terminal or external MCP control.

The music-video slice adds Film projects, retained media jobs, imported or recorded
soundtracks, editable section-based cuts and local FFmpeg MP4 rendering. The shared
catalog includes Lyria 3.5, Eleven Music, MiniMax Music 3, Omni, Runway Gen-4.5,
Veo 3.1, Hailuo 3, Seedance 2.5, Wan 3 and configurable ComfyUI workflows for local
Wan, ACE-Step and MiniMax Music. Agent shot edits use Undo and never generate media.
This replaces the AI Music placeholder with an actual generation workflow; live
streaming, separation and broader M3/M4 work remain incomplete. Paid model access,
GPU generation and native Mac preview/playback remain owner gates. The local
synthetic MP4 test passed with duration and AAC signal tolerances. See the
[music-video guide](../guide/music-video.md) and [ADR 0008](../adr/0008-music-video-workspace.md).


The Write redesign puts the song map and beat-aware chord grid first, with local
harmony exploration, independent section variations, phrase transforms, locked-part
energy controls and durable section lyrics. AI lyric proposals target the section
sheet after review. Capture, pedals, layers and versions remain available in focused
views. See [prior art and limits](../research/write-workspace.md). This UI/text slice
does not complete native audio, transcription or Mac owner acceptance gates.


The studio-room redesign extends #29 across Stage, Library, Jo, Songs, AI Music,
Film, Sessions, Rig and Settings. Distinct labelled icons, task views, searchable
collections, arranged-section practice loops, persistent chart/conversation drafts,
reviewed Jo song edits and take keeper workflows are implemented. Songs now uses
real local media import/player commands; it does not complete M3 stem/stretch
work. See [room guide](../guide/studio-rooms.md) and [research](../research/studio-workspaces.md).
Frontend checks, headless Rust gates and multi-size browser checks pass locally;
Windows/macOS CI and owner acceptance are tracked in #29. No milestones are marked
complete by this UI slice alone.

## Build integration

The clip-catalog follow-up (#221, awaiting renewed review and CI) reads the take
catalog once for a layered-song load, DAW export or media mix. Per-clip ID checks
and decoded-audio caching remain in place. Songs without clips skip the catalog
entirely, so a broken take folder cannot block their load. A native IPC regression
uses an unreadable catalog fixture and verifies this independence.

The fixed-rate follow-up (#184, awaiting review and CI) keeps the timeline,
instruments and recorder at 48 kHz. CPAL callbacks only move samples through
bounded rings while existing Rubato FFT workers convert at non-48 kHz input and
output edges. Actual device rates remain visible in Settings. The earlier
rate-mismatch guard still protects synthetic inputs that bypass edge conversion.

The licence-gate follow-up for #157 (awaiting review and CI) uses the existing
SPDX evaluator so grouped AND/OR expressions retain their meaning. Malformed
tables, package groups and records fail closed; records require a name and the
non-empty `versions` array emitted by pinned pnpm 11. Existing allowlist entries,
package-specific exceptions and the minimum inventory size are unchanged.
The command-level regressions in `tests/invariants/js-licences.test.mjs` run with
controlled pnpm output, including failed commands and malformed JSON. The real
installed inventory is also checked; no generated licence report is trusted
solely because it contains fifty records.

The follow-up to merged PR #205 (awaiting current-head review and CI)
routes Settings/Film links through the native browser opener and reports launch
failures with a copyable URL. The shared macOS browser/player path checks opener
completion; Windows confirms only the Explorer handoff. A rejected IPC regression
failed before the notice fix. English/Bokmål troubleshooting explains recovery.

The current build is stabilised separately from the unbuilt roadmap above. See
[build closeout](../reviews/build-closeout.md) for native IPC, persistence, meter
export and installer validation. Owner hardware/provider gates remain open;
no milestone is marked complete by a headless or browser-only check.

## Documentation and original-song finishing

The 2026-09-05 pass adds searchable English/Bokmål help, generated manuals for all rooms, save/recovery/trainer fixes, and Write → Finish (structural review, transition variants and compatible section comps). [Verification and remaining owner gates](../reviews/studio-verification-2026-09-05.md) and [research decisions](../research/song-finishing.md) describe the scope. This pass does not complete the unbuilt voice, stem/stretch, realtime generation or hardware acceptance milestones.

## One capability per studio room

The next 2026-09-05 pass adds melody-to-harmony sketches, rehearsal setlists, harmonic discovery, three-perspective coaching, reference forms, arrangement briefs, beat-grid cuts, blind take comparisons, song tone snapshots and audio setup profiles. English/Bokmål help covers all ten; [validation, the live-test incident and remaining owner gates](../reviews/room-capabilities-2026-09-05.md) distinguish browser, native headless, live CLI and physical-hardware evidence. The existing roadmap and signing/owner gates remain open.

### 2026-09-05 take-analysis evidence (PR #125, merged)

Sessions now presents measured grid distance, early/late bias, spread, attack-level
variation and pitch coverage. Missing evidence is explicit. Local exercises do not
rate musical quality; Analysis help opens the English/Bokmål explanation beside
the take. Existing cached scores can be reanalysed. The IPC adds raw measurements
without removing legacy fields. This advances M6 but does not complete durable
analysis, bend-aware precision, chord agreement or structured provider reviews.

The persistence follow-up (PR #126, merged) saves versioned measurements and source details into
the take manifest before reporting success. Sessions restores them when reopened,
including with an empty index, and offers Analyze again for damaged or unsupported
evidence. Metadata writes stay inside the validated take directory and refuse
pre-existing temporary files. This completes analysis persistence; structured
provider reviews and the remaining M6 measurement targets are still unfinished.

The pitch-precision follow-up replaces the shared detector per
[ADR 0011](../adr/0011-pitch-measurement-precision.md). Stationary synthetic
signals now meet ±3 cents across 648 detector cases and 15 take-analysis cases.
Saved analysis advances to analyzer version 2; older evidence offers Analyze again.
This applies to the tuner, melody extraction and take analysis. It does not
complete bend exclusion, noisy-sweep acceptance, chord agreement or structured
provider feedback. Friend-led testing remains deferred to V2.

### Count-in meter changes (PR #167)

A different meter restarts an active count-in so its clicks match the new chart.
An unchanged or invalid meter preserves progress. The regression advances beyond
the shortened boundary that caused the original underflow, then verifies four
restarted clicks, exact playback spans and one completion event. This developer
verification is separate from the friend-led checks deferred to V2.

The destination follow-up (PR #204, awaiting review and CI) preserves the selected
bar when the count-in completes. At the song beginning an armed loop supplies the
entry bar. Preview playback reads the existing song position instead of caching
the count-in display bar, so repeated Play, late seeks and newly armed loops do
not lose the destination. Native tests verify the surplus render span and one
downbeat at the correct offset. English/Bokmål Stage help documents this behavior.

### Recording interruption feedback (issue #137)

Rejected disk-queue blocks no longer advance the accepted-frame count or collect
MIDI. The native control thread reports a capture failure while preserving the
pending take for finalisation. Transport, Sessions and Write offer Save partial
take and stop presenting capture as live. The close/device guards stay active
until finalisation. Native backpressure and frontend failure/recovery regressions
cover this path; alignment and start/stop disk-lock work remain separate.

### Chart duration precision (PR #200, awaiting review and CI)

The shared text formatter preserves numeric beat durations instead of rounding
each chord to two decimals. Mixed thirds and dense bars survive repeated
format/parse cycles without losing a bar or accumulating drift. Short scientific
notation emitted for tiny durations is readable by the parser. Explicit bar
totals retain the existing 1e-6 tolerance. English/Bokmål chart help explains
mixed counted/shared beats. This does not complete the separate tempo-range or
schema-validation work.

### Credential recovery (PR #194, merged)

Keychain read failures remain distinct from missing keys through provider status,
Jo and media preflight. Settings shows unavailable access and offers Check key
status after unlocking the OS keychain; successful retry restores availability.
Failed removal is reported, and a failed Jo provider request cannot run offline
commands. English/Bokmål help explains recovery. Developer checks cover failed
stores, production error mapping, provider/preflight results and browser controls;
no live keychain or paid-provider verification is claimed. Friend checks remain V2.

## Native reference stems — 2026-09-06 implementation evidence

Songs can import a local stem ZIP or submit a confirmed ElevenLabs separation
request, preserve the paid ZIP for recovery, and load the resulting tracks in the
native player. Songs and Stage share persistent per-track gain/mute and explicit
guitar selection with minus/restore guitar. Original stereo playback remains
available. The output and recording queue stay shared; recordings contain the
stereo backing mix and its stem settings in the take snapshot.

Local verification: 315 Rust tests passed (five opt-in tests ignored in the
standard run); the additional FFmpeg WAV/MP3 stem import/reload/recovery test
passed explicitly. Frontend: 262 tests, lint/types/build, JavaScript licences,
Rust formatting/Clippy and cargo-deny passed. Static component QA checked Songs
and Stage at 930 px without horizontal overflow. The native desktop build and
25-second frontend-handshake smoke passed locally. Windows/macOS CI remains
required before merging this slice.

No paid provider call was made and no real response fixture was recorded. This
is not M3 acceptance: real-song guitar removal, Music.ai, stem-aware stretching,
provider analysis and analysed-grid controls remain unfinished. The rest of V1,
including realtime Lyria, retains its original scope. Friend-led physical rig
checks remain deferred to V2, not passed.

## Live reference practice — 2026-09-06 implementation evidence

Songs and Stage can apply and save 50–150% speed and ±12 whole semitones to
native stereo references or each loaded stem. The original files, stem mix and
guitar DI are preserved. The source-second loop/cursor and consumed-output chord
readout follow processing; recording includes the processed backing and actual
settings. Jo uses the same guarded partial-update IPC, with explicit English
and Bokmål offline commands. Recording blocks settings changes.

Local checks: 319 Rust tests passed, six opt-in tests ignored; 265 frontend tests
passed. FFmpeg WAV/MP3 import and practice-setting reload passed separately.
An eight-stem synthetic CPU probe produced eight seconds in 1.230 seconds,
with a 10.582 ms worst block. Pitch is checked within five cents at
44.1/48/96 kHz; source position within one source frame. Native half-speed/+2
recording checks pitch, stereo correlation, RMS and silent blocks. Original
stereo's two-LSB assertion stays intact. Initial recording/import test failures
came from applying raw-path assertions to processed audio; the raw and processed
checks now explicitly exercise their respective paths without relaxing the raw
tolerance. Lint/types/build, formatting, Clippy and licence gates passed.
Static Songs/Stage component QA at 930 px found no horizontal overflow.
The native debug desktop build and 25-second frontend-handshake smoke passed
locally. Windows/macOS CI on the PR head is required before merging.

This advances M3, without claiming a physical-device dropout or subjective
quality gate. No paid call or recorded provider fixture was obtained. Analysed
sections/grids, real-song separation acceptance, Music.ai, Jo tempo ramps and
realtime Lyria remain unfinished V1 work. Friend rig checks remain V2.

## Confirmed reference sections — 2026-09-06 implementation evidence

Songs can save explicit user confirmation of the first downbeat, estimated beats
per bar and named sections. Native playback consumes that map for bar/beat/section
readout and downbeat-to-downbeat section loops in Songs and Stage. Jo can select
a unique confirmed section by name. Source hashes and displayed beat arrays guard
against stale edits; unknown metadata survives, and the full map goes into take
snapshots. No provider downbeat or section detection is inferred by this feature.

Local checks: 323 Rust tests passed (six opt-in tests ignored), 267 frontend tests
passed; the FFmpeg WAV/MP3 import/reload test passed separately with grid reload
and stale-hash recovery. The OutputTap regression varies render lead and callback
sizes at 44.1/48/96 kHz and 50/75/150% speed, verifies consumed source position
within one 48 kHz frame and loop wraps within one output step plus one source
frame. IPC checks source/section IDs, capture guards and the recorded grid.
Initial fixture-path and manual-vocabulary test errors were corrected without
weakening their guards. Lint/types/build, Clippy, formatting and licence gates
passed. Static Songs/Stage QA at 930 px found no horizontal overflow.
The native desktop build and 25-second frontend-handshake smoke passed locally;
Windows/macOS CI on the PR head is required before merge.

This is the confirmed-grid transport slice, not completion of M3. Automatic
Music.ai/provider analysis still needs verified response fixtures and real-song
acceptance; the public-schema ambiguity is recorded in 04-research.md. Canonical
song-file migration, full band/MIDI/DAW tempo-map integration, practice ramps,
realtime Lyria and the rest of V1 remain unfinished. Friend rig checks remain V2.

### M3 canonical song-file storage — 2026-09-06

New imported/generated audio, clean take mixes and practice copies now publish
`songs/<id>/source.wav` and `song.json`. Existing Songs entries can be consolidated
with their verified stems, retaining IDs, unknown metadata and legacy files.
Analysis, confirmed maps, stem mixes and practice settings share that canonical
file; relative paths permit moving the whole song folder. Film resolves the same
asset ID. Corrupt/future canonical files report warnings instead of silently
falling back. The import still uses installed FFmpeg. Native symphonia decoding,
file dialogs/drop, the richer provider `analysis[]`/`tempoMap`/chart contract,
Music.ai orchestration, automatic analysis acceptance, full grid integration,
practice ramps and Lyria realtime remain V1 work. This is not M3/V1 completion.

Local validation: 324 Rust tests passed (seven opt-in tests ignored), 267 frontend tests passed. Real FFmpeg migration, practice/analysis, stems and Film timing checks passed separately. Formatting, Clippy, lint/types/build and licence gates passed; the native desktop build completed its 25-second frontend-handshake smoke. CI on Windows/macOS remains the merge gate.

### M3 native import and file selection — 2026-09-06

Songs can choose a file through the native dialog, receive one dropped file or
import a pasted path. Bundled Symphonia/Rubato decode and normalize the planned
WAV/MP3/FLAC/M4A/AIFF formats plus Ogg Vorbis; reference, analysis, stem and
practice paths share that decoder. M4A priming/padding are applied before rate
conversion. Originals remain intact beside canonical source.wav and song.json.
Complex M4A edit sequences, protected files and raw ADTS AAC need prior WAV/FLAC
conversion. Film and clean-take soundtrack mixing still need installed FFmpeg.

The ordinary synthetic tests cover rate/delay/alias bounds, cancellation, damaged
metadata and IPC import/storage/reload. The separately run seven-codec fixture
test checks duration and phase. Local validation: 267 frontend tests passed; 234 Rust tests passed before
Windows Application Control blocked ipc_originals (eight opt-in tests ignored).
All 24 media/rig IPC tests, including import/storage/reload, passed separately,
as did the seven-codec test. Lint/types, Clippy and licence gates passed. The
local desktop build completed its 25-second frontend-handshake smoke. No policy
was bypassed; full Windows/macOS CI on the PR head remains the merge gate.

All five optional real-tool media regressions also passed: migration, stems,
practice/analysis, clean take mixing and Film. Film checks each exported stereo
channel at the original amplitude (AAC RMSE 0.000116 against the unchanged 0.015
bound); the test avoids FFmpeg's gain-adding stereo-to-mono rematrix.
An additional short M4A fixture passes at 10,849 frames with a millisecond
movie clock; native metadata tests cover rounded EOF and reject larger overruns.

This completes an import slice, not all of M3 or V1. Provider analysis fixtures,
the richer analysis/tempoMap/chart contract, full band/MIDI/DAW grid integration,
practice ramps, realtime Lyria, voice/rig acceptance and distribution remain.
Friend-operated hardware acceptance remains deferred to V2.
