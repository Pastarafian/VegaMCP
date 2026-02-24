/**
 * Shell/Terminal — Execute shell commands with safety controls
 * Supports command execution, process listing, and output capture
 */

import { execSync, exec, type ChildProcess } from 'child_process';
import os from 'os';

function result(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

// Blocked commands for safety
const BLOCKED_PATTERNS = [
  /^rm\s+(-rf?|--recursive)\s+[\/\\]/i,       // rm -rf /
  /^del\s+\/s\s+\/q\s+[a-z]:\\/i,             // del /s /q C:\
  /format\s+[a-z]:/i,                          // format C:
  /^shutdown/i,                                 // shutdown
  /^reboot/i,                                   // reboot
  /^mkfs/i,                                     // mkfs
  /^dd\s+if=/i,                                 // dd
  /^:(){ :\|:& };:/,                           // fork bomb
  />\s*\/dev\/sda/i,                            // write to disk
];

const activeProceses = new Map<string, { process: ChildProcess; output: string; error: string; status: string }>();

export const shellSchema = {
  name: 'vegamcp_shell',
  description: 'Execute shell commands with safety controls, timeout, and output capture. Supports running commands, background processes, and environment info. ⚠️ Use responsibly. Actions: execute, execute_background, get_output, kill, system_info, which, env.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['execute', 'execute_background', 'get_output', 'kill', 'system_info', 'which', 'env'] as const,
        description: 'Action to perform',
      },
      command: { type: 'string' as const, description: 'Shell command to execute' },
      cwd: { type: 'string' as const, description: 'Working directory (defaults to WORKSPACE_ROOT)' },
      timeout: { type: 'number' as const, description: 'Timeout in seconds (default 30, max 300)' },
      process_id: { type: 'string' as const, description: 'Process ID (for get_output, kill)' },
      program: { type: 'string' as const, description: 'Program name (for which)' },
      var_name: { type: 'string' as const, description: 'Environment variable name (for env)' },
    },
    required: ['action'] as const,
  },
};

export async function handleShell(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    switch (args.action) {

      case 'execute': {
        if (!args.command) throw new Error('command is required');
        assertSafeCommand(args.command);

        const cwd = args.cwd || process.env.WORKSPACE_ROOT || process.cwd();
        const timeout = Math.min(Math.max(args.timeout || 30, 1), 300) * 1000;
        const isWindows = os.platform() === 'win32';

        try {
          const stdout = execSync(args.command, {
            cwd,
            encoding: 'utf-8',
            timeout,
            maxBuffer: 5 * 1024 * 1024,
            shell: isWindows ? 'cmd.exe' : '/bin/sh',
          });

          return result({
            success: true,
            command: args.command,
            cwd,
            exitCode: 0,
            stdout: stdout.slice(0, 50000),
            truncated: stdout.length > 50000,
          });
        } catch (err: any) {
          return result({
            success: false,
            command: args.command,
            cwd,
            exitCode: err.status || 1,
            stdout: err.stdout?.slice(0, 20000) || '',
            stderr: err.stderr?.slice(0, 20000) || err.message,
          });
        }
      }

      case 'execute_background': {
        if (!args.command) throw new Error('command is required');
        assertSafeCommand(args.command);

        const cwd = args.cwd || process.env.WORKSPACE_ROOT || process.cwd();
        const isWindows = os.platform() === 'win32';
        const id = `proc-${Date.now().toString(36)}`;

        const proc = exec(args.command, {
          cwd,
          shell: isWindows ? 'cmd.exe' : '/bin/sh',
          maxBuffer: 5 * 1024 * 1024,
        });

        const entry = { process: proc, output: '', error: '', status: 'running' };
        activeProceses.set(id, entry);

        proc.stdout?.on('data', (data: string) => { entry.output += data; });
        proc.stderr?.on('data', (data: string) => { entry.error += data; });
        proc.on('exit', (code) => { entry.status = `exited(${code})`; });
        proc.on('error', (err) => { entry.status = `error: ${err.message}`; });

        // Auto-cleanup after 5 minutes
        setTimeout(() => {
          if (activeProceses.has(id)) {
            proc.kill();
            activeProceses.delete(id);
          }
        }, 300000);

        return result({
          success: true,
          process_id: id,
          command: args.command,
          pid: proc.pid,
          message: `Background process started. Use get_output with process_id "${id}" to check.`,
        });
      }

      case 'get_output': {
        if (!args.process_id) throw new Error('process_id is required');
        const entry = activeProceses.get(args.process_id);
        if (!entry) throw new Error(`Process "${args.process_id}" not found`);

        return result({
          success: true,
          process_id: args.process_id,
          status: entry.status,
          stdout: entry.output.slice(-20000),
          stderr: entry.error.slice(-5000),
        });
      }

      case 'kill': {
        if (!args.process_id) throw new Error('process_id is required');
        const entry = activeProceses.get(args.process_id);
        if (!entry) throw new Error(`Process "${args.process_id}" not found`);

        entry.process.kill('SIGTERM');
        entry.status = 'killed';
        activeProceses.delete(args.process_id);
        return result({ success: true, killed: args.process_id });
      }

      case 'system_info': {
        return result({
          success: true,
          platform: os.platform(),
          arch: os.arch(),
          hostname: os.hostname(),
          cpus: os.cpus().length,
          totalMemoryGB: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
          freeMemoryGB: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10,
          uptime: formatUptime(os.uptime()),
          nodeVersion: process.version,
          cwd: process.cwd(),
          env: {
            HOME: process.env.HOME || process.env.USERPROFILE,
            PATH: process.env.PATH?.split(os.platform() === 'win32' ? ';' : ':').slice(0, 10),
          },
        });
      }

      case 'which': {
        if (!args.program) throw new Error('program is required');
        const isWindows = os.platform() === 'win32';
        const cmd = isWindows ? `where "${args.program}"` : `which "${args.program}"`;
        try {
          const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
          return result({ success: true, program: args.program, found: true, path: output });
        } catch {
          return result({ success: true, program: args.program, found: false });
        }
      }

      case 'env': {
        if (args.var_name) {
          return result({
            success: true,
            variable: args.var_name,
            value: process.env[args.var_name] || null,
            exists: args.var_name in process.env,
          });
        }
        // List safe env vars (exclude secrets)
        const safe = Object.entries(process.env)
          .filter(([k]) => !k.includes('KEY') && !k.includes('TOKEN') && !k.includes('SECRET') && !k.includes('PASSWORD'))
          .slice(0, 50)
          .reduce((acc, [k, v]) => ({ ...acc, [k]: v?.slice(0, 200) }), {});
        return result({ success: true, variables: safe, count: Object.keys(safe).length });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return result({ success: false, error: err.message });
  }
}

function assertSafeCommand(cmd: string): void {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) {
      throw new Error(`Command blocked for safety: matches "${pattern.source}". This command could cause irreversible damage.`);
    }
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
