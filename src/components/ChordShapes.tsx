import { useMemo, useState } from "react";
import { chordVoicings } from "../lib/theory/voicings";
import { ChordDiagram } from "./ChordDiagram";
import { Panel } from "./Panel";

const SHAPES = 3;

/**
 * Where the chord now and the chord next sit on the neck: the easiest playable
 * shapes, root in amber. Theory in standard tuning, never a transcription of
 * what was played.
 */
export function ChordShapes({
  now,
  next = null,
  compact = false,
}: {
  now: string;
  next?: string | null;
  compact?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const shapes = useMemo(() => chordVoicings(now, SHAPES), [now]);
  const nextShape = useMemo(
    () => (next && next !== now ? chordVoicings(next, 1)[0] : undefined),
    [next, now],
  );
  const chosen = Math.min(index, Math.max(0, shapes.length - 1));
  const current = shapes[chosen];
  const body = (
    <div className="chord-shapes">
      {current ? (
        <figure className="chord-shape" data-tone="primary">
          <ChordDiagram symbol={now} voicing={current} compact={compact} />
          <figcaption>
            <strong>{now}</strong>
            <span>{current.shape}</span>
          </figcaption>
        </figure>
      ) : (
        <p className="chord-shapes-note">
          {now.trim() ? `No shape for ${now}.` : "Waiting for a chord."}
        </p>
      )}
      {nextShape && next && (
        <figure className="chord-shape" data-tone="secondary">
          <ChordDiagram
            symbol={next}
            voicing={nextShape}
            compact
            tone="secondary"
          />
          <figcaption>
            <strong>{next}</strong>
            <span>next</span>
          </figcaption>
        </figure>
      )}
      {shapes.length > 1 && (
        <fieldset className="chord-shape-picker">
          <legend className="sr-only">Shapes for {now}</legend>
          {shapes.map((shape, i) => (
            <button
              type="button"
              key={shape.shape}
              aria-pressed={i === chosen}
              aria-label={`Shape ${i + 1}: ${shape.shape}`}
              onClick={() => setIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </fieldset>
      )}
      {!compact && (
        <p className="chord-shapes-note">
          Root in amber, easiest shape first. Theory in standard tuning, not a
          transcription of what was played.
        </p>
      )}
    </div>
  );
  return compact ? body : <Panel title="Shapes">{body}</Panel>;
}
