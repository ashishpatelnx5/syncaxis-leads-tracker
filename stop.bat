@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
set PIDFILE=%ROOT%.server.pid

if not exist "%PIDFILE%" (
    echo Syncaxis Leads Tracker doesn't look like it's running ^(no PID file^).
    pause
    exit /b 0
)

set /p PID=<"%PIDFILE%"

tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul
if errorlevel 1 (
    echo Not running ^(recorded PID !PID! is no longer active^).
    del "%PIDFILE%" >nul 2>&1
    pause
    exit /b 0
)

echo Stopping Syncaxis Leads Tracker ^(PID !PID!^)...
taskkill /PID !PID! /F >nul 2>&1
del "%PIDFILE%" >nul 2>&1
echo Stopped.
pause
