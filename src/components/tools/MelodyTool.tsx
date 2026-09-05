import { useState } from "react";
import { Note } from "tonal";
import { ipc, isPreview } from "../../ipc/client";
import { songFingerprint } from "../../lib/jo/studioTools";
import { useWriting } from "../../lib/originals";
import { applySongIdea } from "../../lib/roomActions";
import {
  harmonyVariation,
  melodyHarmony,
  melodySchema,
  parseMelody,
} from "../../lib/roomTools";
import { Button } from "../Button";
import {
  Field,
  SectionSelect,
  SongRequired,
  Status,
  TakeSelect,
  currentSong,
  useTool,
} from "./shared";

export default function MelodyTool() {
  const song = useWriting((s) => s.song);
  const { run, message } = useTool();
  const [takeId, setTake] = useState("");
  const [start, setStart] = useState(0);
  const [length, setLength] = useState(12);
  const [sectionId, setSection] = useState("");
  const [text, setText] = useState("A4 0 1\nC5 1 1\nE5 2 1\nG4 3 1");
  const [proposal, setProposal] = useState<{
    base: string;
    sectionId: string;
    rows: ReturnType<typeof melodyHarmony>;
    chords: string[];
  } | null>(null);
  if (!song) return <SongRequired />;
  return (
    <>
      <p>
        Use an isolated humming or single-note guitar take, up to two minutes
        long. Extraction sketches sustained notes; it does not transcribe
        chords. All processing stays on this computer.
      </p>
      <div className="room-tool-row">
        <TakeSelect
          label="Melody recording"
          value={takeId}
          onChange={setTake}
        />
        <Field label="Start (seconds)">
          <input
            type="number"
            min="0"
            step="0.1"
            value={start}
            onChange={(e) => setStart(e.target.valueAsNumber)}
          />
        </Field>
        <Field label="Length (seconds)">
          <input
            type="number"
            min="0.1"
            max="60"
            step="0.1"
            value={length}
            onChange={(e) => setLength(e.target.valueAsNumber)}
          />
        </Field>
        <Button
          disabled={!takeId || isPreview}
          onClick={() =>
            void run(async () => {
              const notes = melodySchema.parse(
                await ipc.invoke("takes_melody", {
                  takeId,
                  startSeconds: start,
                  lengthSeconds: length,
                }),
              );
              setText(
                notes
                  .map(
                    (n) =>
                      `${Note.fromMidi(n.midi)} ${n.startSeconds.toFixed(3)} ${n.durationSeconds.toFixed(3)}`,
                  )
                  .join("\n"),
              );
              setProposal(null);
              return notes.length
                ? `Sketched ${notes.length} notes. Correct any pitch or timing before previewing harmony.`
                : "No sustained notes found. Try a clearer, louder single-note recording.";
            })
          }
        >
          Extract notes{isPreview ? " · desktop" : ""}
        </Button>
      </div>
      <Field label="Editable melody · note, start seconds, duration seconds">
        <textarea
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProposal(null);
          }}
        />
      </Field>
      <div className="room-tool-row">
        <SectionSelect
          value={sectionId}
          onChange={(id) => {
            setSection(id);
            setProposal(null);
          }}
        />
        <Button
          onClick={() =>
            void run(() => {
              const song = currentSong();
              const section = song.body.chart.sections.find(
                (s) => s.id === sectionId,
              );
              if (!section)
                throw new Error("Choose the section this melody belongs to.");
              const notes = parseMelody(text);
              const rows = melodyHarmony(
                song.body.chart,
                notes,
                section.bars.length,
              );
              setProposal({
                base: songFingerprint(),
                sectionId,
                rows,
                chords: rows.map((r, i) =>
                  r.silent ? section.bars[i][0].chord : r.choices[0].chord,
                ),
              });
              return "Ranked by time spent on chord tones, not musical quality. Silent bars keep your existing chord; listen and choose.";
            })
          }
        >
          Preview chord choices
        </Button>
      </div>
      {proposal && (
        <>
          <div className="room-tool-row">
            {proposal.rows.map((row, i) => (
              <Field
                key={row.bar}
                label={`Bar ${row.bar}${row.silent ? " · no notes" : ""}`}
              >
                <select
                  value={proposal.chords[i]}
                  onChange={(e) =>
                    setProposal({
                      ...proposal,
                      chords: proposal.chords.map((c, at) =>
                        at === i ? e.target.value : c,
                      ),
                    })
                  }
                >
                  {[
                    ...new Set([
                      proposal.chords[i],
                      ...row.choices.map((c) => c.chord),
                    ]),
                  ].map((chord) => (
                    <option key={chord}>{chord}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <Button
            onClick={() =>
              void run(() => {
                const body = harmonyVariation(
                  currentSong().body,
                  proposal.sectionId,
                  proposal.chords,
                  `melody-${crypto.randomUUID()}`,
                );
                applySongIdea(body, proposal.base, "melody harmony");
                useWriting.setState({
                  selected:
                    body.chart.sections[body.chart.sections.length - 1].id,
                  view: "compose",
                });
                setProposal(null);
                return "Variation added outside the form. In Compose, add it to the arrangement when you want to hear it. Undo is available; Save keeps it.";
              })
            }
          >
            Keep as a section variation
          </Button>
        </>
      )}
      <Status text={message} />
    </>
  );
}
