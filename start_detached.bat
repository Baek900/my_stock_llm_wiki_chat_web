@echo off
title Start Detached Agent-Guru Services
cd /d "%~dp0"
"C:\Users\qorrb\OneDrive\Desktop\git hub\my_stock_llm_wiki_chat\.venv\Scripts\python.exe" spawn_services_detached.py
