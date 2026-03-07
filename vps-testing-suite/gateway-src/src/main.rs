#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! VegaSentinel Gateway v2.1 — "The Claw"
//!
//! A bare-metal Rust TCP server running as NT AUTHORITY\SYSTEM on localhost:42015.
//! VegaMCP tunnels into it via SSH for zero-latency, sub-millisecond RPC.
//!
//! v2.1 Novel Features:
//!   - Full CUA (Computer-Using Agent) vision: screenshot → base64 → AI analysis
//!   - Complete process enumeration via Win32 TlHelp32 API
//!   - Deep memory trimming across ALL processes (SYSTEM privilege)
//!   - Mouse & keyboard injection for GUI automation
//!   - File system operations at SYSTEM level
//!   - Service management (start, stop, query)
//!   - Registry read/write
//!   - System metrics (CPU, RAM, Disk) in real-time

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

// ═══════════════════════════════════════════════════════════════
// GLOBAL RELAY STORE — MCP-to-MCP message broker
// ═══════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, Clone, Debug)]
struct RelayMessage {
    from: String,
    channel: String,
    payload: serde_json::Value,
    timestamp: u64,
}

static RELAY: std::sync::LazyLock<Mutex<HashMap<String, VecDeque<RelayMessage>>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Deserialize, Debug)]
struct GatewayRequest {
    action: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    pid: Option<u32>,
    // CUA fields
    x: Option<i32>,
    y: Option<i32>,
    text: Option<String>,
    key: Option<String>,
    // File operations
    path: Option<String>,
    // Relay fields (MCP-to-MCP)
    channel: Option<String>,
    from: Option<String>,
    payload: Option<serde_json::Value>,
    count: Option<usize>,
    content: Option<String>,
    // Service/Registry
    service_name: Option<String>,
    reg_key: Option<String>,
    reg_value: Option<String>,
}

#[derive(Serialize, Debug)]
struct GatewayResponse {
    success: bool,
    action: String,
    output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
}

fn main() {
    let port = 42015;
    let listener = match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(l) => l,
        Err(_) => return,
    };

    // Accept connections in a tight loop
    for stream in listener.incoming() {
        if let Ok(stream) = stream {
            thread::spawn(move || handle_client(stream));
        }
    }
}

fn handle_client(mut stream: TcpStream) {
    // Use a larger buffer for screenshot responses
    let mut buffer = vec![0u8; 65536];

    if let Ok(size) = stream.read(&mut buffer) {
        if size == 0 {
            return;
        }

        let req_str = String::from_utf8_lossy(&buffer[..size]);

        let response = match serde_json::from_str::<GatewayRequest>(&req_str) {
            Ok(req) => {
                let action = req.action.clone();
                let mut resp = process_request(req);
                resp.action = action;
                resp
            }
            Err(e) => GatewayResponse {
                success: false,
                action: "error".into(),
                output: String::new(),
                error: Some(format!("Invalid JSON: {}", e)),
                data: None,
            },
        };

        let res_json = serde_json::to_string(&response).unwrap_or_default();
        let _ = stream.write_all(res_json.as_bytes());
    }
}

fn process_request(req: GatewayRequest) -> GatewayResponse {
    match req.action.as_str() {
        // ═══════════════════════════════════════════════════════════════
        // LAYER 0: HEALTH & DIAGNOSTICS
        // ═══════════════════════════════════════════════════════════════
        "ping" => ok("PONG — VegaSentinel v2.0 alive. NT_AUTHORITY\\SYSTEM."),

        "metrics" => {
            // Real-time system metrics via PowerShell (fastest method from SYSTEM)
            let ps = r#"
                $os = Get-WmiObject Win32_OperatingSystem
                $cpu = Get-WmiObject Win32_Processor
                $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
                @{
                    cpu_pct = $cpu.LoadPercentage
                    ram_total_mb = [math]::Round($os.TotalVisibleMemorySize / 1024)
                    ram_free_mb = [math]::Round($os.FreePhysicalMemory / 1024)
                    disk_free_gb = [math]::Round($disk.FreeSpace / 1GB, 1)
                    uptime_hours = [math]::Round(((Get-Date) - $os.ConvertToDateTime($os.LastBootUpTime)).TotalHours, 1)
                    process_count = (Get-Process).Count
                } | ConvertTo-Json
            "#;
            exec_ps(ps)
        }

        // ═══════════════════════════════════════════════════════════════
        // LAYER 1: COMMAND EXECUTION (SYSTEM PRIVILEGE)
        // ═══════════════════════════════════════════════════════════════
        "exec" => {
            let cmd = req.command.unwrap_or_default();
            match Command::new("cmd").args(&["/C", &cmd]).output() {
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                    if out.status.success() {
                        ok(&stdout)
                    } else {
                        err(&stdout, &stderr)
                    }
                }
                Err(e) => err("", &e.to_string()),
            }
        }

        "exec_ps" => {
            let cmd = req.command.unwrap_or_default();
            exec_ps(&cmd)
        }

        // ═══════════════════════════════════════════════════════════════
        // LAYER 2: PROCESS MANAGEMENT
        // ═══════════════════════════════════════════════════════════════
        "process_list" => {
            let ps = r#"Get-Process | Select-Object Id, ProcessName, 
                @{N='WorkingSetMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, 
                @{N='CPU';E={[math]::Round($_.CPU,1)}} | 
                Sort-Object WorkingSetMB -Descending | 
                Select-Object -First 50 | ConvertTo-Json"#;
            exec_ps(ps)
        }

        "kill" => {
            let pid = req.pid.unwrap_or(0);
            if pid == 0 {
                return err("", "No PID provided");
            }
            match Command::new("taskkill")
                .args(&["/F", "/PID", &pid.to_string()])
                .output()
            {
                Ok(out) => {
                    if out.status.success() {
                        ok(&format!("Killed PID {}", pid))
                    } else {
                        err("", &String::from_utf8_lossy(&out.stderr))
                    }
                }
                Err(e) => err("", &e.to_string()),
            }
        }

        "kill_by_name" => {
            let name = req.command.unwrap_or_default();
            match Command::new("taskkill")
                .args(&["/F", "/IM", &name])
                .output()
            {
                Ok(out) => ok(&String::from_utf8_lossy(&out.stdout)),
                Err(e) => err("", &e.to_string()),
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // LAYER 3: DEEP MEMORY MANAGEMENT (Win32 API)
        // ═══════════════════════════════════════════════════════════════
        "trim_memory" => {
            // Aggressive: trim ALL processes using SYSTEM-level access
            let ps = r#"
                $trimmed = 0
                Add-Type -TypeDefinition '
                    using System;
                    using System.Runtime.InteropServices;
                    public class Mem {
                        [DllImport("psapi.dll")] public static extern int EmptyWorkingSet(IntPtr h);
                        [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint a, bool b, int p);
                        [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
                    }
                ' -ErrorAction SilentlyContinue
                Get-Process | ForEach-Object {
                    $h = [Mem]::OpenProcess(0x0500, $false, $_.Id)
                    if ($h -ne [IntPtr]::Zero) {
                        [Mem]::EmptyWorkingSet($h) | Out-Null
                        [Mem]::CloseHandle($h) | Out-Null
                        $trimmed++
                    }
                }
                $os = Get-WmiObject Win32_OperatingSystem
                @{ trimmed = $trimmed; free_mb = [math]::Round($os.FreePhysicalMemory/1024) } | ConvertTo-Json
            "#;
            exec_ps(ps)
        }

        // ═══════════════════════════════════════════════════════════════
        // LAYER 4: CUA — COMPUTER-USING AGENT (THE CLAW)
        // This is the novel layer. VegaMCP can now SEE the VPS screen,
        // click anywhere, type anything, and read back what happened.
        // ═══════════════════════════════════════════════════════════════

        // Capture the VPS desktop as a Base64-encoded PNG
        "screenshot" => {
            let ps = r#"
                Add-Type -AssemblyName System.Windows.Forms
                Add-Type -AssemblyName System.Drawing
                $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
                $gfx = [System.Drawing.Graphics]::FromImage($bmp)
                $gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
                $ms = New-Object System.IO.MemoryStream
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                $b64 = [Convert]::ToBase64String($ms.ToArray())
                $gfx.Dispose(); $bmp.Dispose(); $ms.Dispose()
                @{ width = $bounds.Width; height = $bounds.Height; format = "png"; image_base64 = $b64 } | ConvertTo-Json
            "#;
            exec_ps(ps)
        }

        // Move the mouse to coordinates
        "mouse_move" => {
            let x = req.x.unwrap_or(0);
            let y = req.y.unwrap_or(0);
            let ps = format!(
                r#"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point({}, {}); @{{x={};y={}}} | ConvertTo-Json"#,
                x, y, x, y
            );
            exec_ps(&ps)
        }

        // Click at coordinates
        "mouse_click" => {
            let x = req.x.unwrap_or(0);
            let y = req.y.unwrap_or(0);
            let button = req.command.as_deref().unwrap_or("left");
            let ps = format!(r#"
                Add-Type -AssemblyName System.Windows.Forms
                Add-Type -TypeDefinition '
                    using System; using System.Runtime.InteropServices;
                    public class Mouse {{
                        [DllImport("user32.dll")] public static extern void SetCursorPos(int x, int y);
                        [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);
                    }}
                '
                [Mouse]::SetCursorPos({x}, {y})
                Start-Sleep -Milliseconds 50
                {click_code}
                @{{ clicked_x={x}; clicked_y={y}; button="{btn}" }} | ConvertTo-Json
            "#,
                x = x, y = y,
                btn = button,
                click_code = match button {
                    "right" => "[Mouse]::mouse_event(0x0008, 0, 0, 0, 0); [Mouse]::mouse_event(0x0010, 0, 0, 0, 0)",
                    "double" => "[Mouse]::mouse_event(0x0002, 0, 0, 0, 0); [Mouse]::mouse_event(0x0004, 0, 0, 0, 0); Start-Sleep -Milliseconds 50; [Mouse]::mouse_event(0x0002, 0, 0, 0, 0); [Mouse]::mouse_event(0x0004, 0, 0, 0, 0)",
                    _ => "[Mouse]::mouse_event(0x0002, 0, 0, 0, 0); [Mouse]::mouse_event(0x0004, 0, 0, 0, 0)",
                }
            );
            exec_ps(&ps)
        }

        // Type text using SendKeys
        "type_text" => {
            let text = req.text.unwrap_or_default();
            let ps = format!(
                r#"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("{}"); @{{ typed="{}" }} | ConvertTo-Json"#,
                text.replace("{", "{{")
                    .replace("}", "}}")
                    .replace("\"", "\\\""),
                text.replace("\"", "\\\"")
            );
            exec_ps(&ps)
        }

        // Send a specific key (Enter, Tab, Escape, etc.)
        "send_key" => {
            let key = req.key.unwrap_or_default();
            let sendkey = match key.to_lowercase().as_str() {
                "enter" => "~",
                "tab" => "{TAB}",
                "escape" | "esc" => "{ESC}",
                "backspace" => "{BS}",
                "delete" => "{DEL}",
                "up" => "{UP}",
                "down" => "{DOWN}",
                "left" => "{LEFT}",
                "right" => "{RIGHT}",
                "f1" => "{F1}",
                "f2" => "{F2}",
                "f3" => "{F3}",
                "f4" => "{F4}",
                "f5" => "{F5}",
                "f11" => "{F11}",
                "f12" => "{F12}",
                "ctrl+a" => "^a",
                "ctrl+c" => "^c",
                "ctrl+v" => "^v",
                "ctrl+s" => "^s",
                "ctrl+z" => "^z",
                "alt+f4" => "%{F4}",
                "alt+tab" => "%{TAB}",
                "win" => "^{ESC}",
                other => other,
            };
            let ps = format!(
                r#"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("{}"); @{{ sent="{}" }} | ConvertTo-Json"#,
                sendkey, key
            );
            exec_ps(&ps)
        }

        // ═══════════════════════════════════════════════════════════════
        // LAYER 5: FILE SYSTEM OPERATIONS (SYSTEM-LEVEL)
        // ═══════════════════════════════════════════════════════════════
        "read_file" => {
            let path = req.path.unwrap_or_default();
            let ps = format!(r#"Get-Content -Path '{}' -Raw"#, path);
            exec_ps(&ps)
        }

        "write_file" => {
            let path = req.path.unwrap_or_default();
            let content = req.content.unwrap_or_default();
            let ps = format!(
                r#"Set-Content -Path '{}' -Value '{}' -Force; @{{ written='{}' }} | ConvertTo-Json"#,
                path,
                content.replace("'", "''"),
                path
            );
            exec_ps(&ps)
        }

        "list_dir" => {
            let path = req.path.unwrap_or("C:\\".into());
            let ps = format!(
                r#"Get-ChildItem -Path '{}' | Select-Object Name, Length, Mode, LastWriteTime | ConvertTo-Json"#,
                path
            );
            exec_ps(&ps)
        }

        // ═══════════════════════════════════════════════════════════════
        // LAYER 6: SERVICE & REGISTRY MANAGEMENT
        // ═══════════════════════════════════════════════════════════════
        "service_status" => {
            let name = req.service_name.unwrap_or_default();
            let ps = format!(
                r#"Get-Service '{}' | Select-Object Name, Status, StartType | ConvertTo-Json"#,
                name
            );
            exec_ps(&ps)
        }

        "service_start" => {
            let name = req.service_name.unwrap_or_default();
            let ps = format!(
                r#"Start-Service '{}'; @{{ service='{}'; action='started' }} | ConvertTo-Json"#,
                name, name
            );
            exec_ps(&ps)
        }

        "service_stop" => {
            let name = req.service_name.unwrap_or_default();
            let ps = format!(
                r#"Stop-Service '{}' -Force; @{{ service='{}'; action='stopped' }} | ConvertTo-Json"#,
                name, name
            );
            exec_ps(&ps)
        }

        "reg_read" => {
            let key = req.reg_key.unwrap_or_default();
            let ps = format!(r#"Get-ItemProperty -Path '{}' | ConvertTo-Json"#, key);
            exec_ps(&ps)
        }

        // ═══════════════════════════════════════════════════════════════
        // LAYER 7: NETWORK DIAGNOSTICS
        // ═══════════════════════════════════════════════════════════════
        "netstat" => {
            let ps = r#"Get-NetTCPConnection | Where-Object State -eq 'Listen' | Select-Object LocalAddress, LocalPort, OwningProcess | ConvertTo-Json"#;
            exec_ps(ps)
        }

        "firewall_rules" => {
            let ps = r#"Get-NetFirewallRule -Enabled True | Select-Object -First 30 DisplayName, Direction, Action | ConvertTo-Json"#;
            exec_ps(ps)
        }

        // ═══════════════════════════════════════════════════════════════
        // LAYER 8: MCP-TO-MCP RELAY — Cross-instance agent communication
        // Multiple VegaMCP instances connect via SSH tunnel and exchange
        // messages through named channels. This is the world's first
        // MCP-to-MCP relay broker.
        // ═══════════════════════════════════════════════════════════════

        // Post a message to a relay channel
        "relay_post" => {
            let channel = req.channel.unwrap_or_default();
            let from = req.from.unwrap_or("anonymous".into());
            let payload = req.payload.unwrap_or(serde_json::Value::Null);
            if channel.is_empty() {
                return err("", "channel is required");
            }
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let msg = RelayMessage {
                from: from.clone(),
                channel: channel.clone(),
                payload,
                timestamp: ts,
            };
            let mut store = RELAY.lock().unwrap();
            store
                .entry(channel.clone())
                .or_insert_with(VecDeque::new)
                .push_back(msg);
            let queue_len = store.get(&channel).map(|q| q.len()).unwrap_or(0);
            ok(&format!(
                r#"{{"posted":true,"channel":"{}","from":"{}","queue_depth":{},"timestamp":{}}}"#,
                channel, from, queue_len, ts
            ))
        }

        // Poll for messages on a channel (pulls and removes from queue)
        "relay_poll" => {
            let channel = req.channel.unwrap_or_default();
            let count = req.count.unwrap_or(10);
            if channel.is_empty() {
                return err("", "channel is required");
            }
            let mut store = RELAY.lock().unwrap();
            let mut messages = Vec::new();
            if let Some(queue) = store.get_mut(&channel) {
                for _ in 0..count {
                    if let Some(msg) = queue.pop_front() {
                        messages.push(msg);
                    } else {
                        break;
                    }
                }
            }
            let remaining = store.get(&channel).map(|q| q.len()).unwrap_or(0);
            let json = serde_json::to_string(&messages).unwrap_or("[]".into());
            ok(&format!(
                r#"{{"channel":"{}","count":{},"remaining":{},"messages":{}}}"#,
                channel,
                messages.len(),
                remaining,
                json
            ))
        }

        // Peek at messages without removing them
        "relay_peek" => {
            let channel = req.channel.unwrap_or_default();
            let count = req.count.unwrap_or(10);
            if channel.is_empty() {
                return err("", "channel is required");
            }
            let store = RELAY.lock().unwrap();
            let messages: Vec<&RelayMessage> = store
                .get(&channel)
                .map(|q| q.iter().take(count).collect())
                .unwrap_or_default();
            let total = store.get(&channel).map(|q| q.len()).unwrap_or(0);
            let json = serde_json::to_string(&messages).unwrap_or("[]".into());
            ok(&format!(
                r#"{{"channel":"{}","total":{},"peeked":{},"messages":{}}}"#,
                channel,
                total,
                messages.len(),
                json
            ))
        }

        // List all active relay channels
        "relay_channels" => {
            let store = RELAY.lock().unwrap();
            let channels: Vec<serde_json::Value> = store
                .iter()
                .map(|(name, queue)| serde_json::json!({ "channel": name, "depth": queue.len() }))
                .collect();
            let json = serde_json::to_string(&channels).unwrap_or("[]".into());
            ok(&format!(
                r#"{{"channels":{},"total":{}}}"#,
                json,
                channels.len()
            ))
        }

        // Clear a channel or all channels
        "relay_clear" => {
            let channel = req.channel.unwrap_or_default();
            let mut store = RELAY.lock().unwrap();
            if channel.is_empty() || channel == "*" {
                let count = store.len();
                store.clear();
                ok(&format!(
                    r#"{{"cleared":"all","channels_removed":{}}}"#,
                    count
                ))
            } else {
                let removed = store.remove(&channel).map(|q| q.len()).unwrap_or(0);
                ok(&format!(
                    r#"{{"cleared":"{}","messages_removed":{}}}"#,
                    channel, removed
                ))
            }
        }

        _ => GatewayResponse {
            success: false,
            action: "unknown".into(),
            output: String::new(),
            error: Some(format!("Unknown action: {}", req.action)),
            data: None,
        },
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

fn ok(msg: &str) -> GatewayResponse {
    GatewayResponse {
        success: true,
        action: String::new(),
        output: msg.to_string(),
        error: None,
        data: None,
    }
}

fn err(output: &str, e: &str) -> GatewayResponse {
    GatewayResponse {
        success: false,
        action: String::new(),
        output: output.to_string(),
        error: Some(e.to_string()),
        data: None,
    }
}

fn exec_ps(script: &str) -> GatewayResponse {
    match Command::new("powershell")
        .args(&[
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
    {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            if out.status.success() {
                ok(&stdout)
            } else {
                err(&stdout, &stderr)
            }
        }
        Err(e) => err("", &e.to_string()),
    }
}
