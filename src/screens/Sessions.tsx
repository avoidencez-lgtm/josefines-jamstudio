import type React from "react";
import { useEffect, useRef } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { useEngineStore } from "../store/engine";

export const Sessions: React.FC = () => {
  const {
    takes,
    isRecording,
    calibratedLatencySamples,
    startRecording,
    stopRecording,
    calibrateLatency,
    loadTakes,
    deleteTake,
  } = useEngineStore();

  useEffect(() => {
    loadTakes();
  }, [loadTakes]);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
            Takes & Recordings
          </h1>
          <StatusPill
            status={isRecording ? "live" : "idle"}
            label={isRecording ? "Recording Take" : "Idle"}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--fg-2)]">
            <span>Latency:</span>
            <span className="text-[var(--accent)] font-semibold">
              {calibratedLatencySamples} samples (
              {((calibratedLatencySamples * 1000) / 48000).toFixed(1)} ms)
            </span>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => calibrateLatency()}
          >
            Calibrate Latency
          </Button>

          {isRecording ? (
            <Button size="sm" variant="danger" onClick={() => stopRecording()}>
              Stop Recording
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => startRecording()}
            >
              Record New Take
            </Button>
          )}
        </div>
      </div>

      {/* Takes List */}
      <Panel title={`Recorded Takes (${takes.length})`}>
        {takes.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-[var(--fg-2)] space-y-3 font-mono text-xs">
            <p>No takes recorded yet in this session.</p>
            <p className="text-[var(--fg-1)]">
              Hit <strong>Record New Take</strong> or start jamming to record
              multi-track stems.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {takes.map((take) => (
              <TakeRow
                key={take.id}
                take={take}
                onDelete={() => deleteTake(take.id)}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
};

interface TakeRowProps {
  take: import("../ipc/contract").TakeMetadata;
  onDelete: () => void;
}

const TakeRow: React.FC<TakeRowProps> = ({ take, onDelete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const peaks = take.waveformPeaks;
    if (!peaks || peaks.length === 0) return;

    const barWidth = width / peaks.length;
    ctx.fillStyle = "var(--accent)";

    for (let i = 0; i < peaks.length; i++) {
      const p = Math.min(Math.max(peaks[i], 0.05), 1.0);
      const barHeight = p * height;
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight);
    }
  }, [take.waveformPeaks]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex flex-col gap-1 min-w-[200px]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-[var(--fg-0)]">
            {take.id}
          </span>
          <span className="text-[10px] font-mono text-[var(--fg-2)] px-1.5 py-0.5 bg-[var(--bg-2)] rounded">
            {formatDuration(take.durationSecs)}
          </span>
        </div>
        <div className="text-[11px] font-mono text-[var(--fg-2)] flex items-center gap-2">
          <span>{take.styleId}</span>
          <span>•</span>
          <span>{take.chartId}</span>
          <span>•</span>
          <span>{take.tempo.toFixed(0)} BPM</span>
        </div>
      </div>

      {/* Waveform Thumbnail Canvas */}
      <div className="flex-1 w-full max-w-sm h-10 bg-[var(--bg-2)] rounded border border-[var(--line)] p-1 flex items-center">
        <canvas
          ref={canvasRef}
          width={280}
          height={32}
          className="w-full h-full"
        />
      </div>

      {/* Stems info and delete */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--fg-2)]">
          <span className="px-1 py-0.5 bg-[var(--bg-2)] rounded border border-[var(--line)]">
            DI
          </span>
          <span className="px-1 py-0.5 bg-[var(--bg-2)] rounded border border-[var(--line)]">
            Band
          </span>
          <span className="px-1 py-0.5 bg-[var(--bg-2)] rounded border border-[var(--line)]">
            Master
          </span>
        </div>

        <Button size="sm" variant="danger" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
};
