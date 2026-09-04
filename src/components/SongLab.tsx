import { useState } from "react";
import { BRAINS, askBrain, estimateRequest, useAi } from "../lib/jo/providers";
import {
  LAB_IDEAS,
  type LabKind,
  type Proposal,
  applyProposal,
  labRequest,
  readIdea,
} from "../lib/jo/songLab";
import { useWriting } from "../lib/originals";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";

export function SongLab() {
  const { song, selected } = useWriting();
  const { preferences, loaded } = useAi();
  const { keysPresent, isPreview, isRecording, setScreen } = useEngineStore();
  const [kind, setKind] = useState<LabKind>("chords");
  const [direction, setDirection] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready =
    loaded &&
    (BRAINS[preferences.selected].local || keysPresent[preferences.selected]) &&
    !isPreview;
  const model = preferences.models[preferences.selected];
  const request = song ? labRequest(song, selected, kind, direction) : null;
  const estimate = request ? estimateRequest(request, model) : null;
  const generate = async () => {
    if (!song || !request || busy) return;
    setBusy(true);
    setError("");
    const originalBody = JSON.stringify(song.body);
    try {
      const result = await askBrain(request, preferences);
      setProposal({
        idea: readIdea(result.reply, kind),
        kind,
        songId: song.id,
        sectionId: selected,
        originalBody,
        source: `${BRAINS[preferences.selected].name} / ${model.model}`,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="song-foot-controls">
      <summary>Song Lab · explore another direction</summary>
      <p className="song-help">
        Try different chords, find a bridge, start a lyric or get arrangement
        feedback. Only song text and selected rig information are sent.
        Suggestions wait for you to apply them.
      </p>
      <div className="song-controls">
        <label>
          Explore
          <select
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.target.value as LabKind)}
          >
            {Object.entries(LAB_IDEAS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => setScreen("settings")}>AI settings</Button>
      </div>
      <label className="song-chords">
        Your direction
        <textarea
          maxLength={2000}
          rows={2}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder="Keep the verse intimate; make the chorus open up. Easy guitar voicings."
        />
      </label>
      <p className="song-help">
        {BRAINS[preferences.selected].name} · {model.model} ·{" "}
        {BRAINS[preferences.selected].local
          ? "Uses the installed agent's account and limits."
          : estimate === null
            ? "Cost unknown: enter model prices in Settings for an estimate."
            : `Approx. USD ${estimate.toFixed(4)} at the output limit; actual billing can differ.`}
      </p>
      {!ready && (
        <p className="song-help">
          {isPreview
            ? "Cloud ideas require the desktop app."
            : "Save a key for the selected provider in AI settings."}
        </p>
      )}
      <Button
        disabled={!ready || !song || busy || isRecording}
        onClick={() => void generate()}
      >
        {busy ? "Thinking…" : "Generate an idea"}
      </Button>
      {error && (
        <output className="song-message" aria-live="polite">
          {error}
        </output>
      )}
      {proposal && (
        <section className="song-form">
          <h3>{proposal.idea.title}</h3>
          <p className="song-help">{proposal.source}</p>
          <p>{proposal.idea.summary}</p>
          {(proposal.kind === "chords" || proposal.kind === "bridge") && (
            <label className="song-chords">
              Tweak the chords before applying
              <textarea
                rows={2}
                maxLength={2000}
                value={proposal.idea.chords}
                onChange={(e) =>
                  setProposal({
                    ...proposal,
                    idea: { ...proposal.idea, chords: e.target.value },
                  })
                }
              />
            </label>
          )}
          <label className="song-chords">
            Tweak the notes or lyrics
            <textarea
              rows={4}
              maxLength={6000}
              value={proposal.idea.notes}
              onChange={(e) =>
                setProposal({
                  ...proposal,
                  idea: { ...proposal.idea, notes: e.target.value },
                })
              }
            />
          </label>
          <div className="song-actions">
            <Button
              disabled={
                busy ||
                isRecording ||
                !song ||
                JSON.stringify(song.body) !== proposal.originalBody ||
                song.id !== proposal.songId
              }
              onClick={() => {
                try {
                  applyProposal(proposal);
                  setProposal(null);
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              {proposal.kind === "bridge"
                ? "Add bridge & keep original version"
                : proposal.kind === "chords"
                  ? "Apply chords & keep original version"
                  : proposal.kind === "lyrics"
                    ? "Add to section lyrics"
                    : "Keep in song notes"}
            </Button>
            <Button disabled={busy} onClick={() => setProposal(null)}>
              Dismiss
            </Button>
          </div>
          {song && JSON.stringify(song.body) !== proposal.originalBody && (
            <p className="song-help">
              The song has changed. Generate a fresh idea before applying.
            </p>
          )}
        </section>
      )}
    </details>
  );
}
