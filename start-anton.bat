@echo off
rem start-anton.bat -- start ANTON (production build) on http://localhost:3001.
rem
rem Prefers Windows Terminal: in a legacy console window, selecting text
rem (QuickEdit mode) blocks every process writing to the console, which
rem freezes the whole ANTON server mid-run and looks like a hang.
rem WT_SESSION is only set inside Windows Terminal, so when it is absent
rem and wt.exe exists, relaunch this script there.
title ANTON
cd /d "%~dp0"

if not defined WT_SESSION (
  where wt.exe >nul 2>nul
  if not errorlevel 1 (
    start "ANTON" wt.exe -d "%~dp0." cmd /k "%~f0"
    exit /b
  )
)

echo.
echo   ANTON is starting up...
echo   Your browser will open at http://localhost:3001
echo.
echo   Press Ctrl+C to stop ANTON.
echo.
start /min "" powershell -WindowStyle Hidden -Command "Start-Sleep 4; Start-Process 'http://localhost:3001'"
pnpm run start
