@echo off
title ANTON
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "scripts\portable\run-anton.ps1"
if errorlevel 1 (
  echo.
  echo ANTON could not start. Read the messages above for what went wrong.
  echo.
  pause
)
