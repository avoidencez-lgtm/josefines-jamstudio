import { useState } from "react";
import { ipc, isPreview } from "../ipc/client";
import type { ReferenceState, StemMix } from "../ipc/contract";
import { MEDIA_MODELS, type MediaAsset, useMedia } from "../lib/media";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";

export function StemMixer({ song }: { song: ReferenceState }) {
  const [mix, setMix] = useState<StemMix[]>(song.stems ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const recording = useEngineStore((s) => s.isRecording);
  const locked = recording || isPreview || busy;
  const apply = async (next: StemMix[]) => {
    if (locked) return;
    setBusy(true);
    setMessage("");
    try {
      await ipc.invoke("media_reference_mix", {
        assetId: song.asset_id,
        mix: next,
      });
      setMix(next);
      await useMedia.getState().refresh();
      setMessage("This mix is applied and saved.");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="workspace-stack"
      aria-label="This is the stem mixer."
      onSubmit={(e) => {
        e.preventDefault();
        void apply(mix);
      }}
    >
      <h3 className="font-semibold">These are the reference tracks.</h3>
      <p className="workspace-note">
        Listen to identify the guitar track, then choose it below. Levels and
        mutes apply together and are saved with this song.
      </p>
      <fieldset disabled={locked} className="workspace-stack">
        <legend className="sr-only">These are the track levels and mutes.</legend>
        {mix.map((stem, index) => (
          <div key={stem.id} className="workspace-actions">
            <label className="room-tool-field">
              {stem.label} is {Math.round(stem.gain * 100)}%.
              <input
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={stem.gain}
                onChange={(e) =>
                  setMix(
                    mix.map((s, i) =>
                      i === index ? { ...s, gain: Number(e.target.value) } : s,
                    ),
                  )
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stem.muted}
                onChange={(e) =>
                  setMix(
                    mix.map((s, i) =>
                      i === index ? { ...s, muted: e.target.checked } : s,
                    ),
                  )
                }
              />
              Mute {stem.label}.
            </label>
          </div>
        ))}
        <label className="room-tool-field">
          Choose the guitar track.
          <select
            value={mix.find((s) => s.guitar)?.id ?? ""}
            onChange={(e) =>
              setMix(
                mix.map((s) => ({ ...s, guitar: s.id === e.target.value })),
              )
            }
          >
            <option value="">This guitar track is not identified.</option>
            {mix.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <div className="workspace-actions">
        <Button type="submit" disabled={locked}>
          {busy ? "Saving mix…" : "Apply and save this mix."}
        </Button>
        <Button
          type="button"
          disabled={locked || !mix.some((s) => s.guitar)}
          onClick={() =>
            void apply(
              mix.map((s) => (s.guitar ? { ...s, muted: !s.muted } : s)),
            )
          }
        >
          {mix.some((s) => s.guitar && s.muted)
            ? "Restore this guitar."
            : "Minus this guitar."}
        </Button>
      </div>
      {message && <output className="workspace-note">{message}</output>}
      <p className="workspace-note">
        Changes reach the output after its short render queue. Save any
        recording before changing the mix. System-player playback, Film and
        practice copies still use the original stereo file.
      </p>
    </form>
  );
}

export function StemPreparation({
  song,
  locked,
}: { song: MediaAsset; locked: boolean }) {
  const m = useMedia();
  const models = MEDIA_MODELS.filter((model) => model.kind === "stems");
  const [catalogId, setCatalogId] = useState(models[0]?.id ?? "");
  const [path, setPath] = useState("");
  const [price, setPrice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const disabled = locked || isPreview || song.seconds > 600;
  return (
    <details className="workspace-stack">
      <summary className="cursor-pointer text-sm">
        Separate instruments or import stems.
      </summary>
      <p className="workspace-note">
        Prepare separate tracks, then load this song in Jamstudio to set levels
        and play without its guitar. Original audio and any previous stem files
        are kept. Separation quality depends on the recording.
      </p>
      <form
        className="workspace-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void m.work("Separating these stems.", async () => {
            const receipt = await ipc.invoke<{ warning?: string | null }>(
              "media_separate_stems",
              {
                assetId: song.id,
                catalogId,
                usdPerMinute: price === "" ? null : Number(price),
                confirmed,
              },
            );
            setConfirmed(false);
            await m.refresh();
            useMedia.setState({
              message: `Stems saved. Load this song in Jamstudio to mix them.${receipt.warning ? ` ${receipt.warning}` : ""}`,
            });
          });
        }}
      >
        <label className="room-tool-field">
          Choose the separation provider.
          <select
            value={catalogId}
            disabled={disabled}
            onChange={(e) => setCatalogId(e.target.value)}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <p className="workspace-note">
          Add the provider API key in Settings. This uploads the selected song
          for a paid request. Check your account price and credits; the app does
          not know your subscription rate. Cancel stops waiting locally and may
          not stop the provider charge.
        </p>
        <label className="room-tool-field">
          Your account price is in USD per minute. This is optional.
          <input
            type="number"
            min={0}
            max={10000}
            step="any"
            value={price}
            disabled={disabled}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        {price !== "" && Number.isFinite(Number(price)) && (
          <p className="workspace-note">
            The estimated charge is $
            {((Number(price) * song.seconds) / 60).toFixed(2)}. Based on your
            entered rate.
          </p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={disabled}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I agree to upload this song and pay the provider charge.
        </label>
        <Button
          type="submit"
          disabled={disabled || !confirmed || song.seconds < 2}
        >
          Upload and separate these stems.
        </Button>
      </form>
      <form
        className="workspace-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void m.work("Importing these stems.", async () => {
            await ipc.invoke("media_stems_import", {
              assetId: song.id,
              path: path.trim(),
            });
            await m.refresh();
            setPath("");
            useMedia.setState({
              message:
                "Stems imported. Load this song in Jamstudio to mix them.",
            });
          });
        }}
      >
        <label className="room-tool-field">
          Enter the local stem ZIP path.
          <input
            value={path}
            disabled={disabled}
            placeholder="Paste the full path to stems.zip."
            onChange={(e) => setPath(e.target.value)}
          />
        </label>
        <p className="workspace-note">
          No upload or provider charge. Use 2–8 aligned audio files from the
          same song, with the same start and end; audio files only, up to 192 MB
          zipped and 10 minutes. A downloaded ZIP from a failed separation can
          also be imported here.
        </p>
        <Button type="submit" disabled={disabled || !path.trim()}>
          Import this stem ZIP.
        </Button>
      </form>
      <p className="workspace-note">
        Guitar-removal acceptance needs imported stems with a marked guitar
        track. Real-song residual at or below -6 dB is not claimed without those
        stems.
      </p>
      <Button
        disabled={disabled}
        onClick={() =>
          void m.work("Checking this guitar residual.", async () => {
            const result = await ipc.invoke<{
              db: number;
              pass: boolean;
              mixPath: string;
            }>("media_guitar_residual", { assetId: song.id });
            await useMedia.getState().refresh();
            useMedia.setState({
              message: result.pass
                ? `Guitar residual ${result.db.toFixed(1)} dB. Wrote ${result.mixPath}. Use Load this minus-guitar mix. Synthetic/local check only. Real-song residual at or below -6 dB is not claimed.`
                : `Guitar residual ${result.db.toFixed(1)} dB, above -6 dB. Wrote ${result.mixPath}. Load this minus-guitar mix stays not configured until a pass.`,
            });
          })
        }
      >
        Check this guitar residual.
      </Button>
    </details>
  );
}
