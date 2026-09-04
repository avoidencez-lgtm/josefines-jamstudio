import { afterEach, expect, it, vi } from "vitest";
import { __setIpcForTests, ipc } from "../../src/ipc/client";
import { newVideo, useMedia } from "../../src/lib/media";
import { newOriginal, useWriting } from "../../src/lib/originals";

vi.mock("../../src/ipc/client", async (original) => ({
  ...(await original<object>()),
  isPreview: false,
}));
const originalIpc = { ...ipc };
afterEach(() => __setIpcForTests(originalIpc));

it("saving a song retains an intervening edit and advances its disk revision", async () => {
  const song = newOriginal();
  useWriting.setState({ song, busy: false, dirty: true, past: [], future: [] });
  let finish!: (value: unknown) => void;
  __setIpcForTests({
    invoke: <T>(command: string) =>
      command === "originals_save"
        ? new Promise<T>((resolve) => {
            finish = resolve as typeof finish;
          })
        : Promise.resolve([] as T),
  });
  const saving = useWriting.getState().save();
  useWriting.getState().edit((b) => {
    b.notes = "Keep this newer line";
  });
  finish({ ...song, revision: 1 });
  await saving;
  expect(useWriting.getState().song?.body.notes).toBe("Keep this newer line");
  expect(useWriting.getState().song?.revision).toBe(1);
  expect(useWriting.getState().dirty).toBe(true);
});

it("Film retains a newer draft during save and Undo keeps the current disk revision", async () => {
  const project = newVideo();
  useMedia.getState().open(project);
  let finish!: (value: unknown) => void;
  __setIpcForTests({
    invoke: <T>(command: string) =>
      command === "media_save"
        ? new Promise<T>((resolve) => {
            finish = resolve as typeof finish;
          })
        : Promise.resolve({ projects: [], assets: [], jobs: [] } as T),
  });
  const saving = useMedia.getState().save();
  useMedia.getState().edit({ title: "Newer title" });
  finish({ ...project, revision: 1 });
  await saving;
  expect(useMedia.getState().project.title).toBe("Newer title");
  expect(useMedia.getState().dirty).toBe(true);
  useMedia.getState().undoEdit();
  expect(useMedia.getState().project.title).toBe(project.title);
  expect(useMedia.getState().project.revision).toBe(1);
});
