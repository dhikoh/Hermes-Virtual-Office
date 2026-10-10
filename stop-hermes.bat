@echo off
title Hentikan Hermes Virtual Office
color 0c
cd /d "%~dp0"

echo =========================================================
echo       MENGHENTIKAN HERMES VIRTUAL OFFICE (LOCAL)
echo =========================================================
echo.
echo Mencari dan menghentikan proses Hermes Virtual Office...

powershell -NoProfile -Command "$n = 0; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'hermes-gateway-adapter\.js|server[\\/]index\.js|start-stack\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }; if ($n -eq 0) { Write-Host 'Tidak ada proses Hermes yang berjalan.' -ForegroundColor Yellow } else { Write-Host ('Berhasil! Dihentikan ' + $n + ' proses Hermes Virtual Office.') -ForegroundColor Green }"

echo.
pause
