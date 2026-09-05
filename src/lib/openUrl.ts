import { ipc, isPreview } from "../ipc/client";

/** Open a documented https URL in the OS browser (desktop) or a new tab (preview). */
export async function openExternal(url: string): Promise<void> {
  if (isPreview) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await ipc.invoke("open_url", { url });
}
