@echo off
title Agent-Guru Frontend Server (Port 5173)
cd /d "C:\Users\qorrb\OneDrive\Desktop\git hub\my_stock_llm_wiki_chat\frontend"
:loop
echo [%time%] Starting Frontend Server...
npm run dev
echo [%time%] Frontend server crashed or stopped. Restarting in 3 seconds...
timeout /t 3
goto loop
