import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
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
  cancelFilmWork,
  clampGenerationSeconds,
  completeGeneratedAudio,
  deleteLibraryMedia,
  fitShots,
  maxClipTrimStart,
  newShot,
  newVideo,
  shotsFromChart,
  useMedia,
  videoDuration,
} from "../lib/media";
import { openExternal } from "../lib/openUrl";
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
          {playing ? "Pause this preview." : "Play this silent preview."}
        </Button>
        <label>
          Set the preview position.
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
  const engine = useEngineStore(
    useShallow((s) => ({
      isRecording: s.isRecording,
      loadTakes: s.loadTakes,
      takes: s.takes,
      keysPresent: s.keysPresent,
      setScreen: s.setScreen,
    })),
  );
  const ai = useAi();
  const [view, setView] = useState(audioOnly ? "Create music" : "Storyboard");
  const [jobFilter, setJobFilter] = useState("All jobs");
  const [selected, setSelected] = useState(0);
  const [path, setPath] = useState("");
  const [takeId, setTakeId] = useState("");
  const [tools, setTools] = useState({
    ready: false,
    message: "Checking local media tools.",
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
    "This is a soulful original guitar song. This is an intimate verse, a soaring chorus, and a short instrumental bridge. This is warm live-room sound.";
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
          "This browser preview cannot import, generate or render. Use the desktop app.",
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
    work("Importing this media.", async () =>
      attach(
        await ipc.invoke<MediaAsset>("media_import", {
          path: path.trim(),
          kind,
        }),
      ),
    );
  const generate = (kind: "audio" | "video") =>
    work(`Generating ${kind}. This can take several minutes.`, async () => {
      const seconds =
        kind === "audio"
          ? audioSeconds
          : clampGenerationSeconds(shot.catalogId, shot.generationSeconds);
      if (kind === "video" && seconds !== shot.generationSeconds)
        editShot({ generationSeconds: seconds });
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
          seconds,
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
      if (audioOnly && kind === "audio") await completeGeneratedAudio(job);
    });
  const chartStoryboard = () =>
    work("Planning these section cuts.", async () => {
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
            Undo this edit.
          </Button>
          <Button
            disabled={locked || m.dirty}
            title={
              m.dirty ? "Save your current video first." : "Start a new video."
            }
            onClick={() => {
              m.open(newVideo());
              setSelected(0);
            }}
          >
            Start this new project.
          </Button>
          <Button
            variant="primary"
            disabled={locked || isPreview}
            onClick={() => work("Saving this video.", m.save)}
          >
            Save this project.
          </Button>
          <span>
            {m.dirty
              ? "These are unsaved edits."
              : project.revision
                ? "This is saved locally."
                : "This is a new project."}
          </span>
        </div>
      </WorkspaceHeader>
      <details className="video-project-settings">
        <summary>
          Open the project settings. <span>{project.title}</span>
        </summary>
        <div className="video-project-bar">
          <label>
            Choose a project.
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
                This is a new unsaved project.
              </option>
              {m.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name this project.
            <input
              disabled={locked}
              maxLength={100}
              value={project.title}
              onChange={(e) => m.edit({ title: e.target.value })}
            />
          </label>
          <label hidden={audioOnly}>
            Choose the frame.
            <select
              disabled={locked}
              value={project.ratio}
              onChange={(e) =>
                m.edit({ ratio: e.target.value as "16:9" | "9:16" })
              }
            >
              <option value="16:9">Landscape is 16:9.</option>
              <option value="9:16">Portrait is 9:16.</option>
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
        <div className="film-progress" aria-label="This is the film readiness.">
          <button type="button" onClick={() => setView("Soundtrack")}>
            <strong>Step 1 is the soundtrack.</strong>
            <span>{audio ? audio.label : "Choose the song."}</span>
          </button>
          <button type="button" onClick={() => setView("Storyboard")}>
            <strong>Step 2 is the footage.</strong>
            <span>
              {
                project.shots.filter((s) =>
                  m.assets.some(
                    (a) => a.id === s.assetId && a.kind === "video",
                  ),
                ).length
              }{" "}
              of {project.shots.length} shots are assigned.
            </span>
          </button>
          <button type="button" onClick={() => setView("Render & jobs")}>
            <strong>Step 3 is the export.</strong>
            <span>
              {m.renderPath
                ? "This is rendered locally."
                : audio && Math.abs(total - audio.seconds) < 0.1
                  ? "This duration matches."
                  : "Fit the cuts to your song."}
            </span>
          </button>
        </div>
      )}
      <p className="video-note" hidden={audioOnly}>
        {tools.message}{" "}
        {!isPreview && !tools.ready && (
          <a
            href="https://ffmpeg.org/download.html"
            rel="noreferrer"
            onClick={(e) => {
              e.preventDefault();
              void openExternal("https://ffmpeg.org/download.html");
            }}
          >
            Get this FFmpeg.
          </a>
        )}
      </p>
      {(m.message || m.busy) && (
        <output className="video-feedback">
          <span>{m.busy || m.message}</span>
          {[
            "Rendering",
            "Generating",
            "Importing",
            "Refreshing this existing job.",
          ].some((label) => m.busy.startsWith(label)) && (
            <Button onClick={() => void cancelFilmWork()}>
              Cancel this local work.
            </Button>
          )}
        </output>
      )}
      <div hidden={view !== "Create music" && view !== "Soundtrack"}>
        <details className="video-audio-lab" open={audioOnly || undefined}>
          <summary>
            Generate a song.{" "}
            <span>Models include Lyria, MiniMax, Eleven and local.</span>
          </summary>
          <div className="video-audio-fields">
            <label>
              Choose a music model.
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
              Enter the model ID.
              <input
                disabled={locked}
                value={audioModelId}
                onChange={(e) => setAudioModelId(e.target.value)}
              />
            </label>
            <label>
              Requested length is in seconds.
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
            aria-label="These are the music prompt starters."
          >
            <span className="workspace-note">Start from an idea.</span>
            {[
              [
                "Start from an acoustic sketch.",
                "This is an intimate original acoustic guitar song. This has fingerpicked verses, a warm melodic chorus, and a short instrumental ending. This is natural room sound and human dynamics.",
              ],
              [
                "Start from a cinematic build.",
                "This is original instrumental guitar music. Begin with a sparse motif, build with bass and brushed drums, open into a soaring chorus, then return to the opening phrase.",
              ],
              [
                "Start from a practice backing.",
                "This is an original guitar-free backing track. This uses warm electric bass, tight drums, and understated organ. Leave space for a lead guitarist. This has a clear verse and chorus, with no lead melody or vocals.",
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
            Describe the song.
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
              This track is instrumental.
            </label>
            <Button
              variant="primary"
              disabled={
                locked ||
                isPreview ||
                (chosenAudio?.protocol !== "comfy" &&
                  !engine.keysPresent[chosenAudio?.provider ?? ""])
              }
              onClick={() => generate("audio")}
            >
              {chosenAudio?.protocol === "comfy"
                ? "Generate song. Local workflow."
                : "Generate song. Uses API credits."}
            </Button>
            <Button variant="ghost" onClick={openAiSettings}>
              Open these AI settings.
            </Button>
          </div>
          <p className="video-note">
            {chosenAudio?.description} Generated audio is saved and analyzed
            locally. AI Music opens completed songs in Stage, stopped and ready
            for practice. Failed analysis can be retried from the saved job
            without generating again. Cancel this local work keeps any received
            provider output. An already submitted request may still finish and
            be billed. Model access and API billing are separate from ChatGPT
            and Claude subscriptions.
          </p>
        </details>
      </div>
      {localSelected && (
        <details className="video-local" open>
          <summary>Local model setup. ComfyUI.</summary>
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
              Enter the prompt node ID.
              <input
                disabled={locked}
                value={local?.promptNode ?? ""}
                onChange={(e) => editLocal({ promptNode: e.target.value })}
              />
            </label>
            <label>
              Enter the prompt input name.
              <input
                disabled={locked}
                value={local?.promptInput ?? "text"}
                onChange={(e) => editLocal({ promptInput: e.target.value })}
              />
            </label>
            <label>
              Enter the save-output node ID.
              <input
                disabled={locked}
                value={local?.outputNode ?? ""}
                onChange={(e) => editLocal({ outputNode: e.target.value })}
              />
            </label>
          </div>
          <label>
            API workflow JSON. No credentials.
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
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                void openExternal(
                  "https://docs.comfy.org/development/comfyui-server/comms_routes",
                );
              }}
            >
              Open the workflow documentation.
            </a>
          </p>
        </details>
      )}
      <div
        hidden={audioOnly ? view !== "Library & jobs" : view !== "Soundtrack"}
      >
        <section className="video-source">
          <div>
            <span className="video-eyebrow">
              This section is the soundtrack.
            </span>
            <h2>{audio ? audio.label : "Start with the song."}</h2>
            <p>
              {audio
                ? `${time(audio.seconds)}. The final film uses this audio from the beginning, with no time-stretching.`
                : "Use a recorded performance, import a finished mix, or generate an idea above."}
            </p>
          </div>
          <div className="video-source-controls">
            <label>
              Choose a saved soundtrack.
              <select
                disabled={locked}
                value={project.audioId ?? ""}
                onChange={(e) => m.edit({ audioId: e.target.value || null })}
              >
                <option value="">Choose audio.</option>
                {m.assets
                  .filter((a) => a.kind === "audio")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}. {time(a.seconds)}.
                    </option>
                  ))}
              </select>
            </label>
            <div className="video-import-row">
              <label>
                Choose a studio take.
                <select
                  disabled={locked}
                  value={takeId}
                  onChange={(e) => setTakeId(e.target.value)}
                >
                  <option value="">Choose a recording.</option>
                  {engine.takes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.timestamp}. {time(t.durationSecs)}.
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={locked || isPreview || !takeId || !tools.ready}
                onClick={() =>
                  work("Importing this recording.", async () =>
                    attach(
                      await ipc.invoke<MediaAsset>("media_from_take", {
                        takeId,
                      }),
                    ),
                  )
                }
              >
                Use this take.
              </Button>
            </div>
          </div>
        </section>
        <details className="video-import">
          <summary>Import your audio or footage.</summary>
          <div className="video-import-row">
            <label>
              Enter the full local file path.
              <input
                disabled={locked}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="Paste the full path to a mix or video clip."
              />
            </label>
            <Button
              disabled={locked || isPreview || !path.trim()}
              onClick={() => importFile("audio")}
            >
              Import this soundtrack.
            </Button>
            <Button
              hidden={audioOnly}
              disabled={
                locked || isPreview || !path.trim() || !tools.ready || !shot
              }
              onClick={() => importFile("video")}
            >
              Import this clip for this shot.
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
            Set the creative direction.{" "}
            <span>Look, subject and the AI director.</span>
          </summary>
          <section className="video-direction">
            <div>
              <span className="video-eyebrow">
                This section is the creative direction.
              </span>
              <h2>One visual story.</h2>
            </div>
            <label>
              Describe the look, subject and recurring details.
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
                Build these cuts from the song sections.
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
                onClick={() => work(`Directing with ${brain.name}.`, m.direct)}
              >
                Let {brain.name} direct this.
              </Button>
              <span>Ideas first. Review before applying.</span>
            </div>
          </section>
        </details>
        {m.proposal && (
          <section className="video-proposal">
            <h2>Review the director’s proposal.</h2>
            <label>
              Edit the proposed shot descriptions.
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
                  work("Applying this direction.", async () => {
                    if (JSON.stringify(project) !== m.proposalBase)
                      throw new Error(
                        "The storyboard changed. Request a fresh direction before applying.",
                      );
                    m.edit(applyShotIdeas(project, m.proposal));
                    useMedia.setState({ proposal: "" });
                  })
                }
              >
                Apply this to the storyboard.
              </Button>
              <Button
                disabled={locked}
                onClick={() => useMedia.setState({ proposal: "" })}
              >
                Dismiss this proposal.
              </Button>
            </div>
          </section>
        )}
        <section className="video-edit">
          <div className="video-storyboard">
            <div className="video-section-heading">
              <div>
                <span className="video-eyebrow">
                  This section is the storyboard.
                </span>
                <h2>
                  {project.shots.length} shots. {time(total)}.
                </h2>
              </div>
              <Button
                disabled={locked || project.shots.length >= 120}
                onClick={() => {
                  m.edit({
                    shots: [
                      ...project.shots,
                      newShot(`This is shot ${project.shots.length + 1}.`),
                    ],
                  });
                  setSelected(project.shots.length);
                }}
              >
                Add this shot.
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
                      {time(videoDuration(project.shots.slice(0, i)))} to{" "}
                      {time(videoDuration(project.shots.slice(0, i + 1)))}
                    </small>
                  </span>
                  <span
                    className={s.assetId ? "video-dot ready" : "video-dot"}
                    title={
                      s.assetId
                        ? "A clip is assigned."
                        : "This shot needs footage."
                    }
                  />
                  <small>
                    {s.assetId
                      ? "This clip is assigned."
                      : "This shot needs a clip."}
                  </small>
                </button>
              ))}
            </div>
            <Button
              disabled={locked || !audio || !project.shots.length}
              onClick={() =>
                work("Fitting this timeline.", async () =>
                  m.edit({
                    shots: fitShots(project.shots, audio?.seconds ?? 0),
                  }),
                )
              }
            >
              Fit all these cuts to the song length.
            </Button>
            <p className="video-note">
              {audio
                ? `${Math.abs(total - audio.seconds) < 0.1 ? "Timeline matches your soundtrack." : `${(total - audio.seconds).toFixed(1)} seconds difference. Fit the cuts before exporting.`}`
                : "Choose a soundtrack to fit your cuts."}{" "}
              Short clips loop; long clips are trimmed. Rendering crops to fill
              the frame.
            </p>
          </div>
          {shot && (
            <div className="video-shot-editor">
              <div className="video-section-heading">
                <h2>Edit shot {project.shots.indexOf(shot) + 1}.</h2>
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
                    Move this up.
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
                    Remove this shot.
                  </Button>
                </div>
              </div>
              <label>
                Name this shot.
                <input
                  disabled={locked}
                  maxLength={100}
                  value={shot.title}
                  onChange={(e) => editShot({ title: e.target.value })}
                />
              </label>
              <div className="video-shot-fields">
                <label>
                  Timeline length is in seconds.
                  <input
                    type="number"
                    min={0.1}
                    max={120}
                    step={0.1}
                    disabled={locked}
                    value={Number(shot.seconds.toFixed(3))}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      editShot({
                        seconds,
                        trimStart: Math.min(
                          shot.trimStart,
                          maxClipTrimStart(clip?.seconds, seconds),
                        ),
                      });
                    }}
                  />
                </label>
                <label>
                  Clip start is in seconds.
                  <input
                    type="number"
                    min={0}
                    max={maxClipTrimStart(clip?.seconds, shot.seconds)}
                    step={0.1}
                    disabled={locked}
                    value={shot.trimStart}
                    onChange={(e) =>
                      editShot({
                        trimStart: Math.min(
                          Math.max(0, Number(e.target.value)),
                          maxClipTrimStart(clip?.seconds, shot.seconds),
                        ),
                      })
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
                  Choose a video model.
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
                  Generate length is in seconds.
                  <input
                    type="number"
                    min={shot.catalogId === "veo" ? 4 : 2}
                    max={shot.catalogId === "veo" ? 8 : 10}
                    step={shot.catalogId === "veo" ? 2 : 1}
                    disabled={locked}
                    value={clampGenerationSeconds(
                      shot.catalogId,
                      shot.generationSeconds,
                    )}
                    onChange={(e) =>
                      editShot({
                        generationSeconds: clampGenerationSeconds(
                          shot.catalogId,
                          Number(e.target.value),
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <details>
                <summary>Open the model ID and API details.</summary>
                <label>
                  This model ID is editable.
                  <input
                    disabled={locked}
                    value={shot.model}
                    onChange={(e) => editShot({ model: e.target.value })}
                  />
                </label>
                <p className="video-note">
                  {chosenModel?.description}{" "}
                  {chosenModel?.source && (
                    <a
                      href={chosenModel.source}
                      rel="noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        void openExternal(chosenModel.source);
                      }}
                    >
                      Open the provider documentation.
                    </a>
                  )}
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
                    ? "Generate this shot. Local workflow."
                    : "Generate this shot. Uses API credits."}
                </Button>
                <Button variant="ghost" onClick={openAiSettings}>
                  Open these AI settings.
                </Button>
              </div>
              <p className="video-note">
                The request sends the visual direction and this shot prompt. It
                does not upload your song. Generated sound is discarded in the
                final film.
              </p>
              <label>
                Choose footage for this shot.
                <select
                  disabled={locked}
                  value={shot.assetId ?? ""}
                  onChange={(e) =>
                    editShot({ assetId: e.target.value || null, trimStart: 0 })
                  }
                >
                  <option value="">
                    Choose generated or imported footage.
                  </option>
                  {m.assets
                    .filter((a) => a.kind === "video")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}. {time(a.seconds)}. {a.id.slice(-5)}.
                      </option>
                    ))}
                </select>
              </label>
              {clip && !isPreview ? (
                <SilentPreview
                  key={clip.path}
                  path={clip.path}
                  label="This is a silent shot preview."
                />
              ) : (
                <div className="video-empty-frame">
                  <span>Your shot goes here.</span>
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
            <span className="video-eyebrow">This section is the film.</span>
            <h2>Your performance. A finished MP4.</h2>
            <p>
              720p. 30 fps. {project.ratio}. {time(total)}. The original
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
              work("Rendering the film locally.", async () => {
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
            Render this music video.
          </Button>
          {m.renderPath && (
            <div className="video-render-result">
              <SilentPreview
                key={m.renderPath}
                path={m.renderPath}
                label="This is a silent rendered film preview."
              />
              <div>
                <p>
                  Render complete. Play with sound in your default media player.
                </p>
                <Button
                  onClick={() =>
                    work("Opening this film.", async () => {
                      await ipc.invoke("media_open", { path: m.renderPath });
                    })
                  }
                >
                  Play this film with sound.
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
            Show these jobs.
            <select
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
            >
              <option value="All jobs">Show all jobs.</option>
              <option value="Needs attention">
                Show jobs that need attention.
              </option>
              <option value="Ready">Show ready jobs.</option>
            </select>
          </label>
          <Button onClick={() => engine.setScreen("songs")}>
            Open this audio library.
          </Button>
        </div>
        <details className="video-jobs" open>
          <summary>
            Open the generation library.{" "}
            <span>{m.jobs.length} jobs. Saved across restarts.</span>
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
                  {j.taskId && <small>Provider job {j.taskId}.</small>}
                </div>
                <div className="video-actions">
                  {j.status !== "ready" && (
                    <Button
                      disabled={locked || isPreview}
                      onClick={() =>
                        work("Refreshing this existing job.", async () => {
                          const job = await ipc.invoke<MediaJob>(
                            "media_refresh",
                            {
                              jobId: j.id,
                            },
                          );
                          await m.refresh();
                          if (job.message)
                            useMedia.setState({ message: job.message });
                          if (audioOnly) await completeGeneratedAudio(job);
                        })
                      }
                    >
                      {j.status === "analysis"
                        ? "Retry this local analysis."
                        : "Refresh this job."}
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
                      {m.assets.find((a) => a.id === j.assetId)?.kind ===
                      "audio"
                        ? "Use this soundtrack."
                        : "Use this for this shot."}
                    </Button>
                  )}
                  {j.assetId &&
                    m.assets.find((a) => a.id === j.assetId)?.kind ===
                      "audio" && (
                      <Button
                        disabled={locked}
                        onClick={() =>
                          work("Opening this generated song.", async () => {
                            await ipc.invoke("media_open", {
                              path: m.assets.find((a) => a.id === j.assetId)
                                ?.path,
                            });
                          })
                        }
                      >
                        Listen to this.
                      </Button>
                    )}
                  <Button
                    variant="danger"
                    disabled={locked || isPreview}
                    onClick={() =>
                      work("Deleting this asset.", async () => {
                        if (
                          j.assetId &&
                          m.assets.some((asset) => asset.id === j.assetId)
                        ) {
                          await deleteLibraryMedia(j.assetId, "asset");
                        }
                        await deleteLibraryMedia(j.id, "job");
                      })
                    }
                  >
                    Delete this asset.
                  </Button>
                </div>
                {j.lyrics && (
                  <details>
                    <summary>Open the generated lyrics and structure.</summary>
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
