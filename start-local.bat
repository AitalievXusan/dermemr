@echo off
chcp 65001 >nul
title DermEMR (port 3456)
cd /d "%~dp0"
echo  Сборка приложения...
call npm run build
if errorlevel 1 (echo  Ошибка сборки. & pause & exit /b 1)
set PORT=3456
node server\dist\server.mjs
pause
