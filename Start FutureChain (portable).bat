@echo off
title FutureChain
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "scripts\portable\start-futurechain.ps1"
if errorlevel 1 (
  echo.
  echo FutureChain could not start. Read the messages above for what went wrong.
  echo.
  pause
)
