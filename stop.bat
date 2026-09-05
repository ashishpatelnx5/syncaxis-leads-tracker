@echo off
setlocal

rem ---- Adjust these if your setup differs ----
set SERVICE_NAME=SyncaxisLeadsTracker
set NSSM=C:\Tools\nssm.exe
rem ---------------------------------------------

if not exist "%NSSM%" (
    echo NSSM not found at %NSSM%. Edit the NSSM path at the top of this file.
    pause
    exit /b 1
)

echo Stopping "%SERVICE_NAME%"...
"%NSSM%" stop "%SERVICE_NAME%"
"%NSSM%" status "%SERVICE_NAME%"
pause
