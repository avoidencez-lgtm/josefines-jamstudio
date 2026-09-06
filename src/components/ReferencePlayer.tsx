import { useEffect, useState } from "react";
import { ipc, isPreview } from "../ipc/client";
import type { ReferenceState } from "../ipc/contract";
import { applyReferencePractice } from "../lib/media";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";
import { StemMixer } from "./Stems";

/** Shared by Songs and Stage; all samples, timing and transport stay in Rust. */
export function ReferencePlayer({ song }: { song: ReferenceState }) {
  const recording = useEngineStore((s) => s.isRecording);
  const volume = useEngineStore((s) => s.bandVolume);
  const [seek, setSeek] = useState("0");
  const [start, setStart] = useState(String(song.loop_start));
  const [end, setEnd] = useState(String(song.loop_end));
  const [speed, setSpeed] = useState((song.speed ?? 1) * 100);
  const [semitones, setSemitones] = useState(song.semitones ?? 0);
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    setSpeed((song.speed ?? 1) * 100);
    setSemitones(song.semitones ?? 0);
  }, [song.speed, song.semitones]);
  const locked = recording || isPreview || processing;
  const practice = async (nextSpeed: number, nextSemitones: number) => {
    if (locked) return;
    setProcessing(true);
    try {
      await applyReferencePractice(song.asset_id, nextSpeed, nextSemitones);
    } catch (error) {
      useEngineStore.getState().notify("error", String(error));
    } finally {
      setProcessing(false);
    }
  };
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
          {song.position.toFixed(1)} / {song.seconds.toFixed(1)} source seconds
        </p>
      </div>
      {song.grid ? (
        <section
          className="workspace-stack"
          aria-label="Confirmed reference sections"
        >
          <h3 className="font-semibold">Bars & sections</h3>
          <p className="workspace-note">
            Confirmed from local estimates · {song.grid.beats_per_bar} beats per
            bar · {song.grid.bars} complete bars
          </p>
          <p className="font-mono tabular-nums">
            {song.grid.position
              ? `Bar ${song.grid.position.bar} · beat ${song.grid.position.beat.toFixed(1)} · ${song.grid.position.bpm.toFixed(1)} BPM · ${song.grid.position.section_label ?? "Outside named sections"}`
              : "Outside the confirmed bars, or waiting for output"}
          </p>
          <div className="workspace-actions">
            {song.grid.sections.map((section) => (
              <Button
                key={section.id}
                disabled={locked}
                onClick={() =>
                  void command("media_reference_loop_section", {
                    assetId: song.asset_id,
                    sectionId: section.id,
                  })
                }
              >
                Loop {section.label} · bars {section.startBar}–
                {section.endBar - 1}
              </Button>
            ))}
          </div>
          {!song.grid.sections.length && (
            <p className="workspace-note">
              Name sections in Songs, then reload this reference.
            </p>
          )}
          <p className="workspace-note">
            Section loops start at their confirmed downbeat. Press Play if the
            reference is paused. The readout follows audio consumed by the
            output; queued audio finishes before a new loop is heard. Names and
            beat grouping were entered by you, not detected automatically.
          </p>
        </section>
      ) : song.grid_error ? (
        <p role="alert">{song.grid_error}</p>
      ) : null}
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
            . Follows audio sent to the output; local analysis does not detect
            downbeats or sections.
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
      {Boolean(song.stems?.length) && (
        <StemMixer key={song.stems?.map((s) => s.id).join(",")} song={song} />
      )}
      <form
        className="workspace-stack"
        aria-label="Live reference practice"
        onSubmit={(e) => {
          e.preventDefault();
          void practice(speed / 100, semitones);
        }}
      >
        <h3 className="font-semibold">Practice speed & key</h3>
        <p className="workspace-note">
          Applied: {Math.round((song.speed ?? 1) * 100)}% ·{" "}
          {(song.semitones ?? 0) > 0 ? "+" : ""}
          {song.semitones ?? 0} semitones. Changes process each track locally
          during playback; guitar DI stays unchanged.
        </p>
        <div className="workspace-actions">
          <label className="room-tool-field">
            Reference speed · {Math.round(speed)}%
            <input
              type="range"
              min={50}
              max={150}
              step={1}
              value={speed}
              disabled={locked}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </label>
          <label className="room-tool-field">
            Reference transpose
            <select
              value={semitones}
              disabled={locked}
              onChange={(e) => setSemitones(Number(e.target.value))}
            >
              {Array.from({ length: 25 }, (_, i) => i - 12).map((n) => (
                <option key={n} value={n}>
                  {n > 0 ? "+" : ""}
                  {n} semitones
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={locked}>
            {processing ? "Applying…" : "Apply & save speed/key"}
          </Button>
          <Button
            type="button"
            disabled={locked}
            onClick={() => void practice(1, 0)}
          >
            100% · original key
          </Button>
        </div>
        <p className="workspace-note">
          Position and loop bounds remain in original source seconds. Chord/key
          estimates transpose with the audio; tempo estimates follow its speed.
          Save a take before changing these settings. Files, Film and offline
          practice copies are unchanged.
        </p>
        {song.processing_error && (
          <p role="alert">
            {song.processing_error} Reload the reference before trying again.
          </p>
        )}
      </form>
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
        Speed and key process the loaded reference and are saved for the next
        load. Saved chord estimates follow playback;{" "}
        {song.grid
          ? "section loops use the confirmed map."
          : "beat-grid loops are not available yet; confirm bars and sections in Songs."}{" "}
        Record in the top bar to capture guitar and the reference mix; save the
        take before seeking or changing the loop.
      </p>
    </section>
  );
}
