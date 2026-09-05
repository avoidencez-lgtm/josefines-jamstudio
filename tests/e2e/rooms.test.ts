/**
 * Rooms, end to end: what a user does across the studio's rooms runs through the
 * real stores, the real IPC client and the simulated engine behind the browser
 * preview. The close guard, the manual's language, the rig room, the pedal
 * controller, the settings room and the room preferences are exercised here;
 * `ipc.invoke` is only spied on to observe calls, and `app_exit` is intercepted
 * so no engine ever receives it.
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ipc } from "../../src/ipc/client";
import type {
  AppSettings,
  AudioConfig,
  RigState,
} from "../../src/ipc/contract";
import type { PreviewEngine } from "../../src/ipc/preview";
import {
  ACTIVE_WORK_MESSAGE,
  closeDecision,
  hasActiveWork,
  hasUnsavedWork,
} from "../../src/lib/closeGuard";
import {
  type PedalConfig,
  type PedalPress,
  assignPedal,
  describePress,
  useController,
} from "../../src/lib/controller";
import { readHelpLanguage } from "../../src/lib/help";
import { useLibraryDraft } from "../../src/lib/libraryDraft";
import { useMedia } from "../../src/lib/media";
import { useWriting } from "../../src/lib/originals";
import {
  cueSetlistItem,
  recallRig,
  saveRoomPreference,
  useRoomOperation,
} from "../../src/lib/roomActions";
import { validateAudioProfile } from "../../src/lib/roomTools";
import { openAiSettings, useSettingsView } from "../../src/lib/settingsView";
import { useEngineStore } from "../../src/store/engine";

type PreviewHolder = { __jamPreviewEngine?: Promise<PreviewEngine> };

/** The audio setup the preview engine starts with; restored after every test. */
const BASELINE_AUDIO: AudioConfig = {
  input_device: null,
  output_device: null,
  input_channel: 2,
  sample_rate: 48_000,
  buffer_size: 256,
};

/** Same formula as the Buffer Size options in `src/screens/Settings.tsx`. */
const bufferMs = (frames: number, sampleRate: number) =>
  ((frames / sampleRate) * 1000).toFixed(1);

const lastNotice = () => useEngineStore.getState().notices.at(-1)?.text;

/** What "Discard and close" in `src/App.tsx` runs when the close dialog is open. */
async function discardAndClose() {
  if (hasActiveWork()) return;
  try {
    await ipc.invoke("app_exit");
  } catch (e) {
    useEngineStore.getState().notify("error", String(e));
  }
}

/** Observes `ipc.invoke`; `app_exit` is recorded and swallowed, never forwarded. */
function observeInvoke(exitError?: Error) {
  const forward = ipc.invoke.bind(ipc);
  const exits: string[] = [];
  const spy = vi.spyOn(ipc, "invoke").mockImplementation(async (cmd, args) => {
    if (cmd === "app_exit") {
      exits.push(cmd);
      if (exitError) throw exitError;
      return undefined as never;
    }
    return forward(cmd, args);
  });
  return { spy, exits };
}

describe("rooms, end to end through the preview engine", () => {
  let engine: PreviewEngine;
  let snapshot: {
    engine: ReturnType<typeof useEngineStore.getState>;
    writing: ReturnType<typeof useWriting.getState>;
    media: ReturnType<typeof useMedia.getState>;
    draft: ReturnType<typeof useLibraryDraft.getState>;
    operation: ReturnType<typeof useRoomOperation.getState>;
    controller: ReturnType<typeof useController.getState>;
    settingsView: ReturnType<typeof useSettingsView.getState>;
  };

  beforeAll(async () => {
    // The preview engine auto-ticks on an interval; creating it while intervals are
    // faked leaves simulated time entirely to explicit `tick()` calls.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await ipc.invoke("engine_status");
    const holder = globalThis as unknown as PreviewHolder;
    engine = await (holder.__jamPreviewEngine as Promise<PreviewEngine>);
    vi.useRealTimers();
  });

  afterAll(() => {
    engine.dispose();
    (globalThis as unknown as PreviewHolder).__jamPreviewEngine = undefined;
  });

  beforeEach(() => {
    snapshot = {
      engine: useEngineStore.getState(),
      writing: useWriting.getState(),
      media: useMedia.getState(),
      draft: useLibraryDraft.getState(),
      operation: useRoomOperation.getState(),
      controller: useController.getState(),
      settingsView: useSettingsView.getState(),
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    useEngineStore.setState(snapshot.engine, true);
    useWriting.setState(snapshot.writing, true);
    useMedia.setState(snapshot.media, true);
    useLibraryDraft.setState(snapshot.draft, true);
    useRoomOperation.setState(snapshot.operation, true);
    useController.setState(snapshot.controller, true);
    useSettingsView.setState(snapshot.settingsView, true);
    // The engine is one instance for the whole file: put back what a test moved.
    await ipc.invoke("transport_stop");
    await ipc.invoke("transport_set_count_in", { bars: 1 });
    await ipc.invoke("band_load_chart", { chartId: "blues-12-bar" });
    const rig = await ipc.invoke<RigState>("rig_get_state");
    for (const section of Object.keys(rig.sectionMappings))
      await ipc.invoke("rig_set_section_mapping", { section, sceneIdx: null });
    await ipc.invoke("rig_set_follow_sections", { enabled: true });
    await ipc.invoke("rig_select_profile", {
      profileId: "headrush-pedalboard",
    });
    await ipc.invoke("rig_clear_monitor");
    await ipc.invoke("audio_set_config", { config: BASELINE_AUDIO });
    await ipc.invoke("settings_set", {
      settings: {
        ...BASELINE_AUDIO,
        helpLanguage: undefined,
        rehearsalSetlist: undefined,
        audioProfiles: undefined,
      },
    });
  });

  it("asks before closing an unsaved song, keeps it on Keep editing and quits through app_exit on Discard", async () => {
    expect(hasUnsavedWork()).toBe(false);
    expect(closeDecision()).toBe("close");

    useWriting.getState().createSong();
    const song = useWriting.getState().song;
    expect(song?.id).toMatch(/^song-/);
    expect(useWriting.getState().dirty).toBe(true);
    expect(closeDecision()).toBe("ask");

    // "Keep editing" only closes the dialog: the draft and the decision are untouched.
    expect(useWriting.getState().song).toBe(song);
    expect(closeDecision()).toBe("ask");

    const { spy, exits } = observeInvoke();
    await discardAndClose();
    expect(exits).toEqual(["app_exit"]);
    expect(spy).toHaveBeenCalledTimes(1);
    // Rust ends the process; the WebView never throws the draft away itself.
    expect(useWriting.getState().song).toBe(song);
    expect(useWriting.getState().dirty).toBe(true);
    expect(useEngineStore.getState().notices).toEqual([]);
    spy.mockRestore();

    // A quit the desktop refuses lands in the notice rail with its reason.
    const failing = observeInvoke(new Error("exit blocked by the OS"));
    await discardAndClose();
    expect(failing.exits).toEqual(["app_exit"]);
    expect(lastNotice()).toBe("Error: exit blocked by the OS");
    expect(useEngineStore.getState().notices.at(-1)?.kind).toBe("error");
  });

  it("refuses to close while a take is recording or a room operation is blocking, and asks for every unsaved draft", async () => {
    const takeId = await useEngineStore.getState().startRecording();
    expect(takeId).toMatch(/^preview-/);
    expect(useEngineStore.getState().isRecording).toBe(true);
    expect(closeDecision()).toBe("refuse");
    expect(ACTIVE_WORK_MESSAGE).toBe(
      "Finish the recording or current operation before closing.",
    );
    const { exits } = observeInvoke();
    await discardAndClose();
    expect(exits).toEqual([]);

    const take = await useEngineStore.getState().stopRecording();
    expect(take?.id).toBe(takeId);
    expect(useEngineStore.getState().takes[0]?.id).toBe(takeId);
    expect(useEngineStore.getState().isRecording).toBe(false);
    expect(closeDecision()).toBe("close");

    useRoomOperation.setState({ busy: true, blocking: true });
    expect(closeDecision()).toBe("refuse");
    useRoomOperation.setState({ busy: true, blocking: false });
    expect(closeDecision()).toBe("close");
    useRoomOperation.setState({ busy: false, blocking: false });

    useLibraryDraft.setState({ dirty: true });
    expect(closeDecision()).toBe("ask");
    useLibraryDraft.setState({ dirty: false });
    useMedia.setState({ dirty: true });
    expect(closeDecision()).toBe("ask");
    useMedia.setState({ dirty: false, busy: "Rendering" });
    expect(closeDecision()).toBe("refuse");
  });

  it("saves the manual's language with the app settings and reads it back after a restart", async () => {
    await useEngineStore.getState().loadSettings();
    const before = useEngineStore.getState().settings;
    expect(before?.sample_rate).toBe(48_000);
    expect(before?.helpLanguage).toBeUndefined();
    expect(readHelpLanguage(before)).toBe("en");

    await saveRoomPreference("helpLanguage", "nb");
    expect(useEngineStore.getState().settings?.helpLanguage).toBe("nb");
    expect(readHelpLanguage(useEngineStore.getState().settings)).toBe("nb");

    // A restart starts from the pristine store and reads the settings file again.
    useEngineStore.setState(snapshot.engine, true);
    expect(useEngineStore.getState().settings).toBeNull();
    expect(readHelpLanguage(useEngineStore.getState().settings)).toBe("en");
    await useEngineStore.getState().loadSettings();
    const restored = useEngineStore.getState().settings;
    expect(restored?.helpLanguage).toBe("nb");
    expect(readHelpLanguage(restored)).toBe("nb");
    expect(restored?.sample_rate).toBe(48_000);
    expect(restored?.buffer_size).toBe(256);

    // Only the two maintained languages are accepted; nothing is written otherwise.
    const { spy } = observeInvoke();
    await expect(saveRoomPreference("helpLanguage", "de")).rejects.toThrow(
      /Invalid enum value.*'en' \| 'nb'.*received 'de'/,
    );
    expect(spy.mock.calls.map(([cmd]) => cmd)).not.toContain("settings_set");
    expect(useEngineStore.getState().settings?.helpLanguage).toBe("nb");
    const onDisk = await ipc.invoke<AppSettings>("settings_get");
    expect(onDisk.helpLanguage).toBe("nb");
    expect(readHelpLanguage({ helpLanguage: "de" })).toBe("en");
  });

  it("validates the rehearsal setlist at its boundaries and merges it into the engine's current settings", async () => {
    const { spy } = observeInvoke();
    const settingsSets = () =>
      spy.mock.calls.filter(([cmd]) => cmd === "settings_set").length;
    const entry = (id: string, bpm: number, countIn: number) => ({
      id,
      chartId: "blues-12-bar",
      bpm,
      countIn,
    });

    // The store's copy may be stale; the save merges into what the engine has now.
    await useEngineStore.getState().loadSettings();
    useEngineStore.setState((s) => ({
      settings: s.settings ? { ...s.settings, sample_rate: 1 } : s.settings,
    }));
    const list = [entry("slow", 40, 0), entry("fast", 240, 4)];
    await saveRoomPreference("rehearsalSetlist", list);
    expect(settingsSets()).toBe(1);
    const saved = useEngineStore.getState().settings;
    expect(saved?.rehearsalSetlist).toEqual(list);
    expect(saved?.sample_rate).toBe(48_000);
    const onDisk = await ipc.invoke<AppSettings>("settings_get");
    expect(onDisk.rehearsalSetlist).toEqual(list);

    await expect(
      saveRoomPreference("rehearsalSetlist", [entry("slow", 39, 0)]),
    ).rejects.toThrow(/greater than or equal to 40/);
    await expect(
      saveRoomPreference("rehearsalSetlist", [entry("fast", 241, 0)]),
    ).rejects.toThrow(/less than or equal to 240/);
    await expect(
      saveRoomPreference("rehearsalSetlist", [entry("slow", 100, 5)]),
    ).rejects.toThrow(/less than or equal to 4/);
    await expect(
      saveRoomPreference("rehearsalSetlist", [
        entry("twice", 100, 1),
        entry("twice", 110, 1),
      ]),
    ).rejects.toThrow("Setlist entry ids must be unique.");
    await expect(
      saveRoomPreference(
        "rehearsalSetlist",
        Array.from({ length: 33 }, (_, i) => entry(`row-${i}`, 100, 1)),
      ),
    ).rejects.toThrow(/at most 32 element/);
    await expect(
      saveRoomPreference("rehearsalSetlist", "blues"),
    ).rejects.toThrow(/Expected array, received string/);
    expect(settingsSets()).toBe(1);
    expect(
      (await ipc.invoke<AppSettings>("settings_get")).rehearsalSetlist,
    ).toEqual(list);

    // Cueing an entry and recalling a rig need the desktop engine; the preview says so first.
    await expect(cueSetlistItem(list[0])).rejects.toThrow(
      "Setlist playback needs the desktop audio engine.",
    );
    await expect(
      recallRig({ profileId: "headrush-pedalboard", scene: 0, controls: {} }),
    ).rejects.toThrow("Hardware recall needs the desktop app.");
    expect(useEngineStore.getState().telemetry.transport.state).toBe("stopped");
  });

  it("stores audio setup profiles within the schema and checks them against the connected devices", async () => {
    await useEngineStore.getState().refreshDevices();
    await useEngineStore.getState().loadSettings();
    const devices = useEngineStore.getState().devices;
    expect(devices.inputs.map((d) => d.name)).toEqual([
      "Preview Input (simulated)",
    ]);
    expect(devices.outputs.map((d) => d.name)).toEqual([
      "Preview Output (simulated)",
    ]);

    const profile = (name: string, patch: Partial<AudioConfig> = {}) => ({
      name,
      config: { ...BASELINE_AUDIO, ...patch },
    });
    const profiles = [
      profile("Tiny", { buffer_size: 16 }),
      profile("Huge", { buffer_size: 8192, sample_rate: 384_000 }),
    ];
    await saveRoomPreference("audioProfiles", profiles);
    expect(useEngineStore.getState().settings?.audioProfiles).toEqual(profiles);
    expect(
      (await ipc.invoke<AppSettings>("settings_get")).audioProfiles,
    ).toEqual(profiles);

    const { spy } = observeInvoke();
    await expect(
      saveRoomPreference("audioProfiles", [profile("x", { buffer_size: 15 })]),
    ).rejects.toThrow(/greater than or equal to 16/);
    await expect(
      saveRoomPreference("audioProfiles", [
        profile("x", { buffer_size: 8193 }),
      ]),
    ).rejects.toThrow(/less than or equal to 8192/);
    await expect(
      saveRoomPreference("audioProfiles", [
        profile("x", { sample_rate: 7999 }),
      ]),
    ).rejects.toThrow(/greater than or equal to 8000/);
    await expect(
      saveRoomPreference("audioProfiles", [
        { name: "x", config: { ...BASELINE_AUDIO, api_key: "secret" } },
      ]),
    ).rejects.toThrow(/Unrecognized key\(s\) in object: 'api_key'/);
    await expect(
      saveRoomPreference("audioProfiles", [profile("Same"), profile("Same")]),
    ).rejects.toThrow("Audio profile names must be unique.");
    await expect(
      saveRoomPreference("audioProfiles", [profile("   ")]),
    ).rejects.toThrow(/at least 1 character/);
    await expect(
      saveRoomPreference(
        "audioProfiles",
        Array.from({ length: 13 }, (_, i) => profile(`p${i}`)),
      ),
    ).rejects.toThrow(/at most 12 element/);
    expect(spy.mock.calls.map(([cmd]) => cmd)).not.toContain("settings_set");

    // Recall checks the saved devices and channel against what is plugged in now.
    expect(() =>
      validateAudioProfile({ ...BASELINE_AUDIO, input_channel: 1 }, devices),
    ).not.toThrow();
    expect(() =>
      validateAudioProfile({ ...BASELINE_AUDIO, input_channel: 2 }, devices),
    ).toThrow("This input no longer has the saved guitar channel.");
    expect(() =>
      validateAudioProfile(
        { ...BASELINE_AUDIO, input_device: "Scarlett 2i2" },
        devices,
      ),
    ).toThrow(
      "Connect this profile's input and output devices before recalling it.",
    );
  });

  it("lists the bundled rig profiles, plays a scene from the chosen profile and rejects unknown ids", async () => {
    await useEngineStore.getState().loadRigProfiles();
    const store = useEngineStore.getState();
    expect(store.availableProfiles.map((p) => p.id)).toEqual([
      "axe-fx",
      "headrush-pedalboard",
      "black-spirit-200",
      "kemper",
      "helix",
      "quad-cortex",
    ]);
    expect(store.rigState?.currentProfile.id).toBe("headrush-pedalboard");
    expect(store.rigState?.followSections).toBe(true);
    expect(store.rigState?.live).toBe(false);
    expect(store.midiPorts).toEqual([{ name: "Preview MIDI Out (simulated)" }]);
    expect(store.midiPortsError).toBeNull();

    await store.selectRigProfile("black-spirit-200");
    const rig = useEngineStore.getState().rigState;
    expect(rig?.currentProfile.name).toBe("Hughes & Kettner Black Spirit 200");
    expect(rig?.currentProfile.midiChannel).toBe(1);
    expect(rig?.currentScene).toBe(0);
    expect(rig?.controlValues["20"]).toBe(64);
    expect(rig?.controlValues["7"]).toBe(90);
    expect(rig?.monitor).toEqual([]);

    await store.selectRigScene(2);
    const lead = useEngineStore.getState().rigState;
    expect(lead?.currentScene).toBe(2);
    expect(lead?.monitor.map((m) => m.text)).toEqual([
      "PC 2 ch2",
      "CC 9 = 0 ch2",
      "CC 20 = 100 ch2",
      "CC 64 = 127 ch2",
    ]);
    expect(lead?.monitor.every((m) => m.reason === "scene Lead")).toBe(true);
    expect(lead?.monitor.every((m) => m.live === false)).toBe(true);
    expect(lead?.controlValues["20"]).toBe(100);
    expect(lead?.controlValues["64"]).toBe(127);

    await store.selectRigScene(9);
    expect(lastNotice()).toBe(
      "Rig scene: scene 9 does not exist on Hughes & Kettner Black Spirit 200",
    );
    expect(useEngineStore.getState().rigState?.currentScene).toBe(2);
    await store.selectRigProfile("nope");
    expect(lastNotice()).toBe('Rig profile: unknown rig profile "nope"');
    expect(useEngineStore.getState().rigState?.currentProfile.id).toBe(
      "black-spirit-200",
    );
  });

  it("maps sections to scenes per profile and drops mappings the next profile cannot play", async () => {
    await useEngineStore.getState().loadRigProfiles();
    const store = useEngineStore.getState();
    await store.selectRigProfile("axe-fx");
    expect(
      useEngineStore.getState().rigState?.currentProfile.scenes,
    ).toHaveLength(8);

    await store.setRigSectionMapping("Solo", 7);
    await store.setRigSectionMapping("Verse", 1);
    expect(useEngineStore.getState().rigState?.sectionMappings).toEqual({
      Solo: 7,
      Verse: 1,
    });

    await store.setRigSectionMapping("Chorus", 8);
    expect(lastNotice()).toBe(
      "Rig mapping: scene 8 does not exist on Fractal Axe-Fx III",
    );
    expect(useEngineStore.getState().rigState?.sectionMappings).toEqual({
      Solo: 7,
      Verse: 1,
    });

    // The Black Spirit has five scenes: Solo -> scene 8 cannot survive the switch.
    await store.selectRigProfile("black-spirit-200");
    expect(useEngineStore.getState().rigState?.sectionMappings).toEqual({
      Verse: 1,
    });
    await store.setRigSectionMapping("Verse", null);
    expect(useEngineStore.getState().rigState?.sectionMappings).toEqual({});
    await store.setRigFollowSections(false);
    expect(useEngineStore.getState().rigState?.followSections).toBe(false);
    expect((await ipc.invoke<RigState>("rig_get_state")).followSections).toBe(
      false,
    );
  });

  it("refuses negative scene mappings", async () => {
    await useEngineStore.getState().loadRigProfiles();
    const store = useEngineStore.getState();
    await store.selectRigProfile("black-spirit-200");
    await store.setRigSectionMapping("Verse", -1);
    expect(lastNotice()).toMatch(
      /^Rig mapping: scene -1 does not exist on Hughes & Kettner Black Spirit 200/,
    );
    expect(useEngineStore.getState().rigState?.sectionMappings).toEqual({});
  });

  it("switches the rig scene when the band enters a mapped section and stays quiet with follow off", async () => {
    const store = useEngineStore.getState();
    const off = await store.initListeners();
    try {
      await store.loadRigProfiles();
      await store.selectRigProfile("black-spirit-200");
      await store.bandLoadChart("rock-song-form");
      expect(useEngineStore.getState().currentChart?.id).toBe("rock-song-form");
      await store.setRigSectionMapping("Intro", 0);
      await store.setRigSectionMapping("Verse", 2);
      await store.transportSetCountIn(0);
      await store.transportSetTempo(240);

      // Pressing play enters the Intro at once: Clean goes out before the first tick.
      await store.transportPlay();
      let rig = useEngineStore.getState().rigState;
      expect(rig?.currentScene).toBe(0);
      expect(rig?.monitor.map((m) => m.reason)).toEqual([
        "section Intro -> Clean",
        "section Intro -> Clean",
        "section Intro -> Clean",
      ]);
      engine.tick(0.01);
      let band = useEngineStore.getState().telemetry.band;
      expect(useEngineStore.getState().telemetry.transport.state).toBe(
        "playing",
      );
      expect(band.current_section).toBe("Intro");
      expect(band.style_id).toBe("rock-straight");

      // Four Intro bars at 240 BPM last four seconds; bar 5 is the Verse.
      for (let i = 0; i < 45; i++) engine.tick(0.1);
      rig = useEngineStore.getState().rigState;
      band = useEngineStore.getState().telemetry.band;
      expect(useEngineStore.getState().telemetry.transport.bar).toBe(5);
      expect(band.current_section).toBe("Verse");
      expect(rig?.currentScene).toBe(2);
      expect(
        rig?.monitor
          .filter((m) => m.text.startsWith("PC "))
          .map((m) => m.reason),
      ).toEqual(["section Intro -> Clean", "section Verse -> Lead"]);
      expect(rig?.controlValues["20"]).toBe(100);

      // Follow off: the Chorus mapping is kept but nothing is sent when it arrives.
      await store.setRigFollowSections(false);
      await store.setRigSectionMapping("Chorus", 1);
      await store.clearRigMonitor();
      for (let i = 0; i < 90; i++) engine.tick(0.1);
      rig = useEngineStore.getState().rigState;
      band = useEngineStore.getState().telemetry.band;
      expect(band.current_section).toBe("Chorus");
      expect(rig?.followSections).toBe(false);
      expect(rig?.sectionMappings).toEqual({ Intro: 0, Verse: 2, Chorus: 1 });
      expect(rig?.currentScene).toBe(2);
      expect(rig?.monitor).toEqual([]);

      await store.transportStop();
      engine.tick(0.01);
      const transport = useEngineStore.getState().telemetry.transport;
      expect(transport.state).toBe("stopped");
      expect(transport.bar).toBe(1);
      expect(useEngineStore.getState().telemetry.band.current_section).toBe(
        "Intro",
      );
    } finally {
      off();
    }
  });

  it("clamps knob changes to the profile's range and logs them, program changes and clears in the monitor", async () => {
    await useEngineStore.getState().loadRigProfiles();
    const store = useEngineStore.getState();
    await store.selectRigProfile("quad-cortex");

    await store.setRigControl(43, 99);
    let rig = useEngineStore.getState().rigState;
    expect(rig?.controlValues["43"]).toBe(7);
    expect(rig?.monitor.at(-1)).toMatchObject({
      text: "CC 43 = 7 ch1",
      reason: "knob Scene (A-H)",
      bytes: [0xb0, 43, 7],
      live: false,
    });

    await store.setRigControl(44, 127);
    await store.setRigControl(45, -5);
    rig = useEngineStore.getState().rigState;
    expect(rig?.controlValues["44"]).toBe(127);
    expect(rig?.controlValues["45"]).toBe(0);
    expect(rig?.monitor.map((m) => m.text)).toEqual([
      "CC 43 = 7 ch1",
      "CC 44 = 127 ch1",
      "CC 45 = 0 ch1",
    ]);

    await store.sendRigProgram(5);
    rig = useEngineStore.getState().rigState;
    expect(rig?.monitor.at(-1)).toMatchObject({
      text: "PC 5 ch1",
      reason: "manual program 5",
      bytes: [0xc0, 5],
    });
    await store.selectRigProfile("black-spirit-200");
    await store.sendRigProgram(2);
    expect(useEngineStore.getState().rigState?.monitor.at(-1)).toMatchObject({
      text: "PC 2 ch2",
      reason: "manual Preset 3 (Lead)",
    });

    await store.clearRigMonitor();
    expect(useEngineStore.getState().rigState?.monitor).toEqual([]);
    expect((await ipc.invoke<RigState>("rig_get_state")).monitor).toEqual([]);
  });

  it("refuses CC numbers above 127 without changing the rig", async () => {
    await useEngineStore.getState().loadRigProfiles();
    const store = useEngineStore.getState();
    await store.selectRigProfile("quad-cortex");
    const before = useEngineStore.getState().rigState;
    await store.setRigControl(200, 1);
    expect(lastNotice()).toBe("Rig control: CC 200 is above 127");
    expect(useEngineStore.getState().rigState).toBe(before);
  });

  it("learns pedal bindings in memory and reports that saving and MIDI input need the desktop app", async () => {
    const cc64: PedalPress = { kind: "cc", channel: 1, number: 64 };
    const pc3: PedalPress = { kind: "program", channel: 1, number: 3 };
    let config: PedalConfig = await ipc.invoke("controller_config");
    expect(config).toEqual({ schemaVersion: 1, bindings: [] });
    expect(await ipc.invoke("controller_ports")).toEqual([]);

    config = assignPedal(config, "keep", cc64);
    config = assignPedal(config, "play", pc3);
    expect(config.bindings.map((b) => b.action)).toEqual(["keep", "play"]);
    // A pedal can serve one action: learning it for Record takes it away from Keep.
    config = assignPedal(config, "record", cc64);
    expect(config.bindings).toEqual([
      { action: "play", press: pc3 },
      { action: "record", press: cc64 },
    ]);
    expect(describePress(cc64)).toBe("CC 64 · channel 1");
    await expect(
      ipc.invoke("controller_save", { document: config }),
    ).rejects.toThrow("Pedal setup requires the desktop app.");

    const controller = useController.getState();
    expect(controller.config).toEqual({ schemaVersion: 1, bindings: [] });
    await controller.refresh();
    expect(useController.getState().config).toEqual({
      schemaVersion: 1,
      bindings: [],
    });

    useController.setState({ learning: "keep" });
    await controller.receive(cc64);
    let state = useController.getState();
    expect(state.message).toBe("Error: Pedal setup requires the desktop app.");
    expect(state.config.bindings).toEqual([]);
    expect(state.learning).toBeNull();
    expect(state.busy).toBe(false);

    await controller.remove("keep");
    expect(useController.getState().message).toBe(
      "Error: Pedal setup requires the desktop app.",
    );

    await controller.connect("Preview MIDI In");
    state = useController.getState();
    expect(state.message).toBe("Error: MIDI input requires the desktop app.");
    expect(state.port).toBe("");
    expect(state.enabled).toBe(false);
    expect(state.busy).toBe(false);

    useController.setState({ busy: true, message: "" });
    await controller.receive(pc3);
    expect(useController.getState().message).toBe("");
  });

  it("routes an enabled pedal press to the song's Play action and surfaces the engine's answer", async () => {
    const pc3: PedalPress = { kind: "program", channel: 1, number: 3 };
    useWriting.getState().createSong();
    useController.setState({
      enabled: true,
      config: { schemaVersion: 1, bindings: [{ action: "play", press: pc3 }] },
    });

    // An unbound press is only described; nothing runs.
    await useController
      .getState()
      .receive({ kind: "note", channel: 1, number: 60 });
    expect(useController.getState().message).toBe("NOTE 60 · channel 1");
    expect(useWriting.getState().message).toBe("");

    await useController.getState().receive(pc3);
    expect(useController.getState().message).toBe("PROGRAM 3 · channel 1");
    expect(useWriting.getState().message).toBe(
      "Error: Playback requires the desktop app.",
    );
    expect(useWriting.getState().busy).toBe(false);
    expect(lastNotice()).toBe("Error: Playback requires the desktop app.");
    expect(useEngineStore.getState().telemetry.transport.state).toBe("stopped");
  });

  it("describes the buffer from the engine's clock after applying an audio config and deep-links into AI settings", async () => {
    const store = useEngineStore.getState();
    await store.refreshDevices();
    await store.loadSettings();
    await store.refreshEngineStatus();
    let settings = useEngineStore.getState().settings;
    let status = useEngineStore.getState().engineStatus;
    expect(settings?.buffer_size).toBe(256);
    expect(status?.sample_rate).toBe(48_000);
    expect(status?.mode).toBe("Headless");
    expect(bufferMs(settings?.buffer_size ?? 0, status?.sample_rate ?? 0)).toBe(
      "5.3",
    );

    const applied = await store.applyAudioConfig({
      ...BASELINE_AUDIO,
      sample_rate: 96_000,
      buffer_size: 128,
    });
    expect(applied?.sample_rate).toBe(96_000);
    expect(applied?.buffer_size).toBe(128);
    settings = useEngineStore.getState().settings;
    status = useEngineStore.getState().engineStatus;
    expect(settings?.sample_rate).toBe(96_000);
    expect(settings?.buffer_size).toBe(128);
    expect(status?.sample_rate).toBe(96_000);
    expect(bufferMs(settings?.buffer_size ?? 0, status?.sample_rate ?? 0)).toBe(
      "1.3",
    );
    expect(await ipc.invoke<AudioConfig>("audio_get_config")).toEqual({
      ...BASELINE_AUDIO,
      sample_rate: 96_000,
      buffer_size: 128,
    });
    // The preview never produces audio and says so through the engine's last_error.
    expect(lastNotice()).toBe(
      "Browser preview: simulated engine, no audio is produced",
    );

    expect(useSettingsView.getState().view).toBe("Audio devices");
    useEngineStore.getState().setScreen("stage");
    openAiSettings();
    expect(useSettingsView.getState().view).toBe("AI & models");
    expect(useEngineStore.getState().currentScreen).toBe("settings");
  });
});
