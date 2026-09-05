import { ipc, isPreview } from "../ipc/client";
import { useEngineStore } from "../store/engine";

/** Open a documented https URL in the OS browser (desktop) or a new tab (preview). */
export async function openExternal(url: string): Promise<void> {
  try {
    if (isPreview) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    await ipc.invoke("open_url", { url });
  } catch (error) {
    useEngineStore
      .getState()
      .notify(
        "error",
        `Could not open this link. Copy it into your browser: ${url}. ${String(error)}`,
      );
  }
}
