ons
 * VegaClaw IDE AutoClicker — MCP Tool
 * 
 * Manages the PowerShell-based IDE autoclicker that automatically
 * handles trust dialogs, permission prompts, and action buttons
 * across all IDEs (Antigravity, VS Code, Cursor, JetBrains, etc.)
 * 
 * Actions:
 *   start  — Start the autoclicker daemon
 *   stop   — Stop the autoclicker
 *   status — Check if running, show click count
 *   log    — Show recent autoclicker activity
 *   config — View/update click patterns
 */

import { exec, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'ide-autoclicker.ps1');
const LOG_PATH = path.join(os.homedir(), '.claw-memory', 'autoclicker.log');
const PID_PATH = path.join(os.homedir(), '.claw-memory', 'autoclicker.pid');

let clickerProcess: ChildProcess | null = null;

export const ideAutoClickerSchema = {
  name: 'ide_autoclicker',
  description: `Controls the VegaClaw IDE AutoClicker — automatically clicks Trust, Allow, Accept, Run, and other common IDE dialog buttons across all IDEs (Antigravity, VS Code, Cursor, JetBrains). Actions: start (launch daemon), stop (kill daemon), status (check running state), log (show recent clicks), patterns (list button patterns).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'stop', 'status', 'log', 'patterns'],
        description: 'Action to perform',
      },
      interval: {
        type: 'number',
        description: 'Scan interval in seconds (start action, default: 3)',
      },
      dry_run: {
        type: 'boolean',
        description: 'If true, log matches but do not click (start action)',
      },
      lines: {
        type: 'number',
        description: 'Number of log lines to show (log action, default: 20)',
      },
    },
    required: ['action'],
  },
};

function ok(data: any) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

function isRunning(): boolean {
  // Check via PID file
  try {
    if (fs.existsSync(PID_PATH)) {
      const pid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim());
      try {
        process.kill(pid, 0); // Check if process exists
        return true;
      } catch {
        fs.unlinkSync(PID_PATH);
        return false;
      }
    }
  } catch {}
  
  return clickerProcess !== null && !clickerProcess.killed;
}

function getRecentLog(lines: number = 20): string {
  try {
    if (!fs.existsSync(LOG_PATH)) return '(no log file yet)';
    const content = fs.readFileSync(LOG_PATH, 'utf8');
    const allLines = content.split('\n').filter(l => l.trim());
    return allLines.slice(-lines).join('\n') || '(empty log)';
  } catch {
    return '(unable to read log)';
  }
}

function getClickCount(): number {
  try {
    if (!fs.existsSync(LOG_PATH)) return 0;
    const content = fs.readFileSync(LOG_PATH, 'utf8');
    const matches = content.match(/\[CLICK\]/g);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

export async function handleIDEAutoClicker(args: any) {
  const { action } = args;

  switch (action) {
    case 'start': {
      if (isRunning()) {
        return ok({ status: 'already_running', message: 'AutoClicker is already running.' });
      }

      const interval = args.interval || 3;
      const dryRun = args.dry_run ? '-DryRun' : '';
      
      // Ensure log directory exists
      const logDir = path.dirname(LOG_PATH);
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

      const cmd = `powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "${SCRIPT_PATH}" -Interval ${interval} ${dryRun}`;
      
      clickerProcess = exec(cmd, { windowsHide: true });
      
      if (clickerProcess.pid) {
        fs.writeFileSync(PID_PATH, String(clickerProcess.pid));
      }

      clickerProcess.on('exit', () => {
        clickerProcess = null;
        try { fs.unlinkSync(PID_PATH); } catch {}
      });

      return ok({
        status: 'started',
        pid: clickerProcess.pid,
        interval: interval,
        dryRun: !!args.dry_run,
        message: `AutoClicker started! Scanning every ${interval}s across all IDEs.`,
        patterns: '30+ button patterns (Trust, Allow, Accept, Run, etc.)',
        safety: 'Will NEVER click: Delete, Remove, Uninstall, Format, Reset',
      });
    }

    case 'stop': {
      if (!isRunning()) {
        return ok({ status: 'not_running', message: 'AutoClicker is not running.' });
      }

      // Kill via PID
      try {
        if (fs.existsSync(PID_PATH)) {
          const pid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim());
          // Kill the PowerShell process tree
          exec(`taskkill /PID ${pid} /T /F`, { windowsHide: true });
          fs.unlinkSync(PID_PATH);
        }
        if (clickerProcess) {
          clickerProcess.kill();
          clickerProcess = null;
        }
      } catch {}

      return ok({ status: 'stopped', message: 'AutoClicker stopped.', totalClicks: getClickCount() });
    }

    case 'status': {
      const running = isRunning();
      return ok({
        status: running ? 'running' : 'stopped',
        totalClicks: getClickCount(),
        logFile: LOG_PATH,
        scriptPath: SCRIPT_PATH,
        ...(running && fs.existsSync(PID_PATH) ? { pid: parseInt(fs.readFileSync(PID_PATH, 'utf8').trim()) } : {}),
      });
    }

    case 'log': {
      const lines = args.lines || 20;
      return ok(getRecentLog(lines));
    }

    case 'patterns': {
      return ok({
        autoClick: [
          '--- Trust / Security ---',
          'Trust, Trust Folder, Trust the authors, Yes I trust',
          '--- Allow / Permission ---',
          'Allow, Allow All, Allow this, Grant, Enable',
          '--- Accept / Confirm ---',
          'Accept, Accept All, Accept Changes, OK, Yes, Continue, Proceed, Confirm',
          '--- Run / Execute ---',
          'Run, Run Anyway, Run Code, Execute, Run Task',
          '--- IDE Specific ---',
          'Allow this conversation, Run all, Apply, Apply All, Approve',
          'Install, Reload, Don\'t Show Again, Trust Project',
        ],
        neverClick: ['Delete', 'Remove', 'Uninstall', 'Format', 'Reset', 'Sign Out', 'Log Out', 'Close Project', 'Cancel'],
        supportedIDEs: ['Antigravity', 'VS Code', 'Cursor', 'IntelliJ', 'PyCharm', 'WebStorm', 'Rider', 'GoLand', 'Visual Studio'],
      });
    }

    default:
      return ok({ error: `Unknown action: ${action}` });
  }
}
