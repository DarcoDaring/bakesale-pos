@echo off
title Bakesale POS
color 0A
cls

echo.
echo Starting Bakesale POS...
echo.

:: Activate Python environment
cd /d "%~dp0backend"
call venv\Scripts\activate.bat

:: Start Waitress server silently in background
start /min "" python -m waitress --host=0.0.0.0 --port=8000 bakesale.wsgi:application

:: Wait 3 seconds for server to start
echo Starting server, please wait...
timeout /t 3 /nobreak >nul

:: Launch Electron app
cd /d "%~dp0"
npx electron .

:: When app closes, kill server
taskkill /f /im python.exe >nul 2>&1