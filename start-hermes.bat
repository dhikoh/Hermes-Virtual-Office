@echo off
title Hermes Virtual Office
color 0b
cd /d "%~dp0"

echo =========================================================
echo       MENJALANKAN HERMES VIRTUAL OFFICE (LOCAL)
echo =========================================================
echo.
echo Direktori : %CD%
echo URL        : http://localhost:3000/office
echo Adapter    : ws://localhost:18789
echo.
echo Menjalankan server dan adapter... Browser akan terbuka otomatis.
echo Tekan Ctrl+C untuk menghentikan server jika selesai.
echo =========================================================
echo.

node server/start-stack.js --dev --open

pause
