# ═══════════════════════════════════════════════════════════
# VegaMCP VPS Setup Script
# Run this on the VPS (via RDP) to enable SSH + install tools
# ═══════════════════════════════════════════════════════════
# Usage: Right-click → Run as Administrator
# ═══════════════════════════════════════════════════════════

#Requires -RunAsAdministrator

$ErrorActionPreference = "Continue"
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  VegaMCP VPS Setup — Windows Server"        -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ─── Step 1: Enable OpenSSH Server ───
Write-Host "[1/8] Installing OpenSSH Server..." -ForegroundColor Yellow
$sshCapability = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
if ($sshCapability.State -ne 'Installed') {
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
    Write-Host "  ✅ OpenSSH Server installed" -ForegroundColor Green
}
else {
    Write-Host "  ✅ OpenSSH Server already installed" -ForegroundColor Green
}

# Start and auto-start SSH
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
Write-Host "  ✅ sshd service started and set to auto-start" -ForegroundColor Green

# Set default shell to PowerShell
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null
Write-Host "  ✅ Default SSH shell set to PowerShell" -ForegroundColor Green

# ─── Step 2: Open SSH port in firewall ───
Write-Host "`n[2/8] Configuring firewall for SSH..." -ForegroundColor Yellow
$existingRule = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
if (-not $existingRule) {
    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (TCP)" `
        -Direction Inbound -LocalPort 22 -Protocol TCP -Action Allow | Out-Null
}
Enable-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
Write-Host "  ✅ Firewall rule for SSH port 22 enabled" -ForegroundColor Green

# ─── Step 3: Create REDACTED test directory ───
Write-Host "`n[3/8] Creating test workspace..." -ForegroundColor Yellow
$testDir = "C:\VegaMCP-Tests"
New-Item -ItemType Directory -Path $testDir -Force | Out-Null
New-Item -ItemType Directory -Path "$testDir\scripts" -Force | Out-Null
New-Item -ItemType Directory -Path "$testDir\results" -Force | Out-Null
New-Item -ItemType Directory -Path "$testDir\media" -Force | Out-Null
Write-Host "  ✅ Created $testDir with scripts/, results/, media/" -ForegroundColor Green

# ─── Step 4: Install test scripts ───
Write-Host "`n[4/8] Installing test scripts..." -ForegroundColor Yellow

# System info collector
@'
# VegaMCP System Info Collector
$info = @{
    Hostname     = $env:COMPUTERNAME
    OS           = (Get-WmiObject Win32_OperatingSystem).Caption
    OSVersion    = (Get-WmiObject Win32_OperatingSystem).Version
    Architecture = $env:PROCESSOR_ARCHITECTURE
    CPUName      = (Get-WmiObject Win32_Processor).Name
    CPUCores     = (Get-WmiObject Win32_Processor).NumberOfCores
    TotalRAM_GB  = [math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
    FreeRAM_GB   = [math]::Round((Get-WmiObject Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1)
    Disks        = @(Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
        @{ Drive = $_.DeviceID; Total_GB = [math]::Round($_.Size/1GB,1); Free_GB = [math]::Round($_.FreeSpace/1GB,1) }
    })
    Uptime       = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
    PowerShell   = $PSVersionTable.PSVersion.ToString()
    DotNet       = if (Get-Command dotnet -ErrorAction SilentlyContinue) { (dotnet --version) } else { "Not installed" }
    Node         = if (Get-Command node -ErrorAction SilentlyContinue) { (node --version) } else { "Not installed" }
    Python       = if (Get-Command python -ErrorAction SilentlyContinue) { (python --version 2>&1) } else { "Not installed" }
    Git          = if (Get-Command git -ErrorAction SilentlyContinue) { (git --version) } else { "Not installed" }
    Docker       = if (Get-Command docker -ErrorAction SilentlyContinue) { (docker --version) } else { "Not installed" }
    SSH          = if (Get-Service sshd -ErrorAction SilentlyContinue) { (Get-Service sshd).Status.ToString() } else { "Not installed" }
    RDP          = if ((Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server").fDenyTSConnections -eq 0) { "Enabled" } else { "Disabled" }
    HyperV       = if (Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -ErrorAction SilentlyContinue) { "Available" } else { "Not available" }
    Defender     = if (Get-Service WinDefend -ErrorAction SilentlyContinue) { (Get-Service WinDefend).Status.ToString() } else { "Not installed" }
    Firewall     = (Get-NetFirewallProfile | Select-Object Name, Enabled)
    OpenPorts    = @(Get-NetTCPConnection -State Listen | Select-Object LocalPort -Unique | Sort-Object LocalPort | ForEach-Object { $_.LocalPort })
    Services     = @(Get-Service | Where-Object { $_.Status -eq 'Running' } | Measure-Object).Count
    InstalledApps = @(Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue | 
        Where-Object { $_.DisplayName } | Select-Object DisplayName, DisplayVersion | Sort-Object DisplayName)
}
$info | ConvertTo-Json -Depth 4
'@ | Set-Content "$testDir\scripts\system-info.ps1" -Encoding UTF8
Write-Host "  ✅ system-info.ps1" -ForegroundColor Green

# Health check script (lightweight, for quick pings)
@'
# VegaMCP VPS Health Check — lightweight, fast
param([switch]$Brief)
$result = @{
    timestamp = (Get-Date -Format "o")
    status    = "ok"
    checks    = @{}
}

# SSH check
$sshd = Get-Service sshd -ErrorAction SilentlyContinue
$result.checks.ssh = @{ running = ($sshd -and $sshd.Status -eq 'Running') }

# Disk check
$disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
$freeGB = [math]::Round($disk.FreeSpace / 1GB, 1)
$result.checks.disk = @{ free_gb = $freeGB; warning = ($freeGB -lt 5) }

# Memory check
$os = Get-WmiObject Win32_OperatingSystem
$freeRAM = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$result.checks.memory = @{ free_gb = $freeRAM; total_gb = $totalRAM; usage_pct = [math]::Round((1 - $freeRAM/$totalRAM) * 100) }

# CPU check
$cpu = (Get-WmiObject Win32_Processor).LoadPercentage
$result.checks.cpu = @{ load_pct = $cpu }

# Overall status
if ($result.checks.disk.warning -or $result.checks.memory.usage_pct -gt 90) {
    $result.status = "warning"
}

if ($Brief) {
    Write-Host "$($result.status) | CPU:$($cpu)% | RAM:$($result.checks.memory.usage_pct)% | Disk:${freeGB}GB free"
} else {
    $result | ConvertTo-Json -Depth 3
}
'@ | Set-Content "$testDir\scripts\health-check.ps1" -Encoding UTF8
Write-Host "  ✅ health-check.ps1" -ForegroundColor Green

# Shell test runner (validates commands work correctly)
@'
# VegaMCP Shell Test Runner
# Tests basic shell operations that VegaMCP tools would execute
param(
    [string]$ResultsDir = "C:\VegaMCP-Tests\results"
)

$results = @()
$testNum = 0

function Run-Test {
    param([string]$Name, [scriptblock]$Test)
    $script:testNum++
    $start = Get-Date
    try {
        $output = & $Test 2>&1
        $passed = $LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq $null
        $result = @{ id = $script:testNum; name = $Name; passed = $passed; output = ($output | Out-String).Trim(); duration_ms = ((Get-Date) - $start).TotalMilliseconds }
    } catch {
        $result = @{ id = $script:testNum; name = $Name; passed = $false; output = $_.Exception.Message; duration_ms = ((Get-Date) - $start).TotalMilliseconds }
    }
    $icon = if ($result.passed) { "✅" } else { "❌" }
    Write-Host "  $icon [$($result.id)] $Name ($([math]::Round($result.duration_ms))ms)"
    $script:results += $result
}

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  VegaMCP Shell Tests — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── File System Tests ──
Write-Host "File System:" -ForegroundColor Yellow
Run-Test "Create temp directory" { New-Item -ItemType Directory -Path "$env:TEMP\REDACTED-test" -Force }
Run-Test "Write file" { "Hello from VegaMCP" | Set-Content "$env:TEMP\REDACTED-test\test.txt" }
Run-Test "Read file" { Get-Content "$env:TEMP\REDACTED-test\test.txt" }
Run-Test "List directory" { Get-ChildItem "$env:TEMP\REDACTED-test" }
Run-Test "Delete temp dir" { Remove-Item "$env:TEMP\REDACTED-test" -Recurse -Force }
Run-Test "Long path support" { 
    $longDir = "$env:TEMP\" + ("a" * 200)
    New-Item -ItemType Directory -Path $longDir -Force
    Remove-Item $longDir -Force
}

# ── Process Tests ──
Write-Host "`nProcess Management:" -ForegroundColor Yellow
Run-Test "Get process list" { Get-Process | Select-Object -First 5 Name, Id, WorkingSet64 }
Run-Test "Environment variables" { [System.Environment]::GetEnvironmentVariable("PATH", "Machine") | Out-Null; "OK" }
Run-Test "Start/stop process" { $p = Start-Process notepad -PassThru; Start-Sleep -Milliseconds 500; Stop-Process $p; "OK" }

# ── Network Tests ──
Write-Host "`nNetwork:" -ForegroundColor Yellow
Run-Test "DNS resolution" { Resolve-DnsName google.com -Type A | Select-Object -First 1 }
Run-Test "HTTP request" { (Invoke-WebRequest -Uri "https://httpbin.org/get" -UseBasicParsing -TimeoutSec 10).StatusCode }
Run-Test "Port check (local SSH)" { 
    $r = Test-NetConnection -ComputerName localhost -Port 22 -WarningAction SilentlyContinue -InformationLevel Quiet
    if ($r) { "SSH reachable" } else { throw "SSH not reachable" }
}

# ── PowerShell Tests ──
Write-Host "`nPowerShell:" -ForegroundColor Yellow
Run-Test "PowerShell version" { $PSVersionTable.PSVersion.ToString() }
Run-Test "Execution policy" { Get-ExecutionPolicy }
Run-Test "JSON round-trip" { 
    $obj = @{test="value"; num=42; arr=@(1,2,3)}
    $json = $obj | ConvertTo-Json
    $back = $json | ConvertFrom-Json
    if ($back.num -eq 42) { "OK" } else { throw "JSON mismatch" }
}

# ── Registry Tests ──
Write-Host "`nRegistry:" -ForegroundColor Yellow
Run-Test "Read registry" { (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").ProductName }
Run-Test "Write/read/delete registry" {
    $path = "HKCU:\SOFTWARE\VegaMCP-Test"
    New-Item -Path $path -Force | Out-Null
    Set-ItemProperty -Path $path -Name "TestValue" -Value "Hello"
    $val = (Get-ItemProperty $path).TestValue
    Remove-Item $path -Force
    if ($val -eq "Hello") { "OK" } else { throw "Registry mismatch" }
}

# ── Summary ──
Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Cyan
$passed = ($results | Where-Object { $_.passed }).Count
$total = $results.Count
$color = if ($passed -eq $total) { "Green" } else { "Red" }
Write-Host "  Results: $passed/$total passed" -ForegroundColor $color
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

# Save results
$results | ConvertTo-Json -Depth 3 | Set-Content "$ResultsDir\shell-tests-$(Get-Date -Format 'yyyyMMdd-HHmmss').json" -Encoding UTF8
'@ | Set-Content "$testDir\scripts\shell-tests.ps1" -Encoding UTF8
Write-Host "  ✅ shell-tests.ps1" -ForegroundColor Green

# Capabilities detector (auto-populates .env CAPABILITIES field)
@'
# VegaMCP Capabilities Detector
# Run this to discover what the VPS can do
$caps = @()

# Check features
if (Get-Service sshd -ErrorAction SilentlyContinue) { $caps += "ssh" }
if ((Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server" -ErrorAction SilentlyContinue).fDenyTSConnections -eq 0) { $caps += "rdp" }
if (Get-Command docker -ErrorAction SilentlyContinue) { $caps += "docker" }
if (Get-Command dotnet -ErrorAction SilentlyContinue) { $caps += ".net" }
if (Get-Command node -ErrorAction SilentlyContinue) { $caps += "nodejs" }
if (Get-Command python -ErrorAction SilentlyContinue) { $caps += "python" }
if (Get-Command git -ErrorAction SilentlyContinue) { $caps += "git" }
if (Get-Command code -ErrorAction SilentlyContinue) { $caps += "vscode" }
if (Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -ErrorAction SilentlyContinue | Where-Object State -eq Enabled) { $caps += "hyper-v" }
if (Get-Service WinDefend -ErrorAction SilentlyContinue | Where-Object Status -eq Running) { $caps += "defender" }
if (Get-Command winget -ErrorAction SilentlyContinue) { $caps += "winget" }
if (Get-Command choco -ErrorAction SilentlyContinue) { $caps += "chocolatey" }

$capsStr = $caps -join ","
Write-Host "Detected capabilities: $capsStr"
Write-Host ""
Write-Host "Add this to your .env:" -ForegroundColor Yellow
Write-Host "VEGAMCP_VPS_1_CAPABILITIES=$capsStr" -ForegroundColor Green
'@ | Set-Content "$testDir\scripts\detect-capabilities.ps1" -Encoding UTF8
Write-Host "  ✅ detect-capabilities.ps1" -ForegroundColor Green

# ─── Step 5: Resource monitoring (lightweight background service) ───
Write-Host "`n[5/8] Setting up resource monitor..." -ForegroundColor Yellow
@'
# VegaMCP Resource Monitor — runs periodically, logs resource usage
# Designed to be lightweight (<1% CPU)
param([int]$IntervalSeconds = 60, [int]$MaxLogLines = 1440)

$logFile = "C:\VegaMCP-Tests\results\resource-log.csv"
if (-not (Test-Path $logFile)) {
    "Timestamp,CPU_Pct,RAM_Used_MB,RAM_Total_MB,Disk_Free_GB,Active_Tests" | Set-Content $logFile
}

Write-Host "Resource monitor started (interval: ${IntervalSeconds}s)" -ForegroundColor Green
while ($true) {
    $cpu = (Get-WmiObject Win32_Processor).LoadPercentage
    $os = Get-WmiObject Win32_OperatingSystem
    $ramUsed = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1024)
    $ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1024)
    $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
    $diskFree = [math]::Round($disk.FreeSpace / 1GB, 1)
    $activeTests = (Get-ChildItem "C:\VegaMCP-Tests\results\*.running" -ErrorAction SilentlyContinue).Count

    $line = "$(Get-Date -Format 'o'),$cpu,$ramUsed,$ramTotal,$diskFree,$activeTests"
    Add-Content $logFile $line

    # Trim log if too long
    $lines = Get-Content $logFile
    if ($lines.Count -gt $MaxLogLines + 1) {
        ($lines | Select-Object -First 1) + ($lines | Select-Object -Last $MaxLogLines) | Set-Content $logFile
    }

    Start-Sleep -Seconds $IntervalSeconds
}
'@ | Set-Content "$testDir\scripts\resource-monitor.ps1" -Encoding UTF8
Write-Host "  ✅ resource-monitor.ps1 (run separately if needed)" -ForegroundColor Green

# ─── Step 6: Set PowerShell execution policy ───
Write-Host "`n[6/8] Setting execution policy..." -ForegroundColor Yellow
Set-ExecutionPolicy RemoteSigned -Force -Scope LocalMachine
Write-Host "  ✅ Execution policy: RemoteSigned" -ForegroundColor Green

# ─── Step 7: Verify SSH connectivity ───
Write-Host "`n[7/8] Verifying SSH server..." -ForegroundColor Yellow
$sshStatus = Get-Service sshd -ErrorAction SilentlyContinue
if ($sshStatus -and $sshStatus.Status -eq 'Running') {
    $sshPort = (Get-ItemProperty "HKLM:\SOFTWARE\OpenSSH" -ErrorAction SilentlyContinue)
    Write-Host "  ✅ SSH Server running on port 22" -ForegroundColor Green
    Write-Host "  ℹ️  You can now SSH from your local machine:" -ForegroundColor Cyan
    
    # Get the public IP
    try {
        $ip = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing -TimeoutSec 5).Content
        Write-Host "     ssh trader@$ip" -ForegroundColor White
    }
    catch {
        Write-Host "     ssh trader@<VPS-IP>" -ForegroundColor White
    }
}
else {
    Write-Host "  ⚠️  SSH Server not running!" -ForegroundColor Red
    Write-Host "     Run: Start-Service sshd" -ForegroundColor Yellow
}

# ─── Step 8: Print summary ───
Write-Host "`n[8/8] Running capabilities detection..." -ForegroundColor Yellow
& "$testDir\scripts\detect-capabilities.ps1"

Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Green
Write-Host "  VPS Setup Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Test workspace: $testDir" -ForegroundColor White
Write-Host "  Scripts:" -ForegroundColor White
Write-Host "    • system-info.ps1         — Full system survey" -ForegroundColor Gray
Write-Host "    • health-check.ps1        — Quick health ping" -ForegroundColor Gray
Write-Host "    • shell-tests.ps1         — Shell operation tests" -ForegroundColor Gray
Write-Host "    • detect-capabilities.ps1 — Discover capabilities" -ForegroundColor Gray
Write-Host "    • resource-monitor.ps1    — Background resource logging" -ForegroundColor Gray
Write-Host ""
Write-Host "  Next: Update your .env with the SSH port," -ForegroundColor Yellow
Write-Host "  then test: ssh trader@<your-vps-ip>" -ForegroundColor Yellow
Write-Host ""
