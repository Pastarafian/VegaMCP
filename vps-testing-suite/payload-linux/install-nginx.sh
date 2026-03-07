#!/bin/bash
# ═══════════════════════════════════════════════════════════
# VegaClaw — Nginx Performance Install & Config
# ═══════════════════════════════════════════════════════════
# Installs and configures nginx as a high-performance reverse
# proxy in front of the Node.js claw-server.
#
# Optimizations match Cloudflare/Vercel-tier performance:
#   - worker_processes = auto (1 per CPU core)
#   - epoll event model (Linux kernel-level efficiency)
#   - sendfile + tcp_nopush (zero-copy serving)
#   - keepalive_timeout 120s with 10k requests per socket
#   - gzip level 6 (best speed/ratio tradeoff)
#   - upstream keepalive pool (64 persistent connections)

set -euo pipefail

echo "─── Installing & Configuring Nginx ───"

# 1. Install nginx if missing
if ! command -v nginx &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq nginx
fi

# 2. Optimize main nginx.conf for VPS scale
cat > /etc/nginx/nginx.conf <<'NGINX'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
worker_rlimit_nofile 65536;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    # ─── Core Performance ───
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    types_hash_max_size 2048;
    server_tokens off;            # Hide nginx version

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ─── Logging (minimal for performance) ───
    access_log /var/log/nginx/access.log combined buffer=16k flush=5s;
    error_log /var/log/nginx/error.log warn;

    # ─── Gzip (global) ───
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/json
        application/xml
        application/rss+xml
        application/atom+xml
        image/svg+xml
        font/woff2
        application/wasm;

    # ─── Rate Limiting Zones ───
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

    # ─── Connection Limits ───
    limit_conn_zone $binary_remote_addr zone=connlimit:10m;

    # ─── Include Sites ───
    include /etc/nginx/sites-enabled/*;
}
NGINX

# 3. Install the claw site config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/nginx-claw.conf" /etc/nginx/sites-available/claw
ln -sf /etc/nginx/sites-available/claw /etc/nginx/sites-enabled/claw

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# 4. Test config and reload
nginx -t
systemctl reload nginx || systemctl start nginx
systemctl enable nginx

echo ""
echo "─── Nginx Performance Config Applied ───"
echo "  Workers:      auto ($(nproc) cores)"
echo "  Connections:  4096 per worker"
echo "  Keepalive:    120s / 10k requests"
echo "  Gzip:         level 6, 13+ MIME types"
echo "  Rate limit:   login=5r/s, api=30r/s"
echo "  Upstream:     127.0.0.1:4280 (64 keepalive)"
echo "  Security:     server_tokens off, attack paths blocked"
echo ""
nginx -v 2>&1
echo "Status: $(systemctl is-active nginx)"
