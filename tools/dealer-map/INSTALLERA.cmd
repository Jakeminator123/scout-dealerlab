@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 goto folder_error

echo Scout Dealer Map - installation
echo.
if not exist "requirements.txt" goto missing_files
if exist ".venv\Scripts\python.exe" goto install_packages

py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1
if not errorlevel 1 goto create_with_py
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1
if not errorlevel 1 goto create_with_python
echo Python 3.11 eller senare saknas.
echo Installera Python for ditt anvandarkonto fran https://www.python.org/downloads/windows/
echo Kor sedan den har filen igen. Administrator behovs inte.
goto failure

:create_with_py
py -3 -m venv ".venv"
if errorlevel 1 goto failure
goto install_packages

:create_with_python
python -m venv ".venv"
if errorlevel 1 goto failure

:install_packages
".venv\Scripts\python.exe" -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if errorlevel 1 goto old_environment
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r "requirements.txt"
if errorlevel 1 goto failure
echo.
echo Klart. Starta programmet med STARTA-KARTA.cmd.
popd
pause
exit /b 0

:old_environment
echo Den befintliga .venv anvander en for gammal Pythonversion.
echo Byt namn pa .venv, installera Python 3.11 eller senare och kor igen.
goto failure

:missing_files
echo requirements.txt saknas. Packa upp hela programpaketet i en egen mapp.
goto failure

:folder_error
echo Programmets mapp kunde inte oppnas.
pause
exit /b 1

:failure
echo.
echo Installationen blev inte klar. Felmeddelandet ovan visar orsaken.
popd
pause
exit /b 1
