import { useState } from "react";
import { ipc, isPreview } from "../ipc/client";
import type { ReferenceState } from "../ipc/contract";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";

/** Shared by Songs and Stage; all samples, timing and transport stay in Rust. */
export function ReferencePlayer({ song }: { song: ReferenceState }) {
  const recording = useEngineStore((s) => s.isRecording);
  const volume = useEngineStore((s) => s.bandVolume);
  const [seek, setSeek] = useState("0");
  const [start, setStart] = useState(String(song.loop_start));
  const [end, setEnd] = useState(String(song.loop_end));
  const locked = recording || isPreview;
  const command = async (name: string, args?: Record<string, unknown>) => {
    try {
      await ipc.invoke(name, args);
    } catch (error) {
      useEngineStore.getState().notify("error", String(error));
    }
  };
  return (
    <section className="workspace-stack" aria-label="Reference player">
      <div>
        <h2>{song.label}</h2>
        <p className="workspace-note">Reference in Jamstudio · {song.state}</p>
        <p className="font-mono tabular-nums">
          {song.position.toFixed(1)} / {song.seconds.toFixed(1)} seconds
        </p>
      </div>
      {song.analysis ? (
        <section
          aria-label="Current chord estimate"
          className="workspace-stack"
        >
          <p className="workspace-note">
            Local estimates · low confidence ·{" "}
            {song.analysis.key ?? "Key unknown"}
            {song.analysis.bpm !== null &&
              ` · ${song.analysis.bpm.toFixed(1)} BPM`}
          </p>
          <p className="text-2xl font-semibold">
            Now: {song.analysis.chord ?? "Unknown"}
            <span className="ml-6 text-base font-normal">
              Next: {song.analysis.next_chord ?? "Unknown"}
            </span>
          </p>
          <p className="workspace-note">
            {song.analysis.beat === null
              ? "No analysed beat at this position"
              : `Beat ${song.analysis.beat} of ${song.analysis.beat_count}`}
            . Follows audio sent to the output; no downbeat or section estimate.
          </p>
        </section>
      ) : (
        <p className="workspace-note">
          {song.analysis_error ??
            "No chord analysis loaded. Analyze this reference in Songs, then load it again."}
        </p>
      )}
      <div className="workspace-actions">
        <Button
          disabled={locked}
          onClick={() =>
            void useEngineStore
              .getState()
              [song.state === "playing" ? "transportPause" : "transportPlay"]()
          }
        >
          {song.state === "playing" ? "Pause reference" : "Play reference"}
        </Button>
        <Button
          disabled={locked}
          onClick={() => void useEngineStore.getState().transportStop()}
        >
          Stop reference
        </Button>
        <Button
          disabled={locked}
          onClick={() => void command("media_reference_unload")}
        >
          Return to band
        </Button>
        <label className="room-tool-field">
          Reference volume
          <input
            type="range"
            className="accent-[var(--accent)]"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) =>
              void useEngineStore
                .getState()
                .setBandVolume(Number(e.target.value))
            }
          />
        </label>
      </div>
      <form
        className="workspace-actions"
        onSubmit={(e) => {
          e.preventDefault();
          void command("media_reference_seek", { seconds: Number(seek) });
        }}
      >
        <label className="room-tool-field">
          Seek to (seconds)
          <input
            type="number"
            min={0}
            max={song.seconds}
            step="any"
            required
            value={seek}
            disabled={locked}
            onChange={(e) => setSeek(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={locked}>
          Seek
        </Button>
      </form>
      <form
        className="workspace-actions"
        onSubmit={(e) => {
          e.preventDefault();
          void command("media_reference_loop", {
            start: Number(start),
            end: Number(end),
            enabled: true,
          });
        }}
      >
        <label className="room-tool-field">
          Loop start (seconds)
          <input
            type="number"
            min={0}
            max={song.seconds}
            step="any"
            required
            value={start}
            disabled={locked}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="room-tool-field">
          Loop end (seconds)
          <input
            type="number"
            min={0.1}
            max={song.seconds}
            step="any"
            required
            value={end}
            disabled={locked}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={locked}>
          Loop this range
        </Button>
        <Button
          type="button"
          disabled={locked || !song.loop_enabled}
          onClick={() =>
            void command("media_reference_loop", {
              start: song.loop_start,
              end: song.loop_end,
              enabled: false,
            })
          }
        >
          Loop off
        </Button>
      </form>
      <p className="workspace-note">
        {song.loop_enabled
          ? `Looping ${song.loop_start.toFixed(1)}–${song.loop_end.toFixed(1)} seconds. `
          : "Loop off. "}
        Playback uses the saved speed and pitch. Make a practice copy for
        another setting. Saved chord estimates follow playback; beat-grid loops
        are not available yet. Record in the top bar to capture guitar and the
        reference mix; save the take before seeking or changing the loop.
      </p>
    </section>
  );
}
