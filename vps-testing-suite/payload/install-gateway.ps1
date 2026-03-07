# ═══════════════════════════════════════════════════════════
# VegaMCP: Sentinel Gateway Deployment (Rust Kernel Service)
# ═══════════════════════════════════════════════════════════
# Compiles the lightweight Rust TCP Gateway from source directly
# on the VPS and registers it as a zero-overhead Windows Service
# operating as NT AUTHORITY\SYSTEM (super user).

$ErrorActionPreference = "SilentlyContinue"
$WorkspaceDir = "C:\VegaMCP-Tests"
$SourceDir = "$WorkspaceDir\payload\gateway-src"
$ServiceName = "VegaSentinelGateway"

Write-Output "--- VegaMCP Sentinel Gateway Installer ---"

# 1. Install Rust Toolchain compiler (if missing)
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Output "Downloading Rustup..."
    Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
    Write-Output "Installing Rust (Silent profile)..."
    Start-Process -FilePath "$env:TEMP\rustup-init.exe" -ArgumentList "-y", "--default-toolchain", "stable", "--profile", "minimal" -Wait -NoNewWindow
    
    # Reload environment so powershell finds cargo
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}
else {
    Write-Output "Rust toolchain is already installed."
}

# 2. Compile the Gateway Binary
Write-Output "`nBuilding VegaGateway Rust binary (Release profile, optimized for size)..."
if (Test-Path $SourceDir) {
    Set-Location $SourceDir
    # 'cargo build --release' compiles the code statically using the Cargo.toml
    $cargoProc = Start-Process -FilePath "cargo" -ArgumentList "build", "--release" -Wait -PassThru -NoNewWindow
    if ($cargoProc.ExitCode -ne 0) {
        Write-Output "ERROR: Cargo compilation failed. Exiting."
        exit $cargoProc.ExitCode
    }
}
else {
    Write-Output "ERROR: Source code directory not found at $SourceDir"
    exit 1
}

$BinaryPath = "$SourceDir\target\release\vega-gateway.exe"
if (-not (Test-Path $BinaryPath)) {
    Write-Output "ERROR: Binary could not be located after successful compilation."
    exit 1
}

# 3. Create and Start the NT AUTHORITY\SYSTEM Service
Write-Output "`nRegistering VegaSentinelGateway as a Windows Background Service..."

# Stop and delete if existing
if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
    Stop-Service -Name $ServiceName -Force
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

# sc.exe requires explicit spacing after equal signs: binPath= "path"
# obj= "NT AUTHORITY\SYSTEM" forces it to run above Administrator level (bypassing UAC completely)
$createSvc = "sc.exe create ""$ServiceName"" binPath= ""$BinaryPath"" start= auto obj= ""NT AUTHORITY\SYSTEM"" DisplayName= ""VegaMCP Remote Control Gateway"""
cmd.exe /c $createSvc | Out-Null

$desc = "sc.exe description ""$ServiceName"" ""Provides zero-latency, superuser RPC control for VegaMCP bypass logic via localhost tunneling."""
cmd.exe /c $desc | Out-Null

Write-Output "Starting $ServiceName..."
Start-Service -Name $ServiceName -ErrorAction SilentlyContinue

# Verify status
$status = (Get-Service $ServiceName).Status
if ($status -eq 'Running') {
    Write-Output "`n[SUCCESS] VegaSentinel Kernel Gateway is online!"
    Write-Output "Listening intensely on 127.0.0.1:42015 via NT_AUTHORITY\SYSTEM."
}
else {
    Write-Output "`n[ERROR] Service installed but failed to start. Status: $status"
}
