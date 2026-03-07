#!/bin/bash
# ═══════════════════════════════════════════════════════════
# VegaMCP VPS Continuous Logger & Sentinel (Linux)
# ═══════════════════════════════════════════════════════════
# Deployed and executed immediately by VegaMCP upon SSH connection.
# Runs as a background process to log system health, active tests,
# and resource consumption directly to the workspace.
# Includes automated log rotation and cleanup.

set -euo pipefail

WORKSPACE_DIR="/opt/vegamcp-tests"
LOG_DIR="$WORKSPACE_DIR/logs"
LOG_FILE="$LOG_DIR/vps-telemetry.log"
MAX_LOG_AGE_DAYS=3
MAX_LOG_SIZE_BYTES=10485760  # 10MB

mkdir -p "$LOG_DIR"

echo "--- VegaMCP Sentinel Logger Initialized (Linux) ---"

# ─── LOG MAINTENANCE ───
maintain_logs() {
    # Rotate current log if too large
    if [ -f "$LOG_FILE" ]; then
        local file_size
        file_size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo "0")
        if [ "$file_size" -gt "$MAX_LOG_SIZE_BYTES" ]; then
            local timestamp
            timestamp=$(date +"%Y%m%d_%H%M%S")
            mv "$LOG_FILE" "$LOG_DIR/vps-telemetry_${timestamp}.log"
            echo "Rotated telemetry log."
        fi
    fi

    # Delete logs older than retention period
    find "$LOG_DIR" -name "*.log" -mtime +"$MAX_LOG_AGE_DAYS" -delete 2>/dev/null || true
}

# ─── STRUCTURED LOG WRITER ───
write_log() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S.%3N")
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

# Run maintenance on startup
maintain_logs

# Initial log entry
OS_INFO=$(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)
write_log "INFO" "Session started by VegaMCP Master Router. OS: $OS_INFO"

# ─── BACKGROUND HEARTBEAT LOOP ───
(
    tick=0
    while true; do
        # Rotate every ~1 hour (360 ticks * 10s)
        if [ "$tick" -ge 360 ]; then
            tick=0
            maintain_logs
        fi
        tick=$((tick + 1))

        # CPU load (1-minute average)
        cpu_load=$(awk '{printf "%.1f", $1 * 100 / '"$(nproc)"'}' /proc/loadavg 2>/dev/null || echo "0")

        # RAM metrics
        ram_total=$(free -m | awk 'NR==2{print $2}')
        ram_free=$(free -m | awk 'NR==2{print $7}')  # 'available' column
        if [ "$ram_total" -gt 0 ]; then
            ram_usage_pct=$(awk "BEGIN {printf \"%.1f\", (($ram_total - $ram_free) / $ram_total) * 100}")
        else
            ram_usage_pct="0"
        fi

        # Determine health status
        status="HEALTHY "
        cpu_int=${cpu_load%.*}
        ram_int=${ram_usage_pct%.*}
        if [ "${cpu_int:-0}" -gt 90 ] || [ "${ram_int:-0}" -gt 90 ]; then
            status="CRITICAL"
        elif [ "${cpu_int:-0}" -gt 75 ] || [ "${ram_int:-0}" -gt 75 ]; then
            status="WARNING "
        fi

        timestamp=$(date +"%Y-%m-%d %H:%M:%S")
        echo "[$timestamp] [HEARTBEAT] Status: $status | CPU: ${cpu_load}% | RAM: ${ram_usage_pct}% (${ram_free}MB free)" >> "$LOG_FILE"

        sleep 10
    done
) &

LOGGER_PID=$!
echo "$LOGGER_PID" > "$LOG_DIR/sentinel.pid"
write_log "INFO" "Sentinel background telemetry started (PID: $LOGGER_PID)."

echo "LOGGER_STARTED: $LOG_FILE"
