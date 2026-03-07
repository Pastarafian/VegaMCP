/**
 * VegaClaw VPS Control — Direct SSH-based agentic control of the Linux VPS
 * 
 * Provides full control over the VPS via SSH:
 *   - Execute any shell command
 *   - Read, write, and edit files
 *   - Manage PM2 services
 *   - Install packages
 *   - System info and monitoring
 *   - Git operations
 *   - Screenshot capture
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('ssh2');

const VPS_CONFIG = {
  host: process.env.VPS_HOST || '185.249.74.99',
  port: parseInt(process.env.VPS_SSH_PORT || '22'),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD || '',
};

// Execute a command on the VPS via SSH
function sshExec(command: string, timeout = 30000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('SSH command timed out after ' + timeout + 'ms'));
    }, timeout);

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { clearTimeout(timer); conn.end(); reject(err); return; }
        let stdout = '';
        let stderr = '';
        stream.on('data', (data: Buffer) => { stdout += data.toString(); });
        stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
        stream.on('close', (code: number) => {
          clearTimeout(timer);
          conn.end();
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code || 0 });
        });
      });
    });

    conn.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(new Error('SSH connection failed: ' + err.message));
    });

    conn.connect(VPS_CONFIG);
  });
}

// Upload content to a file on the VPS
function sshWriteFile(remotePath: string, content: string): Promise<string> {
  // Use heredoc to write file content safely
  const escaped = content.replace(/'/g, "'\\''");
  return sshExec(`cat > '${remotePath}' << 'VEGAEOF'\n${content}\nVEGAEOF`, 15000)
    .then(r => r.stderr || 'Written: ' + remotePath);
}

export const vpsControlSchema = {
  name: 'vps_control',
  description: `Direct SSH control of the Linux VPS (185.249.74.99). Full agentic capabilities: execute commands, read/write files, manage services (PM2), install packages, git operations, system monitoring. Actions: exec (run any command), read_file (cat a file), write_file (create/overwrite file), edit_file (sed replacement), ls (list directory), pm2 (service management), install (apt-get), system (CPU/RAM/disk), git (git commands), screenshot (capture VPS desktop).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['exec', 'read_file', 'write_file', 'edit_file', 'ls', 'pm2', 'install', 'system', 'git', 'screenshot'],
        description: 'Action to perform on VPS',
      },
      command: { type: 'string', description: 'Shell command (exec), or pm2 subcommand (pm2), or git subcommand (git)' },
      path: { type: 'string', description: 'File or directory path on VPS' },
      content: { type: 'string', description: 'File content (write_file)' },
      search: { type: 'string', description: 'Search string (edit_file)' },
      replace: { type: 'string', description: 'Replacement string (edit_file)' },
      package_name: { type: 'string', description: 'Package to install (install)' },
      timeout: { type: 'number', description: 'Command timeout in ms (default: 30000)' },
    },
    required: ['action'],
  },
};

function ok(data: any) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

export async function handleVPSControl(args: any) {
  const { action } = args;
  const timeout = args.timeout || 30000;

  try {
    switch (action) {
      case 'exec': {
        if (!args.command) return ok({ error: 'Provide a command to execute' });
        const result = await sshExec(args.command, timeout);
        return ok({
          command: args.command,
          stdout: result.stdout.substring(0, 8000),
          stderr: result.stderr.substring(0, 2000),
          exitCode: result.code,
        });
      }

      case 'read_file': {
        if (!args.path) return ok({ error: 'Provide a file path' });
        const result = await sshExec(`cat '${args.path}' 2>&1 | head -500`, timeout);
        const lineCount = await sshExec(`wc -l < '${args.path}' 2>/dev/null || echo 0`, 5000);
        return ok({
          path: args.path,
          lines: parseInt(lineCount.stdout) || 0,
          content: result.stdout,
          truncated: parseInt(lineCount.stdout) > 500,
        });
      }

      case 'write_file': {
        if (!args.path || !args.content) return ok({ error: 'Provide path and content' });
        // Ensure directory exists
        const dir = args.path.substring(0, args.path.lastIndexOf('/'));
        if (dir) await sshExec(`mkdir -p '${dir}'`, 5000);
        await sshWriteFile(args.path, args.content);
        const stat = await sshExec(`stat --printf='%s bytes' '${args.path}' 2>/dev/null`, 5000);
        return ok({ success: true, path: args.path, size: stat.stdout });
      }

      case 'edit_file': {
        if (!args.path || !args.search || !args.replace) return ok({ error: 'Provide path, search, and replace' });
        // Use python for reliable find/replace
        const pyCmd = `python3 -c "
import sys
with open('${args.path}', 'r') as f: c = f.read()
old = '''${args.search.replace(/'/g, "\\'")}'''
new = '''${args.replace.replace(/'/g, "\\'")}'''
if old not in c: print('NOT_FOUND'); sys.exit(1)
count = c.count(old)
c = c.replace(old, new, 1)
with open('${args.path}', 'w') as f: f.write(c)
print(f'Replaced {count} occurrence(s)')
"`;
        const result = await sshExec(pyCmd, timeout);
        return ok({ path: args.path, result: result.stdout, error: result.stderr || undefined });
      }

      case 'ls': {
        const dir = args.path || '/root';
        const result = await sshExec(`ls -la '${dir}' 2>&1 | head -50`, timeout);
        return ok({ directory: dir, listing: result.stdout });
      }

      case 'pm2': {
        const sub = args.command || 'list';
        const result = await sshExec(`pm2 ${sub} 2>&1`, timeout);
        return ok({ command: `pm2 ${sub}`, output: result.stdout });
      }

      case 'install': {
        if (!args.package_name) return ok({ error: 'Provide package_name' });
        const result = await sshExec(`apt-get install -y ${args.package_name} 2>&1 | tail -5`, 60000);
        return ok({ package: args.package_name, output: result.stdout });
      }

      case 'system': {
        const [cpu, ram, disk, uptime, load, pm2] = await Promise.all([
          sshExec("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", 5000),
          sshExec("free -h | awk '/Mem/{print $3\"/\"$2}'", 5000),
          sshExec("df -h / | awk 'NR==2{print $3\"/\"$2\" (\"$5\")\"}'", 5000),
          sshExec("uptime -p", 5000),
          sshExec("cat /proc/loadavg | awk '{print $1, $2, $3}'", 5000),
          sshExec("pm2 jlist 2>/dev/null | python3 -c \"import json,sys; d=json.load(sys.stdin); print(', '.join(f\\\"{p['name']}:{p['pm2_env']['status']}\\\" for p in d))\" 2>/dev/null || echo 'pm2 not available'", 8000),
        ]);
        return ok({
          cpu: cpu.stdout + '%',
          ram: ram.stdout,
          disk: disk.stdout,
          uptime: uptime.stdout,
          load: load.stdout,
          services: pm2.stdout,
        });
      }

      case 'git': {
        const sub = args.command || 'status';
        const dir = args.path || '/root';
        const result = await sshExec(`cd '${dir}' && git ${sub} 2>&1`, timeout);
        return ok({ command: `git ${sub}`, cwd: dir, output: result.stdout });
      }

      case 'screenshot': {
        const target = args.command || 'desktop';
        const result = await sshExec(`DISPLAY=:1 scrot /tmp/vps-screenshot.png 2>&1 && echo CAPTURED || echo FAILED`, 10000);
        return ok({ status: result.stdout.includes('CAPTURED') ? 'captured' : 'failed', target, path: '/tmp/vps-screenshot.png' });
      }

      default:
        return ok({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    return ok({ error: e.message, hint: 'Check VPS connectivity. SSH to 185.249.74.99:22' });
  }
}
