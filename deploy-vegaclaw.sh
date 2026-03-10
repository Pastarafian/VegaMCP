#!/usr/bin/env bash
# deploy-vegaclaw.sh — Upload static HTML panel + reload Nginx
# Run from your local machine: bash deploy-vegaclaw.sh

if [ -f .env ]; then
  source .env
fi

VPS="${VPS_IP:-185.249.74.99}"
VPS_USER="${VPS_USER:-root}"
LOCAL_DIR="claw-control-panel/dist"
REMOTE_DIR="/var/www/vegaclaw"
NGINX_CONF="nginx-vegamcp.conf"
REMOTE_NGINX="/etc/nginx/sites-available/vegamcp"

npm --prefix claw-control-panel install
npm --prefix claw-control-panel run build

echo "==> Uploading VegaClaw Build..."
ssh ${VPS_USER}@${VPS} "mkdir -p ${REMOTE_DIR} && rm -rf ${REMOTE_DIR}/*"
scp -r ${LOCAL_DIR}/* "${VPS_USER}@${VPS}:${REMOTE_DIR}/"

echo "==> Uploading Nginx config..."
scp "${NGINX_CONF}" "${VPS_USER}@${VPS}:${REMOTE_NGINX}"

echo "==> Creating symlink and reloading Nginx..."
ssh ${VPS_USER}@${VPS} "
  ln -sf ${REMOTE_NGINX} /etc/nginx/sites-enabled/vegamcp 2>/dev/null || true
  nginx -t && systemctl reload nginx
"

echo "==> Done. Visit https://vega.vegatech.online"
