#!/bin/bash
# ═══════════════════════════════════════════════════════════
# VegaMCP Docker Container Entrypoint
# Starts: Xvfb → Fluxbox → VNC → Gateway → Logger
# ═══════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════"
echo "  VegaMCP Testing Container Starting..."
echo "  Display: ${DISPLAY} (${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH})"
echo "═══════════════════════════════════════════════════"

# 1. Start Xvfb (Virtual Framebuffer — creates a fake display)
Xvfb ${DISPLAY} -screen 0 ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} -ac &
sleep 1
echo "[OK] Xvfb started on ${DISPLAY}"

# 2. Start Fluxbox (Lightweight window manager — required for some GUI apps)
fluxbox -display ${DISPLAY} &
sleep 1
echo "[OK] Fluxbox window manager started"

# 3. Start x11vnc (VNC server for visual inspection, optional)
x11vnc -display ${DISPLAY} -forever -shared -nopw -rfbport 5900 -bg -q
echo "[OK] VNC server on port 5900 (no password, container-only)"

# 4. Start the VegaSentinel Gateway (Rust binary)
/usr/local/bin/vega-gateway &
echo "[OK] VegaSentinel Gateway on port 42015"

# 5. Start the telemetry logger
(
    while true; do
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
        CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}')
        MEM_FREE=$(free -m | awk 'NR==2{print $4}')
        MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
        MEM_PCT=$(free | awk 'NR==2{printf "%.1f", ($2-$4)/$2*100}')
        
        STATUS="HEALTHY"
        if (( $(echo "$MEM_PCT > 90" | bc -l 2>/dev/null || echo 0) )); then STATUS="CRITICAL"; fi
        if (( $(echo "$MEM_PCT > 75" | bc -l 2>/dev/null || echo 0) )); then STATUS="WARNING"; fi
        
        echo "[$TIMESTAMP] [HEARTBEAT] Status: $STATUS | CPU: ${CPU}% | RAM: ${MEM_PCT}% (${MEM_FREE}MB free)" \
            >> /REDACTED/logs/container-telemetry.log
        sleep 10
    done
) &
echo "[OK] Telemetry logger started"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  VegaMCP Testing Container READY"
echo "  Gateway:  localhost:42015 (JSON-RPC)"
echo "  VNC:      localhost:5900  (visual inspection)"
echo "═══════════════════════════════════════════════════"

# Keep container alive
tail -f /dev/null
