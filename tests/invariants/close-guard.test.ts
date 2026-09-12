import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { closeDecision, windowCloseAction } from "../../src/lib/closeGuard";
import { useLibraryDraft } from "../../src/lib/libraryDraft";
import { useMedia } from "../../src/lib/media";
import { newOriginal, useWriting } from "../../src/lib/originals";
import { useRoomOperation } from "../../src/lib/roomActions";
import { useEngineStore } from "../../src/store/engine";

afterEach(() => {
  useWriting.setState({ song: null, dirty: false, busy: false });
  useLibraryDraft.setState({ dirty: false });
  useMedia.setState({ dirty: false, busy: "" });
  useRoomOperation.setState({ busy: false, blocking: false });
  useEngineStore.setState({ isRecording: false, calibrating: false });
});

it("refuses to close during blocking work, asks about unsaved drafts, otherwise lets the window go (#35)", () => {
  expect(closeDecision()).toBe("close");
  useWriting.setState({ song: newOriginal(), dirty: true });
  expect(closeDecision()).toBe("ask");
  // A room tool that only waits for advice never traps the window.
  useRoomOperation.setState({ busy: true, blocking: false });
  expect(closeDecision()).toBe("ask");
  useRoomOperation.setState({ busy: true, blocking: true });
  expect(closeDecision()).toBe("refuse");
  useRoomOperation.setState({ busy: false, blocking: false });
  useWriting.setState({ dirty: false });
  useEngineStore.setState({ isRecording: true });
  expect(closeDecision()).toBe("refuse");
  useEngineStore.setState({ isRecording: false });
  useEngineStore.setState({ calibrating: true });
  expect(closeDecision()).toBe("refuse");
  useEngineStore.setState({ calibrating: false });
  useLibraryDraft.setState({ dirty: true });
  expect(closeDecision()).toBe("ask");
  useLibraryDraft.setState({ dirty: false });
  useMedia.setState({ busy: "Rendering" });
  expect(closeDecision()).toBe("refuse");
  useMedia.setState({ busy: "Generating video. This can take several minutes." });
  expect(closeDecision()).toBe("refuse");
  useMedia.setState({ busy: "" });
  expect(closeDecision()).toBe("close");
});

it("routes Cmd+Q through the same closeDecision as the window close button (#35)", () => {
  const app = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
  const rust = fs.readFileSync(
    path.resolve(process.cwd(), "src-tauri/src/lib.rs"),
    "utf8",
  );
  expect(app).toContain('listen("app.exit-requested"');
  expect(app).toMatch(
    /listen\("app\.exit-requested"[\s\S]*?closeDecision\(\)/,
  );
  expect(rust).toContain("RunEvent::ExitRequested");
  expect(rust).toContain('emit("app:exit-requested"');
  expect(rust).toContain("prevent_exit");
  expect(closeDecision()).toBe("close");
});

it("always preventDefaults the window close so Tauri can then app_exit (#127)", () => {
  let prevented = 0;
  const preventDefault = () => {
    prevented += 1;
  };
  expect(windowCloseAction("close", preventDefault)).toBe("exit");
  expect(windowCloseAction("ask", preventDefault)).toBe("ask");
  expect(windowCloseAction("refuse", preventDefault)).toBe("refuse");
  expect(prevented).toBe(3);
});
