@echo off
echo =====================================================
echo  AI Tutor - Competitive Exam Preparation Platform
echo =====================================================
echo.

REM ── Create required directories ─────────────────────
if not exist "d:\AI Tutor\data\db"  mkdir "d:\AI Tutor\data\db"
if not exist "d:\AI Tutor\data\log" mkdir "d:\AI Tutor\data\log"

REM ── Kill any stale mongod instance ──────────────────
taskkill /IM mongod.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting MongoDB (local)...
start "" "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" ^
  --dbpath "d:\AI Tutor\data\db" ^
  --logpath "d:\AI Tutor\data\log\mongod.log" ^
  --logappend ^
  --port 27017 ^
  --bind_ip 127.0.0.1 ^
  --quiet

echo Waiting for MongoDB to be ready...
timeout /t 6 /nobreak >nul

REM ── Verify mongod is listening ───────────────────────
netstat -an | findstr "127.0.0.1:27017" >nul
if errorlevel 1 (
  echo ERROR: MongoDB failed to start. Check d:\AI Tutor\data\log\mongod.log
  pause
  exit /b 1
)
echo MongoDB is ready on port 27017.
echo.

echo Starting Backend API (port 5000)...
start "AI Tutor Backend" cmd /k "cd /d d:\AI Tutor\backend && node src/server.js"

echo Starting Frontend (port 5173)...
start "AI Tutor Frontend" cmd /k "cd /d d:\AI Tutor\frontend && npm run dev"

echo.
echo =====================================================
echo  Services starting...
echo.
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:5000
echo  API Health: http://localhost:5000/api/health
echo.
echo  Default admin: admin@aitutor.com / Admin@1234
echo  (Run 'npm run seed' in backend/ to populate data)
echo =====================================================
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"
