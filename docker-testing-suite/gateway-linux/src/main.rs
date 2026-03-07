//! VegaSentinel Gateway v2.1 — Linux/Docker Edition ("The Claw")
//!
//! Identical 8-layer architecture to the Windows VPS gateway,
//! but uses Linux-native tools for CUA:
//!   - `scrot` for screenshots
//!   - `xdotool` for mouse & keyboard injection
//!   - `xvfb` provides the virtual display
//!   - Layer 8: MCP-to-MCP relay broker
//!
//! Listens on 0.0.0.0:42015 inside the container.
//! VegaMCP connects via `docker exec` or direct TCP.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

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
}

#[derive(Serialize, Debug)]
struct GatewayResponse {
    success: bool,
    action: String,
    output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn main() {
    let port = 42015;
    let listener = match TcpListener::bind(format!("0.0.0.0:{}", port)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind: {}", e);
            return;
        }
    };

    eprintln!("VegaSentinel Gateway (Linux) bound to 0.0.0.0:{}", port);

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
            },
        };
        let json = serde_json::to_string(&response).unwrap_or_default();
        let _ = stream.write_all(json.as_bytes());
    }
}

fn process_request(req: GatewayRequest) -> GatewayResponse {
    match req.action.as_str() {
        // ═══ LAYER 0: HEALTH ═══
        "ping" => ok("PONG — VegaSentinel v2.0 (Linux/Docker) alive."),

        "metrics" => {
            let cpu = run_cmd("top", &["-bn1"])
                .lines()
                .find(|l| l.contains("Cpu"))
                .unwrap_or("")
                .to_string();
            let mem = run_cmd("free", &["-m"]);
            let disk = run_cmd("df", &["-h", "/"]);
            let procs = run_cmd("sh", &["-c", "ps aux | wc -l"]);
            ok(&format!(
                "CPU: {}\n{}\nDisk:\n{}\nProcesses: {}",
                cpu,
                mem,
                disk,
                procs.trim()
            ))
        }

        // ═══ LAYER 1: COMMAND EXECUTION ═══
        "exec" => {
            let cmd = req.command.unwrap_or_default();
            let output = run_cmd("sh", &["-c", &cmd]);
            ok(&output)
        }

        // ═══ LAYER 2: PROCESS MANAGEMENT ═══
        "process_list" => {
            let output = run_cmd("ps", &["aux", "--sort=-%mem"]);
            // Take top 30 lines
            let lines: Vec<&str> = output.lines().take(31).collect();
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

        // ═══ LAYER 3: MEMORY MANAGEMENT ═══
        "trim_memory" => {
            // Linux equivalent: drop caches (requires root, which we have in container)
            let _ = fs::write("/proc/sys/vm/drop_caches", "3");
            let mem = run_cmd("free", &["-m"]);
            ok(&format!("Caches dropped.\n{}", mem))
        }

        // ═══ LAYER 4: CUA VISION ENGINE ═══

        // Screenshot via scrot → base64
        "screenshot" => {
            let tmp = "/tmp/vega_screenshot.png";
            let _ = run_cmd("scrot", &["-o", tmp]);
            match fs::read(tmp) {
                Ok(bytes) => {
                    let b64 =
                        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
                    // Get dimensions
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
            let x = req.x.unwrap_or(0);
            let y = req.y.unwrap_or(0);
            run_cmd("xdotool", &["mousemove", &x.to_string(), &y.to_string()]);
            ok(&format!("Mouse moved to ({}, {})", x, y))
        }

        // Mouse click via xdotool
        "mouse_click" => {
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
            let x = req.x.unwrap_or(0);
            let y = req.y.unwrap_or(0);
            run_cmd("xdotool", &["mousemove", &x.to_string(), &y.to_string()]);
            run_cmd("xdotool", &["click", "--repeat", "2", "--delay", "50", "1"]);
            ok(&format!("Double-clicked at ({}, {})", x, y))
        }

        // Type text via xdotool
        "type_text" => {
            let text = req.text.unwrap_or_default();
            run_cmd(
                "xdotool",
                &["type", "--clearmodifiers", "--delay", "20", &text],
            );
            ok(&format!("Typed: {}", text))
        }

        // Send key via xdotool
        "send_key" => {
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

        // ═══ LAYER 5: FILE SYSTEM ═══
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
            let path = req.path.unwrap_or("/vegamcp/tests".into());
            let output = run_cmd("ls", &["-la", &path]);
            ok(&output)
        }

        // ═══ LAYER 6: SERVICE MANAGEMENT ═══
        "service_status" => {
            let output = run_cmd("service", &["--status-all"]);
            ok(&output)
        }

        // ═══ LAYER 7: NETWORK ═══
        "netstat" => {
            let output = run_cmd("ss", &["-tlnp"]);
            ok(&output)
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
        },
    }
}

fn ok(msg: &str) -> GatewayResponse {
    GatewayResponse {
        success: true,
        action: String::new(),
        output: msg.to_string(),
        error: None,
    }
}

fn err(msg: &str) -> GatewayResponse {
    GatewayResponse {
        success: false,
        action: String::new(),
        output: String::new(),
        error: Some(msg.to_string()),
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

use base64::Engine as _;
