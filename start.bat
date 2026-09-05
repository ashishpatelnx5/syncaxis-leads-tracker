@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
set SERVER_DIR=%ROOT%app\server
set PIDFILE=%ROOT%.server.pid
set LOGDIR=%SERVER_DIR%\logs

if exist "%PIDFILE%" (
    set /p OLDPID=<"%PIDFILE%"
    tasklist /FI "PID eq !OLDPID!" 2>nul | find "!OLDPID!" >nul
    if not errorlevel 1 (
        echo Syncaxis Leads Tracker is already running ^(PID !OLDPID!^).
        echo Visit http://localhost:8057
        pause
        exit /b 0
    )
)

if not exist "%SERVER_DIR%\dist\server.js" (
    echo %SERVER_DIR%\dist\server.js not found.
    echo Build the server first: cd app\server ^&^& npm install ^&^& npm run build
    pause
    exit /b 1
)

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo Starting Syncaxis Leads Tracker...
powershell -NoProfile -NonInteractive -Command "$p = Start-Process -FilePath 'node' -ArgumentList 'dist\server.js' -WorkingDirectory '%SERVER_DIR%' -WindowStyle Hidden -RedirectStandardOutput '%LOGDIR%\out.log' -RedirectStandardError '%LOGDIR%\err.log' -PassThru; Set-Content -Path '%PIDFILE%' -Value $p.Id -NoNewline" >nul 2>nul

timeout /t 2 /nobreak >nul

if exist "%PIDFILE%" (
    set /p NEWPID=<"%PIDFILE%"
    echo Started ^(PID !NEWPID!^). Visit http://localhost:8057
    echo Logs: %LOGDIR%\out.log and %LOGDIR%\err.log
) else (
    echo Failed to start - check that Node.js is installed and on PATH.
)
pause
