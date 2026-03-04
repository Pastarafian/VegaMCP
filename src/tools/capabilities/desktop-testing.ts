/**
 * VegaMCP — Desktop Testing Tool (v2.0 — Real Emulation Edition)
 * 
 * AI-First desktop application testing for Windows, macOS, and Linux.
 * Features:
 * - Application lifecycle (launch, kill, restart)
 * - Window management (list, focus, move, resize, minimize, maximize)
 * - Real screenshots via native APIs
 * - Real UI tree extraction (Windows UIAutomation, macOS AXAPI)
 * - Real simulated input (mouse, keyboard) via PowerShell / xdotool
 * - Process memory and CPU monitoring
 * - Clipboard access
 * - Window pixel color sampling
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const desktopTestingSchema = {
  name: 'desktop_testing',
  description: `AI-first desktop application testing tool with REAL emulation. Native manipulation of Windows, macOS, and Linux desktop environments for QA. Supported actions: app_launch, app_kill, app_restart, window_list, window_focus, window_move, window_resize, window_minimize, window_maximize, screenshot, ui_tree, mouse_click, mouse_move, keyboard_type, key_press, system_info, extract_logs, process_monitor, clipboard_read, clipboard_write, pixel_color. All outputs are JSON optimized for AI consumption.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'app_launch', 'app_kill', 'app_restart',
          'window_list', 'window_focus', 'window_move', 'window_resize',
          'window_minimize', 'window_maximize',
          'screenshot', 'ui_tree',
          'mouse_click', 'mouse_move', 'keyboard_type', 'key_press',
          'system_info', 'extract_logs', 'process_monitor',
          'clipboard_read', 'clipboard_write', 'pixel_color',
        ],
        description: 'Testing action to perform',
      },
      app_path: { type: 'string', description: 'Path or name of the application executable (app_launch, app_kill, app_restart)' },
      app_args: { type: 'string', description: 'Arguments to pass to the application (app_launch)' },
      window_id: { type: 'string', description: 'Window ID or title substring (window_focus, window_move, window_resize)' },
      x: { type: 'number', description: 'X coordinate (mouse_click, mouse_move, window_move, pixel_color)' },
      y: { type: 'number', description: 'Y coordinate (mouse_click, mouse_move, window_move, pixel_color)' },
      width: { type: 'number', description: 'Width (window_resize)' },
      height: { type: 'number', description: 'Height (window_resize)' },
      button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left', description: 'Mouse button to click' },
      click_count: { type: 'number', description: 'Number of clicks (1=single, 2=double)', default: 1 },
      text: { type: 'string', description: 'Text to type (keyboard_type) or clipboard text (clipboard_write)' },
      key: { type: 'string', description: 'Special key or combo to press (key_press), e.g. "Enter", "Ctrl+C", "Alt+F4"' },
      process_name: { type: 'string', description: 'Process name to monitor (process_monitor)' },
      log_source: { type: 'string', enum: ['application', 'system', 'security'], default: 'application', description: 'Windows Event Log source (extract_logs)' },
      log_count: { type: 'number', description: 'Number of log entries to retrieve', default: 20 },
    },
    required: ['action'],
  },
};

function exec(cmd: string, timeoutMs = 15000): string {
  try {
    return execSync(cmd, { 
      timeout: timeoutMs, 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch (e: any) {
    return e.stdout?.toString().trim() || e.stderr?.toString().trim() || e.message;
  }
}

function psExec(script: string, timeoutMs = 15000): string {
  // Execute PowerShell script — used extensively on Windows for real automation
  const escaped = script.replace(/"/g, '\\"');
  return exec(`powershell -NoProfile -NonInteractive -Command "${escaped}"`, timeoutMs);
}

function ok(data: any) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

import { gate, blockedResponse } from './safety-gate.js';

export async function handleDesktopTesting(args: any): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  const platform = os.platform();

  // Safety gate: block dangerous operations from running on host
  const check = gate('desktop', args.action);
  if (check.sandboxed) {
    return blockedResponse('desktop_testing', args.action);
  }

  switch (args.action) {
    // ═══════════════════════════════════
    // SYSTEM INFO
    // ═══════════════════════════════════
    case 'system_info': {
      const info: any = {
        platform,
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        cpu_model: os.cpus()[0]?.model || 'N/A',
        total_mem_gb: +(os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
        free_mem_gb: +(os.freemem() / 1024 / 1024 / 1024).toFixed(2),
        uptime_hours: +(os.uptime() / 3600).toFixed(2),
      };

      if (platform === 'win32') {
        // Get display resolution
        try {
          const res = psExec(
            'Add-Type -AssemblyName System.Windows.Forms; ' +
            '[System.Windows.Forms.Screen]::PrimaryScreen.Bounds | ' +
            'Select-Object Width, Height | ConvertTo-Json'
          );
          info.display = JSON.parse(res);
        } catch {}

        // Get DPI scaling
        try {
          const dpi = psExec(
            'Add-Type -AssemblyName System.Drawing; ' +
            '$g = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero); ' +
            '[math]::Round($g.DpiX); $g.Dispose()'
          );
          info.dpi = parseInt(dpi) || 96;
          info.scale_percent = Math.round((parseInt(dpi) || 96) / 96 * 100);
        } catch {}
      }

      return ok({ ...info, ai_hint: 'Use this to verify the target desktop environment. Display resolution and DPI scale affect coordinate-based interactions.' });
    }

    // ═══════════════════════════════════
    // APP LIFECYCLE
    // ═══════════════════════════════════
    case 'app_launch': {
      if (!args.app_path) return fail('MISSING_PARAM', 'app_path is required');
      let output = '';
      let pid: number | undefined;

      if (platform === 'win32') {
        const cmd = `Start-Process "${args.app_path}" ${args.app_args ? `-ArgumentList "${args.app_args}"` : ''} -PassThru | Select-Object -ExpandProperty Id`;
        output = psExec(cmd);
        pid = parseInt(output) || undefined;
      } else if (platform === 'darwin') {
        output = exec(`open -a "${args.app_path}" ${args.app_args ? `--args ${args.app_args}` : ''}`);
      } else {
        output = exec(`nohup "${args.app_path}" ${args.app_args || ''} >/dev/null 2>&1 & echo $!`);
        pid = parseInt(output) || undefined;
      }
      return ok({ launched: args.app_path, pid, output, ai_hint: 'Application launched. Use window_list to verify it appeared, then screenshot to see its state.' });
    }

    case 'app_kill': {
      if (!args.app_path) return fail('MISSING_PARAM', 'app_path is required (can be process name)');
      const name = args.app_path.replace(/\.exe$/i, '');
      let output = '';
      if (platform === 'win32') {
        output = psExec(`Stop-Process -Name '${name}' -Force -ErrorAction SilentlyContinue; 'killed'`);
      } else {
        output = exec(`killall "${args.app_path}" 2>&1 || echo 'not running'`);
      }
      return ok({ killed: args.app_path, output });
    }

    case 'app_restart': {
      if (!args.app_path) return fail('MISSING_PARAM', 'app_path is required');
      const name = args.app_path.replace(/\.exe$/i, '');
      // Kill first, then relaunch
      if (platform === 'win32') {
        psExec(`Stop-Process -Name '${name}' -Force -ErrorAction SilentlyContinue`);
      } else {
        exec(`killall "${args.app_path}" 2>/dev/null`);
      }
      await new Promise(r => setTimeout(r, 1000));
      // Relaunch
      if (platform === 'win32') {
        psExec(`Start-Process "${args.app_path}" ${args.app_args ? `-ArgumentList "${args.app_args}"` : ''}`);
      } else if (platform === 'darwin') {
        exec(`open -a "${args.app_path}" ${args.app_args ? `--args ${args.app_args}` : ''}`);
      } else {
        exec(`nohup "${args.app_path}" ${args.app_args || ''} >/dev/null 2>&1 &`);
      }
      return ok({ restarted: args.app_path, ai_hint: 'Process killed and relaunched. Allow 1-2 seconds for the window to appear.' });
    }

    // ═══════════════════════════════════
    // WINDOW MANAGEMENT (Real)
    // ═══════════════════════════════════
    case 'window_list': {
      if (platform === 'win32') {
        const output = psExec(
          `Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | ` +
          `Select-Object Id, ProcessName, MainWindowTitle, ` +
          `@{N='MemoryMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, ` +
          `@{N='CPU';E={[math]::Round($_.CPU,2)}} | ` +
          `ConvertTo-Json -Depth 2`
        );
        try {
          const list = JSON.parse(output);
          const windows = (Array.isArray(list) ? list : [list]).map((w: any) => ({
            pid: w.Id,
            process: w.ProcessName,
            title: w.MainWindowTitle,
            memory_mb: w.MemoryMB,
            cpu_seconds: w.CPU,
          }));
          return ok({ window_count: windows.length, windows });
        } catch {
          return ok({ window_count: 0, windows: [], raw: output });
        }
      } else if (platform === 'darwin') {
        const output = exec(`osascript -e 'tell application "System Events" to get {name, title} of every window of (every process whose background only is false)'`);
        return ok({ raw_output: output });
      } else {
        const output = exec(`wmctrl -l -p`);
        const windows = output.split('\n').filter(Boolean).map(line => {
          const parts = line.split(/\s+/);
          return { id: parts[0], desktop: parts[1], pid: parts[2], title: parts.slice(4).join(' ') };
        });
        return ok({ window_count: windows.length, windows });
      }
    }

    case 'window_focus': {
      if (!args.window_id) return fail('MISSING_PARAM', 'window_id (title substring) required');
      if (platform === 'win32') {
        const script = `
          Add-Type -TypeDefinition @'
          using System;
          using System.Runtime.InteropServices;
          public class WinAPI {
            [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          }
'@
          $proc = Get-Process | Where-Object {$_.MainWindowTitle -like '*${args.window_id}*'} | Select-Object -First 1
          if ($proc) {
            [WinAPI]::ShowWindow($proc.MainWindowHandle, 9)
            [WinAPI]::SetForegroundWindow($proc.MainWindowHandle)
            $proc.MainWindowTitle
          } else { 'Window not found' }
        `;
        const result = psExec(script);
        return ok({ focused: args.window_id, result });
      } else if (platform === 'darwin') {
        const result = exec(`osascript -e 'tell application "${args.window_id}" to activate'`);
        return ok({ focused: args.window_id, result });
      } else {
        const result = exec(`wmctrl -a "${args.window_id}"`);
        return ok({ focused: args.window_id, result });
      }
    }

    case 'window_move': {
      if (!args.window_id) return fail('MISSING_PARAM', 'window_id required');
      if (args.x === undefined || args.y === undefined) return fail('MISSING_PARAM', 'x and y required');
      if (platform === 'win32') {
        const script = `
          Add-Type -TypeDefinition @'
          using System;
          using System.Runtime.InteropServices;
          public class WinMove {
            [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
            [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
            [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
          }
'@
          $proc = Get-Process | Where-Object {$_.MainWindowTitle -like '*${args.window_id}*'} | Select-Object -First 1
          if ($proc) {
            $rect = New-Object WinMove+RECT
            [WinMove]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)
            $w = $rect.Right - $rect.Left; $h = $rect.Bottom - $rect.Top
            [WinMove]::MoveWindow($proc.MainWindowHandle, ${args.x}, ${args.y}, $w, $h, $true)
            'moved'
          } else { 'not found' }
        `;
        const result = psExec(script);
        return ok({ window: args.window_id, moved_to: { x: args.x, y: args.y }, result });
      }
      return ok({ window: args.window_id, moved_to: { x: args.x, y: args.y }, note: 'Platform-specific implementation pending' });
    }

    case 'window_resize': {
      if (!args.window_id) return fail('MISSING_PARAM', 'window_id required');
      if (!args.width || !args.height) return fail('MISSING_PARAM', 'width and height required');
      if (platform === 'win32') {
        const script = `
          Add-Type -TypeDefinition @'
          using System;
          using System.Runtime.InteropServices;
          public class WinResize {
            [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
            [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
            [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
          }
'@
          $proc = Get-Process | Where-Object {$_.MainWindowTitle -like '*${args.window_id}*'} | Select-Object -First 1
          if ($proc) {
            $rect = New-Object WinResize+RECT
            [WinResize]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)
            [WinResize]::MoveWindow($proc.MainWindowHandle, $rect.Left, $rect.Top, ${args.width}, ${args.height}, $true)
            'resized'
          } else { 'not found' }
        `;
        const result = psExec(script);
        return ok({ window: args.window_id, resized_to: { width: args.width, height: args.height }, result });
      }
      return ok({ window: args.window_id, resized_to: { width: args.width, height: args.height }, note: 'Platform-specific implementation pending' });
    }

    case 'window_minimize': {
      if (!args.window_id) return fail('MISSING_PARAM', 'window_id required');
      if (platform === 'win32') {
        const script = `
          Add-Type -TypeDefinition @'
          using System;
          using System.Runtime.InteropServices;
          public class WinMin {
            [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          }
'@
          $proc = Get-Process | Where-Object {$_.MainWindowTitle -like '*${args.window_id}*'} | Select-Object -First 1
          if ($proc) { [WinMin]::ShowWindow($proc.MainWindowHandle, 6); 'minimized' } else { 'not found' }
        `;
        return ok({ window: args.window_id, result: psExec(script) });
      }
      return ok({ window: args.window_id, note: 'Platform-specific implementation pending' });
    }

    case 'window_maximize': {
      if (!args.window_id) return fail('MISSING_PARAM', 'window_id required');
      if (platform === 'win32') {
        const script = `
          Add-Type -TypeDefinition @'
          using System;
          using System.Runtime.InteropServices;
          public class WinMax {
            [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          }
'@
          $proc = Get-Process | Where-Object {$_.MainWindowTitle -like '*${args.window_id}*'} | Select-Object -First 1
          if ($proc) { [WinMax]::ShowWindow($proc.MainWindowHandle, 3); 'maximized' } else { 'not found' }
        `;
        return ok({ window: args.window_id, result: psExec(script) });
      }
      return ok({ window: args.window_id, note: 'Platform-specific implementation pending' });
    }

    // ═══════════════════════════════════
    // SCREENSHOTS (Real — already was)
    // ═══════════════════════════════════
    case 'screenshot': {
      const localTmp = path.join(os.tmpdir(), `desktop_screenshot_${Date.now()}.png`);
      if (platform === 'win32') {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $Screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
          $Bounds = [Drawing.Rectangle]::FromLTRB($Screen.Left, $Screen.Top, $Screen.Right, $Screen.Bottom)
          $Bitmap = New-Object System.Drawing.Bitmap $Bounds.Width, $Bounds.Height
          $Graphics = [Drawing.Graphics]::FromImage($Bitmap)
          $Graphics.CopyFromScreen($Bounds.Location, [Drawing.Point]::Empty, $Bounds.Size)
          $Bitmap.Save('${localTmp.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
          $Graphics.Dispose()
          $Bitmap.Dispose()
          "$($Bounds.Width)x$($Bounds.Height)"
        `;
        const resolution = psExec(psScript);
        if (fs.existsSync(localTmp)) {
          const buffer = fs.readFileSync(localTmp);
          const base64 = buffer.toString('base64');
          fs.unlinkSync(localTmp);
          return {
            content: [
              { type: 'image', data: base64, mimeType: 'image/png' },
              { type: 'text', text: JSON.stringify({ success: true, resolution, size_bytes: buffer.length, ai_hint: 'Desktop screenshot captured. Analyze for UI state, element positions, and visual bugs.' }) }
            ]
          };
        }
      } else if (platform === 'darwin') {
        exec(`screencapture -x "${localTmp}"`);
      } else {
        exec(`import -window root "${localTmp}"`) || exec(`scrot "${localTmp}"`);
      }

      if (fs.existsSync(localTmp)) {
        const buffer = fs.readFileSync(localTmp);
        const base64 = buffer.toString('base64');
        fs.unlinkSync(localTmp);
        return {
          content: [
            { type: 'image', data: base64, mimeType: 'image/png' },
            { type: 'text', text: JSON.stringify({ success: true, ai_hint: 'Desktop screenshot captured.' }) }
          ]
        };
      }
      return fail('SCREENSHOT_FAILED', 'Failed to capture desktop screenshot');
    }

    // ═══════════════════════════════════
    // REAL MOUSE INPUT
    // ═══════════════════════════════════
    case 'mouse_click': {
      if (args.x === undefined || args.y === undefined) return fail('MISSING_PARAM', 'x and y coordinates required');
      const clicks = args.click_count || 1;

      if (platform === 'win32') {
        const buttonFlag = args.button === 'right' ? '0x0008, 0x0010' : args.button === 'middle' ? '0x0020, 0x0040' : '0x0002, 0x0004';
        const script = `
          Add-Type -TypeDefinition @'
          using System;
          using System.Runtime.InteropServices;
          public class MouseSim {
            [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
            [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);
          }
'@
          [MouseSim]::SetCursorPos(${args.x}, ${args.y})
          Start-Sleep -Milliseconds 50
          for ($i = 0; $i -lt ${clicks}; $i++) {
            [MouseSim]::mouse_event(${buttonFlag}, 0, 0, 0, [IntPtr]::Zero)
            Start-Sleep -Milliseconds 50
          }
          'clicked'
        `;
        psExec(script);
        return ok({ action: 'mouse_click', x: args.x, y: args.y, button: args.button || 'left', clicks, status: 'executed', ai_hint: 'Real mouse click dispatched via Win32 API.' });
      } else if (platform === 'linux') {
        exec(`xdotool mousemove ${args.x} ${args.y} click ${args.button === 'right' ? 3 : args.button === 'middle' ? 2 : 1}`);
        return ok({ action: 'mouse_click', x: args.x, y: args.y, button: args.button || 'left', status: 'executed' });
      }
      return ok({ action: 'mouse_click', x: args.x, y: args.y, status: 'platform_not_supported' });
    }

    case 'mouse_move': {
      if (args.x === undefined || args.y === undefined) return fail('MISSING_PARAM', 'x and y coordinates required');
      if (platform === 'win32') {
        psExec(`
          Add-Type -TypeDefinition @'
          using System;
          using System.Runtime.InteropServices;
          public class MouseMv {
            [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
          }
'@
          [MouseMv]::SetCursorPos(${args.x}, ${args.y})
        `);
        return ok({ action: 'mouse_move', x: args.x, y: args.y, status: 'executed' });
      } else if (platform === 'linux') {
        exec(`xdotool mousemove ${args.x} ${args.y}`);
        return ok({ action: 'mouse_move', x: args.x, y: args.y, status: 'executed' });
      }
      return ok({ action: 'mouse_move', x: args.x, y: args.y, status: 'platform_not_supported' });
    }

    // ═══════════════════════════════════
    // REAL KEYBOARD INPUT
    // ═══════════════════════════════════
    case 'keyboard_type': {
      if (!args.text) return fail('MISSING_PARAM', 'text is required');
      if (platform === 'win32') {
        // Use SendKeys for real typing
        const escaped = args.text.replace(/[+^%~(){}[\]]/g, '{$&}');
        const script = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')
        `;
        psExec(script);
        return ok({ action: 'keyboard_type', text: args.text, status: 'executed', ai_hint: 'Real keystrokes sent via SendKeys API. Text typed into the active window.' });
      } else if (platform === 'linux') {
        exec(`xdotool type --delay 20 "${args.text.replace(/"/g, '\\"')}"`);
        return ok({ action: 'keyboard_type', text: args.text, status: 'executed' });
      }
      return ok({ action: 'keyboard_type', text: args.text, status: 'platform_not_supported' });
    }

    case 'key_press': {
      if (!args.key) return fail('MISSING_PARAM', 'key is required (e.g. "Enter", "Ctrl+C", "Alt+F4")');
      if (platform === 'win32') {
        // Map common key names to SendKeys format
        const keyMap: Record<string, string> = {
          'Enter': '{ENTER}', 'Tab': '{TAB}', 'Escape': '{ESC}', 'Esc': '{ESC}',
          'Backspace': '{BACKSPACE}', 'Delete': '{DELETE}', 'Home': '{HOME}',
          'End': '{END}', 'PageUp': '{PGUP}', 'PageDown': '{PGDN}',
          'Up': '{UP}', 'Down': '{DOWN}', 'Left': '{LEFT}', 'Right': '{RIGHT}',
          'F1': '{F1}', 'F2': '{F2}', 'F3': '{F3}', 'F4': '{F4}',
          'F5': '{F5}', 'F6': '{F6}', 'F7': '{F7}', 'F8': '{F8}',
          'F9': '{F9}', 'F10': '{F10}', 'F11': '{F11}', 'F12': '{F12}',
          'Space': ' ',
        };

        let sendKeysStr = args.key;
        // Handle combos like Ctrl+C, Alt+F4
        if (args.key.includes('+')) {
          const parts = args.key.split('+');
          let prefix = '';
          for (const p of parts.slice(0, -1)) {
            if (p.toLowerCase() === 'ctrl') prefix += '^';
            else if (p.toLowerCase() === 'alt') prefix += '%';
            else if (p.toLowerCase() === 'shift') prefix += '+';
          }
          const lastKey = parts[parts.length - 1];
          sendKeysStr = prefix + (keyMap[lastKey] || lastKey.toLowerCase());
        } else {
          sendKeysStr = keyMap[args.key] || args.key;
        }

        const script = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr.replace(/'/g, "''")}')
        `;
        psExec(script);
        return ok({ action: 'key_press', key: args.key, sendkeys_code: sendKeysStr, status: 'executed' });
      } else if (platform === 'linux') {
        exec(`xdotool key ${args.key.replace('Ctrl+', 'ctrl+').replace('Alt+', 'alt+').replace('Shift+', 'shift+')}`);
        return ok({ action: 'key_press', key: args.key, status: 'executed' });
      }
      return ok({ action: 'key_press', key: args.key, status: 'platform_not_supported' });
    }

    // ═══════════════════════════════════
    // REAL UI TREE (Windows UIAutomation)
    // ═══════════════════════════════════
    case 'ui_tree': {
      if (platform === 'win32') {
        // Use UIAutomation via PowerShell to extract real UI elements
        const script = `
          Add-Type -AssemblyName UIAutomationClient
          Add-Type -AssemblyName UIAutomationTypes
          $root = [System.Windows.Automation.AutomationElement]::RootElement
          ${args.window_id ? `
          $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '*${args.window_id}*')
          $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
          $target = $root
          Get-Process | Where-Object {$_.MainWindowTitle -like '*${args.window_id}*'} | Select-Object -First 1 | ForEach-Object {
            $procCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $_.Id)
            $found = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $procCond)
            if ($found) { $target = $found }
          }
          ` : '$target = $root'}
          $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
          $nodes = @()
          $stack = [System.Collections.Stack]::new()
          $stack.Push(@{Element=$target; Depth=0})
          $maxNodes = 200
          while ($stack.Count -gt 0 -and $nodes.Count -lt $maxNodes) {
            $item = $stack.Pop()
            $el = $item.Element
            $depth = $item.Depth
            try {
              $rect = $el.Current.BoundingRectangle
              $nodes += [PSCustomObject]@{
                Name = $el.Current.Name
                Type = $el.Current.ControlType.ProgrammaticName
                AutomationId = $el.Current.AutomationId
                ClassName = $el.Current.ClassName
                Bounds = @{X=[int]$rect.X; Y=[int]$rect.Y; W=[int]$rect.Width; H=[int]$rect.Height}
                IsEnabled = $el.Current.IsEnabled
                Depth = $depth
              }
              if ($depth -lt 4) {
                $child = $walker.GetFirstChild($el)
                while ($child -ne $null) {
                  $stack.Push(@{Element=$child; Depth=$depth+1})
                  $child = $walker.GetNextSibling($child)
                }
              }
            } catch {}
          }
          $nodes | ConvertTo-Json -Depth 4 -Compress
        `;
        const raw = psExec(script, 30000);
        try {
          const nodes = JSON.parse(raw);
          const nodeList = Array.isArray(nodes) ? nodes : [nodes];
          return ok({
            ui_tree: {
              total_nodes: nodeList.length,
              truncated: nodeList.length >= 200,
              target: args.window_id || 'desktop_root',
            },
            nodes: nodeList.slice(0, 100),
            ai_summary: {
              buttons: nodeList.filter((n: any) => n.Type?.includes('Button')).map((n: any) => ({ name: n.Name, bounds: n.Bounds })),
              text_fields: nodeList.filter((n: any) => n.Type?.includes('Edit') || n.Type?.includes('Text')).map((n: any) => ({ name: n.Name, bounds: n.Bounds })),
              hint: 'Real UI tree via Windows UIAutomation API. Use Bounds for click coordinates. AutomationId for stable element identification.',
            },
          });
        } catch {
          return ok({ ui_tree: { total_nodes: 0, raw_output: raw.substring(0, 1000) }, ai_hint: 'UIAutomation extraction returned non-JSON. The target window may be unresponsive.' });
        }
      } else if (platform === 'darwin') {
        // macOS: Use Accessibility API via osascript
        const output = exec(`osascript -e 'tell application "System Events" to get entire contents of front window of first process whose frontmost is true'`, 10000);
        return ok({ ui_tree: { platform: 'macos', raw: output.substring(0, 2000) } });
      }
      return ok({ ui_tree: { total_nodes: 0, message: 'UI tree extraction requires Windows or macOS.' } });
    }

    // ═══════════════════════════════════
    // REAL EVENT LOGS
    // ═══════════════════════════════════
    case 'extract_logs': {
      if (platform === 'win32') {
        const source = args.log_source || 'Application';
        const count = args.log_count || 20;
        const output = psExec(
          `Get-EventLog -LogName ${source} -Newest ${count} -ErrorAction SilentlyContinue | ` +
          `Select-Object TimeGenerated, EntryType, Source, Message | ` +
          `ConvertTo-Json -Depth 2`,
          10000
        );
        try {
          const entries = JSON.parse(output);
          const list = Array.isArray(entries) ? entries : [entries];
          const errors = list.filter((e: any) => e.EntryType === 'Error' || e.EntryType === 1);
          const warnings = list.filter((e: any) => e.EntryType === 'Warning' || e.EntryType === 2);
          return ok({
            log_source: source,
            total_entries: list.length,
            error_count: errors.length,
            warning_count: warnings.length,
            entries: list.map((e: any) => ({
              time: e.TimeGenerated,
              type: e.EntryType,
              source: e.Source,
              message: (e.Message || '').substring(0, 200),
            })),
            ai_analysis: {
              severity: errors.length > 0 ? 'warning' : 'clean',
              hint: errors.length > 0 ? 'Errors found in event log. Review entries with type=Error for application crashes or failures.' : 'No errors in recent event log entries.',
            },
          });
        } catch {
          return ok({ raw: output.substring(0, 2000) });
        }
      }
      return fail('PLATFORM_ERROR', 'Event log extraction currently supports Windows only');
    }

    // ═══════════════════════════════════
    // REAL PROCESS MONITORING
    // ═══════════════════════════════════
    case 'process_monitor': {
      if (platform === 'win32') {
        const filter = args.process_name 
          ? `| Where-Object {$_.ProcessName -like '*${args.process_name}*'}`
          : `| Sort-Object WorkingSet64 -Descending | Select-Object -First 20`;
        const output = psExec(
          `Get-Process ${filter} | ` +
          `Select-Object Id, ProcessName, ` +
          `@{N='CPU_s';E={[math]::Round($_.CPU,2)}}, ` +
          `@{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, ` +
          `@{N='PrivateMB';E={[math]::Round($_.PrivateMemorySize64/1MB,1)}}, ` +
          `@{N='Threads';E={$_.Threads.Count}}, ` +
          `@{N='Handles';E={$_.HandleCount}} | ` +
          `ConvertTo-Json -Depth 2`
        );
        try {
          const procs = JSON.parse(output);
          const list = Array.isArray(procs) ? procs : [procs];
          return ok({
            processes: list,
            count: list.length,
            total_memory_mb: list.reduce((s: number, p: any) => s + (p.MemMB || 0), 0),
            ai_analysis: {
              top_memory: list.sort((a: any, b: any) => (b.MemMB || 0) - (a.MemMB || 0)).slice(0, 3).map((p: any) => `${p.ProcessName}: ${p.MemMB}MB`),
              hint: 'Monitor MemMB over time to detect memory leaks. High handle count (>1000) may indicate handle leaks.',
            },
          });
        } catch {
          return ok({ raw: output.substring(0, 2000) });
        }
      }
      // Unix
      const output = exec(`ps aux --sort=-%mem | head -20`);
      return ok({ raw: output });
    }

    // ═══════════════════════════════════
    // CLIPBOARD
    // ═══════════════════════════════════
    case 'clipboard_read': {
      if (platform === 'win32') {
        const content = psExec('Get-Clipboard');
        return ok({ clipboard: content, length: content.length });
      } else if (platform === 'darwin') {
        return ok({ clipboard: exec('pbpaste') });
      } else {
        return ok({ clipboard: exec('xclip -selection clipboard -o') });
      }
    }

    case 'clipboard_write': {
      if (!args.text) return fail('MISSING_PARAM', 'text is required');
      if (platform === 'win32') {
        psExec(`Set-Clipboard -Value '${args.text.replace(/'/g, "''")}'`);
        return ok({ written: true, length: args.text.length });
      } else if (platform === 'darwin') {
        exec(`echo "${args.text}" | pbcopy`);
        return ok({ written: true });
      } else {
        exec(`echo "${args.text}" | xclip -selection clipboard`);
        return ok({ written: true });
      }
    }

    // ═══════════════════════════════════
    // PIXEL COLOR AT COORDINATES
    // ═══════════════════════════════════
    case 'pixel_color': {
      if (args.x === undefined || args.y === undefined) return fail('MISSING_PARAM', 'x and y required');
      if (platform === 'win32') {
        const script = `
          Add-Type -AssemblyName System.Drawing
          Add-Type -AssemblyName System.Windows.Forms
          $bmp = New-Object System.Drawing.Bitmap(1, 1)
          $g = [System.Drawing.Graphics]::FromImage($bmp)
          $g.CopyFromScreen(${args.x}, ${args.y}, 0, 0, (New-Object System.Drawing.Size(1,1)))
          $pixel = $bmp.GetPixel(0, 0)
          $g.Dispose(); $bmp.Dispose()
          @{R=$pixel.R; G=$pixel.G; B=$pixel.B; Hex=('#{0:X2}{1:X2}{2:X2}' -f $pixel.R, $pixel.G, $pixel.B)} | ConvertTo-Json
        `;
        try {
          const result = JSON.parse(psExec(script));
          return ok({ x: args.x, y: args.y, color: result });
        } catch (e: any) {
          return ok({ x: args.x, y: args.y, raw: e.message });
        }
      }
      return fail('PLATFORM_ERROR', 'Pixel color sampling currently supports Windows only');
    }

    default:
      return fail('UNKNOWN_ACTION', `Action ${args.action} not supported in Desktop Testing. Available: app_launch, app_kill, app_restart, window_list, window_focus, window_move, window_resize, window_minimize, window_maximize, screenshot, ui_tree, mouse_click, mouse_move, keyboard_type, key_press, system_info, extract_logs, process_monitor, clipboard_read, clipboard_write, pixel_color`);
  }
}
