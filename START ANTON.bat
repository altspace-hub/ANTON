@echo off
title openEXPERT -- ANTON AI Workbench
cd /d "%~dp0"

echo.
echo   =====================================================
echo    openEXPERT by ANTON
echo    AI Workbench for FCP Teams
echo   =====================================================
echo.

netstat -an 2>nul | findstr ":3001.*LISTENING" >nul
if not errorlevel 1 (
    echo   ANTON is already running.
    echo   Opening browser at http://localhost:3001
    echo.
    start http://localhost:3001
    timeout /t 2 /nobreak >nul
    exit /b 0
)

node --version >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Node.js not found.
    echo   Install from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo   ERROR: No .env file found.
    echo   Copy .env.example to .env and add your ANTHROPIC_API_KEY.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\.bin\tsx" (
    echo   Installing dependencies - this only happens once...
    call pnpm install --frozen-lockfile
    if errorlevel 1 (
        echo   ERROR: Dependency install failed.
        pause
        exit /b 1
    )
)

for /f "delims=" %%H in ('git rev-parse HEAD 2^>nul') do set CURRENT_HASH=%%H
set STORED_HASH=
if exist "dist\client\.build-hash" set /p STORED_HASH=<dist\client\.build-hash

if not exist "dist\client" goto REBUILD
if not "%CURRENT_HASH%"=="%STORED_HASH%" goto REBUILD
goto START

:REBUILD
if exist "dist\client" (
    echo   Code has changed - rebuilding ANTON...
) else (
    echo   Building ANTON - this only happens once...
)
call pnpm run build
if errorlevel 1 (
    echo   ERROR: Build failed.
    pause
    exit /b 1
)
echo %CURRENT_HASH%> dist\client\.build-hash

:START

start /min "" cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3001"

echo   Starting server... your browser will open in a few seconds.
echo   Go to: http://localhost:3001
echo.
echo   -------------------------------------------------------
echo   Close this window to stop ANTON.
echo   -------------------------------------------------------
echo.

node_modules\.bin\tsx server/index.ts

echo.
echo   ANTON has stopped.
pause >nul
