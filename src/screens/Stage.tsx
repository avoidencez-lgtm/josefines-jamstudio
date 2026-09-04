import type React from "react";
import { useState } from "react";
import { BigReadout } from "../components/BigReadout";
import { Button } from "../components/Button";
import { ChordStrip } from "../components/ChordStrip";
import { Meter } from "../components/Meter";
import { Panel } from "../components/Panel";
import { SoloHelper } from "../components/SoloHelper";
import { StatusPill } from "../components/States";
import { Toggle } from "../components/Toggle";
import { WorkspaceHeader, WorkspaceViews } from "../components/Workspace";
import type { Chart } from "../ipc/contract";
import { keyName } from "../lib/chart/notes";
import { useEngineStore } from "../store/engine";

export function sectionPassages(chart: Chart | null) {
  let start = 1;
  return (chart?.arrangement ?? []).flatMap((a) => {
    const section = chart?.sections.find((s) => s.id === a.sectionId);
    if (!section) return [];
    // Transport loops use a one-based, exclusive end bar.
    const end = start + section.bars.length * a.repeats;
    const passage = { label: section.name, start, end };
    start = end;
    return [passage];
  });
}

export const Stage: React.FC = () => {
  const {
    tunerOn,
    toneOn,
    clickVolume,
    bandVolume,
    telemetry,
    styles,
    charts,
    currentChart,
    tempoTrainer,
    setTone,
    setTuner,
    setClickVolume,
    setBandVolume,
    transportSeekBar,
    transportSetLoop,
    transportSetTempo,
    tapTempo,
    setTempoTrainer,
    bandSetStyle,
    bandSetIntensity,
    bandCue,
    bandLoadChart,
    togglePart,
    toggleFollowEnergy,
    transposeCurrentChart,
  } = useEngineStore();

  const [view, setView] = useState("Perform");
  const [showSolo, setShowSolo] = useState(true);
  const [lastTap, setLastTap] = useState<number | null>(null);

  const tunerData = telemetry.tuner;
  const transport = telemetry.transport;
  const band = telemetry.band;
  const isCountingIn = transport.state === "counting_in";

  const currentStyle = styles.find((s) => s.id === band.style_id);
  const bpmRange = currentStyle?.feel.bpmRange;
  const outOfRange = bpmRange
    ? transport.bpm < bpmRange[0] || transport.bpm > bpmRange[1]
    : false;

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      <WorkspaceHeader
        screen="stage"
        title="Your band. Your lead."
        description="Steer the band live, loop a passage, or build up a difficult part."
      />
      <WorkspaceViews
        labels={["Perform", "Practice", "Levels"]}
        value={view}
        onChange={setView}
      />
      <details className="stage-setup">
        <summary>
          Chart & band settings{" "}
          <span>
            {currentChart?.name ?? "Choose a chart"} · {band.style_name}
          </span>
        </summary>
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

            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Chart
              </span>
              <select
                aria-label="Chart"
                value={currentChart?.id ?? ""}
                onChange={(e) => bandLoadChart(e.target.value)}
                className="bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-2 py-1 rounded text-xs font-mono cursor-pointer max-w-[220px]"
              >
                {charts.length === 0 && <option value="">Loading…</option>}
                {currentChart &&
                  !charts.some((c) => c.id === currentChart.id) && (
                    <option value={currentChart.id}>
                      {currentChart.name} (unsaved)
                    </option>
                  )}
                {charts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {currentChart && (
                <span className="text-[10px] font-mono text-[var(--fg-2)] whitespace-nowrap">
                  {keyName(currentChart.keyTonic, currentChart.mode)}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => transposeCurrentChart(-1)}
                title="Transpose down ([)"
              >
                ♭
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => transposeCurrentChart(1)}
                title="Transpose up (])"
              >
                ♯
              </Button>
            </div>

            <div className="h-4 w-px bg-[var(--line)]" />

            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Style
              </span>
              <select
                aria-label="Band style"
                value={band.pending_style_id ?? band.style_id}
                onChange={(e) => bandSetStyle(e.target.value)}
                className="bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-2 py-1 rounded text-xs font-mono cursor-pointer"
              >
                {styles.length === 0 && (
                  <option value={band.style_id}>{band.style_name}</option>
                )}
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="h-4 w-px bg-[var(--line)]" />

            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Intensity
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                aria-label="Band intensity"
                value={band.pending_intensity ?? band.intensity}
                onChange={(e) =>
                  bandSetIntensity(Number.parseFloat(e.target.value))
                }
                className="w-20 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-[var(--fg-1)]">
                {((band.pending_intensity ?? band.intensity) * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2" title="Band volume">
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Band
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                aria-label="Band volume"
                value={bandVolume}
                onChange={(e) =>
                  setBandVolume(Number.parseFloat(e.target.value))
                }
                className="w-16 accent-[var(--accent)] cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2" title="Click volume">
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Click
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                aria-label="Click volume"
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
      </details>
      <div hidden={view !== "Perform"} className="workspace-stack">
        {/* Main readouts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Panel className="flex flex-col items-center justify-center min-h-[180px]">
            {isCountingIn ? (
              <BigReadout
                value={`${transport.bar} : ${transport.beat}`}
                label="Count-In (Get Ready)"
                highlight
              />
            ) : (
              <BigReadout
                value={band.current_chord || "—"}
                subValue={band.next_chord ? `Next: ${band.next_chord}` : ""}
                label={
                  band.is_stopped
                    ? "Band stopped (S to resume)"
                    : "Active Chord"
                }
                highlight={!band.is_stopped}
              />
            )}
          </Panel>

          <Panel className="flex flex-col items-center justify-center min-h-[180px]">
            {tunerOn ? (
              <BigReadout
                value={tunerData?.note ?? "--"}
                label="Guitar Tuner (DI Input)"
                cents={tunerData?.cents}
                subValue={
                  tunerData
                    ? `${tunerData.hz.toFixed(1)} Hz`
                    : "play a single note"
                }
                highlight={tunerData ? Math.abs(tunerData.cents) < 5 : false}
              />
            ) : (
              <>
                <BigReadout
                  value={`${transport.bpm.toFixed(0)}`}
                  subValue="BPM"
                  label="Tempo"
                />
                {outOfRange && bpmRange && (
                  <span className="text-[10px] font-mono text-[var(--accent)] -mt-2">
                    {band.style_name} feels best at {Math.round(bpmRange[0])}–
                    {Math.round(bpmRange[1])} BPM
                  </span>
                )}
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
                    variant="primary"
                    onClick={async () => setLastTap(await tapTempo())}
                    title="Tap on the beat (T)"
                  >
                    Tap{lastTap ? ` ${lastTap}` : ""}
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

        {/* Live steering: parts, energy, cues */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] px-4 py-2.5 rounded-[var(--radius-m)] border border-[var(--line)]">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider mr-1">
              Parts
            </span>
            <Button
              size="sm"
              variant={band.mute_drums ? "secondary" : "primary"}
              onClick={() => togglePart("drums")}
              title="M"
            >
              {band.mute_drums ? "Drums [Muted]" : "Drums"}
            </Button>
            <Button
              size="sm"
              variant={band.mute_bass ? "secondary" : "primary"}
              onClick={() => togglePart("bass")}
              title="B"
            >
              {band.mute_bass ? "Bass [Muted]" : "Bass"}
            </Button>
            <Button
              size="sm"
              variant={band.mute_comp ? "secondary" : "primary"}
              onClick={() => togglePart("comp")}
              title="P"
            >
              {band.mute_comp ? "Comp [Muted]" : "Comp"}
            </Button>
          </div>

          <div className="h-4 w-px bg-[var(--line)]" />

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant={band.follow_energy ? "primary" : "secondary"}
              onClick={toggleFollowEnergy}
            >
              {band.follow_energy
                ? "Follows your playing: ON"
                : "Follows your playing: OFF"}
            </Button>
            {band.follow_energy && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-mono text-[var(--fg-2)]">
                  DI Dynamics
                </span>
                <div className="w-16 h-2 bg-[var(--bg-2)] rounded overflow-hidden border border-[var(--line)]">
                  <div
                    className="h-full bg-[var(--accent)] origin-left transition-transform duration-150"
                    style={{ transform: `scaleX(${band.current_energy})` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-[var(--line)]" />

          <div className="stage-cues flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider mr-1">
              Cues
            </span>
            <CueButton
              cue="fill"
              label="Fill"
              hint="F"
              band={band}
              onCue={bandCue}
            />
            <CueButton
              cue="crash"
              label="Crash"
              hint="K"
              band={band}
              onCue={bandCue}
            />
            <CueButton
              cue="stop"
              label={band.is_stopped ? "Resume" : "Stop"}
              hint="S"
              band={band}
              onCue={bandCue}
              danger
            />
            <CueButton
              cue="ending"
              label="Ending"
              hint="E"
              band={band}
              onCue={bandCue}
            />
          </div>

          {(band.pending_cue !== "none" ||
            band.pending_style_id != null ||
            band.pending_intensity != null) && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs font-mono text-[var(--accent)] animate-pulse bg-[var(--bg-2)] px-2 py-0.5 rounded border border-[var(--accent)]">
                Next bar:{" "}
                <strong className="uppercase">
                  {band.pending_cue !== "none"
                    ? band.pending_cue
                    : band.pending_style_id
                      ? (styles.find((s) => s.id === band.pending_style_id)
                          ?.name ?? band.pending_style_id)
                      : `intensity ${Math.round((band.pending_intensity ?? 0) * 100)}%`}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Chord strip: the whole form, current bar lit */}
        <Panel className="py-2 px-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-[10px] uppercase tracking-wider font-mono text-[var(--fg-2)]">
              Form{band.current_section ? ` · ${band.current_section}` : ""}
            </div>
            <div className="text-[10px] font-mono text-[var(--fg-2)]">
              click a bar to jump · shift-click to set the loop · 1–9 jump to
              bar
            </div>
          </div>
          <ChordStrip
            chart={currentChart}
            currentBar={isCountingIn ? 0 : transport.bar}
            barProgress={transport.bar_progress}
            loop={{
              enabled: transport.loop_enabled,
              startBar: transport.loop_start_bar,
              endBar: transport.loop_end_bar,
            }}
            onSeek={(bar) => transportSeekBar(bar)}
            onSetLoop={(a, b) => transportSetLoop(a, b, true)}
          />
        </Panel>
      </div>
      <section hidden={view !== "Practice"} className="workspace-stack">
        <div>
          <h2 className="text-lg mb-3">Rehearse a section</h2>
          <div className="stage-passages">
            {sectionPassages(currentChart).map((p) => (
              <button
                type="button"
                key={p.start}
                aria-pressed={
                  transport.loop_enabled &&
                  transport.loop_start_bar === p.start &&
                  transport.loop_end_bar === p.end
                }
                onClick={() => {
                  void transportSetLoop(p.start, p.end, true);
                  void transportSeekBar(p.start);
                }}
              >
                {p.label}
                <small>
                  Bars {p.start}–{p.end - 1}
                </small>
              </button>
            ))}
            <Button
              disabled={!transport.loop_enabled}
              onClick={() =>
                transportSetLoop(
                  transport.loop_start_bar,
                  transport.loop_end_bar,
                  false,
                )
              }
            >
              Exit loop
            </Button>
          </div>
        </div>
        {/* Practice: tempo trainer */}
        <Panel title="Tempo Trainer">
          <div className="flex flex-wrap items-center gap-4">
            <Toggle
              checked={tempoTrainer.enabled}
              onChange={(enabled) =>
                setTempoTrainer({ enabled, lastStepBar: 0 })
              }
              label={tempoTrainer.enabled ? "On" : "Off"}
            />
            <NumberField
              label="Start"
              value={tempoTrainer.startBpm}
              min={20}
              max={300}
              onChange={(v) => setTempoTrainer({ startBpm: v })}
              suffix="BPM"
            />
            <NumberField
              label="Target"
              value={tempoTrainer.targetBpm}
              min={20}
              max={300}
              onChange={(v) => setTempoTrainer({ targetBpm: v })}
              suffix="BPM"
            />
            <NumberField
              label="Step"
              value={tempoTrainer.stepBpm}
              min={1}
              max={20}
              onChange={(v) => setTempoTrainer({ stepBpm: v })}
              suffix="BPM"
            />
            <NumberField
              label="Every"
              value={tempoTrainer.everyBars}
              min={1}
              max={32}
              onChange={(v) => setTempoTrainer({ everyBars: v })}
              suffix="bars"
            />
            <span className="text-[10px] font-mono text-[var(--fg-2)] max-w-xs">
              Press play: the band starts at the start tempo and creeps toward
              the target. Loop a hard passage (shift-click two bars) to drill
              it.
            </span>
          </div>
        </Panel>

        {/* Soloing helper */}
        <div className="flex items-center justify-between -mb-3">
          <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider">
            Soloing Helper
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSolo((v) => !v)}
          >
            {showSolo ? "Hide" : "Show"}
          </Button>
        </div>
        {showSolo && (
          <SoloHelper
            chord={band.current_chord}
            nextChord={band.next_chord}
            keyTonic={currentChart?.keyTonic}
            mode={currentChart?.mode}
          />
        )}
      </section>
      <section hidden={view !== "Levels"}>
        {/* Meters */}
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
      </section>
    </div>
  );
};

const CueButton: React.FC<{
  cue: "fill" | "crash" | "stop" | "ending";
  label: string;
  hint: string;
  band: { pending_cue: string; active_cue: string };
  onCue: (cue: "fill" | "crash" | "stop" | "ending") => void;
  danger?: boolean;
}> = ({ cue, label, hint, band, onCue, danger }) => {
  const lit = band.pending_cue === cue || band.active_cue === cue;
  return (
    <Button
      size="sm"
      variant={lit ? (danger ? "danger" : "primary") : "secondary"}
      onClick={() => onCue(cue)}
      title={`${label} (${hint})`}
    >
      {label}
    </Button>
  );
};

const NumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, suffix, onChange }) => (
  <label className="flex items-center gap-1.5 text-xs font-mono text-[var(--fg-2)]">
    {label}
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const v = Number.parseInt(e.target.value, 10);
        if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
      }}
      className="w-16 bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-1.5 py-0.5 rounded text-xs font-mono tabular-nums"
    />
    {suffix && <span>{suffix}</span>}
  </label>
);
