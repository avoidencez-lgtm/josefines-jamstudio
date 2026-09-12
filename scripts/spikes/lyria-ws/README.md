# Lyria S4 protocol probe

This standalone Rust helper tests the planned native WebSocket path. It is not
linked into Jamstudio and does not play audio. Its Cargo.lock is independent of
the application's lockfile. The existing application SecretStore is compiled
as a library; its app-dependent tests remain in the root workspace. The probe's
binary tests run separately.

From the repository root:

```powershell
cargo test --manifest-path scripts/spikes/lyria-ws/Cargo.toml --locked -- --nocapture
cargo run --manifest-path scripts/spikes/lyria-ws/Cargo.toml --locked
cargo run --manifest-path scripts/spikes/lyria-ws/Cargo.toml --locked -- --key-status
```

The default run uses loopback only: ten minutes of synthetic stereo PCM across
two connections, sent as fast as possible. It checks setup acknowledgement,
control ordering, text/binary messages, all audio chunks and exact sample values.
This does **not** measure ten minutes of realtime playback or Google availability.

Only after explicit approval of provider usage, save the Gemini key through
Jamstudio Settings. Never place a key in a command, environment variable or file.
Then run a live probe into a **new** directory under an existing parent:

```powershell
$env:JAM_LIVE = "1"
$env:JAM_RECORD_FIXTURES = "1"
cargo run --manifest-path scripts/spikes/lyria-ws/Cargo.toml --locked -- --live ../lyria-live-result
```

The probe opens the documented v1alpha endpoint using the fixed synthetic prompt
and configuration in `tests/fixtures/providers/lyria/protocol.json`, waits for
setupComplete, then sends prompts/config/PLAY. After five seconds of received
audio it sends PAUSE, 110 BPM config, RESET_CONTEXT and PLAY. It stops after
30 seconds of receive time or at least 30 seconds of received audio. The saved
WAV is capped at 30 seconds; the last received chunk can exceed that bound.
Generation may run faster than wall time, so this is **not a billing cap**.
Pricing, quotas, server-side buffering and cancellation billing are unverified.
There are no automatic live retries or reconnects.

`session.jsonl` keeps bounded event metadata, timings and sample counts, never a
credential, raw server error or request body. Audio goes only to `output.wav`.
Both are outside the repository in the directory you choose. No output directory
is reused. Errors and connection attempts remain visible in the trace. The
parser deliberately refuses anything except explicit 48 kHz stereo PCM: a
different MIME/rate must be inspected before an app decoder is implemented.

Current evidence and unresolved protocol conflicts: [S4 findings](../../../docs/spikes/S4-lyria-ws.md).
