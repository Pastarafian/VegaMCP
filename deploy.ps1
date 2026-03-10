# ═══════════════════════════════════════════════════════════════
# VegaTech Dashboard — One-Click Deploy to vega.vegatech.online
# ═══════════════════════════════════════════════════════════════
# Usage: .\deploy.ps1
# This builds the dashboard, uploads to VPS, and reloads Caddy.
# ═══════════════════════════════════════════════════════════════

$VPS = "185.249.74.99"
$VPS_USER = "root"
$LOCAL_DIST = "claw-control-panel\dist"
$REMOTE_DIR = "/var/www/vegaclaw"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  VegaTech Dashboard Deploy                      ║" -ForegroundColor Cyan
Write-Host "║  Target: vega.vegatech.online                   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build
Write-Host "[1/3] Building production bundle..." -ForegroundColor Yellow
Push-Location claw-control-panel
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  ✅ Build complete" -ForegroundColor Green

# Step 2: Upload
Write-Host ""
Write-Host "[2/3] Uploading to $VPS..." -ForegroundColor Yellow
Write-Host "  (You will be prompted for your SSH passphrase)" -ForegroundColor DarkGray

# Clear remote dir and upload fresh
ssh "${VPS_USER}@${VPS}" "rm -rf ${REMOTE_DIR}/* && mkdir -p ${REMOTE_DIR}/assets"
scp "$LOCAL_DIST\index.html" "${VPS_USER}@${VPS}:${REMOTE_DIR}/"
scp "$LOCAL_DIST\vite.svg" "${VPS_USER}@${VPS}:${REMOTE_DIR}/"
scp "$LOCAL_DIST\assets\*" "${VPS_USER}@${VPS}:${REMOTE_DIR}/assets/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Upload failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Upload complete" -ForegroundColor Green

# Step 3: Verify
Write-Host ""
Write-Host "[3/3] Verifying deployment..." -ForegroundColor Yellow
ssh "${VPS_USER}@${VPS}" "ls -la ${REMOTE_DIR}/ && ls -la ${REMOTE_DIR}/assets/"
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ DEPLOYED to vega.vegatech.online             ║" -ForegroundColor Green
Write-Host "║  Open: https://vega.vegatech.online              ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
