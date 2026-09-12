import type React from "react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { BigReadout } from "../components/BigReadout";
import { Button } from "../components/Button";
import { ChordShapes } from "../components/ChordShapes";
import { ChordStrip } from "../components/ChordStrip";
import { JoStage } from "../components/JoStage";
import { Meter } from "../components/Meter";
import { Panel } from "../components/Panel";
import { ReferencePlayer } from "../components/ReferencePlayer";
import { SoloHelper } from "../components/SoloHelper";
import { StatusPill } from "../components/States";
import { Toggle } from "../components/Toggle";
import { WorkspaceHeader, WorkspaceViews } from "../components/Workspace";
import { ipc } from "../ipc/client";
import type { PackStatus } from "../ipc/contract";
import { keyName } from "../lib/chart/notes";
import { sectionPassages } from "../lib/chart/passages";
import {
  lastMeterFps,
  lastPlayheadFps,
  transportClockLive,
} from "../lib/meterFps";
import { committedNumber } from "../lib/numberField";
import { openSettings } from "../lib/settingsView";
import { stylesInMeter } from "../lib/styles";
import { useEngineStore } from "../store/engine";

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
    activeSource,
    lyriaStatus,
    lyriaStart,
    lyriaStop,
    engineStatus,
  } = useEngineStore(
    useShallow((s) => ({
      tunerOn: s.tunerOn,
      toneOn: s.toneOn,
      clickVolume: s.clickVolume,
      bandVolume: s.bandVolume,
      telemetry: s.telemetry,
      styles: s.styles,
      charts: s.charts,
      currentChart: s.currentChart,
      tempoTrainer: s.tempoTrainer,
      setTone: s.setTone,
      setTuner: s.setTuner,
      setClickVolume: s.setClickVolume,
      setBandVolume: s.setBandVolume,
      transportSeekBar: s.transportSeekBar,
      transportSetLoop: s.transportSetLoop,
      transportSetTempo: s.transportSetTempo,
      tapTempo: s.tapTempo,
      setTempoTrainer: s.setTempoTrainer,
      bandSetStyle: s.bandSetStyle,
      bandSetIntensity: s.bandSetIntensity,
      bandCue: s.bandCue,
      bandLoadChart: s.bandLoadChart,
      togglePart: s.togglePart,
      toggleFollowEnergy: s.toggleFollowEnergy,
      transposeCurrentChart: s.transposeCurrentChart,
      activeSource: s.activeSource,
      lyriaStatus: s.lyriaStatus,
      lyriaStart: s.lyriaStart,
      lyriaStop: s.lyriaStop,
      engineStatus: s.engineStatus,
    })),
  );

  const [view, setView] = useState("This is Perform.");
  const [showSolo, setShowSolo] = useState(true);
  const [lastTap, setLastTap] = useState<number | null>(null);
  const [packNote, setPackNote] = useState<string | null>(null);

  useEffect(() => {
    void ipc
      .invoke<PackStatus[]>("assets_status")
      .then((packs) => {
        const missing = packs.find((pack) => pack.state === "missing");
        if (missing) setPackNote(missing.message);
      })
      .catch((e) => useEngineStore.getState().notify("error", String(e)));
  }, []);
  useEffect(() => {
    let cancelled = false;
    let liveSince: number | null = null;
    const id = window.setInterval(() => {
      if (cancelled) return;
      const live = transportClockLive(
        useEngineStore.getState().telemetry.transport.state,
      );
      if (!live) {
        liveSince = null;
        return;
      }
      if (liveSince === null) liveSince = performance.now();
      if (performance.now() - liveSince < 1200) return;
      const meter = lastMeterFps();
      const playhead = lastPlayheadFps();
      void ipc
        .invoke("diagnostics_report_fps", { meter, playhead })
        .catch(() => undefined);
      if (
        (meter > 0 && playhead > 0) ||
        performance.now() - liveSince > 15_000
      ) {
        window.clearInterval(id);
      }
    }, 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const tunerData = telemetry.tuner;
  const transport = telemetry.transport;
  const band = telemetry.band;
  const grooves = stylesInMeter(
    styles,
    transport.time_signature,
    band.pending_style_id ?? band.style_id,
  );
  const isCountingIn = transport.state === "counting_in";
  const clockLive = transportClockLive(transport.state);

  const currentStyle = styles.find((s) => s.id === band.style_id);
  const bpmRange = currentStyle?.feel.bpmRange;
  const outOfRange = bpmRange
    ? transport.bpm < bpmRange[0] || transport.bpm > bpmRange[1]
    : false;

  if (telemetry.reference)
    return (
      <div className="workspace-stack max-w-6xl mx-auto w-full">
        <WorkspaceHeader
          screen="stage"
          title="Play alongside your song."
          description="Rehearse through your studio output with the reference speed, key and mix you choose."
        />
        <JoStage />
        <ReferencePlayer
          key={telemetry.reference.asset_id}
          song={telemetry.reference}
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      <WorkspaceHeader
        screen="stage"
        title="Your band. Your lead."
        description="Steer the band live, loop a passage, or build up a difficult part."
      />
      <JoStage />
      {packNote && (
        <div className="text-xs font-mono text-[var(--fg-2)] border border-[var(--line)] rounded-[var(--radius-m)] p-3 workspace-stack">
          <p>
            {packNote} Sample packs are missing. Settings → This is First run.
            has the next step.
          </p>
          <Button size="sm" onClick={() => openSettings("This is First run.")}>
            Open this First run.
          </Button>
        </div>
      )}
      {engineStatus?.last_error && (
        <div
          role="alert"
          className="text-xs font-mono text-[var(--record)] border border-[var(--record)] rounded-[var(--radius-m)] p-3 workspace-stack"
        >
          <p>
            Audio device lost. {engineStatus.last_error} Reconnect or pick
            another device in Settings.
          </p>
          <Button size="sm" onClick={() => openSettings("This is Audio devices.")}>
            Open these audio devices.
          </Button>
        </div>
      )}
      {!currentChart && activeSource !== "lyria" && (
        <div className="workspace-stack">
          <p className="workspace-note">
            Pick a chart or a song. Or hold PTT and tell Jo. Live PTT is not
            configured.
          </p>
          <div className="workspace-actions">
            <Button
              size="sm"
              onClick={() => useEngineStore.getState().setScreen("library")}
            >
              Go to this Library.
            </Button>
            <Button
              size="sm"
              onClick={() => useEngineStore.getState().setScreen("songs")}
            >
              Open these Songs.
            </Button>
          </div>
        </div>
      )}
      <WorkspaceViews
        labels={["This is Perform.", "This is Practice.", "This is Levels."]}
        value={view}
        onChange={setView}
      />
      <details className="stage-setup">
        <summary>
          These are the chart and band settings.{" "}
          <span>
            {currentChart?.name ?? "Choose this chart"}. {band.style_name}.
          </span>
        </summary>
        {/* Configuration row: Chart, Style, Intensity, Click, Tuner */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider">
                Choose the source.
              </span>
              <Button
                size="sm"
                variant={activeSource !== "lyria" ? "primary" : "secondary"}
                onClick={() => void lyriaStop()}
              >
                This is the band.
              </Button>
              <Button
                size="sm"
                variant={activeSource === "lyria" ? "primary" : "secondary"}
                onClick={() => void lyriaStart()}
              >
                This is Lyria.
              </Button>
              <StatusPill
                status={
                  lyriaStatus.live
                    ? "live"
                    : activeSource === "lyria"
                      ? "idle"
                      : "ok"
                }
                label={
                  activeSource === "lyria"
                    ? "Lyria is not live."
                    : activeSource === "song"
                      ? "This is the song."
                      : "This is the jam band."
                }
              />
              <p className="basis-full m-0 text-xs text-[var(--fg-2)]">
                Lyria needs a Gemini key, JAM_LIVE=1 and a recorded provider
                session before it may open a WebSocket. Provider off until those
                are set. BPM is a request, not the band clock.
              </p>
              <Button size="sm" onClick={() => openSettings("These are the AI and models.")}>
                Open these AI settings.
              </Button>
            </div>

            <div className="h-4 w-px bg-[var(--line)]" />

            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Choose the chart.
              </span>
              <select
                aria-label="Choose the chart."
                value={currentChart?.id ?? ""}
                onChange={(e) => bandLoadChart(e.target.value)}
                className="bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-2 py-1 rounded-[var(--radius-m)] text-xs font-mono cursor-pointer max-w-[220px]"
              >
                {charts.length === 0 && (
                  <option value="">The charts are loading.</option>
                )}
                {currentChart &&
                  !charts.some((c) => c.id === currentChart.id) && (
                    <option value={currentChart.id}>
                      {currentChart.name} is unsaved.
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
                title="Transpose this down a semitone with [."
                aria-label="Transpose this down."
              >
                ♭
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => transposeCurrentChart(1)}
                title="Transpose this up a semitone with ]."
                aria-label="Transpose this up."
              >
                ♯
              </Button>
            </div>

            <div className="h-4 w-px bg-[var(--line)]" />

            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Choose the style.
              </span>
              <select
                aria-label="Choose the style."
                value={band.pending_style_id ?? band.style_id}
                onChange={(e) => bandSetStyle(e.target.value)}
                className="bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-2 py-1 rounded-[var(--radius-m)] text-xs font-mono cursor-pointer"
              >
                {grooves.length === 0 && (
                  <option value={band.style_id}>{band.style_name}</option>
                )}
                {grooves.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="h-4 w-px bg-[var(--line)]" />

            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Choose the intensity.
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                aria-label="Choose the intensity."
                value={band.pending_intensity ?? band.intensity}
                onChange={(e) =>
                  bandSetIntensity(Number.parseFloat(e.target.value))
                }
                className="w-20 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-[var(--fg-1)]">
                {((band.pending_intensity ?? band.intensity) * 100).toFixed(0)}
                %.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-2"
              title="Choose the band volume."
            >
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Choose the band volume.
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                aria-label="Choose the band volume."
                value={bandVolume}
                onChange={(e) =>
                  setBandVolume(Number.parseFloat(e.target.value))
                }
                className="w-16 accent-[var(--accent)] cursor-pointer"
              />
            </div>
            <div
              className="flex items-center gap-2"
              title="Choose the click volume."
            >
              <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
                Choose the click volume.
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                aria-label="Choose the click volume."
                value={clickVolume}
                onChange={(e) =>
                  setClickVolume(Number.parseFloat(e.target.value))
                }
                className="w-16 accent-[var(--accent)] cursor-pointer"
              />
            </div>
            <Toggle
              checked={tunerOn}
              onChange={setTuner}
              label="Hear the tuner."
            />
            <Toggle
              checked={toneOn}
              onChange={(c) => setTone(c, 440)}
              label="Hear the reference tone."
            />
          </div>
        </div>
      </details>
      <div hidden={view !== "This is Perform."} className="workspace-stack">
        {/* Main readouts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Panel className="flex flex-col items-center justify-center min-h-[180px]">
            {isCountingIn ? (
              <BigReadout
                value={`${transport.bar} · ${transport.beat}`}
                label="This is the count-in. Get ready."
                kind="tempo"
                highlight
              />
            ) : (
              <BigReadout
                value={band.current_chord || "This is a rest or no chord."}
                subValue={band.next_chord ? `Next is ${band.next_chord}` : ""}
                label={
                  band.is_stopped
                    ? "The band is stopped. Press S to resume."
                    : "This is the active chord."
                }
                kind="chord"
                highlight={!band.is_stopped}
              />
            )}
          </Panel>

          <Panel className="flex flex-col items-center justify-center min-h-[180px]">
            {tunerOn ? (
              <BigReadout
                value={tunerData?.note ?? "--"}
                label="This is the guitar tuner. The input is the DI."
                kind="tempo"
                cents={tunerData?.cents}
                subValue={
                  tunerData
                    ? `${tunerData.hz.toFixed(1)} Hz`
                    : "Play a single note."
                }
                highlight={tunerData ? Math.abs(tunerData.cents) < 5 : false}
              />
            ) : (
              <>
                <BigReadout
                  value={`${transport.bpm.toFixed(0)}`}
                  subValue="BPM. The range is 20–300."
                  label="This is the tempo."
                  kind="tempo"
                />
                <BigReadout
                  value={`${transport.bar} · ${transport.beat}`}
                  label="This is the bar."
                  kind="tempo"
                />
                {outOfRange && bpmRange && (
                  <span className="text-[10px] font-mono text-[var(--accent)] -mt-2">
                    {band.style_name} feels best at {Math.round(bpmRange[0])}–
                    {Math.round(bpmRange[1])} BPM.
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
                    title="Tap on the beat with T."
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

        {/* Where the chord now and the chord next sit on the neck */}
        {!isCountingIn && band.current_chord && (
          <ChordShapes now={band.current_chord} next={band.next_chord} />
        )}

        {/* Live steering: parts, energy, cues */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] px-4 py-2.5 rounded-[var(--radius-m)] border border-[var(--line)]">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider mr-1">
              These are the parts.
            </span>
            <Button
              size="sm"
              variant={band.mute_drums ? "secondary" : "primary"}
              onClick={() => togglePart("drums")}
              title="M"
              aria-label={
                band.mute_drums ? "Drums are muted." : "Drums are playing."
              }
            >
              {band.mute_drums ? "Drums are muted." : "Drums are playing."}
            </Button>
            <Button
              size="sm"
              variant={band.mute_bass ? "secondary" : "primary"}
              onClick={() => togglePart("bass")}
              title="B"
              aria-label={
                band.mute_bass ? "Bass is muted." : "Bass is playing."
              }
            >
              {band.mute_bass ? "Bass is muted." : "Bass is playing."}
            </Button>
            <Button
              size="sm"
              variant={band.mute_comp ? "secondary" : "primary"}
              onClick={() => togglePart("comp")}
              title="P"
              aria-label={
                band.mute_comp ? "Comp is muted." : "Comp is playing."
              }
            >
              {band.mute_comp ? "Comp is muted." : "Comp is playing."}
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
                ? "This follows your playing."
                : "This is fixed intensity."}
            </Button>
            {band.follow_energy && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-mono text-[var(--fg-2)]">
                  DI dynamics.
                </span>
                <div className="w-16 h-2 bg-[var(--bg-2)] rounded-[var(--radius-s)] overflow-hidden border border-[var(--line)]">
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
              These are the cues.
            </span>
            <CueButton
              cue="fill"
              label="Fill this."
              hint="F"
              band={band}
              onCue={bandCue}
            />
            <CueButton
              cue="crash"
              label="Crash this."
              hint="K"
              band={band}
              onCue={bandCue}
            />
            <CueButton
              cue="stop"
              label={band.is_stopped ? "Resume this." : "Stop this."}
              hint="S"
              band={band}
              onCue={bandCue}
              danger
            />
            <CueButton
              cue="ending"
              label="Ending this."
              hint="E"
              band={band}
              onCue={bandCue}
            />
          </div>

          {(band.pending_cue !== "none" ||
            band.pending_style_id != null ||
            band.pending_intensity != null) && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs font-mono text-[var(--accent)] animate-pulse bg-[var(--bg-2)] px-2 py-0.5 rounded-[var(--radius-m)] border border-[var(--accent)]">
                Next bar is{" "}
                <strong className="uppercase">
                  {band.pending_cue !== "none"
                    ? band.pending_cue
                    : band.pending_style_id
                      ? (styles.find((s) => s.id === band.pending_style_id)
                          ?.name ?? band.pending_style_id)
                      : `intensity ${Math.round((band.pending_intensity ?? 0) * 100)}%`}
                </strong>
                .
              </span>
            </div>
          )}
        </div>

        {/* Chord strip: the whole form, current bar lit */}
        <Panel title="This is the signal.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <Meter
              label="This is the guitar input. The source is the DI."
              peakDb={telemetry.input_level.peak_db}
              rmsDb={telemetry.input_level.rms_db}
              width="w-full"
              live={clockLive && view === "This is Perform."}
            />
            <Meter
              label="This is the master output."
              peakDb={telemetry.output_level.peak_db}
              rmsDb={telemetry.output_level.rms_db}
              width="w-full"
              live={clockLive && view === "This is Perform."}
            />
          </div>
        </Panel>

        <Panel className="py-2 px-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-[10px] font-mono text-[var(--fg-2)]">
              {band.current_section
                ? `The form is ${band.current_section}.`
                : "The form has no current section."}
            </div>
            <div className="text-[10px] font-mono text-[var(--fg-2)]">
              Click a bar to jump. Shift-click to set the loop. 1–9 jump to a
              bar.
            </div>
          </div>
          <ChordStrip
            chart={currentChart}
            currentBar={isCountingIn ? 0 : transport.bar}
            barProgress={transport.bar_progress}
            live={clockLive}
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
      <section hidden={view !== "This is Practice."} className="workspace-stack">
        <div>
          <h2 className="text-lg mb-3">Rehearse this section.</h2>
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
                  Bars {p.start} to {p.end - 1}.
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
              Exit this loop.
            </Button>
          </div>
        </div>
        {/* Practice: tempo trainer */}
        <Panel title="This is the tempo trainer.">
          <div className="flex flex-wrap items-center gap-4">
            <Toggle
              checked={tempoTrainer.enabled}
              onChange={(enabled) =>
                setTempoTrainer({ enabled, playedBars: 0 })
              }
              label={
                tempoTrainer.enabled
                  ? "The trainer is on."
                  : "The trainer is off."
              }
            />
            <NumberField
              label="Choose the start tempo."
              value={tempoTrainer.startBpm}
              min={20}
              max={300}
              onChange={(v) => setTempoTrainer({ startBpm: v })}
              suffix="BPM."
            />
            <NumberField
              label="Choose the target tempo."
              value={tempoTrainer.targetBpm}
              min={20}
              max={300}
              onChange={(v) => setTempoTrainer({ targetBpm: v })}
              suffix="BPM."
            />
            <NumberField
              label="Choose the tempo step."
              value={tempoTrainer.stepBpm}
              min={1}
              max={20}
              onChange={(v) => setTempoTrainer({ stepBpm: v })}
              suffix="BPM."
            />
            <NumberField
              label="Change every this many bars."
              value={tempoTrainer.everyBars}
              min={1}
              max={32}
              onChange={(v) => setTempoTrainer({ everyBars: v })}
              suffix="bars"
            />
            <span className="text-[10px] font-mono text-[var(--fg-2)] max-w-xs">
              Press play. The band starts at the start tempo and creeps toward
              the target. Loop a hard passage (shift-click two bars) to drill
              it.
            </span>
          </div>
        </Panel>

        {/* Soloing helper */}
        <div className="flex items-center justify-between -mb-3">
          <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider">
            This is the soloing helper.
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSolo((v) => !v)}
          >
            {showSolo ? "Hide the helper." : "Show the helper."}
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
      <section hidden={view !== "This is Levels."}>
        <Panel title="This is the signal telemetry.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <Meter
              label="This is the guitar input. The source is the DI."
              peakDb={telemetry.input_level.peak_db}
              rmsDb={telemetry.input_level.rms_db}
              width="w-full"
              live={clockLive && view === "This is Levels."}
            />
            <Meter
              label="This is the master output."
              peakDb={telemetry.output_level.peak_db}
              rmsDb={telemetry.output_level.rms_db}
              width="w-full"
              live={clockLive && view === "This is Levels."}
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
}> = ({ label, value, min, max, suffix, onChange }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = committedNumber(draft, value, min, max);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <label className="flex items-center gap-1.5 text-xs font-mono text-[var(--fg-2)]">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-16 bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-1.5 py-0.5 rounded-[var(--radius-m)] text-xs font-mono tabular-nums"
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
};
