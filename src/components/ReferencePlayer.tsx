import { useEffect, useState } from "react";
import { ipc, isPreview } from "../ipc/client";
import type { ReferenceState } from "../ipc/contract";
import { applyReferencePractice } from "../lib/media";
import { applyReferenceRamp, useReferenceRamp } from "../lib/referenceRamp";
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
  const rampDraft = useReferenceRamp();
  useEffect(() => {
    setSpeed((song.speed ?? 1) * 100);
    setSemitones(song.semitones ?? 0);
  }, [song.speed, song.semitones]);
  const locked = recording || isPreview || processing || rampDraft.busy;
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
    <section className="workspace-stack" aria-label="This is the reference player.">
      <div>
        <h2>{song.label}</h2>
        <p className="workspace-note">
          {song.state === "playing" ? "This reference is playing." : song.state === "paused" ? "This reference is paused." : "This reference is stopped."}
        </p>
        <p className="font-mono tabular-nums">
          This is {song.position.toFixed(1)} / {song.seconds.toFixed(1)} seconds of the source.
        </p>
      </div>
      {song.grid ? (
        <section
          className="workspace-stack"
          aria-label="These are the bars and sections."
        >
          <h3 className="font-semibold">These are the bars and sections.</h3>
          <p className="workspace-note">
            Confirmed from local estimates. This has {song.grid.beats_per_bar} beats per bar. {song.grid.bars} bars are complete.
          </p>
          <p className="font-mono tabular-nums">
            {song.grid.position
              ? `Bar ${song.grid.position.bar} · beat ${song.grid.position.beat.toFixed(1)} · ${song.grid.position.bpm.toFixed(1)} BPM · ${song.grid.position.section_label ?? "This is outside named sections."}`
              : "Outside the confirmed bars, or waiting for output."}
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
                Loop {section.label}. Bars {section.startBar}–
                {section.endBar - 1}.
              </Button>
            ))}
          </div>
          {!song.grid.sections.length && (
            <p className="workspace-note">
              Name sections in Songs, then reload this reference.
            </p>
          )}
          <p className="workspace-note">
            {song.grid.origin === "estimated-local" ? "Section loops start at the estimated downbeat." : "Section loops start at the confirmed downbeat."}{" "}
            Press Play if the reference is paused. The readout follows
            audio consumed by the output; queued audio finishes before a new
            loop is heard.
            {song.grid.origin === "estimated-local"
              ? " This map is a local 4/4 guess from the first beat. Confirm bars in Songs before a practice ramp. Music.ai estimates never write this grid."
              : " Names and beat grouping were entered by you, not detected automatically."}
          </p>
        </section>
      ) : song.grid_error ? (
        <p role="alert">{song.grid_error}</p>
      ) : null}
      {song.analysis ? (
        <section
          aria-label="This is the current chord estimate."
          className="workspace-stack"
        >
          <p className="workspace-note">
            Local estimates. Low confidence.{" "}
            {song.analysis.key ? `${song.analysis.key}.` : "This key is unknown."}
            {song.analysis.bpm !== null &&
              ` ${song.analysis.bpm.toFixed(1)} BPM.`}
          </p>
          <p className="text-2xl font-semibold">
            {song.analysis.chord ? `This chord is ${song.analysis.chord}.` : "This chord is unknown."}
            <span className="ml-6 text-base font-normal">
              {song.analysis.next_chord ? `Next is ${song.analysis.next_chord}.` : "Next is unknown."}
            </span>
          </p>
          <p className="workspace-note">
            {song.analysis.beat === null
              ? "No analysed beat at this position."
              : `Beat ${song.analysis.beat} of ${song.analysis.beat_count}.`}
            Follows audio sent to the output; local analysis does not detect
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
          {song.state === "playing" ? "Pause the reference." : "Play the reference."}
        </Button>
        <Button
          disabled={locked}
          onClick={() => void useEngineStore.getState().transportStop()}
        >
          Stop the reference.
        </Button>
        <Button
          disabled={locked}
          onClick={() => void command("media_reference_unload")}
        >
          Return to the band.
        </Button>
        <label className="room-tool-field">
          This is the reference volume.
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
        aria-label="Practice the speed and key."
        onSubmit={(e) => {
          e.preventDefault();
          void practice(speed / 100, semitones);
        }}
      >
        <h3 className="font-semibold">Practice the speed and key.</h3>
        <p className="workspace-note">
          Playing at {Math.round((song.speed ?? 1) * 100)}% and{" "}
          {(song.semitones ?? 0) > 0 ? "+" : ""}
          {song.semitones ?? 0} semitones. Changes process each track locally
          during playback; guitar DI stays unchanged.
        </p>
        <div className="workspace-actions">
          <label className="room-tool-field">
            Reference speed is {Math.round(speed)}%.
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
            Reference transpose is in semitones.
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
            {processing ? "Applying…" : "Apply and save the speed and key."}
          </Button>
          <Button
            type="button"
            disabled={locked}
            onClick={() => void practice(1, 0)}
          >
            Reset to 100% and the original key.
          </Button>
        </div>
        <p className="workspace-note">
          Position and loop bounds remain in original source time. Chord/key
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
        className="workspace-stack"
        aria-label="Build up the speed."
        onSubmit={(e) => {
          e.preventDefault();
          void applyReferenceRamp(song.asset_id, rampDraft.config).catch(
            (error) => useEngineStore.getState().notify("error", String(error)),
          );
        }}
      >
        <h3 className="font-semibold">Build up the speed.</h3>
        <p className="workspace-note">
          Increase after complete confirmed bars, including repeated sections.
          Choose a section loop first. This changes every reference track
          together; guitar DI stays unchanged.
        </p>
        <div className="workspace-actions">
          {(
            [
              ["startPercent", "Start speed is in percent.", 50, 149],
              ["stepPercent", "Increase is in percentage points.", 1, 50],
              ["targetPercent", "Target speed is in percent.", 51, 150],
              ["barsPerStep", "Use this many complete bars per step.", 1, 64],
            ] as const
          ).map(([field, label, min, max]) => (
            <label key={field} className="room-tool-field">
              {label}
              <input
                type="number"
                min={min}
                max={max}
                step={1}
                required
                disabled={locked}
                value={rampDraft.config[field]}
                onChange={(e) =>
                  useReferenceRamp.setState({
                    config: {
                      ...rampDraft.config,
                      [field]: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          ))}
          <Button type="submit" disabled={locked || !song.grid}>
            Start the ramp.
          </Button>
          <Button
            type="button"
            disabled={locked || !song.grid}
            onClick={() =>
              void applyReferenceRamp(song.asset_id, null).catch((error) =>
                useEngineStore.getState().notify("error", String(error)),
              )
            }
          >
            Stop ramp. Hold speed.
          </Button>
        </div>
        <output className="workspace-note">
          {song.ramp
            ? `${song.ramp.speed_percent}% is ${song.state === "playing" ? "heard" : "set"}. ${song.ramp.completed_bars} bars are complete. ${song.ramp.active ? "This ramp is armed." : "This target is reached."}`
            : "This ramp is off, or waiting for updated output."}
        </output>
        <p className="workspace-note">
          {!song.grid && "Confirm bars in Songs, then reload this reference. "}
          Pause preserves progress. Stop returns to the start speed; Stop ramp
          holds the current speed. Seek, loop changes and manual speed/key
          changes cancel the ramp. Q or a learned Ramp pedal toggles these
          session settings. Loading a song never starts a ramp; this does not
          change its saved speed. Arm before recording.
        </p>
      </form>
      <form
        className="workspace-actions"
        onSubmit={(e) => {
          e.preventDefault();
          void command("media_reference_seek", { seconds: Number(seek) });
        }}
      >
        <label className="room-tool-field">
          Seek to a time in seconds.
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
          Loop start is in seconds.
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
          Loop end is in seconds.
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
          Loop this range.
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
          Loop off.
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
