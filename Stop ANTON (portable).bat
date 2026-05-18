@echo off
title ANTON - stopping
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "scripts\portable\stop-anton.ps1"
timeout /t 2 >nul
