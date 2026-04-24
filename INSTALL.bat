@echo off
title Bakesale POS - First Time Setup
color 0A
cls

echo.
echo  =====================================================
echo   BAKESALE POS - FIRST TIME SETUP
echo   This will set up everything automatically.
echo   Takes about 3-5 minutes.
echo  =====================================================
echo.

:: ── Ask for PostgreSQL password ──────────────────────────────────────────────
set /p PGPASS="Enter the PostgreSQL password you set during install: "
echo.

:: ── Check Python ─────────────────────────────────────────────────────────────
echo [1/8] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Python not found!
    echo  Please install Python from https://python.org
    echo  IMPORTANT: Tick "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)
echo        OK - Python found.

:: ── Check Node ───────────────────────────────────────────────────────────────
echo [2/8] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Node.js not found!
    echo  Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo        OK - Node.js found.

:: ── Create PostgreSQL database ───────────────────────────────────────────────
echo [3/8] Creating database...
set PGPASSWORD=%PGPASS%
psql -U postgres -c "CREATE DATABASE bakesale;" >nul 2>&1
echo        OK - Database 'bakesale' ready.

:: ── Create Python virtual environment ───────────────────────────────────────
echo [4/8] Setting up Python environment...
cd /d "%~dp0backend"
if not exist "venv" (
    python -m venv venv >nul 2>&1
)
call venv\Scripts\activate.bat
echo        OK - Python environment ready.

:: ── Install Python packages ──────────────────────────────────────────────────
echo [5/8] Installing Python packages (may take 1-2 min)...
pip install -r requirements.txt --quiet --disable-pip-version-check
echo        OK - Python packages installed.

:: ── Write .env file ──────────────────────────────────────────────────────────
echo [6/8] Writing configuration...
(
echo SECRET_KEY=bakesale-secret-2024-change-this-key
echo DEBUG=False
echo USE_POSTGRES=True
echo DB_NAME=bakesale
echo DB_USER=postgres
echo DB_PASSWORD=%PGPASS%
echo DB_HOST=localhost
echo DB_PORT=5432
) > .env
echo        OK - Configuration saved.

:: ── Run database migrations ──────────────────────────────────────────────────
echo [7/8] Setting up database tables...
python manage.py migrate --run-syncdb >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Database setup failed!
    echo  Check that PostgreSQL is running and your password is correct.
    echo  Open Services (Win+R, type services.msc) and check
    echo  that "postgresql-x64-16" service is Running.
    echo.
    pause
    exit /b 1
)
python manage.py create_default_admin >nul 2>&1
echo        OK - Database ready.

:: ── Install Node / Electron packages ────────────────────────────────────────
echo [8/8] Installing app packages (may take 1-2 min)...
cd /d "%~dp0"
call npm install --silent 2>nul
cd frontend
call npm install --silent 2>nul
call npm run build >nul 2>&1
cd ..
echo        OK - App packages installed.

:: ── Done! ───────────────────────────────────────────────────────────────────
color 0A
echo.
echo  =====================================================
echo   SETUP COMPLETE!
echo  =====================================================
echo.
echo   Default login:
echo     Username : admin
echo     Password : admin123
echo.
echo   To open the app, double-click START.bat
echo   (or run it now by pressing any key)
echo.
pause
call "%~dp0START.bat"
