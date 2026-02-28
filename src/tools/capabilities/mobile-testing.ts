/**
 * VegaMCP — Mobile Testing Tool (v7.0)
 * 
 * AI-First Android & iOS simulator/emulator control.
 * Features:
 * - Android emulator management via ADB + avdmanager
 * - iOS simulator management via xcrun simctl (macOS only)
 * - Screenshot with AI-ready base64 output
 * - UI hierarchy dump (accessibility tree for mobile)
 * - Logcat with AI-optimized structured output
 * - Touch/swipe/type simulation
 * - App install/launch/clear
 * - Performance profiling with structured metrics
 * - Network/battery/orientation simulation
 * - Screen recording
 * - Crash log extraction with structured parsing
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { logAudit } from '../../db/graph-store.js';

// ============================================================
// Schema
// ============================================================

export const mobileTestingSchema = {
  name: 'mobile_testing',
  description: `AI-first mobile app testing. Manage Android emulators and iOS simulators, install & launch apps, take screenshots, dump UI hierarchy (accessibility tree), capture structured logcat, simulate touch/swipe/type, profile performance, simulate network/battery/orientation changes, record screen, and extract crash logs. All outputs are structured JSON optimized for AI consumption. Actions: 
  Android: avd_list, avd_create, emulator_start, emulator_stop, device_list, app_install, app_launch, app_stop, app_clear, screenshot, ui_tree, logcat, touch, swipe, type_text, key_event, shell, performance, network_sim, battery_sim, orientation, screen_record, crash_logs, monkey_test.
  iOS (macOS only): sim_list, sim_create, sim_boot, sim_shutdown, sim_install, sim_launch, sim_screenshot, sim_ui_tree, sim_logs.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      platform: { type: 'string', enum: ['android', 'ios'], default: 'android', description: 'Target platform' },
      action: {
        type: 'string',
        enum: [
          // Android emulator management
          'avd_list', 'avd_create', 'emulator_start', 'emulator_stop', 'device_list',
          // App lifecycle
          'app_install', 'app_launch', 'app_stop', 'app_clear',
          // Visual testing
          'screenshot', 'ui_tree', 'screen_record',
          // Interaction
          'touch', 'swipe', 'type_text', 'key_event',
          // AI-enhanced diagnostics
          'logcat', 'crash_logs', 'performance',
          // Device simulation 
          'network_sim', 'battery_sim', 'orientation', 'shell',
          // Stress testing
          'monkey_test',
          // iOS
          'sim_list', 'sim_create', 'sim_boot', 'sim_shutdown',
          'sim_install', 'sim_launch', 'sim_screenshot', 'sim_ui_tree', 'sim_logs',
        ],
        description: 'Testing action to perform',
      },
      // Common
      device_id: { type: 'string', description: 'Device/emulator serial (default: first available)' },
      // AVD
      avd_name: { type: 'string', description: 'AVD name (avd_create, emulator_start)' },
      system_image: { type: 'string', description: 'System image (avd_create), e.g. "system-images;android-35;google_apis;x86_64"' },
      device_profile: { type: 'string', description: 'Device profile (avd_create), e.g. "pixel_7"', default: 'pixel_7' },
      // App
      apk_path: { type: 'string', description: 'Path to APK file (app_install)' },
      package_name: { type: 'string', description: 'Package name (app_launch, app_stop, app_clear)' },
      activity_name: { type: 'string', description: 'Activity to launch (app_launch)' },
      // Interaction
      x: { type: 'number', description: 'X coordinate (touch, swipe start)' },
      y: { type: 'number', description: 'Y coordinate (touch, swipe start)' },
      x2: { type: 'number', description: 'End X coordinate (swipe)' },
      y2: { type: 'number', description: 'End Y coordinate (swipe)' },
      duration_ms: { type: 'number', description: 'Duration in ms (swipe, screen_record)', default: 300 },
      text: { type: 'string', description: 'Text to type (type_text)' },
      key_code: { type: 'string', description: 'Key event code (key_event), e.g. "KEYCODE_HOME", "KEYCODE_BACK"' },
      // ADB shell
      command: { type: 'string', description: 'Raw ADB shell command (shell)' },
      // Logcat
      log_level: { type: 'string', enum: ['verbose', 'debug', 'info', 'warn', 'error', 'fatal'], default: 'info', description: 'Minimum log level (logcat)' },
      log_lines: { type: 'number', description: 'Number of recent log lines (logcat)', default: 50 },
      log_filter: { type: 'string', description: 'Tag filter for logcat, e.g. "WebView:*" or package name' },
      // Performance
      perf_metric: { type: 'string', enum: ['memory', 'cpu', 'battery', 'gfx', 'network', 'all'], default: 'all', description: 'Performance metric to collect' },
      // Network simulation
      network_type: { type: 'string', enum: ['wifi', 'lte', '3g', 'edge', 'none', 'full'], default: 'full', description: 'Network condition to simulate' },
      // Battery
      battery_level: { type: 'number', description: 'Battery level 0-100 (battery_sim)' },
      battery_charging: { type: 'boolean', description: 'Whether charging (battery_sim)', default: false },
      // Orientation
      rotation: { type: 'string', enum: ['0', '1', '2', '3'], description: '0=portrait, 1=landscape-left, 2=portrait-inverted, 3=landscape-right' },
      // Monkey test
      monkey_events: { type: 'number', description: 'Number of random events (monkey_test)', default: 500 },
      // Screenshot
      full_page: { type: 'boolean', description: 'Capture full scrollable content (screenshot)', default: false },
      // iOS
      sim_device_type: { type: 'string', description: 'iOS device type (sim_create), e.g. "iPhone 15 Pro"' },
      sim_runtime: { type: 'string', description: 'iOS runtime (sim_create), e.g. "iOS-17-0"' },
      bundle_id: { type: 'string', description: 'iOS bundle ID (sim_launch)' },
    },
    required: ['action'],
  },
};

// ============================================================
// Environment detection
// ============================================================

function getAndroidSdkPath(): string {
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT 
    || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
}

function getAdbPath(): string {
  return path.join(getAndroidSdkPath(), 'platform-tools', 'adb' + (os.platform() === 'win32' ? '.exe' : ''));
}

function getEmulatorPath(): string {
  return path.join(getAndroidSdkPath(), 'emulator', 'emulator' + (os.platform() === 'win32' ? '.exe' : ''));
}

function getAvdManagerPath(): string {
  return path.join(getAndroidSdkPath(), 'cmdline-tools', 'latest', 'bin', 'avdmanager' + (os.platform() === 'win32' ? '.bat' : ''));
}

function setJavaHome(): void {
  // Auto-detect JDK if JAVA_HOME not set
  if (!process.env.JAVA_HOME) {
    const jdkPaths = [
      'C:\\Program Files\\Microsoft\\jdk-21.0.10.7-hotspot',
      'C:\\Program Files\\Microsoft\\jdk-17.0.18.8-hotspot',
      '/usr/lib/jvm/java-21-openjdk',
      '/usr/lib/jvm/java-17-openjdk',
    ];
    for (const p of jdkPaths) {
      if (fs.existsSync(p)) {
        process.env.JAVA_HOME = p;
        break;
      }
    }
  }
}

function exec(cmd: string, timeoutMs = 15000): string {
  try {
    return execSync(cmd, { 
      timeout: timeoutMs, 
      encoding: 'utf-8',
      env: { ...process.env, ANDROID_HOME: getAndroidSdkPath() },
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e: any) {
    return e.stdout?.toString().trim() || e.stderr?.toString().trim() || e.message;
  }
}

function getDeviceId(args: any): string {
  if (args.device_id) return args.device_id;
  const adb = getAdbPath();
  const output = exec(`"${adb}" devices`);
  const lines = output.split('\n').filter(l => l.includes('\tdevice'));
  if (lines.length === 0) throw new Error('No connected Android devices/emulators. Start one with action: emulator_start');
  return lines[0].split('\t')[0].trim();
}

// ============================================================
// Active emulator processes
// ============================================================
const activeEmulators = new Map<string, ChildProcess>();

// ============================================================
// Structured output helpers  
// ============================================================

function ok(data: any) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

// ============================================================
// AI-Enhanced Logcat Parser
// ============================================================

interface StructuredLogEntry {
  timestamp: string;
  pid: number;
  tid: number;
  level: string;
  tag: string;
  message: string;
  is_crash: boolean;
  is_anr: boolean;
  is_error: boolean;
}

function parseLogcatLine(line: string): StructuredLogEntry | null {
  // Format: MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: MESSAGE
  const match = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?):\s+(.*)$/);
  if (!match) return null;
  
  const [, timestamp, pid, tid, level, tag, message] = match;
  const levelMap: Record<string, string> = { V: 'verbose', D: 'debug', I: 'info', W: 'warn', E: 'error', F: 'fatal' };
  
  return {
    timestamp,
    pid: parseInt(pid),
    tid: parseInt(tid),
    level: levelMap[level] || level,
    tag: tag.trim(),
    message: message.trim(),
    is_crash: tag.includes('FATAL') || message.includes('FATAL EXCEPTION') || tag.includes('AndroidRuntime'),
    is_anr: tag.includes('ANR') || message.includes('ANR in'),
    is_error: level === 'E' || level === 'F',
  };
}

// ============================================================
// AI-Enhanced Performance Parser
// ============================================================

function parseMemInfo(output: string): any {
  const metrics: any = {};
  const totalPss = output.match(/TOTAL\s+(\d+)/);
  if (totalPss) metrics.total_pss_kb = parseInt(totalPss[1]);
  
  const nativeHeap = output.match(/Native Heap\s+(\d+)/);
  if (nativeHeap) metrics.native_heap_kb = parseInt(nativeHeap[1]);
  
  const dalvikHeap = output.match(/Dalvik Heap\s+(\d+)/);
  if (dalvikHeap) metrics.dalvik_heap_kb = parseInt(dalvikHeap[1]);
  
  const views = output.match(/Views:\s+(\d+)/);
  if (views) metrics.view_count = parseInt(views[1]);
  
  const activities = output.match(/Activities:\s+(\d+)/);
  if (activities) metrics.activity_count = parseInt(activities[1]);
  
  return metrics;
}

function parseGfxInfo(output: string): any {
  const metrics: any = {};
  const totalFrames = output.match(/Total frames rendered:\s+(\d+)/);
  if (totalFrames) metrics.total_frames = parseInt(totalFrames[1]);
  
  const jankyFrames = output.match(/Janky frames:\s+(\d+)\s+\(([\d.]+)%\)/);
  if (jankyFrames) {
    metrics.janky_frames = parseInt(jankyFrames[1]);
    metrics.janky_percent = parseFloat(jankyFrames[2]);
  }
  
  const p50 = output.match(/50th percentile:\s+(\d+)ms/);
  if (p50) metrics.frame_time_p50_ms = parseInt(p50[1]);
  
  const p90 = output.match(/90th percentile:\s+(\d+)ms/);
  if (p90) metrics.frame_time_p90_ms = parseInt(p90[1]);
  
  const p95 = output.match(/95th percentile:\s+(\d+)ms/);
  if (p95) metrics.frame_time_p95_ms = parseInt(p95[1]);
  
  const p99 = output.match(/99th percentile:\s+(\d+)ms/);
  if (p99) metrics.frame_time_p99_ms = parseInt(p99[1]);
  
  return metrics;
}

// ============================================================
// UI Hierarchy Parser (Accessibility Tree)
// ============================================================

function parseUiHierarchy(xml: string): any[] {
  const nodes: any[] = [];
  const regex = /<node\s+([^>]+)\/?>/g;
  let match;
  
  while ((match = regex.exec(xml)) !== null) {
    const attrs: any = {};
    const attrRegex = /(\w[\w-]*)="([^"]*)"/g;
    let attrMatch;
    
    while ((attrMatch = attrRegex.exec(match[1])) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    
    nodes.push({
      class: attrs['class'] || '',
      resource_id: attrs['resource-id'] || '',
      text: attrs['text'] || '',
      content_desc: attrs['content-desc'] || '',
      bounds: attrs['bounds'] || '',
      clickable: attrs['clickable'] === 'true',
      focusable: attrs['focusable'] === 'true',
      scrollable: attrs['scrollable'] === 'true',
      enabled: attrs['enabled'] === 'true',
      visible: attrs['displayed'] !== 'false',
      package: attrs['package'] || '',
    });
  }
  
  return nodes;
}

// ============================================================
// Main Handler
// ============================================================

export async function handleMobileTesting(args: any): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  const start = Date.now();
  const platform = args.platform || 'android';
  
  try {
    setJavaHome();
    
    // ═══════════════════════════════════
    // ANDROID ACTIONS
    // ═══════════════════════════════════
    
    if (platform === 'android') {
      const adb = getAdbPath();
      
      switch (args.action) {
        // --- AVD Management ---
        case 'avd_list': {
          const avdmgr = getAvdManagerPath();
          const output = exec(`"${avdmgr}" list avd -c`, 10000);
          const avds = output.split('\n').filter(Boolean).map(name => {
            const detail = exec(`"${avdmgr}" list avd | findstr /C:"${name.trim()}"`, 10000);
            return { name: name.trim(), details: detail };
          });
          return ok({ avds, count: avds.length });
        }
        
        case 'avd_create': {
          if (!args.avd_name) return fail('MISSING_PARAM', 'avd_name is required');
          const avdmgr = getAvdManagerPath();
          const image = args.system_image || 'system-images;android-35;google_apis;x86_64';
          const device = args.device_profile || 'pixel_7';
          const output = exec(`echo no | "${avdmgr}" create avd -n "${args.avd_name}" -k "${image}" -d "${device}" --force`, 30000);
          return ok({ avd_name: args.avd_name, system_image: image, device_profile: device, output });
        }
        
        case 'emulator_start': {
          const name = args.avd_name || 'AntigravityTest';
          const emulatorBin = getEmulatorPath();
          
          if (!fs.existsSync(emulatorBin)) {
            return fail('EMULATOR_NOT_FOUND', `Emulator not found at ${emulatorBin}. Install with sdkmanager "emulator".`);
          }
          
          const child = spawn(emulatorBin, ['-avd', name, '-no-snapshot', '-gpu', 'auto'], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, ANDROID_HOME: getAndroidSdkPath() },
          });
          child.unref();
          activeEmulators.set(name, child);
          
          // Wait for boot
          let booted = false;
          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const bootCheck = exec(`"${adb}" shell getprop sys.boot_completed 2>&1`);
            if (bootCheck.trim() === '1') { booted = true; break; }
          }
          
          return ok({
            avd_name: name,
            booted,
            pid: child.pid,
            message: booted ? 'Emulator started and ready' : 'Emulator starting (may still be booting)',
          });
        }
        
        case 'emulator_stop': {
          const deviceId = getDeviceId(args);
          exec(`"${adb}" -s ${deviceId} emu kill`);
          return ok({ device_id: deviceId, message: 'Emulator shutdown signal sent' });
        }
        
        case 'device_list': {
          const output = exec(`"${adb}" devices -l`);
          const lines = output.split('\n').slice(1).filter(l => l.trim());
          const devices = lines.map(line => {
            const parts = line.split(/\s+/);
            const serial = parts[0];
            const state = parts[1];
            const props: any = {};
            parts.slice(2).forEach(p => {
              const [k, v] = p.split(':');
              if (k && v) props[k] = v;
            });
            return { serial, state, ...props };
          });
          return ok({ devices, count: devices.length });
        }
        
        // --- App Lifecycle ---
        case 'app_install': {
          if (!args.apk_path) return fail('MISSING_PARAM', 'apk_path is required');
          const resolvedPath = path.resolve(args.apk_path);
          if (!fs.existsSync(resolvedPath)) return fail('FILE_NOT_FOUND', `APK not found: ${resolvedPath}`);
          const deviceId = getDeviceId(args);
          const output = exec(`"${adb}" -s ${deviceId} install -r "${resolvedPath}"`, 60000);
          const success = output.includes('Success');
          return ok({ installed: success, apk: resolvedPath, device_id: deviceId, output });
        }
        
        case 'app_launch': {
          if (!args.package_name) return fail('MISSING_PARAM', 'package_name is required');
          const deviceId = getDeviceId(args);
          const activity = args.activity_name || '.MainActivity';
          const component = activity.startsWith('.') ? `${args.package_name}/${args.package_name}${activity}` : `${args.package_name}/${activity}`;
          const output = exec(`"${adb}" -s ${deviceId} shell am start -n ${component}`);
          return ok({ package: args.package_name, activity, device_id: deviceId, output });
        }
        
        case 'app_stop': {
          if (!args.package_name) return fail('MISSING_PARAM', 'package_name is required');
          const deviceId = getDeviceId(args);
          exec(`"${adb}" -s ${deviceId} shell am force-stop ${args.package_name}`);
          return ok({ stopped: args.package_name, device_id: deviceId });
        }
        
        case 'app_clear': {
          if (!args.package_name) return fail('MISSING_PARAM', 'package_name is required');
          const deviceId = getDeviceId(args);
          const output = exec(`"${adb}" -s ${deviceId} shell pm clear ${args.package_name}`);
          return ok({ cleared: args.package_name, device_id: deviceId, output });
        }
        
        // --- Visual Testing ---
        case 'screenshot': {
          const deviceId = getDeviceId(args);
          const tmpFile = `/sdcard/vegamcp_screenshot_${Date.now()}.png`;
          exec(`"${adb}" -s ${deviceId} shell screencap -p ${tmpFile}`);
          
          const localTmp = path.join(os.tmpdir(), `android_screenshot_${Date.now()}.png`);
          exec(`"${adb}" -s ${deviceId} pull ${tmpFile} "${localTmp}"`, 10000);
          exec(`"${adb}" -s ${deviceId} shell rm ${tmpFile}`);
          
          if (fs.existsSync(localTmp)) {
            const buffer = fs.readFileSync(localTmp);
            const base64 = buffer.toString('base64');
            fs.unlinkSync(localTmp);
            
            // Get screen info for AI context
            const density = exec(`"${adb}" -s ${deviceId} shell wm density`);
            const size = exec(`"${adb}" -s ${deviceId} shell wm size`);
            
            return {
              content: [
                { type: 'image', data: base64, mimeType: 'image/png' },
                { type: 'text', text: JSON.stringify({
                  success: true,
                  screenshot: { size_bytes: buffer.length, screen_size: size.trim(), density: density.trim() },
                  ai_hint: 'Screenshot captured. Analyze for UI layout, visual bugs, text readability, and touch target sizes.',
                }) },
              ],
            };
          }
          return fail('SCREENSHOT_FAILED', 'Failed to capture screenshot');
        }
        
        case 'ui_tree': {
          const deviceId = getDeviceId(args);
          const remotePath = '/sdcard/vegamcp_ui.xml';
          exec(`"${adb}" -s ${deviceId} shell uiautomator dump ${remotePath}`);
          
          const localTmp = path.join(os.tmpdir(), `ui_tree_${Date.now()}.xml`);
          exec(`"${adb}" -s ${deviceId} pull ${remotePath} "${localTmp}"`, 10000);
          exec(`"${adb}" -s ${deviceId} shell rm ${remotePath}`);
          
          if (fs.existsSync(localTmp)) {
            const xml = fs.readFileSync(localTmp, 'utf-8');
            fs.unlinkSync(localTmp);
            const nodes = parseUiHierarchy(xml);
            
            // AI-enhanced summary
            const clickableNodes = nodes.filter(n => n.clickable);
            const textNodes = nodes.filter(n => n.text);
            const scrollableNodes = nodes.filter(n => n.scrollable);
            
            return ok({
              ui_tree: {
                total_nodes: nodes.length,
                clickable_count: clickableNodes.length,
                text_nodes: textNodes.length,
                scrollable_areas: scrollableNodes.length,
              },
              nodes,
              ai_summary: {
                interactive_elements: clickableNodes.map(n => ({
                  text: n.text || n.content_desc || n.resource_id,
                  bounds: n.bounds,
                  type: n.class.split('.').pop(),
                })),
                visible_text: textNodes.map(n => n.text).filter(Boolean),
                hint: 'Use bounds [left,top][right,bottom] for touch coordinates. Resource IDs identify elements uniquely.',
              },
            });
          }
          return fail('UI_DUMP_FAILED', 'Failed to dump UI hierarchy');
        }
        
        case 'screen_record': {
          const deviceId = getDeviceId(args);
          const duration = Math.min((args.duration_ms || 5000) / 1000, 30);
          const remotePath = `/sdcard/vegamcp_recording_${Date.now()}.mp4`;
          
          // Start recording in background
          exec(`"${adb}" -s ${deviceId} shell screenrecord --time-limit ${duration} ${remotePath}`, duration * 1000 + 5000);
          
          const localTmp = path.join(os.tmpdir(), `recording_${Date.now()}.mp4`);
          exec(`"${adb}" -s ${deviceId} pull ${remotePath} "${localTmp}"`, 15000);
          exec(`"${adb}" -s ${deviceId} shell rm ${remotePath}`);
          
          const exists = fs.existsSync(localTmp);
          const size = exists ? fs.statSync(localTmp).size : 0;
          
          return ok({
            recorded: exists,
            duration_seconds: duration,
            file_path: localTmp,
            size_bytes: size,
            ai_hint: 'Screen recording saved locally. Use for visual regression testing or bug reproduction.',
          });
        }
        
        // --- Interaction ---
        case 'touch': {
          if (args.x === undefined || args.y === undefined) return fail('MISSING_PARAM', 'x and y coordinates required');
          const deviceId = getDeviceId(args);
          exec(`"${adb}" -s ${deviceId} shell input tap ${args.x} ${args.y}`);
          return ok({ action: 'tap', x: args.x, y: args.y, device_id: deviceId });
        }
        
        case 'swipe': {
          if ([args.x, args.y, args.x2, args.y2].some(v => v === undefined)) {
            return fail('MISSING_PARAM', 'x, y, x2, y2 coordinates required for swipe');
          }
          const deviceId = getDeviceId(args);
          const duration = args.duration_ms || 300;
          exec(`"${adb}" -s ${deviceId} shell input swipe ${args.x} ${args.y} ${args.x2} ${args.y2} ${duration}`);
          return ok({ action: 'swipe', from: { x: args.x, y: args.y }, to: { x: args.x2, y: args.y2 }, duration_ms: duration });
        }
        
        case 'type_text': {
          if (!args.text) return fail('MISSING_PARAM', 'text is required');
          const deviceId = getDeviceId(args);
          // Escape special characters for ADB
          const escaped = args.text.replace(/\s/g, '%s').replace(/[&|<>;"'`]/g, '\\$&');
          exec(`"${adb}" -s ${deviceId} shell input text "${escaped}"`);
          return ok({ typed: args.text, device_id: deviceId });
        }
        
        case 'key_event': {
          if (!args.key_code) return fail('MISSING_PARAM', 'key_code is required');
          const deviceId = getDeviceId(args);
          exec(`"${adb}" -s ${deviceId} shell input keyevent ${args.key_code}`);
          return ok({ key: args.key_code, device_id: deviceId });
        }
        
        case 'shell': {
          if (!args.command) return fail('MISSING_PARAM', 'command is required');
          const deviceId = getDeviceId(args);
          const output = exec(`"${adb}" -s ${deviceId} shell ${args.command}`, 15000);
          return ok({ command: args.command, output, device_id: deviceId });
        }
        
        // --- AI-Enhanced Diagnostics ---
        case 'logcat': {
          const deviceId = getDeviceId(args);
          const lines = args.log_lines || 50;
          const levelMap: Record<string, string> = { verbose: 'V', debug: 'D', info: 'I', warn: 'W', error: 'E', fatal: 'F' };
          const level = levelMap[args.log_level || 'info'] || 'I';
          
          let cmd = `"${adb}" -s ${deviceId} shell logcat -d -v threadtime *:${level}`;
          if (args.log_filter) cmd += ` ${args.log_filter}`;
          cmd += ` | tail -n ${lines}`;
          
          // On Windows, use a different approach
          const rawOutput = exec(`"${adb}" -s ${deviceId} shell "logcat -d -v threadtime *:${level}"`, 10000);
          const rawLines = rawOutput.split('\n');
          const recentLines = rawLines.slice(-lines);
          
          // Parse into structured format
          const structured = recentLines
            .map(parseLogcatLine)
            .filter((e): e is StructuredLogEntry => e !== null);
          
          // AI-enhanced analysis
          const errors = structured.filter(e => e.is_error);
          const crashes = structured.filter(e => e.is_crash);
          const anrs = structured.filter(e => e.is_anr);
          const tags = [...new Set(structured.map(e => e.tag))];
          
          return ok({
            logcat: {
              total_entries: structured.length,
              error_count: errors.length,
              crash_count: crashes.length,
              anr_count: anrs.length,
              unique_tags: tags.length,
              level_filter: args.log_level || 'info',
            },
            entries: structured,
            ai_analysis: {
              has_crashes: crashes.length > 0,
              has_anrs: anrs.length > 0,
              error_summary: errors.slice(0, 5).map(e => `[${e.tag}] ${e.message}`),
              crash_traces: crashes.map(e => e.message),
              top_tags: tags.slice(0, 10),
              hint: 'Focus on entries with is_crash=true or is_error=true for bug diagnosis.',
            },
          });
        }
        
        case 'crash_logs': {
          const deviceId = getDeviceId(args);
          const output = exec(`"${adb}" -s ${deviceId} shell "logcat -d -v threadtime *:E | grep -E 'FATAL|ANR|Exception|Error|Crash'"`, 10000);
          const lines = output.split('\n').filter(Boolean);
          
          // Parse crash groups
          const crashes: any[] = [];
          let current: any = null;
          
          for (const line of lines) {
            if (line.includes('FATAL EXCEPTION') || line.includes('ANR in')) {
              if (current) crashes.push(current);
              current = { type: line.includes('ANR') ? 'ANR' : 'CRASH', first_line: line, stack: [line], timestamp: line.substring(0, 18) };
            } else if (current) {
              current.stack.push(line);
            }
          }
          if (current) crashes.push(current);
          
          return ok({
            total_crashes: crashes.length,
            crashes: crashes.slice(0, 10),
            ai_analysis: {
              severity: crashes.length > 0 ? 'critical' : 'clean',
              crash_types: crashes.map(c => c.type),
              hint: crashes.length > 0 
                ? 'Crashes detected! Review stack traces for root cause. Check for null pointer exceptions, out of memory errors, and ANR triggers.'
                : 'No crashes detected. App appears stable.',
            },
          });
        }
        
        case 'performance': {
          const deviceId = getDeviceId(args);
          const metric = args.perf_metric || 'all';
          const pkg = args.package_name;
          const result: any = {};
          
          if (metric === 'memory' || metric === 'all') {
            const memCmd = pkg ? `dumpsys meminfo ${pkg}` : 'dumpsys meminfo --package';
            result.memory = parseMemInfo(exec(`"${adb}" -s ${deviceId} shell ${memCmd}`, 10000));
          }
          
          if (metric === 'cpu' || metric === 'all') {
            const cpuOutput = exec(`"${adb}" -s ${deviceId} shell "top -n 1 -d 1"`, 8000);
            const cpuLines = cpuOutput.split('\n');
            const cpuHeader = cpuLines.find(l => l.includes('%cpu') || l.includes('CPU'));
            result.cpu = { summary: cpuHeader?.trim() || 'N/A' };
          }
          
          if ((metric === 'gfx' || metric === 'all') && pkg) {
            result.gfx = parseGfxInfo(exec(`"${adb}" -s ${deviceId} shell dumpsys gfxinfo ${pkg}`, 10000));
          }
          
          if (metric === 'battery' || metric === 'all') {
            const batteryOutput = exec(`"${adb}" -s ${deviceId} shell dumpsys battery`);
            const level = batteryOutput.match(/level:\s*(\d+)/);
            const status = batteryOutput.match(/status:\s*(\d+)/);
            const temp = batteryOutput.match(/temperature:\s*(\d+)/);
            result.battery = {
              level: level ? parseInt(level[1]) : null,
              status: status ? parseInt(status[1]) : null,
              temperature_c: temp ? parseInt(temp[1]) / 10 : null,
            };
          }
          
          if (metric === 'network' || metric === 'all') {
            const netOutput = exec(`"${adb}" -s ${deviceId} shell dumpsys netstats --detail`, 10000);
            result.network = { raw_length: netOutput.length };
          }
          
          result.ai_analysis = {
            hint: 'Check memory.total_pss_kb for memory leaks over time. gfx.janky_percent > 10% indicates jank. battery.temperature > 45°C is overheating.',
            thresholds: {
              memory_warning_kb: 200000,
              jank_warning_percent: 10,
              battery_temp_warning_c: 45,
            },
          };
          
          return ok({ performance: result, device_id: deviceId });
        }
        
        // --- Device Simulation ---
        case 'network_sim': {
          const deviceId = getDeviceId(args);
          const type = args.network_type || 'full';
          const cmds: Record<string, string[]> = {
            wifi: ['svc wifi enable', 'svc data disable'],
            lte: ['svc wifi disable', 'svc data enable'],
            '3g': ['svc wifi disable', 'svc data enable'],
            edge: ['svc wifi disable', 'svc data enable'],
            none: ['svc wifi disable', 'svc data disable'],
            full: ['svc wifi enable', 'svc data enable'],
          };
          for (const cmd of (cmds[type] || cmds.full)) {
            exec(`"${adb}" -s ${deviceId} shell ${cmd}`);
          }
          return ok({ network: type, device_id: deviceId, ai_hint: 'Test offline behavior, loading states, and error handling.' });
        }
        
        case 'battery_sim': {
          const deviceId = getDeviceId(args);
          const level = args.battery_level ?? 50;
          const charging = args.battery_charging ?? false;
          exec(`"${adb}" -s ${deviceId} shell dumpsys battery set level ${level}`);
          exec(`"${adb}" -s ${deviceId} shell dumpsys battery ${charging ? 'set status 2' : 'unplug'}`);
          return ok({ battery_level: level, charging, device_id: deviceId });
        }
        
        case 'orientation': {
          const deviceId = getDeviceId(args);
          const rotation = args.rotation ?? 0;
          exec(`"${adb}" -s ${deviceId} shell settings put system accelerometer_rotation 0`);
          exec(`"${adb}" -s ${deviceId} shell settings put system user_rotation ${rotation}`);
          const orientationMap = ['portrait', 'landscape-left', 'portrait-inverted', 'landscape-right'];
          return ok({ rotation, orientation: orientationMap[rotation] || 'portrait', device_id: deviceId });
        }
        
        // --- Stress Testing ---
        case 'monkey_test': {
          if (!args.package_name) return fail('MISSING_PARAM', 'package_name required for monkey test');
          const deviceId = getDeviceId(args);
          const events = args.monkey_events || 500;
          const output = exec(`"${adb}" -s ${deviceId} shell monkey -p ${args.package_name} -v ${events} --throttle 100`, 120000);
          
          const crashCount = (output.match(/CRASH/g) || []).length;
          const anrCount = (output.match(/ANR/g) || []).length;
          const injected = output.match(/Events injected:\s*(\d+)/);
          
          return ok({
            monkey_test: {
              events_requested: events,
              events_injected: injected ? parseInt(injected[1]) : events,
              crashes: crashCount,
              anrs: anrCount,
              stable: crashCount === 0 && anrCount === 0,
            },
            ai_analysis: {
              verdict: crashCount === 0 && anrCount === 0 ? '✅ App survived monkey testing' : '❌ App crashed during stress test',
              hint: crashCount > 0 ? 'Check crash_logs action for detailed stack traces' : 'App handles random input well.',
            },
          });
        }
      }
    }
    
    // ═══════════════════════════════════
    // iOS ACTIONS (macOS only)
    // ═══════════════════════════════════
    
    if (platform === 'ios') {
      if (os.platform() !== 'darwin') {
        return fail('PLATFORM_ERROR', 'iOS simulator control requires macOS with Xcode installed.');
      }
      
      switch (args.action) {
        case 'sim_list': {
          const output = exec('xcrun simctl list devices --json');
          try {
            const data = JSON.parse(output);
            const devices: any[] = [];
            for (const [runtime, sims] of Object.entries(data.devices || {})) {
              for (const sim of (sims as any[])) {
                devices.push({ ...sim, runtime });
              }
            }
            return ok({ simulators: devices, count: devices.length });
          } catch {
            return ok({ raw: output });
          }
        }
        
        case 'sim_create': {
          if (!args.avd_name) return fail('MISSING_PARAM', 'avd_name (simulator name) required');
          const deviceType = args.sim_device_type || 'iPhone 15 Pro';
          const runtime = args.sim_runtime || 'iOS-17-0';
          const output = exec(`xcrun simctl create "${args.avd_name}" "${deviceType}" "com.apple.CoreSimulator.SimRuntime.${runtime}"`);
          return ok({ name: args.avd_name, device_type: deviceType, runtime, udid: output.trim() });
        }
        
        case 'sim_boot': {
          const deviceId = args.device_id || 'booted';
          exec(`xcrun simctl boot "${deviceId}"`);
          return ok({ booted: deviceId });
        }
        
        case 'sim_shutdown': {
          const deviceId = args.device_id || 'booted';
          exec(`xcrun simctl shutdown "${deviceId}"`);
          return ok({ shutdown: deviceId });
        }
        
        case 'sim_install': {
          if (!args.apk_path) return fail('MISSING_PARAM', 'apk_path (app path) required');
          const deviceId = args.device_id || 'booted';
          exec(`xcrun simctl install "${deviceId}" "${args.apk_path}"`, 30000);
          return ok({ installed: args.apk_path, device_id: deviceId });
        }
        
        case 'sim_launch': {
          if (!args.bundle_id) return fail('MISSING_PARAM', 'bundle_id required');
          const deviceId = args.device_id || 'booted';
          exec(`xcrun simctl launch "${deviceId}" "${args.bundle_id}"`);
          return ok({ launched: args.bundle_id, device_id: deviceId });
        }
        
        case 'sim_screenshot': {
          const deviceId = args.device_id || 'booted';
          const tmpFile = path.join(os.tmpdir(), `ios_screenshot_${Date.now()}.png`);
          exec(`xcrun simctl io "${deviceId}" screenshot "${tmpFile}"`, 10000);
          
          if (fs.existsSync(tmpFile)) {
            const buffer = fs.readFileSync(tmpFile);
            const base64 = buffer.toString('base64');
            fs.unlinkSync(tmpFile);
            return {
              content: [
                { type: 'image', data: base64, mimeType: 'image/png' },
                { type: 'text', text: JSON.stringify({ success: true, size_bytes: buffer.length }) },
              ],
            };
          }
          return fail('SCREENSHOT_FAILED', 'Failed to capture iOS screenshot');
        }
        
        case 'sim_logs': {
          const deviceId = args.device_id || 'booted';
          const lines = args.log_lines || 50;
          const output = exec(`xcrun simctl spawn "${deviceId}" log show --style compact --last 1m`, 10000);
          const logLines = output.split('\n').slice(-lines);
          return ok({ entries: logLines, count: logLines.length });
        }
      }
    }
    
    return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}`);
    
  } catch (err: any) {
    logAudit('mobile_testing', err.message, false, 'MOBILE_ERROR', Date.now() - start);
    return fail('MOBILE_ERROR', err.message);
  }
}
