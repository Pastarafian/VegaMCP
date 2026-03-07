<# :
@echo off
TITLE VegaMCP VPS Bootstrap
echo =======================================================
echo   VegaMCP VPS Bootstrap (Step 1)
echo =======================================================
echo.
echo Enabling SSH so VegaMCP can connect and automate the rest...
set "LOGFILE=%USERPROFILE%\Desktop\VegaMCP_Bootstrap.log"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression $([System.IO.File]::ReadAllText('%~f0'))" > "%LOGFILE%" 2>&1
echo [OK] Bootstrap finished! VegaMCP can now connect via SSH.
echo You can safely close this window.
pause
goto :eof
#>

$ErrorActionPreference = 'SilentlyContinue'
Write-Output ">>> VEGAMCP BOOTSTRAP: $(Get-Date) <<<"

try {
    # 1. Install OpenSSH Server
    Write-Output "Installing OpenSSH Server..."
    $sshCap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
    if ($sshCap.State -ne 'Installed') {
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    }
    
    # 2. Start and configure SSH
    Start-Service sshd
    Set-Service -Name sshd -StartupType Automatic
    New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force | Out-Null
    
    # 3. Open Firewall
    Write-Output "Configuring Firewall for Port 22..."
    New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (TCP)' -Direction Inbound -LocalPort 22 -Protocol TCP -Action Allow | Out-Null
  
    Write-Output "SUCCESS: SSH Port 22 is now open."
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
