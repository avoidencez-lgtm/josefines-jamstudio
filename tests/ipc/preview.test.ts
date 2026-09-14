import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  BandTelemetry,
  Chart,
  EngineStatus,
  EngineTelemetry,
  LatencyCalibration,
  RigProfile,
  RigState,
  StyleSummary,
  TakeMetadata,
  TransportTelemetry,
  TunerTelemetry,
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

  it("refuses unrepresentable band positions without changing transport", async () => {
    await engine.invoke("transport_locate", { beats: 4 });
    const before = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    for (const [command, args] of [
      ["transport_locate", { beats: Number.MAX_VALUE }],
      ["transport_locate", { beats: 0xffff_ffff }],
      ["transport_seek_bar", { bar: 0xffff_ffff }],
      [
        "transport_set_loop",
        { startBar: 1, endBar: 0xffff_ffff, enabled: true },
      ],
      [
        "transport_set_loop",
        { startBar: 0xffff_ffff, endBar: 1, enabled: true },
      ],
    ] as const) {
      await expect(engine.invoke(command, args)).rejects.toThrow("position");
      const after = await engine.invoke<{ transport: TransportTelemetry }>(
        "audio_get_telemetry",
        {},
      );
      expect(after.transport).toEqual(before.transport);
    }
  });

  it("refuses malformed program changes without sending MIDI", async () => {
    const before = await engine.invoke("rig_get_state", {});
    for (const program of [
      null,
      "",
      false,
      true,
      "42",
      -1,
      1.5,
      128,
      Number.NaN,
    ]) {
      await expect(
        engine.invoke("rig_send_program", { program }),
      ).rejects.toThrow();
    }
    expect(await engine.invoke("rig_get_state", {})).toEqual(before);
    for (const program of [0, 127]) {
      const state = await engine.invoke<RigState>("rig_send_program", {
        program,
      });
      expect(state.monitor.at(-1)?.bytes).toEqual([
        0xc0 | state.currentProfile.midiChannel,
        program,
      ]);
    }
  });

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

  it("marks recording on telemetry and round-trips take notes", async () => {
    const id = await engine.invoke<string>("recorder_start", {
      sessionId: "jam",
    });
    const live = await engine.invoke<EngineTelemetry>(
      "audio_get_telemetry",
      {},
    );
    expect(live.recording).toBe(true);
    expect(live.recorder).toEqual({ active: true, duration_secs: 0 });
    engine.tick(2);
    const later = await engine.invoke<EngineTelemetry>(
      "audio_get_telemetry",
      {},
    );
    expect(later.recorder?.duration_secs).toBeCloseTo(2, 6);
    const meta = await engine.invoke<TakeMetadata>("recorder_stop", {});
    expect(meta.id).toBe(id);
    const idle = await engine.invoke<EngineTelemetry>(
      "audio_get_telemetry",
      {},
    );
    expect(idle.recording).toBe(false);
    const updated = await engine.invoke<TakeMetadata>("takes_update", {
      takeId: id,
      notes: "keeper from the bridge",
      title: "Bridge keeper",
    });
    expect(updated).toMatchObject({
      id,
      notes: "keeper from the bridge",
      label: "Bridge keeper",
    });
    const listed = await engine.invoke<TakeMetadata[]>("takes_list", {});
    expect(listed.find((t) => t.id === id)).toMatchObject({
      notes: "keeper from the bridge",
      label: "Bridge keeper",
    });
  });

  it("serves the bundled library", async () => {
    const styles = await engine.invoke<StyleSummary[]>("band_list_styles", {});
    const charts = await engine.invoke<Chart[]>("band_list_charts", {});
    expect(styles.map((s) => s.id).sort()).toEqual([
      "ballad-68",
      "blues-shuffle",
      "five-four",
      "funk-16",
      "jazz-swing",
      "metal-gallop",
      "rock-straight",
      "waltz-34",
    ]);
    expect(charts.length).toBe(9);
  });

  it("says loudly that it is not real audio", async () => {
    const status = await engine.invoke<EngineStatus>("engine_status", {});
    expect(status.mode).toBe("Headless");
    expect(status.last_error).toMatch(/preview/i);
  });

  it("cannot measure a physical loopback and leaves the offset untouched", async () => {
    await engine.invoke("recorder_set_latency", { samples: 12 });
    const result = await engine.invoke<LatencyCalibration>(
      "audio_calibrate_latency",
      {},
    );
    expect(result).toEqual({
      roundTripFrames: 512,
      confidence: 0,
      estimated: true,
    });
    expect(await engine.invoke("recorder_get_latency", {})).toBe(12);
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

  it("comes in at the seeked bar after the count-in", async () => {
    const seen: { transport?: TransportTelemetry } = {};
    await engine.listen<TransportTelemetry>("transport.state", (t) => {
      seen.transport = t;
    });
    await engine.invoke("band_load_chart", { chartId: "blues-12-bar" });
    await engine.invoke("transport_set_count_in", { bars: 1 });
    await engine.invoke("transport_set_tempo", { bpm: 240 });
    await engine.invoke("transport_seek_bar", { bar: 9 });
    await engine.invoke("transport_play", {});
    engine.tick(0.01);
    expect(seen.transport?.state).toBe("counting_in");
    // One bar at 240 BPM is 1 second.
    for (let i = 0; i < 12; i++) engine.tick(0.1);
    expect(seen.transport?.state).toBe("playing");
    expect(seen.transport?.bar).toBe(9);
  });

  it.each(["transport_play", "transport_seek_bar"])(
    "keeps the count-in destination after %s",
    async (command) => {
      await engine.invoke("transport_set_count_in", { bars: 1 });
      await engine.invoke("transport_set_tempo", { bpm: 240 });
      await engine.invoke("transport_seek_bar", { bar: 9 });
      await engine.invoke("transport_play", {});
      engine.tick(0.1);
      await engine.invoke(command, { bar: 5 });
      for (let i = 0; i < 9; i++) engine.tick(0.1);
      engine.tick(0.01); // Past the original deadline, before a restarted count-in could end.
      const state = await engine.invoke<{ transport: TransportTelemetry }>(
        "audio_get_telemetry",
        {},
      );
      expect(state.transport.state).toBe("playing");
      expect(state.transport.bar).toBe(command === "transport_play" ? 9 : 5);
    },
  );

  it("uses the loop armed during count-in when the song position is still zero", async () => {
    await engine.invoke("transport_set_count_in", { bars: 1 });
    await engine.invoke("transport_set_tempo", { bpm: 240 });
    await engine.invoke("transport_play", {});
    engine.tick(0.1);
    await engine.invoke("transport_set_loop", {
      startBar: 5,
      endBar: 9,
      enabled: true,
    });
    for (let i = 0; i < 12; i++) engine.tick(0.1);
    const state = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(state.transport.bar).toBe(5);
  });

  it("applies style changes immediately while playing", async () => {
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
    expect(seen.band?.pending_style_id).toBeNull();
    expect(seen.band?.style_id).toBe("funk-16");
    expect(seen.band?.style_name).toBe("Funk 16th Groove");
  });

  it("pauses a count-in and resumes playing from the held song position", async () => {
    await engine.invoke("band_load_chart", { chartId: "blues-12-bar" });
    await engine.invoke("transport_set_count_in", { bars: 2 });
    await engine.invoke("transport_set_tempo", { bpm: 240 });
    await engine.invoke("transport_play", {});
    engine.tick(0.2);
    const counting = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(counting.transport.state).toBe("counting_in");
    await engine.invoke("transport_pause", {});
    for (let i = 0; i < 20; i++) engine.tick(0.1);
    const paused = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(paused.transport.state).toBe("paused");
    expect(paused.transport.position_beats).toBe(0);
    await engine.invoke("transport_play", {});
    engine.tick(0.01);
    const resumed = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(resumed.transport.state).toBe("playing");
    expect(resumed.transport.bar).toBe(1);
  });

  it("stops at bar 1 with a loop armed and plays from the top until the wrap", async () => {
    await engine.invoke("band_load_chart", { chartId: "blues-12-bar" });
    await engine.invoke("transport_set_count_in", { bars: 0 });
    await engine.invoke("transport_set_tempo", { bpm: 240 });
    await engine.invoke("transport_set_loop", {
      startBar: 5,
      endBar: 9,
      enabled: true,
    });
    await engine.invoke("transport_seek_bar", { bar: 6 });
    await engine.invoke("transport_stop", {});
    const stopped = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(stopped.transport.state).toBe("stopped");
    expect(stopped.transport.bar).toBe(1);
    expect(stopped.transport.position_beats).toBe(0);
    await engine.invoke("transport_play", {});
    engine.tick(0.01);
    const playing = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(playing.transport.state).toBe("playing");
    expect(playing.transport.bar).toBe(1);
  });

  it("keeps a stopped cue pending until the first playing bar", async () => {
    await engine.invoke("band_cue", { cue: "fill" });
    const armed = await engine.invoke<{ band: BandTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(armed.band.pending_cue).toBe("fill");
    expect(armed.band.active_cue).toBe("none");
    await engine.invoke("transport_set_count_in", { bars: 0 });
    await engine.invoke("transport_play", {});
    engine.tick(0.01);
    const playing = await engine.invoke<{ band: BandTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(playing.band.active_cue).toBe("fill");
    expect(playing.band.pending_cue).toBe("none");
  });

  it("refuses offline render and live key tests in preview", async () => {
    await expect(
      engine.invoke("band_render_offline", {
        styleId: "rock-straight",
        bars: 1,
      }),
    ).rejects.toThrow(/desktop app/);
    await expect(
      engine.invoke("keys_test", { provider: "gemini" }),
    ).rejects.toThrow(/not configured/);
    const idle = await engine.invoke<{
      proven: boolean;
      message: string;
    }>("diagnostics_idle_cpu", {});
    expect(idle.proven).toBe(false);
    expect(idle.message).toMatch(/Idle CPU is not proven/);
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
    expect(
      await engine.invoke("charts_delete_user", { chartId: "my-tune" }),
    ).toBeNull();
    const gone = await engine.invoke<Chart[]>("band_list_charts", {});
    expect(gone.some((c) => c.id === "my-tune")).toBe(false);
  });

  it("returns null for unit commands the way Tauri serialises () (#165)", async () => {
    const charts = await engine.invoke<Chart[]>("band_list_charts", {});
    expect(
      await engine.invoke("band_load_chart_inline", { chart: charts[0] }),
    ).toBeNull();
    expect(await engine.invoke("takes_delete", { takeId: "gone" })).toBeNull();
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

  it("clock follows play pause and stop only when enabled", async () => {
    await engine.invoke("transport_set_count_in", { bars: 0 });
    await engine.invoke("rig_clear_monitor", {});
    await engine.invoke("transport_play", {});
    expect(
      (await engine.invoke<RigState>("rig_get_state", {})).monitor,
    ).toEqual([]);
    await engine.invoke("transport_stop", {});
    const on = await engine.invoke<RigState>("rig_set_clock", { on: true });
    expect(on.sendClock).toBe(true);
    await engine.invoke("rig_dry_run", { on: true });
    expect((await engine.invoke<RigState>("rig_get_state", {})).dryRun).toBe(
      true,
    );
    await engine.invoke("rig_clear_monitor", {});
    await engine.invoke("transport_play", {});
    let state = await engine.invoke<RigState>("rig_get_state", {});
    expect(state.monitor[0]?.bytes).toEqual([0xfa]);
    expect(state.monitor.some((m) => m.bytes[0] === 0xf8)).toBe(true);
    await engine.invoke("rig_clear_monitor", {});
    await engine.invoke("transport_pause", {});
    expect(
      (await engine.invoke<RigState>("rig_get_state", {})).monitor[0]?.bytes,
    ).toEqual([0xfc]);
    await engine.invoke("rig_clear_monitor", {});
    await engine.invoke("transport_play", {});
    expect(
      (await engine.invoke<RigState>("rig_get_state", {})).monitor[0]?.bytes,
    ).toEqual([0xfb]);
    await engine.invoke("transport_stop", {});
    state = await engine.invoke<RigState>("rig_get_state", {});
    expect(state.monitor.at(-1)?.bytes).toEqual([0xfc]);
  });

  it("panic sends all notes off and reset controllers", async () => {
    await engine.invoke("rig_select_profile", {
      profileId: "headrush-pedalboard",
    });
    await engine.invoke("rig_clear_monitor", {});
    const state = await engine.invoke<RigState>("rig_panic", {});
    expect(state.monitor.map((m) => m.bytes)).toEqual([
      [0xb0, 123, 0],
      [0xb0, 121, 0],
    ]);
  });

  it("refuses unknown mixer buses and gain-only drum patches", async () => {
    await expect(
      engine.invoke("mixer_set_bus", { id: "reverb", patch: { gain: 0.5 } }),
    ).rejects.toThrow(/Unknown mixer bus/);
    await expect(
      engine.invoke("mixer_set_bus", { id: "drums", patch: { gain: 0.5 } }),
    ).rejects.toThrow(/no gain/);
    await engine.invoke("mixer_set_bus", {
      id: "drums",
      patch: { muted: true },
    });
    await engine.invoke("mixer_set_bus", {
      id: "band",
      patch: { muted: true },
    });
    const buses = await engine.invoke<
      { id: string; muted: boolean; gainDb: number }[]
    >("mixer_set_bus", { id: "band", patch: { muted: false } });
    expect(buses[0].muted).toBe(false);
  });

  it("learns a HeadRush CC onto the in-memory profile", async () => {
    await engine.invoke("rig_select_profile", {
      profileId: "headrush-pedalboard",
    });
    const armed = await engine.invoke<RigState>("rig_start_learn", {
      name: "Delay mix",
    });
    expect(armed.learning).toBe("Delay mix");
    expect(
      armed.currentProfile.controls.some((c) => c.name === "Delay mix"),
    ).toBe(true);
    const still = await engine.invoke<RigState>("rig_learn_from_message", {
      bytes: [0xc0, 3],
    });
    expect(still.learning).toBe("Delay mix");
    const cancelled = await engine.invoke<RigState>("rig_cancel_learn", {});
    expect(cancelled.learning).toBeNull();
    expect(cancelled.currentProfile.controls).toEqual(
      still.currentProfile.controls,
    );
    await engine.invoke("rig_start_learn", { name: "Delay mix" });
    const learnedCc = 74;
    const learned = await engine.invoke<RigState>("rig_learn_from_message", {
      bytes: [0xb0, learnedCc, 64],
    });
    expect(learned.learning).toBeNull();
    expect(
      learned.currentProfile.controls.find((c) => c.name === "Delay mix")?.cc,
    ).toBe(learnedCc);
    await engine.invoke("rig_clear_monitor", {});
    const sent = await engine.invoke<RigState>("rig_set_control", {
      cc: learnedCc,
      value: 64,
    });
    expect(sent.monitor.at(-1)?.bytes).toEqual([0xb0, learnedCc, 64]);
    await engine.invoke("rig_select_profile", { profileId: "quad-cortex" });
    const back = await engine.invoke<RigState>("rig_select_profile", {
      profileId: "headrush-pedalboard",
    });
    expect(
      back.currentProfile.controls.find((c) => c.name === "Delay mix")?.cc,
    ).toBe(learnedCc);
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

  it("clamps count-in to four bars like the desktop engine", async () => {
    await engine.invoke("transport_set_count_in", { bars: 999 });
    const tel = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(tel.transport.count_in_bars).toBe(4);
    await engine.invoke("transport_set_count_in", { bars: -3 });
    const low = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(low.transport.count_in_bars).toBe(0);
  });

  it("rejects a transport meter that does not match the active style", async () => {
    await expect(
      engine.invoke("transport_set_time_signature", {
        numerator: 3,
        denominator: 4,
      }),
    ).rejects.toThrow(/matching style/);
    const state = await engine.invoke<{ transport: TransportTelemetry }>(
      "audio_get_telemetry",
      {},
    );
    expect(state.transport.time_signature).toEqual([4, 4]);
  });

  it("emits tuner.state null when the tuner turns off", async () => {
    const seen: Array<TunerTelemetry | null> = [];
    await engine.listen<TunerTelemetry | null>("tuner.state", (t) => {
      seen.push(t);
    });
    await engine.invoke("tuner_set", { on: true });
    engine.tick(0);
    expect(seen.at(-1)?.note).toBe("A4");
    await engine.invoke("tuner_set", { on: false });
    engine.tick(0);
    expect(seen.at(-1)).toBeNull();
  });
});
