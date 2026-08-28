@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title He thong QLCD - Che do INTERNET
cd /d "%~dp0"

echo ========================================================
echo   CHAY O CHE DO INTERNET
echo ========================================================
echo.

REM ---------- Sinh khoa bi mat, chi lam mot lan ----------
if not exist "khoa-bi-mat.txt" (
    echo Dang sinh khoa bi mat ky phien dang nhap...
    node -e "const f=require('fs');f.writeFileSync('khoa-bi-mat.txt',require('crypto').randomBytes(48).toString('hex'));process.exit(0)"
    if exist "khoa-bi-mat.txt" (
        echo    Da tao file khoa-bi-mat.txt
        echo    KHONG gui file nay cho ai, khong dua len mang.
    ) else (
        echo [LOI] Khong tao duoc khoa bi mat.
        pause
        exit /b 1
    )
    echo.
)

set /p QLCD_SECRET=<khoa-bi-mat.txt
set QLCD_INTERNET=1
set NODE_ENV=production

echo Che do:  INTERNET
echo   - Ep HTTPS
echo   - Cookie chi gui qua HTTPS
echo   - Khoa tam khi dang nhap sai 5 lan
echo   - Mat khau toi thieu 8 ky tu
echo.
echo He thong se TU CHOI chay neu tai khoan admin
echo van dung mat khau khoi tao admin123.
echo.
echo DUNG DONG cua so nay.
echo ========================================================
echo.

call npm start
echo.
echo He thong da dung. Nhan phim bat ky de dong.
pause >nul
