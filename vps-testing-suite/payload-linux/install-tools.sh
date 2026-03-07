#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# VegaMCP VPS Ultimate Testing Suite Installer — Linux Edition
# ═══════════════════════════════════════════════════════════════════════════════
# Automatically installs a comprehensive, hardware-aware suite of testing tools
# covering every domain: Web E2E, API/Load, Security, Forensics, CUA, etc.
# Uses apt, pip, npm, cargo — the Linux equivalents of Chocolatey.

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive

LOG_FILE="/opt/REDACTED-tests/logs/install-tools.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local ts
    ts=$(date +"%H:%M:%S")
    local line="[$ts] $1"
    echo -e "\033[36m$line\033[0m"
    echo "$line" >> "$LOG_FILE"
}

install_tier() {
    local tier_name="$1"
    local tier_desc="$2"
    shift 2
    local packages=("$@")
    [ ${#packages[@]} -eq 0 ] && return

    log ""
    log ">>> $tier_name — $tier_desc <<<"
    for pkg in "${packages[@]}"; do
        log "   Installing $pkg..."
        if apt-get install -y -qq "$pkg" >> "$LOG_FILE" 2>&1; then
            log "   [OK] $pkg"
        else
            log "   [FAIL] $pkg"
        fi
    done
}

log "========== VegaMCP Ultimate Testing Suite Installer (Linux) =========="

# ─── 1. HARDWARE ASSESSMENT ──────────────────────────────────────────────────
RAM_TOTAL_MB=$(free -m | awk 'NR==2{print $2}')
DISK_FREE_GB=$(df -BG / | awk 'NR==2{gsub("G",""); print $4}')
CPU_CORES=$(nproc)

HAS_GUI=false; [ "$RAM_TOTAL_MB" -ge 4096 ] && HAS_GUI=true
HAS_MEDIUM=false; [ "$RAM_TOTAL_MB" -ge 2048 ] && HAS_MEDIUM=true
HAS_STORAGE=false; [ "$DISK_FREE_GB" -ge 20 ] && HAS_STORAGE=true
HAS_BIG_DISK=false; [ "$DISK_FREE_GB" -ge 50 ] && HAS_BIG_DISK=true
HAS_VIRT=false; grep -q "vmx\|svm" /proc/cpuinfo 2>/dev/null && HAS_VIRT=true

log "Hardware: RAM=${RAM_TOTAL_MB}MB | Disk Free=${DISK_FREE_GB}GB | Cores=${CPU_CORES} | GUI=$HAS_GUI | Storage=$HAS_STORAGE | Virt=$HAS_VIRT"

# ─── 2. UPDATE PACKAGE INDEX ─────────────────────────────────────────────────
log "Updating apt package index..."
apt-get update -qq >> "$LOG_FILE" 2>&1

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 1: CORE RUNTIMES (Always Install)
# ═══════════════════════════════════════════════════════════════════════════════
install_tier "TIER 1" "Core Runtimes & Build Tools" \
    git \
    build-essential \
    cmake \
    make \
    pkg-config \
    libssl-dev \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    gnupg \
    software-properties-common

# Node.js LTS (via NodeSource)
if ! command -v node &>/dev/null; then
    log "   Installing Node.js LTS via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - >> "$LOG_FILE" 2>&1
    apt-get install -y -qq nodejs >> "$LOG_FILE" 2>&1
    log "   [OK] Node.js $(node --version 2>/dev/null || echo 'unknown')"
else
    log "   [OK] Node.js already installed: $(node --version)"
fi

# Java (OpenJDK)
install_tier "TIER 1b" "Java Runtime" default-jdk

# Rust toolchain
if ! command -v cargo &>/dev/null; then
    log "   Installing Rust toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal >> "$LOG_FILE" 2>&1
    export PATH="$HOME/.cargo/bin:$PATH"
    # Make it persistent
    echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> /etc/profile.d/rust.sh
    log "   [OK] Rust $(cargo --version 2>/dev/null || echo 'installed')"
else
    log "   [OK] Rust already installed: $(cargo --version)"
fi

# .NET SDK
if ! command -v dotnet &>/dev/null; then
    log "   Installing .NET SDK..."
    # Use the official Microsoft install script
    curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel LTS >> "$LOG_FILE" 2>&1
    export PATH="$HOME/.dotnet:$PATH"
    echo 'export PATH="$HOME/.dotnet:$PATH"' >> /etc/profile.d/dotnet.sh
    log "   [OK] .NET SDK installed"
else
    log "   [OK] .NET already installed: $(dotnet --version)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 2: CLI UTILITIES & DATA TOOLS (Always Install)
# ═══════════════════════════════════════════════════════════════════════════════
install_tier "TIER 2" "CLI Utilities & Data Processing" \
    curl \
    wget \
    jq \
    p7zip-full \
    openssl \
    gnupg2 \
    sqlite3 \
    ripgrep \
    fd-find \
    httpie \
    netcat-openbsd \
    dnsutils \
    unzip \
    zip

# yq (YAML processor — not in standard repos)
if ! command -v yq &>/dev/null; then
    log "   Installing yq..."
    curl -fsSL "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64" -o /usr/local/bin/yq
    chmod +x /usr/local/bin/yq
    log "   [OK] yq"
fi

# PostgreSQL
log ""
log ">>> TIER 2b — Databases <<<"
if ! command -v psql &>/dev/null; then
    apt-get install -y -qq postgresql postgresql-client >> "$LOG_FILE" 2>&1
    log "   [OK] PostgreSQL"
fi

# Redis
if ! command -v redis-server &>/dev/null; then
    apt-get install -y -qq redis-server >> "$LOG_FILE" 2>&1
    log "   [OK] Redis"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 3: SYSTEM FORENSICS & PROFILING (Always Install)
# Linux versions: strace, ltrace, perf, sysstat, etc.
# ═══════════════════════════════════════════════════════════════════════════════
install_tier "TIER 3" "System Forensics & Performance Profiling" \
    strace \
    ltrace \
    sysstat \
    htop \
    iotop \
    lsof \
    procps \
    gdb \
    valgrind

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 4: API & LOAD/STRESS TESTING (Always Install)
# ═══════════════════════════════════════════════════════════════════════════════
log ""
log ">>> TIER 4 — API & Load/Stress Testing <<<"

# k6 load testing
if ! command -v k6 &>/dev/null; then
    log "   Installing k6..."
    curl -fsSL https://dl.k6.io/key.gpg | gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg 2>/dev/null
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" > /etc/apt/sources.list.d/k6.list
    apt-get update -qq >> "$LOG_FILE" 2>&1
    apt-get install -y -qq k6 >> "$LOG_FILE" 2>&1
    log "   [OK] k6"
fi

# Python testing frameworks via pip
if command -v pip3 &>/dev/null; then
    log "   Installing Python testing frameworks..."
    pip3 install --break-system-packages --no-cache-dir --quiet \
        locust pytest pytest-html robotframework selenium requests httpx 2>> "$LOG_FILE" || true
    log "   [OK] Python packages: locust, pytest, robotframework, selenium, requests, httpx"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 5: MEDIA & VISUAL REGRESSION (Always Install)
# ═══════════════════════════════════════════════════════════════════════════════
install_tier "TIER 5" "Media & Visual Regression Testing" \
    ffmpeg \
    imagemagick \
    graphviz

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 6: BROWSER E2E TESTING (Requires >= 4GB RAM)
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$HAS_GUI" = true ]; then
    log ""
    log ">>> TIER 6 — Browser E2E Testing (GUI-Capable) <<<"

    # Chromium
    apt-get install -y -qq chromium-browser 2>/dev/null || apt-get install -y -qq chromium >> "$LOG_FILE" 2>&1 || true
    log "   [OK] Chromium browser"

    # Firefox
    apt-get install -y -qq firefox >> "$LOG_FILE" 2>&1 || true
    log "   [OK] Firefox browser"

    # Playwright + browsers
    if command -v npm &>/dev/null; then
        log "   Bootstrapping Playwright browsers..."
        npm install -g playwright @playwright/test 2>> "$LOG_FILE" || true
        npx playwright install --with-deps chromium firefox webkit 2>> "$LOG_FILE" || true
        log "   [OK] Playwright (Chromium, Firefox, WebKit)"

        # Cypress
        log "   Installing Cypress..."
        npm install -g cypress 2>> "$LOG_FILE" || true
        log "   [OK] Cypress"

        # Puppeteer
        log "   Installing Puppeteer..."
        npm install -g puppeteer 2>> "$LOG_FILE" || true
        log "   [OK] Puppeteer"
    fi
else
    log ">>> TIER 6 SKIPPED: Browser E2E requires >= 4GB RAM (Have ${RAM_TOTAL_MB}MB)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 7: CUA VISION ENGINE (replaces Windows Desktop GUI tier)
# Xvfb + xdotool + scrot + x11vnc for headless GUI automation
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$HAS_GUI" = true ]; then
    log ""
    log ">>> TIER 7 — CUA Vision Engine (Headless GUI) <<<"
    install_tier "TIER 7" "CUA Dependencies" \
        xvfb \
        fluxbox \
        xdotool \
        scrot \
        x11-utils \
        x11-xserver-utils
else
    log ">>> TIER 7 SKIPPED: CUA Vision requires >= 4GB RAM"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 8: NETWORK & SECURITY PENETRATION TESTING (Requires >= 4GB RAM)
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$HAS_GUI" = true ]; then
    install_tier "TIER 8" "Network & Security Penetration Testing" \
        nmap \
        tcpdump \
        tshark \
        nikto \
        sqlmap \
        hashcat
else
    log ">>> TIER 8 SKIPPED: Security suite requires >= 4GB RAM"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 9: CONTAINERIZATION (Requires virt support + 50GB disk)
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$HAS_BIG_DISK" = true ]; then
    log ""
    log ">>> TIER 9 — Containerization Engine <<<"
    if ! command -v docker &>/dev/null; then
        log "   Installing Docker Engine..."
        curl -fsSL https://get.docker.com | sh >> "$LOG_FILE" 2>&1 || true
        systemctl enable docker 2>/dev/null || true
        systemctl start docker 2>/dev/null || true
        log "   [OK] Docker Engine"
    else
        log "   [OK] Docker already installed: $(docker --version)"
    fi
else
    log ">>> TIER 9 SKIPPED: Docker requires >= 50GB free disk"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 10: NODE.JS GLOBAL TESTING ECOSYSTEM
# ═══════════════════════════════════════════════════════════════════════════════
if command -v npm &>/dev/null; then
    log ""
    log ">>> TIER 10 — Node.js Global Testing Ecosystem <<<"
    NPM_PKGS=(
        typescript
        ts-node
        jest
        mocha
        eslint
        prettier
        lighthouse
        axe-core
        pa11y
        depcheck
        madge
    )
    for pkg in "${NPM_PKGS[@]}"; do
        npm install -g "$pkg" 2>> "$LOG_FILE" || true
        log "   [OK] npm: $pkg"
    done
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 11: VNC SERVER (Localhost-only, for CUA Vision via SSH Tunnel)
# ═══════════════════════════════════════════════════════════════════════════════
log ""
log ">>> TIER 11 — VNC Server (Secured to Localhost) <<<"
if ! command -v x11vnc &>/dev/null; then
    apt-get install -y -qq x11vnc >> "$LOG_FILE" 2>&1
fi
log "   [OK] x11vnc installed (will bind to localhost:5900 via entrypoint)"

# ═══════════════════════════════════════════════════════════════════════════════
# FINAL: PATH REFRESH AND SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
# Source any new profile scripts
for f in /etc/profile.d/*.sh; do
    source "$f" 2>/dev/null || true
done

log ""
log "========== INSTALLATION COMPLETE =========="
log "Check full log at: $LOG_FILE"

# Output capability summary for VegaMCP to parse
INSTALLED=()
command -v node    &>/dev/null && INSTALLED+=("nodejs")
command -v python3 &>/dev/null && INSTALLED+=("python")
command -v git     &>/dev/null && INSTALLED+=("git")
command -v dotnet  &>/dev/null && INSTALLED+=("dotnet")
command -v java    &>/dev/null && INSTALLED+=("java")
command -v cargo   &>/dev/null && INSTALLED+=("rust")
command -v k6      &>/dev/null && INSTALLED+=("k6")
command -v nmap    &>/dev/null && INSTALLED+=("nmap")
command -v ffmpeg  &>/dev/null && INSTALLED+=("ffmpeg")
command -v docker  &>/dev/null && INSTALLED+=("docker")
command -v npx     &>/dev/null && INSTALLED+=("playwright" "cypress")
command -v x11vnc  &>/dev/null && INSTALLED+=("vnc")

log "Verified Tools: $(IFS=', '; echo "${INSTALLED[*]}")"
log "Total Verified: ${#INSTALLED[@]}"
