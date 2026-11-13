@echo off
title MyPNK Cloud Launcher
cd /d "%~dp0"
if exist "MyPnk.exe" (
    start "" "MyPnk.exe"
) else (
    node server.js
)
