@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\server.ps1" -Action start
pause
