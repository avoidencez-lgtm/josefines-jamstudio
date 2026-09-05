import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { isPreview } from "../../ipc/client";
import { useWriting } from "../../lib/originals";
import { cueSetlistItem } from "../../lib/roomActions";
import { harmonicNeighbours } from "../../lib/roomTools";
import { useEngineStore } from "../../store/engine";
import { Button } from "../Button";
import { Field, Status, useTool } from "./shared";

export default function DiscoveryTool() {
  const e = useEngineStore(
    useShallow((s) => ({ charts: s.charts, setScreen: s.setScreen })),
  );
  const song = useWriting((s) => s.song);
  const { run, message } = useTool();
  const [sourceId, setSource] = useState("original");
  const source =
    sourceId === "original"
      ? song?.body.chart
      : e.charts.find((c) => c.id === sourceId);
  const matches = source
    ? harmonicNeighbours(source, e.charts).slice(0, 8)
    : [];
  return (
    <>
      <Field label="Find movements related to">
        <select value={sourceId} onChange={(e) => setSource(e.target.value)}>
          <option value="original">
            Current original
            {song ? ` · ${song.body.chart.name}` : " · open one in Write"}
          </option>
          {e.charts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <p>
        Matches compare consecutive chord roots and qualities, independent of
        key, in the same meter. Shared movements suggest study material; they do
        not imply the songs sound alike.
      </p>
      <ul className="room-tool-list">
        {matches.map(({ chart, shared }) => (
          <li key={chart.id}>
            <div>
              <strong>{chart.name}</strong>
              <p>{shared.join("; ")}</p>
            </div>
            <Button
              disabled={isPreview}
              onClick={() =>
                void run(async () => {
                  await cueSetlistItem({
                    id: chart.id,
                    chartId: chart.id,
                    bpm: chart.defaultBpm,
                    countIn: 1,
                  });
                  e.setScreen("stage");
                  return "Related chart cued in Stage.";
                })
              }
            >
              Study in Stage
            </Button>
          </li>
        ))}
      </ul>
      {source && !matches.length && (
        <p>
          No matching moves yet. Add more charts to Library or choose another
          source.
        </p>
      )}
      <Status text={message} />
    </>
  );
}
