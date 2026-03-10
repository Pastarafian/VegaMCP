# VegaClaw Launcher - injects vegaclaw-clicker.js into Antigravity via CDP
# Run once. The JS handles everything after that.

param(
    [int]$StartPort = 9222,
    [int]$EndPort = 9242
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsFile = Join-Path $scriptDir "vegaclaw-clicker.js"

if (-not (Test-Path $jsFile)) {
    Write-Host "ERROR: $jsFile not found" -ForegroundColor Red
    exit 1
}

$jsCode = Get-Content $jsFile -Raw
$escaped = $jsCode -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n'

$injected = $false

for ($Port = $StartPort; $Port -le $EndPort; $Port++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        $targets = $r.Content | ConvertFrom-Json
        $pages = $targets | Where-Object { $_.type -eq 'page' -and $_.title -match 'Antigravity' }

        if (-not $pages) { continue }

        foreach ($page in $pages) {
            $wsUrl = $page.webSocketDebuggerUrl
            if (-not $wsUrl) { continue }

            try {
                $ws = New-Object System.Net.WebSockets.ClientWebSocket
                $cts = New-Object System.Threading.CancellationTokenSource(2000)
                $ws.ConnectAsync([Uri]$wsUrl, $cts.Token).Wait()

                $msg = '{"id":1,"method":"Runtime.evaluate","params":{"expression":"' + $escaped + '","returnByValue":true}}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
                $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

                $buf = [byte[]]::new(16384)
                $result = $ws.ReceiveAsync([System.ArraySegment[byte]]::new($buf), $cts.Token).Result
                $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $cts.Token).Wait()

                Write-Host "Injected into: $($page.title) [Port $Port]" -ForegroundColor Green
                $injected = $true
            }
            catch {
                Write-Host "Failed to inject on $($page.title) [Port $Port]" -ForegroundColor Red
            }
        }
    }
    catch {
        # Port not open, ignore and move on
    }
}

if ($injected) {
    Write-Host "Done. VegaClaw is now running inside the Antigravity fleet." -ForegroundColor Cyan
}
else {
    Write-Host "No Antigravity fleet instances found on ports $StartPort-$EndPort." -ForegroundColor Yellow
}
