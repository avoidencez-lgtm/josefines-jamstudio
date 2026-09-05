import { create } from "zustand";
import { ipc } from "../../ipc/client";

export type VoicePhase =
  | "idle"
  | "opening"
  | "cancelling"
  | "listening"
  | "transcribing"
  | "thinking"
  | "synthesizing"
  | "speaking";
export type VoiceQuery = (
  text: string,
  current: () => boolean,
) => Promise<string | undefined>;
type Turn = { generation: number; transcript: string | null; seconds: number };
export const useVoice = create<{
  phase: VoicePhase;
  error: string | null;
  seconds: number;
}>(() => ({ phase: "idle", error: null, seconds: 0 }));
let epoch = 0;
let opening: Promise<Turn> | null = null;
let cancellation: Promise<void> | null = null;
let deadline: ReturnType<typeof setTimeout> | undefined;
let poll: ReturnType<typeof setInterval> | undefined;
const clearTimers = () => {
  clearTimeout(deadline);
  clearInterval(poll);
};

export async function cancelVoice() {
  if (cancellation) return cancellation;
  epoch++;
  clearTimers();
  useVoice.setState({ phase: "cancelling" });
  cancellation = (async () => {
    try {
      // Drain device startup before cancelling it; a new turn stays disabled.
      await opening?.catch(() => undefined);
      await ipc.invoke("voice_cancel");
    } catch (e) {
      useVoice.setState({ error: `Could not stop voice: ${String(e)}` });
    } finally {
      useVoice.setState({ phase: "idle" });
      cancellation = null;
    }
  })();
  return cancellation;
}

export async function startVoice(query: VoiceQuery) {
  if (!["idle", "speaking"].includes(useVoice.getState().phase)) return;
  const turn = ++epoch;
  clearTimers();
  useVoice.setState({ phase: "opening", error: null, seconds: 0 });
  const pending = ipc.invoke<Turn>("voice_ptt", { down: true });
  opening = pending;
  try {
    const opened = await pending;
    if (turn !== epoch) {
      await ipc.invoke("voice_cancel", { generation: opened.generation });
      return;
    }
    useVoice.setState({ phase: "listening" });
    deadline = setTimeout(() => void releaseVoice(query), 20_000);
  } catch (e) {
    if (turn === epoch) useVoice.setState({ phase: "idle", error: String(e) });
  } finally {
    if (opening === pending) opening = null;
  }
}

export async function releaseVoice(query: VoiceQuery) {
  const turn = epoch;
  if (opening) {
    try {
      await opening;
    } catch {
      return;
    }
  }
  if (turn !== epoch || useVoice.getState().phase !== "listening") return;
  clearTimeout(deadline);
  useVoice.setState({ phase: "transcribing" });
  const current = () => turn === epoch;
  try {
    const captured = await ipc.invoke<Turn>("voice_ptt", { down: false });
    if (!current()) return;
    if (!captured.transcript)
      throw new Error("No speech was detected. Check your microphone.");
    useVoice.setState({ phase: "thinking", seconds: captured.seconds });
    const reply = await query(captured.transcript, current);
    if (!current()) return;
    if (!reply) {
      await cancelVoice();
      return;
    }
    useVoice.setState({ phase: "synthesizing" });
    await ipc.invoke("voice_speak", {
      text: reply,
      generation: captured.generation,
    });
    if (!current()) return;
    useVoice.setState({ phase: "speaking" });
    poll = setInterval(() => {
      void ipc
        .invoke<{ phase: VoicePhase; generation: number }>("voice_status")
        .then((state) => {
          if (!current()) return;
          if (
            state.generation !== captured.generation ||
            state.phase === "idle"
          ) {
            clearInterval(poll);
            useVoice.setState({ phase: "idle" });
          }
        })
        .catch(async (e) => {
          if (!current()) return;
          await cancelVoice();
          useVoice.setState({ error: String(e) });
        });
    }, 250);
  } catch (e) {
    if (!current()) return;
    await cancelVoice();
    useVoice.setState({ error: String(e) });
  }
}
