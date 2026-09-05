import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  BandTelemetry,
  Chart,
  EngineStatus,
  RigProfile,
  RigState,
  StyleSummary,
  TransportTelemetry,
} from "../../src/ipc/contract";
import {
  type PreviewEngine,
  createPreviewEngine,
  describeMidi,
  sceneMidi,
} from "../../src/ipc/preview";

describe("browser preview engine", () => {
  let engine: PreviewEngine;
  beforeEach(() => {
    engine = createPreviewEngine({ autoTick: false });
  });
  afterEach(() => engine.dispose());

  it("refuses malformed recording and MIDI inputs without changing state", async () => {
    const before = await engine.invoke<RigState>("rig_get_state", {});
    for (const bad of [null, false, "1", -1, 1.5, Number.NaN]) {
      await expect(
        engine.invoke("rig_set_control", { cc: bad, value: 1 }),
      ).rejects.toThrow("CC");
      if (bad !== null) {
        await expect(
          engine.invoke("rig_set_section_mapping", {
            section: "Verse",
            sceneIdx: bad,
          }),
        ).rejects.toThrow("does not exist");
      }
    }
    expect(await engine.invoke("rig_get_state", {})).toEqual(before);
    await expect(
      engine.invoke("recorder_start", { sessionId: null }),
    ).rejects.toThrow("session ID");
    await expect(engine.invoke("recorder_stop", {})).rejects.toThrow(
      "No active recording",
    );
  });

  it("serves the bundled library", async () => {
    const styles = await engine.invoke<StyleSummary[]>("band_list_styles", {});
    const charts = await engine.invoke<Chart[]>("band_list_charts", {});
    expect(styles.map((s) => s.id).sort()).toEqual([
      "ballad-68",
      "blues-shuffle",
      "funk-16",
      "jazz-swing",
      "metal-gallop",
      "rock-straight",
    ]);
    expect(charts.length).toBe(9);
  });

  it("says loudly that it is not real audio", async () => {
    const status = await engine.invoke<EngineStatus>("engine_status", {});
    expect(status.mode).toBe("Headless");
    expect(status.last_error).toMatch(/preview/i);
  });

  it("follows a chart bar by bar and reports chords", async () => {
    const seen: { transport?: TransportTelemetry; band?: BandTelemetry } = {};
    await engine.listen<TransportTelemetry>("transport.state", (t) => {
      seen.transport = t;
    });
    await engine.listen<BandTelemetry>("band.state", (b) => {
      seen.band = b;
    });
    await engine.invoke("band_load_chart", { chartId: "blues-12-bar" });
    await engine.invoke("transport_set_count_in", { bars: 0 });
    await engine.invoke("transport_set_tempo", { bpm: 120 });
    await engine.invoke("transport_play", {});
    engine.tick(0.01);
    expect(seen.transport?.state).toBe("playing");
    expect(seen.transport?.bar).toBe(1);
    expect(seen.band?.current_chord).toBe("A7");

    // 4 bars at 120 BPM in 4/4 is 8 seconds: bar 5 is the IV chord.
    for (let i = 0; i < 80; i++) engine.tick(0.1);
    expect(seen.transport?.bar).toBe(5);
    expect(seen.band?.current_chord).toBe("D7");
    expect(seen.band?.next_chord).toBe("D7");
  });

  it("applies style changes at the next bar while playing", async () => {
    const seen: { band?: BandTelemetry } = {};
    await engine.listen<BandTelemetry>("band.state", (b) => {
      seen.band = b;
    });
    await engine.invoke("transport_set_count_in", { bars: 0 });
    await engine.invoke("transport_set_tempo", { bpm: 120 });
    await engine.invoke("transport_play", {});
    engine.tick(0.5);
    await engine.invoke("band_set_style", { styleId: "funk-16" });
    engine.tick(0.01);
    expect(seen.band?.pending_style_id).toBe("funk-16");
    expect(seen.band?.style_id).toBe("blues-shuffle");
    for (let i = 0; i < 20; i++) engine.tick(0.1);
    expect(seen.band?.style_id).toBe("funk-16");
    expect(seen.band?.pending_style_id).toBeNull();
  });

  it("rejects unknown ids like the real engine", async () => {
    await expect(
      engine.invoke("band_set_style", { styleId: "nope" }),
    ).rejects.toThrow(/unknown style/);
    await expect(
      engine.invoke("band_load_chart", { chartId: "nope" }),
    ).rejects.toThrow(/unknown chart/);
    await expect(engine.invoke("does_not_exist", {})).rejects.toThrow(
      /unknown command/,
    );
  });

  it("keeps saved charts for the session and reports them as user charts", async () => {
    const charts = await engine.invoke<Chart[]>("band_list_charts", {});
    const mine = { ...charts[0], id: "my-tune", name: "My Tune" };
    await engine.invoke("charts_save", { chart: mine });
    const info = await engine.invoke<{ userChartIds: string[] }>(
      "library_reload",
      {},
    );
    expect(info.userChartIds).toEqual(["my-tune"]);
    const after = await engine.invoke<Chart[]>("band_list_charts", {});
    expect(after.some((c) => c.id === "my-tune")).toBe(true);
    await engine.invoke("charts_delete_user", { chartId: "my-tune" });
    const gone = await engine.invoke<Chart[]>("band_list_charts", {});
    expect(gone.some((c) => c.id === "my-tune")).toBe(false);
  });

  it("ships the real rig profiles and renders scenes to MIDI like jam-rig", async () => {
    const rigs = await engine.invoke<RigProfile[]>("rig_list_profiles", {});
    const ids = rigs.map((r) => r.id);
    expect(ids).toContain("headrush-pedalboard");
    expect(ids).toContain("black-spirit-200");
    const bs = rigs.find((r) => r.id === "black-spirit-200");
    expect(bs?.midiChannel).toBe(1);
    const lead = bs?.scenes.findIndex((s) => s.name === "Lead") ?? -1;
    const bytes = sceneMidi(bs as RigProfile, lead);
    expect(bytes[0]).toEqual([0xc1, 2]);
    expect(bytes.some((m) => m[0] === 0xb1 && m[1] === 20)).toBe(true);
    expect(describeMidi([0xc1, 7])).toBe("PC 7 ch2");
    expect(describeMidi([0xb0, 20, 64])).toBe("CC 20 = 64 ch1");
  });

  it("fires a mapped scene once when the band enters a section", async () => {
    const pushed: RigState[] = [];
    await engine.listen<RigState>("rig.state", (s) => pushed.push(s));
    await engine.invoke("rig_select_profile", {
      profileId: "black-spirit-200",
    });
    // Intro(4) Verse(8) Chorus(8) Verse(8) ...: Clean for the Intro, Lead for the Verse.
    await engine.invoke("band_load_chart", { chartId: "rock-song-form" });
    await engine.invoke("rig_set_section_mapping", {
      section: "Intro",
      sceneIdx: 0,
    });
    await engine.invoke("rig_set_section_mapping", {
      section: "Verse",
      sceneIdx: 2,
    });
    await engine.invoke("transport_set_count_in", { bars: 0 });
    await engine.invoke("transport_set_tempo", { bpm: 240 });
    await engine.invoke("transport_play", {});
    // 40 s at 240 BPM = 40 bars: Intro, Verse, Chorus, Verse, half a Chorus.
    for (let i = 0; i < 400; i++) engine.tick(0.1);
    const state = await engine.invoke<RigState>("rig_get_state", {});
    // A Black Spirit scene is PC + CCs; count Program Changes, one per scene change.
    const pcs = state.monitor.filter((m) => m.text.startsWith("PC "));
    expect(pcs.map((m) => m.reason)).toEqual([
      "section Intro -> Clean",
      "section Verse -> Lead",
    ]);
    // The Chorus is unmapped, so the rig stays on Lead and the second Verse does
    // not re-send the same scene.
    expect(state.currentScene).toBe(2);
    expect(state.monitor.some((m) => m.text === "PC 2 ch2")).toBe(true);
    expect(pushed.length).toBe(2);

    // With follow off, nothing more is sent.
    await engine.invoke("rig_clear_monitor", {});
    await engine.invoke("rig_set_follow_sections", { enabled: false });
    for (let i = 0; i < 100; i++) engine.tick(0.1);
    const quiet = await engine.invoke<RigState>("rig_get_state", {});
    expect(quiet.monitor.length).toBe(0);
  });

  it("clamps knobs to the declared range and remembers them", async () => {
    await engine.invoke("rig_select_profile", { profileId: "quad-cortex" });
    const s = await engine.invoke<RigState>("rig_set_control", {
      cc: 43,
      value: 99,
    });
    expect(s.controlValues["43"]).toBe(7);
    expect(s.monitor.at(-1)?.bytes).toEqual([0xb0, 43, 7]);
    expect(s.live).toBe(false);
  });
});
