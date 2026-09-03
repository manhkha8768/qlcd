@echo off
chcp 65001 >nul
title Dat lai mat khau admin
cd /d "%~dp0"

echo ========================================================
echo   DAT LAI MAT KHAU TAI KHOAN ADMIN
echo ========================================================
echo.
echo Dung khi quen mat khau admin hoac bi khoa do dang nhap sai.
echo.
set /p MK=Nhap mat khau moi (8-128 ky tu, de trong = admin123):
if "%MK%"=="" set MK=admin123
echo.
call node scripts\dat-lai-mat-khau.js "%MK%"
pause
