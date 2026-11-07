@echo off
setlocal
rem pushd handles spaces, other drives and UNC shares; popd releases its mapping.
pushd "%~dp0.."
if errorlevel 1 exit /b 1
call npm.cmd run dev
set "result=%errorlevel%"
popd
exit /b %result%