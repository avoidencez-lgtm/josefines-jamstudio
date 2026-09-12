/**
 * Stage performance actions. Each row must have a keyboard shortcut, a Jo tool
 * and a binding in controls/default.json. Help, Write capture and the reference
 * ramp are not Stage band actions.
 */
export interface StageAction {
  id: string;
  /** Substring of a SHORTCUTS description. */
  shortcut: string;
  tool: string;
  args: Record<string, unknown>;
}

export const STAGE_ACTIONS: StageAction[] = [
  {
    id: "play",
    shortcut: "Play",
    tool: "transport_control",
    args: { action: "play" },
  },
  {
    id: "stop",
    shortcut: "Stop",
    tool: "transport_control",
    args: { action: "stop" },
  },
  {
    id: "loop",
    shortcut: "Toggle this loop.",
    tool: "set_loop",
    args: { enabled: true },
  },
  {
    id: "count_in",
    shortcut: "Count-in",
    tool: "set_count_in",
    args: { bars: 1 },
  },
  {
    id: "tap_tempo",
    shortcut: "Tap tempo",
    tool: "tap_tempo",
    args: {},
  },
  {
    id: "tempo",
    shortcut: "Tempo",
    tool: "set_tempo",
    args: { delta: 1 },
  },
  {
    id: "record",
    shortcut: "recording",
    tool: "record_take",
    args: { action: "start" },
  },
  {
    id: "fill",
    shortcut: "fill",
    tool: "trigger_cue",
    args: { cue: "fill" },
  },
  {
    id: "crash",
    shortcut: "crash",
    tool: "trigger_cue",
    args: { cue: "crash" },
  },
  {
    id: "stop_cue",
    shortcut: "stop or the ending",
    tool: "trigger_cue",
    args: { cue: "stop" },
  },
  {
    id: "ending",
    shortcut: "ending",
    tool: "trigger_cue",
    args: { cue: "ending" },
  },
  {
    id: "mute_drums",
    shortcut: "Mute drums",
    tool: "set_parts",
    args: { muteDrums: true },
  },
  {
    id: "mute_bass",
    shortcut: "bass or comp",
    tool: "set_parts",
    args: { muteBass: true },
  },
  {
    id: "mute_comp",
    shortcut: "comp",
    tool: "set_parts",
    args: { muteComp: true },
  },
  {
    id: "intensity",
    shortcut: "Intensity",
    tool: "set_intensity",
    args: { intensity: 0.5 },
  },
  {
    id: "seek_bar",
    shortcut: "Jump to this bar.",
    tool: "seek_bar",
    args: { bar: 1 },
  },
  {
    id: "transpose",
    shortcut: "Transpose",
    tool: "transpose_chart",
    args: { semitones: 1 },
  },
  {
    id: "tuner",
    shortcut: "tuner",
    tool: "toggle_tuner",
    args: {},
  },
];
