import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { type MediaShot, useMedia } from "../../lib/media";
import { snapCuts } from "../../lib/roomTools";
import { Button } from "../Button";
import { Field, Status, useTool } from "./shared";

export default function BeatCutsTool() {
  const m = useMedia(useShallow((s) => ({ busy: s.busy, edit: s.edit })));
  const { run, message } = useTool();
  const [bpm, setBpm] = useState(100);
  const [beats, setBeats] = useState(4);
  const [offset, setOffset] = useState(0);
  const [proposal, setProposal] = useState<{
    shots: MediaShot[];
    before: number[];
    base: string;
  } | null>(null);
  return (
    <>
      <p>
        Set the soundtrack tempo and the first beat's offset. Only internal cuts
        move; total length and source trim starts stay the same. This uses your
        tempo grid, not automatic beat detection.
      </p>
      <div className="room-tool-row">
        <Field label="Soundtrack BPM">
          <input
            type="number"
            min="40"
            max="240"
            value={bpm}
            onChange={(e) => {
              setBpm(e.target.valueAsNumber);
              setProposal(null);
            }}
          />
        </Field>
        <Field label="Cut grid (beats)">
          <select
            value={beats}
            onChange={(e) => {
              setBeats(Number(e.target.value));
              setProposal(null);
            }}
          >
            {[1, 2, 3, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "beat" : "beats"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="First beat (seconds)">
          <input
            type="number"
            min="0"
            max="10"
            step="0.01"
            value={offset}
            onChange={(e) => {
              setOffset(e.target.valueAsNumber);
              setProposal(null);
            }}
          />
        </Field>
        <Button
          onClick={() =>
            void run(() => {
              const p = useMedia.getState().project;
              setProposal({
                shots: snapCuts(p.shots, bpm, beats, offset),
                before: p.shots.map((s) => s.seconds),
                base: JSON.stringify(p),
              });
              return "Review the new shot lengths. Render will still validate every source clip.";
            })
          }
        >
          Preview aligned cuts
        </Button>
      </div>
      {proposal && (
        <>
          <ul>
            {proposal.shots.map((s, i) => (
              <li key={s.id}>
                {s.title}: {proposal.before[i].toFixed(3)}s →{" "}
                {s.seconds.toFixed(3)}s
              </li>
            ))}
          </ul>
          <Button
            onClick={() =>
              void run(() => {
                if (
                  m.busy ||
                  JSON.stringify(useMedia.getState().project) !== proposal.base
                )
                  throw new Error(
                    "The project changed or is busy. Preview the cuts again.",
                  );
                m.edit({ shots: proposal.shots });
                setProposal(null);
                return "Cuts aligned. Undo restores the previous timing; Save keeps this edit.";
              })
            }
          >
            Apply aligned cuts
          </Button>
        </>
      )}
      <Status text={message} />
    </>
  );
}
