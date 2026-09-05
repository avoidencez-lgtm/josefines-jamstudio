import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { ipc, isPreview } from "../../ipc/client";
import type { TakeMetadata } from "../../ipc/contract";
import { useEngineStore } from "../../store/engine";
import { Button } from "../Button";
import { Field, Status, TakeSelect, useTool } from "./shared";

export default function ComparisonTool() {
  const e = useEngineStore(useShallow((s) => ({ takes: s.takes })));
  const { run, message } = useTool();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [start, setStart] = useState(0);
  const [length, setLength] = useState(8);
  const [pair, setPair] = useState<{
    ids: string[];
    start: number;
    end: number;
    revealed: boolean;
  } | null>(null);
  const audition = (id: string) =>
    run(async () => {
      if (isPreview || !pair)
        throw new Error("Listening needs the desktop engine.");
      await ipc.invoke("clip_audition", {
        spec: {
          takeId: id,
          label: "Blind comparison",
          trimStart: pair.start,
          trimEnd: pair.end,
          startBar: 1,
          repeats: 1,
          gain: 1,
          muted: false,
        },
      });
      return "Playing the same guitar-only excerpt at unity gain. Use Stop to end listening.";
    });
  return (
    <>
      <p>
        Choose two recordings of the same passage. Both use the same excerpt and
        unity gain; loudness is not normalised. Labels stay hidden until you
        reveal or choose a keeper.
      </p>
      {!pair && (
        <>
          <div className="room-tool-row">
            <TakeSelect label="First take" value={first} onChange={setFirst} />
            <TakeSelect
              label="Second take"
              value={second}
              onChange={setSecond}
            />
            <Field label="Excerpt start (seconds)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={start}
                onChange={(e) => setStart(e.target.valueAsNumber)}
              />
            </Field>
            <Field label="Excerpt length (seconds)">
              <input
                type="number"
                min="0.1"
                max="60"
                step="0.1"
                value={length}
                onChange={(e) => setLength(e.target.valueAsNumber)}
              />
            </Field>
          </div>
          <Button
            onClick={() =>
              void run(() => {
                const a = e.takes.find((t) => t.id === first);
                const b = e.takes.find((t) => t.id === second);
                if (
                  !a ||
                  !b ||
                  a.id === b.id ||
                  !Number.isFinite(start) ||
                  start < 0 ||
                  !Number.isFinite(length) ||
                  length < 0.1 ||
                  length > 60 ||
                  Math.min(a.durationSecs, b.durationSecs) < start + length
                )
                  throw new Error(
                    "Choose two different takes and a 0.1–60 second excerpt that exists in both.",
                  );
                if (a.chartId !== b.chartId || a.tempo !== b.tempo)
                  throw new Error(
                    "Use takes of the same chart at the same tempo for this comparison.",
                  );
                const ids = [a.id, b.id];
                if (crypto.getRandomValues(new Uint8Array(1))[0] % 2)
                  ids.reverse();
                setPair({ ids, start, end: start + length, revealed: false });
                return "A and B assigned randomly. Listen before revealing.";
              })
            }
          >
            Start blind comparison
          </Button>
        </>
      )}
      {pair && (
        <>
          <div className="room-tool-row">
            {pair.ids.map((id, i) => (
              <section key={id}>
                <h3>Take {i === 0 ? "A" : "B"}</h3>
                {pair.revealed && (
                  <p>
                    {e.takes.find((t) => t.id === id)?.timestamp ??
                      "Recording unavailable"}{" "}
                    · {id}
                  </p>
                )}
                <Button disabled={isPreview} onClick={() => void audition(id)}>
                  Listen {i === 0 ? "A" : "B"}
                </Button>
                <Button
                  disabled={isPreview}
                  onClick={() =>
                    void run(async () => {
                      const take = await ipc.invoke<TakeMetadata>(
                        "takes_favourite",
                        { takeId: id, favourite: true },
                      );
                      useEngineStore.setState((s) => ({
                        takes: s.takes.map((t) => (t.id === id ? take : t)),
                      }));
                      setPair({ ...pair, revealed: true });
                      return "Keeper marked in Sessions. The other take is unchanged.";
                    })
                  }
                >
                  Keep {i === 0 ? "A" : "B"}
                </Button>
              </section>
            ))}
          </div>
          <div className="room-tool-row">
            <Button onClick={() => setPair({ ...pair, revealed: true })}>
              Reveal identities
            </Button>
            <Button
              onClick={() =>
                void run(async () => {
                  if (!isPreview) await ipc.invoke("transport_stop");
                  setPair(null);
                  return "Ready for another comparison.";
                })
              }
            >
              New comparison
            </Button>
          </div>
        </>
      )}
      <Status text={message} />
    </>
  );
}
