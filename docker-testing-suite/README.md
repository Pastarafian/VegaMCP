# VegaMCP Docker Testing Suite

> Disposable, isolated Linux containers with full CUA (Computer-Using Agent) capabilities.

## Quick Start

```bash
# Build and start the primary testing container
docker compose up -d vega-test

# With parallel workers for distributed testing
docker compose --profile parallel up -d
```

## What's Inside Each Container

- **Xvfb** — Virtual 1920x1080 display (no physical monitor needed)
- **Fluxbox** — Lightweight window manager for GUI apps
- **VNC** — Visual inspection via port 5900
- **VegaSentinel Gateway** — Rust RPC on port 42015 (same 7-layer API as VPS)
- **Telemetry Logger** — Background CPU/RAM monitoring

### Pre-installed Testing Tools
| Tool | Purpose |
|------|---------|
| Node.js, Python, Rust | Runtime environments |
| Playwright + Chromium/Firefox/WebKit | Headless browser testing |
| Cypress, Puppeteer | Alternative browser automation |
| k6, Locust | Load/stress testing |
| Jest, Mocha, pytest | Unit testing |
| Lighthouse, pa11y, axe-core | Accessibility & performance |
| Nmap, OpenSSL | Network security testing |
| FFmpeg, ImageMagick | Visual regression |
| xdotool, scrot | GUI automation & screenshots |

## Port Mapping

| Container | Gateway | VNC |
|-----------|---------|-----|
| `vega-test` (primary) | `localhost:42016` | `localhost:5901` |
| `vega-worker-1` | `localhost:42017` | `localhost:5902` |
| `vega-worker-2` | `localhost:42018` | `localhost:5903` |

## CUA Usage (Identical API to VPS)

```bash
# Screenshot the container desktop
echo '{"action":"screenshot"}' | nc localhost 42016

# Click at coordinates
echo '{"action":"mouse_click","x":500,"y":300}' | nc localhost 42016

# Type text
echo '{"action":"type_text","text":"Hello from VegaMCP"}' | nc localhost 42016

# Run a command inside the container
echo '{"action":"exec","command":"node --version"}' | nc localhost 42016
```

## VPS vs Docker — When to Use Each

| Scenario | Use Docker | Use VPS |
|----------|-----------|---------|
| Quick unit tests | ✅ | |
| Parallel browser E2E | ✅ | |
| Disposable environments | ✅ | |
| Windows-specific testing | | ✅ |
| Desktop app (WinAppDriver) | | ✅ |
| Security scans from external IP | | ✅ |
| Long-running test servers | | ✅ |
