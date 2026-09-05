import { useEngineStore } from "../store/engine";
import { useLibraryDraft } from "./libraryDraft";
import { useMedia } from "./media";
import { useWriting } from "./originals";
import { useRoomOperation } from "./roomActions";

export const ACTIVE_WORK_MESSAGE =
  "Finish the recording or current operation before closing.";

/** Drafts that would be lost: the chart editor, the film and the original song. */
export const hasUnsavedWork = () =>
  useLibraryDraft.getState().dirty ||
  useMedia.getState().dirty ||
  useWriting.getState().dirty;

/** Work the window must not close during. A room tool only waiting for advice is not blocking. */
export const hasActiveWork = () =>
  useRoomOperation.getState().blocking ||
  useEngineStore.getState().isRecording ||
  useWriting.getState().busy ||
  Boolean(useMedia.getState().busy);

/**
 * What a close or quit request should do right now. The window's close button and
 * an app-level quit (Cmd+Q on macOS, forwarded by Rust as `app.exit-requested`)
 * take the same decision (#35).
 */
export function closeDecision(): "refuse" | "ask" | "close" {
  if (hasActiveWork()) return "refuse";
  if (hasUnsavedWork()) return "ask";
  return "close";
}
