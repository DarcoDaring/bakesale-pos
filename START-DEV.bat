@echo off
title Bakesale POS - Developer Mode
color 0B
cls

echo.
echo  =====================================================
echo   BAKESALE POS - DEVELOPER MODE
echo   Code changes apply instantly. 
echo   Close this window to stop everything.
echo  =====================================================
echo.

cd /d "%~dp0backend"
call venv\Scripts\activate.bat
cd /d "%~dp0"

:: Run Django + React dev server + Electron all together
npx concurrently ^
  "cd backend && venv\Scripts\python manage.py runserver 0.0.0.0:8000" ^
  "cd frontend && npm start" ^
  "npx wait-on http://localhost:3000 && set NODE_ENV=development && npx electron ."

pause
