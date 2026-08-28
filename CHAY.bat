@echo off
chcp 65001 >nul
title He thong QLCD - Dang chay
cd /d "%~dp0"

if not exist "node_modules" (
    echo [LOI] Chua cai dat. Hay chay CAI-DAT.bat truoc.
    pause
    exit /b 1
)
if not exist "db\qlcd.db" (
    echo [LOI] Chua co co so du lieu. Hay chay CAI-DAT.bat truoc.
    pause
    exit /b 1
)

set IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    if not defined IP set IP=%%a
)
set IP=%IP: =%

cls
echo ========================================================
echo   HE THONG QUAN LY THIET BI CO DIEN - VAN TAI
echo ========================================================
echo.
echo   Tren may nay:  http://localhost:3000
if defined IP echo   May khac:      http://%IP%:3000
echo.
echo   DUNG DONG cua so nay. Dong la he thong tat.
echo   Muon tat han: bam Ctrl+C roi dong cua so.
echo.
echo ========================================================
echo.
call npm start
pause
