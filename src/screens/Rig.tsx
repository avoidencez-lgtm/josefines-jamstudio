import type React from "react";
import { useEffect } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { useEngineStore } from "../store/engine";

export const Rig: React.FC = () => {
  const {
    rigState,
    availableProfiles,
    loadRigProfiles,
    selectRigProfile,
    selectRigScene,
    setRigSectionMapping,
  } = useEngineStore();

  useEffect(() => {
    loadRigProfiles();
  }, [loadRigProfiles]);

  const profile = rigState?.currentProfile;
  const currentScene = rigState?.currentScene ?? 0;
  const sectionMappings = rigState?.sectionMappings ?? {};

  const chartSections = ["Intro", "Verse", "Chorus", "Bridge", "Solo", "Outro"];

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
              Rig Orchestration over MIDI
            </h1>
            <StatusPill
              status={profile ? "ok" : "idle"}
              label={profile ? profile.name : "No Rig Selected"}
            />
          </div>
          <p className="text-xs font-mono text-[var(--fg-2)] mt-0.5">
            Automatic scene / preset switching for Quad Cortex, Helix, Kemper,
            and Axe-Fx
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[var(--fg-2)]">
            MIDI Channel: {profile ? profile.midiChannel + 1 : 1}
          </span>
        </div>
      </div>

      {/* Model Profiles Selector */}
      <Panel title="Hardware Rig Profile">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {availableProfiles.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => selectRigProfile(p.id)}
              className={`p-3 rounded border text-left font-mono transition-colors ${
                profile?.id === p.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg-0)]"
                  : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--fg-2)] hover:text-[var(--fg-0)]"
              }`}
            >
              <div className="text-xs font-bold truncate">{p.name}</div>
              <div className="text-[10px] text-[var(--fg-2)] mt-1">
                {p.sceneCc ? `CC #${p.sceneCc}` : "PC Mode"}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      {/* Interactive Scene / Preset Grid */}
      <Panel
        title={`Active Scenes & Snapshots (${profile?.name ?? "Modeler"})`}
      >
        {profile ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {profile.scenes.map((sceneName, idx) => {
              const isActive = currentScene === idx;
              return (
                <button
                  type="button"
                  key={sceneName}
                  onClick={() => selectRigScene(idx)}
                  className={`p-4 rounded-[var(--radius-m)] border text-center font-mono transition-all ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent)] text-black shadow-[0_0_15px_var(--accent)] scale-[1.02]"
                      : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--fg-0)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider opacity-75">
                    Trigger #{idx + 1}
                  </div>
                  <div className="text-sm font-bold mt-1">{sceneName}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-xs font-mono text-[var(--fg-2)]">
            Loading rig profile...
          </div>
        )}
      </Panel>

      {/* Chart Section to Rig Scene Automation */}
      <Panel title="Section Automation (Automatic Rig Switching on Song Change)">
        <p className="text-xs font-mono text-[var(--fg-2)] mb-4">
          When the rhythm section transitions to a new song section, your rig
          will seamlessly switch scenes over USB-MIDI.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {chartSections.map((sec) => (
            <div
              key={sec}
              className="p-3 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--radius-m)] flex items-center justify-between"
            >
              <span className="text-xs font-mono font-bold text-[var(--fg-0)]">
                {sec}
              </span>
              <select
                value={sectionMappings[sec] ?? 0}
                onChange={(e) =>
                  setRigSectionMapping(sec, Number.parseInt(e.target.value, 10))
                }
                className="bg-[var(--bg-1)] border border-[var(--line)] text-xs font-mono text-[var(--fg-0)] px-2 py-1 rounded focus:outline-none focus:border-[var(--accent)]"
              >
                {profile?.scenes.map((s, idx) => (
                  <option key={s} value={idx}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Panel>

      {/* Foot Controller Mapping Info */}
      <Panel title="MIDI Foot Controller Integration">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs font-mono text-[var(--fg-2)]">
          <div>
            Connect any MIDI pedalboard (FCB1010, Morningstar, Blackstar Live
            Logic) to trigger Jo Push-to-Talk, drum fills, or mute parts.
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => selectRigScene(currentScene)}
          >
            Test MIDI Pulse
          </Button>
        </div>
      </Panel>
    </div>
  );
};
