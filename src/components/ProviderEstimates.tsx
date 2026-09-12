import { useState } from "react";
import { ipc, isPreview } from "../ipc/client";
import type { MediaAsset } from "../lib/media";
import { useMedia } from "../lib/media";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";

function readProviderAnalysis(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as {
    schemaVersion?: unknown;
    provider?: unknown;
    confidence?: unknown;
    bpm?: unknown;
    key?: unknown;
    sourceHash?: unknown;
    sections?: { name?: string }[];
  };
  if (v.schemaVersion !== 1 || v.provider !== "musicai") return null;
  return v;
}

export function ProviderEstimates({
  song,
  locked,
}: {
  song: MediaAsset;
  locked: boolean;
}) {
  const hasKey = useEngineStore((s) => Boolean(s.keysPresent.musicai));
  const saved = readProviderAnalysis(song.providerAnalysis);
  const [confirmed, setConfirmed] = useState(false);
  const sourceHash =
    song.sourceHash ??
    (typeof saved?.sourceHash === "string" ? saved.sourceHash : undefined);
  return (
    <section
      className="workspace-stack"
      aria-label="These are the Music.ai estimates."
    >
      <h3>These are the Music.ai estimates.</h3>
      <p className="workspace-note">
        Live Music.ai jobs are not configured. Add a Music.ai key in Settings,
        set JAM_LIVE=1, and record a SUCCEEDED job before this app may upload.
        Local Analyze tempo and chords stays available. Apply these Music.ai
        estimates writes unverified fixture results only when
        JAM_MUSICAI_FIXTURE=1. Confirm this recorded grid may replace the
        confirmed bar grid from those fixture beats after you listen. Live
        Music.ai jobs stay not configured and never write the grid.
      </p>
      {!hasKey && (
        <p className="workspace-note">No Music.ai key is saved yet.</p>
      )}
      {saved && (
        <p className="workspace-note">
          {`Unverified ${typeof saved.confidence === "string" ? saved.confidence : "estimate"}.${
            typeof saved.bpm === "number" ? ` ${saved.bpm} BPM.` : ""
          }${typeof saved.key === "string" ? ` ${saved.key}.` : ""}${
            saved.sections?.length
              ? ` ${saved.sections
                  .map((s) => s.name)
                  .filter(Boolean)
                  .join(", ")}.`
              : ""
          } Does not drive the transport grid.`}
        </p>
      )}
      <Button
        disabled={locked || isPreview}
        onClick={() =>
          void useMedia
            .getState()
            .work("Saving these Music.ai estimates.", async () => {
              await ipc.invoke("analysis_start", {
                assetId: song.id,
                kinds: ["beats", "chords", "key", "sections"],
              });
              await useMedia.getState().refresh();
            })
        }
      >
        Apply these Music.ai estimates.
      </Button>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={locked || isPreview || !saved}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I checked the first downbeat, beat grouping and section boundaries
        by listening.
      </label>
      <Button
        disabled={locked || isPreview || !saved || !confirmed || !sourceHash}
        onClick={() =>
          void useMedia
            .getState()
            .work("Confirming this recorded grid.", async () => {
              await ipc.invoke("media_reference_grid_replace", {
                assetId: song.id,
                replacement: {
                  sourceHash,
                  firstDownbeat: 0,
                  beatsPerBar: 4,
                  sections: [],
                  confirmed,
                },
              });
              await useMedia.getState().refresh();
              useMedia.setState({
                message:
                  "Confirmed map saved. Load this reference again to use its bars and section loops.",
              });
            })
        }
      >
        Confirm this recorded grid.
      </Button>
    </section>
  );
}
