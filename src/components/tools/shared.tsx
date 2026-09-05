import { type ReactElement, cloneElement, useId, useState } from "react";
import { useMedia } from "../../lib/media";
import { useWriting } from "../../lib/originals";
import { useRoomOperation } from "../../lib/roomActions";
import { useEngineStore } from "../../store/engine";

export function useTool() {
  const [message, setMessage] = useState("");
  /**
   * Runs one room operation. Pass `blocking: false` for work that only waits for an
   * answer and changes nothing until the user acts on it; the close guard ignores it.
   */
  const run = async (
    fn: () => Promise<string | undefined> | string | undefined,
    { blocking = true }: { blocking?: boolean } = {},
  ) => {
    if (useRoomOperation.getState().busy) {
      setMessage(
        "Another room tool is still working. Wait for it or cancel it.",
      );
      return;
    }
    if (
      useEngineStore.getState().isRecording ||
      useWriting.getState().busy ||
      useMedia.getState().busy
    ) {
      setMessage("Finish the current operation or recording first.");
      return;
    }
    useRoomOperation.setState({ busy: true, blocking });
    setMessage("");
    try {
      setMessage((await fn()) ?? "");
    } catch (e) {
      setMessage(String(e).replace(/^Error: /, ""));
    } finally {
      useRoomOperation.setState({ busy: false, blocking: false });
    }
  };
  return { run, message };
}
export function Status({ text }: { text: string }) {
  return <output className="room-tool-status">{text}</output>;
}
export function Field({
  label,
  children,
}: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="room-tool-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
export function currentSong() {
  const song = useWriting.getState().song;
  if (!song) throw new Error("Open an original in Write first.");
  return song;
}
export function SongRequired() {
  return <p>Create or open an original in Write to use this tool.</p>;
}
export function SectionSelect({
  value,
  onChange,
}: { value: string; onChange: (id: string) => void }) {
  const song = useWriting((s) => s.song);
  return (
    <Field label="Source section">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a section</option>
        {song?.body.chart.sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.bars.length} bars
          </option>
        ))}
      </select>
    </Field>
  );
}
export function TakeSelect({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (id: string) => void }) {
  const takes = useEngineStore((s) => s.takes);
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a recording</option>
        {takes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.timestamp} · {t.durationSecs.toFixed(1)}s · {t.id.slice(-6)}
          </option>
        ))}
      </select>
    </Field>
  );
}
