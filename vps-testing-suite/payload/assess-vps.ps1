# ═══════════════════════════════════════════════════════════
# VegaMCP VPS Deep Assessment (v2)
# ═══════════════════════════════════════════════════════════
# Outputs a comprehensive JSON capabilities profile so
# VegaMCP's Router Engine knows exactly what this VPS can do.

$ErrorActionPreference = "SilentlyContinue"

# ─── Hardware Metrics ─────────────────────────────────────
$os = Get-WmiObject Win32_OperatingSystem
$cpu = Get-WmiObject Win32_Processor
$disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
$gpu = Get-WmiObject Win32_VideoController

$ramTotalMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
$ramFreeMB = [math]::Round($os.FreePhysicalMemory / 1024)
$diskFreeGB = [math]::Round($disk.FreeSpace / 1GB, 1)
$diskTotalGB = [math]::Round($disk.Size / 1GB, 1)
$cores = if ($cpu.NumberOfCores) { $cpu.NumberOfCores } else { 2 }
$logicalCores = if ($cpu.NumberOfLogicalProcessors) { $cpu.NumberOfLogicalProcessors } else { $cores * 2 }

# ─── Capability Detection ────────────────────────────────
function Has-Command([string]$cmd) { $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

$capabilities = @()

# Hardware capabilities
if ($ramTotalMB -ge 8192) { $capabilities += "heavy_workloads" }
if ($ramTotalMB -ge 4096) { $capabilities += "gui_testing" }
if ($ramTotalMB -ge 2048) { $capabilities += "medium_testing" }
if ($diskFreeGB -ge 50) { $capabilities += "large_storage" }
if ($diskFreeGB -ge 20) { $capabilities += "media_caching" }
if ($gpu.Name -and $gpu.Name -notmatch "Basic|Standard VGA") { $capabilities += "gpu_available" }

# Virtualization
$hyperv = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -ErrorAction SilentlyContinue
if ($hyperv -and $hyperv.State -eq 'Enabled') {
    $capabilities += "nested_virtualization"
    $capabilities += "docker_windows_containers"
}

# Installed Software Detection
$softwareMap = @{
    "node"    = "nodejs"
    "npm"     = "npm"
    "npx"     = "npx"
    "python"  = "python"
    "pip"     = "pip"
    "git"     = "git"
    "dotnet"  = "dotnet"
    "java"    = "java"
    "cargo"   = "rust"
    "docker"  = "docker"
    "k6"      = "k6_load_testing"
    "nmap"    = "nmap"
    "ffmpeg"  = "ffmpeg"
    "curl"    = "curl"
    "jq"      = "jq"
    "sqlite3" = "sqlite"
    "magick"  = "imagemagick"
    "hashcat" = "hashcat"
}

$installedTools = @()
foreach ($cmd in $softwareMap.Keys) {
    if (Has-Command $cmd) {
        $capabilities += $softwareMap[$cmd]
        $installedTools += $softwareMap[$cmd]
    }
}

# Check for specific installed applications
if (Test-Path "C:\Program Files*\Windows Application Driver\WinAppDriver.exe") {
    $capabilities += "winappdriver"
    $installedTools += "winappdriver"
}
if (Test-Path "$env:ProgramFiles\dotnet\dotnet.exe") {
    $capabilities += "dotnet"
    $installedTools += "dotnet"
}

# Browser detection
$browsers = @()
if (Test-Path "C:\Program Files*\Google\Chrome\Application\chrome.exe") { $browsers += "chrome"; $capabilities += "browser_chrome" }
if (Test-Path "C:\Program Files*\Mozilla Firefox\firefox.exe") { $browsers += "firefox"; $capabilities += "browser_firefox" }
if (Test-Path "C:\Program Files*\Microsoft\Edge\Application\msedge.exe") { $browsers += "edge"; $capabilities += "browser_edge" }

# Playwright detection
if (Has-Command "npx") {
    $playwrightCheck = npx playwright --version 2>&1
    if ($playwrightCheck -match "\d+\.\d+") { $capabilities += "playwright"; $installedTools += "playwright" }
}

# Service detection
if ((Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server" -ErrorAction SilentlyContinue).fDenyTSConnections -eq 0) { $capabilities += "rdp" }
if (Get-Service tvnserver -ErrorAction SilentlyContinue) { $capabilities += "vnc_local" }
if (Get-Service sshd -ErrorAction SilentlyContinue) { $capabilities += "ssh" }

# Database detection
if (Get-Service postgresql* -ErrorAction SilentlyContinue) { $capabilities += "postgresql"; $installedTools += "postgresql" }
if (Get-Service Redis -ErrorAction SilentlyContinue) { $capabilities += "redis"; $installedTools += "redis" }

# VegaGateway detection
if (Get-Service VegaSentinelGateway -ErrorAction SilentlyContinue) { $capabilities += "vega_gateway" }

# ─── Concurrency Calculation ─────────────────────────────
$ramSlots = [math]::Floor($ramFreeMB / 1024)
$maxConcurrent = [math]::Min($ramSlots, $logicalCores)
if ($maxConcurrent -le 0 -and $ramFreeMB -gt 512) { $maxConcurrent = 1 }

# ─── Testing Domain Assessment ───────────────────────────
$testingDomains = @()
if ($capabilities -contains "nodejs" -or $capabilities -contains "python") { $testingDomains += "unit_testing" }
if ($capabilities -contains "playwright" -or $capabilities -contains "browser_chrome") { $testingDomains += "web_e2e_testing" }
if ($capabilities -contains "winappdriver") { $testingDomains += "desktop_gui_testing" }
if ($capabilities -contains "k6_load_testing") { $testingDomains += "load_stress_testing" }
if ($capabilities -contains "nmap" -or $capabilities -contains "hashcat") { $testingDomains += "security_penetration_testing" }
if ($capabilities -contains "ffmpeg" -or $capabilities -contains "imagemagick") { $testingDomains += "visual_regression_testing" }
if ($capabilities -contains "docker") { $testingDomains += "container_testing" }
if ($capabilities -contains "postgresql" -or $capabilities -contains "sqlite") { $testingDomains += "database_testing" }
if ($capabilities -contains "npm") { $testingDomains += "dependency_auditing" }

# ─── Output JSON ─────────────────────────────────────────
$assessment = @{
    hostname                = $env:COMPUTERNAME
    assessed_at             = (Get-Date).ToString("o")
    hardware                = @{
        cpu_name      = $cpu.Name
        total_cores   = $cores
        logical_cores = $logicalCores
        cpu_load_pct  = $cpu.LoadPercentage
        total_ram_mb  = $ramTotalMB
        free_ram_mb   = $ramFreeMB
        total_disk_gb = $diskTotalGB
        free_disk_gb  = $diskFreeGB
        gpu           = if ($gpu.Name) { $gpu.Name } else { "None" }
    }
    capabilities            = $capabilities | Sort-Object -Unique
    installed_tools         = $installedTools | Sort-Object -Unique
    browsers                = $browsers
    testing_domains         = $testingDomains
    recommended_concurrency = $maxConcurrent
    ready_for_testing       = ($installedTools.Count -ge 5)
    suite_installed         = (Has-Command "node" -and Has-Command "python" -and Has-Command "git")
}

$assessment | ConvertTo-Json -Depth 5
