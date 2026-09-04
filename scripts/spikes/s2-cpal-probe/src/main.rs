use cpal::traits::{DeviceTrait, HostTrait};

fn main() {
    println!("=== CPAL Device Probe ===");
    for host_id in cpal::available_hosts() {
        println!("Host: {:?}", host_id);
        let host = cpal::host_from_id(host_id).expect("valid host");

        println!("-- Default Input Device --");
        match host.default_input_device() {
            Some(d) => println!("  {}", d.name().unwrap_or_else(|_| "unknown".into())),
            None => println!("  None"),
        }

        println!("-- Default Output Device --");
        match host.default_output_device() {
            Some(d) => println!("  {}", d.name().unwrap_or_else(|_| "unknown".into())),
            None => println!("  None"),
        }

        println!("-- All Input Devices --");
        if let Ok(devices) = host.input_devices() {
            for (i, d) in devices.enumerate() {
                let name = d.name().unwrap_or_else(|_| "unknown".into());
                println!("  [{}] {}", i, name);
                if let Ok(configs) = d.supported_input_configs() {
                    for c in configs {
                        println!(
                            "      channels: {}, min_rate: {}, max_rate: {}, formats: {:?}",
                            c.channels(),
                            c.min_sample_rate().0,
                            c.max_sample_rate().0,
                            c.sample_format()
                        );
                    }
                }
            }
        }

        println!("-- All Output Devices --");
        if let Ok(devices) = host.output_devices() {
            for (i, d) in devices.enumerate() {
                let name = d.name().unwrap_or_else(|_| "unknown".into());
                println!("  [{}] {}", i, name);
                if let Ok(configs) = d.supported_output_configs() {
                    for c in configs {
                        println!(
                            "      channels: {}, min_rate: {}, max_rate: {}, formats: {:?}",
                            c.channels(),
                            c.min_sample_rate().0,
                            c.max_sample_rate().0,
                            c.sample_format()
                        );
                    }
                }
            }
        }
    }
}
