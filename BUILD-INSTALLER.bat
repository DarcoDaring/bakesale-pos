@echo off
title Bakesale POS - Build Installer
color 0E
cls

echo.
echo  =====================================================
echo   BAKESALE POS - BUILD .EXE INSTALLER
echo   This creates a proper setup .exe you can share.
echo   Takes about 5-10 minutes.
echo  =====================================================
echo.

cd /d "%~dp0"

echo  Step 1: Building frontend...
cd frontend
call npm run build
cd ..
echo  Done.
echo.

echo  Step 2: Building Windows installer...
call npx electron-builder --win --x64
echo.

echo  =====================================================
echo   BUILD COMPLETE!
echo   Your installer is in the 'dist' folder:
echo   dist\Bakesale POS Setup 1.0.0.exe
echo  =====================================================
echo.
pause
