@echo off
echo =================================
echo    DIG Node Windows Installer    
echo =================================
echo.
echo This will install DIG Node CLI with Windows service support.
echo You need to run this as Administrator.
echo.
pause

REM Check if PowerShell is available
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: PowerShell is not available
    echo Please ensure PowerShell is installed
    pause
    exit /b 1
)

REM Run the PowerShell installer
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"

pause