export const IPC_VERSION = 1;

export interface DeviceDescriptor {
  name: string;
  is_default: boolean;
  channels: number;
  supported_sample_rates: number[];
}

export interface AudioDevices {
  inputs: DeviceDescriptor[];
  outputs: DeviceDescriptor[];
}

export interface AudioConfig {
  input_device: string | null;
  output_device: string | null;
  input_channel: number;
  sample_rate: number;
  buffer_size: number;
}

export interface MeterTelemetry {
  peak_db: number;
  rms_db: number;
}

export interface TunerTelemetry {
  hz: number;
  note: string;
  cents: number;
  confidence: number;
}

export interface StreamInfo {
  device_name: string;
  sample_rate: number;
  channels: number;
  buffer_frames: number | null;
  sample_format: string;
}

export type EngineMode = "Stopped" | "Hardware" | "Headless";

/** What the audio engine is actually doing. Mirrors `jam_audio::engine::EngineStatus`. */
export interface EngineStatus {
  mode: EngineMode;
  running: boolean;
  output: StreamInfo | null;
  input: StreamInfo | null;
  sample_rate: number;
  buffer_size: number;
  last_error: string | null;
  stream_errors: number;
  input_gaps: number;
}

export interface TransportTelemetry {
  state: "stopped" | "counting_in" | "playing" | "paused";
  bar: number;
  beat: number;
  /** Absolute song position in beats (fractional). */
  position_beats: number;
  /** 0..1 progress through the current bar. */
  bar_progress: number;
  bpm: number;
  time_signature: [number, number];
  loop_enabled: boolean;
  loop_start_bar: number;
  loop_end_bar: number;
  count_in_bars: number;
}

export interface BandTelemetry {
  style_id: string;
  style_name: string;
  intensity: number;
  active_cue: "none" | "fill" | "crash" | "stop" | "ending";
  pending_cue: "none" | "fill" | "crash" | "stop" | "ending";
  current_chord: string;
  next_chord?: string | null;
  current_section: string;
  mute_drums: boolean;
  mute_bass: boolean;
  mute_comp: boolean;
  follow_energy: boolean;
  current_energy: number;
  pending_style_id?: string | null;
  pending_intensity?: number | null;
  is_stopped: boolean;
}

// --- Library: styles and charts (data seams, see docs/plan) ---

export interface StyleSummary {
  schemaVersion: number;
  id: string;
  name: string;
  genre: string;
  feel: {
    swing: number;
    timeSig: [number, number];
    bpmRange: [number, number];
  };
  [key: string]: unknown;
}

export interface BarChord {
  chord: string;
  beats: number;
}

export interface ChartSection {
  id: string;
  name: string;
  bars: BarChord[][];
  styleOverrideId?: string | null;
}

export interface ArrangementItem {
  sectionId: string;
  repeats: number;
}

export interface Chart {
  schemaVersion: number;
  id: string;
  name: string;
  /** 0 = C, 1 = C#, ... 9 = A */
  keyTonic: number;
  mode: "major" | "minor";
  timeSig: [number, number];
  defaultBpm: number;
  defaultStyleId?: string | null;
  sections: ChartSection[];
  arrangement: ArrangementItem[];
}

export interface LibraryInfo {
  stylesDir: string;
  chartsDir: string;
  /** Ids of charts that come from the user folder (deletable, editable in place). */
  userChartIds: string[];
  loadErrors: string[];
}

export interface BandPatch {
  styleId?: string;
  intensity?: number;
  followEnergy?: boolean;
  muteDrums?: boolean;
  muteBass?: boolean;
  muteComp?: boolean;
  atNextBar?: boolean;
}

export interface EngineTelemetry {
  xruns: number;
  input_level: MeterTelemetry;
  output_level: MeterTelemetry;
  tuner?: TunerTelemetry | null;
  transport: TransportTelemetry;
  band: BandTelemetry;
}

export interface AppSettings {
  schemaVersion: number;
  input_device?: string | null;
  output_device?: string | null;
  input_channel: number;
  sample_rate: number;
  buffer_size: number;
  [key: string]: unknown;
}

export interface TakeMetadata {
  favourite?: boolean;
  stems?: Record<string, string>;
  snapshot?: unknown;
  id: string;
  sessionId: string;
  timestamp: string;
  durationSecs: number;
  styleId: string;
  chartId: string;
  tempo: number;
  sampleCount: number;
  pathInput: string;
  pathBand: string;
  pathMaster: string;
  waveformPeaks: number[];
  notes: string;
}

export interface SongMetadata {
  id: string;
  title: string;
  durationSecs: number;
  tempo: number;
  detectedChords: string[];
  stems: string[];
}

export interface StemSettings {
  vocalsVolume: number;
  drumsVolume: number;
  bassVolume: number;
  otherVolume: number;
  vocalsMute: boolean;
  drumsMute: boolean;
  bassMute: boolean;
  otherMute: boolean;
  vocalsSolo: boolean;
  drumsSolo: boolean;
  bassSolo: boolean;
  otherSolo: boolean;
}

export interface AiMusicConfig {
  provider: string;
  prompt: string;
  tempo: number;
  key: string;
  mixVolume: number;
}

export interface AiMusicState {
  active: boolean;
  provider: string;
  currentPrompt: string;
  promptDelta: string;
  mixVolume: number;
}

export type RigCommand =
  | { type: "programChange"; program: number }
  | { type: "controlChange"; cc: number; value: number }
  | { type: "wait"; ms: number };

export interface RigScene {
  name: string;
  commands: RigCommand[];
}

export interface RigProgram {
  number: number;
  name: string;
}

export interface RigControl {
  cc: number;
  name: string;
  min: number;
  max: number;
  default: number;
  toggle: boolean;
}

export interface RigProfile {
  schemaVersion: number;
  id: string;
  name: string;
  targetDevice: string;
  kind: string;
  /** 0-based MIDI channel (0 = channel 1). */
  midiChannel: number;
  sceneCc: number | null;
  programs: RigProgram[];
  controls: RigControl[];
  scenes: RigScene[];
  supports: {
    programChange: boolean;
    controlChange: boolean;
    midiClock: boolean;
  };
  notes: string | null;
}

export interface MidiPortInfo {
  name: string;
}

export interface SentMidiMessage {
  atMs: number;
  bytes: number[];
  text: string;
  reason: string;
  live: boolean;
}

export interface RigState {
  currentProfile: RigProfile;
  currentScene: number;
  sectionMappings: Record<string, number>;
  controlValues: Record<string, number>;
  followSections: boolean;
  port: string | null;
  portDescription: string;
  live: boolean;
  monitor: SentMidiMessage[];
}

/** The only way TypeScript reaches a provider: Rust injects the key. */
export interface ProviderFetchRequest {
  provider: string;
  /** Path + query relative to the provider base URL, starting with `/`. */
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string | null;
  model?: string;
  estimatedCostUsd?: number | null;
}

export interface ProviderFetchResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface ProviderInfo {
  id: string;
  description: string;
  hasKey: boolean;
}

export interface CostEntry {
  atMs: number;
  provider: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  bytesOut: number;
  bytesIn: number;
  error?: string | null;
  model?: string | null;
  estimatedCostUsd?: number | null;
}

export interface CostTotal {
  provider: string;
  calls: number;
  failures: number;
  bytesIn: number;
  bytesOut: number;
}

export interface TakeAnalysis {
  timingAccuracyPct: number;
  dynamicConsistencyPct: number;
  intonationAccuracyPct: number;
  detectedTransients: number;
  summary: string;
}

/** What `takes_export_daw` actually wrote. */
export interface ExportReport {
  dir: string;
  midiFile: string;
  copiedStems: string[];
  missingStems: string[];
  reaperScript?: string | null;
}
