import { Pause, Play, Record, Repeat, Stop } from "@phosphor-icons/react";
import { useShallow } from "zustand/shallow";
import { recordingReadout } from "../lib/recordingReadout";
import { useEngineStore } from "../store/engine";
import { EngineStatusPill } from "./EngineStatusPill";
import { JoVoiceControls } from "./JoVoice";
import { StudioAssistant } from "./StudioAssistant";

/** Live transport chrome. Owns the 30 Hz telemetry subscription so App and rooms do not. */
export function TransportBar() {
  const {
    telemetry,
    engineStatus,
    isPreview,
    isRecording,
    recordingError,
    transportPlay,
    transportPause,
    transportStop,
    transportSetLoop,
    transportSetCountIn,
    startRecording,
    stopRecording,
    setScreen,
  } = useEngineStore(
    useShallow((s) => ({
      telemetry: s.telemetry,
      engineStatus: s.engineStatus,
      isPreview: s.isPreview,
      isRecording: s.isRecording,
      recordingError: s.recordingError,
      transportPlay: s.transportPlay,
      transportPause: s.transportPause,
      transportStop: s.transportStop,
      transportSetLoop: s.transportSetLoop,
      transportSetCountIn: s.transportSetCountIn,
      startRecording: s.startRecording,
      stopRecording: s.stopRecording,
      setScreen: s.setScreen,
    })),
  );
  const transport = telemetry.transport;
  const reference = telemetry.reference;
  const isPlaying =
    transport.state === "playing" || transport.state === "counting_in";
  const playLabel = isPlaying ? "Pause" : "Play";
  const recordLabel = recordingError
    ? "Save partial take"
    : isRecording
      ? "Stop recording."
      : "Record a new take.";

  return (
    <header className="min-h-[56px] bg-[var(--bg-1)] border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => (isPlaying ? transportPause() : transportPlay())}
            className={`w-9 h-9 rounded-[var(--radius-m)] flex items-center justify-center cursor-pointer ${
              isPlaying
                ? "bg-[var(--accent)] text-[var(--bg-0)]"
                : "bg-[var(--bg-2)] text-[var(--fg-0)] hover:bg-[var(--bg-3)]"
            }`}
            title={`${playLabel} (Space)`}
            aria-label={playLabel}
          >
            {isPlaying ? (
              <Pause size={18} weight="fill" />
            ) : (
              <Play size={18} weight="fill" />
            )}
          </button>
          <button
            type="button"
            onClick={() => transportStop()}
            className="w-9 h-9 rounded-[var(--radius-m)] flex items-center justify-center bg-[var(--bg-2)] text-[var(--fg-0)] hover:bg-[var(--bg-3)] cursor-pointer"
            title="Stop (Enter)"
            aria-label="Stop"
          >
            <Stop size={18} />
          </button>
          <button
            type="button"
            onClick={() => (isRecording ? stopRecording() : startRecording())}
            className={`w-9 h-9 rounded-[var(--radius-m)] flex items-center justify-center cursor-pointer ${
              recordingError
                ? "bg-[var(--bg-2)] text-[var(--record)] border border-[var(--record)]"
                : isRecording
                  ? "bg-[var(--record)] text-[var(--fg-0)] animate-pulse"
                  : "bg-[var(--bg-2)] text-[var(--record)] hover:bg-[var(--bg-3)]"
            }`}
            title={`${recordLabel} (R)`}
            aria-label={recordLabel}
          >
            {recordingError ? (
              <Stop size={18} />
            ) : (
              <Record size={18} weight="fill" />
            )}
          </button>
          {isRecording ? (
            <span className="font-mono tabular-nums text-sm text-[var(--record)]">
              {recordingReadout({
                bar: transport.bar,
                beat: transport.beat,
                positionBeats: transport.position_beats,
                bpm: transport.bpm,
              })}
            </span>
          ) : null}
        </div>

        <div className="h-5 w-px bg-[var(--line)]" />

        {reference ? (
          <button
            type="button"
            onClick={() => setScreen("songs")}
            className="font-mono tabular-nums text-sm"
            title="Open the reference player."
          >
            The reference is at {reference.position.toFixed(1)} of{" "}
            {reference.seconds.toFixed(1)} s.
          </button>
        ) : (
          <>
            <div className="flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-xs uppercase text-[var(--fg-2)] tracking-wider">
                {transport.state === "counting_in" ? "Count" : "Bar"}
              </span>
              <span
                className={`text-lg font-semibold ${
                  transport.state === "counting_in"
                    ? "text-[var(--accent)] animate-pulse"
                    : "text-[var(--fg-0)]"
                }`}
              >
                {transport.bar} · {transport.beat}
              </span>
            </div>

            <div className="h-5 w-px bg-[var(--line)]" />

            <div className="flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-xs uppercase text-[var(--fg-2)] tracking-wider">
                Tempo
              </span>
              <span className="text-lg font-semibold text-[var(--fg-0)]">
                {transport.bpm.toFixed(0)}
              </span>
              <span className="text-xs text-[var(--fg-2)]">BPM</span>
            </div>

            <div className="h-5 w-px bg-[var(--line)]" />

            <div
              className="flex items-baseline gap-2 font-mono tabular-nums"
              title="Meter follows the loaded chart."
            >
              <span className="text-xs uppercase text-[var(--fg-2)] tracking-wider">
                Meter
              </span>
              <span className="text-lg font-semibold text-[var(--fg-0)]">
                {transport.time_signature[0]}/{transport.time_signature[1]}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {!reference && (
          <>
            <button
              type="button"
              onClick={() =>
                transportSetLoop(
                  transport.loop_start_bar,
                  transport.loop_end_bar,
                  !transport.loop_enabled,
                )
              }
              className={`flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-m)] text-xs font-mono border cursor-pointer ${
                transport.loop_enabled
                  ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                  : "bg-[var(--bg-2)] border-[var(--line)] text-[var(--fg-2)] hover:text-[var(--fg-0)]"
              }`}
              title="Toggle the loop (L)."
            >
              <Repeat size={14} />
              <span>
                Loop bars {transport.loop_start_bar} to{" "}
                {transport.loop_end_bar - 1}.
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                transportSetCountIn((transport.count_in_bars + 1) % 3)
              }
              className="px-2.5 py-1 rounded-[var(--radius-m)] text-xs font-mono border cursor-pointer bg-[var(--bg-2)] border-[var(--line)] text-[var(--fg-0)]"
              title="Set the count-in (C)."
            >
              {transport.count_in_bars > 0
                ? `Count-in is ${transport.count_in_bars} bar${transport.count_in_bars > 1 ? "s" : ""}.`
                : "The count-in is off."}
            </button>
          </>
        )}
        <EngineStatusPill
          status={engineStatus}
          isPreview={isPreview}
          onClick={() => setScreen("settings")}
        />
        <JoVoiceControls compact />
        <StudioAssistant />
      </div>
      {recordingError && (
        <p role="alert" className="w-full text-sm text-[var(--record)]">
          {recordingError}
        </p>
      )}
    </header>
  );
}
