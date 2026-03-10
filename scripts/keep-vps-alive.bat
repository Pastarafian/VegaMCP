@echo off
:: ═════════════════════════════════════════════════════════════
:: VegaMCP: VPS Keep-Alive & Unlocked Disconnect
:: Run this to disconnect from RDP WITHOUT locking the screen.
:: Crucial for 100% uptime of GUI-dependent tasks (Antigravity).
:: ═════════════════════════════════════════════════════════════

echo Requesting Administrator Privileges...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Failure: Please right-click and Run as Administrator.
    pause
    exit /b
)

echo [VegaMCP] Rerouting %SESSIONNAME% to Console...
for /f "skip=1 tokens=3" %%s in ('query user %USERNAME%') do (
  %windir%\System32\tscon.exe %%s /dest:console
)

:: If that fails, standard session 1 or 2
%windir%\System32\tscon.exe 1 /dest:console >nul 2>&1
%windir%\System32\tscon.exe 2 /dest:console >nul 2>&1

echo [VegaMCP] Session disconnected successfully. GUI will remain unlocked.
