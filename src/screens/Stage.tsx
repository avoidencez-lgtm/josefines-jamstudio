import type React from "react";
import { useEffect, useState } from "react";
import blues8 from "../../charts/blues-8-bar.json";
import blues12 from "../../charts/blues-12-bar.json";
import bluesMinor from "../../charts/blues-minor.json";
import bluesQuick from "../../charts/blues-quick-change.json";
import popProg from "../../charts/i-v-vi-iv.json";
import jazzTurn from "../../charts/ii-v-i.json";
import vamp from "../../charts/one-chord-vamp.json";
import rock16 from "../../charts/rock-16-bar.json";
import { Button } from "../components/Button";
import { ChartStrip } from "../components/ChartStrip";
import { Meter } from "../components/Meter";
import { Toggle } from "../components/Toggle";
import { useEngineStore } from "../store/engine";

const PRESET_CHARTS = [
  { id: "blues-12-bar", label: "12-Bar Blues" },
  { id: "blues-quick-change", label: "Quick Change" },
  { id: "blues-8-bar", label: "8-Bar Blues" },
  { id: "blues-minor", label: "Minor Blues" },
  { id: "i-v-vi-iv", label: "I V vi IV" },
  { id: "ii-v-i", label: "ii V I" },
  { id: "rock-16-bar", label: "16-Bar Rock" },
  { id: "one-chord-vamp", label: "One-Chord Vamp" },
];

const PRESET_STYLES = [
  { id: "blues-shuffle", label: "Blues Shuffle" },
  { id: "rock-straight", label: "Rock Straight" },
  { id: "funk-16", label: "Funk 16th" },
  { id: "jazz-swing", label: "Jazz Swing" },
  { id: "ballad-68", label: "6/8 Ballad" },
  { id: "metal-gallop", label: "Metal Gallop" },
];

function barsOf(chart: {
  sections: { bars: { chord: string }[][] }[];
}): string[] {
  return chart.sections[0]?.bars.map((b) => b[0]?.chord ?? "") ?? [];
}

const CHART_BARS: Record<string, string[]> = {
  "blues-12-bar": barsOf(blues12),
  "blues-quick-change": barsOf(bluesQuick),
  "blues-8-bar": barsOf(blues8),
  "blues-minor": barsOf(bluesMinor),
  "i-v-vi-iv": barsOf(popProg),
  "ii-v-i": barsOf(jazzTurn),
  "rock-16-bar": barsOf(rock16),
  "one-chord-vamp": barsOf(vamp),
};

function splitChord(chord: string): { root: string; quality: string } {
  const m = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return { root: chord, quality: "" };
  return { root: m[1], quality: m[2] };
}

const selectClass =
  "bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-2 py-1.5 rounded-[var(--radius-m)] text-sm font-mono cursor-pointer min-h-8";

export const Stage: React.FC = () => {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [chartId, setChartId] = useState("blues-12-bar");

  const {
    tunerOn,
    telemetry,
    setTuner,
    transportSeekBar,
    transportSetTempo,
    bandSetStyle,
    bandSetIntensity,
    bandCue,
    bandLoadChart,
    togglePart,
    toggleFollowEnergy,
    activeSource,
    setActiveSource,
    setScreen,
    currentSong,
    songSpeed,
    songTranspose,
    stemSettings,
    setSongSpeed,
    setSongTranspose,
    updateStemSettings,
    keysPresent,
  } = useEngineStore();

  const tunerData = telemetry.tuner;
  const transport = telemetry.transport;
  const band = telemetry.band;
  const isCountingIn = transport.state === "counting_in";
  const bars = CHART_BARS[chartId] ?? CHART_BARS["blues-12-bar"];
  const now = splitChord(band.current_chord || "A7");
  const next = band.next_chord || "";
  const pending =
    band.pending_cue !== "none"
      ? band.pending_cue
      : (band.pending_style_id ?? null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
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
    band,
    transport.bpm,
    bandSetIntensity,
    bandCue,
    togglePart,
    transportSetTempo,
  ]);

  const sourceBtn = (id: "band" | "song" | "lyria", label: string) => {
    const active = activeSource === id;
    return (
      <button
        type="button"
        onClick={() => setActiveSource(id)}
        className={`min-h-8 px-3 rounded-[var(--radius-m)] text-sm cursor-pointer border ${
          active
            ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
            : "bg-transparent border-[var(--line)] text-[var(--fg-1)] hover:bg-[var(--bg-2)]"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-8 max-w-[1400px] mx-auto w-full h-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--fg-2)] mr-1">Source</span>
          {sourceBtn("band", "Band")}
          {sourceBtn("song", "Song")}
          {sourceBtn("lyria", "Lyria")}
        </div>
        {activeSource === "band" && (
          <div className="flex items-center gap-3">
            <select
              value={chartId}
              onChange={(e) => {
                setChartId(e.target.value);
                bandLoadChart(e.target.value);
              }}
              className={selectClass}
              aria-label="Chart"
            >
              {PRESET_CHARTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={band.style_id}
              onChange={(e) => bandSetStyle(e.target.value)}
              className={selectClass}
              aria-label="Style"
            >
              {PRESET_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-end gap-12 min-h-[160px]">
        <div className="leading-none">
          {isCountingIn ? (
            <span
              className="font-semibold tabular-nums text-[var(--accent)]"
              style={{
                fontSize: "clamp(96px, 12vw, 144px)",
                opacity: transport.beat % 2 === 0 ? 1 : 0.45,
              }}
            >
              {transport.beat}
            </span>
          ) : (
            <span
              className="font-semibold tabular-nums tracking-tight text-[var(--fg-0)]"
              style={{ fontSize: "clamp(96px, 12vw, 144px)" }}
            >
              {now.root}
              {now.quality && (
                <span
                  className="text-[var(--fg-1)]"
                  style={{ fontSize: "0.45em" }}
                >
                  {now.quality}
                </span>
              )}
            </span>
          )}
        </div>
        {next && !isCountingIn && (
          <div className="pb-3" aria-live="polite">
            <div className="text-sm text-[var(--fg-2)] mb-1">next</div>
            <div
              className="font-medium tabular-nums text-[var(--fg-1)]"
              style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1 }}
            >
              {next}
            </div>
          </div>
        )}
        {pending && (
          <div className="pb-4 px-3 py-1 rounded-full border border-[var(--accent)] text-[var(--accent)] text-sm font-mono">
            at next bar {pending}
          </div>
        )}
      </div>

      {activeSource === "band" && (
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-[var(--fg-1)]">
            Intensity
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={band.intensity}
              onChange={(e) =>
                bandSetIntensity(Number.parseFloat(e.target.value))
              }
              className="w-28 accent-[var(--accent)] cursor-pointer"
            />
            <span className="font-mono tabular-nums text-[var(--fg-0)] w-10">
              {Math.round(band.intensity * 100)}
            </span>
          </label>
          <Toggle
            checked={!band.mute_drums}
            onChange={() => togglePart("drums")}
            label="Drums"
          />
          <Toggle
            checked={!band.mute_bass}
            onChange={() => togglePart("bass")}
            label="Bass"
          />
          <Toggle
            checked={!band.mute_comp}
            onChange={() => togglePart("comp")}
            label="Comp"
          />
          <Toggle
            checked={band.follow_energy}
            onChange={() => toggleFollowEnergy()}
            label="Follow"
          />
          <div className="flex items-center gap-2 ml-auto">
            {(["fill", "crash", "stop", "ending"] as const).map((cue) => (
              <Button
                key={cue}
                size="sm"
                variant={
                  band.pending_cue === cue || band.active_cue === cue
                    ? cue === "stop"
                      ? "danger"
                      : "primary"
                    : "secondary"
                }
                onClick={() => bandCue(cue)}
                className="min-h-8 capitalize"
              >
                {cue}
              </Button>
            ))}
          </div>
        </div>
      )}

      {activeSource === "song" &&
        (currentSong ? (
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-[var(--fg-1)]">
              Speed
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={songSpeed}
                onChange={(e) =>
                  setSongSpeed(Number.parseFloat(e.target.value))
                }
                className="w-28 accent-[var(--accent)] cursor-pointer"
              />
              <span className="font-mono tabular-nums">
                {Math.round(songSpeed * 100)}%
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--fg-1)]">
              Transpose
              <input
                type="range"
                min={-6}
                max={6}
                step={1}
                value={songTranspose}
                onChange={(e) =>
                  setSongTranspose(Number.parseInt(e.target.value, 10))
                }
                className="w-28 accent-[var(--accent)] cursor-pointer"
              />
              <span className="font-mono tabular-nums">
                {songTranspose > 0 ? `+${songTranspose}` : songTranspose}
              </span>
            </label>
            {(
              [
                ["vocalsMute", "Vocals"],
                ["drumsMute", "Drums"],
                ["bassMute", "Bass"],
                ["otherMute", "Other"],
              ] as const
            ).map(([key, label]) => (
              <Toggle
                key={key}
                checked={!stemSettings[key]}
                onChange={() =>
                  updateStemSettings({ [key]: !stemSettings[key] })
                }
                label={label}
              />
            ))}
          </div>
        ) : (
          <div className="text-[var(--fg-1)] text-sm">
            Drop an audio file in Songs.{" "}
            <button
              type="button"
              className="text-[var(--accent)] cursor-pointer underline"
              onClick={() => setScreen("songs")}
            >
              Open Songs
            </button>
          </div>
        ))}

      {activeSource === "lyria" && (
        <p className="text-sm text-[var(--fg-1)]">
          {keysPresent.gemini
            ? "Lyria RealTime is not wired yet. The offline generator in AI Music is the stand-in."
            : "Lyria needs a Gemini key in Settings. Until then the band stays on this Stage."}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-8">
        <Meter
          label="Guitar"
          peakDb={telemetry.input_level.peak_db}
          rmsDb={telemetry.input_level.rms_db}
        />
        <Meter
          label="Band"
          peakDb={telemetry.output_level.peak_db}
          rmsDb={telemetry.output_level.rms_db}
        />
        <div className="flex items-baseline gap-3 font-mono tabular-nums">
          <Toggle checked={tunerOn} onChange={setTuner} label="Tuner" />
          {tunerOn && (
            <>
              <span className="text-[48px] font-medium leading-none text-[var(--fg-0)]">
                {tunerData?.note ?? "--"}
              </span>
              <span
                className={`text-sm ${
                  tunerData && Math.abs(tunerData.cents) < 5
                    ? "text-[var(--ok)]"
                    : "text-[var(--fg-1)]"
                }`}
              >
                {tunerData
                  ? `${tunerData.cents > 0 ? "+" : ""}${tunerData.cents.toFixed(0)} c`
                  : ""}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowShortcuts(true)}
          className="ml-auto min-h-8 px-3 text-sm text-[var(--fg-2)] hover:text-[var(--fg-0)] cursor-pointer"
          aria-label="Keyboard shortcuts"
        >
          ?
        </button>
      </div>

      {activeSource === "band" && (
        <ChartStrip
          bars={bars}
          currentBar={transport.bar}
          loopEnabled={transport.loop_enabled}
          loopStart={transport.loop_start_bar}
          loopEnd={transport.loop_end_bar}
          onSeek={transportSeekBar}
        />
      )}

      {showShortcuts && (
        <div className="fixed inset-0 bg-[var(--bg-0)]/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--radius-l)] max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-[var(--fg-0)]">
                Shortcuts
              </h2>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowShortcuts(false)}
              >
                Close
              </Button>
            </div>
            <div className="space-y-2 text-sm font-mono text-[var(--fg-1)]">
              {[
                ["Space", "Play / Pause"],
                ["Enter", "Stop"],
                ["R", "Record"],
                ["L", "Loop"],
                ["C", "Count-in"],
                ["T", "Talk to Jo"],
                ["F K S E", "Fill / Crash / Stop / End"],
                ["M B P", "Drums / Bass / Comp"],
                ["Up / Down", "Intensity"],
                ["Left / Right", "Tempo"],
              ].map(([key, action]) => (
                <div
                  key={key}
                  className="flex justify-between py-1 border-b border-[var(--line)]"
                >
                  <span className="text-[var(--fg-0)]">{key}</span>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
