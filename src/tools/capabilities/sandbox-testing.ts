/**
 * VegaMCP — Sandbox Testing Tool (v3.0 — Docker-First)
 * 
 * Docker-based sandboxing with specialized container profiles.
 * Fallbacks: V8 isolate, process sandbox, directory jail.
 */

import path from 'path';
import {
  getAvailableBackends, listSandboxes, getSandbox, destroyAllSandboxes,
  isDockerAvailable, isDockerImageBuilt, dockerBuildImage,
  dockerCreate, dockerExec, dockerRunProfile, dockerCopyIn, dockerCopyOut,
  dockerDestroy, dockerHealth, dockerListContainers,
  processCreate, processExec, processDestroy,
  vmExecute,
  directoryCreate, directoryExec, directoryWriteFile, directoryReadFile,
  directoryListFiles, directoryGetSize, directoryDestroy,
  powershellExec,
  DockerProfile,
} from './sandbox-manager.js';

export const sandboxTestingSchema = {
  name: 'sandbox_testing',
  description: `Docker-first sandbox manager with specialized container profiles. Primary: Docker containers with Xvfb virtual display, Python, Node.js, firejail sub-sandboxes, and Win32 API shims. Profiles: gui-test (visual/autoclicker testing), ocr-test (OCR pipeline), api-test (backend testing), security-test (secret scanning), general. Fallbacks: V8 isolate for JS eval, process sandbox, directory jail. Actions: status, create, exec, docker_run, docker_build, docker_copy, vm_run, ps_exec, write_file, read_file, list_files, destroy, destroy_all, list.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'create', 'exec', 'docker_run', 'docker_build', 'docker_copy', 'vm_run', 'ps_exec', 'write_file', 'read_file', 'list_files', 'destroy', 'destroy_all', 'list'],
        description: 'Sandbox action',
      },
      sandbox_id: { type: 'string', description: 'Sandbox instance ID' },
      // Docker options
      backend: { type: 'string', enum: ['docker', 'process', 'directory'], description: 'Sandbox backend (default: docker)' },
      profile: { type: 'string', enum: ['gui-test', 'ocr-test', 'api-test', 'security-test', 'general'], description: 'Docker sandbox profile' },
      volumes: { type: 'array', items: { type: 'string' }, description: 'Docker volume mounts (host:container:mode)' },
      network: { type: 'boolean', description: 'Enable network in Docker (default: false)', default: false },
      // Docker copy
      host_path: { type: 'string', description: 'Host path for docker_copy' },
      container_path: { type: 'string', description: 'Container path for docker_copy' },
      direction: { type: 'string', enum: ['in', 'out'], description: 'Copy direction (in=host→container, out=container→host)' },
      // Docker build
      dockerfile_dir: { type: 'string', description: 'Directory containing Dockerfile for docker_build' },
      // Exec
      command: { type: 'string', description: 'Command to execute' },
      code: { type: 'string', description: 'JavaScript code for vm_run' },
      timeout_ms: { type: 'number', description: 'Execution timeout', default: 30000 },
      constrained: { type: 'boolean', description: 'PowerShell Constrained Language Mode', default: false },
      // File operations
      file_path: { type: 'string', description: 'Relative path within sandbox' },
      file_content: { type: 'string', description: 'Content to write' },
      // Process sandbox
      name: { type: 'string', description: 'Human-readable name' },
      process_command: { type: 'string', description: 'Command for process sandbox' },
      process_args: { type: 'array', items: { type: 'string' }, description: 'Args for process sandbox' },
      copy_from: { type: 'string', description: 'Source dir for directory jail' },
    },
    required: ['action'],
  },
};

function ok(d: any) { return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...d }, null, 2) }] }; }
function fail(c: string, m: string) { return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: c, message: m } }) }] }; }

export async function handleSandboxTesting(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> {
  switch (args.action) {

    // ── Status ──────────────────────────────────────────────────
    case 'status': {
      const backends = getAvailableBackends();
      const active = listSandboxes();
      const runningContainers = backends.docker ? dockerListContainers() : [];
      return ok({
        action: 'status',
        backends,
        active_sandboxes: active.length,
        sandboxes: active.map(s => ({ id: s.id, type: s.type, name: s.name, status: s.status })),
        docker: {
          available: backends.docker,
          image_built: backends.docker_image,
          image_name: 'vega-sandbox:latest',
          running_containers: runningContainers,
          profiles: ['gui-test', 'ocr-test', 'api-test', 'security-test', 'general'],
          features: [
            'Xvfb virtual display (1920x1080)',
            'Python 3 + OpenCV + NumPy + Pillow + PyAutoGUI',
            'Node.js 20 LTS',
            'Win32 API shims (win32gui, win32api, ctypes.windll)',
            'Firejail nested isolation',
            'Resource limits (CPU/RAM)',
            'Network isolation by default',
          ],
        },
        setup_hints: {
          ...(!backends.docker ? { docker: 'Install Docker Desktop from https://docker.com' } : {}),
          ...(!backends.docker_image && backends.docker ? { build: 'Use action "docker_build" or run: docker build -t vega-sandbox:latest docker_sandbox/' } : {}),
        },
        ai_hint: backends.docker && backends.docker_image
          ? 'Docker sandbox ready. Use "docker_run" for one-shot profile execution or "create" for persistent containers.'
          : backends.docker
            ? 'Docker available but image not built. Use "docker_build" first.'
            : 'Docker not available. Use "create" with backend "process" or "directory" as fallback.',
      });
    }

    // ── Create sandbox ──────────────────────────────────────────
    case 'create': {
      const backend = args.backend || 'docker';

      if (backend === 'docker') {
        if (!isDockerAvailable()) return fail('DOCKER_UNAVAILABLE', 'Docker is not running. Start Docker Desktop.');
        if (!isDockerImageBuilt()) return fail('IMAGE_NOT_BUILT', 'Run action "docker_build" first, or: docker build -t vega-sandbox:latest docker_sandbox/');

        try {
          const sb = dockerCreate({
            name: args.name,
            profile: args.profile || 'general',
            volumes: args.volumes,
            network: args.network,
          });
          return ok({
            action: 'create', sandbox_id: sb.id, type: 'docker',
            container_name: sb.metadata.containerName,
            container_id: sb.metadata.containerId,
            profile: sb.metadata.profile,
            status: 'running',
            ai_hint: `Docker sandbox '${sb.metadata.containerName}' running. Virtual display :99 active. Win32 shims available. Use 'exec' to run commands, 'docker_copy' to transfer files, 'destroy' to clean up.`,
          });
        } catch (e: any) {
          return fail('DOCKER_ERROR', e.message);
        }
      }

      if (backend === 'process') {
        if (!args.process_command) return fail('MISSING_PARAM', 'process_command required');
        const sb = processCreate({ name: args.name, command: args.process_command, args: args.process_args, timeoutMs: args.timeout_ms });
        return ok({
          action: 'create', sandbox_id: sb.id, type: 'process',
          name: sb.name, pid: sb.pid, status: 'running', work_dir: sb.workDir,
          ai_hint: `Process sandbox started (PID ${sb.pid}). Use 'exec' to run commands.`,
        });
      }

      if (backend === 'directory') {
        const sb = directoryCreate({ name: args.name, copyFrom: args.copy_from });
        return ok({
          action: 'create', sandbox_id: sb.id, type: 'directory',
          name: sb.name, status: 'running', work_dir: sb.workDir,
          files: directoryListFiles(sb.id),
          ai_hint: `Directory jail at ${sb.workDir}. Use write_file/read_file/exec.`,
        });
      }

      return fail('UNKNOWN_BACKEND', `Unknown: ${backend}. Options: docker, process, directory`);
    }

    // ── Execute command in sandbox ──────────────────────────────
    case 'exec': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      if (!args.command) return fail('MISSING_PARAM', 'command required');
      const sb = getSandbox(args.sandbox_id);
      if (!sb) return fail('NOT_FOUND', `Sandbox ${args.sandbox_id} not found`);

      let result;
      if (sb.type === 'docker') result = dockerExec(args.sandbox_id, args.command, args.timeout_ms || 30000);
      else if (sb.type === 'process') result = processExec(args.sandbox_id, args.command, args.timeout_ms || 30000);
      else if (sb.type === 'directory') result = directoryExec(args.sandbox_id, args.command, args.timeout_ms || 30000);
      else return fail('WRONG_TYPE', 'Use vm_run for VM sandbox');

      return ok({
        action: 'exec', sandbox_id: args.sandbox_id, type: sb.type,
        command: args.command, ...result,
        ai_hint: result.exitCode === 0 ? 'Command succeeded.' : `Failed with exit code ${result.exitCode}`,
      });
    }

    // ── Docker one-shot profile run ─────────────────────────────
    case 'docker_run': {
      if (!isDockerAvailable()) return fail('DOCKER_UNAVAILABLE', 'Docker not running.');
      if (!isDockerImageBuilt()) return fail('IMAGE_NOT_BUILT', 'Use "docker_build" first.');
      const profile = (args.profile || 'gui-test') as DockerProfile;
      const result = dockerRunProfile(profile, {
        volumes: args.volumes,
        network: args.network,
        command: args.command,
        timeoutMs: args.timeout_ms || 120000,
      });
      return ok({
        action: 'docker_run', profile, ...result,
        ai_hint: result.exitCode === 0
          ? `Profile '${profile}' completed successfully. Container auto-removed.`
          : `Profile '${profile}' finished with exit code ${result.exitCode}.`,
      });
    }

    // ── Docker build ────────────────────────────────────────────
    case 'docker_build': {
      if (!isDockerAvailable()) return fail('DOCKER_UNAVAILABLE', 'Docker not running.');
      const dir = args.dockerfile_dir || 'docker_sandbox';
      const result = dockerBuildImage(dir);
      return ok({
        action: 'docker_build', ...result,
        image: 'vega-sandbox:latest',
        ai_hint: result.exitCode === 0 ? 'Image built successfully. Ready for sandbox creation.' : 'Build failed. Check stderr.',
      });
    }

    // ── Docker file copy ────────────────────────────────────────
    case 'docker_copy': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      if (!args.host_path || !args.container_path) return fail('MISSING_PARAM', 'host_path and container_path required');
      const direction = args.direction || 'in';
      let success: boolean;
      if (direction === 'in') success = dockerCopyIn(args.sandbox_id, args.host_path, args.container_path);
      else success = dockerCopyOut(args.sandbox_id, args.container_path, args.host_path);
      return ok({ action: 'docker_copy', direction, success });
    }

    // ── V8 isolate ──────────────────────────────────────────────
    case 'vm_run': {
      if (!args.code) return fail('MISSING_PARAM', 'code required');
      const result = vmExecute(args.code, { timeoutMs: args.timeout_ms || 5000 });
      return ok({
        action: 'vm_run', ...result,
        ai_hint: result.success ? 'Code executed in V8 isolate.' : `Failed: ${result.error}`,
      });
    }

    // ── PowerShell ──────────────────────────────────────────────
    case 'ps_exec': {
      if (!args.command) return fail('MISSING_PARAM', 'command required');
      const result = powershellExec(args.command, {
        constrainedLanguage: args.constrained,
        workDir: args.sandbox_id ? getSandbox(args.sandbox_id)?.workDir : undefined,
        timeoutMs: args.timeout_ms || 30000,
      });
      return ok({ action: 'ps_exec', command: args.command, constrained_mode: args.constrained || false, ...result });
    }

    // ── File operations ─────────────────────────────────────────
    case 'write_file': {
      if (!args.sandbox_id || !args.file_path || !args.file_content) return fail('MISSING_PARAM', 'sandbox_id, file_path, file_content required');
      return ok({ action: 'write_file', success: directoryWriteFile(args.sandbox_id, args.file_path, args.file_content), file_path: args.file_path });
    }

    case 'read_file': {
      if (!args.sandbox_id || !args.file_path) return fail('MISSING_PARAM', 'sandbox_id, file_path required');
      const content = directoryReadFile(args.sandbox_id, args.file_path);
      return ok({ action: 'read_file', file_path: args.file_path, exists: content !== null, content });
    }

    case 'list_files': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const files = directoryListFiles(args.sandbox_id, args.file_path || '.');
      const sizeMb = +(directoryGetSize(args.sandbox_id) / 1048576).toFixed(2);
      return ok({ action: 'list_files', sandbox_id: args.sandbox_id, files, total_size_mb: sizeMb });
    }

    // ── Destroy ─────────────────────────────────────────────────
    case 'destroy': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const sb = getSandbox(args.sandbox_id);
      if (!sb) return fail('NOT_FOUND', `Sandbox ${args.sandbox_id} not found`);
      if (sb.type === 'docker') dockerDestroy(args.sandbox_id);
      else if (sb.type === 'process') processDestroy(args.sandbox_id);
      else if (sb.type === 'directory') directoryDestroy(args.sandbox_id);
      return ok({ action: 'destroy', sandbox_id: args.sandbox_id, status: 'destroyed' });
    }

    case 'destroy_all': {
      const count = destroyAllSandboxes();
      return ok({ action: 'destroy_all', destroyed: count });
    }

    case 'list': {
      const all = listSandboxes();
      return ok({
        action: 'list', count: all.length,
        sandboxes: all.map(s => ({ id: s.id, type: s.type, name: s.name, status: s.status, work_dir: s.workDir, created: s.created })),
      });
    }

    default:
      return fail('UNKNOWN_ACTION', `Unknown: ${args.action}`);
  }
}
