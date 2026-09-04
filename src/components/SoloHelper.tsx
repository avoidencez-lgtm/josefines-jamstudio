import type React from "react";
import { useMemo, useState } from "react";
import {
  type ScaleSuggestion,
  fretMarks,
  suggestForChord,
} from "../lib/theory/solo";
import { Panel } from "./Panel";

export interface SoloHelperProps {
  chord: string;
  nextChord?: string | null;
  keyTonic?: number;
  mode?: "major" | "minor";
}

const STRING_LABELS = ["E", "A", "D", "G", "B", "e"];
const FRETS = 15;
const FRET_NUMBERS = Array.from({ length: FRETS + 1 }, (_, i) => i);

/**
 * "What can I play over this?" for the chord that is sounding right now: chord tones,
 * guide tones, a ranked scale list and a fretboard with the chosen scale lit up.
 */
export const SoloHelper: React.FC<SoloHelperProps> = ({
  chord,
  nextChord,
  keyTonic,
  mode,
}) => {
  const [scaleIdx, setScaleIdx] = useState(0);
  const [useKeyScale, setUseKeyScale] = useState(false);

  const suggestion = useMemo(
    () =>
      suggestForChord(
        chord,
        keyTonic !== undefined && mode ? { keyTonic, mode } : undefined,
      ),
    [chord, keyTonic, mode],
  );
  const nextSuggestion = useMemo(
    () =>
      nextChord
        ? suggestForChord(
            nextChord,
            keyTonic !== undefined && mode ? { keyTonic, mode } : undefined,
          )
        : null,
    [nextChord, keyTonic, mode],
  );

  if (!suggestion) {
    return (
      <Panel title="Soloing Helper">
        <p className="text-xs font-mono text-[var(--fg-2)]">
          Waiting for a chord{chord ? ` (cannot read "${chord}")` : ""}.
        </p>
      </Panel>
    );
  }

  const scale: ScaleSuggestion | null = useKeyScale
    ? suggestion.keyScale
    : (suggestion.scales[Math.min(scaleIdx, suggestion.scales.length - 1)] ??
      null);

  const chordSet = new Set(suggestion.chordTones);
  const guideSet = new Set(suggestion.guideTones);
  const rootName = suggestion.chordTones[0];
  const marks = scale ? fretMarks(scale.chromas, FRETS) : [];
  const chromaToName = new Map<number, string>();
  if (scale)
    scale.chromas.forEach((c, i) => chromaToName.set(c, scale.notes[i]));

  return (
    <Panel title="Soloing Helper">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--fg-2)] font-mono mb-1">
              Chord tones
            </div>
            <div className="flex gap-1.5">
              {suggestion.chordTones.map((n) => (
                <span
                  key={n}
                  className={`px-2 py-0.5 rounded font-mono text-sm border ${
                    guideSet.has(n)
                      ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--fg-0)]"
                      : "bg-[var(--bg-2)] border-[var(--line)] text-[var(--fg-0)]"
                  }`}
                  title={
                    guideSet.has(n)
                      ? "Guide tone: defines the chord's colour"
                      : ""
                  }
                >
                  {n}
                </span>
              ))}
            </div>
            <div className="text-[10px] text-[var(--fg-2)] font-mono mt-1">
              Highlighted: guide tones (
              {suggestion.guideTones.join(", ") || "—"}). Land on these.
            </div>
          </div>
          {suggestion.avoidNotes.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--fg-2)] font-mono mb-1">
                Handle with care
              </div>
              <div className="flex gap-1.5">
                {suggestion.avoidNotes.map((n) => (
                  <span
                    key={n}
                    className="px-2 py-0.5 rounded font-mono text-sm border border-dashed border-[var(--line)] text-[var(--fg-2)]"
                  >
                    {n}
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-[var(--fg-2)] font-mono mt-1">
                Pass through, don't sit on them.
              </div>
            </div>
          )}
          {nextSuggestion && nextChord && nextChord !== chord && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--fg-2)] font-mono mb-1">
                Aim for (next: {nextChord})
              </div>
              <div className="flex gap-1.5">
                {nextSuggestion.guideTones.map((n) => (
                  <span
                    key={n}
                    className="px-2 py-0.5 rounded font-mono text-sm border border-[var(--line)] text-[var(--fg-1)]"
                  >
                    {n}
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-[var(--fg-2)] font-mono mt-1">
                Resolve into the next chord's guide tones on the downbeat.
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--fg-2)] font-mono mb-1.5">
            Scales that fit
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestion.scales.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setScaleIdx(i);
                  setUseKeyScale(false);
                }}
                className={`px-2.5 py-1 rounded text-xs font-mono border cursor-pointer transition-colors ${
                  !useKeyScale && i === scaleIdx
                    ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--fg-0)]"
                    : "bg-[var(--bg-2)] border-[var(--line)] text-[var(--fg-1)] hover:text-[var(--fg-0)]"
                }`}
                title={s.why}
              >
                {s.name}
              </button>
            ))}
            {suggestion.keyScale && (
              <button
                type="button"
                onClick={() => setUseKeyScale(true)}
                className={`px-2.5 py-1 rounded text-xs font-mono border cursor-pointer transition-colors ${
                  useKeyScale
                    ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--fg-0)]"
                    : "bg-[var(--bg-2)] border-dashed border-[var(--line)] text-[var(--fg-1)] hover:text-[var(--fg-0)]"
                }`}
                title={suggestion.keyScale.why}
              >
                Whole tune: {suggestion.keyScale.name}
              </button>
            )}
          </div>
          {scale && (
            <p className="text-xs text-[var(--fg-1)] mt-2 font-mono">
              <span className="text-[var(--fg-0)]">
                {scale.notes.join("  ")}
              </span>
              <span className="text-[var(--fg-2)]"> — {scale.why}</span>
            </p>
          )}
        </div>

        {scale && (
          <div className="overflow-x-auto">
            <div
              className="grid gap-px font-mono text-[10px] min-w-[640px]"
              style={{
                gridTemplateColumns: `28px repeat(${FRETS + 1}, minmax(36px, 1fr))`,
              }}
            >
              <div />
              {FRET_NUMBERS.map((f) => (
                <div
                  key={`fret-${f}`}
                  className={`text-center pb-1 ${[3, 5, 7, 9, 12, 15].includes(f) ? "text-[var(--fg-1)]" : "text-[var(--fg-2)]"}`}
                >
                  {f}
                </div>
              ))}
              {[5, 4, 3, 2, 1, 0].map((string) => (
                <FretRow
                  key={`string-${string}`}
                  label={STRING_LABELS[string]}
                  marks={marks.filter((m) => m.string === string)}
                  chromaToName={chromaToName}
                  chordSet={chordSet}
                  guideSet={guideSet}
                  rootName={rootName}
                />
              ))}
            </div>
            <div className="flex gap-4 text-[10px] font-mono text-[var(--fg-2)] mt-2">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-[var(--accent)] inline-block" />{" "}
                root
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-[var(--ok)] inline-block" />{" "}
                guide tone
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-[var(--fg-1)] inline-block" />{" "}
                chord tone
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full border border-[var(--fg-2)] inline-block" />{" "}
                scale note
              </span>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

const FretRow: React.FC<{
  label: string;
  marks: { fret: number; chroma: number }[];
  chromaToName: Map<number, string>;
  chordSet: Set<string>;
  guideSet: Set<string>;
  rootName: string;
}> = ({ label, marks, chromaToName, chordSet, guideSet, rootName }) => {
  const byFret = new Map(marks.map((m) => [m.fret, m.chroma]));
  return (
    <>
      <div className="text-[var(--fg-2)] flex items-center justify-center border-r border-[var(--line)]">
        {label}
      </div>
      {FRET_NUMBERS.map((f) => {
        const chroma = byFret.get(f);
        const name =
          chroma !== undefined ? chromaToName.get(chroma) : undefined;
        let cls = "border border-[var(--fg-2)] text-[var(--fg-1)]";
        if (name === rootName)
          cls = "bg-[var(--accent)] text-[var(--bg-0)] font-semibold";
        else if (name && guideSet.has(name))
          cls = "bg-[var(--ok)] text-[var(--bg-0)] font-semibold";
        else if (name && chordSet.has(name))
          cls = "bg-[var(--fg-1)] text-[var(--bg-0)]";
        return (
          <div
            key={`f-${f}`}
            className={`h-7 flex items-center justify-center relative ${
              f === 0
                ? "border-r-2 border-[var(--fg-2)]"
                : "border-r border-[var(--line)]"
            }`}
          >
            <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--line)]" />
            {name && (
              <span
                className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${cls}`}
              >
                {name}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
};
