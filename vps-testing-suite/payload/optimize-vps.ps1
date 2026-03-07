# ═══════════════════════════════════════════════════════════
# VegaMCP VPS Extreme Optimization (Powered by VegaOptimizer Logic)
# ═══════════════════════════════════════════════════════════
# This script is pushed and executed by VegaMCP to strip down 
# the Windows Server environment to absolute bare metal.
# Includes advanced Win32 API Working-Set trimming to free RAM.

$ErrorActionPreference = "SilentlyContinue"
Write-Output "--- VegaMCP Extreme Resource Optimization Starting ---"

# 1. Advanced Memory Trimming (Win32 API EmptyWorkingSet)
Write-Output "Injecting Win32 API definitions for deep memory trimming..."
$Win32MemoryTrim = @"
using System;
using System.Runtime.InteropServices;
public class MemoryOptimizer {
    [DllImport("psapi.dll")]
    public static extern int EmptyWorkingSet(IntPtr hwProc);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr hObject);
}
"@
Add-Type -TypeDefinition $Win32MemoryTrim -Language CSharp -ErrorAction SilentlyContinue

Write-Output "Executing deep working-set trim on all idle processes..."
$processes = Get-Process 
$trimmed = 0
foreach ($proc in $processes) {
    # 0x0400 = PROCESS_QUERY_INFORMATION, 0x0100 = PROCESS_SET_QUOTA
    $handle = [MemoryOptimizer]::OpenProcess(0x0400 -bor 0x0100, $false, $proc.Id)
    if ($handle -ne [IntPtr]::Zero) {
        if ([MemoryOptimizer]::EmptyWorkingSet($handle) -ne 0) {
            $trimmed++
        }
        [MemoryOptimizer]::CloseHandle($handle) | Out-Null
    }
}
Write-Output "Successfully trimmed working set memory of $trimmed processes."

# 2. Disable Resource-Heavy Background Services
$servicesToKill = @("SysMain", "DiagTrack", "WSearch", "Spooler", "MapsBroker", "wuauserv", "Themes")
foreach ($svc in $servicesToKill) {
    if (Get-Service $svc) {
        Stop-Service -Name $svc -Force 
        Set-Service -Name $svc -StartupType Disabled 
        Write-Output "Disabled bloatware service: $svc"
    }
}

# 3. Disable Visual Effects (Adjust for best performance)
$performanceKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects"
if (!(Test-Path $performanceKey)) { New-Item -Path $performanceKey -Force | Out-Null }
Set-ItemProperty -Path $performanceKey -Name "VisualFXSetting" -Value 2
Write-Output "Disabled visual effects and animations (Best Performance)."

# 4. Enable High Performance Power Plan
$guid = (Get-WmiObject -Class Win32_PowerPlan -Namespace root\cimv2\power | Where-Object ElementName -eq 'High performance').InstanceID.Split('{')[1].TrimEnd('}')
if ($guid) { powercfg -setactive $guid }

# 5. Disable Defender Real-time Protection (For Test Execution Speed)
Set-MpPreference -DisableRealtimeMonitoring $true
Set-MpPreference -DisableArchivScanning $true
Set-MpPreference -DisableBehaviorMonitoring $true
Set-MpPreference -DisableBlockAtFirstSight $true

# 6. Flush DNS and Clear Logs
ipconfig /flushdns | Out-Null
wevtutil el | Foreach-Object { wevtutil cl "$_" }

Write-Output "--- VegaOptimizer Core Logic Applied ---"
$os = Get-WmiObject Win32_OperatingSystem
$freeMB = [math]::Round($os.FreePhysicalMemory / 1024)
Write-Output "Available RAM post-optimization: ${freeMB} MB"
