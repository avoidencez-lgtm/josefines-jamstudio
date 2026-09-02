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

export interface TransportTelemetry {
  state: "stopped" | "counting_in" | "playing" | "paused";
  bar: number;
  beat: number;
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
