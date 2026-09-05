import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import {
  cancelVoice,
  releaseVoice,
  startVoice,
  useVoice,
} from "../../src/lib/jo/voice";

vi.mock("../../src/ipc/client", () => ({ ipc: { invoke: vi.fn() } }));
const turn = { generation: 7, transcript: "Set the tempo to 100", seconds: 2 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(ipc.invoke).mockReset();
  useVoice.setState({ phase: "idle", error: null, seconds: 0 });
});
afterEach(async () => {
  await cancelVoice();
  vi.useRealTimers();
});

it("sends the transcript through the existing dispatcher and speaks its actual outcome", async () => {
  vi.mocked(ipc.invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "voice_ptt")
      return { ...turn, transcript: args?.down ? null : turn.transcript };
    if (cmd === "voice_status") return { generation: 7, phase: "idle" };
  });
  const query = vi.fn(async (_text, current) => {
    expect(current()).toBe(true);
    return "Tempo set to 100 BPM.";
  });
  await startVoice(query);
  await releaseVoice(query);
  expect(query).toHaveBeenCalledWith(turn.transcript, expect.any(Function));
  expect(ipc.invoke).toHaveBeenCalledWith("voice_speak", {
    text: "Tempo set to 100 BPM.",
    generation: 7,
  });
  expect(useVoice.getState().phase).toBe("speaking");
  await vi.advanceTimersByTimeAsync(250);
  expect(useVoice.getState().phase).toBe("idle");
});

it("ignores a cancelled transcript and does not retry a rejected provider", async () => {
  let resolve!: (value: typeof turn) => void;
  vi.mocked(ipc.invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "voice_ptt")
      return args?.down
        ? turn
        : new Promise((done) => {
            resolve = done;
          });
  });
  const query = vi.fn(async () => "Unexpected");
  await startVoice(query);
  const release = releaseVoice(query);
  await cancelVoice();
  resolve(turn);
  await release;
  expect(query).not.toHaveBeenCalled();
  expect(
    vi.mocked(ipc.invoke).mock.calls.filter(([cmd]) => cmd === "voice_speak"),
  ).toHaveLength(0);
  vi.mocked(ipc.invoke).mockRejectedValueOnce(
    new Error("Microphone unavailable"),
  );
  await startVoice(query);
  expect(useVoice.getState().error).toContain("Microphone unavailable");
});

it("handles release during opening and stops at the 20 second limit", async () => {
  let opened!: (value: typeof turn) => void;
  vi.mocked(ipc.invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "voice_ptt")
      return args?.down
        ? new Promise((resolve) => {
            opened = resolve;
          })
        : turn;
  });
  const query = vi.fn(async () => "Done");
  const start = startVoice(query);
  const release = releaseVoice(query);
  opened(turn);
  await start;
  await release;
  expect(query).toHaveBeenCalledTimes(1);
  await cancelVoice();
  vi.mocked(ipc.invoke).mockImplementation(async (cmd) =>
    cmd === "voice_ptt" ? turn : undefined,
  );
  await startVoice(query);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(query).toHaveBeenCalledTimes(2);
});

it("does not speak a cancelled LLM result", async () => {
  vi.mocked(ipc.invoke).mockImplementation(async (cmd) =>
    cmd === "voice_ptt" ? turn : undefined,
  );
  let resolve!: (reply: string) => void;
  let isCurrent!: () => boolean;
  const query = vi.fn(async (_text, current) => {
    isCurrent = current;
    return new Promise<string>((done) => {
      resolve = done;
    });
  });
  await startVoice(query);
  const release = releaseVoice(query);
  await Promise.resolve();
  await cancelVoice();
  expect(isCurrent()).toBe(false);
  resolve("Must not play");
  await release;
  expect(
    vi.mocked(ipc.invoke).mock.calls.some(([cmd]) => cmd === "voice_speak"),
  ).toBe(false);
});

it("drains a cancelled device startup before allowing another turn", async () => {
  let opened!: (value: typeof turn) => void;
  vi.mocked(ipc.invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "voice_ptt" && args?.down)
      return new Promise((resolve) => {
        opened = resolve;
      });
  });
  const query = vi.fn(async () => "Done");
  const start = startVoice(query);
  const cancel = cancelVoice();
  await startVoice(query);
  expect(useVoice.getState().phase).toBe("cancelling");
  expect(
    vi.mocked(ipc.invoke).mock.calls.filter(([cmd]) => cmd === "voice_ptt"),
  ).toHaveLength(1);
  opened(turn);
  await Promise.all([start, cancel]);
  expect(useVoice.getState().phase).toBe("idle");
  expect(ipc.invoke).toHaveBeenCalledWith("voice_cancel", { generation: 7 });
  expect(query).not.toHaveBeenCalled();
});
