# vegaclaw_watchdog.ps1
# Ensures vegaclaw.pyw is always running with 100% uptime.
$ScriptPath = "C:\Users\fakej\Documents\VegaMCP\scripts\vegaclaw.pyw"

while ($true) {
    # Check if a pythonw process running vegaclaw.pyw exists
    $process = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%vegaclaw.pyw%'" -ErrorAction SilentlyContinue
    
    if (-not $process) {
        Write-Host "VegaClaw Agentic Bridge is offline! Restarting..."
        Start-Process -FilePath "pythonw.exe" -ArgumentList "`"$ScriptPath`"" -WindowStyle Hidden
    }
    else {
        Write-Host "VegaClaw Agentic Bridge is active. PID: $($process.ProcessId)"
    }
    
    # Wait 5 seconds before checking again
    Start-Sleep -Seconds 5
}
