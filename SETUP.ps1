<#
  VegaMCP v3.0 — API Key Configuration GUI
  Run: powershell -ExecutionPolicy Bypass -File SETUP.ps1
  Creates/updates the .env file with your API keys
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ═══════════════════════════════════════════════
# Read existing .env values
# ═══════════════════════════════════════════════
$envPath = Join-Path $PSScriptRoot ".env"
$existingValues = @{}

if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^([A-Z_]+)=(.*)$') {
            $existingValues[$Matches[1]] = $Matches[2]
        }
    }
}

# ═══════════════════════════════════════════════
# Define all configuration fields
# ═══════════════════════════════════════════════
$fields = @(
    @{ Name = "SECTION_REASONING"; Label = "━━━ Reasoning Models (at least one) ━━━"; Type = "header" },
    @{ Name = "OPENROUTER_API_KEY"; Label = "OpenRouter API Key"; Hint = "Supports ALL models. Get at openrouter.ai"; Type = "key" },
    @{ Name = "DEEPSEEK_API_KEY"; Label = "DeepSeek API Key"; Hint = "Direct DeepSeek API. Get at platform.deepseek.com"; Type = "key" },
    @{ Name = "KIMI_API_KEY"; Label = "Kimi / Moonshot API Key"; Hint = "128K context, cheap. Get at platform.moonshot.cn"; Type = "key" },

    @{ Name = "SECTION_LOCAL"; Label = "━━━ Local AI (Free) ━━━"; Type = "header" },
    @{ Name = "OLLAMA_URL"; Label = "Ollama URL"; Hint = "Default: http://localhost:11434"; Type = "text"; Default = "http://localhost:11434" },

    @{ Name = "SECTION_SEARCH"; Label = "━━━ Web Search & GitHub ━━━"; Type = "header" },
    @{ Name = "TAVILY_API_KEY"; Label = "Tavily API Key"; Hint = "AI search. Free 1000/mo at tavily.com"; Type = "key" },
    @{ Name = "SEARXNG_URL"; Label = "SearXNG URL (fallback)"; Hint = "Self-hosted search. Leave blank if not using"; Type = "text" },
    @{ Name = "GITHUB_TOKEN"; Label = "GitHub Token"; Hint = "Increases rate limit 60→5000/hr. github.com/settings/tokens"; Type = "key" },

    @{ Name = "SECTION_SENTRY"; Label = "━━━ Sentry Error Tracking ━━━"; Type = "header" },
    @{ Name = "SENTRY_AUTH_TOKEN"; Label = "Sentry Auth Token"; Hint = "Error monitoring. Get at sentry.io"; Type = "key" },
    @{ Name = "SENTRY_ORG"; Label = "Sentry Organization"; Hint = "Your org slug"; Type = "text" },
    @{ Name = "SENTRY_PROJECT"; Label = "Sentry Project"; Hint = "Your project slug"; Type = "text" },

    @{ Name = "SECTION_BUDGET"; Label = "━━━ Token Budget & Profile ━━━"; Type = "header" },
    @{ Name = "TOKEN_DAILY_BUDGET_USD"; Label = "Daily Budget (USD)"; Hint = "Max daily AI spending"; Type = "text"; Default = "5.00" },
    @{ Name = "TOKEN_HOURLY_BUDGET_USD"; Label = "Hourly Budget (USD)"; Hint = "Max hourly AI spending"; Type = "text"; Default = "1.00" },
    @{ Name = "VEGAMCP_TOOL_PROFILE"; Label = "Tool Profile"; Hint = "full / minimal / research / coding / ops"; Type = "text"; Default = "full" },

    @{ Name = "SECTION_GENERAL"; Label = "━━━ General ━━━"; Type = "header" },
    @{ Name = "WORKSPACE_ROOT"; Label = "Workspace Root"; Hint = "AI file access boundary"; Type = "text"; Default = $PSScriptRoot.Replace('\', '/') },
    @{ Name = "DATA_DIR"; Label = "Data Directory"; Hint = "SQLite + vector store location"; Type = "text"; Default = "./data" },
    @{ Name = "LOG_LEVEL"; Label = "Log Level"; Hint = "info / debug / warn / error"; Type = "text"; Default = "info" }
)

# ═══════════════════════════════════════════════
# Build the GUI
# ═══════════════════════════════════════════════
$form = New-Object System.Windows.Forms.Form
$form.Text = "VegaMCP v3.0 — Configuration"
$form.Size = New-Object System.Drawing.Size(620, 820)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 24)
$form.ForeColor = [System.Drawing.Color]::FromArgb(220, 220, 230)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

# Scrollable panel
$panel = New-Object System.Windows.Forms.Panel
$panel.Location = New-Object System.Drawing.Point(0, 0)
$panel.Size = New-Object System.Drawing.Size(604, 720)
$panel.AutoScroll = $true
$panel.BackColor = $form.BackColor
$form.Controls.Add($panel)

# Title bar
$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "⚡ VegaMCP v3.0 — API Key Setup"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(130, 180, 255)
$titleLabel.Location = New-Object System.Drawing.Point(20, 12)
$titleLabel.AutoSize = $true
$panel.Controls.Add($titleLabel)

$subtitleLabel = New-Object System.Windows.Forms.Label
$subtitleLabel.Text = "Fill in your API keys below. Only keys you need — leave the rest blank."
$subtitleLabel.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 160)
$subtitleLabel.Location = New-Object System.Drawing.Point(20, 42)
$subtitleLabel.AutoSize = $true
$panel.Controls.Add($subtitleLabel)

$yPos = 72
$textBoxes = @{}

$accentColor = [System.Drawing.Color]::FromArgb(130, 180, 255)
$headerColor = [System.Drawing.Color]::FromArgb(200, 160, 80)
$hintColor = [System.Drawing.Color]::FromArgb(110, 110, 130)
$fieldBg = [System.Drawing.Color]::FromArgb(30, 30, 42)
$fieldFg = [System.Drawing.Color]::FromArgb(210, 210, 220)

foreach ($field in $fields) {
    if ($field.Type -eq "header") {
        $yPos += 8
        $headerLbl = New-Object System.Windows.Forms.Label
        $headerLbl.Text = $field.Label
        $headerLbl.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
        $headerLbl.ForeColor = $headerColor
        $headerLbl.Location = New-Object System.Drawing.Point(20, $yPos)
        $headerLbl.Size = New-Object System.Drawing.Size(560, 22)
        $panel.Controls.Add($headerLbl)
        $yPos += 26
        continue
    }

    # Label
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = $field.Label
    $lbl.ForeColor = $fieldFg
    $lbl.Location = New-Object System.Drawing.Point(20, $yPos)
    $lbl.Size = New-Object System.Drawing.Size(180, 20)
    $panel.Controls.Add($lbl)

    # Text box
    $txt = New-Object System.Windows.Forms.TextBox
    $txt.Location = New-Object System.Drawing.Point(200, ($yPos - 2))
    $txt.Size = New-Object System.Drawing.Size(370, 24)
    $txt.BackColor = $fieldBg
    $txt.ForeColor = $fieldFg
    $txt.BorderStyle = "FixedSingle"
    $txt.Font = New-Object System.Drawing.Font("Consolas", 9.5)

    # Pre-fill: existing .env value > default > empty
    $preValue = ""
    if ($existingValues.ContainsKey($field.Name)) {
        $preValue = $existingValues[$field.Name]
    } elseif ($field.Default) {
        $preValue = $field.Default
    }
    $txt.Text = $preValue

    # Mask API keys
    if ($field.Type -eq "key" -and $preValue -ne "") {
        $txt.UseSystemPasswordChar = $false
    }

    $panel.Controls.Add($txt)
    $textBoxes[$field.Name] = $txt
    $yPos += 24

    # Hint
    $hintLbl = New-Object System.Windows.Forms.Label
    $hintLbl.Text = $field.Hint
    $hintLbl.ForeColor = $hintColor
    $hintLbl.Font = New-Object System.Drawing.Font("Segoe UI", 7.8)
    $hintLbl.Location = New-Object System.Drawing.Point(200, $yPos)
    $hintLbl.Size = New-Object System.Drawing.Size(370, 16)
    $panel.Controls.Add($hintLbl)
    $yPos += 22
}

# ═══════════════════════════════════════════════
# Status bar at bottom
# ═══════════════════════════════════════════════
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = ""
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 200, 120)
$statusLabel.Location = New-Object System.Drawing.Point(20, 735)
$statusLabel.Size = New-Object System.Drawing.Size(360, 20)
$form.Controls.Add($statusLabel)

# ═══════════════════════════════════════════════
# Buttons
# ═══════════════════════════════════════════════

# Save button
$saveBtn = New-Object System.Windows.Forms.Button
$saveBtn.Text = "💾  Save .env"
$saveBtn.Location = New-Object System.Drawing.Point(390, 730)
$saveBtn.Size = New-Object System.Drawing.Size(100, 36)
$saveBtn.FlatStyle = "Flat"
$saveBtn.BackColor = [System.Drawing.Color]::FromArgb(40, 120, 80)
$saveBtn.ForeColor = [System.Drawing.Color]::White
$saveBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$saveBtn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(60, 160, 100)
$saveBtn.Cursor = [System.Windows.Forms.Cursors]::Hand

$saveBtn.Add_Click({
    # Build .env content
    $lines = @()
    $lines += "# ══════════════════════════════════════════════════════════"
    $lines += "# VegaMCP v3.0 — Configuration"
    $lines += "# Generated by SETUP.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $lines += "# ══════════════════════════════════════════════════════════"
    $lines += ""

    $currentSection = ""
    foreach ($field in $fields) {
        if ($field.Type -eq "header") {
            $lines += ""
            $lines += "# $($field.Label)"
            continue
        }
        $val = $textBoxes[$field.Name].Text.Trim()
        $lines += "$($field.Name)=$val"
    }
    $lines += ""

    # Write to .env
    $content = $lines -join "`r`n"
    Set-Content -Path $envPath -Value $content -Encoding UTF8

    # Count configured keys
    $keyCount = 0
    $keyFields = $fields | Where-Object { $_.Type -eq "key" }
    foreach ($kf in $keyFields) {
        if ($textBoxes[$kf.Name].Text.Trim() -ne "") { $keyCount++ }
    }

    $statusLabel.Text = "Saved! $keyCount API keys configured."
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 220, 120)

    [System.Windows.Forms.MessageBox]::Show(
        "Configuration saved to .env`n`n$keyCount API keys configured.`n`nRestart the VegaMCP server to apply changes:`nnpm run build && node build/index.js",
        "VegaMCP — Saved",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
})
$form.Controls.Add($saveBtn)

# Cancel button
$cancelBtn = New-Object System.Windows.Forms.Button
$cancelBtn.Text = "Cancel"
$cancelBtn.Location = New-Object System.Drawing.Point(500, 730)
$cancelBtn.Size = New-Object System.Drawing.Size(80, 36)
$cancelBtn.FlatStyle = "Flat"
$cancelBtn.BackColor = [System.Drawing.Color]::FromArgb(60, 40, 40)
$cancelBtn.ForeColor = [System.Drawing.Color]::FromArgb(200, 140, 140)
$cancelBtn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(100, 60, 60)
$cancelBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$cancelBtn.Add_Click({ $form.Close() })
$form.Controls.Add($cancelBtn)

# ═══════════════════════════════════════════════
# Show the form
# ═══════════════════════════════════════════════
$form.Add_Shown({ $form.Activate() })
[System.Windows.Forms.Application]::EnableVisualStyles()
$form.ShowDialog() | Out-Null
