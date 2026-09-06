import { z } from "zod";
import { create } from "zustand";
import { ipc, isPreview } from "../ipc/client";
import type { Chart } from "../ipc/contract";
import { useEngineStore } from "../store/engine";
import { askBrain } from "./jo/providers";
import catalog from "./media-catalog.json";

export const MEDIA_MODELS = catalog;

/** Same allow-list as `src-tauri/src/net/media.rs` for `runway-veo`. */
export const VEO_SECONDS = [4, 6, 8] as const;

export function clampGenerationSeconds(
  catalogId: string,
  seconds: number,
): number {
  if (!Number.isFinite(seconds)) return 8;
  if (catalogId === "veo") {
    return VEO_SECONDS.reduce((best, n) =>
      Math.abs(n - seconds) < Math.abs(best - seconds) ? n : best,
    );
  }
  return Math.min(10, Math.max(2, Math.round(seconds)));
}
export interface MediaAsset {
  id: string;
  kind: string;
  label: string;
  path: string;
  seconds: number;
  songAnalysis?: unknown;
  analysisStatus?: unknown;
  stemSet?: unknown;
  referencePractice?: unknown;
  referenceGrid?: unknown;
}

/** Shared by Songs and Jo; only reconcile UI state after native acceptance. */
export async function loadReference(assetId: string, useStems?: boolean) {
  const engine = useEngineStore.getState();
  if (engine.isPreview)
    throw new Error("Open the desktop app to load reference audio.");
  if (engine.isRecording)
    throw new Error("Finish recording before loading another song.");
  await ipc.invoke("media_reference_load", { assetId, useStems });
  useEngineStore.setState((s) => ({
    loadedOriginal: null,
    tempoTrainer: { ...s.tempoTrainer, enabled: false },
  }));
}

export async function applyReferencePractice(
  assetId: string,
  speed?: number,
  semitones?: number,
) {
  if (
    (speed === undefined && semitones === undefined) ||
    (speed !== undefined &&
      (!Number.isFinite(speed) || speed < 0.5 || speed > 1.5)) ||
    (semitones !== undefined &&
      (!Number.isInteger(semitones) || Math.abs(semitones) > 12))
  )
    throw new Error("Choose 50–150% speed and -12 to +12 whole semitones.");
  const applied = await ipc.invoke<{ speed: number; semitones: number }>(
    "media_reference_processing",
    { assetId, speed, semitones },
  );
  await useMedia
    .getState()
    .refresh()
    .catch((e) =>
      useMedia.setState({
        message: `Practice settings applied; library refresh failed: ${String(e)}`,
      }),
    );
  return applied;
}
export interface MediaShot {
  id: string;
  title: string;
  seconds: number;
  prompt: string;
  catalogId: string;
  model: string;
  generationSeconds: number;
  assetId: string | null;
  trimStart: number;
  [key: string]: unknown;
}
export interface VideoProject {
  schemaVersion: number;
  id: string;
  revision: number;
  title: string;
  direction: string;
  ratio: "16:9" | "9:16";
  audioId: string | null;
  shots: MediaShot[];
  [key: string]: unknown;
}
export interface MediaJob {
  id: string;
  status: string;
  message: string;
  taskId?: string;
  assetId?: string;
  rawPath?: string;
  lyrics?: string;
  request: { catalogId: string; model: string; prompt: string };
}

/** Immediate generation and recovered jobs load the player without starting playback. */
export async function completeGeneratedAudio(
  job: Pick<MediaJob, "status" | "assetId">,
) {
  if (job.status !== "ready") return;
  const song = useMedia
    .getState()
    .assets.find((a) => a.id === job.assetId && a.kind === "audio");
  if (!song)
    throw new Error(
      "Generated audio is saved but not in the current library. Refresh Songs to open it.",
    );
  await loadReference(song.id);
  useEngineStore.getState().setScreen("stage");
}
interface MediaLibrary {
  projects: VideoProject[];
  assets: MediaAsset[];
  jobs: MediaJob[];
}
export function newShot(title = "Opening", seconds = 8): MediaShot {
  return {
    id: crypto.randomUUID(),
    title,
    seconds,
    prompt:
      "A single continuous shot. A guitarist alone in a warm rehearsal room; close-up of hands, then slowly reveal the room. No titles or dialogue.",
    catalogId: "omni",
    model:
      catalog.find((m) => m.id === "omni")?.model ?? "gemini-omni-1.1-flash",
    generationSeconds: 8,
    assetId: null,
    trimStart: 0,
  };
}
export function newVideo(): VideoProject {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    revision: 0,
    title: "Untitled music video",
    direction:
      "Intimate live-performance film. Warm tungsten light, deep shadows, subtle film grain. Keep the same guitarist, clothes and room throughout.",
    ratio: "16:9",
    audioId: null,
    shots: [newShot()],
  };
}
export const videoDuration = (shots: MediaShot[]) =>
  shots.reduce((n, s) => n + s.seconds, 0);
export function fitShots(shots: MediaShot[], seconds: number): MediaShot[] {
  const total = videoDuration(shots);
  if (
    !shots.length ||
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > 600 ||
    !Number.isFinite(total) ||
    total <= 0
  )
    throw new Error("Choose a soundtrack and valid shot durations first.");
  const fitted = shots.map((s) => ({
    ...s,
    seconds: (s.seconds / total) * seconds,
  }));
  if (fitted.some((s) => s.seconds < 0.1 || s.seconds > 120))
    throw new Error(
      "Add or remove shots to keep each between 0.1 and 120 seconds.",
    );
  return fitted;
}
export function shotsFromChart(chart: Chart, seconds: number): MediaShot[] {
  const shots: MediaShot[] = [];
  const barSeconds =
    ((60 / chart.defaultBpm) * chart.timeSig[0] * 4) / chart.timeSig[1];
  if (!Number.isFinite(barSeconds) || barSeconds <= 0)
    throw new Error("Invalid song tempo.");
  for (const a of chart.arrangement) {
    const section = chart.sections.find((s) => s.id === a.sectionId);
    if (
      !section ||
      !Number.isInteger(a.repeats) ||
      a.repeats < 1 ||
      a.repeats > 64
    )
      throw new Error("Invalid song form.");
    for (let repeat = 0; repeat < a.repeats; repeat++) {
      // Split long sections into four-bar shots, then use the recording's actual duration.
      for (let bar = 0; bar < section.bars.length; bar += 4) {
        if (shots.length >= 120)
          throw new Error(
            "This form needs more than 120 shots. Build a shorter storyboard.",
          );
        const shot = newShot(
          `${section.name} · bars ${bar + 1}–${Math.min(bar + 4, section.bars.length)}`,
          Math.min(4, section.bars.length - bar) * barSeconds,
        );
        shot.prompt = `Single continuous music-video shot for ${section.name}. ${/chorus|solo/i.test(section.name) ? "Open the space, bold camera movement, an emotional lift." : "Intimate framing, a slow camera move, attentive performance detail."} No dialogue or on-screen text.`;
        shots.push(shot);
      }
    }
  }
  return fitShots(shots, seconds);
}
const shotIdeas = z
  .array(
    z.object({
      id: z.string(),
      title: z.string().min(1).max(100),
      prompt: z.string().min(1).max(3000),
    }),
  )
  .min(1)
  .max(120);
export function applyShotIdeas(
  project: VideoProject,
  raw: string,
): VideoProject {
  const ideas = shotIdeas.parse(
    JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    ),
  );
  if (
    ideas.length !== project.shots.length ||
    new Set(ideas.map((i) => i.id)).size !== ideas.length ||
    ideas.some((i) => !project.shots.some((s) => s.id === i.id))
  )
    throw new Error(
      "The director must return each current shot ID exactly once.",
    );
  return {
    ...project,
    shots: project.shots.map((s) => ({
      ...s,
      ...ideas.find((i) => i.id === s.id),
    })),
  };
}
interface MediaState extends MediaLibrary {
  undo: VideoProject[];
  undoEdit: () => void;
  project: VideoProject;
  dirty: boolean;
  busy: string;
  message: string;
  renderPath: string;
  proposal: string;
  proposalBase: string;
  edit: (patch: Partial<VideoProject>) => void;
  open: (project: VideoProject) => void;
  refresh: () => Promise<void>;
  save: () => Promise<void>;
  work: (label: string, task: () => Promise<void>) => Promise<void>;
  direct: () => Promise<void>;
}
export const useMedia = create<MediaState>((set, get) => ({
  undo: [],
  undoEdit: () => {
    const s = get();
    if (s.busy || !s.undo.length) return;
    const project = {
      ...s.undo[s.undo.length - 1],
      revision: s.project.revision,
    };
    set({ project, undo: s.undo.slice(0, -1), dirty: true, renderPath: "" });
  },
  projects: [],
  assets: [],
  jobs: [],
  project: newVideo(),
  dirty: false,
  busy: "",
  message: "",
  renderPath: "",
  proposal: "",
  proposalBase: "",
  edit: (patch) =>
    set((s) => ({
      project: { ...s.project, lastRender: null, ...patch },
      dirty: true,
      undo: [...s.undo, s.project].slice(-50),
      renderPath: "",
    })),
  open: (project) =>
    set({
      project: structuredClone(project),
      dirty: false,
      undo: [],
      renderPath:
        typeof project.lastRender === "string" ? project.lastRender : "",
      proposal: "",
      message: "",
    }),
  refresh: async () => {
    if (!isPreview) {
      const library = await ipc.invoke<MediaLibrary & { warnings?: string[] }>(
        "media_list",
      );
      set({
        ...library,
        message: library.warnings?.join("\n") || get().message,
      });
    }
  },
  save: async () => {
    if (isPreview)
      throw new Error(
        "Saving projects requires the desktop app. This preview keeps edits until reload.",
      );
    const sent = get().project;
    const project = await ipc.invoke<VideoProject>("media_save", {
      document: sent,
    });
    set((current) => {
      if (
        current.project.id !== sent.id ||
        current.project.revision > project.revision
      )
        return {};
      const changed = current.project !== sent;
      return {
        project: changed
          ? { ...current.project, revision: project.revision }
          : project,
        dirty: changed,
        message: changed
          ? "Earlier changes saved. Newer edits still need saving."
          : "Video saved.",
      };
    });
    await get().refresh();
  },
  work: async (label, task) => {
    if (get().busy) return;
    set({ busy: label, message: "" });
    try {
      await task();
    } catch (e) {
      set({ message: String(e) });
    } finally {
      set({ busy: "" });
    }
  },
  direct: async () => {
    const p = get().project;
    const answer = await askBrain({
      tools: false,
      system:
        "You are a music-video director collaborating with a guitarist. You receive text and shot timings, NOT audio; never claim to have listened. Return ONLY a JSON array with each supplied shot id exactly once and fields id, title (up to 100 characters), prompt (up to 800 characters). Make a coherent visual story across verse, chorus and bridge, consistent subject and wardrobe, specific camera motion. Describe a single shootable/generated shot per entry, no dialogue, no invented claims of execution. Preserve IDs and do not include other fields.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            title: p.title,
            direction: p.direction,
            ratio: p.ratio,
            shots: p.shots.map(({ id, title, seconds, prompt }) => ({
              id,
              title,
              seconds,
              prompt: prompt.slice(0, 200),
            })),
          }),
        },
      ],
    });
    applyShotIdeas(p, answer.reply);
    set({ proposal: answer.reply, proposalBase: JSON.stringify(p) });
  },
}));
