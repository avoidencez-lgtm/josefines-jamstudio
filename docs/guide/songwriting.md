# From a riff to an original song

Open **Write**. Create a song, name it, and save it. The first song has a verse and chorus
you can immediately change. Audio operations require the desktop app; browser preview is an editor demonstration.

## Capture an idea

Choose 15, 30 or 60 seconds and press **Arm capture** before playing.
Press **H**, **Keep that**, or tell Jo “keep that” to save the recent audio.
Capture stays local. Disarming clears only the unsaved buffer; saved takes remain.

Add the take as a guitar layer. Trim its start/end in seconds. Set how many bars the
trimmed riff contains and use **Fit tempo to riff**. This changes the band's tempo;
the guitar is never silently retuned or stretched. Choose the first bar and repeats.

## Shape the song

Select a section. Edit its name and chords, then **Apply chords**. For example:

```text
Am | F | C G | Am
```

Use `Dm:3 G:1` for unequal beats. The current writing mode is 4/4, 40–240 BPM.
Add sections, repeat them, and move them earlier or later. Adding an existing section
reuses it: editing that section updates all its appearances.

Each section has independent drums, bass and comp settings: groove, intensity,
volume, mute, and groove lock. “Try a groove” changes only unlocked parts.
Locks do not block deliberate edits to a part's own controls. Intensity selects the
style's sparse, medium or full pattern. Swing is shared by the section.

Press **Play / hear changes** to audition from bar 1. Editing does not unexpectedly
change the performance while you are playing. **Undo** and **Redo** cover the last 50 edits.
Keep a named version before experimenting; restore a version and press Play to compare.
Save the song to persist versions. Up to 20 versions, 256 arranged bars and 16 guitar layers are supported.

## Play without reaching for the mouse

Expand **Hands-free controls** in Write. Choose the physical MIDI input, click
**Learn** beside an action, then press a pedal once. Learning saves the assignment
without executing it. Enable pedal actions when ready. Reassigning a press removes
its old action; **Clear** removes a binding. Bindings survive restart, while the
connection and enable switch require deliberate activation each session.

Actions include Keep that riff, Record/save take, Play/stop, Loop selected section,
Next section loop and Keep a version (also saves the song). Capture must already be
armed for Keep. CC pedals trigger on a rising value of at least 64; note pedals on
note-on. Releases and held values do not repeat actions. Program Change duplicates
inside 250 ms are ignored. Incoming messages matching a live rig message the app
sent within 500 ms are suppressed to avoid immediate MIDI Thru feedback.

HeadRush's 5-pin Out sends Program Changes when selecting rigs, so selecting a rig
can also trigger a learned action. This changes the hardware tone too. Connect that
Out to the computer through a MIDI interface; a dedicated CC/note foot controller
can control the app independently. Verify the learned message on the actual device.
Source: [HeadRush MIDI Out explained](https://support.headrushfx.com/en/support/solutions/articles/69000822866-headrush-the-5-pin-midi-out-port-explained), checked 2026-09-04.

**Loop section** rehearses the selected section, including its repeats. **Next
section** steps through the song form, including repeated appearances of a section.
These actions restart playback at the chosen section; they are not seamless live
arrangement changes. Record starts a fresh complete take at bar 1. Jo also accepts
“loop the chorus”, “practice the verse” and “next section”.

## Hear the riff and match the rig

**Listen to guitar** auditions a take's selected input without the band. **Listen to
trim** auditions a layer's trimmed region once, at its original pitch and speed.
Use Stop to end listening. Listening is unavailable during recording.

Select the intended hardware profile and MIDI output in **Rig**. Back in Write,
enable **Let this song change my rig tones** and choose a tone on each section.
“Keep current tone” sends nothing. Use distinct section names. Tone choices are
saved with song versions; playback refuses an unavailable scene or a different rig.
The global Rig mappings remain intact when leaving songwriting. Switching hardware
profiles clears the active song override; press Play in Write to validate and load
the song again. This slice controls one selected rig profile/output at a time.

## Record and continue in Logic or REAPER

**Record / overdub** saves the song, starts from bar 1, and captures a new guitar take
while the band and existing guitar layers play. **Save take** finishes it. Recording
currently starts without a count-in. Stop recording before changing the song.

Mark favourite takes. Add a favourite as another guitar layer or export it to Logic.
New recordings include individual drums, bass and comp WAVs, selected guitar input,
band mix, master mix, actual scheduled band notes in MIDI, a tempo map, and the
song snapshot used for the performance. Referenced guitar layers are rendered as
separate aligned WAVs on export. Import the tempo map first and place stems at bar 1.
Band and master are reference mixes: mute them when mixing the individual stems.
Capture-only ideas do not contain a reconstructed musical grid or band MIDI.

The selected input is recorded; simultaneous dry and processed HeadRush capture is
not implemented in this slice. Use Settings to choose the intended channel. Guitar
monitoring stays in hardware. The existing manual latency offset remains available.
The input is shifted and padded to preserve equal stem durations; measure alignment
on the real rig before relying on an export for production.

### Optional REAPER session builder

**Export for Logic / REAPER** includes `Import into REAPER.lua` and
`REAPER-START-HERE.txt` when every stem is available. REAPER is a separate application;
the app does not install it, purchase a license or embed it. Keep Logic if it suits
you. The same folder still contains standard WAV and MIDI files for other DAWs.

1. In REAPER, open a **new empty project tab** and stop playback.
2. Open **Actions → Show action list → New action → Load ReaScript**.
3. Select `Import into REAPER.lua` in the export folder and **Run** it.
4. Save the resulting REAPER project in that same folder. Keep the whole folder
   together when transferring it to the Mac or backing it up.

The script creates named audio tracks at time zero, restores the take's tempo,
meter and section markers, and adds separate editable MIDI tracks for each recorded
band channel. Master is muted; the band reference is also muted when all three
individual instrument stems exist. MIDI tracks start muted and have no instrument
plug-ins: choose instruments, mute the matching audio stems, then enable the MIDI.
Older takes without individual band stems retain the band mix. No guitar notes
are inferred from audio. Audio keeps its original speed/pitch when project tempo changes.

No REAPER extensions are required. The importer refuses projects with existing
tracks, markers or tempo automation and checks audio sources before changing the
project. Import is one undo step; an unexpected failure reports how to remove the
partial import. It never automatically saves over a project. This is a one-way
handoff of the recorded performance, not live synchronization or round-trip editing.
Manual clip trims, effects, comping and mixing can continue inside REAPER.

Why REAPER: its documented scripting interface fits a customizable handoff well.
That is an integration choice, not a claim that it sounds better than Logic.
Primary references checked 2026-09-04: [REAPER capabilities](https://www.reaper.fm/about.php),
[loading ReaScripts](https://www.reaper.fm/sdk/reascript/reascript.php),
[API contract](https://www.reaper.fm/sdk/reascript/reascripthelp.html).
Actual REAPER import/playback on the friend's Mac remains an owner check.

## Files and recovery

Songs live in `~/JosefinesJamstudio/originals/*.json`; audio and take manifests live
in `~/JosefinesJamstudio/takes/`. Song saves retain a `.json.bak` copy. Conflicting
saves from another window are rejected. Unknown JSON fields survive song saves.
Use **Save copy** to keep edits if another window changed the original.
Take discovery reads the files, so deleting the SQLite cache does not lose new recordings.
Learned pedal bindings live in `~/JosefinesJamstudio/controller.json`.

Recording uses a bounded disk queue and checkpoints WAV headers every second.
Disk failure is reported and partial WAVs are kept; a partial recording is not reported
as a successful take. Guitar clips are decoded in memory with a 100 MB per-file limit.
Audio files remain separate from song documents; move/copy the whole user folder for backup.

The instrument sounds are still the existing synthetic kit/bass/comp. No new cloud
service is required. Musical quality, real interface continuity and Logic import
are owner checks, not things a passing software test proves.

## Owner acceptance session

1. Capture a riff with the real guitar input and trim a clean loop.
2. Make contrasting verse and chorus settings, lock bass, and change drums.
3. Save two versions, compare them, and undo an edit.
4. Record a second guitar part over the first.
5. Close/reopen the desktop app and resume the saved song.
6. Export a favourite take; verify all guitar/band stems, notes and markers in Logic.
7. Learn each real pedal; confirm press/release behaviour, disconnect/reconnect and
   absence of feedback when the app changes rig scenes.
8. Save contrasting section tones and verify their timing on the intended rig.
9. Optionally import the same take in REAPER: confirm section markers, aligned audio,
   muted reference mixes, editable band notes and save/reopen without missing media.

Record the build commit, device settings, measured offset and any drift. These checks remain pending until performed with the friend.
