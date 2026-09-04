# Make a music video

1. Install FFmpeg with ffprobe and restart Jamstudio. The **Film** screen shows
   whether local import/render tools are found. On Mac, common Homebrew paths are
   searched as well as PATH. The app does not bundle or install these executables.
2. Choose a saved **Studio take → Use take**, or expand **Import your audio or
   footage** and paste a full local file path. Use take builds a clean soundtrack
   from guitar, drums, bass and comp stems, excluding the click and voice buses;
   incomplete older takes require an explicit full-mix choice. Local import copies
   the selected file into the media library. Alternatively generate a soundtrack in **AI Music**.
3. Set the title, landscape/portrait frame and visual direction. **Build cuts from
   song sections** uses the selected take's saved chart, or the open Write song.
   It divides sections into four-bar shots and fits them to the recording length.
   For a song without a chart, add shots manually and **Fit all cuts to song length**.
4. Edit each shot's prompt, duration and clip start. **Let [brain] direct** proposes
   a coherent set of shot descriptions using the selected Settings connection,
   including installed Codex or Claude Code. Review/edit its JSON before applying.
   The persistent assistant can also use `edit_video_shot`; edits have Undo and
   never spend media-generation credits. It receives text/timing, not song audio.
5. Pick a model per shot and explicitly **Generate this shot**. Or import footage,
   or reuse an existing clip from the footage selector. Short clips loop; longer
   clips trim from the chosen offset. Generation duration and timeline duration
   are separate: use a short generated loop in a longer passage if appropriate.
6. Run **Refresh job** in the generation library until a queued result is ready.
   Refresh never submits a second generation. Pick **Use for this shot**. Task IDs
   survive restarts. Unknown interrupted requests need a provider-history check.
7. **Save video**, then **Render music video** when every shot has footage and the
   timeline matches the soundtrack. Watch a silent preview inside Jamstudio;
   **Play film with sound** opens the native player. The exported MP4 and project
   snapshot live under `~/JosefinesJamstudio/music-videos/exports/`.

The soundtrack's pitch/speed are unchanged. Generated clip audio is discarded.
Export is 720p/30 fps, cropped to fill landscape or portrait, with 48 kHz AAC audio.
Use the original source/stems for lossless audio work. Rendering can be canceled;
earlier completed renders remain. Retained intermediate files use disk space.

## Implemented model catalog

Defaults checked against official documentation on **2026-09-04**, not ranked by
unverified benchmarks. IDs are editable; a newer ID must use the same endpoint
contract. These adapters have synthetic contract tests, not live paid acceptance.

| Model | Connection | What to know |
| --- | --- | --- |
| Gemini Omni Flash 1.1 | Google API key | Text-to-video with portrait/landscape; requested duration is guidance |
| Runway Gen-4.5 | Runway API key | 2–10 second queued video shots |
| Veo 3.1 | Runway API key | 4/6/8 second shots, native video audio disabled |
| ByteDance Seedance 2.5 | Runway API key | Chinese hosted video; not described as open source |
| Alibaba Wan 3 | Runway API key | Chinese hosted video; separate from Wan 2.2 open weights |
| MiniMax Hailuo 3 | Runway API key | Chinese hosted video, 768p requested; export normalizes to 720p |
| Lyria 3.5 | Google API key | Music with vocals/lyrics or instrumentals, up to about three minutes |
| Eleven Music | ElevenLabs API key | Requested song duration and instrumental switch, default `music_v2` |
| MiniMax Music 3.0 | MiniMax API key | Existing eligible paying accounts only; instrumental or generated lyrics |
| Wan 2.2 / other local video | ComfyUI API workflow | Bring installed weights/nodes and a saved-video output |
| ACE-Step / other local audio | ComfyUI API workflow | Bring installed weights/nodes and a saved-audio output |
| MiniMax Music 3 local | ComfyUI API workflow | Model card requires CUDA; not a native Mac GPU option |

**MiniMax access:** the music API notice says new customers lost access starting
August 20, 2026; existing paying customers retain it, and free endpoints were
discontinued. Do not rely on the stale free-model enum farther down that page.
Music 3's official model card documents open-model self-hosting, including ComfyUI.
Model licensing, runtime and GPU requirements must be checked for each checkpoint.
Wan 2.2 and ACE-Step publish Apache-2.0 licensing; hosted successors are separate
products. Nothing here converts ChatGPT/Claude subscriptions into media API credits.

Lyria's canonical music guide currently uses `lyria-3.5`; some alternate-language
and preview/deprecation pages list other IDs. Keep the ID editable and test access
with the owner's account. Do not silently swap models after a failed request.

## Local model setup once

Start a trusted ComfyUI installation on `127.0.0.1:8188`. Build/run a working
workflow there using the model you installed, then export **API format**. Paste
that JSON in **Local model setup**, enter the prompt node ID and string input name
(often `text`), plus its Save Video/Save Audio output node ID. The selected output
node must produce one saved media file. UI-format workflow JSON is rejected.

The workflow controls the actual checkpoint, seed, size, frames/duration and lyrics.
Jamstudio changes only the selected prompt string. The catalog's local model ID is
a descriptive label, not a checkpoint installer or override. Inspect custom nodes
and never paste credentials into workflow JSON. Workflows may use network nodes;
local transport does not guarantee every node operates offline. Save the video to
persist the workflow. On a Mac without a compatible GPU/runtime, use the hosted
connections or import output rendered on another machine.

## Official sources and acceptance

- [Google Omni REST](https://ai.google.dev/gemini-api/docs/omni)
- [Google Lyria music REST](https://ai.google.dev/gemini-api/docs/music-generation)
- [Runway catalog](https://docs.dev.runwayml.com/guides/models/) and
  [official text-to-video request types](https://github.com/runwayml/sdk-node/blob/main/src/resources/text-to-video.ts)
- [Eleven Music API](https://elevenlabs.io/docs/api-reference/music/compose)
- [MiniMax music API and access notice](https://platform.minimax.io/docs/api-reference/music-generation)
- [MiniMax Music 3 model card](https://huggingface.co/MiniMaxAI/MiniMax-Music3)
- [Wan 2.2](https://github.com/Wan-Video/Wan2.2),
  [ACE-Step](https://github.com/ace-step/ACE-Step),
  [ComfyUI ACE-Step tutorial](https://docs.comfy.org/tutorials/audio/ace-step/ace-step-v1),
  [ComfyUI server protocol](https://docs.comfy.org/development/comfyui-server/comms_routes)

Owner acceptance: test a short generation with each intended account; compare its
invoice/history to the app's job/log. Close/reopen while a Runway/Comfy job runs,
refresh it, assign the output and render against a known recording. Verify Mac
preview/native playback and 16:9/9:16 export. Run the chosen local model workflow
on its real GPU. Check recognizable subjects and clip consistency by listening
and viewing the actual outputs; no quality claim is inferred from passing fixtures.

## Take soundtracks and recovery

Use take builds a clean starting mix from band + guitar DI + unmuted guitar
layers. It excludes the monitor/master recording, which can contain metronome
clicks and a test tone. Inputs are averaged for headroom. Import a mastered mix
from Songs when you want a finished release mix. Damaged media JSON files are
left intact and reported individually; healthy projects remain available.
A paid generation cannot be recalled once submitted; Cancel stops local rendering.
