@echo off
title Bakesale Server Setup
color 0A

set PGPASS=%1

echo.
echo =====================================================
echo   Bakesale Server Setup
echo =====================================================
echo.

:: Create folders
if not exist "C:\Bakesale" mkdir "C:\Bakesale"
if not exist "C:\Bakesale\logs" mkdir "C:\Bakesale\logs"
if not exist "C:\Bakesale\backend" mkdir "C:\Bakesale\backend"
if not exist "C:\Bakesale\frontend" mkdir "C:\Bakesale\frontend"
if not exist "C:\Bakesale\electron" mkdir "C:\Bakesale\electron"

:: ── Step 1: PostgreSQL ────────────────────────────────────────────────────────
echo [1/7] Checking PostgreSQL...

if exist "C:\Bakesale\postgresql\bin\psql.exe" (
    echo OK - Bakesale PostgreSQL already installed, skipping...
    set PGBIN=C:\Bakesale\postgresql\bin
    goto :pgdone
)
if exist "C:\Program Files\PostgreSQL\18\bin\psql.exe" (
    echo OK - System PostgreSQL 18 found, using existing...
    set PGBIN=C:\Program Files\PostgreSQL\18\bin
    goto :pgdone
)
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" (
    echo OK - System PostgreSQL 17 found, using existing...
    set PGBIN=C:\Program Files\PostgreSQL\17\bin
    goto :pgdone
)
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" (
    echo OK - System PostgreSQL 16 found, using existing...
    set PGBIN=C:\Program Files\PostgreSQL\16\bin
    goto :pgdone
)
if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" (
    echo OK - System PostgreSQL 15 found, using existing...
    set PGBIN=C:\Program Files\PostgreSQL\15\bin
    goto :pgdone
)

echo PostgreSQL not found. Installing PostgreSQL 18...
"%~dp0postgresql-18-installer.exe" --mode unattended --unattendedmodeui none --superpassword "%PGPASS%" --serverport 5432 --prefix "C:\Bakesale\postgresql" --datadir "C:\Bakesale\postgresql\data"
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ERROR: PostgreSQL installation failed!
    echo Common reasons:
    echo   - Not enough disk space
    echo   - Antivirus blocking installation
    echo   - Port 5432 already in use
    exit /b 1
)
set PGBIN=C:\Bakesale\postgresql\bin
echo OK - PostgreSQL installed successfully.

:pgdone
echo.

:: ── Step 2: Python ────────────────────────────────────────────────────────────
echo [2/7] Checking Python...

if exist "C:\Bakesale\python\python.exe" (
    echo OK - Bakesale Python already installed, skipping...
    set PYEXE=C:\Bakesale\python\python.exe
    goto :pydone
)
if exist "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe" (
    echo OK - System Python 3.11 found, using existing...
    set PYEXE=C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe
    goto :pydone
)
if exist "C:\Program Files\Python311\python.exe" (
    echo OK - System Python 3.11 found, using existing...
    set PYEXE=C:\Program Files\Python311\python.exe
    goto :pydone
)
where python >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
    echo Found Python version: %PYVER%
    echo %PYVER% | findstr /b "3.11" >nul 2>&1
    if %errorlevel% equ 0 (
        echo OK - Compatible Python 3.11 found in PATH, using existing...
        set PYEXE=python
        goto :pydone
    )
)

echo Python not found. Installing Python 3.11.9...
"%~dp0python-3.11.9-installer.exe" /quiet InstallAllUsers=1 TargetDir="C:\Bakesale\python" PrependPath=0 Include_pip=1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ERROR: Python installation failed!
    echo Common reasons:
    echo   - Not enough disk space
    echo   - Antivirus blocking installation
    exit /b 1
)
set PYEXE=C:\Bakesale\python\python.exe
echo OK - Python installed successfully.

:pydone
echo.

:: ── Step 3: Node.js ───────────────────────────────────────────────────────────
echo [3/7] Checking Node.js...

if exist "C:\Bakesale\node\node.exe" (
    echo OK - Bakesale Node.js already installed, skipping...
    set NPMEXE=C:\Bakesale\node\npm.cmd
    goto :nodedone
)
if exist "C:\Program Files\nodejs\node.exe" (
    echo OK - System Node.js found, using existing...
    set NPMEXE=C:\Program Files\nodejs\npm.cmd
    goto :nodedone
)
where node >nul 2>&1
if %errorlevel% equ 0 (
    echo OK - Node.js found in PATH, using existing...
    set NPMEXE=npm
    goto :nodedone
)

echo Node.js not found. Installing Node.js 24.13.1...
msiexec /i "%~dp0node-v24.13.1-x64.msi" /quiet INSTALLDIR="C:\Bakesale\node" /norestart
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ERROR: Node.js installation failed!
    echo Common reasons:
    echo   - Not enough disk space
    echo   - Antivirus blocking installation
    exit /b 1
)
set NPMEXE=C:\Bakesale\node\npm.cmd
echo OK - Node.js installed successfully.

:nodedone
echo.

:: ── Step 4: Python Virtual Environment ───────────────────────────────────────
echo [4/7] Checking Python environment...
if exist "C:\Bakesale\venv\Scripts\activate.bat" (
    echo OK - Virtual environment exists. Updating packages...
    "C:\Bakesale\venv\Scripts\pip.exe" install -r "C:\Bakesale\backend\requirements.txt" --quiet
    if %errorlevel% neq 0 (
        color 0C
        echo ERROR: Could not update Python packages!
        exit /b 1
    )
) else (
    echo Creating virtual environment...
    "%PYEXE%" -m venv "C:\Bakesale\venv"
    if %errorlevel% neq 0 (
        color 0C
        echo ERROR: Could not create Python virtual environment!
        exit /b 1
    )
    echo Installing Python packages...
    "C:\Bakesale\venv\Scripts\pip.exe" install -r "C:\Bakesale\backend\requirements.txt" --quiet
    if %errorlevel% neq 0 (
        color 0C
        echo ERROR: Could not install Python packages!
        exit /b 1
    )
)
echo OK - Python environment ready.
echo.

:: ── Step 5: Database ──────────────────────────────────────────────────────────
echo [5/7] Checking database...
set PGPASSWORD=%PGPASS%

:: Use SQL query to check database existence - more reliable than parsing list
"%PGBIN%\psql.exe" -U postgres -c "SELECT datname FROM pg_database WHERE datname='bakesale';" | findstr /i "bakesale" >nul 2>&1
if %errorlevel% equ 0 (
    echo OK - Database already exists, skipping...
) else (
    echo Creating database...
    "%PGBIN%\psql.exe" -U postgres -c "CREATE DATABASE bakesale;"
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo ERROR: Could not create database!
        echo Common reasons:
        echo   - PostgreSQL service not started
        echo   - Wrong password entered
        exit /b 1
    )
    echo OK - Database created.
)
echo.

:: ── Step 6: Config and Migrations ────────────────────────────────────────────
echo [6/7] Configuring and running migrations...

:: Generate secret key using installed Python - done here AFTER Python is ready
for /f "delims=" %%i in ('"C:\Bakesale\venv\Scripts\python.exe" -c "import secrets; print(secrets.token_urlsafe(50))"') do set SECRET_KEY=%%i

:: Fallback if generation fails
if "%SECRET_KEY%"=="" (
    set SECRET_KEY=bakesale-default-secret-please-change-this-key-2024
)

:: Write .env file
(
echo SECRET_KEY=%SECRET_KEY%
echo DEBUG=False
echo USE_POSTGRES=True
echo DB_NAME=bakesale
echo DB_USER=postgres
echo DB_PASSWORD=%PGPASS%
echo DB_HOST=localhost
echo DB_PORT=5432
) > "C:\Bakesale\backend\.env"

:: Run migrations
cd /d "C:\Bakesale\backend"
"C:\Bakesale\venv\Scripts\python.exe" manage.py migrate
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Database migration failed!
    echo Please check that PostgreSQL is running and password is correct.
    exit /b 1
)

:: Create default admin user
echo Creating default admin user...
"C:\Bakesale\venv\Scripts\python.exe" manage.py create_default_admin
if %errorlevel% neq 0 (
    echo WARNING: Could not create default admin. You can create manually later.
) else (
    echo OK - Default admin ready.
)
echo OK - Database ready.
echo.

:: ── Step 7: Windows Service ───────────────────────────────────────────────────
echo [7/7] Checking Windows Service...

sc query BakesaleBackend >nul 2>&1
if %errorlevel% equ 0 (
    echo Service exists. Updating and restarting...
    net stop BakesaleBackend >nul 2>&1
    timeout /t 2 /nobreak >nul
    "%~dp0nssm.exe" set BakesaleBackend Application "C:\Bakesale\venv\Scripts\python.exe"
    "%~dp0nssm.exe" set BakesaleBackend AppParameters "-m waitress --host=0.0.0.0 --port=8000 bakesale.wsgi:application"
    "%~dp0nssm.exe" set BakesaleBackend AppDirectory "C:\Bakesale\backend"
) else (
    echo Registering service...
    "%~dp0nssm.exe" install BakesaleBackend "C:\Bakesale\venv\Scripts\python.exe" "-m waitress --host=0.0.0.0 --port=8000 bakesale.wsgi:application"
    "%~dp0nssm.exe" set BakesaleBackend AppDirectory "C:\Bakesale\backend"
    "%~dp0nssm.exe" set BakesaleBackend DisplayName "Bakesale POS Backend"
    "%~dp0nssm.exe" set BakesaleBackend Description "Bakesale POS Django Backend Server"
    "%~dp0nssm.exe" set BakesaleBackend Start SERVICE_AUTO_START
    "%~dp0nssm.exe" set BakesaleBackend AppStdout "C:\Bakesale\logs\service.log"
    "%~dp0nssm.exe" set BakesaleBackend AppStderr "C:\Bakesale\logs\error.log"
)

:: Add firewall rule if not exists
netsh advfirewall firewall show rule name="Bakesale POS" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="Bakesale POS" dir=in action=allow protocol=TCP localport=8000
)

:: Start the service
net start BakesaleBackend
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ERROR: Could not start Bakesale service!
    echo Try restarting the PC. Service will auto-start on boot.
    exit /b 1
)
echo OK - Service registered and started.
echo.

color 0A
echo =====================================================
echo   Setup Complete!
echo =====================================================
exit /b 0