@echo off
setlocal
cd /d "%~dp0"
node scripts/export-review.ts
if errorlevel 1 exit /b %errorlevel%
echo.
echo Granskningspaketet finns i exports. Inget har laddats upp.
