#!/bin/bash
# ═══════════════════════════════════════════════════════════
# VegaMCP VPS Deep Assessment — Linux Edition (v2)
# ═══════════════════════════════════════════════════════════
# Outputs a comprehensive JSON capabilities profile so
# VegaMCP's Router Engine knows exactly what this VPS can do.

set -uo pipefail

# ─── Helper: Check if command exists ─────────────────────
has_cmd() { command -v "$1" &>/dev/null; }

# ─── Hardware Metrics ─────────────────────────────────────
HOSTNAME_VAL=$(hostname)
ASSESSED_AT=$(date -Iseconds)

CPU_NAME=$(lscpu | grep "Model name" | sed 's/Model name:\s*//' | xargs)
TOTAL_CORES=$(nproc --all 2>/dev/null || echo 1)
LOGICAL_CORES=$(nproc 2>/dev/null || echo 1)
CPU_LOAD_PCT=$(awk '{printf "%.0f", $1 * 100 / '"$LOGICAL_CORES"'}' /proc/loadavg)

RAM_TOTAL_MB=$(free -m | awk 'NR==2{print $2}')
RAM_FREE_MB=$(free -m | awk 'NR==2{print $7}')  # available

DISK_TOTAL_GB=$(df -BG / | awk 'NR==2{gsub("G",""); print $2}')
DISK_FREE_GB=$(df -BG / | awk 'NR==2{gsub("G",""); print $4}')

# GPU detection
GPU_NAME="None"
if has_cmd nvidia-smi; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "None")
elif [ -d /sys/class/drm ]; then
    GPU_NAME=$(cat /sys/class/drm/card0/device/label 2>/dev/null || echo "None")
fi

# ─── Capability Detection ────────────────────────────────
CAPABILITIES=()
INSTALLED_TOOLS=()
BROWSERS=()

# Hardware capabilities
[ "$RAM_TOTAL_MB" -ge 8192 ] && CAPABILITIES+=("heavy_workloads")
[ "$RAM_TOTAL_MB" -ge 4096 ] && CAPABILITIES+=("gui_testing")
[ "$RAM_TOTAL_MB" -ge 2048 ] && CAPABILITIES+=("medium_testing")
[ "$DISK_FREE_GB" -ge 50 ] && CAPABILITIES+=("large_storage")
[ "$DISK_FREE_GB" -ge 20 ] && CAPABILITIES+=("media_caching")
[ "$GPU_NAME" != "None" ] && CAPABILITIES+=("gpu_available")

# Virtualization
if grep -q "vmx\|svm" /proc/cpuinfo 2>/dev/null; then
    CAPABILITIES+=("nested_virtualization")
fi

# Software detection
declare -A SOFTWARE_MAP=(
    [node]="nodejs"
    [npm]="npm"
    [npx]="npx"
    [python3]="python"
    [pip3]="pip"
    [git]="git"
    [dotnet]="dotnet"
    [java]="java"
    [cargo]="rust"
    [docker]="docker"
    [k6]="k6_load_testing"
    [nmap]="nmap"
    [ffmpeg]="ffmpeg"
    [curl]="curl"
    [jq]="jq"
    [sqlite3]="sqlite"
    [convert]="imagemagick"
    [hashcat]="hashcat"
)

for cmd in "${!SOFTWARE_MAP[@]}"; do
    if has_cmd "$cmd"; then
        cap="${SOFTWARE_MAP[$cmd]}"
        CAPABILITIES+=("$cap")
        INSTALLED_TOOLS+=("$cap")
    fi
done

# Browser detection
if has_cmd google-chrome || has_cmd google-chrome-stable; then
    BROWSERS+=("chrome"); CAPABILITIES+=("browser_chrome")
fi
if has_cmd firefox; then
    BROWSERS+=("firefox"); CAPABILITIES+=("browser_firefox")
fi
if has_cmd microsoft-edge || has_cmd microsoft-edge-stable; then
    BROWSERS+=("edge"); CAPABILITIES+=("browser_edge")
fi
if has_cmd chromium-browser || has_cmd chromium; then
    BROWSERS+=("chromium"); CAPABILITIES+=("browser_chromium")
fi

# Playwright detection
if has_cmd npx; then
    if npx playwright --version &>/dev/null; then
        CAPABILITIES+=("playwright")
        INSTALLED_TOOLS+=("playwright")
    fi
fi

# Service detection
if systemctl is-active --quiet sshd 2>/dev/null || systemctl is-active --quiet ssh 2>/dev/null; then
    CAPABILITIES+=("ssh")
fi
if has_cmd x11vnc || has_cmd Xvnc; then
    CAPABILITIES+=("vnc_local")
fi

# Database detection
if systemctl is-active --quiet postgresql 2>/dev/null; then
    CAPABILITIES+=("postgresql"); INSTALLED_TOOLS+=("postgresql")
fi
if systemctl is-active --quiet redis-server 2>/dev/null || systemctl is-active --quiet redis 2>/dev/null; then
    CAPABILITIES+=("redis"); INSTALLED_TOOLS+=("redis")
fi

# VegaGateway detection
if systemctl is-active --quiet vega-gateway 2>/dev/null; then
    CAPABILITIES+=("vega_gateway")
fi

# ─── Concurrency Calculation ─────────────────────────────
RAM_SLOTS=$((RAM_FREE_MB / 1024))
MAX_CONCURRENT=$RAM_SLOTS
[ "$MAX_CONCURRENT" -gt "$LOGICAL_CORES" ] && MAX_CONCURRENT=$LOGICAL_CORES
[ "$MAX_CONCURRENT" -le 0 ] && [ "$RAM_FREE_MB" -gt 512 ] && MAX_CONCURRENT=1

# ─── Testing Domain Assessment ───────────────────────────
TESTING_DOMAINS=()
for cap in "${CAPABILITIES[@]}"; do
    case "$cap" in
        nodejs|python) TESTING_DOMAINS+=("unit_testing") ;;
        playwright|browser_chrome|browser_chromium) TESTING_DOMAINS+=("web_e2e_testing") ;;
        k6_load_testing) TESTING_DOMAINS+=("load_stress_testing") ;;
        nmap|hashcat) TESTING_DOMAINS+=("security_penetration_testing") ;;
        ffmpeg|imagemagick) TESTING_DOMAINS+=("visual_regression_testing") ;;
        docker) TESTING_DOMAINS+=("container_testing") ;;
        postgresql|sqlite) TESTING_DOMAINS+=("database_testing") ;;
        npm) TESTING_DOMAINS+=("dependency_auditing") ;;
    esac
done

# Deduplicate arrays
CAPABILITIES=($(printf "%s\n" "${CAPABILITIES[@]}" | sort -u))
INSTALLED_TOOLS=($(printf "%s\n" "${INSTALLED_TOOLS[@]}" | sort -u))
TESTING_DOMAINS=($(printf "%s\n" "${TESTING_DOMAINS[@]}" | sort -u))
BROWSERS=($(printf "%s\n" "${BROWSERS[@]}" | sort -u))

# ─── Output JSON ─────────────────────────────────────────
json_array() {
    local arr=("$@")
    local result="["
    local first=true
    for item in "${arr[@]}"; do
        [ "$first" = true ] && first=false || result+=","
        result+="\"$item\""
    done
    result+="]"
    echo "$result"
}

SUITE_INSTALLED=false
if has_cmd node && has_cmd python3 && has_cmd git; then
    SUITE_INSTALLED=true
fi

READY=$([ "${#INSTALLED_TOOLS[@]}" -ge 5 ] && echo "true" || echo "false")

cat <<EOF
{
    "hostname": "$HOSTNAME_VAL",
    "assessed_at": "$ASSESSED_AT",
    "os": "linux",
    "distro": "$(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)",
    "kernel": "$(uname -r)",
    "hardware": {
        "cpu_name": "$CPU_NAME",
        "total_cores": $TOTAL_CORES,
        "logical_cores": $LOGICAL_CORES,
        "cpu_load_pct": $CPU_LOAD_PCT,
        "total_ram_mb": $RAM_TOTAL_MB,
        "free_ram_mb": $RAM_FREE_MB,
        "total_disk_gb": $DISK_TOTAL_GB,
        "free_disk_gb": $DISK_FREE_GB,
        "gpu": "$GPU_NAME"
    },
    "capabilities": $(json_array "${CAPABILITIES[@]}"),
    "installed_tools": $(json_array "${INSTALLED_TOOLS[@]}"),
    "browsers": $(json_array "${BROWSERS[@]}"),
    "testing_domains": $(json_array "${TESTING_DOMAINS[@]}"),
    "recommended_concurrency": $MAX_CONCURRENT,
    "ready_for_testing": $READY,
    "suite_installed": $SUITE_INSTALLED
}
EOF
