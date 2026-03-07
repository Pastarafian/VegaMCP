#!/bin/bash
# ═══════════════════════════════════════════════════════════
# VegaMCP: Sentinel Gateway Deployment (Linux Systemd Service)
# ═══════════════════════════════════════════════════════════
# Compiles the lightweight Rust TCP Gateway from source directly
# on the VPS and registers it as a systemd service running as root
# (the Linux equivalent of NT AUTHORITY\SYSTEM).

set -euo pipefail

WORKSPACE_DIR="/opt/vegamcp-tests"
SOURCE_DIR="$WORKSPACE_DIR/payload/gateway-src"
SERVICE_NAME="vega-gateway"
BINARY_DEST="/usr/local/bin/vega-gateway"

echo "--- VegaMCP Sentinel Gateway Installer (Linux) ---"

# 1. Install Rust Toolchain (if missing)
if ! command -v cargo &>/dev/null; then
    echo "Downloading and installing Rust toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
    export PATH="$HOME/.cargo/bin:$PATH"
    echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> /etc/profile.d/rust.sh
else
    echo "Rust toolchain already installed: $(cargo --version)"
fi

# 2. Compile the Gateway Binary
echo ""
echo "Building VegaGateway Rust binary (Release profile, optimized for size)..."
if [ -d "$SOURCE_DIR" ]; then
    cd "$SOURCE_DIR"
    cargo build --release
    if [ $? -ne 0 ]; then
        echo "ERROR: Cargo compilation failed. Exiting."
        exit 1
    fi
else
    echo "ERROR: Source code directory not found at $SOURCE_DIR"
    exit 1
fi

BINARY_PATH="$SOURCE_DIR/target/release/vega-gateway-linux"
if [ ! -f "$BINARY_PATH" ]; then
    # Try alternative name
    BINARY_PATH="$SOURCE_DIR/target/release/vega-gateway"
    if [ ! -f "$BINARY_PATH" ]; then
        echo "ERROR: Binary not found after compilation."
        echo "Available binaries:"
        ls -la "$SOURCE_DIR/target/release/" | grep -v ".d$"
        exit 1
    fi
fi

# 3. Install the binary
echo "Installing gateway binary to $BINARY_DEST..."
cp "$BINARY_PATH" "$BINARY_DEST"
chmod +x "$BINARY_DEST"

# 4. Create and Enable the Systemd Service
echo ""
echo "Registering VegaSentinelGateway as a systemd service..."

# Stop existing service if running
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    systemctl stop "$SERVICE_NAME"
fi

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=VegaMCP Remote Control Gateway (The Claw)
Documentation=https://github.com/vegamcp
After=network.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$BINARY_DEST
Restart=always
RestartSec=3
User=root
WorkingDirectory=/opt/vegamcp-tests
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security hardening
NoNewPrivileges=false
ProtectSystem=false
ProtectHome=false
ReadWritePaths=/opt/vegamcp-tests /tmp

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd, enable and start
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# 5. Verify status
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo ""
    echo "[SUCCESS] VegaSentinel Gateway is online!"
    echo "Listening on 127.0.0.1:42015 as root (systemd managed)."
    echo "Status: $(systemctl is-active $SERVICE_NAME)"
else
    echo ""
    echo "[ERROR] Service installed but failed to start."
    echo "Check logs with: journalctl -u $SERVICE_NAME -n 20"
    systemctl status "$SERVICE_NAME" --no-pager || true
fi
