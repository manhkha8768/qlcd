@echo off
chcp 65001 >nul
title Sao luu du lieu QLCD
cd /d "%~dp0"

set DICH=%~1
if "%DICH%"=="" set DICH=%~dp0sao-luu

echo ========================================================
echo   SAO LUU DU LIEU HE THONG QLCD
echo ========================================================
echo.
echo Sao luu vao: %DICH%
echo.
call node scripts\sao-luu.js "%DICH%"
echo.
echo LUU Y: Moi tuan nho chep mot ban sao luu ra USB hoac
echo may khac. Sao luu nam cung may chu thi may hong la
echo mat ca hai.
echo.
pause
