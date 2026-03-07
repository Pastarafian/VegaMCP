# VegaClaw IDE AutoClicker v3 - Chat Panel Only
# ONLY clicks action buttons inside the IDE chat/conversation panel
# (the blue "Allow", "Run", "Accept" buttons that appear in AI chat)
# Does NOT click toolbar, sidebar, or menu buttons
#
# Stop: Ctrl+C, or: Get-Process powershell | Where { $_.CommandLine -like "*autoclicker*" } | Stop-Process
# Or via MCP tool: ide_autoclicker { action: "stop" }

param(
    [int]$Interval = 3,
    [switch]$DryRun,
    [switch]$ShowVerbose,
    [int]$Cooldown = 15,
    [string]$LogFile = (Join-Path $env:USERPROFILE ".claw-memory\autoclicker.log")
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Mouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int LEFTDOWN = 0x02;
    public const int LEFTUP = 0x04;
}
"@

# ONLY these exact button names in the chat panel
$ChatButtonNames = @(
    # Antigravity / Copilot chat actions
    "Allow", "Run", "Accept", "Apply",
    "Allow All", "Run All", "Accept All", "Apply All",
    "Allow this conversation",
    "Continue", "Proceed", "Confirm",
    "Insert", "Insert All",
    "Keep", "Keep All",
    # Trust workspace prompts (these are real dialogs)
    "Trust", "Yes, I trust the authors",
    "Trust Folder and Continue",
    # Generic dialog confirmations
    "OK", "Yes"
)

# NEVER click these regardless
$NeverClick = @(
    "Delete", "Remove", "Uninstall", "Format", "Reset",
    "Sign Out", "Log Out", "Close", "Exit", "Cancel",
    "Discard", "Reject", "Deny", "No", "Dismiss",
    "Don't Save", "Close Project", "Always run"
)

# IDE process names
$IDEs = @(
    "Antigravity", "antigravity",
    "Code", "code",
    "Cursor", "cursor",
    "idea64", "pycharm64", "webstorm64",
    "rider64", "goland64", "devenv"
)

$clickedCache = @{}

# Logging
$logDir = Split-Path $LogFile -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

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

function SetCooldown($key) { $clickedCache[$key] = Get-Date }

function IsExactMatch($text) {
    # Check never-click first
    foreach ($n in $NeverClick) {
        if ($text -eq $n) { return $false }
        if ($text -like "*$n*") { return $false }
    }
    # Must exactly match a chat button name
    foreach ($p in $ChatButtonNames) {
        if ($text -eq $p) { return $true }
    }
    return $false
}

function ClickElement($el) {
    try {
        $pattern = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        if ($pattern) { $pattern.Invoke(); return $true }
    }
    catch {}
    try {
        $rect = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
        if ($rect -and $rect.Width -gt 0) {
            $cx = [int]($rect.X + $rect.Width / 2)
            $cy = [int]($rect.Y + $rect.Height / 2)
            [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($cx, $cy)
            Start-Sleep -Milliseconds 50
            [Win32Mouse]::mouse_event([Win32Mouse]::LEFTDOWN -bor [Win32Mouse]::LEFTUP, 0, 0, 0, 0)
            return $true
        }
    }
    catch {}
    return $false
}

function IsInChatArea($btnElement, $windowElement) {
    # Only click buttons that are in the RIGHT side of the window (chat panel)
    # or in popup dialogs/notifications
    try {
        $btnRect = $btnElement.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
        $winRect = $windowElement.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::BoundingRectangleProperty)
        if ($btnRect -and $winRect -and $winRect.Width -gt 0) {
            $relativeX = ($btnRect.X - $winRect.X) / $winRect.Width

            # Chat panel is typically on the right side (> 50% of window width)
            # Or in a centered notification banner
            if ($relativeX -gt 0.45) { return $true }

            # Also allow if it's in a narrow notification at the top (banners)
            $relativeY = ($btnRect.Y - $winRect.Y) / $winRect.Height
            if ($relativeY -lt 0.08) { return $true }
        }
    }
    catch {}

    # Check parent chain for chat-related automation IDs
    try {
        $current = $btnElement
        for ($i = 0; $i -lt 8; $i++) {
            $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
            $parent = $walker.GetParent($current)
            if (-not $parent) { break }
            $parentId = $parent.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::AutomationIdProperty)
            $parentName = $parent.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
            if ($parentId -match "chat|conversation|copilot|inline|notification|dialog|prompt|panel\.chat" -or
                $parentName -match "Chat|Conversation|Copilot|Inline Chat|Notification") {
                return $true
            }
            $current = $parent
        }
    }
    catch {}

    return $false
}

# Main
Log "VegaClaw AutoClicker v3 started (chat-panel only)" "START"
Log ("Interval: " + $Interval + "s | DryRun: " + $DryRun + " | Cooldown: " + $Cooldown + "s") "CONFIG"
Log ("Buttons: " + ($ChatButtonNames -join ", ")) "CONFIG"

$clicks = 0
$scans = 0

while ($true) {
    $scans++

    foreach ($ide in $IDEs) {
        $procs = Get-Process -Name $ide -ErrorAction SilentlyContinue
        foreach ($proc in $procs) {
            if ($proc.MainWindowHandle -eq [IntPtr]::Zero) { continue }
            try {
                $win = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
                if (-not $win) { continue }

                if ($ShowVerbose) { Log ("Scanning: " + $ide) "SCAN" }

                # Find all buttons
                $cond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::Button
                )
                $buttons = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)

                foreach ($btn in $buttons) {
                    try {
                        $name = $btn.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
                        if (-not $name -or $name.Length -eq 0 -or $name.Length -gt 80) { continue }

                        # Must exactly match an allowed button name
                        if (-not (IsExactMatch $name)) { continue }

                        # Must be in the chat panel area or a dialog
                        if (-not (IsInChatArea $btn $win)) {
                            if ($ShowVerbose) { Log ("SKIP (not in chat): '" + $name + "'") "SKIP" }
                            continue
                        }

                        # Cooldown check
                        $cacheKey = $ide + "::" + $name
                        if (IsOnCooldown $cacheKey) { continue }

                        if ($DryRun) {
                            Log ("[DRY] Would click: '" + $name + "' in " + $ide) "MATCH"
                            SetCooldown $cacheKey
                        }
                        else {
                            $ok = ClickElement $btn
                            if ($ok) {
                                $clicks++
                                SetCooldown $cacheKey
                                Log ("CLICKED: '" + $name + "' in " + $ide + " [" + $clicks + "]") "CLICK"
                            }
                        }
                    }
                    catch {}
                }
            }
            catch {}
        }
    }

    # Also scan standalone dialog windows (trust workspace, etc)
    try {
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $winCond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Window
        )
        $allWins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $winCond)
        foreach ($w in $allWins) {
            try {
                $wName = $w.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
                $wClass = $w.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::ClassNameProperty)
                # Only process actual dialog windows
                if ($wClass -match "Dialog|MessageBox|32770" -or $wName -match "Trust|Allow|Permission|Security") {
                    if ($ShowVerbose) { Log ("Dialog: " + $wName) "DIALOG" }
                    $cond2 = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::Button
                    )
                    $dButtons = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond2)
                    foreach ($btn in $dButtons) {
                        try {
                            $bName = $btn.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)
                            if (-not $bName -or $bName.Length -eq 0) { continue }
                            if (IsExactMatch $bName) {
                                $cacheKey = "dlg::" + $wName + "::" + $bName
                                if (IsOnCooldown $cacheKey) { continue }
                                if ($DryRun) {
                                    Log ("[DRY] Would click: '" + $bName + "' in dialog '" + $wName + "'") "MATCH"
                                    SetCooldown $cacheKey
                                }
                                else {
                                    $ok = ClickElement $btn
                                    if ($ok) {
                                        $clicks++
                                        SetCooldown $cacheKey
                                        Log ("CLICKED: '" + $bName + "' in dialog '" + $wName + "' [" + $clicks + "]") "CLICK"
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

    # Prune cooldown cache
    if ($scans % 50 -eq 0) {
        $now = Get-Date
        $expired = @($clickedCache.Keys | Where-Object { ($now - $clickedCache[$_]).TotalSeconds -gt ($Cooldown * 3) })
        foreach ($key in $expired) { $clickedCache.Remove($key) }
        Log ("Status: " + $scans + " scans, " + $clicks + " clicks") "STATUS"
    }

    Start-Sleep -Seconds $Interval
}
