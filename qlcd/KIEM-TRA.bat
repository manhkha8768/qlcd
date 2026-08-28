@echo off
chcp 65001 >nul
title Kiem tra he thong QLCD
cd /d "%~dp0"

echo ========================================================
echo   KIEM TRA HE THONG
echo   Chay 447 phep thu, mat khoang 2-3 phut
echo ========================================================
echo.
call npm test
echo.
echo ========================================================
echo Ket qua mong doi: tat ca deu "0 truot".
echo Neu co phep thu nao TRUOT, dung dua vao su dung,
echo gui phan bao loi cho nguoi phat trien.
echo ========================================================
pause
