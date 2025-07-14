@echo off
echo ============================================
echo Starting FoodXchange Backend Services
echo ============================================
echo.

echo [1/2] Starting Redis Server...
start "Redis Server" cmd /c "\"C:\Program Files\Redis\redis-server.exe\""
timeout /t 2 /nobreak > nul

echo [2/2] Starting FoodXchange Backend...
echo.
npm run dev

pause