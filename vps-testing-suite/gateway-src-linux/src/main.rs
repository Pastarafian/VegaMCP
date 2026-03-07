//! VegaSentinel Gateway v2.1 — Linux VPS Edition ("The Claw")
//!
//! Bare-metal Rust TCP server running as root on a Linux VPS.
//! VegaMCP tunnels into it via SSH for zero-latency, sub-millisecond RPC.
//!
//! Unlike the Docker edition (which runs inside a container with Xvfb always on),
//! this VPS edition:
//!   - Manages its own Xvfb lifecycle for CUA vision
//!   - Uses systemd for service management
//!   - Provides /proc and sysfs-based metrics (no WMI overhead)
//!   - Can manage iptables/ufw firewall rules
//!   - Layer 8: MCP-to-MCP relay broker

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine as _;

// MCP-to-MCP Relay Store
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
    pid: Option<u32>,
    x: Option<i32>,
    y: Option<i32>,
    text: Option<String>,
    key: Option<String>,
    path: Option<String>,
    content: Option<String>,
    // Relay fields
    channel: Option<String>,
    from: Option<String>,
    payload: Option<serde_json::Value>,
    count: Option<usize>,
    // Service management
    service_name: Option<String>,
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
        Err(e) => {
            eprintln!("Failed to bind to 127.0.0.1:{}: {}", port, e);
            return;
        }
    };

    eprintln!(
        "VegaSentinel Gateway v2.1 (Linux VPS) bound to 127.0.0.1:{}",
        port
    );

    for stream in listener.incoming() {
        if let Ok(stream) = stream {
            thread::spawn(move || handle_client(stream));
        }
    }
}

fn handle_client(mut stream: TcpStream) {
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
        let json = serde_json::to_string(&response).unwrap_or_default();
        let _ = stream.write_all(json.as_bytes());
    }
}

fn process_request(req: GatewayRequest) -> GatewayResponse {
    match req.action.as_str() {
        // ═══ LAYER 0: HEALTH & DIAGNOSTICS ═══
        "ping" => ok("PONG — VegaSentinel v2.1 (Linux VPS) alive. Running as root."),

        "metrics" => {
            // Efficient /proc-based metrics (zero subprocess overhead)
            let cpu_line = run_cmd(
                "sh",
                &[
                    "-c",
                    "top -bn1 | grep 'Cpu(s)' | awk '{printf \"%.1f\", $2+$4}'",
                ],
            );
            let mem = run_cmd("free", &["-m"]);
            let mem_parts: Vec<&str> = mem
                .lines()
                .nth(1)
                .unwrap_or("")
                .split_whitespace()
                .collect();
            let disk = run_cmd("df", &["-BM", "/"]);
            let disk_parts: Vec<&str> = disk
                .lines()
                .nth(1)
                .unwrap_or("")
                .split_whitespace()
                .collect();
            let procs = run_cmd("sh", &["-c", "ps aux | wc -l"]);

            // Parse uptime
            let uptime = fs::read_to_string("/proc/uptime").unwrap_or_default();
            let uptime_hours: f64 = uptime
                .split_whitespace()
                .next()
                .and_then(|s| s.parse::<f64>().ok())
                .map(|s| s / 3600.0)
                .unwrap_or(0.0);

            let json = format!(
                r#"{{"cpu_pct":{},"ram_total_mb":{},"ram_free_mb":{},"disk_free_mb":{},"uptime_hours":{:.1},"process_count":{}}}"#,
                cpu_line.trim(),
                mem_parts.get(1).unwrap_or(&"0"),
                mem_parts.get(6).unwrap_or(&"0"), // available
                disk_parts.get(3).unwrap_or(&"0").replace("M", ""),
                uptime_hours,
                procs.trim(),
            );
            ok(&json)
        }

        // ═══ LAYER 1: COMMAND EXECUTION (ROOT PRIVILEGE) ═══
        "exec" => {
            let cmd = req.command.unwrap_or_default();
            let output = run_cmd("sh", &["-c", &cmd]);
            ok(&output)
        }

        "exec_bash" => {
            let cmd = req.command.unwrap_or_default();
            let output = run_cmd("bash", &["-c", &cmd]);
            ok(&output)
        }

        // ═══ LAYER 2: PROCESS MANAGEMENT ═══
        "process_list" => {
            let output = run_cmd("ps", &["aux", "--sort=-%mem"]);
            let lines: Vec<&str> = output.lines().take(51).collect();
            ok(&lines.join("\n"))
        }

        "kill" => {
            let pid = req.pid.unwrap_or(0);
            if pid == 0 {
                return err("No PID provided");
            }
            let output = run_cmd("kill", &["-9", &pid.to_string()]);
            ok(&format!("Killed PID {}: {}", pid, output))
        }

        "kill_by_name" => {
            let name = req.command.unwrap_or_default();
            let output = run_cmd("pkill", &["-9", "-f", &name]);
            ok(&format!("Killed processes matching '{}': {}", name, output))
        }

        // ═══ LAYER 3: DEEP MEMORY MANAGEMENT ═══
        "trim_memory" => {
            // Kernel-level cache drop (requires root, which we have)
            let _ = Command::new("sync").output();
            let _ = fs::write("/proc/sys/vm/drop_caches", "3");
            let mem = run_cmd("free", &["-m"]);
            ok(&format!(
                "Caches dropped (sync + echo 3 > drop_caches).\n{}",
                mem
            ))
        }

        // ═══ LAYER 4: CUA VISION ENGINE ═══

        // Screenshot via scrot → base64
        "screenshot" => {
            // Ensure Xvfb display is set
            std::env::set_var("DISPLAY", ":99");
            let tmp = "/tmp/vega_screenshot.png";

            // Try scrot first, fall back to import (ImageMagick)
            let scrot_result = Command::new("scrot").args(&["-o", tmp]).output();
            let screenshot_ok = match scrot_result {
                Ok(out) => out.status.success(),
                Err(_) => {
                    // Fallback to ImageMagick's import
                    Command::new("import")
                        .args(&["-window", "root", tmp])
                        .output()
                        .map(|o| o.status.success())
                        .unwrap_or(false)
                }
            };

            if !screenshot_ok {
                return err("Screenshot capture failed. Is Xvfb running on :99?");
            }

            match fs::read(tmp) {
                Ok(bytes) => {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    let dims = run_cmd("identify", &["-format", "%wx%h", tmp]);
                    let parts: Vec<&str> = dims.trim().split('x').collect();
                    let w = parts.get(0).unwrap_or(&"1920");
                    let h = parts.get(1).unwrap_or(&"1080");
                    ok(&format!(
                        r#"{{"width":{},"height":{},"format":"png","image_base64":"{}"}}"#,
                        w, h, b64
                    ))
                }
                Err(e) => err(&format!("Failed to read screenshot: {}", e)),
            }
        }

        // Mouse move via xdotool
        "mouse_move" => {
            std::env::set_var("DISPLAY", ":99");
            let x = req.x.unwrap_or(0);
            let y = req.y.unwrap_or(0);
            run_cmd("xdotool", &["mousemove", &x.to_string(), &y.to_string()]);
            ok(&format!("Mouse moved to ({}, {})", x, y))
        }

        // Mouse click via xdotool
        "mouse_click" => {
            std::env::set_var("DISPLAY", ":99");
            let x = req.x.unwrap_or(0);
            let y = req.y.unwrap_or(0);
            let button = req.command.as_deref().unwrap_or("left");
            let btn_num = match button {
                "right" => "3",
                "middle" => "2",
                _ => "1",
            };
            run_cmd("xdotool", &["mousemove", &x.to_string(), &y.to_string()]);
            std::thread::sleep(std::time::Duration::from_millis(50));
            run_cmd("xdotool", &["click", btn_num]);
            ok(&format!("Clicked {} at ({}, {})", button, x, y))
        }

        // Double click
        "mouse_double_click" => {
            std::env::set_var("DISPLAY", ":99");
            let x = req.x.unwrap_or(0);
            let y = req.y.unwrap_or(0);
            run_cmd("xdotool", &["mousemove", &x.to_string(), &y.to_string()]);
            run_cmd("xdotool", &["click", "--repeat", "2", "--delay", "50", "1"]);
            ok(&format!("Double-clicked at ({}, {})", x, y))
        }

        // Type text via xdotool
        "type_text" => {
            std::env::set_var("DISPLAY", ":99");
            let text = req.text.unwrap_or_default();
            run_cmd(
                "xdotool",
                &["type", "--clearmodifiers", "--delay", "20", &text],
            );
            ok(&format!("Typed: {}", text))
        }

        // Send key via xdotool
        "send_key" => {
            std::env::set_var("DISPLAY", ":99");
            let key = req.key.unwrap_or_default();
            let xdo_key = match key.to_lowercase().as_str() {
                "enter" => "Return",
                "tab" => "Tab",
                "escape" | "esc" => "Escape",
                "backspace" => "BackSpace",
                "delete" => "Delete",
                "up" => "Up",
                "down" => "Down",
                "left" => "Left",
                "right" => "Right",
                "f1" => "F1",
                "f2" => "F2",
                "f3" => "F3",
                "f4" => "F4",
                "f5" => "F5",
                "f11" => "F11",
                "f12" => "F12",
                "ctrl+a" => "ctrl+a",
                "ctrl+c" => "ctrl+c",
                "ctrl+v" => "ctrl+v",
                "ctrl+s" => "ctrl+s",
                "ctrl+z" => "ctrl+z",
                "alt+f4" => "alt+F4",
                "alt+tab" => "alt+Tab",
                other => other,
            };
            run_cmd("xdotool", &["key", "--clearmodifiers", xdo_key]);
            ok(&format!("Sent key: {}", key))
        }

        // ═══ LAYER 5: FILE SYSTEM OPERATIONS (ROOT-LEVEL) ═══
        "read_file" => {
            let path = req.path.unwrap_or_default();
            match fs::read_to_string(&path) {
                Ok(content) => ok(&content),
                Err(e) => err(&format!("Cannot read {}: {}", path, e)),
            }
        }

        "write_file" => {
            let path = req.path.unwrap_or_default();
            let content = req.content.unwrap_or_default();
            match fs::write(&path, &content) {
                Ok(_) => ok(&format!("Written to {}", path)),
                Err(e) => err(&format!("Cannot write {}: {}", path, e)),
            }
        }

        "list_dir" => {
            let path = req.path.unwrap_or("/opt/REDACTED-tests".into());
            let output = run_cmd("ls", &["-la", &path]);
            ok(&output)
        }

        // ═══ LAYER 6: SERVICE MANAGEMENT (SYSTEMD) ═══
        "service_status" => {
            let name = req.service_name.unwrap_or_default();
            if name.is_empty() {
                let output = run_cmd(
                    "systemctl",
                    &[
                        "list-units",
                        "--type=service",
                        "--state=running",
                        "--no-pager",
                    ],
                );
                ok(&output)
            } else {
                let output = run_cmd("systemctl", &["status", &name, "--no-pager"]);
                ok(&output)
            }
        }

        "service_start" => {
            let name = req.service_name.unwrap_or_default();
            run_cmd("systemctl", &["start", &name]);
            ok(&format!("Started service: {}", name))
        }

        "service_stop" => {
            let name = req.service_name.unwrap_or_default();
            run_cmd("systemctl", &["stop", &name]);
            ok(&format!("Stopped service: {}", name))
        }

        // ═══ LAYER 7: NETWORK DIAGNOSTICS ═══
        "netstat" => {
            let output = run_cmd("ss", &["-tlnp"]);
            ok(&output)
        }

        "firewall_rules" => {
            // Try ufw first, fall back to iptables
            let ufw = run_cmd("ufw", &["status", "verbose"]);
            if ufw.contains("Status:") {
                ok(&ufw)
            } else {
                let ipt = run_cmd("iptables", &["-L", "-n", "--line-numbers"]);
                ok(&ipt)
            }
        }

        // ═══ LAYER 8: MCP-TO-MCP RELAY ═══
        "relay_post" => {
            let channel = req.channel.unwrap_or_default();
            let from = req.from.unwrap_or("anonymous".into());
            let payload = req.payload.unwrap_or(serde_json::Value::Null);
            if channel.is_empty() {
                return err("channel is required");
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
            let depth = store.get(&channel).map(|q| q.len()).unwrap_or(0);
            ok(&format!(
                r#"{{"posted":true,"channel":"{}","from":"{}","queue_depth":{},"timestamp":{}}}"#,
                channel, from, depth, ts
            ))
        }

        "relay_poll" => {
            let channel = req.channel.unwrap_or_default();
            let count = req.count.unwrap_or(10);
            if channel.is_empty() {
                return err("channel is required");
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

        "relay_peek" => {
            let channel = req.channel.unwrap_or_default();
            let count = req.count.unwrap_or(10);
            if channel.is_empty() {
                return err("channel is required");
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

fn ok(msg: &str) -> GatewayResponse {
    GatewayResponse {
        success: true,
        action: String::new(),
        output: msg.to_string(),
        error: None,
        data: None,
    }
}

fn err(msg: &str) -> GatewayResponse {
    GatewayResponse {
        success: false,
        action: String::new(),
        output: String::new(),
        error: Some(msg.to_string()),
        data: None,
    }
}

fn run_cmd(cmd: &str, args: &[&str]) -> String {
    match Command::new(cmd).args(args).output() {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            if stdout.is_empty() {
                stderr
            } else {
                stdout
            }
        }
        Err(e) => format!("Command failed: {}", e),
    }
}
