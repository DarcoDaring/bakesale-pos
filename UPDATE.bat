@echo off
title Bakesale Backend Updater
color 0A
cls

echo.
echo ================================
echo   Bakesale Backend Updater
echo ================================
echo.

cd /d "C:\Bakesale\backend"

call ..\venv\Scripts\activate.bat
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Could not activate Python environment!
    echo Make sure Bakesale Server is properly installed.
    pause
    exit /b 1
)

echo [1/3] Running database migrations...
python manage.py migrate
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Migration failed!
    pause
    exit /b 1
)
echo OK - Migrations done.
echo.

echo [2/3] Collecting static files...
python manage.py collectstatic --noinput >nul 2>&1
echo OK - Static files collected.
echo.

echo [3/3] Restarting Bakesale service...
net stop BakesaleBackend >nul 2>&1
timeout /t 2 /nobreak >nul
net start BakesaleBackend >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Could not restart service!
    pause
    exit /b 1
)
echo OK - Service restarted.
echo.

color 0A
echo ================================
echo   Update Complete Successfully!
echo ================================
echo.
pause