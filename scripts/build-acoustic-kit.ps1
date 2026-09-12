param(
    [Parameter(Mandatory = $true)]
    [string]$OutputZip
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$upstream = "https://github.com/sfzinstruments/virtuosity_drums"
$commit = "9f04cf9a734527edfbb0a4eee1f674e45bbf71bc"
$raw = "https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/$commit"
$root = Join-Path ([IO.Path]::GetTempPath()) "josefines-acoustic-kit-$PID"
$source = Join-Path $root "source"
$pack = Join-Path $root "standard-rock-kit"
New-Item -ItemType Directory -Force -Path $source, $pack | Out-Null

function Get-UpstreamFile([string]$Path) {
    $target = Join-Path $source ($Path -replace "/", "_")
    if (-not (Test-Path -LiteralPath $target)) {
        Invoke-WebRequest -Uri "$raw/$Path" -OutFile $target
    }
    return $target
}

function Convert-Hit(
    [string]$Output,
    [string]$Overhead,
    [string]$Close,
    [double]$Seconds,
    [int]$PitchRate = 48000
) {
    $overheadFile = Get-UpstreamFile $Overhead
    if ($Close) {
        $closeFile = Get-UpstreamFile $Close
        $filter = "[0:a]pan=mono|c0=0.5*c0+0.5*c1[a];[1:a]pan=mono|c0=0.5*c0+0.5*c1[b];[a][b]amix=inputs=2:weights='1 0.55':normalize=0,alimiter=limit=0.98"
        if ($PitchRate -ne 48000) { $filter += ",asetrate=$PitchRate,aresample=48000" }
        & ffmpeg -hide_banner -loglevel error -y -i $closeFile -i $overheadFile -filter_complex $filter -t $Seconds -ar 48000 -ac 1 -c:a pcm_s16le $Output
    } else {
        $filter = "pan=mono|c0=0.5*c0+0.5*c1,alimiter=limit=0.98"
        if ($PitchRate -ne 48000) { $filter += ",asetrate=$PitchRate,aresample=48000" }
        & ffmpeg -hide_banner -loglevel error -y -i $overheadFile -af $filter -t $Seconds -ar 48000 -ac 1 -c:a pcm_s16le $Output
    }
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $Overhead" }
}

$specs = @(
    @{ name="kick"; folder="kick"; token="kick_snon"; levels=@(@(1,2),@(2,3),@(4,4)); rr=$true; close="kickmic"; seconds=2.5; pitch=48000 },
    @{ name="snare"; folder="snare"; token="snare_center"; levels=@(@(4,5),@(18,19),@(34,35)); rr=$false; close="snaremic"; seconds=3.0; pitch=48000 },
    @{ name="hihat_closed"; folder="hh"; token="hh_closed"; levels=@(@(1,1),@(2,2),@(4,4)); rr=$true; close=""; seconds=1.5; pitch=48000; choke="hihat" },
    @{ name="hihat_open"; folder="hh"; token="hh_open"; levels=@(@(1,1),@(2,2),@(4,4)); rr=$true; close=""; seconds=4.0; pitch=48000; choke="hihat" },
    @{ name="pedal_hihat"; folder="hh"; token="hh_pedal"; levels=@(@(1,1),@(2,2),@(3,3)); rr=$true; close=""; seconds=2.0; pitch=48000; choke="hihat" },
    @{ name="crash"; folder="crash"; token="crash_crash"; levels=@(@(1,1),@(2,2),@(3,3)); rr=$true; close=""; seconds=7.0; pitch=48000 },
    @{ name="ride"; folder="ride"; token="ride_ride"; levels=@(@(1,1),@(2,2),@(3,3)); rr=$true; close=""; seconds=6.0; pitch=48000 },
    @{ name="sidestick"; folder="snare"; token="snare_crossstick"; levels=@(@(2,3),@(8,9),@(15,16)); rr=$false; close="snaremic"; seconds=2.0; pitch=48000 },
    @{ name="tom_high"; folder="htom"; token="htom_center"; levels=@(@(2,3),@(8,9),@(15,16)); rr=$false; close=""; seconds=4.0; pitch=48000 },
    @{ name="tom_mid"; folder="htom"; token="htom_center"; levels=@(@(2,3),@(8,9),@(15,16)); rr=$false; close=""; seconds=4.5; pitch=40363 },
    @{ name="tom_low"; folder="ltom"; token="ltom_center"; levels=@(@(2,3),@(8,9),@(15,16)); rr=$false; close=""; seconds=4.5; pitch=48000 }
)

$instruments = @()
foreach ($spec in $specs) {
    $layers = @()
    for ($layerIndex = 0; $layerIndex -lt 3; $layerIndex++) {
        $files = @()
        for ($variation = 0; $variation -lt 2; $variation++) {
            $level = $spec.levels[$layerIndex][$variation]
            $rr = $variation + 1
            $suffix = if ($spec.rr) { "_vl${level}_rr${rr}.flac" } else { "_vl${level}.flac" }
            $oh = "Samples/oh/$($spec.folder)/oh_$($spec.token)$suffix"
            $close = if ($spec.close) { "Samples/$($spec.close)/$($spec.folder)/$($spec.close)_$($spec.token)$suffix" } else { "" }
            $filename = "$($spec.name)-$($layerIndex + 1)-$($variation + 1).wav"
            Convert-Hit (Join-Path $pack $filename) $oh $close $spec.seconds $spec.pitch
            $files += $filename
        }
        $bounds = @(@(0.0,0.34),@(0.34,0.67),@(0.67,1.0))[$layerIndex]
        $layers += [ordered]@{ velocity=$bounds; files=$files }
    }
    $instrument = [ordered]@{ name=$spec.name; layers=$layers }
    if ($spec.ContainsKey("choke")) { $instrument.chokeGroup = $spec.choke }
    $instruments += $instrument
}

$manifest = [ordered]@{
    schemaVersion = 1
    id = "standard-rock-kit"
    sampleRate = 48000
    instruments = $instruments
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $pack "kit.json") -Encoding utf8
Invoke-WebRequest -Uri "$raw/LICENSE" -OutFile (Join-Path $pack "LICENSE.txt")
@"
Josefines Jamstudio compact acoustic rock kit

Source: $upstream
Pinned source commit: $commit
Source licence: CC0-1.0 (see LICENSE.txt)

This package selects and converts a compact set of Virtuosity Drums overhead,
kick-mic and snare-mic recordings to 48 kHz mono PCM WAV. Kick and snare combine
their close microphone with the overhead microphone. tom_mid is derived from the
high tom by lowering it three semitones. Each instrument has three velocity bands
and two source variations per band. No synthetic drum audio is included.
"@ | Set-Content -LiteralPath (Join-Path $pack "README.txt") -Encoding utf8

$resolved = [IO.Path]::GetFullPath($OutputZip)
New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($resolved)) | Out-Null
if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved }
Compress-Archive -Path (Join-Path $pack "*") -DestinationPath $resolved -CompressionLevel Optimal
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolved).Hash.ToLowerInvariant()
$bytes = (Get-Item -LiteralPath $resolved).Length
Write-Output "zip=$resolved"
Write-Output "sha256=$hash"
Write-Output "bytes=$bytes"

Remove-Item -LiteralPath $root -Recurse -Force
