import type React from "react";
import { BigReadout } from "../components/BigReadout";
import { Button } from "../components/Button";
import { Meter } from "../components/Meter";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { Toggle } from "../components/Toggle";
import { useEngineStore } from "../store/engine";

export const Stage: React.FC = () => {
  const {
    tunerOn,
    toneOn,
    clickVolume,
    telemetry,
    setTone,
    setTuner,
    setClickVolume,
    transportSetTempo,
    bandSetStyle,
    bandSetIntensity,
    bandCue,
  } = useEngineStore();

  const tunerData = telemetry.tuner;
  const transport = telemetry.transport;
  const band = telemetry.band;
  const isCountingIn = transport.state === "counting_in";

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Top configuration row: Source, Style, Intensity, Click, Tuner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider">
              Source
            </span>
            <StatusPill status="live" label="Jam Band" />
          </div>

          <div className="h-4 w-px bg-[var(--line)]" />

          {/* Style selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
              Style
            </span>
            <select
              value={band.style_id}
              onChange={(e) => bandSetStyle(e.target.value)}
              className="bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-2 py-1 rounded text-xs font-mono cursor-pointer"
            >
              <option value="blues-shuffle">Blues Shuffle</option>
              <option value="rock-straight">Rock Straight 8th</option>
            </select>
          </div>

          <div className="h-4 w-px bg-[var(--line)]" />

          {/* Intensity control */}
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
              Intensity
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={band.intensity}
              onChange={(e) =>
                bandSetIntensity(Number.parseFloat(e.target.value))
              }
              className="w-24 accent-[var(--accent)] cursor-pointer"
            />
            <span className="text-xs font-mono tabular-nums text-[var(--fg-1)]">
              {(band.intensity * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
              Click
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={clickVolume}
              onChange={(e) =>
                setClickVolume(Number.parseFloat(e.target.value))
              }
              className="w-16 accent-[var(--accent)] cursor-pointer"
            />
          </div>
          <Toggle checked={tunerOn} onChange={setTuner} label="Tuner" />
          <Toggle
            checked={toneOn}
            onChange={(c) => setTone(c, 440)}
            label="Tone"
          />
        </div>
      </div>

      {/* Cues Bar: Fill, Crash, Stop, Ending */}
      <div className="flex items-center justify-between bg-[var(--bg-1)] px-4 py-2.5 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider mr-2">
            Cues
          </span>
          <Button
            size="sm"
            variant={
              band.pending_cue === "fill" || band.active_cue === "fill"
                ? "primary"
                : "secondary"
            }
            onClick={() => bandCue("fill")}
          >
            Fill
          </Button>
          <Button
            size="sm"
            variant={
              band.pending_cue === "crash" || band.active_cue === "crash"
                ? "primary"
                : "secondary"
            }
            onClick={() => bandCue("crash")}
          >
            Crash
          </Button>
          <Button
            size="sm"
            variant={
              band.pending_cue === "stop" || band.active_cue === "stop"
                ? "danger"
                : "secondary"
            }
            onClick={() => bandCue("stop")}
          >
            Stop
          </Button>
          <Button
            size="sm"
            variant={
              band.pending_cue === "ending" || band.active_cue === "ending"
                ? "primary"
                : "secondary"
            }
            onClick={() => bandCue("ending")}
          >
            Ending
          </Button>
        </div>

        {band.pending_cue !== "none" && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[var(--accent)] animate-pulse">
              Next bar cue:{" "}
              <strong className="uppercase">{band.pending_cue}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Main stage readouts: Tuner / Count-In / Tempo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Panel className="flex flex-col items-center justify-center min-h-[260px]">
          {isCountingIn ? (
            <BigReadout
              value={`${transport.bar} : ${transport.beat}`}
              label="Count-In (Get Ready)"
              highlight={true}
            />
          ) : tunerOn ? (
            <BigReadout
              value={tunerData?.note ?? "--"}
              label="Guitar Tuner (DI Input)"
              cents={tunerData?.cents}
              subValue={tunerData ? `${tunerData.hz.toFixed(1)} Hz` : ""}
              highlight={tunerData ? Math.abs(tunerData.cents) < 5 : false}
            />
          ) : (
            <div className="text-[var(--fg-2)] font-mono text-sm">
              Tuner Muted
            </div>
          )}
        </Panel>

        <Panel className="flex flex-col items-center justify-center min-h-[260px]">
          <BigReadout
            value={`${transport.bpm.toFixed(0)}`}
            subValue="BPM"
            label="Tempo"
          />
          <div className="flex items-center gap-2 mt-4">
            <Button
              size="sm"
              onClick={() => transportSetTempo(transport.bpm - 5)}
            >
              -5
            </Button>
            <Button
              size="sm"
              onClick={() => transportSetTempo(transport.bpm - 1)}
            >
              -1
            </Button>
            <Button
              size="sm"
              onClick={() => transportSetTempo(transport.bpm + 1)}
            >
              +1
            </Button>
            <Button
              size="sm"
              onClick={() => transportSetTempo(transport.bpm + 5)}
            >
              +5
            </Button>
          </div>
        </Panel>
      </div>

      {/* Realtime Meters row */}
      <Panel title="Signal Telemetry">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <Meter
            label="Input (Guitar DI)"
            peakDb={telemetry.input_level.peak_db}
            rmsDb={telemetry.input_level.rms_db}
            width="w-full"
          />
          <Meter
            label="Master Output"
            peakDb={telemetry.output_level.peak_db}
            rmsDb={telemetry.output_level.rms_db}
            width="w-full"
          />
        </div>
      </Panel>
    </div>
  );
};
