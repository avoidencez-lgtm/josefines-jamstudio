import {
  CassetteTape,
  Export,
  Play,
  Question,
  Star,
} from "@phosphor-icons/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { WorkspaceHeader } from "../components/Workspace";
import { ipc, isPreview } from "../ipc/client";
import { useWriting } from "../lib/originals";
import {
  drillFor,
  formatJamTime,
  practiceStreakDays,
  takeDate,
  takeMeasurements,
} from "../lib/sessions/stats";
import { useEngineStore } from "../store/engine";

export const Sessions: React.FC<{ onHelp: (topic: string) => void }> = ({
  onHelp,
}) => {
  const {
    takes,
    isRecording,
    recordingError,
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
  } = useEngineStore(
    useShallow((s) => ({
      takes: s.takes,
      isRecording: s.isRecording,
      recordingError: s.recordingError,
      latencySamples: s.latencySamples,
      startRecording: s.startRecording,
      stopRecording: s.stopRecording,
      setLatencySamples: s.setLatencySamples,
      loadTakes: s.loadTakes,
      deleteTake: s.deleteTake,
      takeAnalysis: s.takeAnalysis,
      analyzeTake: s.analyzeTake,
      exportTakeDaw: s.exportTakeDaw,
      engineStatus: s.engineStatus,
    })),
  );

  const [query, setQuery] = useState("");
  const [favourites, setFavourites] = useState(false);
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

  const visibleTakes = takes.filter(
    (t) =>
      (!favourites || t.favourite) &&
      `${t.id} ${t.chartId} ${t.styleId} ${t.tempo} ${t.notes}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
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
      <WorkspaceHeader
        screen="sessions"
        title="Keep the take that matters."
        description="Listen back, mark the keepers, layer a guitar part, or carry the stems into your DAW."
      />
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
              Sessions, Takes & DAW Export
            </h2>
            <StatusPill
              status={recordingError ? "error" : isRecording ? "live" : "idle"}
              label={
                recordingError
                  ? "Recording stopped"
                  : isRecording
                    ? "Recording Take"
                    : "Idle"
              }
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
              {recordingError ? "Save partial take" : "Stop Recording"}
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

      <div className="workspace-search">
        <label>
          Find a take
          <input
            type="search"
            aria-label="Search takes"
            placeholder="Song, style, tempo or notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button
          aria-pressed={favourites}
          onClick={() => setFavourites(!favourites)}
        >
          <Star
            size={17}
            weight={favourites ? "fill" : "regular"}
            aria-hidden="true"
          />
          {favourites ? "Favourites only" : "All takes"}
        </Button>
      </div>
      {/* Takes List */}
      <Panel
        title={`Recorded takes (${visibleTakes.length} of ${takes.length})`}
      >
        {takes.length > 0 && !visibleTakes.length && (
          <p className="workspace-note py-8">
            No takes match this search. Clear the search or show all takes.
          </p>
        )}
        {takes.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-[var(--fg-2)] space-y-3 font-mono text-xs">
            <CassetteTape size={40} aria-hidden="true" />
            <p>No recordings yet.</p>
            <p className="text-[var(--fg-1)]">
              Hit <strong>Record New Take</strong> to record multi-track stems.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {visibleTakes.map((take) => (
              <TakeRow
                key={take.id}
                take={take}
                analysis={takeAnalysis[take.id]}
                onAnalyze={() => analyzeTake(take.id)}
                onExport={() => handleExport(take.id)}
                onDelete={() => deleteTake(take.id)}
                onHelp={() => onHelp("sessions.find-the-keeper")}
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
  onHelp: () => void;
}

const TakeRow: React.FC<TakeRowProps> = ({
  take,
  analysis,
  onAnalyze,
  onExport,
  onDelete,
  onHelp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const song = useWriting((s) => s.song);
  const recording = useEngineStore((s) => s.isRecording);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      useEngineStore.getState().notify("error", String(e));
    } finally {
      setBusy(false);
    }
  };
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
    ctx.fillStyle = getComputedStyle(canvas)
      .getPropertyValue("--accent")
      .trim();

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
      <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
        <div className="flex flex-col gap-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[var(--fg-0)]">
              {takeDate(take.timestamp)?.toLocaleString([], {
                dateStyle: "medium",
                timeStyle: "short",
              }) ?? take.id}
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
            role="img"
            aria-label={
              take.waveformPeaks?.length
                ? "Recorded waveform"
                : "No waveform available"
            }
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button
            size="sm"
            disabled={busy || isPreview || recording}
            onClick={() =>
              void run(() =>
                ipc.invoke("clip_audition", {
                  spec: {
                    takeId: take.id,
                    label: "Preview",
                    trimStart: 0,
                    trimEnd: take.durationSecs,
                    startBar: 1,
                    repeats: 1,
                    gain: 1,
                    muted: false,
                  },
                }),
              )
            }
          >
            <Play size={16} aria-hidden="true" /> Listen to guitar
          </Button>
          <Button
            size="sm"
            disabled={busy || isPreview}
            aria-pressed={Boolean(take.favourite)}
            onClick={() =>
              void run(async () => {
                await ipc.invoke("takes_favourite", {
                  takeId: take.id,
                  favourite: !take.favourite,
                });
                await useEngineStore.getState().loadTakes();
              })
            }
          >
            <Star
              size={16}
              weight={take.favourite ? "fill" : "regular"}
              aria-hidden="true"
            />
            {take.favourite ? "Favourite" : "Keep"}
          </Button>
          <Button
            size="sm"
            disabled={
              !song || recording || busy || (song?.body.clips.length ?? 0) >= 16
            }
            title={
              song
                ? "Attach to the song open in Write"
                : "Open an original song in Write first"
            }
            onClick={() => {
              useWriting.getState().attach(take);
              useWriting.setState({ view: "record" });
              useEngineStore.getState().setScreen("originals");
            }}
          >
            Layer in Write
          </Button>
          {!analysis || analysis.meanGridDistanceMs === undefined ? (
            <Button size="sm" variant="secondary" onClick={onAnalyze}>
              {analysis || take.analysis !== undefined
                ? "Analyze again"
                : "Analyze Take"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant={showJoReview ? "primary" : "secondary"}
              aria-expanded={showJoReview}
              onClick={() => setShowJoReview(!showJoReview)}
            >
              Evidence & exercise
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={onHelp}>
            <Question size={16} aria-hidden="true" /> Analysis help
          </Button>
          <Button size="sm" variant="secondary" onClick={onExport}>
            <Export size={16} aria-hidden="true" /> Export stems
          </Button>

          {confirmDelete ? (
            <>
              <span className="workspace-note">
                Delete this take permanently?
              </span>
              <Button
                size="sm"
                variant="danger"
                disabled={recording || busy}
                onClick={onDelete}
              >
                Delete take
              </Button>
              <Button size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={recording || busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete…
            </Button>
          )}
        </div>
      </div>

      {take.analysis !== undefined && !analysis && (
        <p className="text-xs text-[var(--fg-1)]">
          Saved analysis is unavailable or from a different analyzer version.
          Analyze again to refresh the measurements. The recording is unchanged.
        </p>
      )}
      {analysis && (
        <dl
          aria-label="Take measurements"
          className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 p-3 bg-[var(--bg-2)] rounded border border-[var(--line)] text-xs"
        >
          {takeMeasurements(analysis).map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-2">
              <dt className="text-[var(--fg-1)]">{label}</dt>
              <dd className="font-mono text-[var(--fg-0)]">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Jo Constructive Feedback Card */}
      {showJoReview && analysis && (
        <div className="p-3 bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--radius-m)] text-xs font-mono space-y-2">
          <div className="flex items-center gap-2 font-bold text-[var(--accent)]">
            <span>Local take analysis</span>
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
          <Button size="sm" onClick={onAnalyze}>
            Analyze again
          </Button>
        </div>
      )}
    </div>
  );
};
