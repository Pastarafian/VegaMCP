# ═══════════════════════════════════════════════════════════
# VegaMCP Antigravity Fleet Deployment Script
# Purpose: Run multiple isolated Antigravity IDEs with 100% uptime
# ═══════════════════════════════════════════════════════════
# Usage: .\start-antigravity-fleet.ps1 -Instances 3 -BasePort 9222 -EnableAutoStart $true
# ═══════════════════════════════════════════════════════════

param(
    [int]$Instances = 2,
    [int]$BasePort = 9222,
    [string]$WorkspaceBase = "C:\VegaWorkspaces",
    [bool]$EnableAutoStart = $false
)

$ErrorActionPreference = "Continue"

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  VegaMCP Antigravity Fleet Engine         " -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Deploying $Instances Antigravity nodes starting on CDP port $BasePort..."

# Path to the Antigravity launcher
$AgExe = "$env:LOCALAPPDATA\Programs\Antigravity\Antigravity.exe"
if (-not (Test-Path $AgExe)) {
    # Try alternate location
    $AgExe = "C:\Users\trader\AppData\Local\Programs\Antigravity\Antigravity.exe"
    if (-not (Test-Path $AgExe)) {
        Write-Host "❌ ERROR: Could not locate Antigravity.exe" -ForegroundColor Red
        exit 1
    }
}

# Ensure base workspace folder exists
if (-not (Test-Path $WorkspaceBase)) {
    New-Item -ItemType Directory -Path $WorkspaceBase -Force | Out-Null
    Write-Host "📁 Created Base Workspace: $WorkspaceBase" -ForegroundColor Green
}

for ($i = 1; $i -le $Instances; $i++) {
    $port = $BasePort + ($i - 1)
    $workspace = "$WorkspaceBase\Project$i"
    $userDataDir = "$env:LOCALAPPDATA\Antigravity\Fleet_Instance_$i"

    if (-not (Test-Path $workspace)) {
        New-Item -ItemType Directory -Path $workspace -Force | Out-Null
    }
    
    if (-not (Test-Path $userDataDir)) {
        New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null
    }

    Write-Host "🚀 Launching Fleet Node $i (CDP: $port) -> Workspace: $workspace" -ForegroundColor Yellow

    # Launching Antigravity as a background process with isolated user data and CDP port
    # Note: --disable-renderer-backgrounding ensures it stays active 100% of the time
    $arguments = @(
        "--remote-debugging-port=$port",
        "--user-data-dir=`"$userDataDir`"",
        "--disable-renderer-backgrounding",
        "--window-size=1920,1080",
        "--no-sandbox",
        "`"$workspace`""
    )
    
    Start-Process -FilePath $AgExe -ArgumentList $arguments -WindowStyle Minimized
}

Write-Host "`n✅ All instances deployed successfully." -ForegroundColor Green
Write-Host "You can now control these instances simultaneously using Vegaclaw on ports ranging from $BasePort to $($BasePort + $Instances - 1)"

if ($EnableAutoStart) {
    Write-Host "`n🔄 Configuring Auto-Start on Boot..." -ForegroundColor Cyan
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Instances $Instances -BasePort $BasePort"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    
    Register-ScheduledTask -TaskName "VegaMCP_AntigravityFleet" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "✅ Registered Scheduled Task: VegaMCP_AntigravityFleet to start on user logon with 100% uptime" -ForegroundColor Green
}
