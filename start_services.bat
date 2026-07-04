@echo off
title Agent-Guru Service Manager

:: Change directory to the folder containing this batch file
cd /d "%~dp0"

echo ========================================================
echo  Agent-Guru Services Launcher (Auto-Restart Watchdog)
echo ========================================================
echo.

:: 1. Start Backend in a new window with auto-restart loop
echo [BACKEND] Starting Backend Server (Port 8080) in a new terminal...
start "Agent-Guru Backend Server" cmd /c "cd backend && :loop && echo Starting Backend... && \"C:\Users\qorrb\OneDrive\Desktop\git hub\my_stock_llm_wiki_chat\.venv\Scripts\python.exe\" -m uvicorn main:app --host 127.0.0.1 --port 8080 --reload && echo Backend stopped. Restarting... && goto loop"

:: 2. Start Frontend in a new window with auto-restart loop
echo [FRONTEND] Starting Frontend Server (Port 5173) in a new terminal...
start "Agent-Guru Frontend Server" cmd /c "cd frontend && :loop && echo Starting Frontend... && npm run dev && echo Frontend stopped. Restarting... && goto loop"

echo.
echo ========================================================
echo  All services have been started in separate CMD windows.
echo  - Backend: http://127.0.0.1:8080
echo  - Frontend: http://localhost:5173
echo.
echo  * Each service will auto-restart if it crashes.
echo  * To stop all services, run stop_services.bat.
echo ========================================================
echo.
pause
