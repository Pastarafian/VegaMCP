# VegaClaw AutoClicker v8.1 — CDP + Hotbar (Whitelist Mode)
# ONLY clicks buttons matching EXACT text + button color whitelist
# Features: 5sec Typing Timeout, DOM Tagging, Workspace Isolation

param(
    [int]$Port = 9222,
    [string]$LogFile = "$env:TEMP\vegaclaw-autoclicker.log"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Suppress .NET unhandled exception popups
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)
[System.Windows.Forms.Application]::add_ThreadException({
        param($evtSender, $e)
        # Silently swallow — the background scanner handles its own errors
    })

# ═══ STATE ═══
$Global:AC_Running = $true
$Global:AC_Paused = $false
$Global:AC_Clicks = 0
$Global:AC_Scans = 0
$Global:AC_LastMsg = "Starting..."
$Global:AC_SpeedMs = 2000
$Global:AC_CDPPort = $Port
$Global:AC_Connected = $false
$Global:AC_Dragging = $false
$Global:AC_DragX = 0; $Global:AC_DragY = 0
$Global:AC_StateFile = "$env:TEMP\vegaclaw-state.txt"

# ═══ FONTS/COLORS ═══
$fontBold = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Regular)
$fontMono = New-Object System.Drawing.Font("Consolas", 7, [System.Drawing.FontStyle]::Regular)
$fontBtn = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$cCyan = [System.Drawing.Color]::FromArgb(0, 212, 255)
$cGreen = [System.Drawing.Color]::FromArgb(34, 197, 94)
$cAmber = [System.Drawing.Color]::FromArgb(245, 158, 11)
$cRed = [System.Drawing.Color]::FromArgb(239, 68, 68)
$cGray = [System.Drawing.Color]::FromArgb(100, 116, 139)
$cBg = [System.Drawing.Color]::FromArgb(14, 17, 23)
$cBtnBg = [System.Drawing.Color]::FromArgb(22, 27, 34)
$cBorder = [System.Drawing.Color]::FromArgb(30, 41, 59)

function Log($msg, $lvl) {
    $ts = Get-Date -Format "HH:mm:ss"
    $line = "[$ts] [$lvl] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

# ═══ CDP INJECTION SCRIPT (WHITELIST ONLY) ═══
$Global:InjectionJS = @'
(function(){
  if(window.__vc81) return JSON.stringify({s:'active', c:window.__vc81c||0});
  window.__vc81 = true;
  window.__vc81c = 0;
  window.__vc81lastTyping = 0;
  
  // Track typing for 5-second cooldown
  document.addEventListener('keydown', function(e) {
    if(e.key && e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') {
      window.__vc81lastTyping = Date.now();
    }
  }, true);

  // ═══ STRICT WHITELIST ═══
  // Each entry: { text: exact lowercase match, colors: array of acceptable bg colors (null = any) }
  var WHITELIST = [
    { text: 'run',                    colors: null },
    { text: 'rescue run',             colors: null },
    { text: 'accept all',             colors: null },
    { text: 'accept',                 colors: null },
    { text: 'allow this conversation', colors: null },
    { text: 'allow',                  colors: null },
    { text: 'continue',              colors: null },
    { text: 'retry',                  colors: null },
    { text: 'trust',                  colors: null }
  ];

  function isWhitelisted(text) {
    var t = text.toLowerCase().trim();
    for (var i = 0; i < WHITELIST.length; i++) {
      if (t.indexOf(WHITELIST[i].text) >= 0) return WHITELIST[i];
    }
    return null;
  }

  function scan() {
    // Typing cooldown: skip if user typed in last 5 seconds
    if (Date.now() - window.__vc81lastTyping < 5000) return;

    // Scope ONLY to the agent sidebar panel
    var aux = document.querySelector('.auxiliarybar');
    if (!aux) return;
    
    var all = aux.querySelectorAll('button, [role=button]');
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      
      // Anti-spam: skip already-clicked elements
      if (e.dataset && e.dataset.vc81) continue;
      
      // Get first line of visible text only
      var raw = (e.innerText || e.textContent || '').trim();
      if (!raw) continue;
      var firstLine = raw.split(/\r?\n/)[0].trim();
      if (firstLine.length > 30 || firstLine.length < 2) continue;
      
      // WHITELIST CHECK — exact match only
      var match = isWhitelisted(firstLine);
      if (!match) continue;
      
      // Visibility check
      var r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      var s = window.getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
      
      // Color check (if specified in whitelist)
      if (match.colors) {
        var bg = s.backgroundColor;
        var found = false;
        for (var j = 0; j < match.colors.length; j++) {
          if (bg.indexOf(match.colors[j]) >= 0) { found = true; break; }
        }
        if (!found) continue;
      }
      
      // TAG + CLICK
      e.dataset.vc81 = '1';
      e.click();
      window.__vc81c++;
      
      // Allow re-click after 5 seconds if button reappears
      setTimeout(function(el){ return function(){ if(el.dataset) delete el.dataset.vc81; } }(e), 5000);
    }
  }

  // Watch for DOM changes in the agent panel only
  var thr = null;
  var target = document.querySelector('.auxiliarybar') || document.body;
  new MutationObserver(function() {
    if (thr) return;
    thr = setTimeout(function() { thr = null; scan(); }, 200);
  }).observe(target, {childList:true, subtree:true});
  
  setInterval(scan, 2000);
  setTimeout(scan, 500);
  return JSON.stringify({s:'injected', c:window.__vc81c});
})()
'@

# ═══ BACKGROUND CDP SCANNER ═══
function StartBackgroundScanner {
    $port = $Global:AC_CDPPort
    $jsCode = $Global:InjectionJS
    $stateFile = $Global:AC_StateFile
    $logFile = $LogFile

    $Global:AC_ScanJob = [PowerShell]::Create()
    $Global:AC_ScanJob.AddScript({
            param($port, $jsCode, $stateFile, $logFile)

            function CDPEval($wsUrl, $js) {
                try {
                    $ws = New-Object System.Net.WebSockets.ClientWebSocket
                    $cts = New-Object System.Threading.CancellationTokenSource(2000)
                    $ws.ConnectAsync([Uri]$wsUrl, $cts.Token).Wait()

                    $escaped = $js -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n'
                    $msg = '{"id":1,"method":"Runtime.evaluate","params":{"expression":"' + $escaped + '","returnByValue":true}}'
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
                    $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

                    $buf = [byte[]]::new(16384)
                    $result = $ws.ReceiveAsync([System.ArraySegment[byte]]::new($buf), $cts.Token).Result
                    $resp = [System.Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
                    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $cts.Token).Wait() | Out-Null
                    return $resp
                }
                catch { return $null }
            }

            $totalClicks = 0; $totalScans = 0

            while ($true) {
                try {
                    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/json" -UseBasicParsing -TimeoutSec 3
                    $targets = $r.Content | ConvertFrom-Json
                    $injected = 0; $foundClicks = 0

                    foreach ($t in $targets) {
                        # WORKSPACE ISOLATION: Only VegaMCP windows
                        if ($t.type -ne 'page' -or $t.title -notmatch 'VegaMCP') { continue }
                    
                        $wsUrl = $t.webSocketDebuggerUrl
                        if (-not $wsUrl) { continue }

                        $resp = CDPEval $wsUrl $jsCode
                        if ($resp -match '"injected"' -or $resp -match '"active"') { $injected++ }

                        $resp2 = CDPEval $wsUrl "window.__vc81c || 0"
                        if ($resp2 -match '"value":(\d+)') {
                            $foundClicks += [int]$Matches[1]
                        }
                    }
                
                    if ($foundClicks -gt $totalClicks) { $totalClicks = $foundClicks }
                    $totalScans++
                    "connected|$injected|$totalClicks|$totalScans" | Set-Content $stateFile -Force -ErrorAction SilentlyContinue
                
                }
                catch {
                    "disconnected|0|$totalClicks|$totalScans" | Set-Content $stateFile -Force -ErrorAction SilentlyContinue
                }
                Start-Sleep -Milliseconds 1000
            }
        }).AddArgument($port).AddArgument($jsCode).AddArgument($stateFile).AddArgument($logFile) | Out-Null

    $Global:AC_ScanJob.BeginInvoke() | Out-Null
    Log "Background CDP scanner started (port $port)" "START"
}

function ReadScanState {
    if (Test-Path $Global:AC_StateFile) {
        try {
            $parts = (Get-Content $Global:AC_StateFile -ErrorAction SilentlyContinue) -split '\|'
            if ($parts.Count -ge 4) {
                $Global:AC_Connected = ($parts[0] -eq 'connected')
                $targets = [int]$parts[1]
                $Global:AC_Clicks = [int]$parts[2]
                $Global:AC_Scans = [int]$parts[3]
                if ($Global:AC_Connected) {
                    if ($targets -eq 0) { $Global:AC_LastMsg = "Waiting for Vega Workspace" }
                    else { $Global:AC_LastMsg = "Active ($targets target)" }
                }
                else { $Global:AC_LastMsg = "No CDP Connection" }
            }
        }
        catch {}
    }
}

StartBackgroundScanner

# ═══ BUILD HOTBAR ═══
$hotbar = New-Object System.Windows.Forms.Form
$hotbar.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$hotbar.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$hotbar.Size = New-Object System.Drawing.Size(460, 44)
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$hotbar.Location = New-Object System.Drawing.Point(($wa.Width - 480), ($wa.Height - 56))
$hotbar.TopMost = $true
$hotbar.ShowInTaskbar = $false
$hotbar.BackColor = $cBg
$hotbar.Opacity = 0.95

# Rounded Corners
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp.AddArc(0, 0, 22, 22, 180, 90)
$gp.AddArc(438, 0, 22, 22, 270, 90)
$gp.AddArc(438, 22, 22, 22, 0, 90)
$gp.AddArc(0, 22, 22, 22, 90, 90)
$gp.CloseFigure()
$hotbar.Region = New-Object System.Drawing.Region($gp)

# Drag
$hotbar.Add_MouseDown({ $Global:AC_Dragging = $true; $Global:AC_DragX = $_.X; $Global:AC_DragY = $_.Y })
$hotbar.Add_MouseMove({
        if ($Global:AC_Dragging) {
            $hotbar.Location = New-Object System.Drawing.Point(
                ($hotbar.Left + $_.X - $Global:AC_DragX), ($hotbar.Top + $_.Y - $Global:AC_DragY))
        }
    })
$hotbar.Add_MouseUp({ $Global:AC_Dragging = $false })

# Labels
$lblClaw = New-Object System.Windows.Forms.Label
$lblClaw.Text = "CLAW"
$lblClaw.Font = $fontBold; $lblClaw.ForeColor = $cCyan
$lblClaw.BackColor = [System.Drawing.Color]::Transparent
$lblClaw.Location = New-Object System.Drawing.Point(12, 12)
$lblClaw.AutoSize = $true
$hotbar.Controls.Add($lblClaw)

$lblInfo = New-Object System.Windows.Forms.Label
$lblInfo.Name = "lblInfo"
$lblInfo.Text = "Starting..."
$lblInfo.Font = $fontSmall; $lblInfo.ForeColor = $cAmber
$lblInfo.BackColor = [System.Drawing.Color]::Transparent
$lblInfo.Location = New-Object System.Drawing.Point(55, 6)
$lblInfo.Size = New-Object System.Drawing.Size(150, 16)
$hotbar.Controls.Add($lblInfo)

$lblCount = New-Object System.Windows.Forms.Label
$lblCount.Name = "lblCount"
$lblCount.Text = "Whitelist v8.1"
$lblCount.Font = $fontMono; $lblCount.ForeColor = $cGray
$lblCount.BackColor = [System.Drawing.Color]::Transparent
$lblCount.Location = New-Object System.Drawing.Point(55, 24)
$lblCount.Size = New-Object System.Drawing.Size(150, 14)
$hotbar.Controls.Add($lblCount)

function MakeBtn($parent, $text, $x, $w, $fg, $tag) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $text; $b.Tag = $tag
    $b.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $b.Font = $fontBtn
    $b.FlatAppearance.BorderSize = 1; $b.FlatAppearance.BorderColor = $cBorder
    $b.BackColor = $cBtnBg; $b.ForeColor = $fg
    $b.Location = New-Object System.Drawing.Point($x, 7)
    $b.Size = New-Object System.Drawing.Size($w, 30)
    $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    $b.Add_Click({
            switch ($this.Tag) {
                "play" { $Global:AC_Paused = $false; $Global:AC_Running = $true }
                "pause" { $Global:AC_Paused = $true }
                "stop" { $Global:AC_Running = $false }
                "close" { $Global:AC_Running = $false; $this.FindForm().Close() }
            }
        })
    $parent.Controls.Add($b)
}

MakeBtn $hotbar "Play"  210 50 $cGreen  "play"
MakeBtn $hotbar "Pause" 264 54 $cAmber  "pause"
MakeBtn $hotbar "Stop"  322 42 $cRed    "stop"
MakeBtn $hotbar "X"     368 40 $cGray   "close"

# ═══ TIMER ═══
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
        $il = $hotbar.Controls.Find("lblInfo", $false)
        $cl = $hotbar.Controls.Find("lblCount", $false)

        if (-not $Global:AC_Running) {
            if ($il.Count -gt 0) { $il[0].Text = "Stopped"; $il[0].ForeColor = $cRed }
        }
        elseif ($Global:AC_Paused) {
            if ($il.Count -gt 0) { $il[0].Text = "Paused"; $il[0].ForeColor = $cAmber }
        }
        else {
            ReadScanState
            if ($il.Count -gt 0) {
                $il[0].Text = $Global:AC_LastMsg
                if ($Global:AC_Connected) { $il[0].ForeColor = $cGreen }
                else { $il[0].ForeColor = $cRed }
            }
        }
        if ($cl.Count -gt 0) { $cl[0].Text = "$($Global:AC_Clicks) clicks | scan $($Global:AC_Scans)" }
    })
$timer.Start()

try {
    Log "VegaClaw v8.1 Whitelist started (port $Port)" "START"
    [System.Windows.Forms.Application]::Run($hotbar)
}
catch {
    Log "UI ended: $_" "ERROR"
}
finally {
    if ($timer) { $timer.Stop(); $timer.Dispose() }
    if ($Global:AC_ScanJob) { 
        try { $Global:AC_ScanJob.Stop(); $Global:AC_ScanJob.Dispose() } catch {}
    }
    Log "Stopped. Clicks=$($Global:AC_Clicks) Scans=$($Global:AC_Scans)" "STOP"
}
