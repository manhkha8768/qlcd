@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Cai dat He thong Quan ly Thiet bi Co dien - Van tai

REM Tu xin quyen quan tri de mo duoc tuong lua
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Dang xin quyen quan tri de mo cong tuong lua...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

cls
echo ========================================================
echo   HE THONG QUAN LY THIET BI CO DIEN - VAN TAI
echo   Cong ty Xay lap Mo - TKV
echo   CAI DAT TU DONG
echo ========================================================
echo.

REM ---------- Kiem tra duong dan ----------
REM Dung PowerShell vi findstr khong doc duoc ky tu Unicode.
REM Neu PowerShell loi thi bo qua buoc kiem tra, khong chan nguoi dung.
set DUONGDAN_XAU=0
for /f %%r in ('powershell -NoProfile -Command "if ('%~dp0' -match '[^\u0020-\u007E]') {1} else {0}" 2^>nul') do set DUONGDAN_XAU=%%r
if "%DUONGDAN_XAU%"=="1" (
    echo [LOI] Duong dan chua dau tieng Viet hoac ky tu dac biet:
    echo       %~dp0
    echo.
    echo Hay chuyen thu muc nay sang cho don gian, vi du D:\qlcd
    echo roi chay lai file nay.
    pause
    exit /b 1
)
echo %~dp0| find " " >nul
if %errorlevel% equ 0 (
    echo [LOI] Duong dan chua dau cach:
    echo       %~dp0
    echo.
    echo Hay chuyen thu muc nay sang D:\qlcd roi chay lai.
    pause
    exit /b 1
)

REM ---------- Buoc 1: Kiem tra Node.js ----------
echo [1/6] Kiem tra Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Chua cai Node.js.
    echo.
    echo Hay lam theo cac buoc sau:
    echo   1. Vao trang https://nodejs.org
    echo   2. Tai ban LTS ^(nut ben trai^)
    echo   3. Cai dat, bam Next het
    echo   4. DONG cua so nay va chay lai CAI-DAT.bat
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo       Da co Node.js !NODEVER!
echo.

REM ---------- Buoc 2: Cai thu vien ----------
echo [2/6] Cai thu vien... ^(mat 2-5 phut, can internet^)
if exist "node_modules\better-sqlite3" (
    echo       Da co san, bo qua.
) else (
    call npm install --no-audit --no-fund
    if !errorlevel! neq 0 (
        echo.
        echo [LOI] Cai thu vien that bai.
        echo Kiem tra may co ket noi internet khong roi chay lai.
        pause
        exit /b 1
    )
    echo       Xong.
)
echo.

REM ---------- Buoc 3: Tao co so du lieu ----------
echo [3/6] Tao co so du lieu...
if exist "db\qlcd.db" (
    echo       Da co san, giu nguyen du lieu cu.
) else (
    call node db\init.js
    REM Khong tin ma thoat: tren mot so may Node bao loi luc dong tien trinh
    REM du du lieu da ghi xong. Kiem tra file that su co ton tai hay khong.
    if exist "db\qlcd.db" (
        echo       Xong.
    ) else (
        echo.
        echo [LOI] Khong tao duoc co so du lieu.
        echo Hay chup man hinh nay gui cho nguoi phat trien.
        pause
        exit /b 1
    )
)
echo.

REM ---------- Buoc 4: Mo cong tuong lua ----------
echo [4/6] Mo cong 3000 tren tuong lua...
netsh advfirewall firewall delete rule name="QLCD" >nul 2>&1
netsh advfirewall firewall add rule name="QLCD" dir=in action=allow protocol=TCP localport=3000 >nul
if %errorlevel% equ 0 (
    echo       Xong. May khac trong cong ty vao duoc.
) else (
    echo       [CANH BAO] Khong mo duoc tuong lua. May khac co the khong vao duoc.
)
echo.

REM ---------- Buoc 5: Chay tu dong khi bat may ----------
echo [5/6] Cai che do tu chay khi bat may...
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    call npm install -g pm2 pm2-windows-startup --no-audit --no-fund >nul 2>&1
)
where pm2 >nul 2>&1
if %errorlevel% equ 0 (
    call pm2-startup install >nul 2>&1
    call pm2 delete qlcd >nul 2>&1
    call pm2 start server.js --name qlcd >nul 2>&1
    call pm2 save >nul 2>&1
    echo       Xong. He thong se tu chay moi khi bat may.
    set TUCHAY=1
) else (
    echo       [BO QUA] Khong cai duoc pm2. Dung CHAY.bat de khoi dong thu cong.
    set TUCHAY=0
)
echo.

REM ---------- Buoc 6: Tim dia chi may ----------
echo [6/6] Tim dia chi may chu...
set IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    if not defined IP set IP=%%a
)
set IP=!IP: =!

echo.
echo ========================================================
echo   CAI DAT XONG
echo ========================================================
echo.
echo   Tren may nay:      http://localhost:3000
if defined IP echo   May khac trong cong ty: http://!IP!:3000
echo.
echo   Tai khoan:  admin
echo   Mat khau:   admin123
echo.
echo   He thong se BAT BUOC doi mat khau ngay lan dau
echo   dang nhap. Day la chu y, khong phai loi.
echo.
if "!TUCHAY!"=="0" echo   LUU Y: Phai chay CHAY.bat moi khi bat may.
echo.
echo ========================================================
echo.
echo Nhan phim bat ky de mo trinh duyet...
pause >nul
start http://localhost:3000

if "!TUCHAY!"=="0" (
    echo.
    echo Dang khoi dong he thong. DUNG DONG cua so nay.
    call npm start
)
