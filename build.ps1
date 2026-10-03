# One-click portable build script for StorageRelief
$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   Building StorageRelief (.exe)         " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Redirect build output outside OneDrive to avoid file-lock issues
$env:CARGO_TARGET_DIR = "C:\RustBuild\storage-relief"
New-Item -ItemType Directory -Force -Path $env:CARGO_TARGET_DIR | Out-Null

# Compile and package Tauri release binary
Push-Location $ROOT
try {
    npm run tauri build
} finally {
    Pop-Location
}

$releaseExe = "$env:CARGO_TARGET_DIR\release\storage-relief.exe"
$loaderDll = "$env:CARGO_TARGET_DIR\release\WebView2Loader.dll"

if (Test-Path $releaseExe) {
    Stop-Process -Name "*StorageRelief*", "*storage-relief*" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300
    Copy-Item $releaseExe (Join-Path $ROOT "StorageRelief.exe") -Force
    if (Test-Path $loaderDll) {
        Copy-Item $loaderDll (Join-Path $ROOT "WebView2Loader.dll") -Force
    }
    $sizeMB = [math]::Round((Get-Item (Join-Path $ROOT "StorageRelief.exe")).Length / 1MB, 2)
    Write-Host ""
    Write-Host "SUCCESS: Standalone executable created!" -ForegroundColor Green
    Write-Host "Location: $(Join-Path $ROOT 'StorageRelief.exe') ($sizeMB MB)" -ForegroundColor Yellow
}
