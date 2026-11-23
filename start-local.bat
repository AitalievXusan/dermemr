@echo off
chcp 65001 >nul
title DermEMR (port 3456)
cd /d "%~dp0"

rem Старое окно DermEMR могло остаться открытым: тогда на 3456 отвечает прежняя версия сервера.
rem Останавливаем только процессы node.exe, которые слушают порты 3456-3460.
echo  Проверяю, не запущен ли DermEMR в другом окне...
for %%P in (3456 3457 3458 3459 3460) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /c:":%%P " ^| findstr LISTENING') do (
    taskkill /F /PID %%I /FI "IMAGENAME eq node.exe" >nul 2>nul
  )
)

echo  Сборка приложения...
call npm run build
if errorlevel 1 (echo  Ошибка сборки. & pause & exit /b 1)
set PORT=3456
node server\dist\server.mjs
pause
