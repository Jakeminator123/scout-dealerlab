@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 goto folder_error
if not exist ".venv\Scripts\python.exe" goto not_installed
if not exist "dealer_map.py" goto missing_files
".venv\Scripts\python.exe" "dealer_map.py" %*
if errorlevel 1 goto failed
popd
exit /b 0

:not_installed
echo Kor INSTALLERA.cmd forst.
goto failed

:missing_files
echo dealer_map.py saknas. Packa upp hela programpaketet i en egen mapp.
goto failed

:folder_error
echo Programmets mapp kunde inte oppnas.
pause
exit /b 1

:failed
echo.
echo Programmet kunde inte avslutas normalt. Las felmeddelandet ovan.
popd
pause
exit /b 1
