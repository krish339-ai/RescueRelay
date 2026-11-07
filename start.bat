@echo off
setlocal
rem Resolve the helper from this file, regardless of the current drive/directory.
powershell.exe -NoLogo -NoProfile -File "%~dp0scripts\dev.ps1" -Action start
set "result=%errorlevel%"
if not "%result%"=="0" (
  echo.
  echo RescueRelay start failed. Review the message above.
  echo If PowerShell policy blocks this script, use the documented npm commands.
  if not defined RESCUERELAY_NONINTERACTIVE pause
)
exit /b %result%
