@echo off
setlocal

rem ---- Adjust these if your setup differs ----
set SERVICE_NAME=SyncaxisLeadsTracker
set NSSM=C:\Tools\nssm.exe
rem ---------------------------------------------

set APP_SERVER_DIR=%~dp0app\server

if not exist "%NSSM%" (
    echo NSSM not found at %NSSM%.
    echo Download it from https://nssm.cc/download and place nssm.exe there,
    echo or edit the NSSM path at the top of this file.
    pause
    exit /b 1
)

sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
    echo Service "%SERVICE_NAME%" is not installed yet - installing it now...

    for /f "delims=" %%N in ('where node') do set NODE_PATH=%%N
    if not defined NODE_PATH (
        echo node.exe not found on PATH. Install Node.js first, then re-run this script.
        pause
        exit /b 1
    )

    if not exist "%APP_SERVER_DIR%\dist\server.js" (
        echo %APP_SERVER_DIR%\dist\server.js not found.
        echo Build the server first: cd app\server ^&^& npm install ^&^& npm run build
        pause
        exit /b 1
    )

    if not exist "%APP_SERVER_DIR%\logs" mkdir "%APP_SERVER_DIR%\logs"

    "%NSSM%" install "%SERVICE_NAME%" "%NODE_PATH%" "dist\server.js"
    "%NSSM%" set "%SERVICE_NAME%" AppDirectory "%APP_SERVER_DIR%"
    "%NSSM%" set "%SERVICE_NAME%" AppStdout "%APP_SERVER_DIR%\logs\out.log"
    "%NSSM%" set "%SERVICE_NAME%" AppStderr "%APP_SERVER_DIR%\logs\err.log"
    "%NSSM%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
)

echo Starting "%SERVICE_NAME%"...
"%NSSM%" start "%SERVICE_NAME%"
"%NSSM%" status "%SERVICE_NAME%"
pause
