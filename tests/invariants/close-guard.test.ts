import { afterEach, expect, it } from "vitest";
import { closeDecision } from "../../src/lib/closeGuard";
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
  useEngineStore.setState({ isRecording: false });
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
  useLibraryDraft.setState({ dirty: true });
  expect(closeDecision()).toBe("ask");
  useLibraryDraft.setState({ dirty: false });
  useMedia.setState({ busy: "Rendering" });
  expect(closeDecision()).toBe("refuse");
});
