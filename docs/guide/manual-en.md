# Josefines Jamstudio — user manual

## Start here

### What Jamstudio does

Jamstudio helps you turn guitar ideas into original songs: write chords and lyrics, arrange a local rhythm section, capture guitar, compare versions, assemble takes and export to a DAW. Film adds a storyboard and local video export. It is a companion to your hardware and DAW, with an existing synthetic drum/bass/comp band.

### Desktop app or browser preview?

Use the desktop app for audio, disk files, MIDI, keys, agents and media generation. The browser banner means editing is simulated: there is no sound, no real file save and no provider access. Reloading a preview clears its session. A moving preview playhead is not proof of a connected interface.

### Your first complete session

1. Open Settings → Audio devices. Choose the same interface for input and output, then the intended guitar channel. Check the meters with your guitar.

2. Open Write → Create a song. Give it a name, edit the verse and chorus, and press Save song. Press Play song to load this draft into the band.

3. Use Record & layers to capture a riff or Record to start an overdub from bar 1. Finish with Save take.

4. Open Finish to review the arrangement and compare section performances. Keep a version before experiments and save the result.

5. In Sessions, export a keeper for Logic / REAPER. Finish mixing there; import that mix in Songs if you want a video.

### Language and navigation

The sidebar names each room and its purpose. Help & guides opens this searchable manual without discarding the room you were using. Choose English or Norsk bokmål. The main editing controls keep their English names, so this Norwegian guide quotes those labels. Escape returns from help. Keyboard transport shortcuts are suspended while you read help. Your language choice is saved with the app settings and used the next time help opens, also after a restart.

## Write: chords and arrangement

### Song map and linked sections

The Song map is the played order, with bar ranges, repeats and band intensity. Select a section to edit it. A repeated section shares chords, lyrics and band settings wherever it appears. Make variation creates an independent section. Add section copies the selected chords with default band settings. Edit order and repeats moves, removes or repeats form entries; it does not delete the underlying section.

### Edit chords and harmony

Click a chord cell. The bar field accepts Am:3 G:1 for three beats of Am and one of G, or Dm G for an even split. Enter or leaving the field applies; Escape cancels. Invalid text leaves the previous bar unchanged. Add bar copies the selected bar; Remove bar keeps at least one. Transform phrase rotates, reverses or repeats the bars. Undo restores the previous state.

Find the next colour offers in-key chords, borrowed parallel-key chords and secondary dominants. Shared counts mean common pitch classes with the preceding chord; they are not ratings of musical quality or guarantees of a particular guitar fingering. The inspector also shows one playable shape for the selected chord; the numbered buttons cycle the alternatives.

### Band parts, locks and energy

Expand Band, groove and section settings. Drums, Bass and Comp each have a groove, intensity, gain, mute and lock. Intensity chooses among the style patterns; it is not a loudness meter. Section energy moves unlocked intensities together. Try a groove preserves locked parts. Direct edits to a part are still deliberate and allowed. Swing is shared by that section.

Changing Key transposes band chords; Mode changes the harmony palette. Recorded guitar stays at its original pitch and speed. Play song reloads your draft; ordinary edits do not silently rewrite the performance already playing.

### Limits and timing

Write supports 4/4, 40–240 BPM, up to 256 arranged bars, 64 sections, 128 form entries, 16 guitar layers, 20 named versions and 50 Undo entries. Guitar layers remain at absolute bar numbers after a form edit. Check their placement whenever you move sections, change tempo or change chords.

### Melody → harmony

Open Melody → harmony at the top of Write. Choose an isolated humming or single-note guitar recording, a start offset and 0.1–60 seconds, then Extract notes in the desktop app. Source files must be no longer than two minutes and no larger than 64 MB. Correct the editable note list: one line per note, for example A4 0 0.5 (pitch, start seconds relative to the selected excerpt, duration seconds). Manual entry also works in the browser. Select a 1–32 bar section in a 4/4 original at 40–240 BPM and Preview chord choices. Candidates are ordered by duration spent on chord tones; this is a theory aid, not a quality score. Silent bars keep the first existing chord. Keep as a section variation creates an idea outside the form, preserving the current arrangement and guitar timeline. In Compose, add the variation to the form to audition it. Undo and a named version preserve the old song; Save writes it to disk. The extractor sketches sustained monophonic notes; chords, effects and repeated attacks on the same pitch can confuse it.

## Lyrics and Song Lab

### Write words against the music

Choose Lyrics and a section in the Song map. Words for this section stores up to 12,000 UTF-16 characters with the section; the adjacent Phrase reference shows its chords. The Song notebook holds shared ideas, images and performance notes. Repeated sections share words; Make variation separates them. Save song persists both, and Undo/Versions include them.

### Ask for a useful proposal

Song Lab appears below Compose and Lyrics. Choose Alternative chords, A contrasting bridge, A lyric seed or Arrangement feedback. Explain the musical constraint: for example, “Keep room for a vocal; make the last chorus feel more open.” Generate an idea uses the selected AI connection. Edit its proposed text/chords before applying. Lyrics append to the selected section; advice stays in the notebook. A bridge adds a section at the end of the form, which you can move.

### What the AI knows

Song Lab receives the chart, section settings, lyrics/notes and selected context, not recorded audio. It cannot judge your guitar tone or whether a take sounds good. Applying validates the reply and keeps a previous version; save afterward. If the song changes during a request, the old proposal is rejected. Invalid, truncated or failed replies leave the song unchanged.

## Capture, record and layer guitar

### Retrospective capture

In Record & layers choose 15, 30 or 60 seconds, then Arm capture before playing. Keep that, H, or a learned pedal saves the recent buffer as a take. Capture is local. It is not automatic transcription, and it cannot recover audio played before arming. Turning capture off clears the unsaved buffer only. Saved ideas remain in takes.

### Trim and place a layer

Add a take as a guitar layer. Set trim start/end in seconds, first bar, repeats, gain and mute. Listen to trim auditions it once through the native engine; Stop ends audition. Fit tempo to riff uses the selected bar count and trimmed duration to change the band tempo. It does not stretch, retune or quantize your performance. Native clips use short edge fades to reduce clicks.

### Record an overdub

Record in Write saves and loads the song, starts at bar 1 without a count-in, and records the chosen guitar input while the band and earlier layers play. Save take finishes it. Timing and song edits are blocked during recording. Existing layers are not destructively merged into the new guitar input. The take retains a song snapshot.

Only the selected input channel is recorded, not simultaneous dry and processed HeadRush channels. Monitor your guitar through hardware. Check input level, channel and manual Guitar offset before a serious take; a software test cannot calibrate your physical setup.

## Finish: stronger originals

### Review what needs attention

Open Write → Finish. The finishing review checks the working title, unused sections, matching neighbouring band settings, missing source takes, invalid trims and guitar layers extending beyond the form. Enable Include lyric reminders for a vocal song. Instrumental sections are valid; reminders are suggestions, never a quality score.

The review reads song data and take metadata. It does not listen to the music or prove that an audio file still exists on disk. Refresh Sessions after restoring files and listen before making creative decisions.

### Shape a transition

Select a section appearance by its bar range. Choose 1–4 bars of context and press Loop bars to hear the lead-in and arrival. Near the start or end of the song the loop is shortened to fit. Desktop audio is required. Stop ends playback.

Preview a lift increases the intensity of audible, unlocked drums, bass and comp. Preview more space lowers drums and comp intensity, leaving the bass steady. Strength adjusts the change from 5 to 50 percentage points. Locked or muted parts stay unchanged. No new idea is proposed when the settings would remain identical.

Review the current/proposed table, then Keep variation or Discard preview. Keep variation creates a separate section for that form entry, preserving its repeat count, duration, chords, lyrics, rig scene and guitar positions. Other appearances still use the original section. If the song changed since preview, preview again. Loop the transition after applying to hear the difference; Undo returns to the previous form.

### Assemble a section comp

Record multiple performances of the same original using Record & layers. Each take must start at bar 1 and reach the end of the section you want. In Finish, choose the section appearance, select a compatible Performance, Listen to selection, then Use performance. Repeat for the other sections to assemble a preferred performance.

Compatibility requires a recording snapshot from this original with the same tempo, key, meter and resolved chord timeline. Changes to band intensity, section names or guitar layers do not invalidate timing. Captured recent ideas, unrelated songs, shorter recordings and old snapshots without enough information are excluded with an explanation. Audio is not stretched, transposed or generated.

The comp is a regular guitar layer whose trim covers those exact bars of the source take. Using another take for the same bar range replaces that comp only; other layers remain audible and can overlap. Inspect Record & layers if you hear doubled guitar. There are at most 16 layers. Changing the arrangement later does not move clips automatically; inspect the form and trims again. Record the assembled song to create a take for Sessions and DAW export.

### Keep experiments reversible

Each kept variation or guitar comp first adds a named version of the previous song. The change also enters Undo. If all 20 version slots are occupied, remove an unused version before applying another experiment. Save the song to persist both the result and the preserved version. Versions contain song data, not duplicate audio files; keep the source takes.

## Save, Undo and versions

### Three different safety nets

Undo/Redo cover recent body edits in memory. Named Versions are checkpoints saved inside the song, including chords, settings, lyrics and layer references. Save song writes the current document and its versions to disk. Keeping a version without saving does not make it durable. Restoring a version is itself undoable. Remove an unused version when the 20-version limit is reached. A slider drag or a run of typing in one field counts as one Undo step, so real edits are not pushed out of the 50-step history.

### Conflicts and concurrent edits

A disk revision prevents one window from silently overwriting another. If the file changed elsewhere or moved, use Save copy to preserve your draft, then reopen deliberately. A save finishing after a newer edit keeps that newer edit marked unsaved. Film Undo keeps the current disk revision, so undoing a content edit does not create a false save conflict.

### Closing and backups

Save before closing. The native app blocks close during a recording/operation and asks about unsaved song, chart or film drafts. Keep editing lets you save; Discard and close abandons unsaved edits. Browser reload protection depends on the browser. Prior files are retained as backups during saves, but a backup is not a complete version history. Copy the whole user folder to another location for a real backup.

## Stage: play and practise

### Perform

The top transport plays, pauses, stops, records, sets count-in and toggles loops. Stage shows the current/next chord and live position. Chart & band settings selects a chart and matching style, changes intensity and band/click volume, and enables tuner or a reference tone. Cues request Fill, Crash, Stop or Ending. Some changes are queued for the next bar and shown as pending. Part mutes affect drums, bass or comp; follow-energy follows measured guitar level, not musical intent. Shapes shows a playable fingering for the chord now and, smaller, the chord next, root in amber; the numbered buttons pick another shape. These are theory suggestions in standard tuning, not a transcription of what was played.

### Practice and tempo trainer

Practice lists passages from the loaded chart. Select one to loop its arranged range, including repeats. Exit loop returns to the full form. In Tempo Trainer choose Start, Target, Step and Every, then enable it and press Play from stopped. It adjusts after the chosen number of performed bars, including short loop wraps; it does not retime an active recording. It is controlled from UI telemetry, not a sample-accurate tempo automation lane.

### Meters, tuner and meter convention

Levels shows the input/band signal and engine state. No audio or a headless status means the editor is available but real sound is not established. The tuner estimates pitch from the selected input; verify a clean stable note rather than a chord. Turn the reference tone off before recording.

The engine counts denominator beats: 6/8 at 60 BPM is six seconds per bar. A style and chart must share a meter. Write remains 4/4; other supported meters belong to chart/Stage workflows. MIDI and REAPER export convert this convention to quarter-note BPM.

### Rehearsal setlist

Open Rehearsal setlist at the top of Stage. Choose a Library chart, its tempo (40–240 BPM) and count-in (0–4 bars), then Add to setlist. Up to 32 entries save immediately in settings. Edit loads an entry into the controls; Update entry saves its new chart, tempo and count-in. Cue it again to apply the new setup. Move up and Remove change the order. Cue prepares an entry: it stops transport, loads the chart, applies its tempo/count-in, disables looping and the tempo trainer, then seeks bar one. It does not start playback. Press Play when ready, or Cue next to prepare the following entry. Missing charts must be restored in Library or removed from the list. Recording blocks cue changes. Browser preview retains entries only until reload and has no audio.

## Library: charts and grooves

### Find, edit and play

Search by title, key or tempo and filter bundled versus your own charts. Opening a chart fills the editor; unsaved drafts must be saved or discarded before opening another. New chart starts a template. Play this loads the edited chart for the band. Save stores a user chart. Deleting a user override reveals the bundled version; it does not delete the bundled asset.

### Chart syntax

A title starts with #. Metadata lines use key: A minor, bpm: 100, time: 4/4 and optionally style: rock-straight. A section heading such as [Verse x2] repeats that section. Bar lines look like | Am | F | C G | Am:3 G:1 |. The % symbol repeats the previous bar. Each bar must contain the meter’s beat count. Problems identify invalid content; fix them before save/play. Ctrl/Cmd+Enter plays the editor and Ctrl/Cmd+S saves it.

### Stored content

User charts, styles and rig profiles live in separate folders under the user directory and are loaded through registries. A matching user ID can override bundled content. Chart saves use a temporary file and a previous .json.bak backup. Invalid user charts are reported and skipped; valid bundled charts remain available. Charts are bounded to 4096 arranged bars; the Write limit is smaller. See the developer chapter before hand-editing data files.

### Harmonic discovery

Choose the current original or a Library chart in Harmonic discovery. Results share consecutive root movements and chord qualities in the same meter, even in another key. The list states the actual shared movements; these are not similarity percentages or claims that two songs sound the same. Study in Stage cues a matching chart without starting it. No cloud request or audio analysis is involved. Add more charts if there are no matches.

## Jo AI and installed agents

### Commands and reviewed edits

Jo AI accepts typed band commands. Suggestion buttons fill the input; Send executes supported direct transport/band commands. Song changes are presented for review. The top Assistant panel stays mounted as you navigate and can propose grouped song edits, take analysis or shot edits. Review the values before Apply; stale or invalid proposals are refused. Conversations survive room changes during the session, not app restarts. Native speech input/output is not built.

### Connect a text API

In Settings → AI & models choose Gemini, OpenAI, Claude API or OpenRouter. Store the correct API key, choose a compatible model ID, and Save AI settings. Load provider models fetches a catalog; listed models are not all guaranteed compatible. Test model sends a small billable request only when pressed. Jo and Song Lab share this choice. A failed request does not silently switch to another paid provider. Supported simple English intents can still work locally.

### Use Codex or Claude Code inside the app

Install a native Codex or Claude Code CLI and sign in through its supported login once. Select the installed CLI in Settings; use Detect installed agent or provide its full executable path. Detection checks the version, not login. Leave Model ID at default or enter one supported by that CLI. Save, then explicitly Test agent or send a request from Assistant. The app runs bounded non-interactive requests and reviews returned studio actions; it is not an embedded terminal or arbitrary remote-control server.

The CLI keeps its own credentials. Codex can use a ChatGPT login or API-key login, with different billing. Claude access depends on its current plan/authentication rules. A chat subscription does not become a general music/video API key. Check the active CLI account and provider limits. Cancel ends a local agent request; canceling an API answer does not refund work already submitted.

### Privacy and useful prompts

Text assistants receive song text/structure, settings, rig name and cached take metrics as needed, not raw take audio or keys. Try “Add a quiet eight-bar bridge”, “Leave locked bass alone and thin out verse drums”, or “Append three concrete chorus images to this section’s lyrics”. Local take metrics are heuristics, not an AI listening judgment. Only media-generation commands send their explicitly selected generation inputs.

### Three perspectives

Enter a specific goal and Ask three perspectives. One request goes to the selected Jo provider or installed agent and returns composition, arrangement and performance experiments. Your chart, form, lyrics, notes and band settings are sent, never guitar clips, tone snapshots or blueprints; no audio is sent or heard. A request above 48,000 characters is refused before anything is sent. Cancel stops waiting: an installed agent is stopped, while an API answer already submitted is discarded but not refunded. The window can close while a request is waiting. API billing or subscription usage limits can apply. Draft in Jo places one experiment in the conversation input for your review; it never sends automatically and will not overwrite an existing draft. Keep in song notes appends one suggestion with version and Undo protection. Ask again after the song changes. Missing configuration and malformed replies show an error; there is no paid fallback call.

## Songs: mixes and references

### Import and listen

Songs is the audio-asset library, separate from Write song documents and Sessions takes. Paste a full local path, then Import audio. FFmpeg and ffprobe must be available. Supported imports include WAV, MP3, FLAC, M4A, AAC and OGG; files are copied into the local library, with a 512 MB / ten-minute limit. Search the library, select an asset, then Listen in media player. Playback opens the system player at original pitch and speed.

### Use a mix in a film

Use in Film sets the selected asset as the current film soundtrack. Save video to keep that choice. Generated audio appears in the same library after its job completes. Generated lyrics/structure are shown when returned by the provider. Automatic stem separation, chord recognition and time-stretch are not available in Songs.

### Reference blueprint

Name a reference or select an imported audio asset, then choose a source section from your original. Map the reference by ear with one line per section: Name | bars | energy 0–100. Preview new form shows the result before applying it. The tool repeats or trims your own chord phrase to the requested section lengths and adjusts unlocked, unmuted parts. It keeps old sections and their lyrics as ideas; it does not copy reference audio, transcribe chords or move lyrics automatically. Limits are 16 blueprint entries and 256 arranged bars, within the original’s existing section ceiling. Guitar layers block a timeline replacement: work from a version without layers. Apply preserves a version and Undo; Save in Write persists the form and reference provenance.

## AI Music and local models

### Generate deliberately

Choose Create music, a catalog entry and an editable model ID. Describe the arrangement, instrumentation, mood and any lyric direction. Prompt starters only change the text. Choose requested duration and instrumental mode where supported. Generate explicitly submits a request and may spend API credits. Model capabilities and account eligibility vary; an editable ID must still use the adapter’s protocol. The catalog is configuration, not a quality ranking.

### Connections and job receipts

The current catalog includes Google music/video, ElevenLabs music, MiniMax music, Runway-hosted video and local ComfyUI audio/video options, including Chinese model families. Select the connection named by the entry; the model brand alone does not identify which API key it needs. Verify current access before depending on a model for a project.

Library & jobs keeps generation receipts. Refresh job polls an existing task and never resubmits it. An unknown result after interruption means check the provider history before generating again. A provider may already have charged the request. Refresh the asset library when a result is ready.

### ComfyUI setup

Install the runtime, trusted custom nodes and licensed weights separately. Start ComfyUI on 127.0.0.1:8188. First run a working workflow there, then export API-format JSON. In Local model setup paste it and name the prompt node/input plus the saved audio/video output node. Jamstudio changes only the chosen prompt string. Checkpoint, seed, lyrics, duration and resolution stay in the workflow. A local model label does not install or switch weights.

GPU/runtime requirements vary and some checkpoints require CUDA rather than a Mac GPU. A local endpoint does not guarantee every custom node stays offline. No weights, FFmpeg, ComfyUI or DAW are bundled. Lyria RealTime streaming and general audio transcription/separation remain unbuilt.

### Arrangement brief

Choose Faithful, Stripped or Reimagined as an editable starting direction. Build arrangement brief compiles the current original’s key, tempo, meter, form, chords and band intensity locally. Instrumental omits lyrics; turn it off to include your section lyrics. Review and edit the prompt, then Use prompt in AI Music. This replaces only the project’s generation prompt and instrumental setting, preserving its model and duration. The prompt is a musical request, not guaranteed bar-accurate output. It must stay within 4,000 characters; model-specific limits still apply when generating. No paid request runs until you separately choose Generate in the existing controls. Media Undo restores the previous prompt; Save project keeps it.

## Film: soundtrack to music video

### Choose a clean soundtrack

Soundtrack selects imported/generated audio or Use take from a saved studio take. Use take builds a clean starting mix from band, guitar DI and unmuted guitar layers, excluding the monitor/master that can contain click and test tone. Inputs are averaged for headroom; this is not a mastered release. For a final film, import the finished DAW mix through Songs.

### Storyboard and footage

Set the title, creative direction and 16:9 landscape or 9:16 portrait. Build cuts from song sections uses the take’s saved chart, or the open Write song, then fits four-bar shots to the soundtrack length. Add/edit shots manually when needed. Each shot has a title, prompt, timeline duration, model, requested generation duration, footage and clip start. Short footage loops; long footage trims.

Let the selected brain direct returns editable shot descriptions from text/timing only. Review before applying. Generate this shot is a separate paid action. Imported footage or completed jobs can be assigned with Use for this shot. Reusing footage does not trigger another generation.

### Save and render

Save video persists project settings and local-model configuration. Render & jobs shows missing footage, missing soundtrack and length mismatch. Fit all cuts to song length scales durations proportionally. Render music video requires all clips and a matching timeline. Output is 720p, 30 fps, cropped to fill the chosen frame, with 48 kHz AAC soundtrack; generated clip audio is discarded. The original audio files remain separate.

The in-app preview is silent. Play film with sound opens the native player. Cancel stops local rendering; it cannot recall a submitted cloud generation. Completed exports and project snapshots remain under music-videos/exports. Limits are 120 shots, 0.1–120 seconds per shot and ten minutes total. Undo restores edits while preserving the disk revision.

### Beat-grid cuts

Enter the soundtrack BPM, cut spacing in beats and the first beat’s offset (0–10 seconds). Preview aligned cuts rounds internal cut positions to that grid. The last cut stays at the original end, so soundtrack duration and source trim starts remain unchanged. A grid that collapses a shot or exceeds the 0.1–120 second per-shot range is rejected: choose a finer grid or adjust short shots. Apply uses existing media Undo and Save. This uses your supplied tempo, not automatic onset detection, and assumes steady tempo. Rendering still checks source duration; a longer shot can need more footage.

## Sessions and DAW export

### Find the keeper

Search takes, filter favourites and refresh after recording. Listen to guitar auditions the selected input without the band. Mark a favourite, add its guitar to the open Write song, or export it. Deletion requires a deliberate action; check whether a song/version references that take before deleting. Take analysis computes local timing, dynamics and intonation heuristics; it does not listen like a producer. Practice streak and recorded time are activity summaries, not quality scores.

### Alignment and stems

Guitar offset is the manual sample offset used to align input with the band. Automatic cable-loopback calibration is not available. Measure alignment in your DAW on the actual rig. New full recordings contain separate guitar, drums, bass and comp, plus band/master reference mixes, scheduled band-note MIDI, a tempo map and the performance snapshot. Referenced guitar layers export as aligned WAVs. Capture-only ideas do not reconstruct band MIDI. Missing files are reported in the export result.

### Logic and other DAWs

Export for Logic / REAPER writes a folder of standard WAV/MIDI files. Import the tempo map first, then place stems at bar 1 with original speed/pitch. Mute the band/master reference mixes while mixing the individual instruments to avoid double playback. Keep all files together when moving the project. Verify alignment and drift over a full song on the destination Mac; this is a one-way handoff, not live sync.

### REAPER session builder

If every required stem exists, the export also includes Import into REAPER.lua and REAPER-START-HERE.txt. In a new empty, stopped REAPER project, open Actions → Show action list → New action → Load ReaScript, choose the Lua file and run it. It creates named tracks, markers, tempo/meter and muted editable band-MIDI tracks. Choose instrument plugins before enabling MIDI. Save the REAPER project in the export folder. The importer refuses an existing populated project; REAPER is installed/licensed separately.

### Blind take comparison

Choose two different takes of the same chart and tempo. Set the same 0.1–60 second excerpt inside both recordings and Start blind comparison. A and B are randomly assigned and their identities hidden. Listen A/B auditions guitar-only audio at unity gain; no loudness normalisation is applied. Stop ends playback. Reveal identities shows which recording was which. Keep A/B marks that take as a favourite and reveals it, without changing or deleting the other take. New comparison resets the round. Deleted or moved source files must be restored before listening; desktop audio is required.

## Rig and hands-free control

### Connect the correct MIDI path

Open Rig → Connection & MIDI, rescan and select the intended output. Choose the hardware profile and verify its MIDI channel on the physical device. With no live port, messages appear only in the monitor. Scene buttons send the profile’s Program Change/Control Change sequence; parameter controls use its CC mapping. These change hardware settings, not software guitar processing. Check a single scene at low volume before a session.

### Section automation

Map named chart sections to scenes and enable following when ready. Write can instead own the tone plan: select the intended rig, enable Let this song change my rig tones, then choose each section’s tone. Keep current tone sends nothing. Use distinct section names. A mismatched rig or unavailable scene is refused. Changing the hardware profile clears the active song override; Play song reloads and validates it. Only one selected profile/output is controlled at a time.

### Learn pedals

In Write → Record & layers → Hands-free controls, choose MIDI input. Click Learn beside an action, press the pedal once, then enable pedal actions. Learning saves without executing the action. Actions include Keep that riff, Record/save take, Play/stop, Loop selected section, Next section loop and Keep a version. Capture must be armed before Keep. Bindings persist; the live connection and enable switch are deliberate each session.

CC values trigger on crossing 64 upward; note-on triggers a note binding. Releases and held values do not retrigger. Duplicate Program Changes within 250 ms and matching rig output echoed within 500 ms are suppressed. A HeadRush rig-selection press can also change the hardware tone. Use a suitable MIDI interface and test press/release, reconnect and feedback behavior on the real rig.

### Song tone snapshot

With an original open, Capture current tone stores the current profile ID, scene and controller values in that song. Save in Write persists it; version and Undo protection apply. Recall snapshot to rig validates the saved values against the installed profile before sending MIDI to the currently selected port. It disables section following, selects the profile and scene, then restores controllers. Enable section following again yourself when wanted. It does not change ports or automatically recall on song load. A failed MIDI operation can leave earlier changes applied; inspect the rig before retrying. The snapshot covers values known to Jamstudio, not unreported knob changes on the physical device.

## Settings, audio and costs

### Audio devices

Choose input/output device names, the input channel and a supported buffer size. The UI numbers channels from 1; stored configuration is zero-based. HeadRush dry channel 3 is therefore stored as 2, when the driver actually exposes it. Device changes restart audio and are saved after success. Use one interface for input/output where possible. Smaller buffers may lower latency but increase dropouts; use larger buffers if stream errors or input gaps grow. The engine uses 48 kHz internally. Unsupported device formats fail explicitly rather than silently resampling.

### Mac and Windows setup

On Mac allow microphone access for Jamstudio when requested; the selected audio input is used for guitar recording and tuning. If denied, review the app permission in macOS settings and restart the app. Choose the installer for Apple Silicon or Intel. Windows uses the available shared-mode device channels; do not assume it exposes the Mac’s multichannel HeadRush layout. The current preview installers are unsigned, and Mac notarisation is pending.

### Keys, models and usage

AI & models holds provider selection, editable model IDs, native-agent detection and API keys. Keys are saved to Windows credentials or Mac Keychain and are never written to song documents. The key input is cleared after storage; the app reports presence without returning the stored secret. Save AI settings persists the chosen model/limits. Model changes clear stale price estimates.

Usage records provider/model/status/time/bytes and optional estimates, not prompts or credentials. Output token limits and USD-per-million estimates help planning; they are not enforced account spending caps or final invoices. Set account budgets with the provider and check its dashboard. Media requests and installed CLI usage have their own billing rules.

### Audio setup profiles

Give the current audio setup a name and Save current setup. Up to twelve profiles retain input/output device names, guitar channel, sample rate and buffer size in settings, without API keys. Saving the same name replaces its profile. Recall requires the saved devices and channel to be available, then applies the configuration through the native audio engine. A failed or stopped engine shows an error; inspect the device settings and input meter. System-default device names follow the system’s current defaults. Remove deletes only the profile, not the active setup. Recording blocks changes. Browser profiles are temporary and cannot configure hardware.

## Files, backups and recovery

### Where your work lives

The normal user root is ~/JosefinesJamstudio: your home folder, then JosefinesJamstudio. originals/ contains song JSON; takes/ contains take manifests and WAVs; charts/, styles/ and rigs/ contain user content; controller.json holds pedal bindings; settings.json holds non-secret settings. music-videos/ contains projects, assets, jobs and exports. SQLite is a cache, not the master copy of new recordings. Developer overrides JAM_USER_DIR/JAM_DATA_DIR can change these locations.

### Back up and restore safely

Stop recording and rendering, save documents, close the app, then copy the whole user root to another disk/location. Song JSON references audio separately, and media manifests can contain absolute paths; moving just one JSON file is not a portable project bundle. On another computer, preserve the directory layout and re-import or repair moved media paths as needed. OS-keychain keys and CLI logins are separate and require setup on that computer.

To recover a previous file, first copy the damaged file and its backup somewhere safe. With the app closed, restore the matching backup to the original name, reopen and verify. Never overwrite the only remaining copy. Song/chart/settings backups use .json.bak; Film project backups use .bak.

### Damaged files and interrupted recordings

Unreadable songs, takes and media entries are reported individually while healthy entries remain visible. Invalid user charts are skipped. On startup, damaged settings are first preserved as settings.json.broken-<timestamp>, then a valid settings.json.bak is restored, or defaults if no valid backup exists. A recovery notice names the preserved file. Check your audio device and MIDI port before playing. If settings become damaged while the app is running, restart to recover. Permission or disk errors require fixing the reported access problem. Keep the error path when requesting help. The recorder uses a bounded disk queue and periodically updates WAV headers. A disk failure is reported; partial files may remain, but they are not claimed as a successfully saved take. Retained render intermediates consume disk space.

## Troubleshooting and acceptance

### No sound, no input or wrong timing

Check whether the Browser preview banner is visible. In the desktop app, open Settings and read Audio Engine mode/error before changing anything. Select the intended output and input, confirm the exposed channel and 48 kHz support, then Restart audio. Check physical connections and hardware monitoring. If the tuner is silent, check input meters and channel first. If a chart refuses to play, match its meter to the style. Save/stop an active take before timeline changes.

For misaligned guitar, measure Guitar offset against a known transient in your DAW. If clips no longer match after changing tempo/chords/form, return to the prior version or reposition/re-record them; the app does not automatically stretch or retune guitar.

### AI, files and media failures

For 401/403, verify the selected connection, stored key/account and model access. For 429, inspect quota/rate limits; do not repeatedly submit paid jobs. Agent not found means install the native CLI or set its full path; detection alone does not prove login. Missing FFmpeg means install both ffmpeg and ffprobe, restart and recheck. Invalid local workflows must run in ComfyUI first and be exported in API format. Missing media means check the recorded file path and backup, not only the cache.

### What automated checks cannot prove

Before depending on a release, run a real Mac session: allow recording access, select the rig, record and reopen a song, test every intended pedal/scene, export five minutes to Logic/REAPER and measure drift, then generate one short result with each intended provider/local model. Verify playback and a film render on that machine. Account access, musical quality, hardware continuity, signing/notarisation and physical latency remain separate acceptance results.

Report the build commit, OS, device names, channel/buffer, screen/action, exact error, expected result and a minimal reproducible song. Remove credentials and private media before sharing diagnostics. A green test suite is not a claim that every account, GPU or piece of hardware has been tested.

## Developer and extension guide

### Architecture and source map

React/TypeScript owns editing text and UI state; Rust owns audio, files, MIDI, processes and provider byte streams. src/ipc/client.ts routes commands to Tauri or the explicit browser simulator. src/store/engine.ts holds telemetry; src/lib/originals.ts and media.ts hold drafts. src-tauri/src contains the native command handlers. crates/jam-audio owns recording/rendering, jam-band sequencing, jam-core charts/timeline, and jam-rig MIDI.

The output callback advances the audio clock. It uses bounded buffers without allocation, locks or logging in the callback. There is no Web Audio playback, native voice implementation or software amp/plugin hosting in this build. Audio monitoring remains hardware-owned.

### Build and verify

Install the repository’s pinned pnpm/Node toolchain and stable Rust plus the platform’s Tauri prerequisites. Run pnpm install --frozen-lockfile. pnpm dev runs the simulated browser UI; pnpm tauri dev runs the native desktop. JAM_HEADLESS=1 selects a test engine without physical output. Keep test data isolated with JAM_USER_DIR and JAM_DATA_DIR. pnpm tauri build packages the desktop.

Run pnpm lint, pnpm typecheck, pnpm test, pnpm licenses:check and pnpm build; then cargo fmt --all -- --check, cargo clippy --workspace --all-targets -- -D warnings, JAM_HEADLESS=1 cargo test --workspace and cargo deny check. Set the environment variable using your shell’s syntax. GitHub CI runs Windows and macOS checks. The release workflow builds three installers; signing needs separate owner setup.

### Extend existing seams

Read AGENTS.md, docs/ARCHITECTURE.md and docs/EXTENDING.md before changing a contract. Add a style/chart/rig as versioned JSON through its registry. Add media model descriptors to src/lib/media-catalog.json; a new protocol belongs in Rust with bounded requests, host/auth checks and synthetic fixtures. Add studio actions through STUDIO_TOOLS so all supported text providers share validation. Keep IPC changes additive and unknown document fields intact.

The bilingual manual source is docs/guide/manual.json. Every title and text block has en and nb fields. node scripts/export-manual.mjs generates the English/Bokmål Markdown guides; --check detects stale generated files. The in-app help consumes the same source. Update documentation, tests and source references with behavior changes. Never copy incompatible third-party code/assets just because their workflow inspired an idea.

## Keyboard shortcuts

- **H**: Keep the recent guitar idea (capture must be armed)
- **Space**: Play / pause
- **Enter**: Stop and return to the top
- **L**: Toggle loop
- **C**: Count-in: off / 1 bar / 2 bars
- **T**: Tap tempo (tap on the beat, 2+ times)
- **← / →**: Tempo −1 / +1 BPM (Shift: ±5)
- **R**: Start / stop recording a take
- **F / K**: Cue a fill / a crash at the next bar
- **S / E**: Cue a stop / the ending
- **M / B / P**: Mute drums / bass / comp
- **↑ / ↓**: Intensity +5% / −5%
- **1 – 9**: Jump to bar 1–9 (start of the form)
- **[ / ]**: Transpose the chart down / up a semitone
- **U**: Toggle tuner
- **?**: Open Help & guides
