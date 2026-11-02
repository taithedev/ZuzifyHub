@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js 20+ first. & pause & exit /b 1)
where cargo >nul 2>nul || (echo Install Rust from https://rustup.rs/ and restart terminal. & pause & exit /b 1)
if not exist node_modules (call npm install || (pause & exit /b 1))
echo Building Windows installer (NSIS)...
call npm run desktop:build
if errorlevel 1 (echo Build failed. Read error output above. & pause & exit /b 1)
echo Installer output: src-tauri\target\release\bundle\nsis\
pause
