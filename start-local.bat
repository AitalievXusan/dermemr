@echo off
chcp 65001 >nul
title DermEMR (port 3456)
cd /d "%~dp0"

rem Старое окно DermEMR могло остаться открытым: тогда на 3456 отвечает прежняя версия сервера.
rem Останавливаем только процессы node.exe, которые слушают порты 3456-3460.
rem (PowerShell, а не netstat: в русской Windows netstat пишет «СЛУШАЕТ» вместо LISTENING)
echo  Проверяю, не запущен ли DermEMR в другом окне...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -State Listen -LocalPort 3456,3457,3458,3459,3460 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force; Write-Host ('  old DermEMR server stopped, PID ' + $p.Id) } }"

echo  Сборка приложения...
call npm run build
if errorlevel 1 (echo  Ошибка сборки. & pause & exit /b 1)
set PORT=3456
node server\dist\server.mjs
pause
