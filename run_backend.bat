@echo off
title Agent-Guru Backend Server (Port 8080)
cd /d "C:\Users\qorrb\OneDrive\Desktop\git hub\my_stock_llm_wiki_chat_web\backend"
:loop
echo [%time%] Starting Backend Server in virtual environment...
"C:\Users\qorrb\OneDrive\Desktop\git hub\my_stock_llm_wiki_chat\.venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8080 --reload
echo [%time%] Backend server crashed or stopped. Restarting in 3 seconds...
timeout /t 3
goto loop
