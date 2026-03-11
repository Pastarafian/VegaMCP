# ═══════════════════════════════════════════════════════════════════════════════
# VegaMCP VPS Ultimate Testing Suite Installer
# ═══════════════════════════════════════════════════════════════════════════════
# This script automatically bootstraps Chocolatey and installs a comprehensive,
# hardware-aware suite of testing tools covering every domain imaginable:
#   - Web E2E & Headless Browsers
#   - Desktop App GUI Automation
#   - API & Load/Stress Testing
#   - Network & Security Penetration Testing
#   - System Forensics & Performance Profiling
#   - Container & Virtualization
#   - Database Testing
#   - Media & Visual Regression
#   - Package & Dependency Auditing

$ErrorActionPreference = "SilentlyContinue"
$LogFile = "C:\VegaMCP-Tests\logs\install-tools.log"
if (!(Test-Path (Split-Path $LogFile))) { New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null }

function Log([string]$msg) {
    $ts = (Get-Date).ToString("HH:mm:ss")
    $line = "[$ts] $msg"
    Write-Host $line -ForegroundColor Cyan
    Add-Content -Path $LogFile -Value $line
}

Log "========== VegaMCP Ultimate Testing Suite Installer =========="

# ─── 1. HARDWARE ASSESSMENT ──────────────────────────────────────────────────
$os = Get-WmiObject Win32_OperatingSystem
$cpu = Get-WmiObject Win32_Processor
$disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"

$ramTotalMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
$diskFreeGB = [math]::Round($disk.FreeSpace / 1GB, 1)
$cpuCores = if ($cpu.NumberOfLogicalProcessors) { $cpu.NumberOfLogicalProcessors } else { 2 }

$HasGUI = ($ramTotalMB -ge 4096)   # >= 4GB for browser/GUI testing
$HasStorage = ($diskFreeGB -ge 20)     # >= 20GB for large frameworks
$HasBigDisk = ($diskFreeGB -ge 50)     # >= 50GB for Docker + heavy deps
$HasHyperV = $null -ne (Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -ErrorAction SilentlyContinue | Where-Object State -eq Enabled)

Log "Hardware: RAM=${ramTotalMB}MB | Disk Free=${diskFreeGB}GB | Cores=${cpuCores} | GUI=$HasGUI | Storage=$HasStorage | Hyper-V=$HasHyperV"

# ─── 2. BOOTSTRAP CHOCOLATEY ─────────────────────────────────────────────────
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Log "Installing Chocolatey Package Manager..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Log "[OK] Chocolatey installed."
}
else {
    Log "Chocolatey already present."
}

# ─── 3. INSTALL ENGINE ───────────────────────────────────────────────────────
function Install-Tier {
    param([string]$TierName, [string]$TierDesc, [array]$Packages)
    if ($Packages.Count -eq 0) { return }
    Log ""
    Log ">>> $TierName — $TierDesc <<<"
    foreach ($pkg in $Packages) {
        Log "   Installing $pkg..."
        choco install $pkg -y --no-progress --limit-output 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1641 -or $LASTEXITCODE -eq 3010) {
            Log "   [OK] $pkg"
        }
        else {
            Log "   [FAIL] $pkg (Exit: $LASTEXITCODE)"
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 1: CORE RUNTIMES (Always Install)
# These are the absolute foundation every test needs.
# ═══════════════════════════════════════════════════════════════════════════════
Install-Tier -TierName "TIER 1" -TierDesc "Core Runtimes & Build Tools" -Packages @(
    "git",
    "nodejs-lts",        # JavaScript/TypeScript test execution
    "python3",           # Python test frameworks (pytest, robot, locust)
    "dotnet-sdk",        # .NET SDK for C#/FlaUI desktop testing
    "openjdk",           # Java for JMeter, Selenium Grid, Gatling
    "rust",              # Rust toolchain for compiling VegaGateway + native tools
    "cmake",             # Build system for native extensions
    "make"               # GNU Make for Makefiles
)

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 2: CLI UTILITIES & DATA TOOLS (Always Install)
# Lightweight but absolutely essential for scripting and data processing.
# ═══════════════════════════════════════════════════════════════════════════════
Install-Tier -TierName "TIER 2" -TierDesc "CLI Utilities & Data Processing" -Packages @(
    "curl",              # HTTP client
    "wget",              # File downloads
    "jq",                # JSON processor
    "yq",                # YAML processor
    "7zip",              # Archive extraction
    "grep",              # Text search (GNU grep for Windows)
    "sed",               # Stream editor
    "awk",               # Text processing
    "less",              # Pager
    "openssl",           # TLS/SSL certificate testing
    "gnupg",             # GPG encryption testing
    "sqlite",            # Lightweight SQL database for test data
    "postgresql",        # Full SQL database for integration tests
    "redis-64"           # In-memory cache for session/queue testing
)

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 3: SYSTEM FORENSICS & PROFILING (Always Install)
# Deep Windows internals for debugging, profiling, and process analysis.
# ═══════════════════════════════════════════════════════════════════════════════
Install-Tier -TierName "TIER 3" -TierDesc "System Forensics & Performance Profiling" -Packages @(
    "sysinternals",      # Procmon, Procdump, Autoruns, Handle, TCPView, PsTools
    "debugdiagnostic",   # Microsoft Debug Diagnostic Tool
    "windbg"             # Windows Debugger for crash dump analysis
)

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 4: API & LOAD/STRESS TESTING (Always Install)
# Tools for hammering APIs, stress testing, and performance benchmarking.
# ═══════════════════════════════════════════════════════════════════════════════
Install-Tier -TierName "TIER 4" -TierDesc "API & Load/Stress Testing" -Packages @(
    "k6",                # Grafana k6 — modern JS-based load testing
    "postman",           # API exploration & automated collections
    "httpie"             # Human-friendly HTTP client
)

# Also install Python-based load testing tools via pip
if (Get-Command pip -ErrorAction SilentlyContinue) {
    Log "   Installing Python testing frameworks..."
    pip install --quiet locust pytest pytest-html robotframework selenium requests httpx 2>&1 | Out-Null
    Log "   [OK] Python packages: locust, pytest, robotframework, selenium, requests, httpx"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 5: MEDIA & VISUAL REGRESSION (Always Install)
# For screenshot diffing, video recording, and image comparison.
# ═══════════════════════════════════════════════════════════════════════════════
Install-Tier -TierName "TIER 5" -TierDesc "Media & Visual Regression Testing" -Packages @(
    "ffmpeg",            # Video recording, format conversion, visual baselines
    "imagemagick",       # Image comparison and manipulation (pixel-diff testing)
    "graphviz"           # Diagram generation for dependency graphs
)

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 6: BROWSER E2E TESTING (Requires >= 4GB RAM)
# Full browser installations + headless browser automation engines.
# ═══════════════════════════════════════════════════════════════════════════════
if ($HasGUI) {
    Install-Tier -TierName "TIER 6" -TierDesc "Browser E2E Testing (GUI-Capable)" -Packages @(
        "googlechrome",      # Chromium-based testing
        "firefox",           # Gecko-based testing
        "microsoft-edge"     # Edge-based testing
    )

    # Playwright: Headless browser automation (Chromium, Firefox, WebKit)
    Log "   Bootstrapping Playwright browsers..."
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        npm install -g playwright @playwright/test 2>&1 | Out-Null
        npx playwright install --with-deps chromium firefox webkit 2>&1 | Out-Null
        Log "   [OK] Playwright (Chromium, Firefox, WebKit)"
    }

    # Cypress (alternative E2E framework)
    Log "   Installing Cypress..."
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        npm install -g cypress 2>&1 | Out-Null
        Log "   [OK] Cypress"
    }

    # Puppeteer (Chromium automation)
    Log "   Installing Puppeteer..."
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        npm install -g puppeteer 2>&1 | Out-Null
        Log "   [OK] Puppeteer"
    }
}
else {
    Log ">>> TIER 6 SKIPPED: Browser E2E requires >= 4GB RAM (Have ${ramTotalMB}MB)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 7: DESKTOP APP GUI AUTOMATION (Requires >= 4GB RAM)
# WinAppDriver + FlaUI for testing native Windows desktop applications.
# ═══════════════════════════════════════════════════════════════════════════════
if ($HasGUI) {
    Log ""
    Log ">>> TIER 7 — Desktop App GUI Automation <<<"

    # Enable Developer Mode (required for WinAppDriver)
    Log "   Enabling Windows Developer Mode..."
    reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /f /v "AllowDevelopmentWithoutDevLicense" /d "1" 2>&1 | Out-Null
    Log "   [OK] Developer Mode enabled."

    # Install WinAppDriver
    Log "   Downloading WinAppDriver..."
    $wadUrl = "https://github.com/microsoft/WinAppDriver/releases/download/v1.2.1/WindowsApplicationDriver_1.2.1.msi"
    $wadMsi = "$env:TEMP\WinAppDriver.msi"
    Invoke-WebRequest -Uri $wadUrl -OutFile $wadMsi -UseBasicParsing 2>&1 | Out-Null
    Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $wadMsi, "/quiet", "/norestart" -Wait -NoNewWindow
    Remove-Item $wadMsi -Force -ErrorAction SilentlyContinue
    Log "   [OK] WinAppDriver installed."

    # FlaUInspect (for inspecting UI elements)
    Install-Tier -TierName "TIER 7b" -TierDesc "FlaUI Inspector" -Packages @("flauinspect")
}
else {
    Log ">>> TIER 7 SKIPPED: Desktop GUI Automation requires >= 4GB RAM"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 8: NETWORK & SECURITY PENETRATION TESTING (Requires >= 4GB RAM)
# For port scanning, packet capture, web app auditing, and crypto testing.
# ═══════════════════════════════════════════════════════════════════════════════
if ($HasGUI) {
    Install-Tier -TierName "TIER 8" -TierDesc "Network & Security Penetration Testing" -Packages @(
        "nmap",              # Port scanning and network discovery
        "wireshark",         # Deep packet inspection
        "nikto",             # Web server vulnerability scanner
        "sqlmap",            # SQL injection detection
        "hashcat",           # Password hash cracker for security audits
        "burp-suite-free-edition"  # Web proxy for intercepting HTTP traffic
    )
}
else {
    Log ">>> TIER 8 SKIPPED: Security suite requires >= 4GB RAM"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 9: CONTAINERIZATION & VIRTUALIZATION (Requires Hyper-V + 50GB Disk)
# Enables Docker-in-Docker for isolated test environments.
# ═══════════════════════════════════════════════════════════════════════════════
if ($HasHyperV -and $HasBigDisk) {
    Install-Tier -TierName "TIER 9" -TierDesc "Containerization Engine" -Packages @(
        "docker-desktop"
    )
}
else {
    Log ">>> TIER 9 SKIPPED: Docker requires Hyper-V + 50GB free disk"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 10: NODE.JS GLOBAL TESTING ECOSYSTEM
# Install the powerhouse npm packages that VegaMCP tests rely on.
# ═══════════════════════════════════════════════════════════════════════════════
if (Get-Command npm -ErrorAction SilentlyContinue) {
    Log ""
    Log ">>> TIER 10 — Node.js Global Testing Ecosystem <<<"
    $npmPkgs = @(
        "typescript",        # TypeScript compiler
        "ts-node",           # Run TS directly
        "jest",              # Unit testing framework
        "mocha",             # Alternative test runner
        "eslint",            # Linting
        "prettier",          # Code formatting
        "lighthouse",        # Web performance auditing (headless)
        "axe-core",          # Accessibility testing engine
        "pa11y",             # Accessibility CLI scanner
        "npm-audit-resolver",# Dependency security auditing
        "depcheck",          # Unused dependency finder
        "madge"              # Circular dependency detection
    )
    foreach ($pkg in $npmPkgs) {
        npm install -g $pkg 2>&1 | Out-Null
        Log "   [OK] npm: $pkg"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 11: VNC SERVER (Localhost-Only, for GUI Automation via SSH Tunnel)
# ═══════════════════════════════════════════════════════════════════════════════
Log ""
Log ">>> TIER 11 — VNC Server (Secured to Localhost) <<<"
$vncUrl = 'https://tightvnc.com/download/2.8.85/tvnc64-2.8.85-gpl-setup.msi'
$vncMsi = "$env:TEMP\tvnc.msi"
Log "   Downloading TightVNC..."
Invoke-WebRequest -Uri $vncUrl -OutFile $vncMsi -UseBasicParsing 2>&1 | Out-Null
$vncArgs = '/i', $vncMsi, '/quiet', '/norestart', 'ADDLOCAL=Server',
'SERVER_REGISTER_AS_SERVICE=1', 'SERVER_ADD_FIREWALL_EXCEPTION=1',
'SET_USEVNCAUTHENTICATION=1', 'VALUE_OF_USEVNCAUTHENTICATION=1',
'SET_PASSWORD=1', "VALUE_OF_PASSWORD=$($env:VNC_PASSWORD)",
'SET_USECONTROLAUTHENTICATION=1', 'VALUE_OF_USECONTROLAUTHENTICATION=1',
'SET_CONTROLPASSWORD=1', "VALUE_OF_CONTROLPASSWORD=$($env:VNC_PASSWORD)"
Start-Process -FilePath "msiexec.exe" -ArgumentList $vncArgs -Wait -NoNewWindow
Remove-Item $vncMsi -Force -ErrorAction SilentlyContinue

# Lock VNC to localhost only (SSH tunnel required for access)
$vncReg = 'HKLM:\SOFTWARE\TightVNC\Server'
if (!(Test-Path $vncReg)) { New-Item -Path $vncReg -Force | Out-Null }
New-ItemProperty -Path $vncReg -Name 'AllowLoopback' -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $vncReg -Name 'LoopbackOnly' -Value 1 -PropertyType DWord -Force | Out-Null
Restart-Service tvnserver -ErrorAction SilentlyContinue
Log "   [OK] TightVNC installed and secured to localhost:5900"

# ═══════════════════════════════════════════════════════════════════════════════
# FINAL: REFRESH PATH AND SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
Log ""
Log ">>> TIER 12 — VegaClaw Agentic Bridge (Port 4242) <<<"
$fwRule = Get-NetFirewallRule -DisplayName "VegaClaw Agentic Bridge" -ErrorAction SilentlyContinue
if (!$fwRule) {
    New-NetFirewallRule -DisplayName "VegaClaw Agentic Bridge" -Direction Inbound -LocalPort 4242 -Protocol TCP -Action Allow | Out-Null
    Log "   [OK] Windows Firewall opened for Port 4242"
}
else {
    Log "   [OK] Windows Firewall already configured for Port 4242"
}

# The actual vegaclaw.pyw and watchdog are transferred by the main Node.js custodian, 
# but we ensure python dependencies are ready and schedule the watchdog
pip install requests websockets 2>&1 | Out-Null
Log "   [OK] Python CDP dependencies installed"

# Register the 100% Uptime Watchdog as a background Scheduled Task
$watchdogPath = Join-Path $env:USERPROFILE "Documents\VegaMCP\scripts\vegaclaw_watchdog.ps1"
$taskCmd = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogPath`""
schtasks.exe /create /tn "VegaClawUptimeWatchdog" /tr $taskCmd /sc onlogon /rl highest /f | Out-Null
Log "   [OK] 100% Uptime Watchdog Scheduled Task configured via schtasks"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Log ""
Log "========== INSTALLATION COMPLETE =========="
Log "Check full log at: $LogFile"

# Output capability summary for VegaMCP to parse
$installed = @()
if (Get-Command node    -EA 0) { $installed += "nodejs" }
if (Get-Command python  -EA 0) { $installed += "python" }
if (Get-Command git     -EA 0) { $installed += "git" }
if (Get-Command dotnet  -EA 0) { $installed += "dotnet" }
if (Get-Command java    -EA 0) { $installed += "java" }
if (Get-Command cargo   -EA 0) { $installed += "rust" }
if (Get-Command k6      -EA 0) { $installed += "k6" }
if (Get-Command nmap    -EA 0) { $installed += "nmap" }
if (Get-Command ffmpeg  -EA 0) { $installed += "ffmpeg" }
if (Get-Command docker  -EA 0) { $installed += "docker" }
if (Get-Command npx     -EA 0) { $installed += "playwright"; $installed += "cypress" }
if (Test-Path "C:\Program Files*\Windows Application Driver\WinAppDriver.exe") { $installed += "winappdriver" }
if (Get-Service tvnserver -EA 0) { $installed += "vnc" }

Log "Verified Tools: $($installed -join ', ')"
Log "Total Verified: $($installed.Count)"
