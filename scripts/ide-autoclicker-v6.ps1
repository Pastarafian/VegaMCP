# VegaClaw IDE AutoClicker v6 — Vision-Based (Claw Pattern)
# Uses screenshot + blue button color detection instead of UI Automation
# Inspired by VegaClaw vision.py: CopyFromScreen + pixel scan + click

param(
    [int]$Interval = 3,
    [switch]$DryRun,
    [int]$Cooldown = 8,
    [string]$LogFile = "$env:TEMP\vegaclaw-autoclicker.log"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class VegaVision {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public const int LEFTDOWN = 0x02;
    public const int LEFTUP = 0x04;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    // Find IDE window by partial title match
    public static IntPtr FindIDE(string[] names) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new System.Text.StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            string title = sb.ToString().ToLower();
            foreach (var n in names) {
                if (title.Contains(n.ToLower())) { found = hWnd; return false; }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    // Capture a region of screen
    public static Bitmap CaptureRegion(int x, int y, int w, int h) {
        var bmp = new Bitmap(w, h);
        using (var g = Graphics.FromImage(bmp)) {
            g.CopyFromScreen(x, y, 0, 0, new Size(w, h));
        }
        return bmp;
    }

    // Scan for blue button regions in a bitmap
    // IDE action buttons are bright blue: ~RGB(0-30, 100-140, 200-240) for VS Code blue
    // Also matches: #007ACC, #0078D4, #1177BB ranges
    public static List<Rectangle> FindBlueButtons(Bitmap bmp, int startX, int startY) {
        var regions = new List<Rectangle>();
        int w = bmp.Width, h = bmp.Height;
        bool[,] visited = new bool[w, h];

        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (visited[x, y]) continue;
                Color c = bmp.GetPixel(x, y);
                if (IsButtonBlue(c)) {
                    // Flood-fill to find the button bounds
                    int minX = x, maxX = x, minY = y, maxY = y;
                    var stack = new Stack<Point>();
                    stack.Push(new Point(x, y));
                    int pixCount = 0;
                    while (stack.Count > 0 && pixCount < 10000) {
                        var p = stack.Pop();
                        if (p.X < 0 || p.X >= w || p.Y < 0 || p.Y >= h) continue;
                        if (visited[p.X, p.Y]) continue;
                        Color pc = bmp.GetPixel(p.X, p.Y);
                        if (!IsButtonBlue(pc) && !IsButtonText(pc)) continue;
                        visited[p.X, p.Y] = true;
                        pixCount++;
                        if (p.X < minX) minX = p.X;
                        if (p.X > maxX) maxX = p.X;
                        if (p.Y < minY) minY = p.Y;
                        if (p.Y > maxY) maxY = p.Y;
                        // 4-connected with stride 2 for speed
                        stack.Push(new Point(p.X + 1, p.Y));
                        stack.Push(new Point(p.X - 1, p.Y));
                        stack.Push(new Point(p.X, p.Y + 1));
                        stack.Push(new Point(p.X, p.Y - 1));
                    }
                    int bw = maxX - minX;
                    int bh = maxY - minY;
                    // Button must be reasonable size: 40-300px wide, 18-50px tall
                    if (bw >= 40 && bw <= 300 && bh >= 18 && bh <= 50 && pixCount > 200) {
                        regions.Add(new Rectangle(startX + minX, startY + minY, bw, bh));
                    }
                }
            }
        }
        return regions;
    }

    // VS Code / Antigravity blue button colors
    static bool IsButtonBlue(Color c) {
        return c.B > 160 && c.R < 80 && c.G > 80 && c.G < 180 &&
               (c.B - c.R) > 100;
    }

    // White text on blue button
    static bool IsButtonText(Color c) {
        return c.R > 200 && c.G > 200 && c.B > 200;
    }

    public static void Click(int x, int y) {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(50);
        mouse_event(LEFTDOWN | LEFTUP, 0, 0, 0, 0);
    }
}
"@ -ReferencedAssemblies System.Drawing

# ═══ STATE ═══
$Global:AC_Running = $true
$Global:AC_Paused = $false
$Global:AC_Clicks = 0
$Global:AC_Scans = 0
$Global:AC_LastMsg = "Ready"
$Global:AC_SpeedMs = ($Interval * 1000)
$Global:AC_Dragging = $false
$Global:AC_DragX = 0; $Global:AC_DragY = 0
$Global:AC_ClickCooldown = @{}

$IDESearchNames = @("Antigravity", "Visual Studio Code", "Cursor", "Windsurf")

# ═══ FONTS & COLORS ═══
$fontBold = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Regular)
$fontMono = New-Object System.Drawing.Font("Consolas", 7, [System.Drawing.FontStyle]::Regular)
$fontBtn = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
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

# ═══ VISION SCANNER ═══
function RunVisionScan {
    foreach ($ideName in $IDESearchNames) {
        $hwnd = [VegaVision]::FindIDE(@($ideName))
        if ($hwnd -eq [IntPtr]::Zero) { continue }

        $rect = New-Object VegaVision+RECT
        [VegaVision]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
        $ww = $rect.Right - $rect.Left
        $wh = $rect.Bottom - $rect.Top
        if ($ww -lt 200 -or $wh -lt 200) { continue }

        # Only scan the RIGHT 60% of the window (chat panel area)
        $scanX = $rect.Left + [int]($ww * 0.4)
        $scanY = $rect.Top
        $scanW = $ww - [int]($ww * 0.4)
        $scanH = $wh

        try {
            $bmp = [VegaVision]::CaptureRegion($scanX, $scanY, $scanW, $scanH)
            $buttons = [VegaVision]::FindBlueButtons($bmp, $scanX, $scanY)
            $bmp.Dispose()

            if ($buttons.Count -gt 0) {
                foreach ($btn in $buttons) {
                    $cx = $btn.X + [int]($btn.Width / 2)
                    $cy = $btn.Y + [int]($btn.Height / 2)
                    $key = "$cx-$cy"

                    # Cooldown check
                    if ($Global:AC_ClickCooldown.ContainsKey($key)) {
                        if (((Get-Date) - $Global:AC_ClickCooldown[$key]).TotalSeconds -lt $Cooldown) { continue }
                    }

                    if ($DryRun) {
                        Log "[DRY] Blue button at ($cx, $cy) size $($btn.Width)x$($btn.Height) in $ideName" "MATCH"
                    }
                    else {
                        [VegaVision]::Click($cx, $cy)
                        $Global:AC_Clicks++
                        $Global:AC_ClickCooldown[$key] = Get-Date
                        $Global:AC_LastMsg = "Clicked ($cx,$cy) $ideName"
                        Log "CLICKED blue button at ($cx,$cy) $($btn.Width)x$($btn.Height) in $ideName [$($Global:AC_Clicks)]" "CLICK"
                    }
                }
            }
        }
        catch {
            Log "Vision scan error: $($_.Exception.Message)" "ERROR"
        }
    }
    $Global:AC_Scans++
}

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
$hotbar.AllowTransparency = $true

# Rounded region
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp.AddArc(0, 0, 22, 22, 180, 90); $gp.AddArc(438, 0, 22, 22, 270, 90)
$gp.AddArc(438, 22, 22, 22, 0, 90); $gp.AddArc(0, 22, 22, 22, 90, 90); $gp.CloseFigure()
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
$lblClaw.Text = "CLAW"; $lblClaw.Font = $fontBold; $lblClaw.ForeColor = $cCyan
$lblClaw.BackColor = [System.Drawing.Color]::Transparent
$lblClaw.Location = New-Object System.Drawing.Point(12, 12); $lblClaw.AutoSize = $true
$hotbar.Controls.Add($lblClaw)

$lblInfo = New-Object System.Windows.Forms.Label
$lblInfo.Name = "lblInfo"; $lblInfo.Text = "Vision Ready"
$lblInfo.Font = $fontSmall; $lblInfo.ForeColor = $cGreen
$lblInfo.BackColor = [System.Drawing.Color]::Transparent
$lblInfo.Location = New-Object System.Drawing.Point(55, 6); $lblInfo.Size = New-Object System.Drawing.Size(150, 16)
$hotbar.Controls.Add($lblInfo)

$lblCount = New-Object System.Windows.Forms.Label
$lblCount.Name = "lblCount"; $lblCount.Text = "0 clicks | vision"
$lblCount.Font = $fontMono; $lblCount.ForeColor = $cGray
$lblCount.BackColor = [System.Drawing.Color]::Transparent
$lblCount.Location = New-Object System.Drawing.Point(55, 24); $lblCount.Size = New-Object System.Drawing.Size(150, 14)
$hotbar.Controls.Add($lblCount)

# Buttons
function MakeBtn($parent, $text, $x, $w, $fg, $tag) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $text; $b.Tag = $tag
    $b.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat; $b.Font = $fontBtn
    $b.FlatAppearance.BorderSize = 1; $b.FlatAppearance.BorderColor = $cBorder
    $b.BackColor = $cBtnBg; $b.ForeColor = $fg
    $b.Location = New-Object System.Drawing.Point($x, 7)
    $b.Size = New-Object System.Drawing.Size($w, 30)
    $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    $b.Add_Click({
            switch ($this.Tag) {
                "play" { $Global:AC_Paused = $false; $Global:AC_Running = $true; $Global:AC_LastMsg = "Running" }
                "pause" { $Global:AC_Paused = $true; $Global:AC_LastMsg = "Paused" }
                "speed" {
                    if ($Global:AC_SpeedMs -le 1500) { $Global:AC_SpeedMs = 5000; $this.Text = "5s" }
                    elseif ($Global:AC_SpeedMs -le 3000) { $Global:AC_SpeedMs = 1000; $this.Text = "1s" }
                    else { $Global:AC_SpeedMs = 3000; $this.Text = "3s" }
                }
                "stop" { $Global:AC_Running = $false; $Global:AC_LastMsg = "Stopped" }
                "close" { $Global:AC_Running = $false; $this.FindForm().Close() }
            }
        })
    $parent.Controls.Add($b)
}

MakeBtn $hotbar "Play"  210 50 $cGreen  "play"
MakeBtn $hotbar "Pause" 264 54 $cAmber  "pause"
MakeBtn $hotbar "3s"    322 34 $cPurple "speed"
MakeBtn $hotbar "Stop"  360 42 $cRed    "stop"
MakeBtn $hotbar "X"     406 40 $cGray   "close"

# ═══ TIMER ═══
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $Global:AC_SpeedMs
$timer.Add_Tick({
        $timer.Interval = $Global:AC_SpeedMs

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
            RunVisionScan
        }
        if ($cl.Count -gt 0) { $cl[0].Text = "$($Global:AC_Clicks) clicks | scan $($Global:AC_Scans)" }

        # Prune cooldown
        if ($Global:AC_Scans % 20 -eq 0 -and $Global:AC_Scans -gt 0) {
            $now = Get-Date
            $exp = @($Global:AC_ClickCooldown.Keys | Where-Object { ($now - $Global:AC_ClickCooldown[$_]).TotalSeconds -gt ($Cooldown * 3) })
            foreach ($k in $exp) { $Global:AC_ClickCooldown.Remove($k) }
            Log "Scans=$($Global:AC_Scans) Clicks=$($Global:AC_Clicks) Speed=$($Global:AC_SpeedMs)ms" "STATUS"
        }
    })
$timer.Start()

Log "VegaClaw AutoClicker v6 VISION started" "START"
Log "Interval=${Interval}s DryRun=$DryRun Cooldown=${Cooldown}s" "CONFIG"
Log "Strategy: Screenshot + Blue button color detection (Claw pattern)" "CONFIG"

[System.Windows.Forms.Application]::Run($hotbar)
$timer.Stop(); $timer.Dispose()
Log "Stopped. Clicks=$($Global:AC_Clicks) Scans=$($Global:AC_Scans)" "STOP"
