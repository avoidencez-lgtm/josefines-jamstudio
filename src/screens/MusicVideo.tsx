import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { WorkspaceHeader, WorkspaceViews } from "../components/Workspace";
import { ipc, isPreview } from "../ipc/client";
import type { Chart } from "../ipc/contract";
import { BRAINS, useAi } from "../lib/jo/providers";
import {
  MEDIA_MODELS,
  type MediaAsset,
  type MediaJob,
  type MediaShot,
  applyShotIdeas,
  fitShots,
  newShot,
  newVideo,
  shotsFromChart,
  useMedia,
  videoDuration,
} from "../lib/media";
import { useWriting } from "../lib/originals";
import { openAiSettings } from "../lib/settingsView";
import { useEngineStore } from "../store/engine";
import "./music-video.css";

const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
function SilentPreview({ path, label }: { path: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  return (
    <div>
      <video
        ref={ref}
        className="video-preview"
        src={convertFileSrc(path)}
        muted
        playsInline
        preload="metadata"
        aria-label={label}
        onContextMenu={(e) => e.preventDefault()}
        disablePictureInPicture
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() =>
          useMedia.setState({
            message:
              "This file cannot preview in the WebView. Its local file is still available for rendering.",
          })
        }
      />
      <div className="video-actions">
        <Button
          onClick={() => {
            const video = ref.current;
            if (!video) return;
            if (video.paused)
              void video
                .play()
                .catch((e) => useMedia.setState({ message: String(e) }));
            else video.pause();
          }}
        >
          {playing ? "Pause preview" : "Play silent preview"}
        </Button>
        <label>
          Preview position
          <input
            type="range"
            min={0}
            max={Number.isFinite(duration) ? duration : 0}
            step={0.1}
            value={position}
            onChange={(e) => {
              if (ref.current) ref.current.currentTime = Number(e.target.value);
            }}
          />
        </label>
      </div>
    </div>
  );
}
export function MusicVideo({ audioOnly = false }: { audioOnly?: boolean }) {
  const m = useMedia();
  const engine = useEngineStore();
  const ai = useAi();
  const [view, setView] = useState(audioOnly ? "Create music" : "Storyboard");
  const [jobFilter, setJobFilter] = useState("All jobs");
  const [selected, setSelected] = useState(0);
  const [path, setPath] = useState("");
  const [takeId, setTakeId] = useState("");
  const [tools, setTools] = useState({
    ready: false,
    message: "Checking local media tools…",
  });
  const project = m.project;
  type AudioDraft = {
    catalogId?: string;
    model?: string;
    prompt?: string;
    seconds?: number;
    instrumental?: boolean;
  };
  const audioDraft = project.audioGeneration as AudioDraft | undefined;
  const updateAudio = (patch: AudioDraft) =>
    m.edit({
      audioGeneration: {
        ...(useMedia.getState().project.audioGeneration as
          | AudioDraft
          | undefined),
        ...patch,
      },
    });
  const audioModel = audioDraft?.catalogId ?? "lyria";
  const audioModelId = audioDraft?.model ?? "lyria-3.5";
  const setAudioModelId = (model: string) => updateAudio({ model });
  const audioPrompt =
    audioDraft?.prompt ??
    "A soulful original guitar song. Intimate verse, soaring chorus, a short instrumental bridge. Warm live-room sound.";
  const setAudioPrompt = (prompt: string) => updateAudio({ prompt });
  const audioSeconds = audioDraft?.seconds ?? 120;
  const setAudioSeconds = (seconds: number) => updateAudio({ seconds });
  const instrumental = audioDraft?.instrumental ?? false;
  const setInstrumental = (instrumental: boolean) =>
    updateAudio({ instrumental });
  const shot = project.shots[Math.min(selected, project.shots.length - 1)];
  const audio = m.assets.find((a) => a.id === project.audioId);
  const clip = m.assets.find((a) => a.id === shot?.assetId);
  const total = videoDuration(project.shots);
  const locked = Boolean(m.busy) || engine.isRecording;
  const chosenModel = MEDIA_MODELS.find((p) => p.id === shot?.catalogId);
  const chosenAudio = MEDIA_MODELS.find((p) => p.id === audioModel);
  const localSelected =
    (!audioOnly &&
      view === "Storyboard" &&
      chosenModel?.protocol === "comfy") ||
    ((view === "Create music" || view === "Soundtrack") &&
      chosenAudio?.protocol === "comfy");
  const local = project.local as
    | {
        workflow?: string;
        promptNode?: string;
        promptInput?: string;
        outputNode?: string;
      }
    | undefined;
  const editLocal = (patch: Partial<NonNullable<typeof local>>) =>
    m.edit({ local: { ...local, ...patch } });
  const brain = BRAINS[ai.preferences.selected];
  useEffect(() => {
    void m.refresh().catch((e) => useMedia.setState({ message: String(e) }));
    void engine.loadTakes();
    if (isPreview)
      setTools({
        ready: false,
        message:
          "Browser preview: importing, generation and rendering require the desktop app.",
      });
    else
      void ipc
        .invoke<typeof tools>("media_tools")
        .then(setTools)
        .catch((e) => setTools({ ready: false, message: String(e) }));
  }, [m.refresh, engine.loadTakes]);

  const editShot = (patch: Partial<MediaShot>) =>
    m.edit({
      shots: project.shots.map((s) =>
        s.id === shot?.id ? { ...s, ...patch } : s,
      ),
    });
  const work = (label: string, task: () => Promise<void>) =>
    void m.work(label, task);
  const attach = async (a: MediaAsset) => {
    await m.refresh();
    if (a.kind === "audio") m.edit({ audioId: a.id });
    else editShot({ assetId: a.id, trimStart: 0 });
  };
  const importFile = (kind: string) =>
    work("Importing media", async () =>
      attach(
        await ipc.invoke<MediaAsset>("media_import", {
          path: path.trim(),
          kind,
        }),
      ),
    );
  const generate = (kind: "audio" | "video") =>
    work(`Generating ${kind} · this can take several minutes`, async () => {
      // Save the creative plan before any paid request. The job receipt is also persisted in Rust.
      await m.save();
      const selectedShotId = shot?.id;
      const job = await ipc.invoke<MediaJob>("media_generate", {
        request: {
          catalogId: kind === "audio" ? audioModel : shot.catalogId,
          model: kind === "audio" ? audioModelId : shot.model,
          prompt:
            kind === "audio"
              ? audioPrompt
              : `${project.direction}\n${shot.prompt}`,
          seconds: kind === "audio" ? audioSeconds : shot.generationSeconds,
          ratio: project.ratio,
          instrumental: kind === "audio" && instrumental,
          workflow:
            (kind === "audio" ? chosenAudio : chosenModel)?.protocol === "comfy"
              ? JSON.parse(local?.workflow || "null")
              : null,
          promptNode: local?.promptNode ?? "",
          promptInput: local?.promptInput ?? "text",
          outputNode: local?.outputNode ?? "",
        },
      });
      await m.refresh();
      if (job.assetId) {
        if (kind === "audio")
          useMedia.getState().edit({ audioId: job.assetId });
        else
          useMedia.getState().edit({
            shots: useMedia
              .getState()
              .project.shots.map((s) =>
                s.id === selectedShotId
                  ? { ...s, assetId: job.assetId ?? null, trimStart: 0 }
                  : s,
              ),
          });
        await useMedia.getState().save();
      }
      if (job.message) useMedia.setState({ message: job.message });
      else if (job.status === "pending")
        useMedia.setState({
          message:
            "Generation queued. Use Refresh job below to check it; you can close the app and resume later.",
        });
    });
  const chartStoryboard = () =>
    work("Planning section cuts", async () => {
      if (!audio) throw new Error("Choose a soundtrack first.");
      const take = engine.takes.find((t) => t.id === takeId);
      const snapshot = take?.snapshot as
        | { chart?: Chart; body?: { chart?: Chart } }
        | undefined;
      const chart =
        snapshot?.body?.chart ??
        snapshot?.chart ??
        useWriting.getState().song?.body.chart;
      if (!chart)
        throw new Error(
          "Open the song in Write or select a take with a saved song chart first.",
        );
      m.edit({ shots: shotsFromChart(chart, audio.seconds) });
      setSelected(0);
    });
  return (
    <div className="video-studio">
      <WorkspaceHeader
        screen={audioOnly ? "ai-music" : "music-video"}
        title={audioOnly ? "Find your next sound." : "Give your song a world."}
        description={
          audioOnly
            ? "Shape a musical idea, choose a model, and keep the results worth developing."
            : "Plan the shots around your song, bring in footage, then render a finished film."
        }
      >
        <div className="video-actions">
          <Button disabled={locked || !m.undo.length} onClick={m.undoEdit}>
            Undo edit
          </Button>
          <Button
            disabled={locked || m.dirty}
            title={
              m.dirty ? "Save your current video first" : "Start a new video"
            }
            onClick={() => {
              m.open(newVideo());
              setSelected(0);
            }}
          >
            New project
          </Button>
          <Button
            variant="primary"
            disabled={locked || isPreview}
            onClick={() => work("Saving video", m.save)}
          >
            Save project
          </Button>
          <span>
            {m.dirty
              ? "Unsaved edits"
              : project.revision
                ? "Saved locally"
                : "New project"}
          </span>
        </div>
      </WorkspaceHeader>
      <details className="video-project-settings">
        <summary>
          Project settings <span>{project.title}</span>
        </summary>
        <div className="video-project-bar">
          <label>
            Project
            <select
              disabled={locked || m.dirty}
              value={
                m.projects.some((p) => p.id === project.id) ? project.id : ""
              }
              onChange={(e) => {
                const p = m.projects.find((p) => p.id === e.target.value);
                if (p) {
                  m.open(p);
                  setSelected(0);
                }
              }}
            >
              <option value="" disabled>
                New unsaved project
              </option>
              {m.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project title
            <input
              disabled={locked}
              maxLength={100}
              value={project.title}
              onChange={(e) => m.edit({ title: e.target.value })}
            />
          </label>
          <label hidden={audioOnly}>
            Frame
            <select
              disabled={locked}
              value={project.ratio}
              onChange={(e) =>
                m.edit({ ratio: e.target.value as "16:9" | "9:16" })
              }
            >
              <option value="16:9">Landscape · 16:9</option>
              <option value="9:16">Portrait · 9:16</option>
            </select>
          </label>
        </div>
      </details>
      <WorkspaceViews
        labels={
          audioOnly
            ? ["Create music", "Library & jobs"]
            : ["Storyboard", "Soundtrack", "Render & jobs"]
        }
        value={view}
        onChange={setView}
      />
      {!audioOnly && (
        <div className="film-progress" aria-label="Film readiness">
          <button type="button" onClick={() => setView("Soundtrack")}>
            <strong>01 / Soundtrack</strong>
            <span>{audio ? audio.label : "Choose the song"}</span>
          </button>
          <button type="button" onClick={() => setView("Storyboard")}>
            <strong>02 / Footage</strong>
            <span>
              {
                project.shots.filter((s) =>
                  m.assets.some(
                    (a) => a.id === s.assetId && a.kind === "video",
                  ),
                ).length
              }{" "}
              of {project.shots.length} shots assigned
            </span>
          </button>
          <button type="button" onClick={() => setView("Render & jobs")}>
            <strong>03 / Export</strong>
            <span>
              {m.renderPath
                ? "Rendered locally"
                : audio && Math.abs(total - audio.seconds) < 0.1
                  ? "Duration matches"
                  : "Fit the cuts to your song"}
            </span>
          </button>
        </div>
      )}
      <p className="video-note">
        {tools.message}{" "}
        {!isPreview && !tools.ready && (
          <a
            href="https://ffmpeg.org/download.html"
            target="_blank"
            rel="noreferrer"
          >
            Get FFmpeg
          </a>
        )}
      </p>
      {(m.message || m.busy) && (
        <output className="video-feedback">
          <span>{m.busy || m.message}</span>
          {m.busy.startsWith("Rendering") && (
            <Button onClick={() => void ipc.invoke("media_cancel")}>
              Cancel render
            </Button>
          )}
        </output>
      )}
      <div hidden={view !== "Create music" && view !== "Soundtrack"}>
        <details className="video-audio-lab" open={audioOnly || undefined}>
          <summary>
            Song generator <span>Lyria · MiniMax · Eleven · local models</span>
          </summary>
          <div className="video-audio-fields">
            <label>
              Music model
              <select
                disabled={locked}
                value={audioModel}
                onChange={(e) => {
                  const entry = MEDIA_MODELS.find(
                    (m) => m.id === e.target.value,
                  );
                  if (entry)
                    updateAudio({ catalogId: entry.id, model: entry.model });
                }}
              >
                {MEDIA_MODELS.filter((m) => m.kind === "audio").map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model ID
              <input
                disabled={locked}
                value={audioModelId}
                onChange={(e) => setAudioModelId(e.target.value)}
              />
            </label>
            <label>
              Requested seconds
              <input
                type="number"
                min={3}
                max={audioModel === "lyria" ? 180 : 600}
                disabled={locked}
                value={audioSeconds}
                onChange={(e) => setAudioSeconds(Number(e.target.value))}
              />
            </label>
          </div>
          <div
            className="workspace-actions py-3"
            aria-label="Music prompt starters"
          >
            <span className="workspace-note">Start from an idea</span>
            {[
              [
                "Acoustic sketch",
                "An intimate original acoustic guitar song. Fingerpicked verses, a warm melodic chorus and a short instrumental ending. Natural room sound, human dynamics.",
              ],
              [
                "Cinematic build",
                "Original instrumental guitar music. Begin with a sparse motif, build with bass and brushed drums, open into a soaring chorus, then return to the opening phrase.",
              ],
              [
                "Practice backing",
                "An original guitar-free backing track: warm electric bass, tight drums and understated organ. Leave space for a lead guitarist. Clear verse and chorus, no lead melody or vocals.",
              ],
            ].map(([label, prompt]) => (
              <Button
                key={label}
                size="sm"
                disabled={locked}
                onClick={() => setAudioPrompt(prompt)}
              >
                {label}
              </Button>
            ))}
          </div>
          <label>
            Describe the song
            <textarea
              rows={3}
              maxLength={4000}
              disabled={locked}
              value={audioPrompt}
              onChange={(e) => setAudioPrompt(e.target.value)}
            />
          </label>
          <div className="video-actions">
            <label className="video-check">
              <input
                type="checkbox"
                checked={instrumental}
                disabled={locked}
                onChange={(e) => setInstrumental(e.target.checked)}
              />
              Instrumental
            </label>
            <Button
              variant="primary"
              disabled={
                locked ||
                isPreview ||
                !tools.ready ||
                (chosenAudio?.protocol !== "comfy" &&
                  !engine.keysPresent[chosenAudio?.provider ?? ""])
              }
              onClick={() => generate("audio")}
            >
              {chosenAudio?.protocol === "comfy"
                ? "Generate song · local workflow"
                : "Generate song · uses API credits"}
            </Button>
            <Button variant="ghost" onClick={openAiSettings}>
              API settings
            </Button>
          </div>
          <p className="video-note">
            {chosenAudio?.description} Generated audio becomes a separate
            soundtrack; your recordings stay in the library. Model access and
            API billing are separate from ChatGPT and Claude subscriptions.
          </p>
        </details>
      </div>
      {localSelected && (
        <details className="video-local" open>
          <summary>Local model setup · ComfyUI</summary>
          <p className="video-note">
            Start your installed ComfyUI on http://127.0.0.1:8188. Export a
            working workflow in API format, paste it here, and select its
            text-input and saved-output nodes once. Model, seed, resolution,
            length and lyrics come from this workflow; the prompt field is
            replaced for each generation. Use only workflows and custom nodes
            you trust. Nodes may make their own network calls.
          </p>
          <div className="video-audio-fields">
            <label>
              Prompt node ID
              <input
                disabled={locked}
                value={local?.promptNode ?? ""}
                onChange={(e) => editLocal({ promptNode: e.target.value })}
              />
            </label>
            <label>
              Prompt input name
              <input
                disabled={locked}
                value={local?.promptInput ?? "text"}
                onChange={(e) => editLocal({ promptInput: e.target.value })}
              />
            </label>
            <label>
              Save output node ID
              <input
                disabled={locked}
                value={local?.outputNode ?? ""}
                onChange={(e) => editLocal({ outputNode: e.target.value })}
              />
            </label>
          </div>
          <label>
            API workflow JSON · no credentials
            <textarea
              rows={6}
              disabled={locked}
              value={local?.workflow ?? ""}
              onChange={(e) => editLocal({ workflow: e.target.value })}
            />
          </label>
          <p className="video-note">
            Save one MP4/WebM/MOV/MKV for video, or WAV/MP3/FLAC/OGG for music.
            A compatible model and enough GPU memory are required; Jamstudio
            does not install ComfyUI or weights.{" "}
            <a
              href="https://docs.comfy.org/development/comfyui-server/comms_routes"
              target="_blank"
              rel="noreferrer"
            >
              Workflow documentation
            </a>
          </p>
        </details>
      )}
      <div
        hidden={audioOnly ? view !== "Library & jobs" : view !== "Soundtrack"}
      >
        <section className="video-source">
          <div>
            <span className="video-eyebrow">01 / SOUNDTRACK</span>
            <h2>{audio ? audio.label : "Start with the song."}</h2>
            <p>
              {audio
                ? `${time(audio.seconds)} · The final film uses this audio from the beginning, with no time-stretching.`
                : "Use a recorded performance, import a finished mix, or generate an idea above."}
            </p>
          </div>
          <div className="video-source-controls">
            <label>
              Saved soundtrack
              <select
                disabled={locked}
                value={project.audioId ?? ""}
                onChange={(e) => m.edit({ audioId: e.target.value || null })}
              >
                <option value="">Choose audio…</option>
                {m.assets
                  .filter((a) => a.kind === "audio")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} · {time(a.seconds)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="video-import-row">
              <label>
                Studio take
                <select
                  disabled={locked}
                  value={takeId}
                  onChange={(e) => setTakeId(e.target.value)}
                >
                  <option value="">Choose a recording…</option>
                  {engine.takes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.timestamp} · {time(t.durationSecs)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={locked || isPreview || !takeId || !tools.ready}
                onClick={() =>
                  work("Importing recording", async () =>
                    attach(
                      await ipc.invoke<MediaAsset>("media_from_take", {
                        takeId,
                      }),
                    ),
                  )
                }
              >
                Use take
              </Button>
            </div>
          </div>
        </section>
        <details className="video-import">
          <summary>Import your audio or footage</summary>
          <div className="video-import-row">
            <label>
              Full local file path
              <input
                disabled={locked}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="Paste the full path to a mix or video clip"
              />
            </label>
            <Button
              disabled={locked || isPreview || !path.trim() || !tools.ready}
              onClick={() => importFile("audio")}
            >
              Import soundtrack
            </Button>
            <Button
              hidden={audioOnly}
              disabled={
                locked || isPreview || !path.trim() || !tools.ready || !shot
              }
              onClick={() => importFile("video")}
            >
              Import clip for this shot
            </Button>
          </div>
          <p className="video-note">
            Files are copied into your media library. Up to 512 MB and 10
            minutes per file. Use footage you own or have permission to use.
          </p>
        </details>
      </div>
      <div hidden={audioOnly || view !== "Storyboard"}>
        <details className="video-direction-settings">
          <summary>
            Creative direction <span>Look, subject & AI director</span>
          </summary>
          <section className="video-direction">
            <div>
              <span className="video-eyebrow">02 / CREATIVE DIRECTION</span>
              <h2>One visual story.</h2>
            </div>
            <label>
              Look, subject and recurring details
              <textarea
                rows={3}
                maxLength={2000}
                disabled={locked}
                value={project.direction}
                onChange={(e) => m.edit({ direction: e.target.value })}
              />
            </label>
            <div className="video-actions">
              <Button disabled={locked || !audio} onClick={chartStoryboard}>
                Build cuts from song sections
              </Button>
              <Button
                disabled={
                  locked ||
                  isPreview ||
                  !ai.loaded ||
                  !(
                    brain.local || engine.keysPresent[ai.preferences.selected]
                  ) ||
                  !project.shots.length
                }
                onClick={() => work(`Directing with ${brain.name}`, m.direct)}
              >
                Let {brain.name} direct
              </Button>
              <span>Ideas first. Review before applying.</span>
            </div>
          </section>
        </details>
        {m.proposal && (
          <section className="video-proposal">
            <h2>Director’s proposal</h2>
            <label>
              Edit the proposed shot descriptions
              <textarea
                rows={8}
                disabled={locked}
                value={m.proposal}
                onChange={(e) =>
                  useMedia.setState({ proposal: e.target.value })
                }
              />
            </label>
            <div className="video-actions">
              <Button
                disabled={locked}
                variant="primary"
                onClick={() =>
                  work("Applying direction", async () => {
                    if (JSON.stringify(project) !== m.proposalBase)
                      throw new Error(
                        "The storyboard changed. Request a fresh direction before applying.",
                      );
                    m.edit(applyShotIdeas(project, m.proposal));
                    useMedia.setState({ proposal: "" });
                  })
                }
              >
                Apply to storyboard
              </Button>
              <Button
                disabled={locked}
                onClick={() => useMedia.setState({ proposal: "" })}
              >
                Dismiss
              </Button>
            </div>
          </section>
        )}
        <section className="video-edit">
          <div className="video-storyboard">
            <div className="video-section-heading">
              <div>
                <span className="video-eyebrow">03 / STORYBOARD</span>
                <h2>
                  {project.shots.length} shots · {time(total)}
                </h2>
              </div>
              <Button
                disabled={locked || project.shots.length >= 120}
                onClick={() => {
                  m.edit({
                    shots: [
                      ...project.shots,
                      newShot(`Shot ${project.shots.length + 1}`),
                    ],
                  });
                  setSelected(project.shots.length);
                }}
              >
                Add shot
              </Button>
            </div>
            <div className="video-shot-list">
              {project.shots.map((s, i) => (
                <button
                  type="button"
                  disabled={locked}
                  key={s.id}
                  aria-pressed={s.id === shot?.id}
                  className={s.id === shot?.id ? "active" : ""}
                  onClick={() => setSelected(i)}
                >
                  <span className="video-shot-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{s.title}</strong>
                    <small>
                      {time(videoDuration(project.shots.slice(0, i)))} —{" "}
                      {time(videoDuration(project.shots.slice(0, i + 1)))}
                    </small>
                  </span>
                  <span
                    className={s.assetId ? "video-dot ready" : "video-dot"}
                    title={s.assetId ? "Clip assigned" : "Needs footage"}
                  />
                  <small>{s.assetId ? "Assigned" : "Needs clip"}</small>
                </button>
              ))}
            </div>
            <Button
              disabled={locked || !audio || !project.shots.length}
              onClick={() =>
                work("Fitting timeline", async () =>
                  m.edit({
                    shots: fitShots(project.shots, audio?.seconds ?? 0),
                  }),
                )
              }
            >
              Fit all cuts to song length
            </Button>
            <p className="video-note">
              {audio
                ? `${Math.abs(total - audio.seconds) < 0.1 ? "Timeline matches your soundtrack." : `${(total - audio.seconds).toFixed(1)} seconds difference — fit the cuts before exporting.`}`
                : "Choose a soundtrack to fit your cuts."}{" "}
              Short clips loop; long clips are trimmed. Rendering crops to fill
              the frame.
            </p>
          </div>
          {shot && (
            <div className="video-shot-editor">
              <div className="video-section-heading">
                <h2>Edit shot {project.shots.indexOf(shot) + 1}</h2>
                <div className="video-actions">
                  <Button
                    disabled={locked || selected === 0}
                    onClick={() => {
                      const shots = [...project.shots];
                      [shots[selected - 1], shots[selected]] = [
                        shots[selected],
                        shots[selected - 1],
                      ];
                      m.edit({ shots });
                      setSelected(selected - 1);
                    }}
                  >
                    Move up
                  </Button>
                  <Button
                    disabled={locked || project.shots.length < 2}
                    onClick={() => {
                      m.edit({
                        shots: project.shots.filter((s) => s.id !== shot.id),
                      });
                      setSelected(0);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <label>
                Shot name
                <input
                  disabled={locked}
                  maxLength={100}
                  value={shot.title}
                  onChange={(e) => editShot({ title: e.target.value })}
                />
              </label>
              <div className="video-shot-fields">
                <label>
                  Timeline seconds
                  <input
                    type="number"
                    min={0.1}
                    max={120}
                    step={0.1}
                    disabled={locked}
                    value={Number(shot.seconds.toFixed(3))}
                    onChange={(e) =>
                      editShot({ seconds: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Clip start · seconds
                  <input
                    type="number"
                    min={0}
                    max={clip?.seconds ?? 600}
                    step={0.1}
                    disabled={locked}
                    value={shot.trimStart}
                    onChange={(e) =>
                      editShot({ trimStart: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                What happens in this shot?
                <textarea
                  rows={4}
                  maxLength={3000}
                  disabled={locked}
                  value={shot.prompt}
                  onChange={(e) => editShot({ prompt: e.target.value })}
                />
              </label>
              <div className="video-shot-fields">
                <label>
                  Video model
                  <select
                    disabled={locked}
                    value={shot.catalogId}
                    onChange={(e) => {
                      const entry = MEDIA_MODELS.find(
                        (m) => m.id === e.target.value,
                      );
                      if (entry)
                        editShot({
                          catalogId: entry.id,
                          model: entry.model,
                          generationSeconds: 8,
                        });
                    }}
                  >
                    {MEDIA_MODELS.filter((m) => m.kind === "video").map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Generate seconds
                  <input
                    type="number"
                    min={2}
                    max={10}
                    step={shot.catalogId === "veo" ? 2 : 1}
                    disabled={locked}
                    value={shot.generationSeconds}
                    onChange={(e) =>
                      editShot({ generationSeconds: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <details>
                <summary>Model ID & API details</summary>
                <label>
                  Editable model ID
                  <input
                    disabled={locked}
                    value={shot.model}
                    onChange={(e) => editShot({ model: e.target.value })}
                  />
                </label>
                <p className="video-note">
                  {chosenModel?.description}{" "}
                  <a
                    href={chosenModel?.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Provider documentation
                  </a>
                </p>
              </details>
              <div className="video-actions">
                <Button
                  disabled={
                    locked ||
                    isPreview ||
                    !tools.ready ||
                    (chosenModel?.protocol !== "comfy" &&
                      !engine.keysPresent[chosenModel?.provider ?? ""])
                  }
                  variant="primary"
                  onClick={() => generate("video")}
                >
                  {chosenModel?.protocol === "comfy"
                    ? "Generate this shot · local workflow"
                    : "Generate this shot · uses API credits"}
                </Button>
                <Button variant="ghost" onClick={openAiSettings}>
                  API settings
                </Button>
              </div>
              <p className="video-note">
                The request sends the visual direction and this shot prompt. It
                does not upload your song. Generated sound is discarded in the
                final film.
              </p>
              <label>
                Footage for this shot
                <select
                  disabled={locked}
                  value={shot.assetId ?? ""}
                  onChange={(e) =>
                    editShot({ assetId: e.target.value || null, trimStart: 0 })
                  }
                >
                  <option value="">
                    Choose generated or imported footage…
                  </option>
                  {m.assets
                    .filter((a) => a.kind === "video")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {time(a.seconds)} · {a.id.slice(-5)}
                      </option>
                    ))}
                </select>
              </label>
              {clip && !isPreview ? (
                <SilentPreview
                  key={clip.path}
                  path={clip.path}
                  label="Silent shot preview"
                />
              ) : (
                <div className="video-empty-frame">
                  <span>YOUR SHOT GOES HERE</span>
                  <p>
                    Generate footage or import a clip.
                    <br />
                    Preview stays silent while you work.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <div hidden={audioOnly || view !== "Render & jobs"}>
        <section className="video-export">
          <div>
            <span className="video-eyebrow">04 / THE FILM</span>
            <h2>Your performance. A finished MP4.</h2>
            <p>
              720p · 30 fps · {project.ratio} · {time(total)}. The original
              soundtrack is encoded to AAC without changing its pitch or speed.
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            disabled={
              locked ||
              isPreview ||
              !tools.ready ||
              !audio ||
              !project.shots.length ||
              project.shots.some((s) => !s.assetId) ||
              Math.abs(total - (audio?.seconds ?? 0)) > 0.1
            }
            onClick={() =>
              work("Rendering the film locally", async () => {
                await m.save();
                const path = await ipc.invoke<string>("media_render", {
                  document: useMedia.getState().project,
                });
                useMedia.getState().edit({ lastRender: path });
                await useMedia.getState().save();
                useMedia.setState({ renderPath: path });
              })
            }
          >
            Render music video
          </Button>
          {m.renderPath && (
            <div className="video-render-result">
              <SilentPreview
                key={m.renderPath}
                path={m.renderPath}
                label="Silent rendered film preview"
              />
              <div>
                <p>
                  Render complete. Play with sound in your default media player.
                </p>
                <Button
                  onClick={() =>
                    work("Opening film", async () => {
                      await ipc.invoke("media_open", { path: m.renderPath });
                    })
                  }
                >
                  Play film with sound
                </Button>
                <p className="video-path">{m.renderPath}</p>
              </div>
            </div>
          )}
        </section>
      </div>
      <div
        hidden={
          audioOnly ? view !== "Library & jobs" : view !== "Render & jobs"
        }
      >
        <div className="workspace-search">
          <label>
            Show jobs
            <select
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
            >
              <option>All jobs</option>
              <option>Needs attention</option>
              <option>Ready</option>
            </select>
          </label>
          <Button onClick={() => engine.setScreen("songs")}>
            Open audio library
          </Button>
        </div>
        <details className="video-jobs" open>
          <summary>
            Generation library{" "}
            <span>{m.jobs.length} jobs · saved across restarts</span>
          </summary>
          {!m.jobs.length && (
            <p className="video-note">
              Generated clips, songs, lyrics and task IDs appear here. Refresh
              checks an existing job; it never starts a new paid generation.
            </p>
          )}
          {[...m.jobs]
            .reverse()
            .filter(
              (j) =>
                (!audioOnly ||
                  MEDIA_MODELS.find((m) => m.id === j.request.catalogId)
                    ?.kind === "audio") &&
                (jobFilter === "All jobs" ||
                  (jobFilter === "Ready"
                    ? j.status === "ready"
                    : j.status !== "ready")),
            )
            .map((j) => (
              <article key={j.id}>
                <div>
                  <strong>{j.request.model}</strong>
                  <span>{j.status}</span>
                  <p>{j.request.prompt.slice(0, 180)}</p>
                  {j.message && <p className="video-job-error">{j.message}</p>}
                  {j.taskId && <small>Provider task: {j.taskId}</small>}
                </div>
                <div className="video-actions">
                  {j.status !== "ready" && (
                    <Button
                      disabled={locked || isPreview}
                      onClick={() =>
                        work("Refreshing existing job", async () => {
                          const job = await ipc.invoke<MediaJob>(
                            "media_refresh",
                            {
                              jobId: j.id,
                            },
                          );
                          await m.refresh();
                          if (job.message)
                            useMedia.setState({ message: job.message });
                        })
                      }
                    >
                      Refresh job
                    </Button>
                  )}
                  {j.assetId && (
                    <Button
                      disabled={locked}
                      onClick={() => {
                        const a = m.assets.find((a) => a.id === j.assetId);
                        if (a) void attach(a);
                      }}
                    >
                      Use{" "}
                      {m.assets.find((a) => a.id === j.assetId)?.kind ===
                      "audio"
                        ? "soundtrack"
                        : "for this shot"}
                    </Button>
                  )}
                  {j.assetId &&
                    m.assets.find((a) => a.id === j.assetId)?.kind ===
                      "audio" && (
                      <Button
                        disabled={locked}
                        onClick={() =>
                          work("Opening generated song", async () => {
                            await ipc.invoke("media_open", {
                              path: m.assets.find((a) => a.id === j.assetId)
                                ?.path,
                            });
                          })
                        }
                      >
                        Listen
                      </Button>
                    )}
                </div>
                {j.lyrics && (
                  <details>
                    <summary>Generated lyrics / structure</summary>
                    <pre>{j.lyrics}</pre>
                  </details>
                )}
              </article>
            ))}
        </details>
      </div>
    </div>
  );
}
