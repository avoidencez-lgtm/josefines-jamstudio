import { useEngineStore } from "../../store/engine";
import { useMedia } from "../media";
import { PARTS, changeGroove, useWriting } from "../originals";
import type { JoToolCall } from "./persona";
import { STUDIO_TOOLS, applyStudioEdits } from "./studioTools";
import { validateToolCall } from "./tools";

export async function dispatchJoToolCall(call: JoToolCall): Promise<string> {
  validateToolCall(call);
  if (Object.hasOwn(STUDIO_TOOLS, call.name)) return applyStudioEdits([call]);
  const store = useEngineStore.getState();
  if (call.name === "edit_video_shot") {
    const media = useMedia.getState();
    const a = call.arguments;
    if (store.isRecording || media.busy)
      throw new Error("Finish the recording or media operation first.");
    if (
      media.project.id !== a.projectId ||
      !media.project.shots.some((s) => s.id === a.shotId)
    )
      throw new Error("The video project or shot changed. Ask again.");
    if (
      (a.title !== undefined &&
        (String(a.title).trim().length < 1 || String(a.title).length > 100)) ||
      (a.prompt !== undefined &&
        (String(a.prompt).trim().length < 1 ||
          String(a.prompt).length > 3000)) ||
      (a.seconds !== undefined &&
        (Number(a.seconds) < 0.1 || Number(a.seconds) > 120))
    )
      throw new Error(
        "Check shot title, prompt and duration (0.1–120 seconds).",
      );
    const shots = media.project.shots.map((s) =>
      s.id === a.shotId
        ? {
            ...s,
            ...(a.title !== undefined ? { title: String(a.title) } : {}),
            ...(a.prompt !== undefined ? { prompt: String(a.prompt) } : {}),
            ...(a.seconds !== undefined ? { seconds: Number(a.seconds) } : {}),
          }
        : s,
    );
    if (shots.reduce((n, s) => n + s.seconds, 0) > 600)
      throw new Error("Keep the film within 10 minutes.");
    media.edit({ shots });
    return "Shot updated. Undo edit is available in Film; save the video to keep the change.";
  }
  if (call.name === "analyze_take") {
    const id = String(call.arguments.takeId);
    if (!store.takes.some((t) => t.id === id))
      throw new Error("Choose a saved take from the current take list.");
    if (store.isRecording)
      throw new Error("Finish recording before analyzing a take.");
    const analysis = await store.analyzeTake(id);
    if (!analysis)
      throw new Error("Take analysis failed; check the local recording.");
    return `Local heuristic analysis (not a listening review): ${JSON.stringify(analysis)}`;
  }

  switch (call.name) {
    case "songwriting": {
      const w = useWriting.getState();
      if (w.busy)
        throw new Error("Wait for the current song action to finish.");
      const a = call.arguments;
      const name = String(a.name ?? "");
      if (a.action === "keep") {
        await w.keep();
        return "Idea saved.";
      }
      if (!w.song) throw new Error("Create or open a song in Write first.");
      if (a.action === "save") {
        await w.save();
        return "Song saved.";
      }
      if (a.action === "play") {
        await w.play();
        return "Playing the song.";
      }
      if (a.action === "record") {
        await w.record();
        return "Recording updated.";
      }
      if (a.action === "loop" || a.action === "next") {
        if (name) {
          const section = w.song.body.chart.sections.find(
            (s) => s.name.toLowerCase() === name.toLowerCase(),
          );
          if (!section) throw new Error("Section not found.");
          w.select(section.id);
        }
        await w.rehearse(a.action === "next");
        return "Section loop ready.";
      }
      if (store.isRecording)
        throw new Error("Save the recording before editing.");
      if (a.action === "version") {
        if (w.song.versions.length >= 20)
          throw new Error("Remove an unused version first.");
        w.version(name);
        return "Version kept. Save the song to keep it on disk.";
      }
      if (a.action === "restore") {
        const v = w.song.versions.find(
          (v) => v.name.toLowerCase() === name.toLowerCase(),
        );
        if (!v) throw new Error("Version not found.");
        w.restore(v.id);
        return "Version restored. Press Play to hear it.";
      }
      if (a.action === "undo") {
        if (!w.past.length) throw new Error("No edit to undo.");
        w.undo();
        return "Last edit undone.";
      }
      const section = w.song.body.chart.sections.find((s) =>
        name
          ? s.name.toLowerCase() === name.toLowerCase()
          : s.id === w.selected,
      );
      if (!section)
        throw new Error("Section not found. Choose its name in Write.");
      w.select(section.id);
      if (a.action === "select") return "Section selected.";
      if (a.action === "lock") {
        const i = PARTS.findIndex((p) => p.toLowerCase() === a.part);
        if (i < 0) throw new Error("Choose drums, bass or comp.");
        w.edit((b) => {
          b.sections[section.id].parts[i].locked = a.locked !== false;
        });
        return "Part lock updated.";
      }
      if (a.action === "groove") {
        if (!store.styles.some((s) => s.id === a.styleId))
          throw new Error("Choose an available groove.");
        w.edit((b) => {
          b.sections[section.id] = changeGroove(
            b.sections[section.id],
            String(a.styleId),
          );
        });
        return "Unlocked parts changed. Press Play to compare.";
      }
      throw new Error("Unknown songwriting action.");
    }
    case "transport_control": {
      const action = call.arguments.action as string;
      if (action === "play") {
        await store.transportPlay();
        return "Started playback";
      }
      if (action === "pause") {
        await store.transportPause();
        return "Paused playback";
      }
      if (action === "stop") {
        await store.transportStop();
        return "Stopped playback";
      }
      break;
    }

    case "set_tempo": {
      if (typeof call.arguments.bpm === "number") {
        await store.transportSetTempo(call.arguments.bpm);
        return `Tempo set to ${call.arguments.bpm} BPM`;
      }
      if (typeof call.arguments.delta === "number") {
        const currentBpm = store.telemetry.transport.bpm;
        const targetBpm = currentBpm + call.arguments.delta;
        await store.transportSetTempo(targetBpm);
        return `Tempo set to ${targetBpm} BPM`;
      }
      break;
    }

    case "trigger_cue": {
      const cue = call.arguments.cue as
        | "none"
        | "fill"
        | "crash"
        | "stop"
        | "ending";
      await store.bandCue(cue);
      return `Queued cue: ${cue}`;
    }

    case "set_style": {
      const styleId = call.arguments.styleId as string;
      await store.bandSetStyle(styleId);
      return `Switched style to ${styleId}`;
    }

    case "set_intensity": {
      const raw = Number(call.arguments.intensity);
      const intensity = Math.min(1, Math.max(0, raw > 1 ? raw / 100 : raw));
      await store.bandSetIntensity(intensity);
      return `Intensity ${Math.round(intensity * 100)}%`;
    }

    case "load_chart": {
      const chartId = call.arguments.chartId as string;
      await store.bandLoadChart(chartId);
      return `Loaded chart ${chartId}`;
    }

    case "set_loop": {
      const enabled = Boolean(call.arguments.enabled);
      const start = Number(call.arguments.startBar);
      const end = Number(call.arguments.endBar);
      const t = store.telemetry.transport;
      await store.transportSetLoop(
        Number.isFinite(start) && start > 0 ? start : t.loop_start_bar,
        Number.isFinite(end) && end > 0 ? end : t.loop_end_bar,
        enabled,
      );
      return enabled ? "Looping" : "Loop off";
    }

    case "set_parts": {
      await store.bandSet({
        muteDrums: call.arguments.muteDrums as boolean | undefined,
        muteBass: call.arguments.muteBass as boolean | undefined,
        muteComp: call.arguments.muteComp as boolean | undefined,
      });
      return "Updated rhythm section parts";
    }

    case "toggle_energy_follower": {
      const enabled = call.arguments.enabled as boolean;
      await store.bandSet({ followEnergy: enabled });
      return `Energy following ${enabled ? "enabled" : "disabled"}`;
    }

    case "record_take": {
      const action = call.arguments.action as string;
      if (action === "start") {
        const id = await store.startRecording();
        return `Recording started: ${id}`;
      }
      if (action === "stop") {
        const take = await store.stopRecording();
        return `Recording saved: ${take?.id ?? "take"}`;
      }
      break;
    }
  }

  return `Executed ${call.name}`;
}
