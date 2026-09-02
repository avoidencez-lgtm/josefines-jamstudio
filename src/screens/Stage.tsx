import type React from "react";
import { useEffect, useState } from "react";
import { BigReadout } from "../components/BigReadout";
import { Button } from "../components/Button";
import { Meter } from "../components/Meter";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { Toggle } from "../components/Toggle";
import { useEngineStore } from "../store/engine";

const PRESET_CHARTS = [
  { id: "blues-12-bar", label: "12-Bar Blues (Standard)" },
  { id: "blues-quick-change", label: "12-Bar Blues (Quick Change)" },
  { id: "blues-8-bar", label: "8-Bar Blues" },
  { id: "blues-minor", label: "Minor Blues in Am" },
  { id: "i-v-vi-iv", label: "I - V - vi - IV Pop" },
  { id: "ii-v-i", label: "ii - V - I Jazz Turnaround" },
  { id: "rock-16-bar", label: "16-Bar Rock Anthem" },
  { id: "one-chord-vamp", label: "One-Chord Groove Vamp" },
];

const PRESET_STYLES = [
  { id: "blues-shuffle", label: "Blues Shuffle" },
  { id: "rock-straight", label: "Rock Straight 8th" },
  { id: "funk-16", label: "Funk 16th Groove" },
  { id: "jazz-swing", label: "Jazz Swing" },
  { id: "ballad-68", label: "Slow 6/8 Ballad" },
  { id: "metal-gallop", label: "Heavy Metal Gallop" },
];

export const Stage: React.FC = () => {
  const [showShortcuts, setShowShortcuts] = useState(false);

  const {
    tunerOn,
    toneOn,
    clickVolume,
    telemetry,
    setTone,
    setTuner,
    setClickVolume,
    transportPlay,
    transportPause,
    transportStop,
    transportSetLoop,
    transportSetCountIn,
    transportSetTempo,
    bandSetStyle,
    bandSetIntensity,
    bandCue,
    bandLoadChart,
    togglePart,
    toggleFollowEnergy,
  } = useEngineStore();

  const tunerData = telemetry.tuner;
  const transport = telemetry.transport;
  const band = telemetry.band;
  const isCountingIn = transport.state === "counting_in";

  // Global Keyboard shortcuts per M1d
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (
            transport.state === "playing" ||
            transport.state === "counting_in"
          ) {
            transportPause();
          } else {
            transportPlay();
          }
          break;
        case "Enter":
          e.preventDefault();
          transportStop();
          break;
        case "l":
        case "L":
          e.preventDefault();
          transportSetLoop(
            transport.loop_start_bar,
            transport.loop_end_bar,
            !transport.loop_enabled,
          );
          break;
        case "c":
        case "C":
          e.preventDefault();
          transportSetCountIn(transport.count_in_bars > 0 ? 0 : 1);
          break;
        case "f":
        case "F":
          e.preventDefault();
          bandCue("fill");
          break;
        case "k":
        case "K":
          e.preventDefault();
          bandCue("crash");
          break;
        case "s":
        case "S":
          e.preventDefault();
          bandCue("stop");
          break;
        case "e":
        case "E":
          e.preventDefault();
          bandCue("ending");
          break;
        case "m":
        case "M":
          e.preventDefault();
          togglePart("drums");
          break;
        case "b":
        case "B":
          e.preventDefault();
          togglePart("bass");
          break;
        case "p":
        case "P":
          e.preventDefault();
          togglePart("comp");
          break;
        case "ArrowUp":
          e.preventDefault();
          bandSetIntensity(band.intensity + 0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          bandSetIntensity(band.intensity - 0.05);
          break;
        case "ArrowLeft":
          e.preventDefault();
          transportSetTempo(transport.bpm - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          transportSetTempo(transport.bpm + 1);
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((prev) => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    transport,
    band,
    transportPlay,
    transportPause,
    transportStop,
    transportSetLoop,
    transportSetCountIn,
    transportSetTempo,
    bandSetIntensity,
    bandCue,
    togglePart,
  ]);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Configuration row: Chart, Style, Intensity, Click, Tuner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider">
              Source
            </span>
            <StatusPill status="live" label="Jam Band" />
          </div>

          <div className="h-4 w-px bg-[var(--line)]" />

          {/* Chart selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
              Chart
            </span>
            <select
              defaultValue="blues-12-bar"
              onChange={(e) => bandLoadChart(e.target.value)}
              className="bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-2 py-1 rounded text-xs font-mono cursor-pointer"
            >
              {PRESET_CHARTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
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
              {PRESET_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
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
              className="w-20 accent-[var(--accent)] cursor-pointer"
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
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowShortcuts(true)}
          >
            ?
          </Button>
        </div>
      </div>

      {/* Live Steering Row: Parts Muting, Energy Following, Cues, Next-Bar Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] px-4 py-2.5 rounded-[var(--radius-m)] border border-[var(--line)]">
        {/* Parts Muting */}
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider mr-1">
            Parts
          </span>
          <Button
            size="sm"
            variant={band.mute_drums ? "secondary" : "primary"}
            onClick={() => togglePart("drums")}
          >
            {band.mute_drums ? "Drums [Muted]" : "Drums"}
          </Button>
          <Button
            size="sm"
            variant={band.mute_bass ? "secondary" : "primary"}
            onClick={() => togglePart("bass")}
          >
            {band.mute_bass ? "Bass [Muted]" : "Bass"}
          </Button>
          <Button
            size="sm"
            variant={band.mute_comp ? "secondary" : "primary"}
            onClick={() => togglePart("comp")}
          >
            {band.mute_comp ? "Comp [Muted]" : "Comp"}
          </Button>
        </div>

        <div className="h-4 w-px bg-[var(--line)]" />

        {/* Energy Following */}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant={band.follow_energy ? "primary" : "secondary"}
            onClick={toggleFollowEnergy}
          >
            {band.follow_energy
              ? "Energy Following: ON"
              : "Energy Following: OFF"}
          </Button>
          {band.follow_energy && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-mono text-[var(--fg-2)]">
                DI Dynamics
              </span>
              <div className="w-16 h-2 bg-[var(--bg-2)] rounded overflow-hidden border border-[var(--line)]">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-150"
                  style={{ width: `${Math.round(band.current_energy * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-[var(--line)]" />

        {/* Cues Bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider mr-1">
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

        {/* At Next Bar Indicator Badge */}
        {(band.pending_cue !== "none" || band.pending_style_id != null) && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-mono text-[var(--accent)] animate-pulse bg-[var(--bg-2)] px-2 py-0.5 rounded border border-[var(--accent)]">
              Next bar:{" "}
              <strong className="uppercase">
                {band.pending_cue !== "none"
                  ? band.pending_cue
                  : band.pending_style_id}
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* Main stage readouts: Chord Now/Next & Tuner/Tempo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chord Now & Next readout */}
        <Panel className="flex flex-col items-center justify-center min-h-[260px]">
          {isCountingIn ? (
            <BigReadout
              value={`${transport.bar} : ${transport.beat}`}
              label="Count-In (Get Ready)"
              highlight={true}
            />
          ) : (
            <BigReadout
              value={band.current_chord || "A7"}
              subValue={band.next_chord ? `Next: ${band.next_chord}` : ""}
              label="Active Chord"
              highlight={true}
            />
          )}
        </Panel>

        {/* Guitar Tuner or Tempo */}
        <Panel className="flex flex-col items-center justify-center min-h-[260px]">
          {tunerOn ? (
            <BigReadout
              value={tunerData?.note ?? "--"}
              label="Guitar Tuner (DI Input)"
              cents={tunerData?.cents}
              subValue={tunerData ? `${tunerData.hz.toFixed(1)} Hz` : ""}
              highlight={tunerData ? Math.abs(tunerData.cents) < 5 : false}
            />
          ) : (
            <>
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
            </>
          )}
        </Panel>
      </div>

      {/* Realtime Signal Telemetry */}
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

      {/* Shortcuts Help Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--radius-l)] max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
                Keyboard Shortcuts
              </h2>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowShortcuts(false)}
              >
                ✕
              </Button>
            </div>
            <div className="space-y-2 text-xs font-mono text-[var(--fg-1)]">
              <div className="flex justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--fg-0)]">Space</span>
                <span>Play / Pause</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--fg-0)]">Enter</span>
                <span>Stop</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--fg-0)]">L</span>
                <span>Toggle Loop</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--fg-0)]">C</span>
                <span>Toggle Count-In</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--fg-0)]">F / K / S / E</span>
                <span>Cue: Fill / Crash / Stop / End</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--fg-0)]">M / B / P</span>
                <span>Mute: Drums / Bass / Comp</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--fg-0)]">↑ / ↓</span>
                <span>Intensity ±5%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--line)]">
                <span className="text-[var(--fg-0)]">← / →</span>
                <span>Tempo ±1 BPM</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--fg-0)]">?</span>
                <span>Toggle this help</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
