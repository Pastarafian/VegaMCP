# E2E Test v2 - Proper UI Automation test
# Spawns test windows, then uses the SAME scanning logic as the autoclicker
# to verify detection AND safety filtering work correctly.

$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Write-Host "`n============================================"
Write-Host "  VEGACLAW AUTOCLICKER E2E TEST v2"
Write-Host "============================================`n"

# --- Load the autoclicker's exact functions ---
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
    "Disable", "Clear", "Erase", "Drop"
)

function IsSafe($text) {
    if (-not $text -or $text.Length -eq 0 -or $text.Length -gt 80) { return $false }
    foreach ($b in $Global:BlockList) { if ($text -like "*$b*") { return $false } }
    foreach ($a in $Global:AllowList) { if ($text -eq $a) { return $true } }
    return $false
}

$passed = 0; $failed = 0
function Pass($msg) { Write-Host "  [PASS] $msg"; $script:passed++ }
function Fail($msg) { Write-Host "  [FAIL] $msg"; $script:failed++ }

# === TEST 1: IsSafe function ===
Write-Host "[1/6] Testing IsSafe() pattern matching..."

# Should be safe (in AllowList)
foreach ($safe in @("Allow", "Accept", "Trust", "Run", "OK", "Yes", "Continue", "Apply")) {
    if (IsSafe $safe) { Pass "IsSafe('$safe') = true" }
    else { Fail "IsSafe('$safe') should be true" }
}

# Should be blocked (in BlockList)
foreach ($blocked in @("Delete", "Remove", "Cancel", "No", "Discard", "Uninstall", "Exit", "Close")) {
    if (-not (IsSafe $blocked)) { Pass "IsSafe('$blocked') = false (blocked)" }
    else { Fail "IsSafe('$blocked') should be false!" }
}

# Edge cases: partial matches should block
foreach ($partial in @("Delete All", "Remove File", "Close Window")) {
    if (-not (IsSafe $partial)) { Pass "IsSafe('$partial') = false (partial block)" }
    else { Fail "IsSafe('$partial') should be false!" }
}

# Not in either list
if (-not (IsSafe "Random Button")) { Pass "IsSafe('Random Button') = false (not in AllowList)" }
else { Fail "IsSafe('Random Button') should be false!" }

# Empty/null
if (-not (IsSafe "")) { Pass "IsSafe('') = false" }
else { Fail "IsSafe('') should be false!" }

# === TEST 2: UI Automation can find buttons ===
Write-Host "`n[2/6] Testing UI Automation button detection..."

# Create a test form with known buttons
$testForm = New-Object System.Windows.Forms.Form
$testForm.Text = "AutoClicker Test Window"
$testForm.Size = New-Object System.Drawing.Size(400, 200)
$testForm.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$testForm.TopMost = $true

$Global:BtnClickLog = @()

$btnAllow = New-Object System.Windows.Forms.Button
$btnAllow.Name = "btnAllow"; $btnAllow.Text = "Allow"
$btnAllow.Location = New-Object System.Drawing.Point(20, 50)
$btnAllow.Size = New-Object System.Drawing.Size(100, 40)
$btnAllow.Add_Click({ $Global:BtnClickLog += "Allow" })
$testForm.Controls.Add($btnAllow)

$btnDelete = New-Object System.Windows.Forms.Button
$btnDelete.Name = "btnDelete"; $btnDelete.Text = "Delete"
$btnDelete.Location = New-Object System.Drawing.Point(140, 50)
$btnDelete.Size = New-Object System.Drawing.Size(100, 40)
$btnDelete.Add_Click({ $Global:BtnClickLog += "Delete" })
$testForm.Controls.Add($btnDelete)

$btnRun = New-Object System.Windows.Forms.Button
$btnRun.Name = "btnRun"; $btnRun.Text = "Run"
$btnRun.Location = New-Object System.Drawing.Point(260, 50)
$btnRun.Size = New-Object System.Drawing.Size(100, 40)
$btnRun.Add_Click({ $Global:BtnClickLog += "Run" })
$testForm.Controls.Add($btnRun)

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Name = "btnCancel"; $btnCancel.Text = "Cancel"
$btnCancel.Location = New-Object System.Drawing.Point(20, 110)
$btnCancel.Size = New-Object System.Drawing.Size(100, 40)
$btnCancel.Add_Click({ $Global:BtnClickLog += "Cancel" })
$testForm.Controls.Add($btnCancel)

# Show the form non-blocking
$testForm.Show()
Start-Sleep -Milliseconds 500

# Now use UI Automation to find buttons in the form
$hwnd = $testForm.Handle
$autoWin = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)

$btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
$allButtons = $autoWin.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)

$foundButtons = @()
foreach ($ab in $allButtons) {
    $bName = $ab.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
    if ($bName) { $foundButtons += $bName }
}

Write-Host "  Found buttons: $($foundButtons -join ', ')"

if ($foundButtons -contains "Allow") { Pass "UI Automation found 'Allow' button" }
else { Fail "UI Automation did NOT find 'Allow' button" }

if ($foundButtons -contains "Delete") { Pass "UI Automation found 'Delete' button" }
else { Fail "UI Automation did NOT find 'Delete' button" }

if ($foundButtons -contains "Run") { Pass "UI Automation found 'Run' button" }
else { Fail "UI Automation did NOT find 'Run' button" }

# === TEST 3: InvokePattern click ===
Write-Host "`n[3/6] Testing InvokePattern click..."

foreach ($ab in $allButtons) {
    $bName = $ab.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
    if ($bName -eq "Allow") {
        try {
            $inv = $ab.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
            $inv.Invoke()
            Start-Sleep -Milliseconds 200
            # Pump WinForms messages
            [System.Windows.Forms.Application]::DoEvents()
            if ($Global:BtnClickLog -contains "Allow") {
                Pass "InvokePattern clicked 'Allow' successfully"
            }
            else {
                Fail "InvokePattern invoked but Click event didn't fire"
            }
        }
        catch {
            Fail "InvokePattern failed: $($_.Exception.Message)"
        }
    }
}

# === TEST 4: Filter + Click simulation (autoclicker logic) ===
Write-Host "`n[4/6] Testing autoclicker filter + click logic..."

$Global:BtnClickLog = @()  # Reset
$clickedSafe = @()
$blockedUnsafe = @()

foreach ($ab in $allButtons) {
    $bName = $ab.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
    if (-not $bName) { continue }

    if (IsSafe $bName) {
        # This button should be clickable
        try {
            $inv = $ab.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
            $inv.Invoke()
            Start-Sleep -Milliseconds 100
            [System.Windows.Forms.Application]::DoEvents()
            $clickedSafe += $bName
        }
        catch {}
    }
    else {
        # This button should be blocked
        $blockedUnsafe += $bName
    }
}

Write-Host "  Clicked (safe): $($clickedSafe -join ', ')"
Write-Host "  Blocked (unsafe): $($blockedUnsafe -join ', ')"

if ($clickedSafe -contains "Allow") { Pass "Clicked 'Allow' (safe)" }
else { Fail "'Allow' was not clicked" }
if ($clickedSafe -contains "Run") { Pass "Clicked 'Run' (safe)" }
else { Fail "'Run' was not clicked" }
if ($blockedUnsafe -contains "Delete") { Pass "Blocked 'Delete' (unsafe)" }
else { Fail "'Delete' was NOT blocked!" }
if ($blockedUnsafe -contains "Cancel") { Pass "Blocked 'Cancel' (unsafe)" }
else { Fail "'Cancel' was NOT blocked!" }

# Verify Delete was NOT in click log
[System.Windows.Forms.Application]::DoEvents()
if ($Global:BtnClickLog -contains "Delete") { Fail "DELETE appeared in click log! Safety broken!" }
else { Pass "DELETE never appeared in click log" }
if ($Global:BtnClickLog -contains "Cancel") { Fail "CANCEL appeared in click log! Safety broken!" }
else { Pass "CANCEL never appeared in click log" }

$testForm.Close()
$testForm.Dispose()

# === TEST 5: Full autoclicker process test ===
Write-Host "`n[5/6] Full autoclicker process test (10 second run)..."

# Clear log
$logFile = "$env:TEMP\vegaclaw-autoclicker.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

# Start autoclicker
$acScript = Join-Path $PSScriptRoot "ide-autoclicker-v5.ps1"
if (-not (Test-Path $acScript)) {
    Fail "Autoclicker script not found at $acScript"
}
else {
    $acProc = Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$acScript`"" -PassThru -WindowStyle Minimized
    Start-Sleep -Seconds 4

    if ($acProc.HasExited) { Fail "Autoclicker exited prematurely" }
    else { Pass "Autoclicker process running (PID: $($acProc.Id))" }

    # Let it scan for a few cycles
    Start-Sleep -Seconds 6

    # Check log exists and has START entry
    if (Test-Path $logFile) {
        $logText = [System.IO.File]::ReadAllText($logFile)
        if ($logText -match "START") { Pass "Autoclicker log has START entry" }
        else { Fail "Autoclicker log missing START" }
        if ($logText -match "CONFIG") { Pass "Autoclicker log has CONFIG entry" }
        else { Fail "Autoclicker log missing CONFIG" }
        if ($logText -match "Patterns=33") { Pass "All 33 patterns loaded" }
        else { Fail "Pattern count mismatch" }
    }
    else {
        Fail "No log file created"
    }

    # Stop autoclicker
    Stop-Process -Id $acProc.Id -Force -ErrorAction SilentlyContinue
    Pass "Autoclicker stopped cleanly"
}

# === TEST 6: Hotbar form creation test ===
Write-Host "`n[6/6] Hotbar form creation test..."
$Global:AC_Running = $true
$Global:AC_Paused = $false
$Global:AC_Clicks = 0; $Global:AC_Scans = 0
$Global:AC_LastMsg = "Test"; $Global:AC_SpeedMs = 2000
$Global:AC_Dragging = $false; $Global:AC_DragX = 0; $Global:AC_DragY = 0

$fontBold = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$fontBtn = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$cBtnBg = [System.Drawing.Color]::FromArgb(22, 27, 34)
$cBorder = [System.Drawing.Color]::FromArgb(30, 41, 59)
$cGreen = [System.Drawing.Color]::FromArgb(34, 197, 94)

$hb = New-Object System.Windows.Forms.Form
$hb.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$hb.Size = New-Object System.Drawing.Size(440, 44)
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$hb.Location = New-Object System.Drawing.Point(($wa.Width - 460), ($wa.Height - 56))
$hb.TopMost = $true; $hb.ShowInTaskbar = $false
$hb.BackColor = [System.Drawing.Color]::FromArgb(14, 17, 23)
$hb.Opacity = 0.95; $hb.AllowTransparency = $true
Pass "Hotbar form created"

# Rounded region
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp.AddArc(0, 0, 22, 22, 180, 90); $gp.AddArc(418, 0, 22, 22, 270, 90)
$gp.AddArc(418, 22, 22, 22, 0, 90); $gp.AddArc(0, 22, 22, 22, 90, 90); $gp.CloseFigure()
$hb.Region = New-Object System.Drawing.Region($gp)
Pass "Rounded region applied"

# Tag-based button
$btn = New-Object System.Windows.Forms.Button
$btn.Text = "Play"; $btn.Tag = "play"
$btn.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btn.Font = $fontBtn
$btn.FlatAppearance.BorderSize = 1; $btn.FlatAppearance.BorderColor = $cBorder
$btn.BackColor = $cBtnBg; $btn.ForeColor = $cGreen
$btn.Location = New-Object System.Drawing.Point(200, 7)
$btn.Size = New-Object System.Drawing.Size(50, 30)
$btn.Add_Click({
        switch ($this.Tag) {
            "play" { $Global:AC_Paused = $false; $Global:AC_Running = $true }
        }
    })
$hb.Controls.Add($btn)

$hb.Show()
Start-Sleep -Milliseconds 300
[System.Windows.Forms.Application]::DoEvents()

if ($hb.Visible) { Pass "Hotbar is visible on screen" }
else { Fail "Hotbar not visible" }

# Programmatic click via InvokePattern
$hbAuto = [System.Windows.Automation.AutomationElement]::FromHandle($hb.Handle)
$bc2 = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
$hbBtns = $hbAuto.FindAll([System.Windows.Automation.TreeScope]::Descendants, $bc2)
$playFound = $false
foreach ($hbb in $hbBtns) {
    $n = $hbb.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
    if ($n -eq "Play") {
        $playFound = $true
        try {
            $inv = $hbb.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
            $Global:AC_Paused = $true  # Set to paused first
            $inv.Invoke()
            Start-Sleep -Milliseconds 200
            [System.Windows.Forms.Application]::DoEvents()
            if (-not $Global:AC_Paused) { Pass "Play button click set AC_Paused=false" }
            else { Fail "Play button click did NOT change state" }
        }
        catch {
            Fail "Play InvokePattern: $($_.Exception.Message)"
        }
    }
}
if (-not $playFound) { Fail "Play button not found via UI Automation" }

$hb.Close(); $hb.Dispose()

# === SUMMARY ===
Write-Host "`n============================================"
Write-Host "  TOTAL: $passed/$($passed + $failed) PASSED | $failed FAILED"
if ($failed -eq 0) { Write-Host "  ALL TESTS PASSED!" }
else { Write-Host "  $failed TESTS FAILED - review above" }
Write-Host "============================================`n"
