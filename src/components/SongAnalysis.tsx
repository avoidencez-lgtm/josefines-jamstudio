import { useState } from "react";
import { chordPassages, readSongAnalysis } from "../lib/songAnalysis";
import { Button } from "./Button";

export function SongAnalysis({ value }: { value: unknown }) {
  const [page, setPage] = useState(0);
  const analysis = readSongAnalysis(value);
  if (!analysis)
    return value ? (
      <p className="workspace-note">
        Saved analysis is unreadable or from another version. Analyze again to
        replace it.
      </p>
    ) : null;
  const passages = chordPassages(analysis);
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(passages.length / 16) - 1),
  );
  return (
    <section className="workspace-stack" aria-label="Saved song analysis">
      <h3>Estimated harmony</h3>
      <p className="workspace-note">
        {analysis.bpm === null
          ? "Tempo not found"
          : `${analysis.bpm.toFixed(1)} BPM`}{" "}
        · {analysis.key ?? "Key not found"} · Local estimate, low confidence
      </p>
      <p className="workspace-note">
        Check these estimates by ear. Steady tempo and major/minor triads only;
        half/double tempo is possible. Downbeats, sections and stems have not
        been detected.
      </p>
      <ol
        aria-label="Estimated chord passages"
        className="grid grid-cols-2 gap-2"
      >
        {passages.slice(current * 16, (current + 1) * 16).map((part) => (
          <li key={part.start} className="border-b border-[var(--line)] py-2">
            <strong>{part.chord ?? "Unknown chord"}</strong>
            <span className="text-sm text-[var(--fg-2)] ml-3 font-mono">
              {part.start.toFixed(1)}–{part.end.toFixed(1)} s
            </span>
          </li>
        ))}
      </ol>
      {passages.length > 16 && (
        <div className="workspace-actions">
          <Button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous passages
          </Button>
          <span className="workspace-note">
            {current * 16 + 1}–{Math.min((current + 1) * 16, passages.length)}{" "}
            of {passages.length}
          </span>
          <Button
            disabled={(current + 1) * 16 >= passages.length}
            onClick={() => setPage(current + 1)}
          >
            Next passages
          </Button>
        </div>
      )}
    </section>
  );
}
