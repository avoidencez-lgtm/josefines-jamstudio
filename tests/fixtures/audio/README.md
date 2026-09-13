# Audio fixtures

WAV files in this folder are gitignored (see `.gitignore`) and are not committed.
`assets_ensure` downloads drum/SF2 packs, not these fixtures.

`JAM_FAKE_INPUT` may point at a local WAV you generate or copy here (for example
`guitar-e-blues-120.wav`). If the path is missing or unreadable, the engine falls
back to a 440 Hz sine and says so in the log.
