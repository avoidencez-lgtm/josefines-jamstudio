# Generate original codec fixtures outside the repo; FFmpeg is only the encoder.
# The Rust test decodes every file without invoking an external tool.
$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('jam-import-' + [guid]::NewGuid())
$previous = $env:JAM_IMPORT_FIXTURES
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
try {
    & ffmpeg -nostdin -y -v error -f lavfi -i 'aevalsrc=0.2*sin(2*PI*997*t)|-0.2*sin(2*PI*997*t):s=44100:d=1' -c:a pcm_f32le (Join-Path $fixtureRoot 'input.wav')
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic WAV generation failed' }
    $formats = @{
        'input.flac' = 'flac'; 'input.aiff' = 'pcm_s16be';
        'input.mp3' = 'libmp3lame'; 'input-vorbis.ogg' = 'libvorbis';
        'input-aac.m4a' = 'aac'; 'input-alac.m4a' = 'alac'
    }
    foreach ($file in $formats.Keys) {
        & ffmpeg -nostdin -y -v error -i (Join-Path $fixtureRoot 'input.wav') -c:a $formats[$file] (Join-Path $fixtureRoot $file)
        if ($LASTEXITCODE -ne 0) { throw "Fixture encoding failed: $file" }
    }
    & ffmpeg -nostdin -y -v error -i (Join-Path $fixtureRoot 'input.wav') -af 'atrim=end_sample=10000' -c:a aac -movie_timescale 1000 (Join-Path $fixtureRoot 'input-aac-movie-ms.m4a')
    if ($LASTEXITCODE -ne 0) { throw 'M4A movie-clock fixture encoding failed' }
    Get-ChildItem -LiteralPath $fixtureRoot -File | Get-FileHash -Algorithm SHA256
    $env:JAM_IMPORT_FIXTURES = $fixtureRoot
    & cargo test -p jam-audio --lib native_decoders_preserve -- --ignored --nocapture
    if ($LASTEXITCODE -ne 0) { throw 'Native codec regression failed' }
} finally {
    $env:JAM_IMPORT_FIXTURES = $previous
    $resolved = [System.IO.Path]::GetFullPath($fixtureRoot)
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($tempRoot) -or !(Split-Path $resolved -Leaf).StartsWith('jam-import-')) { throw 'Unexpected fixture directory; refusing cleanup' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
