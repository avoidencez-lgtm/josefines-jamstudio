import { afterEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import {
  handleJoQuery,
  snapshotContext,
  useJoConversation,
} from "../../src/lib/jo/conversation";
import { contextSummary } from "../../src/lib/jo/gemini";
import { useEngineStore } from "../../src/store/engine";

const initial = useEngineStore.getState();

afterEach(() => {
  useEngineStore.setState(initial, true);
  vi.restoreAllMocks();
});

it("shares real command outcomes across rooms without erasing another draft", async () => {
  vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  useEngineStore.setState({ isPreview: true });
  useJoConversation.setState({
    busy: false,
    messages: [],
    pending: null,
    inputValue: "Set tempo to 100",
  });
  const reply = await handleJoQuery("Set tempo to 100");
  expect(reply).toContain("100");
  expect(ipc.invoke).toHaveBeenCalledWith("transport_set_tempo", { bpm: 100 });
  expect(useJoConversation.getState().inputValue).toBe("");
  useJoConversation.setState({ inputValue: "An unfinished song idea" });
  await handleJoQuery("stop");
  expect(useJoConversation.getState().inputValue).toBe(
    "An unfinished song idea",
  );
  expect(useJoConversation.getState().messages.at(-1)?.text).toMatch(/stop/i);
});

it("keeps song edits behind review and ignores a cancelled request before dispatch", async () => {
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  useEngineStore.setState({ isPreview: true });
  useJoConversation.setState({ busy: false, messages: [], pending: null });
  await handleJoQuery("lock bass");
  expect(useJoConversation.getState().pending?.calls[0].name).toBe(
    "songwriting",
  );
  expect(invoke).not.toHaveBeenCalled();
  await handleJoQuery("stop", () => false);
  expect(invoke).not.toHaveBeenCalled();
  expect(useJoConversation.getState().busy).toBe(false);
});

it("uses the analysed reference chord, section, bar and tempo when a song is loaded", () => {
  useEngineStore.setState(
    {
      ...initial,
      telemetry: {
        ...initial.telemetry,
        band: {
          ...initial.telemetry.band,
          current_chord: "",
          current_section: "",
        },
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 2.2,
          loop_end: 4.6,
          loop_enabled: true,
          speed: 0.75,
          semitones: 2,
          stems: [
            {
              id: "drums",
              label: "Drums",
              gain: 0.8,
              muted: false,
              guitar: false,
            },
            {
              id: "gtr",
              label: "Guitar",
              gain: 1,
              muted: true,
              guitar: true,
            },
          ],
          ramp: {
            config: {
              schemaVersion: 1,
              startPercent: 75,
              stepPercent: 5,
              targetPercent: 100,
              barsPerStep: 4,
            },
            active: true,
            completed_bars: 2,
            speed_percent: 80,
          },
          analysis: {
            confidence: "low",
            bpm: 100,
            key: "C major",
            chord: "F",
            next_chord: "G",
            beat: 5,
            beat_count: 8,
          },
          grid: {
            origin: "confirmed-local",
            beats_per_bar: 4,
            bars: 2,
            sections: [{ id: "chorus", label: "Chorus", startBar: 2, endBar: 4 }],
            position: {
              bar: 2,
              beat: 1.4,
              bpm: 100,
              section_id: "chorus",
              section_label: "Chorus",
            },
          },
        },
      },
    },
    true,
  );
  const ctx = snapshotContext();
  expect(ctx.transportState).toBe("playing");
  expect(contextSummary(ctx)).toContain("Transport is playing");
  expect(contextSummary(ctx)).not.toContain("Transport is stopped");
  expect(ctx.currentChord).toBe("F");
  expect(ctx.currentSection).toBe("Chorus");
  expect(ctx.bar).toBe(2);
  expect(ctx.bpm).toBe(100);
  expect(ctx.reference?.label).toBe("Synthetic reference");
  expect(contextSummary(ctx)).toContain("100 BPM, bar 2");
  expect(ctx.reference?.speed).toBe(0.75);
  expect(ctx.reference?.semitones).toBe(2);
  expect(contextSummary(ctx)).toContain(
    "Reference is Synthetic reference (id fixture) at 75% and 2 semitones; now on F in the Chorus.",
  );
  expect(ctx.reference?.ramp?.active).toBe(true);
  expect(contextSummary(ctx)).toContain(
    "Confirmed reference section ids are chorus (Chorus).",
  );
  expect(contextSummary(ctx)).toContain(
    "This ramp is armed from 75 to 100 by 5 every 4 bars.",
  );
  expect(ctx.reference?.confirmedBars).toBe(2);
  expect(contextSummary(ctx)).toContain("Confirmed reference bars are 2.");
  expect(ctx.reference?.loopEnabled).toBe(true);
  expect(ctx.reference?.loopStart).toBe(2.2);
  expect(ctx.reference?.loopEnd).toBe(4.6);
  expect(contextSummary(ctx)).toContain("Reference loop is 2.2 to 4.6 s.");
  expect(ctx.reference?.position).toBe(2.5);
  expect(ctx.reference?.seconds).toBe(5);
  expect(contextSummary(ctx)).toContain("The reference is at 2.5 of 5.0 s.");
  expect(ctx.nextChord).toBe("G");
  expect(contextSummary(ctx)).toContain("Next is G.");
  expect(ctx.reference?.key).toBe("C major");
  expect(contextSummary(ctx)).toContain("The key is C major.");
  expect(ctx.reference?.analysisError).toBeNull();
  expect(ctx.reference?.gridError).toBeNull();
  expect(contextSummary(ctx)).toContain("Reference analysis has no error.");
  expect(contextSummary(ctx)).toContain("Reference grid has no error.");
  expect(ctx.reference?.processingError).toBeNull();
  expect(contextSummary(ctx)).toContain("Reference processing has no error.");
  expect(ctx.reference?.stems?.map((stem) => stem.id)).toEqual(["drums", "gtr"]);
  expect(contextSummary(ctx)).toContain(
    "Reference stem ids are drums (Drums, 80%, playing), gtr (Guitar, 100%, muted, guitar).",
  );
  expect(ctx.reference?.gridOrigin).toBe("confirmed-local");
  expect(contextSummary(ctx)).toContain(
    "Reference grid origin is confirmed-local.",
  );
  expect(ctx.reference?.beatsPerBar).toBe(4);
  expect(contextSummary(ctx)).toContain("Reference beats per bar are 4.");
  expect(ctx.reference?.beat).toBe(1);
  expect(contextSummary(ctx)).toContain("Reference beat is 1.");
  expect(ctx.reference?.analysisBeat).toBe(5);
  expect(ctx.reference?.analysisBeatCount).toBe(8);
  expect(contextSummary(ctx)).toContain("Beat 5 of 8.");
  expect(ctx.reference?.confidence).toBe("low");
  expect(contextSummary(ctx)).toContain("Local estimates. Low confidence.");
  expect(ctx.reference?.analysisBpm).toBe(100);
  expect(contextSummary(ctx)).toContain("The analysed tempo is 100.0 BPM.");
  expect(contextSummary(ctx)).not.toContain("Chart is");
  expect(contextSummary(ctx)).not.toContain("120 BPM");
});
