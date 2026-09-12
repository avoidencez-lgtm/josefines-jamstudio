import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FinishingDesk } from "../../src/components/FinishingDesk";
import { __setIpcForTests, ipc } from "../../src/ipc/client";
import type { TakeMetadata } from "../../src/ipc/contract";
import {
  applyFinishingChange,
  buildSectionComp,
  contrastVariation,
  finishingReview,
  transitionRange,
} from "../../src/lib/finishing";
import { newOriginal, useWriting } from "../../src/lib/originals";
import { useEngineStore } from "../../src/store/engine";

it("isolates contrast to one appearance, preserves locked parts and exact timing", () => {
  const song = newOriginal();
  song.body.chart.arrangement.push({ sectionId: "chorus", repeats: 2 });
  song.body.sections.chorus.parts[0].locked = true;
  const next = contrastVariation(song.body, 2, "lift", 0.3, "last-chorus");
  expect(next.sections["last-chorus"].parts[0]).toEqual(
    song.body.sections.chorus.parts[0],
  );
  expect(next.sections["last-chorus"].parts[1].intensity).toBe(0.8);
  expect(next.chart.arrangement.map((a) => a.sectionId)).toEqual([
    "verse",
    "chorus",
    "last-chorus",
  ]);
  expect(next.chart.arrangement[2].repeats).toBe(2);
  expect(song.body.chart.sections).toHaveLength(2);
  expect(transitionRange(next.chart, 2, 2)).toEqual({
    startBar: 7,
    endBar: 11,
  });
  for (const p of song.body.sections.chorus.parts) p.locked = true;
  expect(() => contrastVariation(song.body, 1, "lift", 0.3, "locked")).toThrow(
    /locked|unchanged/,
  );
});

it("keeps a unique-appearance lift in the form without nested variation names (#428)", () => {
  const song = newOriginal();
  const first = contrastVariation(song.body, 1, "lift", 0.3, "lifted-chorus");
  expect(first.chart.arrangement.map((a) => a.sectionId)).toEqual([
    "verse",
    "lifted-chorus",
  ]);
  expect(first.chart.sections.map((s) => s.id)).toEqual([
    "verse",
    "lifted-chorus",
  ]);
  expect(first.chart.sections[1].name).toBe("This is Chorus variation 3.");
  expect(
    finishingReview(first, [], false).some((r) => r.id.startsWith("unused-")),
  ).toBe(false);
  const second = contrastVariation(first, 1, "lift", 0.2, "lifted-again");
  expect(second.chart.sections.map((s) => s.id)).toEqual([
    "verse",
    "lifted-again",
  ]);
  expect(second.chart.sections[1].name).toBe("This is Chorus variation 4.");
  expect(second.chart.sections[1].name).not.toMatch(/This is This is/);
  expect(second.chart.sections[1].name.split(".").length).toBe(2);
});

it("keeps a finishing preview when Keep cannot apply (#427)", () => {
  const song = newOriginal();
  song.versions = Array.from({ length: 20 }, (_, i) => ({
    id: `v${i}`,
    name: `This is version ${i + 1}.`,
    body: structuredClone(song.body),
  }));
  useWriting.setState({
    song,
    past: [],
    future: [],
    busy: false,
    dirty: false,
    message: "",
  });
  useEngineStore.setState({ isRecording: false });
  const next = contrastVariation(song.body, 1, "lift", 0.3, "kept-lift");
  const base = JSON.stringify([song.id, song.body]);
  expect(() =>
    applyFinishingChange(next, "This is a section lift.", base),
  ).toThrow(/version/);
  expect(useWriting.getState().song?.body).toEqual(song.body);
  expect(useWriting.getState().song?.versions).toHaveLength(20);
  useWriting.setState({
    song: { ...newOriginal(), id: song.id },
    busy: false,
  });
  useEngineStore.setState({ isRecording: true });
  expect(applyFinishingChange(next, "This is a section lift.", base)).toBe(
    false,
  );
  useEngineStore.setState({ isRecording: false });
  const fresh = newOriginal();
  useWriting.setState({
    song: fresh,
    past: [],
    future: [],
    busy: false,
    dirty: false,
    message: "",
  });
  const applied = contrastVariation(fresh.body, 1, "lift", 0.3, "kept-lift");
  expect(
    applyFinishingChange(
      applied,
      "This is a section lift.",
      JSON.stringify([fresh.id, fresh.body]),
    ),
  ).toBe(true);
  expect(
    useWriting.getState().song?.body.chart.arrangement.map((a) => a.sectionId),
  ).toEqual(["verse", "kept-lift"]);
});

it("comps the correct bars, replaces only the same comp slot and rejects stale takes", () => {
  const song = newOriginal();
  const take = {
    id: "test-take",
    pathInput: "guitar.wav",
    durationSecs: 25,
    snapshot: structuredClone(song),
  } as TakeMetadata;
  const body = buildSectionComp(song, take, 1);
  expect(body.clips[0]).toMatchObject({
    trimStart: 9.6,
    trimEnd: 19.2,
    startBar: 5,
    repeats: 1,
    takeId: "test-take",
  });
  song.body = body;
  expect(
    buildSectionComp(song, { ...take, id: "better" }, 1).clips,
  ).toHaveLength(1);
  expect(buildSectionComp(song, take, 0).clips).toHaveLength(2);
  expect(() =>
    buildSectionComp(song, { ...take, durationSecs: 10 }, 1),
  ).toThrow(/end/);
  expect(() =>
    buildSectionComp(song, { ...take, snapshot: { capture: true } }, 1),
  ).toThrow(/record/);
  song.body.chart.defaultBpm = 120;
  expect(() => buildSectionComp(song, take, 1)).toThrow(/timeline/);
  song.body.chart.defaultBpm = 100;
  song.body.chart.sections[0].bars.reverse();
  expect(() => buildSectionComp(song, take, 1)).toThrow(/timeline/);
});

it("reviews missing and overlong clips without treating instrumental lyrics as an error", () => {
  const song = newOriginal();
  song.body.clips.push({
    takeId: "gone",
    label: "Idea",
    trimStart: 0,
    trimEnd: 60,
    startBar: 1,
    repeats: 1,
    gain: 1,
    muted: false,
  });
  const review = finishingReview(song.body, [], false);
  expect(review.some((r) => r.id === "missing-0")).toBe(true);
  expect(review.some((r) => r.id === "overflow-0")).toBe(true);
  expect(review.some((r) => r.id.startsWith("lyrics"))).toBe(false);
  expect(
    finishingReview(song.body, [], true).some((r) => r.id.startsWith("lyrics")),
  ).toBe(true);
});

it("offers Stop listening for a guitar selection audition (#361)", async () => {
  const original = { ...ipc };
  const writing = useWriting.getState();
  const initial = useWriting.getInitialState();
  const previousSong = initial.song;
  const calls: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      calls.push(command);
      return undefined as T;
    },
  });
  try {
    initial.song = newOriginal();
    useWriting.setState({ song: initial.song, busy: false });
    const html = renderToStaticMarkup(createElement(FinishingDesk));
    expect(html).toContain("Listen to this selection.");
    expect(html).toContain("Stop listening.");
    await useWriting.getState().action(() => ipc.invoke("clip_audition_stop"));
    expect(calls).toEqual(["clip_audition_stop"]);
  } finally {
    initial.song = previousSong;
    __setIpcForTests(original);
    useWriting.setState(writing);
  }
});

it("loops a boundary through native transport and refuses an out-of-song loop or active recording", async () => {
  const original = { ...ipc };
  const writing = useWriting.getState();
  const engine = useEngineStore.getState();
  const calls: { command: string; args: unknown }[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string, args?: unknown) => {
      calls.push({ command, args });
      return undefined as T;
    },
  });
  try {
    useWriting.setState({ song: newOriginal() });
    useEngineStore.setState({ isRecording: false });
    await expect(useWriting.getState().loopRange(0, 7)).rejects.toThrow(
      /inside/,
    );
    expect(calls).toHaveLength(0);
    await useWriting.getState().loopRange(3, 7);
    expect(calls.map((c) => c.command)).toEqual([
      "originals_load",
      "transport_set_count_in",
      "transport_set_loop",
      "transport_seek_bar",
      "transport_play",
    ]);
    expect(calls[2].args).toEqual({ startBar: 3, endBar: 7, enabled: true });
    useEngineStore.setState({ isRecording: true });
    await expect(useWriting.getState().loopRange(3, 7)).rejects.toThrow(/take/);
    expect(calls).toHaveLength(5);
  } finally {
    __setIpcForTests(original);
    useWriting.setState(writing);
    useEngineStore.setState(engine);
  }
});
