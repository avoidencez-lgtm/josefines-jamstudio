import type React from "react";
import { useEffect, useRef, useState } from "react";
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
    takeAnalysis,
    analyzeTake,
    exportTakeDaw,
  } = useEngineStore();

  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    loadTakes();
  }, [loadTakes]);

  const handleExport = async (takeId: string) => {
    const path = await exportTakeDaw(takeId);
    if (path) {
      setExportMessage(
        `Exported take bundle (WAV stems + MIDI tempo map) to: ${path}`,
      );
      setTimeout(() => setExportMessage(null), 5000);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Top Header Row with Practice Streak & Jam Hours */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
              Sessions, Takes & DAW Export
            </h1>
            <StatusPill
              status={isRecording ? "live" : "idle"}
              label={isRecording ? "Recording Take" : "Idle"}
            />
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-[var(--fg-2)] mt-1">
            <span>
              Practice Streak:{" "}
              <strong className="text-amber-400">7 Days 🔥</strong>
            </span>
            <span>•</span>
            <span>
              Total Jam Time:{" "}
              <strong className="text-[var(--fg-0)]">14.2 Hours</strong>
            </span>
          </div>
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

      {exportMessage && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/50 rounded-[var(--radius-m)] text-xs font-mono text-emerald-300">
          {exportMessage}
        </div>
      )}

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
                analysis={takeAnalysis[take.id]}
                onAnalyze={() => analyzeTake(take.id)}
                onExport={() => handleExport(take.id)}
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
  analysis?: import("../ipc/contract").TakeAnalysis;
  onAnalyze: () => void;
  onExport: () => void;
  onDelete: () => void;
}

const TakeRow: React.FC<TakeRowProps> = ({
  take,
  analysis,
  onAnalyze,
  onExport,
  onDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showJoReview, setShowJoReview] = useState(false);

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
    <div className="py-4 flex flex-col gap-3">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
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

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {!analysis ? (
            <Button size="sm" variant="secondary" onClick={onAnalyze}>
              Analyze Take
            </Button>
          ) : (
            <Button
              size="sm"
              variant={showJoReview ? "primary" : "secondary"}
              onClick={() => setShowJoReview(!showJoReview)}
            >
              Jo Review
            </Button>
          )}

          <Button size="sm" variant="secondary" onClick={onExport}>
            Export DAW
          </Button>

          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      {/* Analysis Metrics Badges */}
      {analysis && (
        <div className="flex flex-wrap items-center gap-3 p-2 bg-[var(--bg-2)] rounded border border-[var(--line)] text-xs font-mono">
          <span className="text-[var(--fg-2)]">Metrics:</span>
          <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-emerald-300">
            Timing: {analysis.timingAccuracyPct}%
          </span>
          <span className="px-2 py-0.5 rounded bg-sky-950/60 border border-sky-700/50 text-sky-300">
            Dynamics: {analysis.dynamicConsistencyPct}%
          </span>
          <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-700/50 text-purple-300">
            Intonation: {analysis.intonationAccuracyPct}%
          </span>
          <span className="text-[11px] text-[var(--fg-2)] italic ml-auto">
            {analysis.detectedTransients} pick strikes
          </span>
        </div>
      )}

      {/* Jo Constructive Feedback Card */}
      {showJoReview && analysis && (
        <div className="p-3 bg-[var(--bg-1)] border-l-2 border-l-[var(--accent)] border-t border-r border-b border-[var(--line)] rounded-[var(--radius-m)] text-xs font-mono space-y-2">
          <div className="flex items-center gap-2 font-bold text-[var(--accent)]">
            <span>Jo's Take Feedback</span>
          </div>
          <p className="text-[var(--fg-1)]">
            "Your groove is locking in really well on the rhythm parts (
            {analysis.timingAccuracyPct}% pocket accuracy)! On the dynamic side,
            watch your pick attack on the turnaround in bar 8 — keeping the
            right-hand velocity even will give the comp track more punch."
          </p>
          <div className="text-[11px] text-[var(--fg-2)] bg-[var(--bg-2)] p-2 rounded">
            <strong>Target Drill for Next Session:</strong> 5-minute metronome
            displacement drill at {take.tempo} BPM, playing 16th-note triplets
            with accented upstrokes.
          </div>
        </div>
      )}
    </div>
  );
};
