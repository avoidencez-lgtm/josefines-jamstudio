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
  return (
    <section
      className="workspace-stack"
      aria-label="These are the Music.ai estimates."
    >
      <h3>These are the Music.ai estimates.</h3>
      <p className="workspace-note">
        Live Music.ai jobs are not configured. Add a Music.ai key in Settings,
        set JAM_LIVE=1, and record a SUCCEEDED job before this app may upload.
        Local Analyze tempo and chords stays available. Saved estimates never
        drive the confirmed bar grid.
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
    </section>
  );
}
