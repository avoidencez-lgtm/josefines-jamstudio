# Builds the CC0 synthetic drum kit zip from the jam-band sampler formulas.
# Output stays outside git. Used only to publish the assets-v1 GitHub Release.
param(
    [string]$OutDir = $(Join-Path $env:TEMP "jam-assets-v1")
)

$ErrorActionPreference = "Stop"
$rate = 48000
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Write-PcmWav([string]$Path, [single[]]$Samples) {
    $data = New-Object byte[] ($Samples.Length * 2)
    for ($i = 0; $i -lt $Samples.Length; $i++) {
        $v = [int][math]::Round([math]::Max(-1.0, [math]::Min(1.0, $Samples[$i])) * 32767)
        $data[2 * $i] = [byte]($v -band 0xFF)
        $data[2 * $i + 1] = [byte](($v -shr 8) -band 0xFF)
    }
    $stream = [System.IO.File]::Create($Path)
    $w = New-Object System.IO.BinaryWriter $stream
    $w.Write([Text.Encoding]::ASCII.GetBytes("RIFF"))
    $w.Write([int](36 + $data.Length))
    $w.Write([Text.Encoding]::ASCII.GetBytes("WAVEfmt "))
    $w.Write([int]16)
    $w.Write([int16]1)
    $w.Write([int16]1)
    $w.Write([int]$rate)
    $w.Write([int]($rate * 2))
    $w.Write([int16]2)
    $w.Write([int16]16)
    $w.Write([Text.Encoding]::ASCII.GetBytes("data"))
    $w.Write([int]$data.Length)
    $w.Write($data)
    $w.Close()
}

function New-Kick {
    $len = [int]($rate * 0.25)
    $s = New-Object single[] $len
    $phase = 0.0
    for ($i = 0; $i -lt $len; $i++) {
        $t = $i / $rate
        $decay = [math]::Exp(-12.0 * $t)
        $freq = 140.0 * [math]::Exp(-30.0 * $t) + 45.0
        $phase += $freq / $rate
        $s[$i] = [single]([math]::Sin($phase * 2.0 * [math]::PI) * $decay * 0.9)
    }
    $s
}

function New-Snare {
    $len = [int]($rate * 0.2)
    $s = New-Object single[] $len
    $seed = [uint32]12345
    for ($i = 0; $i -lt $len; $i++) {
        $t = $i / $rate
        $decay = [math]::Exp(-18.0 * $t)
        $seed = [uint32]((([uint64]$seed * 1664525 + 1013904223) % [uint64]4294967296))
        $noise = ($seed / 2147483648.0) - 1.0
        $tone = [math]::Sin($t * 2.0 * [math]::PI * 185.0)
        $s[$i] = [single](($noise * 0.7 + $tone * 0.3) * $decay * 0.85)
    }
    $s
}

function New-NoiseHit([int]$Ms, [uint32]$Seed0, [double]$DecayK, [double]$Gain) {
    $len = [int]($rate * $Ms / 1000.0)
    $s = New-Object single[] $len
    $seed = $Seed0
    for ($i = 0; $i -lt $len; $i++) {
        $t = $i / $rate
        $decay = [math]::Exp(-$DecayK * $t)
        $seed = [uint32]((([uint64]$seed * 1664525 + 1013904223) % [uint64]4294967296))
        $noise = ($seed / 2147483648.0) - 1.0
        $s[$i] = [single]($noise * $decay * $Gain)
    }
    $s
}

function New-Ride {
    $len = [int]($rate * 0.8)
    $s = New-Object single[] $len
    for ($i = 0; $i -lt $len; $i++) {
        $t = $i / $rate
        $decay = [math]::Exp(-5.0 * $t)
        $tone = [math]::Sin($t * 2.0 * [math]::PI * 580.0) + [math]::Sin($t * 2.0 * [math]::PI * 840.0) * 0.7
        $s[$i] = [single]($tone * $decay * 0.5)
    }
    $s
}

function New-Tom([double]$Base) {
    $len = [int]($rate * 0.3)
    $s = New-Object single[] $len
    $phase = 0.0
    for ($i = 0; $i -lt $len; $i++) {
        $t = $i / $rate
        $decay = [math]::Exp(-10.0 * $t)
        $freq = $Base * (1.0 + 0.5 * [math]::Exp(-20.0 * $t))
        $phase += $freq / $rate
        $s[$i] = [single]([math]::Sin($phase * 2.0 * [math]::PI) * $decay * 0.8)
    }
    $s
}

function New-Sidestick {
    $len = [int]($rate * 0.06)
    $s = New-Object single[] $len
    $seed = [uint32]24680
    for ($i = 0; $i -lt $len; $i++) {
        $t = $i / $rate
        $decay = [math]::Exp(-70.0 * $t)
        $seed = [uint32]((([uint64]$seed * 1664525 + 1013904223) % [uint64]4294967296))
        $noise = ($seed / 2147483648.0) - 1.0
        $knock = [math]::Sin($t * 2.0 * [math]::PI * 1450.0) + [math]::Sin($t * 2.0 * [math]::PI * 2900.0) * 0.4
        $s[$i] = [single](($knock * 0.55 + $noise * 0.25) * $decay * 0.7)
    }
    $s
}

function New-Pedal {
    $len = [int]($rate * 0.03)
    $s = New-Object single[] $len
    $seed = [uint32]13572
    $lp = 0.0
    for ($i = 0; $i -lt $len; $i++) {
        $t = $i / $rate
        $decay = [math]::Exp(-110.0 * $t)
        $seed = [uint32]((([uint64]$seed * 1664525 + 1013904223) % [uint64]4294967296))
        $noise = ($seed / 2147483648.0) - 1.0
        $lp += 0.35 * ($noise - $lp)
        $s[$i] = [single]($lp * $decay * 0.8)
    }
    $s
}

Write-PcmWav (Join-Path $OutDir "kick.wav") (New-Kick)
Write-PcmWav (Join-Path $OutDir "snare.wav") (New-Snare)
Write-PcmWav (Join-Path $OutDir "hihat_closed.wav") (New-NoiseHit 40 54321 80 0.6)
Write-PcmWav (Join-Path $OutDir "hihat_open.wav") (New-NoiseHit 350 98765 9 0.65)
Write-PcmWav (Join-Path $OutDir "crash.wav") (New-NoiseHit 1200 13579 3.5 0.7)
Write-PcmWav (Join-Path $OutDir "ride.wav") (New-Ride)
Write-PcmWav (Join-Path $OutDir "tom_high.wav") (New-Tom 160)
Write-PcmWav (Join-Path $OutDir "tom_mid.wav") (New-Tom 120)
Write-PcmWav (Join-Path $OutDir "tom_low.wav") (New-Tom 90)
Write-PcmWav (Join-Path $OutDir "sidestick.wav") (New-Sidestick)
Write-PcmWav (Join-Path $OutDir "pedal_hihat.wav") (New-Pedal)

@'
{
  "schemaVersion": 1,
  "id": "standard-rock-kit",
  "name": "Standard Rock Kit",
  "licence": "CC0-1.0",
  "attribution": "Original synthetic percussion generated by Josefines Jamstudio from crates/jam-band/src/sampler.rs.",
  "sampleRate": 48000,
  "instruments": [
    {"name":"kick","layers":[{"velocity":[0,1],"files":["kick.wav"]}]},
    {"name":"snare","layers":[{"velocity":[0,1],"files":["snare.wav"]}]},
    {"name":"hihat_closed","layers":[{"velocity":[0,1],"files":["hihat_closed.wav"]}],"chokeGroup":"hihat"},
    {"name":"hihat_open","layers":[{"velocity":[0,1],"files":["hihat_open.wav"]}],"chokeGroup":"hihat"},
    {"name":"crash","layers":[{"velocity":[0,1],"files":["crash.wav"]}]},
    {"name":"ride","layers":[{"velocity":[0,1],"files":["ride.wav"]}]},
    {"name":"tom_high","layers":[{"velocity":[0,1],"files":["tom_high.wav"]}]},
    {"name":"tom_mid","layers":[{"velocity":[0,1],"files":["tom_mid.wav"]}]},
    {"name":"tom_low","layers":[{"velocity":[0,1],"files":["tom_low.wav"]}]},
    {"name":"sidestick","layers":[{"velocity":[0,1],"files":["sidestick.wav"]}]},
    {"name":"pedal_hihat","layers":[{"velocity":[0,1],"files":["pedal_hihat.wav"]}],"chokeGroup":"hihat"}
  ]
}
'@ | Set-Content -Encoding utf8 (Join-Path $OutDir "kit.json")

@'
CC0 1.0 Universal

These WAV files are original synthetic percussion generated by Josefines
Jamstudio from the algorithms in crates/jam-band/src/sampler.rs. They are
dedicated to the public domain under CC0-1.0. This is not an acoustic
multisample library.
'@ | Set-Content -Encoding utf8 (Join-Path $OutDir "LICENSE.txt")

$zip = Join-Path (Split-Path $OutDir) "standard-rock-kit.zip"
if (Test-Path $zip) { Remove-Item $zip }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($OutDir, $zip)
$hash = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
$bytes = (Get-Item $zip).Length
Write-Output "ZIP=$zip"
Write-Output "SHA256=$hash"
Write-Output "BYTES=$bytes"
