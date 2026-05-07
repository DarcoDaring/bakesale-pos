@echo off
:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title Bakesale Backend Updater
color 0A
cls

echo.
echo ================================
echo   Bakesale Backend Updater
echo ================================
echo.

cd /d "C:\Bakesale\backend"

:: Show recently modified files (last 1 day)
echo Recently modified files:
echo ----------------------------------------
for /f "delims=" %%f in ('powershell -Command "Get-ChildItem -Path 'C:\Bakesale\backend' -Recurse -File | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-1) -and $_.FullName -notmatch '__pycache__|\.pyc|\\staticfiles\\|\\migrations\\' } | ForEach-Object { $_.Name }"') do (
    echo   %%f
)
echo ----------------------------------------
echo.

call ..\venv\Scripts\activate.bat
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Could not activate Python environment!
    pause
    exit /b 1
)

echo [1/4] Creating new migrations (makemigrations)...
python manage.py makemigrations
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ================================
    echo   MIGRATION FAILED! (makemigrations)
    echo   Check your models.py for errors.
    echo ================================
    echo.
    pause
    exit /b 1
)
echo OK - makemigrations done.
echo.

echo [2/4] Applying migrations to database (migrate)...
python manage.py migrate
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ================================
    echo   MIGRATION FAILED! (migrate)
    echo   Check database connection and
    echo   review errors above.
    echo ================================
    echo.
    pause
    exit /b 1
)
echo.
echo ================================
echo   Migrations Applied Successfully!
echo ================================
echo.
echo.

echo [3/4] Collecting static files...
python manage.py collectstatic --noinput >nul 2>&1
echo OK - Static files collected.
echo.

echo [4/4] Restarting Bakesale service...
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