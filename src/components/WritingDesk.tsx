import { ArrowLeft, ArrowRight, Copy, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { keyName } from "../lib/chart/notes";
import {
  arrangementRanges,
  defaultSection,
  sectionBars,
  useWriting,
} from "../lib/originals";
import {
  PHRASE_MOVES,
  arrangedBars,
  chordNotes,
  duplicateSection,
  harmonyChoices,
  setSectionEnergy,
  transformPhrase,
} from "../lib/writingTools";
import { Button } from "./Button";

export function ArrangementDesk() {
  const w = useWriting();
  const song = w.song;
  if (!song) return null;
  const chart = song.body.chart;
  const selected =
    chart.sections.find((s) => s.id === w.selected) ?? chart.sections[0];
  const ranges = arrangementRanges(chart);
  const total = arrangedBars(chart);
  const seconds = Math.round((total * 240) / chart.defaultBpm);
  const select = (id: string) => w.select(id);
  return (
    <section className="write-arrange" aria-label="Song arrangement">
      <div className="song-section-heading">
        <div className="write-inline">
          <h2>Song map</h2>
          <span className="write-meta">
            {total} bars · {Math.floor(seconds / 60)}:
            {String(Math.round(seconds % 60)).padStart(2, "0")} at{" "}
            {chart.defaultBpm} BPM
          </span>
        </div>
        <div className="song-actions">
          <Button
            size="sm"
            onClick={() => {
              const id = `section-${crypto.randomUUID()}`;
              w.edit((b) => {
                b.chart.sections.push({
                  id,
                  name: "New section",
                  bars: structuredClone(selected.bars),
                });
                b.sections[id] = defaultSection();
                b.chart.arrangement.push({ sectionId: id, repeats: 1 });
              });
              if (useWriting.getState().song?.body.sections[id]) select(id);
            }}
          >
            <Plus size={15} /> Add section
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const id = `section-${crypto.randomUUID()}`;
              w.edit((b) => duplicateSection(b, selected.id, id));
              if (useWriting.getState().song?.body.sections[id]) select(id);
            }}
          >
            <Copy size={15} /> Make variation
          </Button>
        </div>
      </div>
      <div className="write-timeline">
        {chart.arrangement.map((a, i) => {
          const s = chart.sections.find((s) => s.id === a.sectionId);
          if (!s) return null;
          const parts = song.body.sections[s.id].parts;
          const energy = Math.round(
            (parts.reduce((sum, p) => sum + (p.muted ? 0 : p.intensity), 0) /
              parts.length) *
              100,
          );
          return (
            <button
              type="button"
              key={`${a.sectionId}-${i}`}
              className="write-region"
              aria-pressed={selected.id === s.id}
              aria-label={`${s.name}, bars ${ranges[i].startBar} to ${ranges[i].endBar - 1}`}
              style={{ flexGrow: s.bars.length * a.repeats }}
              onClick={() => select(s.id)}
            >
              <span className="write-meta">
                {ranges[i].startBar}–{ranges[i].endBar - 1}{" "}
                {a.repeats > 1 ? `· ×${a.repeats}` : ""}
              </span>
              <strong>{s.name}</strong>
              <span className="write-meta">{energy}% band intensity</span>
              <span className="write-energy-track">
                <span style={{ transform: `scaleX(${energy / 100})` }} />
              </span>
            </button>
          );
        })}
      </div>
      <details className="write-disclosure">
        <summary>Edit order and repeats</summary>
        {chart.arrangement.map((a, i) => (
          <div className="write-order-row" key={`${a.sectionId}-${i}`}>
            <span>
              {i + 1}. {chart.sections.find((s) => s.id === a.sectionId)?.name}
            </span>
            <label>
              Repeats{" "}
              <select
                aria-label={`Repeats for form entry ${i + 1}`}
                value={a.repeats}
                onChange={(e) =>
                  w.edit((b) => {
                    b.chart.arrangement[i].repeats = Number(e.target.value);
                  })
                }
              >
                {Array.from({ length: 64 }, (_, n) => n + 1).map((count) => (
                  <option key={count}>{count}</option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              aria-label={`Move form entry ${i + 1} earlier`}
              disabled={!i}
              onClick={() =>
                w.edit((b) => {
                  [b.chart.arrangement[i - 1], b.chart.arrangement[i]] = [
                    b.chart.arrangement[i],
                    b.chart.arrangement[i - 1],
                  ];
                })
              }
            >
              <ArrowLeft size={16} />
            </Button>
            <Button
              size="sm"
              aria-label={`Move form entry ${i + 1} later`}
              disabled={i === chart.arrangement.length - 1}
              onClick={() =>
                w.edit((b) => {
                  [b.chart.arrangement[i + 1], b.chart.arrangement[i]] = [
                    b.chart.arrangement[i],
                    b.chart.arrangement[i + 1],
                  ];
                })
              }
            >
              <ArrowRight size={16} />
            </Button>
            <Button
              size="sm"
              disabled={chart.arrangement.length === 1}
              onClick={() =>
                w.edit((b) => {
                  b.chart.arrangement.splice(i, 1);
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <label>
          Add an existing section
          <select
            value=""
            onChange={(e) => {
              if (e.target.value)
                w.edit((b) => {
                  b.chart.arrangement.push({
                    sectionId: e.target.value,
                    repeats: 1,
                  });
                });
            }}
          >
            <option value="">Choose a section</option>
            {chart.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <p className="song-help">
          Repeated sections share chords, lyrics and band settings. Make a
          variation for an independent edit. Guitar layers stay at their
          numbered bars when you rearrange.
        </p>
      </details>
    </section>
  );
}

export function HarmonyDesk() {
  const w = useWriting();
  const song = w.song;
  const [position, setPosition] = useState({ bar: 0, chord: 0 });
  const [family, setFamily] = useState<"key" | "borrowed" | "dominant">("key");
  const [error, setError] = useState("");
  if (!song) return null;
  const section =
    song.body.chart.sections.find((s) => s.id === w.selected) ??
    song.body.chart.sections[0];
  const barIndex = Math.min(position.bar, section.bars.length - 1);
  const bar = section.bars[barIndex];
  const chordIndex = Math.min(position.chord, bar.length - 1);
  const current = bar[chordIndex];
  const previous =
    bar[chordIndex - 1]?.chord ??
    section.bars[barIndex - 1]?.at(-1)?.chord ??
    "";
  const choices = harmonyChoices(song.body.chart, previous, family);
  const notes = chordNotes(current.chord);
  const barText = bar.map((c) => `${c.chord}:${c.beats}`).join(" ");
  const editBar = (text: string) => {
    try {
      const bars = sectionBars(text);
      if (bars.length !== 1)
        throw new Error(
          "Enter exactly one bar here. Use Add bar for a longer phrase.",
        );
      w.edit((b) => {
        const s = b.chart.sections.find((s) => s.id === section.id);
        if (s) s.bars[barIndex] = bars[0];
      });
      setError("");
      setPosition({ bar: barIndex, chord: 0 });
    } catch (e) {
      setError(`Not applied: ${String(e)}. Your saved bar is unchanged.`);
    }
  };
  return (
    <div className="write-harmony">
      <section className="write-score" aria-label="Chord grid">
        <div className="song-section-heading">
          <h2>{section.name} chords</h2>
          <div className="song-actions">
            <Button
              size="sm"
              onClick={() =>
                w.edit((b) => {
                  const s = b.chart.sections.find((s) => s.id === section.id);
                  if (s) s.bars.push(structuredClone(s.bars[barIndex]));
                })
              }
            >
              <Plus size={15} /> Add bar
            </Button>
            <details className="write-transform">
              <summary>Transform phrase</summary>
              <div className="song-actions">
                {Object.entries(PHRASE_MOVES).map(([id, label]) => (
                  <Button
                    size="sm"
                    key={id}
                    onClick={() =>
                      w.edit((b) =>
                        transformPhrase(
                          b,
                          section.id,
                          id as keyof typeof PHRASE_MOVES,
                        ),
                      )
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="song-help">
                Changes this section everywhere it repeats. Undo restores it.
              </p>
            </details>
          </div>
        </div>
        <div className="write-bars">
          {section.bars.map((b, i) => (
            <div key={`${section.id}-bar-${i}`} className="write-bar">
              <span className="write-bar-number">{i + 1}</span>
              <div className="write-beats">
                {b.map((c, j) => (
                  <button
                    type="button"
                    key={`${section.id}-${i}-chord-${j}`}
                    style={{ flexGrow: c.beats }}
                    aria-pressed={i === barIndex && j === chordIndex}
                    aria-label={`Bar ${i + 1}, chord ${j + 1}: ${c.chord}, ${c.beats} beats`}
                    onClick={() => {
                      setPosition({ bar: i, chord: j });
                      setError("");
                    }}
                  >
                    <strong>{c.chord}</strong>
                    <span>
                      {c.beats} {c.beats === 1 ? "beat" : "beats"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="write-beat-ruler" aria-hidden="true">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
              </div>
            </div>
          ))}
        </div>
        <div className="write-bar-editor">
          <label>
            Bar {barIndex + 1} · chord symbols and beats
            <input
              key={`${section.id}-${barIndex}-${barText}`}
              defaultValue={barText}
              maxLength={500}
              aria-describedby="write-bar-help"
              onBlur={(e) => {
                if (e.target.value !== barText) {
                  editBar(e.target.value);
                  e.target.value =
                    useWriting
                      .getState()
                      .song?.body.chart.sections.find(
                        (s) => s.id === section.id,
                      )
                      ?.bars[barIndex].map((c) => `${c.chord}:${c.beats}`)
                      .join(" ") ?? barText;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = barText;
                  e.currentTarget.blur();
                }
              }}
            />
          </label>
          <Button
            size="sm"
            disabled={section.bars.length === 1}
            onClick={() =>
              w.edit((b) => {
                b.chart.sections
                  .find((s) => s.id === section.id)
                  ?.bars.splice(barIndex, 1);
              })
            }
          >
            Remove bar
          </Button>
        </div>
        <p id="write-bar-help" className="song-help">
          Try Am:3 G:1 or Dm G. Enter or leave the field to apply; Escape
          cancels. Each bar stays in 4/4.
        </p>
        {error && (
          <p role="alert" className="song-error">
            {error}
          </p>
        )}
      </section>
      <aside className="write-harmony-inspector" aria-label="Harmony explorer">
        <h2>Find the next colour</h2>
        <p className="song-help">
          Replace the selected chord. Its beat length stays the same.
        </p>
        <div className="write-chord-readout">
          <strong>{current.chord}</strong>
          <span>{notes.length ? notes.join(" · ") : "Rest / no chord"}</span>
        </div>
        <label>
          Explore harmony
          <select
            value={family}
            onChange={(e) => setFamily(e.target.value as typeof family)}
          >
            <option value="key">
              In {keyName(song.body.chart.keyTonic, song.body.chart.mode)}
            </option>
            <option value="borrowed">Borrow from the parallel key</option>
            <option value="dominant">Dominants that lead somewhere</option>
          </select>
        </label>
        <div className="write-palette">
          {choices.map((choice) => (
            <button
              type="button"
              key={choice.chord}
              aria-label={`Use ${choice.chord}: ${choice.reason}`}
              title={
                previous
                  ? `${choice.shared} shared pitch classes with ${previous}`
                  : choice.reason
              }
              onClick={() =>
                w.edit((b) => {
                  const target = b.chart.sections.find(
                    (s) => s.id === section.id,
                  )?.bars[barIndex][chordIndex];
                  if (target) target.chord = choice.chord;
                })
              }
            >
              <strong>{choice.chord}</strong>
              <span>{choice.degree}</span>
              <small>
                {choice.reason}
                {previous ? ` · ${choice.shared} shared` : ""}
              </small>
            </button>
          ))}
        </div>
        <p className="song-help">
          {previous ? `“Shared” counts notes in common with ${previous}. ` : ""}
          Theory suggestions run locally. Your ear chooses the chord; Play or
          Loop section auditions the band.
        </p>
      </aside>
    </div>
  );
}

export function EnergyDesk() {
  const w = useWriting();
  const song = w.song;
  if (!song) return null;
  const section =
    song.body.chart.sections.find((s) => s.id === w.selected) ??
    song.body.chart.sections[0];
  const parts = song.body.sections[section.id].parts;
  const unlocked = parts.filter((p) => !p.locked);
  const amount = unlocked.length
    ? Math.round(
        (unlocked.reduce((s, p) => s + p.intensity, 0) / unlocked.length) * 100,
      )
    : 0;
  return (
    <div className="write-energy-controls">
      <label>
        Section energy · {unlocked.length ? `${amount}%` : "all parts locked"}
        <input
          aria-label="Section energy"
          type="range"
          min={0}
          max={100}
          disabled={!unlocked.length}
          value={amount}
          onChange={(e) =>
            w.edit((b) =>
              setSectionEnergy(b, section.id, Number(e.target.value) / 100),
            )
          }
        />
      </label>
      <p className="song-help">
        Moves the unlocked parts together. Fine-tune each player below.
      </p>
    </div>
  );
}

export function LyricsDesk() {
  const w = useWriting();
  const song = w.song;
  if (!song) return null;
  const section =
    song.body.chart.sections.find((s) => s.id === w.selected) ??
    song.body.chart.sections[0];
  const lyric = song.body.lyrics?.[section.id] ?? "";
  const lines = lyric.split("\n").filter((l) => l.trim());
  return (
    <section className="write-lyrics" aria-label="Section lyrics">
      <div>
        <div className="song-section-heading">
          <h2>{section.name} lyrics</h2>
          <span className="write-meta">
            {lines.length} lines ·{" "}
            {lyric.trim() ? lyric.trim().split(/\s+/).length : 0} words
          </span>
        </div>
        <label>
          Words for this section
          <textarea
            className="write-lyric-page"
            rows={12}
            maxLength={12000}
            value={lyric}
            placeholder="Start with the line you keep coming back to."
            onChange={(e) =>
              w.edit((b) => {
                b.lyrics ??= {};
                b.lyrics[section.id] = e.target.value;
              })
            }
          />
        </label>
        <p className="song-help">
          Saved with this section. Repeated sections share these words; Make
          variation creates a separate draft.
        </p>
      </div>
      <aside>
        <h2>Phrase reference</h2>
        <div className="write-lyric-chords">
          {section.bars.map((bar, i) => (
            <div key={`${section.id}-lyric-bar-${i}`}>
              <span>Bar {i + 1}</span>
              <strong>{bar.map((c) => c.chord).join(" / ")}</strong>
            </div>
          ))}
        </div>
        <label>
          Song notebook
          <textarea
            rows={6}
            maxLength={24000}
            value={song.body.notes}
            placeholder="Theme, images, rhyme ideas, the line to return to…"
            onChange={(e) =>
              w.edit((b) => {
                b.notes = e.target.value;
              })
            }
          />
        </label>
        <p className="song-help">
          Use Song Lab below for a lyric seed, then edit it into your own words.
        </p>
      </aside>
    </section>
  );
}
