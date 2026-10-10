@echo off
title Hentikan Hermes Virtual Office
color 0c
cd /d "%~dp0"

echo =========================================================
echo       MENGHENTIKAN HERMES VIRTUAL OFFICE (LOCAL)
echo =========================================================
echo.
echo Mencari dan menghentikan proses di Port 3000 dan 18789...

powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000, 18789 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo.
echo Berhasil! Semua proses server Hermes Virtual Office telah dihentikan.
echo.
pause
