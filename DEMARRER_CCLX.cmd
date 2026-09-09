@echo off
setlocal
title CCLX Economic Lab
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installez Node.js 20 ou superieur puis relancez.
  pause
  exit /b 1
)
set "CCLX_ROOT=%~dp0dist"
set "HOST=127.0.0.1"
set "PORT=0"
set "CCLX_OPEN_BROWSER=1"
node "%~dp0server.mjs"
if errorlevel 1 pause
popd
endlocal
