@echo off
setlocal
echo ========================================================
echo   StorageRelief - Launcher
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
