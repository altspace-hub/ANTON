@echo off
title ANTON
cd /d "%~dp0"
echo.
echo   ANTON is starting up...
echo   Your browser will open at http://localhost:3001
echo.
echo   Press Ctrl+C to stop ANTON.
echo.
start /min "" powershell -WindowStyle Hidden -Command "Start-Sleep 4; Start-Process 'http://localhost:3001'"
pnpm run start
