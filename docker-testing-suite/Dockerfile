# ═══════════════════════════════════════════════════════════
# VegaMCP Docker Testing Container — "The Claw" (Linux)
# ═══════════════════════════════════════════════════════════
# A disposable, isolated Linux container with:
#   - Xvfb virtual framebuffer (fake display for GUI testing)
#   - Fluxbox lightweight window manager
#   - Full CUA capabilities (screenshot, mouse, keyboard)
#   - All testing runtimes pre-installed
#   - VegaSentinel Gateway (port 42015) for RPC control

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV SCREEN_WIDTH=1920
ENV SCREEN_HEIGHT=1080
ENV SCREEN_DEPTH=24

# ─── Core System + Virtual Display ───────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Virtual framebuffer & window manager
    xvfb \
    fluxbox \
    x11vnc \
    # Screenshot & GUI automation
    xdotool \
    scrot \
    imagemagick \
    # Core runtimes
    curl \
    wget \
    git \
    jq \
    python3 \
    python3-pip \
    python3-venv \
    # Node.js (via NodeSource)
    ca-certificates \
    gnupg \
    # Build tools
    build-essential \
    cmake \
    pkg-config \
    libssl-dev \
    # Network & security testing
    nmap \
    openssl \
    netcat-openbsd \
    dnsutils \
    # Media & visual regression
    ffmpeg \
    graphviz \
    # Text processing
    ripgrep \
    fd-find \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js LTS ─────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ─── Rust Toolchain ──────────────────────────────────────
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# ─── Python Testing Frameworks ───────────────────────────
RUN pip3 install --break-system-packages --no-cache-dir \
    pytest pytest-html locust robotframework \
    selenium requests httpx pillow

# ─── Node.js Testing Frameworks ──────────────────────────
RUN npm install -g \
    typescript ts-node \
    jest mocha \
    eslint prettier \
    playwright @playwright/test \
    cypress puppeteer \
    lighthouse pa11y axe-core \
    k6 \
    depcheck madge

# ─── Playwright Browsers ─────────────────────────────────
RUN npx playwright install --with-deps chromium firefox webkit

# ─── k6 Load Testing ─────────────────────────────────────
RUN curl -fsSL https://dl.k6.io/key.gpg | gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" > /etc/apt/sources.list.d/k6.list \
    && apt-get update && apt-get install -y k6 \
    && rm -rf /var/lib/apt/lists/*

# ─── Create workspace ────────────────────────────────────
RUN mkdir -p /REDACTED/tests /REDACTED/logs /REDACTED/results /REDACTED/media /REDACTED/payload

# ─── Copy the Gateway source and build it ────────────────
COPY gateway-linux/ /REDACTED/gateway-src/
WORKDIR /REDACTED/gateway-src
RUN cargo build --release \
    && cp target/release/vega-gateway-linux /usr/local/bin/vega-gateway \
    && rm -rf target

# ─── Entrypoint script ───────────────────────────────────
COPY entrypoint.sh /REDACTED/entrypoint.sh
RUN chmod +x /REDACTED/entrypoint.sh

WORKDIR /REDACTED/tests
EXPOSE 42015 5900

ENTRYPOINT ["/REDACTED/entrypoint.sh"]
