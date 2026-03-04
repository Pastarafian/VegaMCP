/**
 * VegaMCP — Sandbox Manager (v4.0 — Docker-First, Full Lifecycle)
 * 
 * Docker-based sandboxing with specialized containers for each use case.
 * 
 * Primary:   Docker Container — Full Linux sandbox with Xvfb, Python, Node, firejail, Win32 shims
 * Fallback:  V8 Isolate       — Lightweight JS sandbox (no Docker needed)
 *            Directory Jail   — Temp filesystem sandbox
 *            Process Sandbox  — Isolated child process
 *            PowerShell       — Constrained Language Mode execution
 * 
 * v4.0 Additions:
 *   - Package installation (apt/pip/npm) with safety-gated blocklist
 *   - Container snapshots (docker commit → reusable images)
 *   - Port forwarding for web app testing
 *   - Container logs (stream/tail)
 *   - Resource monitoring (CPU/RAM/disk)
 *   - Container diff (filesystem changes since creation)
 *   - Dockerfile generation from install history
 *   - Auto-cleanup TTL (containers auto-destroy after idle timeout)
 *   - Exec with working directory
 *   - Batch exec (run multiple commands sequentially)
 *   - Container pause/unpause/restart
 *   - Package cache volumes (speed up repeated installs)
 *   - Environment variable injection post-create
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ============================================================
// Types
// ============================================================
export interface SandboxInstance {
  id: string;
  type: 'docker' | 'process' | 'vm' | 'directory';
  name: string;
  status: 'creating' | 'running' | 'paused' | 'stopped' | 'destroyed';
  created: string;
  workDir: string;
  pid?: number;
  metadata: Record<string, any>;
  /** Track installed packages for Dockerfile generation */
  installHistory: InstallRecord[];
  /** Port mappings: hostPort → containerPort */
  portMappings: Record<number, number>;
  /** Auto-destroy after this many ms of idle time (0 = disabled) */
  ttlMs: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Environment variables injected post-create */
  envVars: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export interface InstallRecord {
  timestamp: string;
  manager: 'apt' | 'pip' | 'npm' | 'apk';
  packages: string[];
  exitCode: number;
}

export interface ResourceUsage {
  cpu_percent: string;
  memory_usage: string;
  memory_limit: string;
  memory_percent: string;
  net_io: string;
  block_io: string;
  pids: string;
}

export type DockerProfile = 'gui-test' | 'ocr-test' | 'api-test' | 'security-test' | 'general';

// ============================================================
// Safety: Package Blocklist
// ============================================================
const BLOCKED_PACKAGES = new Set([
  // Dangerous system tools
  'nmap', 'masscan', 'hping3', 'netcat-openbsd', 'ncat',
  'john', 'hashcat', 'hydra', 'medusa', 'aircrack-ng',
  'metasploit-framework', 'sqlmap', 'nikto', 'dirb', 'gobuster',
  'beef-xss', 'ettercap', 'bettercap', 'mitmproxy',
  'cron-daemon', 'at', 'sshd', 'openssh-server',
  // Crypto miners
  'xmrig', 'cpuminer', 'cgminer', 'bfgminer',
  // Kernel/system modification
  'linux-headers', 'dkms', 'module-assistant',
  // npm dangerous
  'puppeteer', 'playwright',  // use host Playwright instead
]);

function isPackageAllowed(pkg: string): boolean {
  const normalized = pkg.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (BLOCKED_PACKAGES.has(normalized)) return false;
  // Block version-pinned blocked packages too (e.g. "nmap=7.92")
  const baseName = normalized.split(/[=<>@]/)[0];
  if (BLOCKED_PACKAGES.has(baseName)) return false;
  return true;
}

// ============================================================
// Sandbox Registry
// ============================================================
const sandboxes = new Map<string, SandboxInstance>();
const childProcesses = new Map<string, ChildProcess>();
const SANDBOX_BASE = path.join(os.tmpdir(), 'REDACTED_sandboxes');
if (!fs.existsSync(SANDBOX_BASE)) fs.mkdirSync(SANDBOX_BASE, { recursive: true });

const DOCKER_IMAGE = 'vega-sandbox:latest';
const CACHE_VOLUME_APT = 'vega-apt-cache';
const CACHE_VOLUME_PIP = 'vega-pip-cache';
const CACHE_VOLUME_NPM = 'vega-npm-cache';

// TTL cleanup interval
let ttlIntervalId: ReturnType<typeof setInterval> | null = null;

function startTTLCleanup() {
  if (ttlIntervalId) return;
  ttlIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [id, sb] of sandboxes) {
      if (sb.ttlMs > 0 && (now - sb.lastActivity) > sb.ttlMs) {
        try {
          if (sb.type === 'docker') dockerDestroy(id);
          else if (sb.type === 'process') processDestroy(id);
          else if (sb.type === 'directory') directoryDestroy(id);
        } catch {}
      }
    }
  }, 30000); // Check every 30s
}

function touchSandbox(id: string) {
  const sb = sandboxes.get(id);
  if (sb) sb.lastActivity = Date.now();
}

function genId(): string {
  return `sb-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function shellExec(cmd: string, timeoutMs = 30000, cwd?: string): string {
  try {
    return execSync(cmd, {
      timeout: timeoutMs, encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      cwd: cwd || undefined,
    }).trim();
  } catch (e: any) {
    return e.stdout?.toString().trim() || e.stderr?.toString().trim() || e.message;
  }
}

// ============================================================
// DOCKER ENGINE (Primary Sandbox)
// ============================================================

export function isDockerAvailable(): boolean {
  try {
    execSync('docker version --format "{{.Server.Os}}"', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch { return false; }
}

export function isDockerImageBuilt(image = DOCKER_IMAGE): boolean {
  try {
    const out = execSync(`docker images -q ${image}`, {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out.length > 0;
  } catch { return false; }
}

export function dockerBuildImage(dockerfileDir: string, image = DOCKER_IMAGE): ExecResult {
  const start = Date.now();
  try {
    const stdout = execSync(`docker build -t ${image} "${dockerfileDir}"`, {
      encoding: 'utf-8', timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { exitCode: 0, stdout, stderr: '', duration_ms: Date.now() - start };
  } catch (e: any) {
    return { exitCode: e.status || 1, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message, duration_ms: Date.now() - start };
  }
}

export function dockerCreate(opts: {
  name?: string;
  profile?: DockerProfile;
  volumes?: string[];
  network?: boolean;
  env?: Record<string, string>;
  resourceLimits?: { cpus?: string; memory?: string };
  ports?: Record<number, number>;   // hostPort → containerPort
  ttlMs?: number;                    // auto-destroy after idle
  enablePackageCache?: boolean;      // mount package cache volumes
}): SandboxInstance {
  const id = genId();
  const containerName = `vega-sb-${id}`;
  const profile = opts.profile || 'general';
  const networkFlag = opts.network ? '' : '--network none';
  const volumeArgs = (opts.volumes || []).map(v => `-v "${v}"`).join(' ');
  const envArgs = Object.entries(opts.env || {}).map(([k, v]) => `-e "${k}=${v}"`).join(' ');
  const resourceArgs = [
    opts.resourceLimits?.cpus ? `--cpus=${opts.resourceLimits.cpus}` : '--cpus=2.0',
    opts.resourceLimits?.memory ? `--memory=${opts.resourceLimits.memory}` : '--memory=2g',
  ].join(' ');

  // Port mappings
  const portMappings: Record<number, number> = opts.ports || {};
  const portArgs = Object.entries(portMappings).map(([host, container]) => `-p ${host}:${container}`).join(' ');

  // Package cache volumes (speed up repeated installs)
  let cacheArgs = '';
  if (opts.enablePackageCache) {
    cacheArgs = [
      `-v ${CACHE_VOLUME_APT}:/var/cache/apt/archives`,
      `-v ${CACHE_VOLUME_PIP}:/root/.cache/pip`,
      `-v ${CACHE_VOLUME_NPM}:/root/.npm/_cacache`,
    ].join(' ');
  }

  const cmd = `docker run -d --rm ${networkFlag} ${resourceArgs} --name ${containerName} ${volumeArgs} ${envArgs} ${portArgs} ${cacheArgs} ${DOCKER_IMAGE} shell`;

  try {
    const containerId = execSync(cmd, {
      encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const sandbox: SandboxInstance = {
      id, type: 'docker', name: opts.name || containerName,
      status: 'running', created: new Date().toISOString(),
      workDir: '/sandbox/workspaces/current',
      metadata: {
        containerName, containerId: containerId.substring(0, 12), profile,
        volumes: opts.volumes || [], network: opts.network || false,
        enablePackageCache: opts.enablePackageCache || false,
      },
      installHistory: [],
      portMappings,
      ttlMs: opts.ttlMs || 0,
      lastActivity: Date.now(),
      envVars: opts.env || {},
    };
    sandboxes.set(id, sandbox);

    // Start TTL cleanup if needed
    if (opts.ttlMs && opts.ttlMs > 0) startTTLCleanup();

    return sandbox;
  } catch (e: any) {
    throw new Error(`Docker create failed: ${e.message}`);
  }
}

export function dockerExec(sandboxId: string, command: string, timeoutMs = 30000, workDir?: string): ExecResult {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') throw new Error('Not a Docker sandbox');
  const { containerName } = sb.metadata;
  const start = Date.now();
  touchSandbox(sandboxId);

  const wdFlag = workDir ? `-w "${workDir}"` : '';

  try {
    const stdout = execSync(
      `docker exec ${wdFlag} ${containerName} bash -c "${command.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return { exitCode: 0, stdout, stderr: '', duration_ms: Date.now() - start };
  } catch (e: any) {
    return {
      exitCode: e.status || 1,
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || e.message,
      duration_ms: Date.now() - start,
    };
  }
}

export function dockerRunProfile(profile: DockerProfile, opts?: {
  volumes?: string[];
  network?: boolean;
  command?: string;
  timeoutMs?: number;
}): ExecResult {
  const start = Date.now();
  const networkFlag = opts?.network ? '' : '--network none';
  const volumeArgs = (opts?.volumes || []).map(v => `-v "${v}"`).join(' ');
  const extraArgs = opts?.command || '';

  const cmd = `docker run --rm ${networkFlag} --cpus=2.0 --memory=2g ${volumeArgs} ${DOCKER_IMAGE} run ${profile} ${extraArgs}`;

  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8', timeout: opts?.timeoutMs || 120000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { exitCode: 0, stdout, stderr: '', duration_ms: Date.now() - start };
  } catch (e: any) {
    return {
      exitCode: e.status || 1,
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || e.message,
      duration_ms: Date.now() - start,
    };
  }
}

export function dockerCopyIn(sandboxId: string, hostPath: string, containerPath: string): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') return false;
  touchSandbox(sandboxId);
  try {
    execSync(`docker cp "${hostPath}" ${sb.metadata.containerName}:${containerPath}`, {
      encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch { return false; }
}

export function dockerCopyOut(sandboxId: string, containerPath: string, hostPath: string): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') return false;
  touchSandbox(sandboxId);
  try {
    execSync(`docker cp ${sb.metadata.containerName}:${containerPath} "${hostPath}"`, {
      encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch { return false; }
}

export function dockerDestroy(sandboxId: string): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') return false;
  try {
    execSync(`docker rm -f ${sb.metadata.containerName}`, {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {}
  sb.status = 'destroyed';
  sandboxes.delete(sandboxId);
  return true;
}

export function dockerHealth(sandboxId: string): ExecResult {
  return dockerExec(sandboxId, '/sandbox/bin/entrypoint.sh health', 10000);
}

export function dockerListContainers(): string[] {
  try {
    const out = execSync('docker ps --filter "name=vega-sb-" --format "{{.Names}}"', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out ? out.split('\n') : [];
  } catch { return []; }
}

// ============================================================
// NEW: Package Installation (Safety-Gated)
// ============================================================

export function dockerInstallPackages(sandboxId: string, packages: string[], manager: 'apt' | 'pip' | 'npm' | 'apk' = 'apt', timeoutMs = 120000): ExecResult & { blocked: string[] } {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') throw new Error('Not a Docker sandbox');
  touchSandbox(sandboxId);

  // Safety check
  const blocked = packages.filter(p => !isPackageAllowed(p));
  const allowed = packages.filter(p => isPackageAllowed(p));

  if (allowed.length === 0) {
    return {
      exitCode: 1, stdout: '', stderr: `All packages blocked: ${blocked.join(', ')}`,
      duration_ms: 0, blocked,
    };
  }

  // Temporarily enable networking if needed
  const { containerName } = sb.metadata;
  const hadNetwork = sb.metadata.network === true;
  if (!hadNetwork) {
    try {
      execSync(`docker network connect bridge ${containerName}`, {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {}
  }

  const start = Date.now();
  let installCmd: string;
  const pkgList = allowed.join(' ');

  switch (manager) {
    case 'apt':
      installCmd = `apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${pkgList}`;
      break;
    case 'pip':
      installCmd = `pip install --no-input ${pkgList}`;
      break;
    case 'npm':
      installCmd = `npm install -g ${pkgList}`;
      break;
    case 'apk':
      installCmd = `apk add --no-cache ${pkgList}`;
      break;
  }

  let result: ExecResult;
  try {
    const stdout = execSync(
      `docker exec ${containerName} bash -c "${installCmd.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    result = { exitCode: 0, stdout, stderr: '', duration_ms: Date.now() - start };
  } catch (e: any) {
    result = {
      exitCode: e.status || 1,
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || e.message,
      duration_ms: Date.now() - start,
    };
  }

  // Disconnect network if it wasn't enabled before
  if (!hadNetwork) {
    try {
      execSync(`docker network disconnect bridge ${containerName}`, {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {}
  }

  // Record install history
  sb.installHistory.push({
    timestamp: new Date().toISOString(), manager,
    packages: allowed, exitCode: result.exitCode,
  });

  return { ...result, blocked };
}

// ============================================================
// NEW: Container Snapshot (docker commit)
// ============================================================

export function dockerSnapshot(sandboxId: string, tag?: string): { success: boolean; image: string; error?: string } {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') return { success: false, image: '', error: 'Not a Docker sandbox' };
  touchSandbox(sandboxId);

  const imageName = tag || `vega-snapshot:${sandboxId}`;
  try {
    execSync(`docker commit ${sb.metadata.containerName} ${imageName}`, {
      encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, image: imageName };
  } catch (e: any) {
    return { success: false, image: '', error: e.message };
  }
}

// ============================================================
// NEW: Container Logs
// ============================================================

export function dockerLogs(sandboxId: string, tail = 100, since?: string): ExecResult {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') throw new Error('Not a Docker sandbox');

  const { containerName } = sb.metadata;
  const sinceFlag = since ? `--since "${since}"` : '';
  const start = Date.now();

  try {
    const stdout = execSync(
      `docker logs --tail ${tail} ${sinceFlag} ${containerName}`,
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return { exitCode: 0, stdout, stderr: '', duration_ms: Date.now() - start };
  } catch (e: any) {
    return { exitCode: 1, stdout: '', stderr: e.stderr?.toString() || e.message, duration_ms: Date.now() - start };
  }
}

// ============================================================
// NEW: Resource Monitoring
// ============================================================

export function dockerStats(sandboxId: string): ResourceUsage | null {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') return null;

  try {
    const raw = execSync(
      `docker stats --no-stream --format "{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}" ${sb.metadata.containerName}`,
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const parts = raw.split('\t');
    if (parts.length >= 6) {
      const memParts = parts[1].split('/').map(s => s.trim());
      return {
        cpu_percent: parts[0],
        memory_usage: memParts[0] || parts[1],
        memory_limit: memParts[1] || 'unknown',
        memory_percent: parts[2],
        net_io: parts[3],
        block_io: parts[4],
        pids: parts[5],
      };
    }
  } catch {}
  return null;
}

// ============================================================
// NEW: Container Diff (filesystem changes)
// ============================================================

export function dockerDiff(sandboxId: string): { added: string[]; changed: string[]; deleted: string[] } | null {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') return null;

  try {
    const raw = execSync(
      `docker diff ${sb.metadata.containerName}`,
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const lines = raw.split('\n').filter(Boolean);
    return {
      added: lines.filter(l => l.startsWith('A ')).map(l => l.substring(2)),
      changed: lines.filter(l => l.startsWith('C ')).map(l => l.substring(2)),
      deleted: lines.filter(l => l.startsWith('D ')).map(l => l.substring(2)),
    };
  } catch { return null; }
}

// ============================================================
// NEW: Dockerfile Generation from Install History
// ============================================================

export function generateDockerfile(sandboxId: string): string {
  const sb = sandboxes.get(sandboxId);
  if (!sb) return '# Sandbox not found';

  const lines: string[] = [
    `# Auto-generated Dockerfile from VegaMCP sandbox ${sandboxId}`,
    `# Generated: ${new Date().toISOString()}`,
    `FROM ${DOCKER_IMAGE}`,
    '',
  ];

  // Group installs by manager
  const aptPkgs: string[] = [];
  const pipPkgs: string[] = [];
  const npmPkgs: string[] = [];
  const apkPkgs: string[] = [];

  for (const record of sb.installHistory) {
    if (record.exitCode !== 0) continue; // Skip failed installs
    switch (record.manager) {
      case 'apt': aptPkgs.push(...record.packages); break;
      case 'pip': pipPkgs.push(...record.packages); break;
      case 'npm': npmPkgs.push(...record.packages); break;
      case 'apk': apkPkgs.push(...record.packages); break;
    }
  }

  if (aptPkgs.length > 0) {
    lines.push('# System packages');
    lines.push(`RUN apt-get update -qq && \\`);
    lines.push(`    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \\`);
    lines.push(`    ${[...new Set(aptPkgs)].join(' \\\n    ')} && \\`);
    lines.push('    apt-get clean && rm -rf /var/lib/apt/lists/*');
    lines.push('');
  }

  if (apkPkgs.length > 0) {
    lines.push('# Alpine packages');
    lines.push(`RUN apk add --no-cache ${[...new Set(apkPkgs)].join(' ')}`);
    lines.push('');
  }

  if (pipPkgs.length > 0) {
    lines.push('# Python packages');
    lines.push(`RUN pip install --no-cache-dir ${[...new Set(pipPkgs)].join(' ')}`);
    lines.push('');
  }

  if (npmPkgs.length > 0) {
    lines.push('# Node.js packages');
    lines.push(`RUN npm install -g ${[...new Set(npmPkgs)].join(' ')}`);
    lines.push('');
  }

  // Environment variables
  if (Object.keys(sb.envVars).length > 0) {
    lines.push('# Environment');
    for (const [k, v] of Object.entries(sb.envVars)) {
      lines.push(`ENV ${k}="${v}"`);
    }
    lines.push('');
  }

  // Port exposures
  if (Object.keys(sb.portMappings).length > 0) {
    lines.push('# Exposed ports');
    for (const containerPort of Object.values(sb.portMappings)) {
      lines.push(`EXPOSE ${containerPort}`);
    }
    lines.push('');
  }

  lines.push(`WORKDIR ${sb.workDir}`);
  return lines.join('\n');
}

// ============================================================
// NEW: Container Lifecycle (Pause/Unpause/Restart)
// ============================================================

export function dockerPause(sandboxId: string): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker' || sb.status !== 'running') return false;
  try {
    execSync(`docker pause ${sb.metadata.containerName}`, {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    sb.status = 'paused';
    return true;
  } catch { return false; }
}

export function dockerUnpause(sandboxId: string): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker' || sb.status !== 'paused') return false;
  try {
    execSync(`docker unpause ${sb.metadata.containerName}`, {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    sb.status = 'running';
    touchSandbox(sandboxId);
    return true;
  } catch { return false; }
}

export function dockerRestart(sandboxId: string): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') return false;
  try {
    execSync(`docker restart ${sb.metadata.containerName}`, {
      encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    sb.status = 'running';
    touchSandbox(sandboxId);
    return true;
  } catch { return false; }
}

// ============================================================
// NEW: Batch Exec (multiple commands sequentially)
// ============================================================

export function dockerBatchExec(sandboxId: string, commands: string[], timeoutMs = 30000, workDir?: string): Array<ExecResult & { command: string }> {
  const results: Array<ExecResult & { command: string }> = [];
  for (const command of commands) {
    const result = dockerExec(sandboxId, command, timeoutMs, workDir);
    results.push({ ...result, command });
    // Stop on first failure (like set -e)
    if (result.exitCode !== 0) break;
  }
  return results;
}

// ============================================================
// NEW: Environment Variable Injection Post-Create
// ============================================================

export function dockerSetEnv(sandboxId: string, vars: Record<string, string>): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') return false;
  touchSandbox(sandboxId);

  // Write to container's /etc/environment and export in current shell
  const exports = Object.entries(vars).map(([k, v]) => `echo '${k}=${v}' >> /etc/environment && export ${k}='${v}'`).join(' && ');
  try {
    execSync(`docker exec ${sb.metadata.containerName} bash -c "${exports.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    Object.assign(sb.envVars, vars);
    return true;
  } catch { return false; }
}

// ============================================================
// NEW: Port Forwarding (add ports to running container)
// ============================================================

export function dockerGetPorts(sandboxId: string): Record<string, string> | null {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') return null;

  try {
    const raw = execSync(
      `docker port ${sb.metadata.containerName}`,
      { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const ports: Record<string, string> = {};
    for (const line of raw.split('\n').filter(Boolean)) {
      const [container, host] = line.split(' -> ');
      if (container && host) ports[container.trim()] = host.trim();
    }
    return ports;
  } catch { return {}; }
}

// ============================================================
// FALLBACK: Process Sandbox (Isolated Child Process)
// ============================================================

export function processCreate(opts: {
  name?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}): SandboxInstance {
  const id = genId();
  const workDir = path.join(SANDBOX_BASE, id);
  fs.mkdirSync(workDir, { recursive: true });

  const safeEnv: Record<string, string> = {
    PATH: process.env.PATH || '',
    TEMP: workDir, TMP: workDir,
    USERPROFILE: workDir, HOME: workDir,
    APPDATA: path.join(workDir, 'appdata'),
    LOCALAPPDATA: path.join(workDir, 'localappdata'),
    ...(opts.env || {}),
  };

  const child = spawn(opts.command, opts.args || [], {
    cwd: workDir, env: safeEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true, timeout: opts.timeoutMs || 60000,
  });

  const sandbox: SandboxInstance = {
    id, type: 'process', name: opts.name || `proc_${id}`,
    status: 'running', created: new Date().toISOString(), workDir,
    pid: child.pid, metadata: { command: opts.command, args: opts.args },
    installHistory: [], portMappings: {}, ttlMs: 0, lastActivity: Date.now(), envVars: opts.env || {},
  };

  childProcesses.set(id, child);
  child.on('exit', () => { sandbox.status = 'stopped'; });
  sandboxes.set(id, sandbox);
  return sandbox;
}

export function processExec(sandboxId: string, command: string, timeoutMs = 30000): ExecResult {
  const sb = sandboxes.get(sandboxId);
  if (!sb) throw new Error('Sandbox not found');
  touchSandbox(sandboxId);
  const start = Date.now();
  try {
    const stdout = shellExec(command, timeoutMs, sb.workDir);
    return { exitCode: 0, stdout, stderr: '', duration_ms: Date.now() - start };
  } catch (e: any) {
    return { exitCode: e.status || 1, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message, duration_ms: Date.now() - start };
  }
}

export function processDestroy(sandboxId: string): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb) return false;
  const child = childProcesses.get(sandboxId);
  if (child && !child.killed) { child.kill('SIGTERM'); setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 3000); }
  childProcesses.delete(sandboxId);
  sb.status = 'destroyed';
  try { fs.rmSync(sb.workDir, { recursive: true, force: true }); } catch {}
  sandboxes.delete(sandboxId);
  return true;
}

// ============================================================
// FALLBACK: V8 Isolate (Lightweight JS Sandbox)
// ============================================================

export function vmExecute(code: string, opts?: {
  timeoutMs?: number;
  globals?: Record<string, any>;
}): { success: boolean; result?: any; error?: string; duration_ms: number } {
  const start = Date.now();
  const timeout = opts?.timeoutMs || 5000;
  const sandbox: any = {
    console: { log: (...args: any[]) => { sandbox.__logs.push(args.map(String).join(' ')); } },
    Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite,
    Array, Object, String, Number, Boolean, Map, Set, RegExp, Error, Promise,
    setTimeout: (fn: Function, ms: number) => setTimeout(fn, Math.min(ms, timeout)),
    __logs: [] as string[], __result: undefined,
    ...(opts?.globals || {}),
  };
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  try {
    const result = vm.runInContext(code, context, { timeout, displayErrors: true, breakOnSigint: true });
    return { success: true, result: result ?? sandbox.__result, duration_ms: Date.now() - start };
  } catch (e: any) {
    return { success: false, error: e.message, duration_ms: Date.now() - start };
  }
}

// ============================================================
// FALLBACK: Directory Jail
// ============================================================

export function directoryCreate(opts?: { name?: string; copyFrom?: string }): SandboxInstance {
  const id = genId();
  const workDir = path.join(SANDBOX_BASE, id);
  fs.mkdirSync(workDir, { recursive: true });
  if (opts?.copyFrom && fs.existsSync(opts.copyFrom)) {
    const src = opts.copyFrom;
    if (fs.statSync(src).isDirectory()) {
      for (const entry of fs.readdirSync(src)) {
        if (['node_modules', '.git', 'dist', 'build'].includes(entry)) continue;
        try {
          const s = path.join(src, entry), d = path.join(workDir, entry);
          if (fs.statSync(s).isFile()) fs.copyFileSync(s, d);
          else fs.cpSync(s, d, { recursive: true });
        } catch {}
      }
    } else { fs.copyFileSync(src, path.join(workDir, path.basename(src))); }
  }
  const sandbox: SandboxInstance = {
    id, type: 'directory', name: opts?.name || `dir_${id}`,
    status: 'running', created: new Date().toISOString(), workDir,
    metadata: { sourceDir: opts?.copyFrom },
    installHistory: [], portMappings: {}, ttlMs: 0, lastActivity: Date.now(), envVars: {},
  };
  sandboxes.set(id, sandbox);
  return sandbox;
}

export function directoryExec(sandboxId: string, command: string, timeoutMs = 30000): ExecResult {
  return processExec(sandboxId, command, timeoutMs);
}

export function directoryWriteFile(sandboxId: string, relativePath: string, content: string): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb) return false;
  const fullPath = path.join(sb.workDir, relativePath);
  if (!fullPath.startsWith(sb.workDir)) return false;
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return true;
}

export function directoryReadFile(sandboxId: string, relativePath: string): string | null {
  const sb = sandboxes.get(sandboxId);
  if (!sb) return null;
  const fullPath = path.join(sb.workDir, relativePath);
  if (!fullPath.startsWith(sb.workDir)) return null;
  try { return fs.readFileSync(fullPath, 'utf-8'); } catch { return null; }
}

export function directoryListFiles(sandboxId: string, relativePath = '.'): string[] {
  const sb = sandboxes.get(sandboxId);
  if (!sb) return [];
  const fullPath = path.join(sb.workDir, relativePath);
  if (!fullPath.startsWith(sb.workDir)) return [];
  try { return fs.readdirSync(fullPath); } catch { return []; }
}

export function directoryGetSize(sandboxId: string): number {
  const sb = sandboxes.get(sandboxId);
  if (!sb) return 0;
  let totalSize = 0;
  const walk = (dir: string) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isFile()) totalSize += fs.statSync(p).size;
        else if (entry.isDirectory()) walk(p);
      }
    } catch {}
  };
  walk(sb.workDir);
  return totalSize;
}

export function directoryDestroy(sandboxId: string): boolean {
  const sb = sandboxes.get(sandboxId);
  if (!sb) return false;
  sb.status = 'destroyed';
  try { fs.rmSync(sb.workDir, { recursive: true, force: true }); } catch {}
  sandboxes.delete(sandboxId);
  return true;
}

// ============================================================
// PowerShell (Constrained Language Mode)
// ============================================================

export function powershellExec(command: string, opts?: {
  constrainedLanguage?: boolean;
  workDir?: string;
  timeoutMs?: number;
}): ExecResult {
  const start = Date.now();
  const cwd = opts?.workDir || os.tmpdir();
  const timeout = opts?.timeoutMs || 30000;
  let psCmd = '';
  if (opts?.constrainedLanguage) {
    psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'; ${command.replace(/"/g, '\\"')}"`;
  } else {
    psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`;
  }
  try {
    const stdout = execSync(psCmd, { encoding: 'utf-8', timeout, cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { exitCode: 0, stdout, stderr: '', duration_ms: Date.now() - start };
  } catch (e: any) {
    return { exitCode: e.status || 1, stdout: e.stdout?.toString().trim() || '', stderr: e.stderr?.toString().trim() || e.message, duration_ms: Date.now() - start };
  }
}

// ============================================================
// Unified API
// ============================================================

export function listSandboxes(): SandboxInstance[] {
  return Array.from(sandboxes.values());
}

export function getSandbox(id: string): SandboxInstance | undefined {
  return sandboxes.get(id);
}

export function destroyAllSandboxes(): number {
  let count = 0;
  for (const [id, sb] of sandboxes) {
    if (sb.type === 'docker') dockerDestroy(id);
    else if (sb.type === 'process') processDestroy(id);
    else if (sb.type === 'directory') directoryDestroy(id);
    count++;
  }
  return count;
}

export function getAvailableBackends(): {
  docker: boolean;
  docker_image: boolean;
  process: boolean;
  vm: boolean;
  directory: boolean;
  powershell: boolean;
} {
  const dockerUp = isDockerAvailable();
  return {
    docker: dockerUp,
    docker_image: dockerUp ? isDockerImageBuilt() : false,
    process: true,
    vm: true,
    directory: true,
    powershell: os.platform() === 'win32',
  };
}
