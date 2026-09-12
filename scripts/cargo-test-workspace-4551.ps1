$env:JAM_HEADLESS = "1"
Remove-Item Env:RUSTFLAGS -ErrorAction SilentlyContinue
$max = 24
for ($i = 1; $i -le $max; $i++) {
    Write-Host "=== workspace attempt $i ==="
    $log = Join-Path $env:TEMP "jam-ws-test-$i.log"
    if (Test-Path $log) { Remove-Item -Force $log }
    cmd /c "cargo test --workspace > `"$log`" 2>&1"
    $code = $LASTEXITCODE
    if (-not (Test-Path $log)) {
        Write-Host "WORKSPACE_NO_LOG"
        exit 1
    }
    Get-Content $log
    if ($code -eq 0) {
        Write-Host "WORKSPACE_OK"
        exit 0
    }
    $text = Get-Content $log -Raw
    if ($text -notmatch "os error 4551") {
        Write-Host "WORKSPACE_REAL_FAILURE"
        exit 1
    }
    $exes = [regex]::Matches(
        $text,
        "could not execute process[\s\S]{0,200}?(target[\\/]debug[\\/]deps[\\/][\w.-]+\.exe)"
    ) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    if (-not $exes) {
        Write-Host "WORKSPACE_4551_NO_PATH"
        exit 1
    }
    foreach ($exe in $exes) {
        if (Test-Path $exe) {
            Remove-Item -Force $exe
            Write-Host "WDAC deleted $exe"
        } else {
            Write-Host "WDAC missing $exe"
        }
    }
}
Write-Host "WORKSPACE_4551_EXHAUSTED"
exit 1
