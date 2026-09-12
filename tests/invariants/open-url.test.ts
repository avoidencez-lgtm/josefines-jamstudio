import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import { openExternal } from "../../src/lib/openUrl";
import { useEngineStore } from "../../src/store/engine";

vi.mock("../../src/ipc/client", () => ({
  isPreview: false,
  ipc: { invoke: vi.fn(), listen: vi.fn() },
}));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("desktop opener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEngineStore.setState({ notices: [] });
  });

  it("reports a rejected launch through the existing notice rail", async () => {
    vi.mocked(ipc.invoke).mockRejectedValueOnce(
      "No default browser is configured.",
    );
    await expect(
      openExternal("https://ffmpeg.org/download.html"),
    ).resolves.toBeUndefined();
    expect(useEngineStore.getState().notices).toEqual([
      expect.objectContaining({
        kind: "error",
        text: expect.stringContaining("No default browser is configured."),
      }),
    ]);
    expect(useEngineStore.getState().notices[0].text).toContain(
      "https://ffmpeg.org/download.html",
    );
  });

  it("hands the URL to native IPC without announcing an unverified browser launch", async () => {
    vi.mocked(ipc.invoke).mockResolvedValueOnce(null);
    await openExternal("https://ffmpeg.org/download.html");
    expect(ipc.invoke).toHaveBeenCalledWith("open_url", {
      url: "https://ffmpeg.org/download.html",
    });
    expect(useEngineStore.getState().notices).toEqual([]);
  });

  it("opens Windows https links through ShellExecute rather than hidden explorer (#284)", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src-tauri/src/platform/mod.rs"),
      "utf8",
    );
    expect(src).toContain("ShellExecuteW");
    expect(src).toContain("windows_shell_open");
    const https =
      src
        .split("pub async fn open_https")[1]
        ?.split("pub async fn open_media")[0] ?? "";
    expect(https).not.toMatch(/explorer\.exe/);
  });

  it("has no target=_blank leftovers in src", () => {
    const root = path.resolve(process.cwd(), "src");
    const hits = walk(root).flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      return text.includes('target="_blank"') ||
        text.includes("target={'_blank'}")
        ? [path.relative(root, file)]
        : [];
    });
    expect(hits).toEqual([]);
  });
});
