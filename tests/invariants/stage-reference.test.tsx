import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import { cueSetlistItem } from "../../src/lib/roomActions";
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
    expect(html).not.toContain(">-5<");
  } finally {
    initial.telemetry = telemetry;
  }
});

it("refuses Stage tempo writes when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore.getState().transportSetTempo(100);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Band tempo and Write transposition do not change reference audio.",
      );
    expect(invoke).not.toHaveBeenCalled();
    expect(
      useEngineStore
        .getState()
        .notices.some((n) =>
          n.text.includes("Choose a practice speed as a percent"),
        ),
    ).toBe(true);
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band loop writes when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore
      .getState()
      .transportSetLoop(1, 5, true);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Choose a confirmed section of the currently loaded reference.",
      );
    expect(invoke).not.toHaveBeenCalled();
    expect(
      useEngineStore
        .getState()
        .notices.some((n) =>
          n.text.includes("Choose a confirmed section of the currently loaded"),
        ),
    ).toBe(true);
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band bar seeks when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const seek = await useEngineStore.getState().transportSeekBar(2);
    expect(seek.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    expect(
      useEngineStore
        .getState()
        .notices.some((n) =>
          n.text.includes("Choose a position inside the reference song."),
        ),
    ).toBe(true);
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band click volume writes when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      clickVolume: 0.7,
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    await useEngineStore.getState().setClickVolume(0.2);
    expect(invoke).not.toHaveBeenCalled();
    expect(useEngineStore.getState().clickVolume).toBe(0.7);
    expect(
      useEngineStore
        .getState()
        .notices.some((n) =>
          n.text.includes("Band click does not change reference audio."),
        ),
    ).toBe(true);
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band count-in writes when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore.getState().transportSetCountIn(1);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Band count-in does not change reference audio.",
      );
    expect(invoke).not.toHaveBeenCalled();
    expect(
      useEngineStore
        .getState()
        .notices.some((n) =>
          n.text.includes("Choose play on the loaded song instead."),
        ),
    ).toBe(true);
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band meter writes when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore
      .getState()
      .transportSetTimeSignature(3, 4);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Band time signature does not change reference audio.",
      );
    expect(invoke).not.toHaveBeenCalled();
    expect(
      useEngineStore
        .getState()
        .notices.some((n) =>
          n.text.includes("Choose confirmed beats per bar in Songs."),
        ),
    ).toBe(true);
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band cues when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore.getState().bandCue("fill");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Band cues do not change reference audio.",
      );
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band groove writes when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore
      .getState()
      .bandSetStyle("ballad-68");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Band grooves do not change reference audio.",
      );
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band intensity writes when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore.getState().bandSetIntensity(0.8);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Band intensity does not change reference audio.",
      );
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band mute writes when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore
      .getState()
      .bandSet({ muteBass: true });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Band mutes do not change reference audio.",
      );
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band chart loads when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore
      .getState()
      .bandLoadChart("12-bar-blues");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Band charts do not change reference audio.",
      );
    expect(invoke).not.toHaveBeenCalled();
    expect(useEngineStore.getState().currentChart).toBe(initial.currentChart);
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses band chart transpose when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const result = await useEngineStore.getState().transposeCurrentChart(1);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain(
        "Write transposition do not change reference audio.",
      );
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses inline band chart play when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    const played = await useEngineStore.getState().playChartInline({
      schemaVersion: 1,
      id: "inline",
      name: "Inline",
      keyTonic: 0,
      mode: "major",
      timeSig: [4, 4],
      defaultBpm: 120,
      sections: [],
      arrangement: [],
    });
    expect(played).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    expect(useEngineStore.getState().currentChart).toBe(initial.currentChart);
    expect(
      useEngineStore
        .getState()
        .notices.some((n) =>
          n.text.includes("Band charts do not change reference audio."),
        ),
    ).toBe(true);
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});

it("refuses setlist cue apply when a reference is loaded", async () => {
  const initial = useEngineStore.getState();
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    useEngineStore.setState({
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Synthetic reference",
          seconds: 5,
          position: 2.5,
          state: "playing",
          loop_start: 0,
          loop_end: 5,
          loop_enabled: false,
        },
      },
    });
    await expect(
      cueSetlistItem({
        id: "opener",
        chartId: "rock-song-form",
        bpm: 132,
        countIn: 2,
      }),
    ).rejects.toThrow("Band charts do not change reference audio.");
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    invoke.mockRestore();
    useEngineStore.setState(initial, true);
  }
});
