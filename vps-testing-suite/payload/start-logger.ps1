# ═══════════════════════════════════════════════════════════
# VegaMCP VPS Continuous Logger & Sentinel
# ═══════════════════════════════════════════════════════════
# Deployed and executed immediately by VegaMCP upon SSH connection.
# Runs as a background job to log system health, active tests, 
# and resource consumption directly to the workspace.
# Includes automated log rotation and cleanup.

$ErrorActionPreference = "SilentlyContinue"
$WorkspaceDir = "C:\VegaMCP-Tests"
$LogDir = "$WorkspaceDir\logs"
$LogFile = "$LogDir\vps-telemetry.log"

# Log Retention Settings
$MaxLogAgeDays = 3      # Delete logs older than this
$MaxLogSizeBytes = 10MB # Rotate log if it gets larger than this

# Ensure log directory exists
if (!(Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

Write-Output "--- VegaMCP Sentinel Logger Initialized ---"

# ─── CREATE A LIVE VIEWER ON THE VPS DESKTOP FOR THE USER ───
# Because SSH runs in a hidden session, we drop a shortcut on the public desktop.
# The user can just double-click it over RDP/VNC to watch the streaming logs.
$ViewerScript = "$env:PUBLIC\Desktop\VegaMCP_Live_Logs.bat"
$ViewerContent = @"
@echo off
TITLE VegaMCP Live Telemetry (Tail)
echo =======================================================
echo   VegaMCP VPS - Live Streaming Logs
echo =======================================================
echo Press CTRL+C to stop.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Path '$LogFile' -Wait -Tail 30"
"@
Set-Content -Path $ViewerScript -Value $ViewerContent -Force
Write-Output "Created Live Log Viewer shortcut on the VPS Desktop."
# ────────────────────────────────────────────────────────────

# Function to rotate logs if they get too big
function Maintain-Logs {
    # 1. Rotate current log if too large
    if (Test-Path $LogFile) {
        $fileInfo = Get-Item $LogFile
        if ($fileInfo.Length -gt $MaxLogSizeBytes) {
            $timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
            $archiveFile = "$LogDir\vps-telemetry_$timestamp.log"
            Move-Item -Path $LogFile -Destination $archiveFile -Force
            Write-Output "Rotated telemetry log to $archiveFile"
        }
    }

    # 2. Delete logs older than 3 days
    $oldLogs = Get-ChildItem -Path $LogDir -Filter "*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$MaxLogAgeDays) }
    foreach ($log in $oldLogs) {
        Remove-Item -Path $log.FullName -Force
        Write-Output "Cleaned up old log: $($log.Name)"
    }
}

# Run maintenance immediately on startup
Maintain-Logs

# Function to write structured logs
function Write-TelemetryLog {
    param([string]$Level, [string]$Message, [hashtable]$Metrics)
    
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff")
    $logEntry = "[$timestamp] [$Level] $Message"
    
    if ($Metrics) {
        $metricsStr = ($Metrics.Keys | ForEach-Object { "$_=$($Metrics[$_])" }) -join ", "
        $logEntry += " | Metrics: {$metricsStr}"
    }
    
    Add-Content -Path $LogFile -Value $logEntry
}

# 1. Start Logging Immediately
Write-TelemetryLog -Level "INFO" -Message "Session started by VegaMCP Master Router." -Metrics @{ "OS" = (Get-WmiObject Win32_OperatingSystem).Caption }

# 2. Start Background Job for Continuous Monitoring
# This will run silently in the background of the SSH session
$jobScript = {
    param($LogFilePath, $LogDirectory, $MaxAgeDays, $MaxSize)
    $ErrorActionPreference = "SilentlyContinue"
    
    $tick = 0
    while ($true) {
        # Check and rotate logs every ~1 hour (360 ticks * 10s)
        if ($tick -ge 360) {
            $tick = 0
            if (Test-Path $LogFilePath) {
                if ((Get-Item $LogFilePath).Length -gt $MaxSize) {
                    $ts = (Get-Date).ToString("yyyyMMdd_HHmmss")
                    Move-Item -Path $LogFilePath -Destination "$LogDirectory\vps-telemetry_$ts.log" -Force
                }
            }
            Get-ChildItem -Path $LogDirectory -Filter "*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$MaxAgeDays) } | Remove-Item -Force
        }
        $tick++

        # Gather Telemetry
        $os = Get-WmiObject Win32_OperatingSystem
        $cpu = Get-WmiObject Win32_Processor
        
        $ramFreeMB = [math]::Round($os.FreePhysicalMemory / 1024)
        $ramTotalMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
        $ramUsagePct = [math]::Round((($ramTotalMB - $ramFreeMB) / $ramTotalMB) * 100, 1)
        
        $cpuLoad = if ($cpu.LoadPercentage -ne $null) { $cpu.LoadPercentage } else { 0 }
        
        # Determine health status
        $status = "HEALTHY "
        if ($cpuLoad -gt 90 -or $ramUsagePct -gt 90) { $status = "CRITICAL" }
        elseif ($cpuLoad -gt 75 -or $ramUsagePct -gt 75) { $status = "WARNING " }

        $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        $entry = "[$timestamp] [HEARTBEAT] Status: $status | CPU: ${cpuLoad}% | RAM: ${ramUsagePct}% (${ramFreeMB}MB free)"
        Add-Content -Path $LogFilePath -Value $entry
        
        Start-Sleep -Seconds 10
    }
}

$jobName = "VegaMCP_Sentinel"
if (Get-Job -Name $jobName -ErrorAction SilentlyContinue) {
    Stop-Job -Name $jobName
    Remove-Job -Name $jobName
}

Start-Job -Name $jobName -ScriptBlock $jobScript -ArgumentList $LogFile, $LogDir, $MaxLogAgeDays, $MaxLogSizeBytes | Out-Null
Write-TelemetryLog -Level "INFO" -Message "Sentinel background telemetry job started."

Write-Output "LOGGER_STARTED: $LogFile"
