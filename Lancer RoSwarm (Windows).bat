@echo off
chcp 65001 >nul
title RoSwarm
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe.
  echo  Telecharge la version LTS sur https://nodejs.org puis relance ce fichier.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Premiere installation, patiente une minute...
  call npm install --omit=dev
  if errorlevel 1 (
    echo L'installation a echoue.
    pause
    exit /b 1
  )
)
node server\index.js
pause
