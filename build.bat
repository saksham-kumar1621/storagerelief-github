@echo off
setlocal
echo ========================================================
echo   StorageRelief - Production Release Packager
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"

echo.
pause
