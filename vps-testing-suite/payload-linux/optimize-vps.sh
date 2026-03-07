#!/bin/bash
# ═══════════════════════════════════════════════════════════
# VegaMCP VPS Extreme Optimization (Linux Edition)
# ═══════════════════════════════════════════════════════════
# This script is pushed and executed by VegaMCP to strip down
# the Ubuntu Server environment to absolute bare metal.
# Includes kernel-level cache dropping and service trimming.

set -uo pipefail

echo "--- VegaMCP Extreme Resource Optimization Starting (Linux) ---"

# 1. Drop page cache, dentries, and inodes (kernel-level memory reclaim)
echo "Dropping kernel page cache, dentries, and inodes..."
sync
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
FREE_BEFORE=$(free -m | awk 'NR==2{print $7}')
echo "Available RAM after cache drop: ${FREE_BEFORE} MB"

# 2. Disable Resource-Heavy Background Services
SERVICES_TO_KILL=(
    "snapd"              # Snap package manager (heavy on RAM)
    "snapd.socket"
    "ModemManager"       # USB modem manager (useless on VPS)
    "cups"               # Print service
    "cups-browsed"
    "avahi-daemon"       # mDNS/DNS-SD (useless on VPS)
    "bluetooth"          # Bluetooth (useless on VPS)
    "apport"             # Crash reporting
    "whoopsie"           # Error reporting to canonical
    "motd-news"          # MOTD news fetcher
    "unattended-upgrades" # Auto-update (we control updates)
)

for svc in "${SERVICES_TO_KILL[@]}"; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
        systemctl stop "$svc" 2>/dev/null || true
        systemctl disable "$svc" 2>/dev/null || true
        echo "Disabled bloatware service: $svc"
    fi
done

# Remove snap if installed (frees significant RAM + disk)
if command -v snap &>/dev/null; then
    echo "Removing snap packages to free resources..."
    snap list 2>/dev/null | awk 'NR>1{print $1}' | while read -r pkg; do
        snap remove --purge "$pkg" 2>/dev/null || true
    done
fi

# 3. Sysctl Tuning for Testing Performance
echo "Applying kernel performance tuning..."
cat > /etc/sysctl.d/99-REDACTED-perf.conf <<SYSCTL
# VegaMCP Performance Optimizations
vm.swappiness=10
vm.dirty_ratio=15
vm.dirty_background_ratio=5
vm.vfs_cache_pressure=50
net.core.somaxconn=65535
net.core.netdev_max_backlog=65536
net.ipv4.tcp_max_syn_backlog=65536
net.ipv4.tcp_fin_timeout=15
net.ipv4.tcp_tw_reuse=1
net.ipv4.ip_local_port_range=1024 65535
fs.file-max=2097152
fs.inotify.max_user_watches=524288
SYSCTL
sysctl --system > /dev/null 2>&1

# 4. Set CPU Governor to Performance (if available)
if [ -f /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]; then
    for gov in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
        echo "performance" > "$gov" 2>/dev/null || true
    done
    echo "Set CPU governor to Performance mode."
fi

# 5. Raise file descriptor limits
cat > /etc/security/limits.d/99-REDACTED.conf <<LIMITS
* soft nofile 1048576
* hard nofile 1048576
* soft nproc 65536
* hard nproc 65536
root soft nofile 1048576
root hard nofile 1048576
LIMITS
echo "Raised file descriptor and process limits."

# 6. Flush DNS Cache (systemd-resolved)
if systemctl is-active --quiet systemd-resolved 2>/dev/null; then
    resolvectl flush-caches 2>/dev/null || systemd-resolve --flush-caches 2>/dev/null || true
    echo "Flushed DNS cache."
fi

# 7. Clear systemd journal logs older than 1 day
journalctl --vacuum-time=1d > /dev/null 2>&1 || true
echo "Cleaned up old journal logs."

# 8. Remove old tmp files
find /tmp -type f -atime +2 -delete 2>/dev/null || true
echo "Cleaned /tmp stale files."

echo "--- VegaOptimizer Core Logic Applied (Linux) ---"
FREE_AFTER=$(free -m | awk 'NR==2{print $7}')
echo "Available RAM post-optimization: ${FREE_AFTER} MB"
