import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ipc, isPreview } from "../ipc/client";
import type { ReferenceSection } from "../ipc/contract";
import { type MediaAsset, useMedia } from "../lib/media";
import { readSongAnalysis } from "../lib/songAnalysis";
import { Button } from "./Button";

const savedSchema = z.object({
  schemaVersion: z.literal(1),
  origin: z.literal("confirmed-local"),
  beatsPerBar: z.number().int().min(2).max(12),
  beats: z.array(z.number().finite().min(0).max(1200)).min(3).max(5000),
  sections: z
    .array(
      z.object({
        id: z.string().max(100),
        label: z.string().max(80),
        startBar: z.number().int().positive(),
        endBar: z.number().int().positive(),
      }),
    )
    .max(64),
});

/** User confirmation is explicit; local estimates do not identify downbeats. */
export function ReferenceGridEditor({
  song,
  locked,
}: { song: MediaAsset; locked: boolean }) {
  const m = useMedia();
  const analysis = useMemo(
    () => readSongAnalysis(song.songAnalysis),
    [song.songAnalysis],
  );
  const saved = useMemo(
    () => savedSchema.safeParse(song.referenceGrid),
    [song.referenceGrid],
  );
  const [first, setFirst] = useState(
    saved.success && analysis
      ? Math.max(1, analysis.beats.indexOf(saved.data.beats[0]) + 1)
      : 1,
  );
  const [meter, setMeter] = useState(
    saved.success ? saved.data.beatsPerBar : 4,
  );
  const [sections, setSections] = useState<ReferenceSection[]>(
    saved.success ? saved.data.sections : [],
  );
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setConfirmed(false);
    setFirst(
      saved.success && analysis
        ? Math.max(1, analysis.beats.indexOf(saved.data.beats[0]) + 1)
        : 1,
    );
    setMeter(saved.success ? saved.data.beatsPerBar : 4);
    setSections(saved.success ? saved.data.sections : []);
  }, [analysis, saved]);
  const bars = analysis
    ? Math.max(0, Math.floor((analysis.beats.length - first) / meter))
    : 0;
  const disabled = locked || isPreview || !analysis;
  const edit = (index: number, patch: Partial<ReferenceSection>) => {
    setConfirmed(false);
    setSections(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  return (
    <details className="workspace-stack">
      <summary className="cursor-pointer text-sm">
        Confirm bars & sections
      </summary>
      <p className="workspace-note">
        Local analysis estimates beats, not downbeats or song sections. Listen
        first, choose which estimated beat starts bar 1, then name the sections.
        This map keeps the estimated beat times; confirmation does not improve
        their accuracy.
      </p>
      {!analysis && (
        <p className="workspace-note">
          Analyze tempo & chords first. A confirmed map needs at least one
          complete bar plus its ending downbeat.
        </p>
      )}
      <form
        aria-label="Confirm reference bars and sections"
        className="workspace-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled || !confirmed || !analysis) return;
          void m.work("Saving confirmed reference map", async () => {
            await ipc.invoke("media_reference_grid_save", {
              assetId: song.id,
              confirmation: {
                sourceHash: analysis.sourceHash,
                expectedBeats: analysis.beats,
                firstDownbeat: first - 1,
                beatsPerBar: meter,
                sections,
                confirmed,
              },
            });
            await m.refresh();
            useMedia.setState({
              message:
                "Confirmed map saved. Load this reference again to use its bars and section loops.",
            });
          });
        }}
      >
        <fieldset disabled={disabled} className="workspace-stack">
          <legend className="sr-only">Reference map confirmation</legend>
          <div className="workspace-actions">
            <label className="room-tool-field">
              First downbeat · estimated beat number
              <input
                type="number"
                required
                min={1}
                max={analysis?.beats.length ?? 1}
                step={1}
                value={first}
                onChange={(e) => {
                  setFirst(Number(e.target.value));
                  setConfirmed(false);
                }}
              />
            </label>
            <label className="room-tool-field">
              Estimated beats per bar
              <select
                value={meter}
                onChange={(e) => {
                  setMeter(Number(e.target.value));
                  setConfirmed(false);
                }}
              >
                {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="workspace-note">
            Bar 1 starts at {analysis?.beats[first - 1]?.toFixed(3) ?? "—"}{" "}
            source seconds. {bars} complete bars available. Pickup audio and the
            incomplete ending remain outside this map. For compound meters,
            count the beats detected by the analysis.
          </p>
          {sections.map((section, index) => (
            <div key={section.id} className="workspace-actions">
              <label className="room-tool-field">
                Section {index + 1} name
                <input
                  required
                  maxLength={80}
                  value={section.label}
                  onChange={(e) => edit(index, { label: e.target.value })}
                />
              </label>
              <label className="room-tool-field">
                Start bar
                <input
                  type="number"
                  required
                  min={1}
                  max={bars}
                  step={1}
                  value={section.startBar}
                  onChange={(e) =>
                    edit(index, { startBar: Number(e.target.value) })
                  }
                />
              </label>
              <label className="room-tool-field">
                End before bar
                <input
                  type="number"
                  required
                  min={section.startBar + 1}
                  max={bars + 1}
                  step={1}
                  value={section.endBar}
                  onChange={(e) =>
                    edit(index, { endBar: Number(e.target.value) })
                  }
                />
              </label>
              <Button
                type="button"
                onClick={() => {
                  setSections(sections.filter((_, i) => i !== index));
                  setConfirmed(false);
                }}
              >
                Remove section {index + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            disabled={bars === 0 || sections.length >= 64}
            onClick={() => {
              setSections([
                ...sections,
                {
                  id: crypto.randomUUID(),
                  label: "",
                  startBar: sections.at(-1)?.endBar ?? 1,
                  endBar: bars + 1,
                },
              ]);
              setConfirmed(false);
            }}
          >
            Add section
          </Button>
          <p className="workspace-note">
            Enter sections in time order without overlap. “Start 1, end before
            3” includes bars 1 and 2. Names such as Verse or Solo are yours, not
            automatic detections.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I checked the first downbeat, beat grouping and section boundaries
            by listening.
          </label>
        </fieldset>
        <Button type="submit" disabled={disabled || !confirmed || bars < 1}>
          Save confirmed map
        </Button>
      </form>
    </details>
  );
}
