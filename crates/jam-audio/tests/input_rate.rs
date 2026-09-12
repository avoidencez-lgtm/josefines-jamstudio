use jam_audio::{devices::AudioConfig, engine::AudioEngine};

// This integration-test binary owns its process environment. Do not move the
// fake-input override into engine unit tests, which start engines concurrently.
#[test]
fn fake_44100_file_converts_to_48k_and_records() {
    let dir = std::env::temp_dir().join(format!(
        "jam-rate-edge-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let wav = dir.join("di-44100.wav");
    let mut writer = hound::WavWriter::create(
        &wav,
        hound::WavSpec {
            channels: 1,
            sample_rate: 44_100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .unwrap();
    for _ in 0..2205 {
        writer.write_sample(1000_i16).unwrap();
    }
    writer.finalize().unwrap();
    std::env::set_var("JAM_HEADLESS", "1");
    std::env::set_var("JAM_DATA_DIR", &dir);
    std::env::set_var("JAM_FAKE_INPUT", &wav);
    let mut engine = AudioEngine::new(AudioConfig {
        sample_rate: 44_100,
        ..AudioConfig::default()
    });
    engine.start().unwrap();
    let status = engine.status();
    assert_eq!(status.sample_rate, 48_000);
    assert!(
        status.last_error.is_none(),
        "{}",
        status.last_error.unwrap_or_default()
    );
    assert_eq!(
        status.input.as_ref().map(|i| i.sample_rate),
        Some(48_000)
    );
    let id = engine.recorder_start("jam".into()).unwrap();
    assert_eq!(engine.recorder_stop().unwrap().id, id);
    engine.stop().unwrap();
    std::env::remove_var("JAM_FAKE_INPUT");
    std::fs::remove_dir_all(dir).unwrap();
}
