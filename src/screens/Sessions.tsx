import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { useEngineStore } from "../store/engine";

/** Take timestamps are either ISO strings or Rust's `secs.millis` epoch form. */
function takeDate(timestamp: string): Date | null {
  const epoch = /^\d+(\.\d+)?$/.test(timestamp)
    ? new Date(Number.parseFloat(timestamp) * 1000)
    : new Date(timestamp);
  return Number.isNaN(epoch.getTime()) ? null : epoch;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Consecutive calendar days with at least one take, ending today or yesterday. */
export function practiceStreakDays(
  takes: { timestamp: string }[],
  now = new Date(),
): number {
  const days = new Set<string>();
  for (const t of takes) {
    const d = takeDate(t.timestamp);
    if (d) days.add(dayKey(d));
  }
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function formatJamTime(totalSecs: number): string {
  if (totalSecs < 60) return `${Math.round(totalSecs)} s`;
  const h = Math.floor(totalSecs / 3600);
  const m = Math.round((totalSecs % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export const Sessions: React.FC = () => {
  const {
    takes,
    isRecording,
    latencySamples,
    startRecording,
    stopRecording,
    setLatencySamples,
    loadTakes,
    deleteTake,
    takeAnalysis,
    analyzeTake,
    exportTakeDaw,
    engineStatus,
  } = useEngineStore();

  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [latencyDraft, setLatencyDraft] = useState<string>("");

  useEffect(() => {
    loadTakes();
  }, [loadTakes]);

  useEffect(() => {
    setLatencyDraft(String(latencySamples));
  }, [latencySamples]);

  const sampleRate = engineStatus?.sample_rate || 48_000;
  const totalSecs = takes.reduce((acc, t) => acc + t.durationSecs, 0);
  const streak = practiceStreakDays(takes);

  const handleExport = async (takeId: string) => {
    const report = await exportTakeDaw(takeId);
    if (report) {
      const missing = report.missingStems.length
        ? ` (${report.missingStems.length} stem file(s) could not be found on disk)`
        : "";
      setExportMessage(
        `Wrote ${report.copiedStems.length} stem(s) and a tempo map to ${report.dir}${missing}.${report.reaperScript ? " For REAPER, follow REAPER-START-HERE.txt in that folder." : ""}`,
      );
    }
  };

  const commitLatency = () => {
    const n = Number.parseInt(latencyDraft, 10);
    if (Number.isNaN(n)) {
      setLatencyDraft(String(latencySamples));
      return;
    }
    void setLatencySamples(n);
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
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
              Practice streak:{" "}
              <strong className="text-amber-400">
                {streak === 0
                  ? "none yet"
                  : `${streak} day${streak === 1 ? "" : "s"}`}
              </strong>
            </span>
            <span>•</span>
            <span>
              Recorded jam time:{" "}
              <strong className="text-[var(--fg-0)]">
                {formatJamTime(totalSecs)}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label
            className="flex items-center gap-2 text-xs font-mono text-[var(--fg-2)]"
            title="Samples trimmed from the start of the guitar stem so it lines up with the band. Automatic loopback measurement is not built yet; measure once in your DAW and type it here."
          >
            <span>Guitar offset</span>
            <input
              className="w-20 bg-[var(--bg-2)] border border-[var(--line)] rounded px-2 py-1 text-[var(--fg-0)] text-right"
              inputMode="numeric"
              value={latencyDraft}
              onChange={(e) => setLatencyDraft(e.target.value)}
              onBlur={commitLatency}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLatency();
              }}
            />
            <span className="text-[var(--accent)] font-semibold">
              smp · {((latencySamples * 1000) / sampleRate).toFixed(1)} ms
            </span>
          </label>

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
            Export for Logic / REAPER
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
          <p className="text-[var(--fg-1)]">{analysis.summary}</p>
          <div className="text-[11px] text-[var(--fg-2)] bg-[var(--bg-2)] p-2 rounded">
            <strong>Suggested drill:</strong>{" "}
            {drillFor(analysis, Math.round(take.tempo))}
          </div>
          <p className="text-[10px] text-[var(--fg-2)]">
            Measured from the recorded DI stem against the take's tempo grid.
            Timing and dynamics come from pick transients; intonation is still a
            rough estimate.
          </p>
        </div>
      )}
    </div>
  );
};

/** Picks one drill from the weakest of the three measured scores. */
export function drillFor(
  a: import("../ipc/contract").TakeAnalysis,
  tempo: number,
): string {
  if (a.detectedTransients < 8) {
    return "Too few pick attacks were detected to judge this take. Record at least a full chorus with the DI channel selected.";
  }
  const slow = Math.max(40, tempo - 20);
  const weakest = Math.min(
    a.timingAccuracyPct,
    a.dynamicConsistencyPct,
    a.intonationAccuracyPct,
  );
  if (weakest === a.timingAccuracyPct) {
    return `Five minutes with only the click at ${slow} BPM, muting the band, landing every downbeat before bringing the tempo back to ${tempo}.`;
  }
  if (weakest === a.dynamicConsistencyPct) {
    return `Play the form once at ${tempo} BPM at a single, even pick attack, then once accenting only beats 2 and 4, listening back to the DI stem for evenness.`;
  }
  return `Loop the section with the most bends at ${slow} BPM and check every bend against the tuner before releasing it.`;
}
