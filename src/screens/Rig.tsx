import {
  ArrowRight,
  Guitar,
  PlugsConnected,
  SpeakerHifi,
} from "@phosphor-icons/react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { Toggle } from "../components/Toggle";
import { WorkspaceHeader, WorkspaceViews } from "../components/Workspace";
import type { RigControl, RigProfile } from "../ipc/contract";
import { useEngineStore } from "../store/engine";

const FALLBACK_SECTIONS = [
  "Intro",
  "Verse",
  "Chorus",
  "Bridge",
  "Solo",
  "Outro",
];

export const Rig: React.FC = () => {
  const {
    rigState,
    availableProfiles,
    midiPorts,
    midiPortsError,
    currentChart,
    playingSection,
    isPreview,
    loadRigProfiles,
    selectRigProfile,
    selectRigScene,
    setRigSectionMapping,
    setRigFollowSections,
    refreshMidiPorts,
    openMidiPort,
    setRigControl,
    sendRigProgram,
    clearRigMonitor,
    checkVirtualMidi,
  } = useEngineStore(
    useShallow((s) => ({
      rigState: s.rigState,
      availableProfiles: s.availableProfiles,
      midiPorts: s.midiPorts,
      midiPortsError: s.midiPortsError,
      currentChart: s.currentChart,
      playingSection: s.telemetry.band.current_section,
      isPreview: s.isPreview,
      loadRigProfiles: s.loadRigProfiles,
      selectRigProfile: s.selectRigProfile,
      selectRigScene: s.selectRigScene,
      setRigSectionMapping: s.setRigSectionMapping,
      setRigFollowSections: s.setRigFollowSections,
      refreshMidiPorts: s.refreshMidiPorts,
      openMidiPort: s.openMidiPort,
      setRigControl: s.setRigControl,
      sendRigProgram: s.sendRigProgram,
      clearRigMonitor: s.clearRigMonitor,
      checkVirtualMidi: s.checkVirtualMidi,
    })),
  );

  useEffect(() => {
    loadRigProfiles();
  }, [loadRigProfiles]);

  const profile = rigState?.currentProfile;
  const currentScene = rigState?.currentScene ?? 0;
  const sectionMappings = rigState?.sectionMappings ?? {};
  const live = rigState?.live ?? false;

  // Sections of the loaded chart come first; the usual names fill in the rest so a
  // mapping can be prepared before the chart is loaded.
  const sections = useMemo(() => {
    const fromChart = currentChart?.sections.map((s) => s.name) ?? [];
    const seen = new Set<string>();
    return [...fromChart, ...FALLBACK_SECTIONS].filter((s) => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  }, [currentChart]);

  const [view, setView] = useState("Play scenes");
  const [programInput, setProgramInput] = useState(0);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      <WorkspaceHeader
        screen="rig"
        title="Your sound, underfoot."
        description="Choose a hardware scene or let song sections change it for you."
      />
      <div className="rig-signal">
        <Guitar size={23} aria-hidden="true" /> Jamstudio scenes{" "}
        <ArrowRight size={18} aria-hidden="true" />
        <PlugsConnected size={23} aria-hidden="true" />{" "}
        {live ? rigState?.port : "This MIDI is disconnected."}{" "}
        <ArrowRight size={18} aria-hidden="true" />
        <SpeakerHifi size={23} aria-hidden="true" />{" "}
        {profile?.name ?? "Choose this profile."}
        <span>
          {live
            ? "Sending these control messages."
            : "Preview only. Messages are logged."}
        </span>
      </div>
      {midiPortsError && (
        <div className="text-xs font-mono text-[var(--record)] px-1 workspace-stack">
          <p>
            MIDI port disappeared. {midiPortsError} Rescan or pick another port.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setView("Connection & MIDI");
              refreshMidiPorts();
            }}
          >
            Rescan
          </Button>
        </div>
      )}
      {!midiPortsError && midiPorts.length === 0 && (
        <div className="text-xs font-mono text-[var(--fg-2)] px-1 workspace-stack">
          <p>
            No MIDI output found. Plug in the interface. Create a loopMIDI port
            named Jam Virtual (Windows) or enable the IAC Driver (macOS), then
            press Rescan. A USB interface is still required for HeadRush and
            Black Spirit; this check does not claim those devices.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setView("Connection & MIDI");
              refreshMidiPorts();
            }}
          >
            Rescan
          </Button>
        </div>
      )}

      <WorkspaceViews
        labels={["Play scenes", "Section automation", "Connection & MIDI"]}
        value={view}
        onChange={setView}
      />
      <div hidden={view !== "Connection & MIDI"} className="workspace-stack">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
                Control the rig over MIDI.
              </h2>
              <StatusPill
                status={live ? "ok" : "idle"}
                label={
                  live ? `Open on ${rigState?.port}.` : "No MIDI port is open."
                }
              />
            </div>
            <p className="text-xs font-mono text-[var(--fg-2)] mt-0.5">
              {profile
                ? `${profile.name} on MIDI channel ${profile.midiChannel + 1}.`
                : "The rig profile is loading."}
              {!live &&
                " Messages are logged in the monitor below until a port is opened."}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-mono text-[var(--fg-2)] flex items-center gap-2">
              Choose the MIDI output.
              <select
                value={rigState?.port ?? ""}
                onChange={(e) =>
                  openMidiPort(e.target.value === "" ? null : e.target.value)
                }
                className="bg-[var(--bg-2)] border border-[var(--line)] text-xs font-mono text-[var(--fg-0)] px-2 py-1 rounded-[var(--radius-m)] focus:border-[var(--accent)] max-w-[260px]"
              >
                <option value="">Not connected.</option>
                {rigState?.port &&
                  !midiPorts.some((p) => p.name === rigState.port) && (
                    <option value={rigState.port}>{rigState.port}</option>
                  )}
                {midiPorts.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => refreshMidiPorts()}
            >
              Rescan
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isPreview}
              onClick={() => void checkVirtualMidi()}
            >
              Check this virtual MIDI.
            </Button>
          </div>
        </div>

        <Panel title="This is the hardware profile.">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {availableProfiles.map((p) => (
              <button
                type="button"
                key={p.id}
                aria-pressed={profile?.id === p.id}
                onClick={() => selectRigProfile(p.id)}
                className={`p-3 rounded-[var(--radius-m)] border text-left font-mono ${
                  profile?.id === p.id
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg-0)]"
                    : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--fg-2)] hover:text-[var(--fg-0)]"
                }`}
              >
                <div className="text-xs font-bold truncate">{p.name}</div>
                <div className="text-[10px] text-[var(--fg-2)] mt-1">
                  ch {p.midiChannel + 1} ·{" "}
                  {p.sceneCc !== null
                    ? `scenes via CC ${p.sceneCc}`
                    : "Uses Program Change."}
                </div>
              </button>
            ))}
          </div>
          {profile?.notes && (
            <p className="text-xs font-mono text-[var(--fg-2)] mt-4 leading-relaxed border-l-2 border-[var(--line)] pl-3">
              {profile.notes}
            </p>
          )}
        </Panel>
      </div>
      <div hidden={view !== "Play scenes"} className="workspace-stack">
        <Panel title={`These are the ${profile?.name ?? "..."} scenes.`}>
          {profile ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {profile.scenes.map((scene, idx) => {
                const isActive = currentScene === idx;
                return (
                  <button
                    type="button"
                    key={scene.name}
                    aria-pressed={isActive}
                    onClick={() => selectRigScene(idx)}
                    title={sceneSummary(profile, idx)}
                    className={`p-4 rounded-[var(--radius-m)] border text-center font-mono ${
                      isActive
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-0)]"
                        : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--fg-0)] hover:border-[var(--accent)]/50"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider opacity-75">
                      Scene {idx + 1}
                    </div>
                    <div className="text-sm font-bold mt-1">{scene.name}</div>
                    <div className="text-[10px] mt-1 opacity-70 truncate">
                      {sceneSummary(profile, idx)}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-xs font-mono text-[var(--fg-2)]">
              The rig profile is loading.
            </div>
          )}
        </Panel>

        {profile && profile.controls.length > 0 && (
          <Panel title={`These are the ${profile.name} knobs.`}>
            <p className="text-xs font-mono text-[var(--fg-2)] mb-4">
              Real-time Control Change. Values are clamped to the profile's
              declared range.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {profile.controls.map((c) => (
                <ControlRow
                  key={c.cc}
                  control={c}
                  value={rigState?.controlValues[String(c.cc)] ?? c.default}
                  onChange={(v) => setRigControl(c.cc, v)}
                />
              ))}
            </div>
          </Panel>
        )}
      </div>
      <div hidden={view !== "Section automation"}>
        <Panel title="This is section automation.">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-xs font-mono text-[var(--fg-2)] max-w-2xl">
              When the band enters a section, the mapped scene is sent once.
              Sections come from the loaded chart
              {currentChart ? ` (${currentChart.name})` : ""}; the usual names
              are always available.
            </p>
            <Toggle
              checked={rigState?.followSections ?? true}
              onChange={(v) => setRigFollowSections(v)}
              label="Follow the chart sections."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sections.map((sec) => {
              const mapped = sectionMappings[sec];
              const isNow = playingSection === sec;
              return (
                <div
                  key={sec}
                  className={`p-3 bg-[var(--bg-2)] border rounded-[var(--radius-m)] flex items-center justify-between gap-3 ${
                    isNow ? "border-[var(--accent)]" : "border-[var(--line)]"
                  }`}
                >
                  <span className="text-xs font-mono font-bold text-[var(--fg-0)] truncate">
                    {sec}
                    {isNow && (
                      <span className="ml-2 text-[10px] text-[var(--accent)] font-normal">
                        now
                      </span>
                    )}
                  </span>
                  <select
                    aria-label={`This is the ${sec} scene.`}
                    value={mapped ?? ""}
                    onChange={(e) =>
                      setRigSectionMapping(
                        sec,
                        e.target.value === ""
                          ? null
                          : Number.parseInt(e.target.value, 10),
                      )
                    }
                    className="bg-[var(--bg-1)] border border-[var(--line)] text-xs font-mono text-[var(--fg-0)] px-2 py-1 rounded-[var(--radius-m)] focus:border-[var(--accent)]"
                  >
                    <option value="">Leave this scene unchanged.</option>
                    {profile?.scenes.map((s, idx) => (
                      <option key={s.name} value={idx}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <div hidden={view !== "Connection & MIDI"} className="workspace-stack">
        <Panel title="Send a Program Change.">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-mono text-[var(--fg-2)] flex-1 min-w-[200px]">
              Send any program number directly (a HeadRush rig's "MIDI Prog" or
              an amp preset) to find out which number is which.
            </p>
            <div className="flex items-center gap-2">
              <ProgramChangeControls
                programs={profile?.programs ?? []}
                value={programInput}
                onChange={setProgramInput}
                onSend={() => sendRigProgram(programInput)}
              />
            </div>
          </div>
        </Panel>

        <Panel title="This is the MIDI monitor.">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-[var(--fg-2)]">
              {rigState?.portDescription}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => clearRigMonitor()}
            >
              Clear
            </Button>
          </div>
          {rigState && rigState.monitor.length > 0 ? (
            <ul className="font-mono text-xs divide-y divide-[var(--line)] max-h-64 overflow-y-auto">
              {[...rigState.monitor].reverse().map((m) => (
                <li
                  key={`${m.atMs}-${m.bytes.join(".")}-${m.reason}`}
                  className="py-1.5 flex items-center gap-3"
                >
                  <span className="text-[var(--fg-2)] w-20 shrink-0 tabular-nums">
                    {formatMs(m.atMs)}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      m.live ? "bg-[var(--accent)]" : "bg-[var(--fg-2)]/40"
                    }`}
                    title={
                      m.live ? "Sent to the port." : "This is logged only."
                    }
                  />
                  <span className="text-[var(--fg-0)] w-40 shrink-0">
                    {m.text}
                  </span>
                  <span className="text-[var(--fg-2)] truncate">
                    {m.reason}
                  </span>
                  <span className="ml-auto text-[var(--fg-2)] tabular-nums">
                    {m.bytes
                      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
                      .join(" ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs font-mono text-[var(--fg-2)] py-4 text-center">
              Nothing sent yet. Pick a scene or turn a knob.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

function sceneSummary(profile: RigProfile, idx: number): string {
  const scene = profile.scenes[idx];
  if (!scene) return "";
  if (scene.commands.length === 0) {
    return profile.sceneCc !== null
      ? `CC ${profile.sceneCc} = ${idx}`
      : `PC ${idx}`;
  }
  return scene.commands
    .map((c) => {
      if (c.type === "programChange") return `PC ${c.program}`;
      if (c.type === "controlChange") return `CC ${c.cc}=${c.value}`;
      return `${c.ms}ms`;
    })
    .join(" · ");
}

export function clampProgramNumber(raw: string): number {
  return Math.min(127, Math.max(0, Number.parseInt(raw || "0", 10) || 0));
}

/** Named presets never hide freeform MIDI program entry (0–127). */
export const ProgramChangeControls: React.FC<{
  programs: { number: number; name: string }[];
  value: number;
  onChange: (n: number) => void;
  onSend: () => void;
}> = ({ programs, value, onChange, onSend }) => (
  <>
    {programs.length > 0 && (
      <select
        aria-label="This is a named program."
        value={programs.some((p) => p.number === value) ? value : ""}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className="bg-[var(--bg-2)] border border-[var(--line)] text-xs font-mono text-[var(--fg-0)] px-2 py-1 rounded-[var(--radius-m)] focus:border-[var(--accent)]"
      >
        <option value="" disabled>
          Named presets
        </option>
        {programs.map((p) => (
          <option key={p.number} value={p.number}>
            Program {p.number} is {p.name}.
          </option>
        ))}
      </select>
    )}
    <input
      type="number"
      min={0}
      max={127}
      aria-label="This is the program number."
      value={value}
      onChange={(e) => onChange(clampProgramNumber(e.target.value))}
      className="w-20 bg-[var(--bg-2)] border border-[var(--line)] text-xs font-mono text-[var(--fg-0)] px-2 py-1 rounded-[var(--radius-m)] focus:border-[var(--accent)]"
    />
    <Button size="sm" onClick={onSend}>
      Send this PC {value}.
    </Button>
  </>
);

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

const ControlRow: React.FC<{
  control: RigControl;
  value: number;
  onChange: (v: number) => void;
}> = ({ control, value, onChange }) => {
  // Sliders fire a lot; only send when the pointer settles.
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  if (control.toggle) {
    const on = value >= 64;
    return (
      <div className="p-3 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--radius-m)] flex items-center justify-between gap-3">
        <span className="text-xs font-mono text-[var(--fg-0)]">
          {control.name}
          <span className="text-[var(--fg-2)] ml-2">CC {control.cc}</span>
        </span>
        <Toggle
          label={control.name}
          checked={on}
          onChange={(v) => onChange(v ? control.max : control.min)}
        />
      </div>
    );
  }
  return (
    <div className="p-3 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--radius-m)] flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-[var(--fg-0)]">
          {control.name}
          <span className="text-[var(--fg-2)] ml-2">CC {control.cc}</span>
        </span>
        <span className="text-[var(--fg-1)] tabular-nums">{local}</span>
      </div>
      <input
        type="range"
        aria-label={control.name}
        min={control.min}
        max={control.max}
        value={local}
        onChange={(e) => setLocal(Number.parseInt(e.target.value, 10))}
        onPointerUp={() => onChange(local)}
        onKeyUp={() => onChange(local)}
        onBlur={() => local !== value && onChange(local)}
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
};
