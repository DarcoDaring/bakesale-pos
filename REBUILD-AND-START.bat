@echo off
title Bakesale - Rebuilding...
color 0E
cls

echo.
echo  Rebuilding Bakesale frontend...
echo  (This takes about 1 minute)
echo.

cd /d "D:\Bakesale App\bakesale_complete\frontend"
npm run build

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  Build FAILED. Check errors above.
    pause
    exit /b 1
)

color 0A
echo.
echo  Build successful! Launching app...
echo.
timeout /t 2 /nobreak >nul

cd /d "D:\Bakesale App\bakesale_complete"
npx electron .
