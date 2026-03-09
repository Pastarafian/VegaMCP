# VegaMCP VPS & Docker Testing Suite

> **The most comprehensive AI-controlled testing infrastructure ever built for an MCP server.**

Two complementary backends — a persistent Windows VPS and disposable Docker containers — unified under a single API through the VegaSentinel Gateway.

---

## Architecture

```
  IDE Instance A                IDE Instance B
  (e.g. VS Code + Claude)      (e.g. Cursor + Gemini)
        │                              │
        ▼                              ▼
  VegaMCP Server (local)         VegaMCP Server (local)
        │                              │
        ├──── SSH Tunnel ──────────────►│
        │                              │
        ▼                              ▼
  ┌─────────────────────────────────────────────┐
  │  VegaSentinel Gateway (Rust, port 42015)    │
  │  ├── VPS: NT AUTHORITY\SYSTEM, Win32 API    │
  │  └── Docker: root, xdotool, Xvfb           │
  │                                             │
  │  Same JSON-RPC API on both backends:        │
  │  {"action":"screenshot"} → Base64 PNG       │
  │  {"action":"mouse_click","x":500,"y":300}   │
  │  {"action":"exec","command":"node test.js"} │
  └─────────────────────────────────────────────┘
```

## Quick Start

### Windows VPS (VPS-1)

```bash
# 1. Run bootstrap on VPS via RDP (one-time only)
#    Copy 1-vps-bootstrap.bat to VPS, run as Admin

# 2. Configure .env with VPS credentials
VEGAMCP_VPS_1_HOST=<your-vps-ip>
VEGAMCP_VPS_1_SSH_PORT=22
VEGAMCP_VPS_1_USERNAME=Administrator
VEGAMCP_VPS_1_PASSWORD=your_password

# 3. Deploy everything automatically
node scripts/deploy-vps.js
```

### Ubuntu Linux VPS (VPS-2)

```bash
# 1. Configure .env with VPS credentials (SSH already enabled on Ubuntu)
VEGAMCP_VPS_2_HOST=<your-vps-ip>
VEGAMCP_VPS_2_SSH_PORT=22
VEGAMCP_VPS_2_USERNAME=root
VEGAMCP_VPS_2_PASSWORD=your_password
VEGAMCP_VPS_2_OS=linux

# 2. Deploy everything automatically (no bootstrap needed — Ubuntu has SSH by default)
node scripts/deploy-linux-vps.js
```

### Docker Containers

```bash
# Build and start testing container
cd docker-testing-suite
docker compose up -d vega-test

# With parallel workers
docker compose --profile parallel up -d
```

## VegaSentinel Gateway v2.0 — "The Claw"

A custom Rust binary providing 7-layer system control:

| Layer             | Actions                                                            | Windows VPS                     | Docker Container           |
| ----------------- | ------------------------------------------------------------------ | ------------------------------- | -------------------------- |
| **0: Health**     | `ping`, `metrics`                                                  | WMI queries                     | `/proc`, `free`, `top`     |
| **1: Execute**    | `exec`, `exec_ps`                                                  | cmd/PowerShell as SYSTEM        | `sh -c` as root            |
| **2: Process**    | `process_list`, `kill`, `kill_by_name`                             | `taskkill /F`                   | `kill -9`, `pkill`         |
| **3: Memory**     | `trim_memory`                                                      | `psapi.dll EmptyWorkingSet()`   | `/proc/sys/vm/drop_caches` |
| **4: CUA Vision** | `screenshot`, `mouse_move`, `mouse_click`, `type_text`, `send_key` | `CopyFromScreen` + `user32.dll` | `scrot` + `xdotool`        |
| **5: Files**      | `read_file`, `write_file`, `list_dir`                              | PowerShell at SYSTEM            | `fs` at root               |
| **6: Services**   | `service_status/start/stop`, `reg_read`                            | Windows Service Manager         | `service`                  |
| **7: Network**    | `netstat`, `firewall_rules`                                        | `Get-NetTCPConnection`          | `ss -tlnp`                 |

### The CUA Loop (Novel Feature)

```
VegaMCP → {"action":"screenshot"}
Gateway → {base64 PNG of VPS/container desktop}
   AI → "I see a dialog box at (450, 320)"
VegaMCP → {"action":"mouse_click","x":450,"y":320}
VegaMCP → {"action":"type_text","text":"test data"}
VegaMCP → {"action":"send_key","key":"enter"}
VegaMCP → {"action":"screenshot"}  // verify
```

## Tool Installation (VPS Only)

11 hardware-aware tiers, 50+ packages:

| Tier | Domain        | Key Tools                                     | Guard          |
| ---- | ------------- | --------------------------------------------- | -------------- |
| 1    | Core Runtimes | Node.js, Python, .NET, Java, Rust, CMake      | Always         |
| 2    | CLI & Data    | curl, jq, yq, SQLite, PostgreSQL, Redis       | Always         |
| 3    | Forensics     | Sysinternals, WinDbg, Debug Diagnostic        | Always         |
| 4    | API Testing   | k6, Postman, HTTPie, Locust, pytest           | Always         |
| 5    | Visual        | FFmpeg, ImageMagick, Graphviz                 | Always         |
| 6    | Browser E2E   | Chrome, Firefox, Edge, Playwright, Cypress    | ≥4GB RAM       |
| 7    | Desktop GUI   | WinAppDriver, FlaUI                           | ≥4GB RAM       |
| 8    | Security      | Nmap, Wireshark, Nikto, SQLMap, Hashcat       | ≥4GB RAM       |
| 9    | Containers    | Docker Desktop                                | Hyper-V + 50GB |
| 10   | Node.js       | TypeScript, Jest, Mocha, Lighthouse, axe-core | Always         |
| 11   | VNC           | TightVNC (localhost-only, SSH tunnel)         | Always         |

## Deployment Pipeline

```
1-vps-bootstrap.bat (manual, enables SSH)
        │
deploy-vps.js (automated SFTP + SSH)
        │
        ├── start-logger.ps1     → Background telemetry + desktop viewer
        ├── assess-vps.ps1       → JSON capability profile
        ├── optimize-vps.ps1     → Win32 API trimming + Defender bypass
        ├── install-tools.ps1    → 11-tier Chocolatey installer
        └── install-gateway.ps1  → Compile Rust + register service

Result: VPS is a fully armed testing fortress, controllable via SSH tunnel.
```

## Port Mappings

| Service | VPS                | Docker Primary | Worker 1 | Worker 2 |
| ------- | ------------------ | -------------- | -------- | -------- |
| Gateway | 42015 (SSH tunnel) | 42016          | 42017    | 42018    |
| VNC     | 5900 (SSH tunnel)  | 5901           | 5902     | 5903     |
| SSH     | 22                 | —              | —        | —        |

## When to Use Each

| Scenario                     | Docker | VPS |
| ---------------------------- | ------ | --- |
| Quick unit tests             | ✅     |     |
| Browser E2E (parallel)       | ✅     |     |
| Disposable environments      | ✅     |     |
| Windows-specific testing     |        | ✅  |
| Desktop app automation       |        | ✅  |
| Security scans (external IP) |        | ✅  |
| Long-running servers         |        | ✅  |
| GPU/hardware testing         |        | ✅  |

## File Structure

```
vps-testing-suite/
├── 1-vps-bootstrap.bat                 # One-time SSH enabler
├── README.md                           # This file
├── payload/
│   ├── start-logger.ps1                # Background sentinel
│   ├── assess-vps.ps1                  # Hardware capability scanner
│   ├── optimize-vps.ps1                # Win32 memory optimizer
│   ├── install-tools.ps1               # 11-tier installer
│   └── install-gateway.ps1             # Rust gateway deployer
└── gateway-src/
    ├── Cargo.toml
    └── src/main.rs                     # VegaSentinel v2.0 (Windows)

docker-testing-suite/
├── Dockerfile                          # Full testing container
├── docker-compose.yml                  # Primary + 2 workers
├── entrypoint.sh                       # Xvfb → Fluxbox → VNC → Gateway
├── README.md
└── gateway-linux/
    ├── Cargo.toml
    └── src/main.rs                     # VegaSentinel v2.0 (Linux)
```
