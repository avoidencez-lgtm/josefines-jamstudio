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

export interface EngineTelemetry {
  xruns: number;
  input_level: MeterTelemetry;
  output_level: MeterTelemetry;
  tuner?: TunerTelemetry | null;
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
