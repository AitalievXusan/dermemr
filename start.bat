@echo off
chcp 65001 >nul
title DermEMR
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Не найден Node.js. Установите версию LTS с https://nodejs.org и запустите start.bat снова.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo  [1/3] Установка зависимостей ^(только при первом запуске, 1-3 минуты^)...
  call npm install
  if errorlevel 1 goto fail
)

echo.
echo  [2/3] Сборка приложения...
call npm run build
if errorlevel 1 goto fail

if not exist ".env" copy ".env.example" ".env" >nul

echo.
echo  [3/3] Запуск сервера. Браузер откроется автоматически: http://localhost:3000
echo  Чтобы остановить сервер, закройте это окно или нажмите Ctrl+C.
echo.
node server\dist\server.mjs
pause
exit /b 0

:fail
echo.
echo  Ошибка. Проверьте подключение к интернету ^(нужно для npm install^) и запустите start.bat снова.
pause
exit /b 1
