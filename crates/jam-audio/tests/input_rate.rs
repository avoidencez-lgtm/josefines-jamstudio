use jam_audio::{devices::AudioConfig, engine::AudioEngine};

// This integration-test binary owns its process environment. Do not move the
// fake-input override into engine unit tests, which start engines concurrently.
#[test]
fn mismatched_input_refuses_every_take_path_and_matching_restart_recovers() {
    let dir = std::env::temp_dir().join(format!(
        "jam-rate-mismatch-{}-{}",
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
        sample_rate: 48_000,
        ..AudioConfig::default()
    });
    engine.start().unwrap();
    let status = engine.status();
    let error = status.last_error.unwrap();
    assert!(
        error.contains("44100") && error.contains("48000"),
        "{error}"
    );
    assert!(status.input.is_none());
    assert!(engine
        .recorder_start("jam".into())
        .unwrap_err()
        .contains("Cannot record"));
    assert!(engine
        .record_song("song".into())
        .unwrap_err()
        .contains("Cannot record"));
    {
        let mut capture = engine.capture.lock();
        capture.arm(1).unwrap();
        capture.push(&[[0.1; 9]; 64], 48_000);
    }
    let kept = engine.keep_capture("idea".into());
    engine.stop().unwrap();
    assert!(kept.unwrap_err().contains("Cannot record"));
    assert!(
        !dir.join("takes").exists(),
        "rejected takes must create no files"
    );

    std::env::remove_var("JAM_FAKE_INPUT");
    engine.start().unwrap();
    assert!(engine.status().last_error.is_none());
    let id = engine.recorder_start("matching".into()).unwrap();
    assert_eq!(engine.recorder_stop().unwrap().id, id);
    engine.stop().unwrap();
    std::fs::remove_dir_all(dir).unwrap();
}
