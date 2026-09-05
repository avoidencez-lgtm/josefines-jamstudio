import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { isPreview } from "../../ipc/client";
import { cueSetlistItem, saveRoomPreference } from "../../lib/roomActions";
import { type Setlist, setlistSchema } from "../../lib/roomTools";
import { useEngineStore } from "../../store/engine";
import { Button } from "../Button";
import { Field, Status, useTool } from "./shared";

export default function SetlistTool() {
  const e = useEngineStore(
    useShallow((s) => ({
      charts: s.charts,
      styles: s.styles,
      settings: s.settings,
    })),
  );
  const { run, message } = useTool();
  const [chartId, setChart] = useState("");
  const [styleId, setStyle] = useState("");
  const [bpm, setBpm] = useState(100);
  const [countIn, setCountIn] = useState(1);
  const [cued, setCued] = useState("");
  const [editing, setEditing] = useState("");
  const parsed = setlistSchema.safeParse(e.settings?.rehearsalSetlist ?? []);
  const list = parsed.success ? parsed.data : [];
  const chart = e.charts.find((c) => c.id === chartId);
  // Only grooves in the chart's meter can play it; the engine refuses the rest anyway.
  const grooves = e.styles.filter(
    (s) => !chart || s.feel.timeSig.join("/") === chart.timeSig.join("/"),
  );
  const grooveName = (id?: string) =>
    id ? (e.styles.find((s) => s.id === id)?.name ?? "missing groove") : null;
  const save = (next: Setlist) =>
    run(async () => {
      setlistSchema.parse(next);
      await saveRoomPreference("rehearsalSetlist", next);
      setEditing("");
      return isPreview
        ? "Setlist updated in this preview only."
        : "Setlist saved.";
    });
  return (
    <>
      <p>
        Entries save immediately. Cue sets up the chart and its groove without
        starting playback; use Play when ready. Native timing controls the
        count-in.
      </p>
      {!parsed.success && (
        <p role="alert">
          The saved setlist is invalid. Restore it in the settings file before
          editing; it has not been overwritten.
        </p>
      )}
      <div className="room-tool-row">
        <Field label="Chart">
          <select
            value={chartId}
            onChange={(event) => {
              const next = e.charts.find((c) => c.id === event.target.value);
              setChart(event.target.value);
              setBpm(next?.defaultBpm ?? 100);
              const groove = e.styles.find((s) => s.id === styleId);
              if (
                next &&
                groove &&
                groove.feel.timeSig.join("/") !== next.timeSig.join("/")
              )
                setStyle("");
            }}
          >
            <option value="">Choose a chart</option>
            {e.charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Groove">
          <select
            value={styleId}
            onChange={(event) => setStyle(event.target.value)}
          >
            <option value="">Chart's default groove</option>
            {grooves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Entry BPM">
          <input
            type="number"
            min="40"
            max="240"
            value={bpm}
            onChange={(e) => setBpm(e.target.valueAsNumber)}
          />
        </Field>
        <Field label="Count-in bars">
          <input
            type="number"
            min="0"
            max="4"
            value={countIn}
            onChange={(e) => setCountIn(e.target.valueAsNumber)}
          />
        </Field>
        <Button
          disabled={!chartId || !parsed.success}
          onClick={() =>
            void save(
              editing
                ? list.map((item) =>
                    item.id === editing
                      ? {
                          ...item,
                          chartId,
                          styleId: styleId || undefined,
                          bpm,
                          countIn,
                        }
                      : item,
                  )
                : [
                    ...list,
                    {
                      id: crypto.randomUUID(),
                      chartId,
                      styleId: styleId || undefined,
                      bpm,
                      countIn,
                    },
                  ],
            )
          }
        >
          {editing ? "Update entry" : "Add to setlist"}
        </Button>
        {editing && <Button onClick={() => setEditing("")}>Cancel edit</Button>}
      </div>
      <ol className="room-tool-list">
        {list.map((item, i) => (
          <li key={item.id}>
            <span>
              {i + 1}.{" "}
              {e.charts.find((c) => c.id === item.chartId)?.name ??
                "Missing chart"}{" "}
              · {grooveName(item.styleId) ?? "chart's groove"} · {item.bpm} BPM
              · {item.countIn}-bar count-in {cued === item.id ? "· cued" : ""}
            </span>
            <div className="room-tool-row">
              <Button
                aria-label={`Edit entry ${i + 1}`}
                onClick={() => {
                  setEditing(item.id);
                  setChart(item.chartId);
                  setStyle(item.styleId ?? "");
                  setBpm(item.bpm);
                  setCountIn(item.countIn);
                  if (cued === item.id) setCued("");
                }}
              >
                Edit
              </Button>
              <Button
                disabled={isPreview}
                onClick={() =>
                  void run(async () => {
                    await cueSetlistItem(item);
                    setCued(item.id);
                    return "Chart cued. Press Play when ready.";
                  })
                }
              >
                Cue {i + 1}
              </Button>
              <Button
                aria-label={`Move entry ${i + 1} up`}
                disabled={i === 0}
                onClick={() => {
                  const next = [...list];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  void save(next);
                }}
              >
                Move up
              </Button>
              <Button
                aria-label={`Remove entry ${i + 1}`}
                onClick={() => void save(list.filter((s) => s.id !== item.id))}
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {list.length > 0 && (
        <Button
          disabled={
            isPreview ||
            list.findIndex((s) => s.id === cued) === list.length - 1
          }
          onClick={() =>
            void run(async () => {
              const next = list[list.findIndex((s) => s.id === cued) + 1];
              await cueSetlistItem(next);
              setCued(next.id);
              return "Next chart cued. Press Play when ready.";
            })
          }
        >
          Cue next
        </Button>
      )}
      <Status text={message} />
    </>
  );
}
