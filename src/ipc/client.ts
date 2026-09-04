/**
 * The one place the UI talks to the engine. Inside Tauri this is `invoke`/`listen`;
 * in a plain browser (`pnpm dev` without `tauri dev`, Storybook, tests) it is routed to
 * the simulated engine in `./preview` so every screen can be exercised without audio
 * hardware. The preview is announced loudly in the UI (see `isPreview`) so nobody
 * mistakes a simulation for the real band.
 */

import type { PreviewEngine } from "./preview";

export type Unlisten = () => void;

export interface IpcClient {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<Unlisten>;
}

function hasTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export const isTauri: boolean = hasTauri();
export const isPreview: boolean = !isTauri;

// The *promise* is memoised (not the instance) so concurrent first calls share one
// engine, and it lives on globalThis so Vite HMR re-evaluating this module cannot
// create a second simulated engine: one being commanded, another being heard.
const PREVIEW_KEY = "__jamPreviewEngine";
type PreviewHolder = { [PREVIEW_KEY]?: Promise<PreviewEngine> };

function getPreview(): Promise<PreviewEngine> {
  const holder = globalThis as unknown as PreviewHolder;
  if (!holder[PREVIEW_KEY]) {
    holder[PREVIEW_KEY] = import("./preview").then((mod) =>
      mod.createPreviewEngine(),
    );
  }
  return holder[PREVIEW_KEY];
}

const tauriClient: IpcClient = {
  async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  },
  async listen<T>(
    event: string,
    handler: (payload: T) => void,
  ): Promise<Unlisten> {
    const { listen } = await import("@tauri-apps/api/event");
    // Tauri wire names cannot contain dots. Keep logical domain names in the UI.
    return listen<T>(event.replaceAll(".", ":"), (e) => handler(e.payload));
  },
};

const previewClient: IpcClient = {
  async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const engine = await getPreview();
    return engine.invoke<T>(cmd, args ?? {});
  },
  async listen<T>(
    event: string,
    handler: (payload: T) => void,
  ): Promise<Unlisten> {
    const engine = await getPreview();
    return engine.listen<T>(event, handler);
  },
};

export const ipc: IpcClient = isTauri ? tauriClient : previewClient;

/** Test hook: swap the transport (e.g. for a recording client). */
export function __setIpcForTests(client: Partial<IpcClient>): void {
  Object.assign(ipc, client);
}
