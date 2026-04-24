@echo off
title Bakesale POS
color 0A
cls

echo.
echo  Starting Bakesale POS...
echo.

:: Activate Python environment and start Django in background
cd /d "%~dp0backend"
call venv\Scripts\activate.bat

:: Start Django silently in background
start /min "" python manage.py runserver 0.0.0.0:8000

:: Wait 3 seconds for Django to start
echo  Starting server, please wait...
timeout /t 3 /nobreak >nul

:: Launch Electron app
cd /d "%~dp0"
npx electron .

:: When app closes, kill Django
taskkill /f /im python.exe >nul 2>&1
