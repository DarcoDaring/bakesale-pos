@echo off
title Bakesale Frontend Setup
color 0A
cls

echo.
echo ================================
echo   Bakesale Frontend Setup
echo ================================
echo.
echo This installs frontend dependencies.
echo Only needs to be run ONCE.
echo Takes about 2-3 minutes...
echo.

cd /d "C:\Bakesale\frontend"
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Frontend folder not found at C:\Bakesale\frontend
    pause
    exit /b 1
)

echo Installing frontend dependencies...
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo Installing root packages...
cd /d "C:\Bakesale"
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Root npm install failed!
    pause
    exit /b 1
)

color 0A
echo.
echo ================================
echo   Frontend Setup Complete!
echo   You can now run BUILD-INSTALLER.bat
echo   to build the client EXE anytime.
echo ================================
echo.
pause