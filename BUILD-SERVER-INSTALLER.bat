@echo off
title Build Bakesale Server Installer
color 0E
cls

echo.
echo =====================================================
echo   BUILD BAKESALE SERVER INSTALLER
echo =====================================================
echo.

:: Find makensis
set MAKENSIS=""
if exist "C:\Program Files (x86)\NSIS\makensis.exe" set MAKENSIS="C:\Program Files (x86)\NSIS\makensis.exe"
if exist "C:\Program Files\NSIS\makensis.exe" set MAKENSIS="C:\Program Files\NSIS\makensis.exe"

if %MAKENSIS%=="" (
    color 0C
    echo ERROR: NSIS not found!
    echo Install from https://nsis.sourceforge.io/Download
    pause && exit /b 1
)

if not exist "installer\redist\python-3.11.9-installer.exe" (
    color 0C && echo ERROR: Python installer missing from installer\redist\ && pause && exit /b 1
)
if not exist "installer\redist\node-v24.13.1-x64.msi" (
    color 0C && echo ERROR: Node.js installer missing from installer\redist\ && pause && exit /b 1
)
if not exist "installer\redist\postgresql-18-installer.exe" (
    color 0C && echo ERROR: PostgreSQL installer missing from installer\redist\ && pause && exit /b 1
)
if not exist "installer\redist\nssm.exe" (
    color 0C && echo ERROR: NSSM missing from installer\redist\ && pause && exit /b 1
)

if not exist "dist" mkdir dist

echo All checks passed! Building...
echo.

%MAKENSIS% installer\server-setup.nsi
if %errorlevel% neq 0 (
    color 0C && echo ERROR: Build failed! && pause && exit /b 1
)

color 0A
echo.
echo =====================================================
echo   BUILD COMPLETE!
echo   dist\Bakesale-Server-Setup.exe
echo =====================================================
echo.
pause