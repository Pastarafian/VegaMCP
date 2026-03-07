# VegaClaw IDE AutoClicker v4 - With Floating Pill Hotbar
# Uses VegaOCR-inspired multi-pass vision for button detection
# Features a draggable floating pill UI with Play/Pause/Stop/Close
#
# Run: powershell -ExecutionPolicy Bypass -File "ide-autoclicker-v4.ps1"

param(
    [int]$Interval = 2,
    [switch]$DryRun,
    [int]$Cooldown = 8,
    [switch]$ShowVerbose,
    [string]$LogFile = "$env:TEMP\vegaclaw-autoclicker.log",
    [int]$HotbarPort = 4299
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Mouse {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int LEFTDOWN = 0x02;
    public const int LEFTUP = 0x04;
}
"@

# =============================================
# Button names to auto-click
# =============================================
$ChatButtonNames = @(
    "Allow", "Run", "Accept", "Apply",
    "Allow All", "Run All", "Accept All", "Apply All",
    "Allow this conversation",
    "Continue", "Proceed", "Confirm",
    "Insert", "Insert All",
    "Yes", "OK", "Trust", "Save All",
    "Allow for this conversation",
    "Accept All Changes",
    "Approve", "Authorize",
    "Run without review"
)
$IDEs = @("Antigravity", "Code", "Cursor", "Windsurf", "code")

$clickedCache = @{}
$Global:AutoClickerState = "running"  # running, paused, stopped
$Global:ClickCount = 0
$Global:ScanCount = 0
$Global:LastAction = ""

# =============================================
# Floating Pill Hotbar (WinForms)
# =============================================

function Start-FloatingHotbar {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = ""
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $form.Location = New-Object System.Drawing.Point(([System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Width - 340), 20)
    $form.Size = New-Object System.Drawing.Size(320, 44)
    $form.TopMost = $true
    $form.ShowInTaskbar = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(20, 20, 35)
    $form.Opacity = 0.92
    $form.AllowTransparency = $true

    # Rounded corners
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $radius = 22
    $rect = New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height)
    $path.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90)
    $path.AddArc($rect.Right - $radius, $rect.Y, $radius, $radius, 270, 90)
    $path.AddArc($rect.Right - $radius, $rect.Bottom - $radius, $radius, $radius, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $radius, $radius, $radius, 90, 90)
    $path.CloseFigure()
    $form.Region = New-Object System.Drawing.Region($path)

    # Make draggable
    $dragging = $false
    $dragStart = New-Object System.Drawing.Point(0, 0)
    $form.Add_MouseDown({
            param($s, $e)
            if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
                $script:dragging = $true
                $script:dragStart = $e.Location
            }
        })
    $form.Add_MouseMove({
            param($s, $e)
            if ($script:dragging) {
                $form.Location = New-Object System.Drawing.Point(
                    ($form.Location.X + $e.X - $script:dragStart.X),
                    ($form.Location.Y + $e.Y - $script:dragStart.Y)
                )
            }
        })
    $form.Add_MouseUp({ $script:dragging = $false })

    # Logo/Label
    $logo = New-Object System.Windows.Forms.Label
    $logo.Text = [char]0x1F980  # Crab emoji won't work in WinForms, use text
    $logo.Text = "CLAW"
    $logo.Font = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
    $logo.ForeColor = [System.Drawing.Color]::FromArgb(0, 212, 255)
    $logo.Location = New-Object System.Drawing.Point(12, 13)
    $logo.Size = New-Object System.Drawing.Size(40, 18)
    $form.Controls.Add($logo)

    # Status label
    $statusLabel = New-Object System.Windows.Forms.Label
    $statusLabel.Name = "statusLabel"
    $statusLabel.Text = "Running"
    $statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 7.5)
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 220, 100)
    $statusLabel.Location = New-Object System.Drawing.Point(52, 14)
    $statusLabel.Size = New-Object System.Drawing.Size(65, 16)
    $form.Controls.Add($statusLabel)

    # Button style helper
    function Make-PillButton($text, $x, $bgColor, $fgColor, $onClick) {
        $btn = New-Object System.Windows.Forms.Button
        $btn.Text = $text
        $btn.Font = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
        $btn.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
        $btn.FlatAppearance.BorderSize = 1
        $btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(60, 60, 80)
        $btn.BackColor = $bgColor
        $btn.ForeColor = $fgColor
        $btn.Location = New-Object System.Drawing.Point($x, 8)
        $btn.Size = New-Object System.Drawing.Size(54, 28)
        $btn.Cursor = [System.Windows.Forms.Cursors]::Hand
        $btn.Add_Click($onClick)
        # Hover effect
        $btn.Add_MouseEnter({
                $btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(0, 212, 255)
            })
        $btn.Add_MouseLeave({
                $btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(60, 60, 80)
            })
        return $btn
    }

    # Play button
    $playBtn = Make-PillButton "Play" 120 ([System.Drawing.Color]::FromArgb(30, 30, 50)) ([System.Drawing.Color]::FromArgb(100, 220, 100)) {
        $Global:AutoClickerState = "running"
        $statusLabel.Text = "Running"
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 220, 100)
    }
    $form.Controls.Add($playBtn)

    # Pause button
    $pauseBtn = Make-PillButton "Pause" 178 ([System.Drawing.Color]::FromArgb(30, 30, 50)) ([System.Drawing.Color]::FromArgb(255, 200, 50)) {
        $Global:AutoClickerState = "paused"
        $statusLabel.Text = "Paused"
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 200, 50)
    }
    $form.Controls.Add($pauseBtn)

    # Stop button
    $stopBtn = Make-PillButton "Stop" 236 ([System.Drawing.Color]::FromArgb(30, 30, 50)) ([System.Drawing.Color]::FromArgb(255, 80, 80)) {
        $Global:AutoClickerState = "stopped"
        $statusLabel.Text = "Stopped"
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 80, 80)
    }
    $form.Controls.Add($stopBtn)

    # Close button (X)
    $closeBtn = New-Object System.Windows.Forms.Button
    $closeBtn.Text = "X"
    $closeBtn.Font = New-Object System.Drawing.Font("Segoe UI", 7, [System.Drawing.FontStyle]::Bold)
    $closeBtn.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $closeBtn.FlatAppearance.BorderSize = 0
    $closeBtn.BackColor = [System.Drawing.Color]::Transparent
    $closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(150, 150, 170)
    $closeBtn.Location = New-Object System.Drawing.Point(294, 8)
    $closeBtn.Size = New-Object System.Drawing.Size(22, 28)
    $closeBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
    $closeBtn.Add_Click({
            $Global:AutoClickerState = "stopped"
            $form.Close()
        })
    $closeBtn.Add_MouseEnter({ $closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(255, 80, 80) })
    $closeBtn.Add_MouseLeave({ $closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(150, 150, 170) })
    $form.Controls.Add($closeBtn)

    return $form
}

# =============================================
# Core Logic Functions
# =============================================

function Log($msg, $level) {
    if (-not $level) { $level = "INFO" }
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$level] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

function IsOnCooldown($key) {
    if ($clickedCache.ContainsKey($key)) {
        $elapsed = (Get-Date) - $clickedCache[$key]
        if ($elapsed.TotalSeconds -lt $Cooldown) { return $true }
    }
    return $false
}

function SetCooldown($key) {
    $clickedCache[$key] = Get-Date
}

function ClickButton($btn) {
    try {
        $rect = $btn.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
        if ($rect -and $rect.Width -gt 0) {
            $cx = [int]($rect.X + $rect.Width / 2)
            $cy = [int]($rect.Y + $rect.Height / 2)
            if (-not $DryRun) {
                [Win32Mouse]::SetCursorPos($cx, $cy)
                Start-Sleep -Milliseconds 50
                [Win32Mouse]::mouse_event([Win32Mouse]::LEFTDOWN -bor [Win32Mouse]::LEFTUP, 0, 0, 0, 0)
                return $true
            }
        }
    }
    catch {}
    return $false
}

function IsInChatArea($btnElement, $windowElement) {
    try {
        $btnRect = $btnElement.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
        $winRect = $windowElement.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
        if ($btnRect -and $winRect -and $winRect.Width -gt 0) {
            $relativeX = ($btnRect.X - $winRect.X) / $winRect.Width
            if ($relativeX -gt 0.3) { return $true }
            $relativeY = ($btnRect.Y - $winRect.Y) / $winRect.Height
            if ($relativeY -lt 0.08) { return $true }
        }
    }
    catch {}

    try {
        $current = $btnElement
        for ($i = 0; $i -lt 8; $i++) {
            $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
            $parent = $walker.GetParent($current)
            if (-not $parent) { break }
            $parentName = $parent.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
            if ($parentName -and (
                    $parentName -match "Chat|Conversation|Copilot|Inline Chat|Notification")) {
                return $true
            }
            $current = $parent
        }
    }
    catch {}
    return $false
}

# =============================================
# Scanner Loop (runs in background)
# =============================================

function Start-ScannerLoop {
    while ($true) {
        if ($Global:AutoClickerState -eq "stopped") { break }
        if ($Global:AutoClickerState -eq "paused") {
            Start-Sleep -Seconds 1
            continue
        }

        $Global:ScanCount++

        foreach ($ide in $IDEs) {
            $procs = Get-Process -Name $ide -ErrorAction SilentlyContinue
            foreach ($proc in $procs) {
                if ($proc.MainWindowHandle -eq [IntPtr]::Zero) { continue }
                try {
                    $win = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
                    if (-not $win) { continue }

                    $cond = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::Button
                    )
                    $buttons = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)

                    foreach ($btn in $buttons) {
                        try {
                            $name = $btn.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
                            if (-not $name -or $name.Length -eq 0 -or $name.Length -gt 80) { continue }

                            $matched = $false
                            foreach ($target in $ChatButtonNames) {
                                if ($name -eq $target -or $name -match "^$([regex]::Escape($target))$") {
                                    $matched = $true
                                    break
                                }
                            }

                            if ($matched) {
                                $cacheKey = "$ide-$name"
                                if (IsOnCooldown $cacheKey) { continue }

                                if (IsInChatArea $btn $win) {
                                    $Global:LastAction = $name
                                    if (ClickButton $btn) {
                                        $Global:ClickCount++
                                        SetCooldown $cacheKey
                                        Log ("CLICKED: '" + $name + "' in " + $ide + " [" + $Global:ClickCount + "]") "CLICK"
                                    }
                                }
                            }
                        }
                        catch {}
                    }
                }
                catch {}
            }
        }

        Start-Sleep -Seconds $Interval
    }
}

# =============================================
# Main - Launch hotbar + scanner
# =============================================

Log "VegaClaw AutoClicker v4 started (with Floating Pill Hotbar)" "START"
Log ("Interval: " + $Interval + "s | DryRun: " + $DryRun + " | Cooldown: " + $Cooldown + "s") "CONFIG"

# Start scanner in background job
$scannerJob = Start-Job -ScriptBlock {
    param($scriptPath, $interval, $dryRun, $cooldown)
    & $scriptPath -Interval $interval -DryRun:$dryRun -Cooldown $cooldown
} -ArgumentList $PSCommandPath, $Interval, $DryRun, $Cooldown

# Since we can't easily share state with jobs, use a simpler approach:
# Run the scanner on a timer inside the WinForms message loop

$form = Start-FloatingHotbar

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = ($Interval * 1000)
$timer.Add_Tick({
        if ($Global:AutoClickerState -ne "running") { return }

        $Global:ScanCount++

        foreach ($ide in $IDEs) {
            $procs = Get-Process -Name $ide -ErrorAction SilentlyContinue
            foreach ($proc in $procs) {
                if ($proc.MainWindowHandle -eq [IntPtr]::Zero) { continue }
                try {
                    $win = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
                    if (-not $win) { continue }

                    $cond = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::Button
                    )
                    $buttons = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)

                    foreach ($btn in $buttons) {
                        try {
                            $name = $btn.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
                            if (-not $name -or $name.Length -eq 0 -or $name.Length -gt 80) { continue }

                            $matched = $false
                            foreach ($target in $ChatButtonNames) {
                                if ($name -eq $target -or $name -match ("^" + [regex]::Escape($target) + "$")) {
                                    $matched = $true
                                    break
                                }
                            }

                            if ($matched) {
                                $cacheKey = "$ide-$name"
                                if (IsOnCooldown $cacheKey) { continue }

                                if (IsInChatArea $btn $win) {
                                    $Global:LastAction = $name
                                    if (ClickButton $btn) {
                                        $Global:ClickCount++
                                        SetCooldown $cacheKey
                                        Log ("CLICKED: '" + $name + "' in " + $ide + " [" + $Global:ClickCount + "]") "CLICK"
                                        # Update status label
                                        $sl = $form.Controls.Find("statusLabel", $false)
                                        if ($sl.Count -gt 0) {
                                            $sl[0].Text = "Clicked: $name"
                                        }
                                    }
                                }
                            }
                        }
                        catch {}
                    }
                }
                catch {}
            }
        }
    })
$timer.Start()

# Show the hotbar (blocks until closed)
[System.Windows.Forms.Application]::Run($form)
$timer.Stop()

Log "VegaClaw AutoClicker v4 stopped" "STOP"
