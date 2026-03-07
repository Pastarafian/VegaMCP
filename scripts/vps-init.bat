<# :
@echo off
:: ==============================================================================
:: VegaMCP VPS Initialization Script
:: RUN AS ADMINISTRATOR
:: ==============================================================================
TITLE VegaMCP VPS Setup
echo =======================================================
echo   VegaMCP VPS Setup - SSH, VNC, and Workspace Config
echo =======================================================
echo.
echo Initializing Setup... Please wait.

:: Set log file directly on the Desktop
set "LOGFILE=%USERPROFILE%\Desktop\VegaMCP_VPS_Setup.log"
echo [%date% %time%] Starting VegaMCP Setup > "%LOGFILE%"

:: Run the embedded PowerShell below
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression $([System.IO.File]::ReadAllText('%~f0'))" >> "%LOGFILE%" 2>&1

echo.
echo =======================================================
echo   Setup has finished!
echo   Check the log file for details: 
echo   %LOGFILE%
echo =======================================================
echo.
pause
goto :eof
#>

# ==============================================================================
# POWERSHELL PAYLOAD STARTS HERE (It reads everything below)
# ==============================================================================
$ErrorActionPreference = 'Continue'
Write-Output ""
Write-Output ">>> POWERSHELL EXECUTION STARTED: $(Get-Date) <<<"
Write-Output "================================================================"

function Log {
    param([string]$Message)
    Write-Output "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] $Message"
    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] $Message" -ForegroundColor Cyan
}

try {
    # ─── 1. OpenSSH Server ───
    Log "Step 1/4: Installing OpenSSH Server..."
    $sshCapability = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
    if ($sshCapability.State -ne 'Installed') {
        Log "   -> Downloading and adding OpenSSH Capability..."
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    } else {
        Log "   -> OpenSSH Server is already installed."
    }

    Log "   -> Starting sshd service and setting to Automatic..."
    Start-Service sshd -ErrorAction SilentlyContinue
    Set-Service -Name sshd -StartupType Automatic -ErrorAction SilentlyContinue

    Log "   -> Setting PowerShell as the default SSH shell..."
    New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force | Out-Null

    Log "   -> Configuring Windows Firewall for Port 22..."
    New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (TCP)' -Direction Inbound -LocalPort 22 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
  
    Log "[OK] OpenSSH setup completed successfully."


    # ─── 2. TightVNC Server ───
    Log "`nStep 2/4: Installing TightVNC Server (GUI Automation)..."
    $vncUrl = 'https://tightvnc.com/download/2.8.85/tvnc64-2.8.85-gpl-setup.msi'
    $vncMsi = "$env:TEMP\tvnc.msi"
    
    Log "   -> Downloading TightVNC from $vncUrl to $vncMsi..."
    Invoke-WebRequest -Uri $vncUrl -OutFile $vncMsi -UseBasicParsing
    
    Log "   -> Executing MSI installer silently..."
    $vncArgs = '/i', $vncMsi, '/quiet', '/norestart', 'ADDLOCAL=Server', 'SERVER_REGISTER_AS_SERVICE=1', 'SERVER_ADD_FIREWALL_EXCEPTION=1', 'SERVER_ALLOW_SAS=1', 'SET_USEVNCAUTHENTICATION=1', 'VALUE_OF_USEVNCAUTHENTICATION=1', 'SET_PASSWORD=1', 'VALUE_OF_PASSWORD=REDACTED', 'SET_USECONTROLAUTHENTICATION=1', 'VALUE_OF_USECONTROLAUTHENTICATION=1', 'SET_CONTROLPASSWORD=1', 'VALUE_OF_CONTROLPASSWORD=REDACTED'
    
    $vncProc = Start-Process -FilePath "msiexec.exe" -ArgumentList $vncArgs -Wait -NoNewWindow -PassThru
    Log "   -> MSI Installer exited with code: $($vncProc.ExitCode)"

    if (Test-Path $vncMsi) { Remove-Item $vncMsi -Force -ErrorAction SilentlyContinue }
    Log "[OK] TightVNC installed."


    # ─── 3. Secure VNC (Localhost Only) ───
    Log "`nStep 3/4: Securing VNC to Localhost Only (SSH Tunneling)..."
    Log "   -> Creating registry keys for AllowLoopback and LoopbackOnly..."
    
    # We must ensure the registry path exists first just in case
    $regPath = 'HKLM:\SOFTWARE\TightVNC\Server'
    if (!(Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }

    New-ItemProperty -Path $regPath -Name 'AllowLoopback' -Value 1 -PropertyType DWord -Force | Out-Null
    New-ItemProperty -Path $regPath -Name 'LoopbackOnly' -Value 1 -PropertyType DWord -Force | Out-Null
    
    Log "   -> Restarting tvnserver service to apply changes..."
    Restart-Service tvnserver -ErrorAction SilentlyContinue
    Log "[OK] VNC secured."


    # ─── 4. Test Workspace ───
    Log "`nStep 4/4: Creating VegaMCP Testing Workspace..."
    $testDir = 'C:\VegaMCP-Tests'
    Log "   -> Creating directories at $testDir..."
    
    New-Item -ItemType Directory -Path $testDir -Force | Out-Null
    New-Item -ItemType Directory -Path "$testDir\scripts" -Force | Out-Null
    New-Item -ItemType Directory -Path "$testDir\results" -Force | Out-Null
    New-Item -ItemType Directory -Path "$testDir\media" -Force | Out-Null
    
    Log "[OK] Workspace created."

    Log "`n>>> ALL STEPS COMPLETED SUCCESSFULLY <<<"

} catch {
    Log "!!! ERROR ENCOUNTERED !!!"
    Log "Exception Message: $($_.Exception.Message)"
    Log "Line: $($_.InvocationInfo.ScriptLineNumber)"
    Log "Stack Trace: $($_.ScriptStackTrace)"
}
