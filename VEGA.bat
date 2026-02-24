@echo off
chcp 65001 >nul 2>&1
title VegaMCP Server Manager
color 0A

echo.
echo  â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
echo  â•‘         VegaMCP Server Manager           â•‘
echo  â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£
echo  â•‘                                          â•‘
echo  â•‘   [1]  Build + Test                      â•‘
echo  â•‘   [2]  Build Only                        â•‘
echo  â•‘   [3]  Run Tests Only                    â•‘
echo  â•‘   [4]  Start Server (manual/debug)       â•‘
echo  â•‘   [5]  Clean Build                       â•‘
echo  â•‘   [6]  Install Dependencies              â•‘
echo  â•‘   [7]  Open in VS Code                   â•‘
echo  â•‘   [8]  Exit                              â•‘
echo  â•‘                                          â•‘
echo  â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
echo.

set /p choice="  Select option: "

if "%choice%"=="1" goto buildtest
if "%choice%"=="2" goto build
if "%choice%"=="3" goto test
if "%choice%"=="4" goto start
if "%choice%"=="5" goto clean
if "%choice%"=="6" goto install
if "%choice%"=="7" goto vscode
if "%choice%"=="8" exit

echo  Invalid option.
timeout /t 2 >nul
goto :eof

:buildtest
echo.
echo  [1/2] Building TypeScript...
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
    echo.
    echo  BUILD FAILED! Fix errors above and try again.
    pause
    goto :eof
)
echo  Build successful!
echo.
echo  [2/2] Running integration tests...
node test-server.mjs
echo.
pause
goto :eof

:build
echo.
echo  Building TypeScript...
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
    echo  BUILD FAILED!
) else (
    echo  Build successful! Server ready at build/index.js
)
echo.
pause
goto :eof

:test
echo.
echo  Running integration tests...
cd /d "%~dp0"
node test-server.mjs
echo.
pause
goto :eof

:start
echo.
echo  Starting VegaMCP server in manual/debug mode...
echo  (This runs in stdio mode - use Ctrl+C to stop)
echo  NOTE: Normally Antigravity starts this automatically.
echo.
cd /d "%~dp0"
node build/index.js
pause
goto :eof

:clean
echo.
echo  Cleaning build directory...
cd /d "%~dp0"
if exist build rmdir /s /q build
echo  Cleaned! Run Build to recompile.
echo.
pause
goto :eof

:install
echo.
echo  Installing dependencies...
cd /d "%~dp0"
call npm install
echo.
echo  Done!
pause
goto :eof

:vscode
echo.
echo  Opening VegaMCP in VS Code...
code "%~dp0"
goto :eof
