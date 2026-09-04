# Studio workspaces: research and implementation

Checked 2026-09-04 against the primary sources below. The Open Stage Control site blocked automated access; its repository description was available. This is a workflow redesign,
not a claim that Jamstudio reproduces these products or their audio engines.
No external source code, datasets, screenshots or assets were copied. Existing
Phosphor icons, React, Zustand and native HTML controls cover the implementation.

| Reference | Relevant idea | Jamstudio application |
| --- | --- | --- |
| [Mixxx on GitHub](https://github.com/mixxxdj/mixxx), [library manual](https://manual.mixxx.org/2.3/en/chapters/library) | Searchable collections; recordings have a dedicated destination | Library searches chart metadata and grooves; Songs browses actual media assets; Sessions searches takes and filters favourites |
| [Open Stage Control on GitHub](https://github.com/jean-emmanuel/open-stage-control), [official site](https://openstagecontrol.ammd.net/) | Purpose-built OSC/MIDI performance controls | Large scene buttons and a visible MIDI connection path; setup and message inspection are separate from performing |
| [Kdenlive on GitHub](https://github.com/KDE/kdenlive), [official quick start](https://docs.kdenlive.org/en/getting_started/quickstart.html) | Media is organised in a project bin before editing on the timeline | Film separates storyboard, soundtrack and render/job views; readiness names missing soundtrack, footage and duration alignment |
| [ComfyUI app mode](https://docs.comfy.org/interface/app-mode), [interface overview](https://docs.comfy.org/interface/overview) | A focused input/output interface can sit above a complex workflow; queue and results have a home | AI Music exposes prompt, model and generation settings separately from the library and job receipts; the existing advanced ComfyUI setup remains available |
| [Ableton Live 12 browser](https://help.ableton.com/hc/en-us/articles/12927340213660-The-Live-12-Browser) | Find material by context rather than making everything share one list | Charts/grooves, reference audio and recorded takes have explicit destinations and search controls |
| [NN/g icon classification](https://www.nngroup.com/articles/classifying-icons/), [icon evaluation](https://www.nngroup.com/articles/how-to-test-digital-icons/) | Recognising an object and understanding its action are separate problems | One distinct pictogram per room, persistent text labels, task descriptions on the wide rail, active-page semantics and visible keyboard focus |

Mixxx, Open Stage Control, Kdenlive and ComfyUI were consulted for interaction
ideas only. Their project licences do not enter Jamstudio's dependency tree.
The existing Write research separately covers Helio, Signal, Tonal, Hookpad and
Ableton's MIDI transformations. These references informed design decisions; they
are not evidence of user-tested superiority. Recognition still needs a session
with the intended guitarist.

## The implemented contract

- Stage has Perform, Practice and Levels views. Practice loops use real arranged
  section bar ranges, including repeats, and the existing native transport.
- Library's editor survives room navigation, even when deliberately emptied.
  Invalid charts cannot play/save; dirty drafts cannot be replaced by opening
  another chart. A preview cannot seek a different loaded chart.
- Jo retains its conversation and unfinished input in memory between rooms.
  Live commands run on Send. Song-edit batches are reviewed before the existing
  validated, fingerprint-checked application path. Legacy groove/lock/restore and film edits also require review; mixed batches are refused before application. Only the selected provider is
  contacted. Unsupported voice stays disabled; T remains the global tap-tempo shortcut outside text fields.
- Songs imports into the existing local media library and opens native playback.
  A selected asset can become Film's soundtrack. This replaces the non-working
  M3 screen, not the unbuilt stem-separation/stretching engine.
- AI Music and Film share the existing saved project and media catalog. Their
  views expose different tasks without discarding drafts. Prompt starters only
  edit the prompt; paid generation still requires its explicit button.
- Sessions adds native guitar audition, favourites, attachment to the open Write
  song, filtering and deliberate deletion. Analysis and DAW export remain the
  existing native implementations. No waveform is invented when peaks are absent.
- Rig shows scenes first and puts section mapping and MIDI configuration in their
  own views. It distinguishes sent messages from disconnected preview.
- Settings groups Audio devices, AI & models and Usage. AI setup links open the
  relevant category. Connection filtering keeps unsaved key fields mounted;
  credentials are not persisted in browser storage.

Drafts and Jo conversation are in-memory until their existing Save action; they
are not durable autosave or cross-device sync. Page unload warnings cover dirty
song, chart and film state across room changes. Native-window close behaviour
still requires platform acceptance. No new model or provider protocol was added.

## Verification and limits

Automated checks cover unique registered icons, arranged rehearsal loops,
keyboard ownership, existing chart/AI validation and media file boundaries.
Browser checks cover every room at 1440, 1280 and 1100 px, editable workflows,
empty search results, room persistence, categories and absence of horizontal
overflow. Native import/player integration, MIDI, real guitar and paid model
quality remain owner acceptance. A browser preview is not evidence of sound.
