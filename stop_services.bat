@echo off
title Stop Agent-Guru Services
echo Stopping any running services on port 8080, 5173, and 8000...
powershell -NoProfile -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue"
powershell -NoProfile -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue"
powershell -NoProfile -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue"
taskkill /F /IM LemonadeServer.exe /T >nul 2>&1
echo Services stopped successfully.
timeout /t 3
