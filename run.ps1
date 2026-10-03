# Launch StorageRelief
param (
    [switch]$Dev
)

$ROOT = $PSScriptRoot
$exe = Join-Path $ROOT "StorageRelief.exe"

if ($Dev -or -not (Test-Path $exe)) {
    Write-Host "Starting StorageRelief in Development Mode..." -ForegroundColor Cyan
    $env:CARGO_TARGET_DIR = "C:\RustBuild\storage-relief"
    Push-Location $ROOT
    try {
        npm run tauri dev
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Launching StorageRelief..." -ForegroundColor Green
    Start-Process $exe -WorkingDirectory $ROOT
}
