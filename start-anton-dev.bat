@echo off
rem start-anton-dev.bat -- start the ANTON dev stack (Vite client :5183 + Express server :3001).
rem
rem Prefers Windows Terminal: in a legacy console window, selecting text
rem (QuickEdit mode) blocks every process writing to the console, which
rem freezes the whole ANTON server mid-run and looks like a hang.
rem WT_SESSION is only set inside Windows Terminal, so when it is absent
rem and wt.exe exists, relaunch this script there.
title ANTON dev
cd /d "%~dp0"

if not defined WT_SESSION (
  where wt.exe >nul 2>nul
  if not errorlevel 1 (
    start "ANTON" wt.exe -d "%~dp0." cmd /k "%~f0"
    exit /b
  )
)

rem Open the app in the default browser once the dev client answers
rem (first boot takes ~15s; gives up quietly after 2 minutes).
start "" /min powershell -NoProfile -Command "for($i=0;$i -lt 120;$i++){try{(New-Object Net.Sockets.TcpClient('localhost',5183)).Close();Start-Process 'http://localhost:5183';break}catch{Start-Sleep 1}}"

pnpm run dev
