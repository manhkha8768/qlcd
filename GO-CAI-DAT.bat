@echo off
chcp 65001 >nul
title Go che do tu chay QLCD
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"

echo ========================================================
echo   GO CHE DO TU CHAY
echo ========================================================
echo.
echo Thao tac nay chi go che do tu khoi dong va dong cong
echo tuong lua. DU LIEU KHONG BI XOA.
echo.
echo File du lieu db\qlcd.db va thu muc uploads van con nguyen.
echo.
set /p XN=Go che do tu chay? (go chu CO roi Enter): 
if /I not "%XN%"=="CO" (
    echo Da huy.
    pause
    exit /b
)

call pm2 delete qlcd >nul 2>&1
call pm2 save >nul 2>&1
netsh advfirewall firewall delete rule name="QLCD" >nul 2>&1
echo.
echo Da go xong. Du lieu van con trong thu muc nay.
echo Muon chay lai: bam dup CHAY.bat
pause
