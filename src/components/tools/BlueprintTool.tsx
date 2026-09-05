import { useState } from "react";
import { songFingerprint } from "../../lib/jo/studioTools";
import { useMedia } from "../../lib/media";
import { type SongBody, useWriting } from "../../lib/originals";
import { applySongIdea } from "../../lib/roomActions";
import { parseBlueprint, referenceForm } from "../../lib/roomTools";
import { Button } from "../Button";
import {
  Field,
  SectionSelect,
  SongRequired,
  Status,
  currentSong,
  useTool,
} from "./shared";

export default function BlueprintTool() {
  const song = useWriting((s) => s.song);
  const assets = useMedia((s) => s.assets);
  const { run, message } = useTool();
  const [referenceId, setReference] = useState("");
  const [referenceName, setName] = useState("");
  const [sectionId, setSection] = useState("");
  const [text, setText] = useState(
    "Intro | 4 | 25\nVerse | 8 | 40\nChorus | 8 | 75\nVerse | 8 | 45\nChorus | 8 | 85\nOutro | 4 | 30",
  );
  const [proposal, setProposal] = useState<{
    body: SongBody;
    base: string;
    summary: string;
  } | null>(null);
  if (!song) return <SongRequired />;
  return (
    <>
      <p>
        Listen to a reference and map its shape by hand. This builds a new form
        using your selected chord phrase and energy levels; it does not
        transcribe or copy the recording. Existing sections remain available as
        ideas.
      </p>
      <div className="room-tool-row">
        <Field label="Reference audio (optional)">
          <select
            value={referenceId}
            onChange={(e) => {
              setReference(e.target.value);
              setProposal(null);
            }}
          >
            <option value="">Use a named reference</option>
            {assets
              .filter((a) => a.kind === "audio")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Reference / inspiration">
          <input
            maxLength={120}
            value={referenceName}
            onChange={(e) => {
              setName(e.target.value);
              setProposal(null);
            }}
          />
        </Field>
        <SectionSelect
          value={sectionId}
          onChange={(id) => {
            setSection(id);
            setProposal(null);
          }}
        />
      </div>
      <Field label="One section per line · Name | bars | energy 0–100">
        <textarea
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProposal(null);
          }}
        />
      </Field>
      <Button
        onClick={() =>
          void run(() => {
            const source = currentSong().body;
            const rows = parseBlueprint(text);
            const reference =
              assets.find((a) => a.id === referenceId)?.label ??
              referenceName.trim();
            if (!reference)
              throw new Error(
                "Name the reference or choose an audio asset so the inspiration stays with the song.",
              );
            const body = referenceForm(
              source,
              rows,
              sectionId,
              `ref-${crypto.randomUUID()}`,
            );
            body.referenceBlueprint = {
              reference,
              assetId: referenceId || null,
              rows,
            };
            setProposal({
              body,
              base: songFingerprint(),
              summary: `${rows.map((r) => `${r.name} ${r.bars} bars (${r.energy}%)`).join(" → ")}. ${rows.reduce((n, r) => n + r.bars, 0)} bars total.`,
            });
            return "Preview ready. Locked and muted parts keep their settings; lyrics stay in their original sections.";
          })
        }
      >
        Preview new form
      </Button>
      {proposal && (
        <>
          <p>{proposal.summary}</p>
          <Button
            onClick={() =>
              void run(() => {
                applySongIdea(
                  proposal.body,
                  proposal.base,
                  "reference blueprint",
                );
                setProposal(null);
                return "New form added to Write. Review it, then Save. Undo and Versions keep the previous arrangement.";
              })
            }
          >
            Apply blueprint to original
          </Button>
        </>
      )}
      <Status text={message} />
    </>
  );
}
