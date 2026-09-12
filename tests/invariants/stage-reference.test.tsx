import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Stage } from "../../src/screens/Stage";
import { useEngineStore } from "../../src/store/engine";

it("shows Stage chord and bar from the analysed reference grid in song mode", () => {
  const initial = useEngineStore.getInitialState();
  const telemetry = initial.telemetry;
  try {
    initial.telemetry = {
      ...telemetry,
      band: {
        ...telemetry.band,
        current_chord: "",
        next_chord: null,
      },
      reference: {
        asset_id: "fixture",
        label: "Synthetic reference",
        seconds: 5,
        position: 2.5,
        state: "playing",
        loop_start: 0,
        loop_end: 5,
        loop_enabled: false,
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
          sections: [],
          position: {
            bar: 2,
            beat: 1.4,
            bpm: 100,
            section_id: "chorus",
            section_label: "Chorus",
          },
        },
      },
    };
    const html = renderToStaticMarkup(createElement(Stage));
    expect(html).toContain("Play alongside your song.");
    expect(html).toContain("This is the active chord.");
    expect(html).toContain(">F<");
    expect(html).toContain("Next is G");
    expect(html).toContain("This is the bar.");
    expect(html).toContain("2 · 1");
    expect(html).toContain("100 BPM.");
    expect(html).not.toContain("Your band. Your lead.");
    expect(html).not.toContain("This is a rest or no chord.");
  } finally {
    initial.telemetry = telemetry;
  }
});
