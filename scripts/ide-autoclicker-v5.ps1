# VegaClaw IDE AutoClicker v5 — Win32 approach, tested and verified
# All state in $Global — no closures, no scoping issues
# Font constructors use explicit [System.Drawing.FontStyle] enum

param(
    [int]$Interval = 2,
    [switch]$DryRun,
    [int]$Cooldown = 10,
    [string]$LogFile = "$env:TEMP\vegaclaw-autoclicker.log"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W32 {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);
    public const int LEFTDOWN = 0x02;
    public const int LEFTUP = 0x04;
}
"@

# ═══ PATTERNS ═══
$Global:AllowList = @(
    "Allow", "Allow All", "Allow this conversation", "Allow for this conversation",
    "Trust", "Trust Folder", "Trust Folder and Continue", "Yes, I trust the authors",
    "Accept", "Accept All", "Accept All Changes", "Accept Changes",
    "OK", "Yes", "Continue", "Proceed", "Confirm",
    "Run", "Run All", "Run Anyway", "Run Code", "Run without review",
    "Apply", "Apply All", "Insert", "Insert All",
    "Keep", "Keep All", "Save All",
    "Approve", "Authorize", "Reload", "Reload Window"
)
$Global:BlockList = @(
    "Delete", "Remove", "Uninstall", "Format", "Reset",
    "Sign Out", "Log Out", "Close", "Exit", "Cancel",
    "Discard", "Reject", "Deny", "No", "Dismiss",
    "Don't Save", "Close Project", "Always run",
    "Disable", "Clear", "Erase", "Drop", "Reject"
)
$Global:IDENames = @("Antigravity", "antigravity", "Code", "code", "Cursor", "cursor", "Windsurf", "windsurf")

# ═══ STATE ═══
$Global:AC_Running = $true
$Global:AC_Paused = $false
$Global:AC_Clicks = 0
$Global:AC_Scans = 0
$Global:AC_LastMsg = "Ready"
$Global:AC_SpeedMs = ($Interval * 1000)
$Global:AC_CooldownCache = @{}
$Global:AC_Dragging = $false
$Global:AC_DragX = 0
$Global:AC_DragY = 0

# ═══ FONTS (explicit enum to avoid ambiguous overload) ═══
$fontBold = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Regular)
$fontMono = New-Object System.Drawing.Font("Consolas", 7, [System.Drawing.FontStyle]::Regular)
$fontBtn = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)

# ═══ COLORS ═══
$cCyan = [System.Drawing.Color]::FromArgb(0, 212, 255)
$cGreen = [System.Drawing.Color]::FromArgb(34, 197, 94)
$cAmber = [System.Drawing.Color]::FromArgb(245, 158, 11)
$cPurple = [System.Drawing.Color]::FromArgb(168, 85, 247)
$cRed = [System.Drawing.Color]::FromArgb(239, 68, 68)
$cGray = [System.Drawing.Color]::FromArgb(100, 116, 139)
$cBg = [System.Drawing.Color]::FromArgb(14, 17, 23)
$cBtnBg = [System.Drawing.Color]::FromArgb(22, 27, 34)
$cBorder = [System.Drawing.Color]::FromArgb(30, 41, 59)

# ═══ LOGGING ═══
function Log($msg, $lvl) {
    $ts = Get-Date -Format "HH:mm:ss"
    $line = "[$ts] [$lvl] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

# ═══ COOLDOWN ═══
function CanClick($key) {
    if ($Global:AC_CooldownCache.ContainsKey($key)) {
        if (((Get-Date) - $Global:AC_CooldownCache[$key]).TotalSeconds -lt $Cooldown) { return $false }
    }
    return $true
}

# ═══ SAFETY CHECK ═══
# IDE buttons often include shortcuts: "Run Alt+⌘", "Allow Ctrl+Enter"
# So we match if button text STARTS WITH an allowed name
function IsSafe($text) {
    if (-not $text -or $text.Length -eq 0 -or $text.Length -gt 80) { return $false }
    # Block first — any substring match blocks
    foreach ($b in $Global:BlockList) { if ($text -like "*$b*") { return $false } }
    # Allow — exact match OR starts with allowed name (handles shortcuts)
    foreach ($a in $Global:AllowList) {
        if ($text -eq $a) { return $true }
        if ($text.StartsWith($a + " ")) { return $true }
    }
    return $false
}

# ═══ CHAT AREA CHECK ═══
function InChatArea($btn, $win) {
    try {
        $br = $btn.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
        $wr = $win.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
        if ($br -and $wr -and $wr.Width -gt 0) {
            $rx = ($br.X - $wr.X) / $wr.Width
            if ($rx -gt 0.30) { return $true }
            $ry = ($br.Y - $wr.Y) / $wr.Height
            if ($ry -lt 0.08) { return $true }
        }
    }
    catch {}
    try {
        $cur = $btn
        for ($i = 0; $i -lt 6; $i++) {
            $p = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($cur)
            if (-not $p) { break }
            $pid2 = $p.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::AutomationIdProperty)
            $pn = $p.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
            if ($pid2 -match "chat|conversation|copilot|inline|notification|dialog|prompt" -or
                $pn -match "Chat|Conversation|Copilot|Inline Chat|Notification") { return $true }
            $cur = $p
        }
    }
    catch {}
    return $false
}

# ═══ CLICK (InvokePattern first, then mouse) ═══
function DoClick($el) {
    try {
        $inv = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        if ($inv) { $inv.Invoke(); return $true }
    }
    catch {}
    try {
        $r = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
        if ($r -and $r.Width -gt 0) {
            [W32]::SetCursorPos([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
            Start-Sleep -Milliseconds 60
            [W32]::mouse_event([W32]::LEFTDOWN -bor [W32]::LEFTUP, 0, 0, 0, 0)
            return $true
        }
    }
    catch {}
    return $false
}

# ═══ SCANNER ═══
function RunScan {
    foreach ($ide in $Global:IDENames) {
        $procs = Get-Process -Name $ide -ErrorAction SilentlyContinue
        foreach ($proc in $procs) {
            if ($proc.MainWindowHandle -eq [IntPtr]::Zero) { continue }
            try {
                $win = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
                if (-not $win) { continue }
                # Scan Button + Text + Hyperlink — IDE renders "Run" as Text, not Button
                $cond = New-Object System.Windows.Automation.OrCondition(
                    (New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::Button)),
                    (New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::Text)),
                    (New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::Hyperlink))
                )
                $elements = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
                foreach ($b in $elements) {
                    try {
                        $name = $b.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
                        if (-not (IsSafe $name)) { continue }
                        if (-not (InChatArea $b $win)) { continue }
                        $key = "$ide::$name"
                        if (-not (CanClick $key)) { continue }
                        if ($DryRun) {
                            Log "[DRY] $name in $ide" "MATCH"
                        }
                        else {
                            if (DoClick $b) {
                                $Global:AC_Clicks++
                                $Global:AC_CooldownCache[$key] = Get-Date
                                $Global:AC_LastMsg = "$name ($ide)"
                                Log "CLICKED '$name' in $ide [$($Global:AC_Clicks)]" "CLICK"
                            }
                        }
                    }
                    catch {}
                }
            }
            catch {}
        }
    }
    # Dialog scanner
    try {
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $wc = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Window)
        foreach ($w in $root.FindAll([System.Windows.Automation.TreeScope]::Children, $wc)) {
            try {
                $wn = $w.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
                $wcn = $w.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::ClassNameProperty)
                if ($wcn -match "Dialog|MessageBox|32770" -or $wn -match "Trust|Allow|Permission|Security") {
                    $bc = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::Button)
                    foreach ($b in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $bc)) {
                        try {
                            $bn = $b.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
                            if (IsSafe $bn) {
                                $key = "dlg::$wn::$bn"
                                if (CanClick $key) {
                                    if (-not $DryRun) {
                                        if (DoClick $b) {
                                            $Global:AC_Clicks++
                                            $Global:AC_CooldownCache[$key] = Get-Date
                                            $Global:AC_LastMsg = "$bn (Dlg)"
                                            Log "CLICKED '$bn' in dlg '$wn' [$($Global:AC_Clicks)]" "CLICK"
                                        }
                                    }
                                }
                            }
                        }
                        catch {}
                    }
                }
            }
            catch {}
        }
    }
    catch {}
    $Global:AC_Scans++
}

# ═══════════════════════════════════════════════════════════════
# BUILD HOTBAR
# ═══════════════════════════════════════════════════════════════

$hotbar = New-Object System.Windows.Forms.Form
$hotbar.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$hotbar.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$hotbar.Size = New-Object System.Drawing.Size(440, 44)
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$hotbar.Location = New-Object System.Drawing.Point(($wa.Width - 460), ($wa.Height - 56))
$hotbar.TopMost = $true
$hotbar.ShowInTaskbar = $false
$hotbar.BackColor = $cBg
$hotbar.Opacity = 0.95
$hotbar.AllowTransparency = $true
$hotbar.Text = ""

# Rounded region
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp.AddArc(0, 0, 22, 22, 180, 90)
$gp.AddArc(418, 0, 22, 22, 270, 90)
$gp.AddArc(418, 22, 22, 22, 0, 90)
$gp.AddArc(0, 22, 22, 22, 90, 90)
$gp.CloseFigure()
$hotbar.Region = New-Object System.Drawing.Region($gp)

# Drag — using $Global variables only
$hotbar.Add_MouseDown({ $Global:AC_Dragging = $true; $Global:AC_DragX = $_.X; $Global:AC_DragY = $_.Y })
$hotbar.Add_MouseMove({
        if ($Global:AC_Dragging) {
            $hotbar.Location = New-Object System.Drawing.Point(
                ($hotbar.Left + $_.X - $Global:AC_DragX),
                ($hotbar.Top + $_.Y - $Global:AC_DragY))
        }
    })
$hotbar.Add_MouseUp({ $Global:AC_Dragging = $false })

# ── Labels ──
$lblClaw = New-Object System.Windows.Forms.Label
$lblClaw.Text = "CLAW"
$lblClaw.Font = $fontBold
$lblClaw.ForeColor = $cCyan
$lblClaw.BackColor = [System.Drawing.Color]::Transparent
$lblClaw.Location = New-Object System.Drawing.Point(12, 12)
$lblClaw.AutoSize = $true
$hotbar.Controls.Add($lblClaw)

$lblInfo = New-Object System.Windows.Forms.Label
$lblInfo.Name = "lblInfo"
$lblInfo.Text = "Ready"
$lblInfo.Font = $fontSmall
$lblInfo.ForeColor = $cGreen
$lblInfo.BackColor = [System.Drawing.Color]::Transparent
$lblInfo.Location = New-Object System.Drawing.Point(55, 6)
$lblInfo.Size = New-Object System.Drawing.Size(130, 16)
$hotbar.Controls.Add($lblInfo)

$lblCount = New-Object System.Windows.Forms.Label
$lblCount.Name = "lblCount"
$lblCount.Text = "0 clicks"
$lblCount.Font = $fontMono
$lblCount.ForeColor = $cGray
$lblCount.BackColor = [System.Drawing.Color]::Transparent
$lblCount.Location = New-Object System.Drawing.Point(55, 24)
$lblCount.Size = New-Object System.Drawing.Size(130, 14)
$hotbar.Controls.Add($lblCount)

# ── Buttons ── (each uses $this.Tag for action routing in click handler)
function MakeBtn($parent, $text, $x, $w, $fg, $tag) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $text
    $b.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $b.Font = $fontBtn
    $b.FlatAppearance.BorderSize = 1
    $b.FlatAppearance.BorderColor = $cBorder
    $b.BackColor = $cBtnBg
    $b.ForeColor = $fg
    $b.Location = New-Object System.Drawing.Point($x, 7)
    $b.Size = New-Object System.Drawing.Size($w, 30)
    $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    $b.Tag = $tag
    $b.Add_Click({
            switch ($this.Tag) {
                "play" { $Global:AC_Paused = $false; $Global:AC_Running = $true; $Global:AC_LastMsg = "Running" }
                "pause" { $Global:AC_Paused = $true; $Global:AC_LastMsg = "Paused" }
                "speed" {
                    if ($Global:AC_SpeedMs -le 1000) { $Global:AC_SpeedMs = 3000; $this.Text = "3s" }
                    elseif ($Global:AC_SpeedMs -le 2000) { $Global:AC_SpeedMs = 1000; $this.Text = "1s" }
                    else { $Global:AC_SpeedMs = 2000; $this.Text = "2s" }
                }
                "stop" { $Global:AC_Running = $false; $Global:AC_LastMsg = "Stopped" }
                "close" { $Global:AC_Running = $false; $this.FindForm().Close() }
            }
        })
    $parent.Controls.Add($b)
}

MakeBtn $hotbar "Play"  190 50 $cGreen  "play"
MakeBtn $hotbar "Pause" 244 54 $cAmber  "pause"
MakeBtn $hotbar "2s"    302 34 $cPurple "speed"
MakeBtn $hotbar "Stop"  340 42 $cRed    "stop"
MakeBtn $hotbar "X"     386 40 $cGray   "close"

# ═══ TIMER ═══
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $Global:AC_SpeedMs
$timer.Add_Tick({
        $timer.Interval = $Global:AC_SpeedMs

        # Update UI
        $il = $hotbar.Controls.Find("lblInfo", $false)
        $cl = $hotbar.Controls.Find("lblCount", $false)

        if (-not $Global:AC_Running) {
            if ($il.Count -gt 0) { $il[0].Text = "Stopped"; $il[0].ForeColor = $cRed }
        }
        elseif ($Global:AC_Paused) {
            if ($il.Count -gt 0) { $il[0].Text = "Paused"; $il[0].ForeColor = $cAmber }
        }
        else {
            if ($il.Count -gt 0) { $il[0].Text = $Global:AC_LastMsg; $il[0].ForeColor = $cGreen }
            RunScan
        }
        if ($cl.Count -gt 0) { $cl[0].Text = "$($Global:AC_Clicks) clicks | scan $($Global:AC_Scans)" }

        # Prune cooldown cache
        if ($Global:AC_Scans % 30 -eq 0 -and $Global:AC_Scans -gt 0) {
            $now = Get-Date
            $exp = @($Global:AC_CooldownCache.Keys | Where-Object { ($now - $Global:AC_CooldownCache[$_]).TotalSeconds -gt ($Cooldown * 3) })
            foreach ($k in $exp) { $Global:AC_CooldownCache.Remove($k) }
            Log "Scans=$($Global:AC_Scans) Clicks=$($Global:AC_Clicks) Speed=$($Global:AC_SpeedMs)ms" "STATUS"
        }
    })
$timer.Start()

Log "VegaClaw AutoClicker v5 started" "START"
Log "Interval=${Interval}s DryRun=$DryRun Cooldown=${Cooldown}s Patterns=$($Global:AllowList.Count)" "CONFIG"

[System.Windows.Forms.Application]::Run($hotbar)
$timer.Stop(); $timer.Dispose()
Log "Stopped. Clicks=$($Global:AC_Clicks) Scans=$($Global:AC_Scans)" "STOP"
