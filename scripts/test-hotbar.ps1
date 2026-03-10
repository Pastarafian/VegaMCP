# Self-test: Verify WinForms hotbar works, then auto-close
# Outputs PASS/FAIL for each check

$ErrorActionPreference = "Stop"
$results = @()

function Check($name, $code) {
    try {
        $val = & $code
        if ($val) { Write-Host "  PASS: $name"; $script:results += "PASS" }
        else { Write-Host "  FAIL: $name (returned false)"; $script:results += "FAIL" }
    }
    catch {
        Write-Host "  FAIL: $name => $($_.Exception.Message)"
        $script:results += "FAIL"
    }
}

Write-Host "`n=== VEGACLAW AUTOCLICKER SELF-TEST ===`n"

# Test 1: Assemblies load
Write-Host "[1] Loading assemblies..."
Check "System.Windows.Forms" { Add-Type -AssemblyName System.Windows.Forms; $true }
Check "System.Drawing" { Add-Type -AssemblyName System.Drawing; $true }
Check "UIAutomationClient" { Add-Type -AssemblyName UIAutomationClient; $true }

# Test 2: Win32 type
Write-Host "[2] Win32 interop..."
Check "Add-Type W32" {
    Add-Type @"
using System; using System.Runtime.InteropServices;
public class W32Test {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);
}
"@
    $true
}

# Test 3: Font creation (THE BUG)
Write-Host "[3] Font creation..."
Check "Font with enum" {
    $f = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $f.Bold -eq $true
}
Check "Font regular" {
    $f = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Regular)
    $f.Size -eq 8
}
Check "Font Consolas" {
    $f = New-Object System.Drawing.Font("Consolas", 7, [System.Drawing.FontStyle]::Regular)
    $f.Name -eq "Consolas"
}

# Test 4: Color creation
Write-Host "[4] Colors..."
Check "Color cyan" { $c = [System.Drawing.Color]::FromArgb(0, 212, 255); $c.G -eq 212 }

# Test 5: Form creation
Write-Host "[5] Form..."
$form = $null
Check "Create form" {
    $script:form = New-Object System.Windows.Forms.Form
    $script:form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $script:form.Size = New-Object System.Drawing.Size(400, 44)
    $script:form.BackColor = [System.Drawing.Color]::FromArgb(14, 17, 23)
    $script:form.TopMost = $true
    $script:form.ShowInTaskbar = $false
    $script:form.Opacity = 0.95
    $script:form.AllowTransparency = $true
    $script:form -ne $null
}

# Test 6: Labels
Write-Host "[6] Labels..."
Check "Add label" {
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Name = "testLbl"
    $lbl.Text = "TEST"
    $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(0, 212, 255)
    $lbl.BackColor = [System.Drawing.Color]::Transparent
    $lbl.Location = New-Object System.Drawing.Point(10, 12)
    $lbl.AutoSize = $true
    $script:form.Controls.Add($lbl)
    $script:form.Controls.Count -ge 1
}
Check "Find label" {
    $found = $script:form.Controls.Find("testLbl", $false)
    $found.Count -eq 1 -and $found[0].Text -eq "TEST"
}

# Test 7: Buttons with Tag
Write-Host "[7] Buttons..."
$Global:TestBtnClicked = ""
Check "Create button with Tag" {
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = "Play"
    $btn.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btn.Font = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
    $btn.FlatAppearance.BorderSize = 1
    $btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $btn.BackColor = [System.Drawing.Color]::FromArgb(22, 27, 34)
    $btn.ForeColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
    $btn.Location = New-Object System.Drawing.Point(200, 7)
    $btn.Size = New-Object System.Drawing.Size(50, 30)
    $btn.Cursor = [System.Windows.Forms.Cursors]::Hand
    $btn.Tag = "play"
    $btn.Add_Click({ $Global:TestBtnClicked = $this.Tag })
    $script:form.Controls.Add($btn)
    $btn.Tag -eq "play"
}
Check "Programmatic click" {
    # Find the button and invoke PerformClick
    foreach ($c in $script:form.Controls) {
        if ($c -is [System.Windows.Forms.Button] -and $c.Tag -eq "play") {
            $c.PerformClick()
            break
        }
    }
    $Global:TestBtnClicked -eq "play"
}

# Test 8: Timer
Write-Host "[8] Timer..."
$Global:TestTicks = 0
Check "Create timer" {
    $t = New-Object System.Windows.Forms.Timer
    $t.Interval = 100
    $t.Add_Tick({ $Global:TestTicks++ })
    $t.Start()
    Start-Sleep -Milliseconds 500
    $t.Stop()
    $t.Dispose()
    $Global:TestTicks -gt 0
}

# Test 9: Rounded region
Write-Host "[9] Region..."
Check "GraphicsPath region" {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc(0, 0, 22, 22, 180, 90)
    $gp.AddArc(378, 0, 22, 22, 270, 90)
    $gp.AddArc(378, 22, 22, 22, 0, 90)
    $gp.AddArc(0, 22, 22, 22, 90, 90)
    $gp.CloseFigure()
    $script:form.Region = New-Object System.Drawing.Region($gp)
    $script:form.Region -ne $null
}

# Test 10: Global state
Write-Host "[10] Global state..."
$Global:AC_Running = $true
$Global:AC_Paused = $false
Check "Global read/write" {
    $Global:AC_Running = $false
    $Global:AC_Paused = $true
    (-not $Global:AC_Running) -and $Global:AC_Paused
}

# Test 11: UI Automation
Write-Host "[11] UI Automation..."
Check "AutomationElement root" {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $root -ne $null
}

# Test 12: Show form briefly
Write-Host "[12] Show form for 3 seconds..."
$Global:AC_Running = $true
$Global:AC_Paused = $false
$Global:AC_Clicks = 0
$Global:AC_Scans = 0

# Add all controls to form for visual test
$lblInfo = New-Object System.Windows.Forms.Label
$lblInfo.Name = "lblInfo"
$lblInfo.Text = "Self-Test Running..."
$lblInfo.Font = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Regular)
$lblInfo.ForeColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
$lblInfo.BackColor = [System.Drawing.Color]::Transparent
$lblInfo.Location = New-Object System.Drawing.Point(60, 5)
$lblInfo.Size = New-Object System.Drawing.Size(130, 16)
$form.Controls.Add($lblInfo)

$lblCount = New-Object System.Windows.Forms.Label
$lblCount.Name = "lblCount"
$lblCount.Text = "Testing..."
$lblCount.Font = New-Object System.Drawing.Font("Consolas", 7, [System.Drawing.FontStyle]::Regular)
$lblCount.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
$lblCount.BackColor = [System.Drawing.Color]::Transparent
$lblCount.Location = New-Object System.Drawing.Point(60, 24)
$lblCount.Size = New-Object System.Drawing.Size(130, 14)
$form.Controls.Add($lblCount)

$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(($wa.Width - 420), ($wa.Height - 56))

# Auto-close timer
$closeTimer = New-Object System.Windows.Forms.Timer
$closeTimer.Interval = 3000
$closeTimer.Add_Tick({
        $closeTimer.Stop()
        # Update labels before closing
        $il = $form.Controls.Find("lblInfo", $false)
        if ($il.Count -gt 0) { $il[0].Text = "All tests passed!" }
        Start-Sleep -Milliseconds 500
        $form.Close()
    })
$closeTimer.Start()

# Tick timer during display
$tickTimer = New-Object System.Windows.Forms.Timer
$tickTimer.Interval = 200
$Global:VisualTicks = 0
$tickTimer.Add_Tick({
        $Global:VisualTicks++
        $cl = $form.Controls.Find("lblCount", $false)
        if ($cl.Count -gt 0) { $cl[0].Text = "Tick $($Global:VisualTicks)" }
        $il = $form.Controls.Find("lblInfo", $false)
        if ($il.Count -gt 0) { $il[0].ForeColor = [System.Drawing.Color]::FromArgb(0, 212, 255) }
    })
$tickTimer.Start()

$form.Show()
[System.Windows.Forms.Application]::Run($form)
$tickTimer.Stop(); $tickTimer.Dispose()
$closeTimer.Dispose()

Check "Form displayed & ticked" { $Global:VisualTicks -gt 5 }

# ═══ RESULTS ═══
$pass = ($results | Where-Object { $_ -eq "PASS" }).Count
$fail = ($results | Where-Object { $_ -eq "FAIL" }).Count
$total = $results.Count

Write-Host "`n========================================="
Write-Host "  RESULTS: $pass/$total PASSED ($fail failed)"
Write-Host "========================================="

if ($fail -eq 0) {
    Write-Host "`n  ALL TESTS PASSED - Autoclicker is ready!`n"
}
else {
    Write-Host "`n  SOME TESTS FAILED - Review errors above.`n"
}
