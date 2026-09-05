import { useMemo, useState } from "react";
import { ipc, isPreview } from "../ipc/client";
import {
  buildSectionComp,
  contrastVariation,
  finishingReview,
  transitionRange,
} from "../lib/finishing";
import {
  PARTS,
  type SongBody,
  arrangementRanges,
  useWriting,
} from "../lib/originals";
import { checkWritingForm } from "../lib/writingTools";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";

export function FinishingDesk() {
  const w = useWriting();
  const { takes, isRecording, transportStop } = useEngineStore();
  const [index, setIndex] = useState(1);
  const [context, setContext] = useState(2);
  const [strength, setStrength] = useState(25);
  const [vocal, setVocal] = useState(false);
  const [takeId, setTakeId] = useState("");
  const [proposal, setProposal] = useState<{
    body: SongBody;
    base: string;
    label: string;
    sectionId: string;
  } | null>(null);
  const song = w.song;
  const ranges = song ? arrangementRanges(song.body.chart) : [];
  const selectedIndex = Math.min(index, Math.max(0, ranges.length - 1));
  // The review and every take's comp are only recomputed when their inputs change,
  // not on every slider frame (issue #52).
  const issues = useMemo(
    () => (song ? finishingReview(song.body, takes, vocal) : []),
    [song, takes, vocal],
  );
  const choices = useMemo(
    () =>
      song
        ? takes.map((take) => {
            try {
              return {
                take,
                body: buildSectionComp(song, take, selectedIndex),
                reason: "",
              };
            } catch (e) {
              return {
                take,
                body: null,
                reason: String(e).replace(/^Error: /, ""),
              };
            }
          })
        : [],
    [song, takes, selectedIndex],
  );
  if (!song) return null;
  const range = ranges[selectedIndex];
  const loop = transitionRange(song.body.chart, selectedIndex, context);
  const fingerprint = JSON.stringify([song.id, song.body]);
  const choice =
    choices.find((c) => c.take.id === takeId && c.body) ??
    choices.find((c) => c.body);
  const report = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      useWriting.setState({ message: String(e) });
    }
  };
  const apply = (body: SongBody, label: string, base: string) =>
    report(() => {
      const current = useWriting.getState();
      if (current.busy || useEngineStore.getState().isRecording) return;
      if (
        !current.song ||
        JSON.stringify([current.song.id, current.song.body]) !== base
      )
        throw new Error(
          "The song changed. Preview this idea again before applying it.",
        );
      if (JSON.stringify(body) === JSON.stringify(current.song.body)) {
        useWriting.setState({
          message: "This performance is already in place.",
        });
        return;
      }
      if (current.song.versions.length >= 20)
        throw new Error(
          "Remove an unused version first so the current song can be preserved.",
        );
      checkWritingForm(body);
      current.version(`Before ${label}`);
      current.edit((b) => Object.assign(b, structuredClone(body)));
      useWriting.setState({
        message: `${label} applied. Your previous song is in Versions; Undo also returns to it. Save to keep both on disk.`,
      });
    });
  return (
    <div className="finishing-desk">
      <section aria-labelledby="finish-title">
        <div className="song-section-heading">
          <div>
            <h2 id="finish-title">Make this song land</h2>
            <p className="song-help">
              Review the form, shape its contrasts, and keep the performances
              worth hearing again.
            </p>
          </div>
          <label className="finish-vocal-toggle">
            <input
              type="checkbox"
              checked={vocal}
              onChange={(e) => setVocal(e.target.checked)}
            />{" "}
            Include lyric reminders
          </label>
        </div>
        <details className="finish-review" open>
          <summary>
            {issues.length
              ? `${issues.length} ${issues.length === 1 ? "thing" : "things"} to consider`
              : "No structural issues found"}
          </summary>
          <p className="song-help">
            These are practical checks, not a judgement of musical quality. Your
            ears make the final call.
          </p>
          <ul>
            {issues.map((issue) => (
              <li key={issue.id}>
                <strong>{issue.title}</strong>
                <p>{issue.detail}</p>
              </li>
            ))}
          </ul>
        </details>
      </section>
      <section aria-labelledby="transition-title">
        <h2 id="transition-title">Transition lab</h2>
        <p className="song-help">
          Listen across a section boundary. Try a variation at this appearance
          only; every locked part stays as it is.
        </p>
        <div className="song-controls">
          <label>
            Section appearance
            <select
              value={selectedIndex}
              onChange={(e) => {
                setIndex(Number(e.target.value));
                setProposal(null);
              }}
            >
              {ranges.map((r, i) => (
                <option key={`${r.sectionId}-${r.startBar}`} value={i}>
                  {
                    song.body.chart.sections.find((s) => s.id === r.sectionId)
                      ?.name
                  }{" "}
                  · bars {r.startBar}–{r.endBar - 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Context on each side
            <select
              value={context}
              onChange={(e) => setContext(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option value={n} key={n}>
                  {n} {n === 1 ? "bar" : "bars"}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={isPreview || isRecording || w.busy}
            onClick={() =>
              w.action(() => w.loopRange(loop.startBar, loop.endBar))
            }
          >
            Loop bars {loop.startBar}–{loop.endBar - 1}
          </Button>
          <Button
            variant="secondary"
            disabled={isPreview}
            onClick={() => w.action(transportStop)}
          >
            Stop
          </Button>
        </div>
        <div className="song-controls finish-recipes">
          <label>
            Contrast strength · {strength}%
            <input
              type="range"
              min={5}
              max={50}
              step={5}
              value={strength}
              onChange={(e) => {
                setStrength(Number(e.target.value));
                setProposal(null);
              }}
            />
          </label>
          {(["lift", "space"] as const).map((recipe) => (
            <Button
              key={recipe}
              variant="secondary"
              onClick={() =>
                report(() => {
                  const id = `section-${crypto.randomUUID()}`;
                  const body = contrastVariation(
                    song.body,
                    selectedIndex,
                    recipe,
                    strength / 100,
                    id,
                  );
                  setProposal({
                    body,
                    base: fingerprint,
                    label:
                      recipe === "lift"
                        ? "section lift"
                        : "space for the vocal",
                    sectionId: id,
                  });
                })
              }
            >
              {recipe === "lift" ? "Preview a lift" : "Preview more space"}
            </Button>
          ))}
        </div>
        {proposal && (
          <div className="finish-proposal">
            <h3>{proposal.label}</h3>
            <p className="song-help">
              {proposal.label === "section lift"
                ? "Raise the intensity of audible, unlocked parts."
                : "Lower drums and comp intensity while keeping the bass steady."}{" "}
              Chords, duration, guitar clips and rig scenes stay in place.
            </p>
            <table>
              <caption className="sr-only">Proposed intensity changes</caption>
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Current</th>
                  <th>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {proposal.body.sections[proposal.sectionId].parts.map(
                  (p, i) => (
                    <tr key={PARTS[i]}>
                      <th scope="row">
                        {PARTS[i]}
                        {p.locked ? " · locked" : p.muted ? " · muted" : ""}
                      </th>
                      <td>
                        {Math.round(
                          song.body.sections[range.sectionId].parts[i]
                            .intensity * 100,
                        )}
                        %
                      </td>
                      <td>{Math.round(p.intensity * 100)}%</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <div className="song-controls">
              <Button
                disabled={proposal.base !== fingerprint}
                onClick={() => {
                  apply(proposal.body, proposal.label, proposal.base);
                  setProposal(null);
                }}
              >
                Keep variation
              </Button>
              <Button variant="secondary" onClick={() => setProposal(null)}>
                Discard preview
              </Button>
            </div>
            {proposal.base !== fingerprint && (
              <output>
                The song changed. Preview again to compare the current version.
              </output>
            )}
          </div>
        )}
        {isPreview && (
          <p className="song-help">
            Looping and listening require the desktop audio engine. You can
            explore and edit the arrangement here.
          </p>
        )}
      </section>
      <section aria-labelledby="comp-title">
        <h2 id="comp-title">Build your guitar performance</h2>
        <p className="song-help">
          Choose a full-song take for bars {range.startBar}–{range.endBar - 1}.
          The source keeps its pitch and speed. Other guitar layers still play
          alongside this comp.
        </p>
        <div className="song-controls">
          <label>
            Performance
            <select
              value={choice?.take.id ?? ""}
              onChange={(e) => setTakeId(e.target.value)}
            >
              <option value="" disabled>
                Choose a compatible recording
              </option>
              {choices
                .filter((c) => c.body)
                .map((c) => (
                  <option value={c.take.id} key={c.take.id}>
                    {c.take.favourite ? "★ " : ""}
                    {c.take.timestamp} · {c.take.id.slice(-8)}
                  </option>
                ))}
            </select>
          </label>
          <Button
            variant="secondary"
            disabled={!choice?.body || isPreview}
            onClick={() => {
              if (choice?.body) {
                const spec = choice.body.clips.at(-1);
                void w.action(() => ipc.invoke("clip_audition", { spec }));
              }
            }}
          >
            Listen to selection
          </Button>
          <Button
            disabled={!choice?.body}
            onClick={() => {
              if (choice?.body) apply(choice.body, "guitar comp", fingerprint);
            }}
          >
            Use performance
          </Button>
        </div>
        {!choice && (
          <p className="song-help">
            Record this original from bar 1 through the selected section in
            Record & layers. A changed tempo, key or chord timeline needs a
            fresh take.
          </p>
        )}
        {choices.some((c) => !c.body) && (
          <details>
            <summary>Why some takes cannot be used</summary>
            <ul>
              {choices
                .filter((c) => !c.body)
                .map((c) => (
                  <li key={c.take.id}>
                    <strong>{c.take.timestamp || c.take.id}</strong>
                    <p>{c.reason}</p>
                  </li>
                ))}
            </ul>
          </details>
        )}
        <p className="song-help">
          Using another performance for the same bar range replaces that comp
          only. Refine its trim or gain in Record & layers. A version is kept
          before each change.
        </p>
      </section>
    </div>
  );
}
