//! devices: Audio device enumeration and configuration management.

use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeviceDescriptor {
    pub name: String,
    pub is_default: bool,
    pub channels: u16,
    pub supported_sample_rates: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AudioDevices {
    pub inputs: Vec<DeviceDescriptor>,
    pub outputs: Vec<DeviceDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AudioConfig {
    pub input_device: Option<String>,
    pub output_device: Option<String>,
    pub input_channel: u16,
    pub sample_rate: u32,
    pub buffer_size: u32,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            input_device: None,
            output_device: None,
            input_channel: 2, // Channel 3 (0-indexed 2) is HeadRush dry DI
            sample_rate: 48000,
            buffer_size: 256,
        }
    }
}

const STANDARD_RATES: [u32; 6] = [44_100, 48_000, 88_200, 96_000, 176_400, 192_000];

fn standard_rates_in(min: u32, max: u32) -> Vec<u32> {
    let lo = min.min(max);
    let hi = min.max(max);
    let mut rates: Vec<u32> = STANDARD_RATES
        .into_iter()
        .filter(|r| (lo..=hi).contains(r))
        .collect();
    if !rates.contains(&hi) {
        rates.push(hi);
    }
    rates.sort_unstable();
    rates.dedup();
    rates
}

pub fn list_devices() -> AudioDevices {
    let host = cpal::default_host();

    let mut inputs = Vec::new();
    if let Ok(devs) = host.input_devices() {
        let def_in = host.default_input_device().and_then(|d| d.name().ok());

        for d in devs {
            if let Ok(name) = d.name() {
                let is_default = def_in.as_deref() == Some(name.as_str());
                let (channels, rates) = if let Ok(configs) = d.supported_input_configs() {
                    let mut max_channels = 0;
                    let mut sample_rates = Vec::new();
                    for c in configs {
                        max_channels = max_channels.max(c.channels());
                        sample_rates.extend(standard_rates_in(
                            c.min_sample_rate().0,
                            c.max_sample_rate().0,
                        ));
                    }
                    sample_rates.sort_unstable();
                    sample_rates.dedup();
                    (max_channels, sample_rates)
                } else {
                    (2, vec![48000])
                };

                inputs.push(DeviceDescriptor {
                    name,
                    is_default,
                    channels,
                    supported_sample_rates: rates,
                });
            }
        }
    }

    let mut outputs = Vec::new();
    if let Ok(devs) = host.output_devices() {
        let def_out = host.default_output_device().and_then(|d| d.name().ok());

        for d in devs {
            if let Ok(name) = d.name() {
                let is_default = def_out.as_deref() == Some(name.as_str());
                let (channels, rates) = if let Ok(configs) = d.supported_output_configs() {
                    let mut max_channels = 0;
                    let mut sample_rates = Vec::new();
                    for c in configs {
                        max_channels = max_channels.max(c.channels());
                        sample_rates.extend(standard_rates_in(
                            c.min_sample_rate().0,
                            c.max_sample_rate().0,
                        ));
                    }
                    sample_rates.sort_unstable();
                    sample_rates.dedup();
                    (max_channels, sample_rates)
                } else {
                    (2, vec![48000])
                };

                outputs.push(DeviceDescriptor {
                    name,
                    is_default,
                    channels,
                    supported_sample_rates: rates,
                });
            }
        }
    }

    AudioDevices { inputs, outputs }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn continuous_range_includes_48000_not_only_the_maximum() {
        assert_eq!(
            standard_rates_in(44_100, 192_000),
            vec![44_100, 48_000, 88_200, 96_000, 176_400, 192_000]
        );
        assert!(standard_rates_in(44_100, 192_000).contains(&48_000));
        assert_eq!(standard_rates_in(48_000, 48_000), vec![48_000]);
        assert_eq!(
            standard_rates_in(96_000, 192_000),
            vec![96_000, 176_400, 192_000]
        );
    }
}
