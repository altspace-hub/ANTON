@echo off
title FutureChain - stopping
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "scripts\portable\stop-futurechain.ps1"
timeout /t 2 >nul
