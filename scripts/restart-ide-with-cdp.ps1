# Restart IDE with Chrome DevTools Protocol (CDP) Enabled
param(
    [int]$port = 9222
)

Write-Host "Restarting Antigravity/VSCode/Cursor with CDP on port $port..."

# 1. Find running IDE processes
$ideProcesses = Get-CimInstance Win32_Process | Where-Object { $_.Name -match "^(Antigravity|Code|Cursor)\.exe$" }

if (-not $ideProcesses) {
    Write-Host "No running IDE found to restart. Please start it manually with --remote-debugging-port=$port" -ForegroundColor Yellow
    exit
}

# 2. Get the main executable path
$idePath = $ideProcesses[0].ExecutablePath

# 3. Kill the existing IDE processes
Write-Host "Closing IDE..."
Get-Process | Where-Object { $_.Name -match "^(Antigravity|Code|Cursor)$" } | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2

# 4. Restart with the debugging port flag
Write-Host "Relaunching $($idePath) with --remote-debugging-port=$port..."
Start-Process -FilePath $idePath -ArgumentList "--remote-debugging-port=$port"

Write-Host "Done! Automator should now be able to connect." -ForegroundColor Green
