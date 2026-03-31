@echo off
title AG-Bot Dashboard Server (v2.5)

echo ==========================================
echo Starting AG-Bot System (v2.5)
echo ==========================================
echo.

echo [1/3] Starting Backend Server (Port 3000)...
start /b cmd /c "node server.cjs > nul 2>&1"

echo [2/3] Starting Dashboard Server (Port 5173)...
start /b cmd /c "npm run dev > nul 2>&1"

echo [3/3] Waiting 5 seconds...
timeout /t 5 /nobreak > nul

echo [DONE] Opening browser: http://localhost:5173/
start http://localhost:5173/

echo.
echo ==========================================
echo AG-Bot System is RUNNING.
echo.
echo [ WARNING! ] 
echo Please KEEP THIS WINDOW OPEN.
echo Closing this window will stop the AG-Bot! 
echo ==========================================
pause > nul
