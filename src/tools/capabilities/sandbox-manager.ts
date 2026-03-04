/**
 * VegaMCP — Sandbox Manager (v3.0 — Docker-First)
 * 
 * Docker-based sandboxing with specialized containers for each use case.
 * 
 * Primary:   Docker Container — Full Linux sandbox with Xvfb, Python, Node, firejail, Win32 shims
 * Fallback:  V8 Isolate       — Lightweight JS sandbox (no Docker needed)
 *            Directory Jail   — Temp filesystem sandbox
 *            Process Sandbox  — Isolated child process
 *            PowerShell       — Constrained Language Mode execution
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
  status: 'creating' | 'running' | 'stopped' | 'destroyed';
  created: string;
  workDir: string;
  pid?: number;
  metadata: Record<string, any>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export type DockerProfile = 'gui-test' | 'ocr-test' | 'api-test' | 'security-test' | 'general';

// ============================================================
// Sandbox Registry
// ============================================================
const sandboxes = new Map<string, SandboxInstance>();
const childProcesses = new Map<string, ChildProcess>();
const SANDBOX_BASE = path.join(os.tmpdir(), 'vegamcp_sandboxes');
if (!fs.existsSync(SANDBOX_BASE)) fs.mkdirSync(SANDBOX_BASE, { recursive: true });

const DOCKER_IMAGE = 'vega-sandbox:latest';

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

  const cmd = `docker run -d --rm ${networkFlag} ${resourceArgs} --name ${containerName} ${volumeArgs} ${envArgs} ${DOCKER_IMAGE} shell`;

  try {
    const containerId = execSync(cmd, {
      encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const sandbox: SandboxInstance = {
      id, type: 'docker', name: opts.name || containerName,
      status: 'running', created: new Date().toISOString(),
      workDir: '/sandbox/workspaces/current',
      metadata: { containerName, containerId: containerId.substring(0, 12), profile, volumes: opts.volumes || [] },
    };
    sandboxes.set(id, sandbox);
    return sandbox;
  } catch (e: any) {
    throw new Error(`Docker create failed: ${e.message}`);
  }
}

export function dockerExec(sandboxId: string, command: string, timeoutMs = 30000): ExecResult {
  const sb = sandboxes.get(sandboxId);
  if (!sb || sb.type !== 'docker') throw new Error('Not a Docker sandbox');
  const { containerName } = sb.metadata;
  const start = Date.now();

  try {
    const stdout = execSync(
      `docker exec ${containerName} bash -c "${command.replace(/"/g, '\\"')}"`,
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
  };

  childProcesses.set(id, child);
  child.on('exit', () => { sandbox.status = 'stopped'; });
  sandboxes.set(id, sandbox);
  return sandbox;
}

export function processExec(sandboxId: string, command: string, timeoutMs = 30000): ExecResult {
  const sb = sandboxes.get(sandboxId);
  if (!sb) throw new Error('Sandbox not found');
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
