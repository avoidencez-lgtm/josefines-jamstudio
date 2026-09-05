import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { songFingerprint } from "../../lib/jo/studioTools";
import { useMedia } from "../../lib/media";
import { useWriting } from "../../lib/originals";
import { generationBrief } from "../../lib/roomTools";
import { Button } from "../Button";
import { Field, SongRequired, Status, currentSong, useTool } from "./shared";

export default function BriefTool() {
  const song = useWriting((s) => s.song);
  const m = useMedia(
    useShallow((s) => ({ busy: s.busy, project: s.project, edit: s.edit })),
  );
  const { run, message } = useTool();
  const [direction, setDirection] = useState(
    "Faithful backing: support the song's groove and leave the lead melody to the guitarist.",
  );
  const [instrumental, setInstrumental] = useState(true);
  const [brief, setBrief] = useState("");
  const [base, setBase] = useState("");
  const [projectBase, setProjectBase] = useState("");
  if (!song) return <SongRequired />;
  return (
    <>
      <div className="room-tool-row">
        {[
          "Faithful backing: support the song's groove and leave the lead melody to the guitarist.",
          "Stripped: intimate, sparse percussion and bass; make the chorus wider without crowding the guitar.",
          "Reimagine: a driving cinematic arrangement with strong section contrast and a quiet bridge.",
        ].map((value, i) => (
          <Button key={value} onClick={() => setDirection(value)}>
            {["Faithful", "Stripped", "Reimagined"][i]}
          </Button>
        ))}
      </div>
      <Field label="Editable musical direction">
        <textarea
          rows={2}
          maxLength={2000}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
        />
      </Field>
      <label>
        <input
          type="checkbox"
          checked={instrumental}
          onChange={(e) => {
            setInstrumental(e.target.checked);
            setBrief("");
          }}
        />{" "}
        Instrumental brief
      </label>
      <Button
        onClick={() =>
          void run(() => {
            setBrief(
              generationBrief(currentSong().body, direction, instrumental),
            );
            setBase(songFingerprint());
            setProjectBase(JSON.stringify(useMedia.getState().project));
            return "Brief built locally. Edit it before using it; generation duration and model stay under your control below.";
          })
        }
      >
        Build arrangement brief
      </Button>
      {brief && (
        <>
          <Field label="Review and edit generation prompt">
            <textarea
              rows={7}
              maxLength={4000}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </Field>
          <Button
            onClick={() =>
              void run(() => {
                if (
                  songFingerprint() !== base ||
                  JSON.stringify(useMedia.getState().project) !== projectBase
                )
                  throw new Error(
                    "The song or media project changed. Build the brief again before replacing its prompt.",
                  );
                if (m.busy || !brief.trim())
                  throw new Error(
                    "Finish the current media job and enter a prompt first.",
                  );
                const current = m.project.audioGeneration as
                  | Record<string, unknown>
                  | undefined;
                m.edit({
                  audioGeneration: { ...current, prompt: brief, instrumental },
                });
                setBrief("");
                return "Prompt placed in AI Music below. Review the selected model, duration and cost before Generate. Save keeps the brief; Undo restores the old prompt.";
              })
            }
          >
            Use prompt in AI Music
          </Button>
        </>
      )}
      <Status text={message} />
    </>
  );
}
