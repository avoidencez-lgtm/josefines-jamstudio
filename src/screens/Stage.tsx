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
  } = useEngineStore();

  const tunerData = telemetry.tuner;
  const transport = telemetry.transport;
  const isCountingIn = transport.state === "counting_in";

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Source selector row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-mono text-[var(--fg-2)] tracking-wider">
            Source
          </span>
          <StatusPill status="live" label="Jam Band" />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
              Click Vol
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
              className="w-20 accent-[var(--accent)] cursor-pointer"
            />
          </div>
          <Toggle checked={tunerOn} onChange={setTuner} label="Tuner" />
          <Toggle
            checked={toneOn}
            onChange={(c) => setTone(c, 440)}
            label="440 Hz Tone"
          />
        </div>
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
