import { useEngineStore } from "../../store/engine";
import type { JoToolCall } from "./persona";

export async function dispatchJoToolCall(call: JoToolCall): Promise<string> {
  const store = useEngineStore.getState();

  switch (call.name) {
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

export function speakJoReply(text: string): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}
