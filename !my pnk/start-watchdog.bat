@echo off
title Xozen Cloud Watchdog
cd /d D:\!web
:loop
node server.js >> "D:\!web\server_watchdog.log" 2>&1
echo [%date% %time%] server exited (code %errorlevel%), restart in 3s... >> "D:\!web\server_watchdog.log"
timeout /t 3 /nobreak >nul
goto loop
