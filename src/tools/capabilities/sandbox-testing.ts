/**
 * VegaMCP — Sandbox Testing Tool (v4.0 — Docker-First, Full Lifecycle)
 * 
 * Docker-based sandboxing with specialized container profiles.
 * Fallbacks: V8 isolate, process sandbox, directory jail.
 * 
 * v4.0: Package install, snapshot, logs, stats, diff, Dockerfile gen,
 *       batch exec, pause/unpause/restart, port forwarding, env injection, TTL auto-cleanup.
 */

import path from 'path';
import {
  getAvailableBackends, listSandboxes, getSandbox, destroyAllSandboxes,
  isDockerAvailable, isDockerImageBuilt, dockerBuildImage,
  dockerCreate, dockerExec, dockerRunProfile, dockerCopyIn, dockerCopyOut,
  dockerDestroy, dockerHealth, dockerListContainers,
  dockerInstallPackages, dockerSnapshot, dockerLogs, dockerStats, dockerDiff,
  dockerPause, dockerUnpause, dockerRestart, dockerBatchExec,
  dockerSetEnv, dockerGetPorts, generateDockerfile,
  processCreate, processExec, processDestroy,
  vmExecute,
  directoryCreate, directoryExec, directoryWriteFile, directoryReadFile,
  directoryListFiles, directoryGetSize, directoryDestroy,
  powershellExec,
  DockerProfile,
} from './sandbox-manager.js';

export const sandboxTestingSchema = {
  name: 'sandbox_testing',
  description: `Docker-first sandbox manager with specialized container profiles. Primary: Docker containers with Xvfb virtual display, Python, Node.js, firejail sub-sandboxes, and Win32 API shims. Profiles: gui-test (visual/autoclicker testing), ocr-test (OCR pipeline), api-test (backend testing), security-test (secret scanning), general. Fallbacks: V8 isolate for JS eval, process sandbox, directory jail. Actions: status, create, exec, docker_run, docker_build, docker_copy, vm_run, ps_exec, write_file, read_file, list_files, destroy, destroy_all, list, install, snapshot, logs, stats, diff, dockerfile, batch_exec, pause, unpause, restart, set_env, ports.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'status', 'create', 'exec', 'docker_run', 'docker_build', 'docker_copy',
          'vm_run', 'ps_exec', 'write_file', 'read_file', 'list_files',
          'destroy', 'destroy_all', 'list',
          // v4.0 actions
          'install', 'snapshot', 'logs', 'stats', 'diff', 'dockerfile',
          'batch_exec', 'pause', 'unpause', 'restart', 'set_env', 'ports',
        ],
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
      // v4.0: Package installation
      packages: { type: 'array', items: { type: 'string' }, description: 'Packages to install (for install action)' },
      package_manager: { type: 'string', enum: ['apt', 'pip', 'npm', 'apk'], description: 'Package manager to use (default: apt)' },
      // v4.0: Snapshot
      snapshot_tag: { type: 'string', description: 'Tag for the snapshot image (for snapshot action)' },
      // v4.0: Logs
      tail: { type: 'number', description: 'Number of log lines to tail (default: 100)' },
      since: { type: 'string', description: 'Show logs since timestamp (e.g. "2024-01-01T00:00:00")' },
      // v4.0: Batch exec
      commands: { type: 'array', items: { type: 'string' }, description: 'Commands to execute sequentially (for batch_exec)' },
      // v4.0: Working directory for exec
      work_dir: { type: 'string', description: 'Working directory inside container for exec/batch_exec' },
      // v4.0: Environment variables
      env_vars: { type: 'object', description: 'Environment variables to set (for set_env and create)' },
      // v4.0: Ports
      ports: { type: 'object', description: 'Port mappings {hostPort: containerPort} (for create)' },
      // v4.0: TTL
      ttl_ms: { type: 'number', description: 'Auto-destroy after idle timeout in ms (0 = disabled, for create)' },
      // v4.0: Package cache
      enable_package_cache: { type: 'boolean', description: 'Mount package cache volumes for faster repeated installs (for create)', default: false },
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
        sandboxes: active.map(s => ({
          id: s.id, type: s.type, name: s.name, status: s.status,
          ttl_ms: s.ttlMs, ports: s.portMappings,
          packages_installed: s.installHistory.filter(h => h.exitCode === 0).reduce((n, h) => n + h.packages.length, 0),
        })),
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
            '📦 Package installation (apt/pip/npm/apk) with safety blocklist',
            '📸 Container snapshots (docker commit)',
            '🔌 Port forwarding for web app testing',
            '📋 Container logs (tail/since)',
            '📊 Resource monitoring (CPU/RAM/disk/network)',
            '🔍 Container diff (filesystem changes)',
            '🐳 Dockerfile generation from install history',
            '⏱️ Auto-cleanup TTL',
            '⏸️ Pause/unpause/restart lifecycle',
            '🚀 Batch exec (sequential commands)',
            '🔧 Post-create env var injection',
            '💾 Package cache volumes',
          ],
        },
        setup_hints: {
          ...(!backends.docker ? { docker: 'Install Docker Desktop from https://docker.com' } : {}),
          ...(!backends.docker_image && backends.docker ? { build: 'Use action "docker_build" or run: docker build -t vega-sandbox:latest docker_sandbox/' } : {}),
        },
        ai_hint: backends.docker && backends.docker_image
          ? 'Docker sandbox v4.0 ready. New actions: install (packages), snapshot, logs, stats, diff, dockerfile, batch_exec, pause/unpause/restart, set_env, ports.'
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
            env: args.env_vars,
            ports: args.ports,
            ttlMs: args.ttl_ms,
            enablePackageCache: args.enable_package_cache,
          });
          return ok({
            action: 'create', sandbox_id: sb.id, type: 'docker',
            container_name: sb.metadata.containerName,
            container_id: sb.metadata.containerId,
            profile: sb.metadata.profile,
            port_mappings: sb.portMappings,
            ttl_ms: sb.ttlMs,
            package_cache: sb.metadata.enablePackageCache,
            status: 'running',
            ai_hint: `Docker sandbox '${sb.metadata.containerName}' running. Use 'install' to add packages (apt/pip/npm), 'exec' to run commands, 'snapshot' to save state, 'destroy' to clean up.${sb.ttlMs > 0 ? ` Auto-cleanup after ${sb.ttlMs / 1000}s idle.` : ''}`,
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
      if (sb.type === 'docker') result = dockerExec(args.sandbox_id, args.command, args.timeout_ms || 30000, args.work_dir);
      else if (sb.type === 'process') result = processExec(args.sandbox_id, args.command, args.timeout_ms || 30000);
      else if (sb.type === 'directory') result = directoryExec(args.sandbox_id, args.command, args.timeout_ms || 30000);
      else return fail('WRONG_TYPE', 'Use vm_run for VM sandbox');

      return ok({
        action: 'exec', sandbox_id: args.sandbox_id, type: sb.type,
        command: args.command, ...result,
        ai_hint: result.exitCode === 0 ? 'Command succeeded.' : `Failed with exit code ${result.exitCode}`,
      });
    }

    // ── v4.0: Install packages ─────────────────────────────────
    case 'install': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      if (!args.packages || !Array.isArray(args.packages) || args.packages.length === 0)
        return fail('MISSING_PARAM', 'packages array required (e.g. ["ffmpeg", "curl"])');

      const sb = getSandbox(args.sandbox_id);
      if (!sb) return fail('NOT_FOUND', `Sandbox ${args.sandbox_id} not found`);
      if (sb.type !== 'docker') return fail('DOCKER_ONLY', 'Package installation is only supported in Docker sandboxes');

      try {
        const result = dockerInstallPackages(
          args.sandbox_id, args.packages,
          args.package_manager || 'apt',
          args.timeout_ms || 120000
        );
        const { blocked, ...execResult } = result;
        return ok({
          action: 'install',
          sandbox_id: args.sandbox_id,
          package_manager: args.package_manager || 'apt',
          requested: args.packages,
          installed: args.packages.filter((p: string) => !blocked.includes(p)),
          blocked,
          ...execResult,
          total_installed: sb.installHistory.filter(h => h.exitCode === 0).reduce((n, h) => n + h.packages.length, 0),
          ai_hint: execResult.exitCode === 0
            ? `${args.packages.length - blocked.length} package(s) installed successfully.${blocked.length > 0 ? ` ${blocked.length} blocked for safety.` : ''} Use 'dockerfile' to generate a reusable Dockerfile, or 'snapshot' to save the state.`
            : `Installation failed. ${blocked.length > 0 ? `Blocked: ${blocked.join(', ')}. ` : ''}Check stderr for details.`,
        });
      } catch (e: any) {
        return fail('INSTALL_ERROR', e.message);
      }
    }

    // ── v4.0: Snapshot container ────────────────────────────────
    case 'snapshot': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const result = dockerSnapshot(args.sandbox_id, args.snapshot_tag);
      if (result.success) {
        return ok({
          action: 'snapshot', sandbox_id: args.sandbox_id,
          image: result.image,
          ai_hint: `Container state saved as '${result.image}'. You can use this image to create new sandboxes with the same packages and state.`,
        });
      }
      return fail('SNAPSHOT_FAILED', result.error || 'Unknown error');
    }

    // ── v4.0: Container logs ───────────────────────────────────
    case 'logs': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      try {
        const result = dockerLogs(args.sandbox_id, args.tail || 100, args.since);
        return ok({ action: 'logs', sandbox_id: args.sandbox_id, ...result });
      } catch (e: any) {
        return fail('LOGS_ERROR', e.message);
      }
    }

    // ── v4.0: Resource stats ───────────────────────────────────
    case 'stats': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const stats = dockerStats(args.sandbox_id);
      if (!stats) return fail('STATS_ERROR', 'Could not retrieve stats (container may not be running)');
      return ok({
        action: 'stats', sandbox_id: args.sandbox_id,
        resources: stats,
        ai_hint: `CPU: ${stats.cpu_percent}, Memory: ${stats.memory_usage}/${stats.memory_limit} (${stats.memory_percent}), PIDs: ${stats.pids}`,
      });
    }

    // ── v4.0: Container diff ───────────────────────────────────
    case 'diff': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const diff = dockerDiff(args.sandbox_id);
      if (!diff) return fail('DIFF_ERROR', 'Could not retrieve diff');
      return ok({
        action: 'diff', sandbox_id: args.sandbox_id,
        added: diff.added.length,
        changed: diff.changed.length,
        deleted: diff.deleted.length,
        files: {
          added: diff.added.slice(0, 50),
          changed: diff.changed.slice(0, 50),
          deleted: diff.deleted.slice(0, 50),
        },
        truncated: diff.added.length > 50 || diff.changed.length > 50 || diff.deleted.length > 50,
        ai_hint: `${diff.added.length} added, ${diff.changed.length} changed, ${diff.deleted.length} deleted files since container creation.`,
      });
    }

    // ── v4.0: Generate Dockerfile ──────────────────────────────
    case 'dockerfile': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const dockerfile = generateDockerfile(args.sandbox_id);
      return ok({
        action: 'dockerfile', sandbox_id: args.sandbox_id,
        dockerfile,
        ai_hint: 'Dockerfile generated from install history. Save this to a file and use docker_build to create a reusable image.',
      });
    }

    // ── v4.0: Batch exec ───────────────────────────────────────
    case 'batch_exec': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      if (!args.commands || !Array.isArray(args.commands) || args.commands.length === 0)
        return fail('MISSING_PARAM', 'commands array required');

      const sb = getSandbox(args.sandbox_id);
      if (!sb) return fail('NOT_FOUND', `Sandbox ${args.sandbox_id} not found`);
      if (sb.type !== 'docker') return fail('DOCKER_ONLY', 'Batch exec is only supported in Docker sandboxes');

      const results = dockerBatchExec(args.sandbox_id, args.commands, args.timeout_ms || 30000, args.work_dir);
      const allPassed = results.every(r => r.exitCode === 0);
      return ok({
        action: 'batch_exec', sandbox_id: args.sandbox_id,
        total_commands: args.commands.length,
        executed: results.length,
        all_passed: allPassed,
        results,
        ai_hint: allPassed
          ? `All ${results.length} commands succeeded.`
          : `Stopped at command ${results.length}/${args.commands.length} (exit code ${results[results.length - 1]?.exitCode}).`,
      });
    }

    // ── v4.0: Pause ────────────────────────────────────────────
    case 'pause': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const success = dockerPause(args.sandbox_id);
      return success
        ? ok({ action: 'pause', sandbox_id: args.sandbox_id, status: 'paused', ai_hint: 'Container paused. All processes frozen. Use "unpause" to resume.' })
        : fail('PAUSE_FAILED', 'Could not pause (not running or not a Docker sandbox)');
    }

    // ── v4.0: Unpause ──────────────────────────────────────────
    case 'unpause': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const success = dockerUnpause(args.sandbox_id);
      return success
        ? ok({ action: 'unpause', sandbox_id: args.sandbox_id, status: 'running', ai_hint: 'Container resumed.' })
        : fail('UNPAUSE_FAILED', 'Could not unpause (not paused or not a Docker sandbox)');
    }

    // ── v4.0: Restart ──────────────────────────────────────────
    case 'restart': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const success = dockerRestart(args.sandbox_id);
      return success
        ? ok({ action: 'restart', sandbox_id: args.sandbox_id, status: 'running', ai_hint: 'Container restarted. All processes re-initialized.' })
        : fail('RESTART_FAILED', 'Could not restart');
    }

    // ── v4.0: Set environment variables ────────────────────────
    case 'set_env': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      if (!args.env_vars || typeof args.env_vars !== 'object')
        return fail('MISSING_PARAM', 'env_vars object required (e.g. {"NODE_ENV": "production"})');
      const success = dockerSetEnv(args.sandbox_id, args.env_vars);
      return success
        ? ok({
            action: 'set_env', sandbox_id: args.sandbox_id,
            variables: Object.keys(args.env_vars),
            ai_hint: `${Object.keys(args.env_vars).length} environment variable(s) set. Available in subsequent exec commands.`,
          })
        : fail('SET_ENV_FAILED', 'Could not set environment variables');
    }

    // ── v4.0: Port mappings ────────────────────────────────────
    case 'ports': {
      if (!args.sandbox_id) return fail('MISSING_PARAM', 'sandbox_id required');
      const ports = dockerGetPorts(args.sandbox_id);
      const sb = getSandbox(args.sandbox_id);
      return ok({
        action: 'ports', sandbox_id: args.sandbox_id,
        configured_mappings: sb?.portMappings || {},
        active_ports: ports,
        ai_hint: ports && Object.keys(ports).length > 0
          ? `Active port mappings: ${Object.entries(ports).map(([c, h]) => `${c} → ${h}`).join(', ')}`
          : 'No active port mappings. Use "create" with ports parameter to expose ports.',
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
        sandboxes: all.map(s => ({
          id: s.id, type: s.type, name: s.name, status: s.status,
          work_dir: s.workDir, created: s.created,
          ports: s.portMappings, ttl_ms: s.ttlMs,
          packages_installed: s.installHistory.filter(h => h.exitCode === 0).reduce((n, h) => n + h.packages.length, 0),
          install_history: s.installHistory,
        })),
      });
    }

    default:
      return fail('UNKNOWN_ACTION', `Unknown: ${args.action}. Available: status, create, exec, install, snapshot, logs, stats, diff, dockerfile, batch_exec, pause, unpause, restart, set_env, ports, docker_run, docker_build, docker_copy, vm_run, ps_exec, write_file, read_file, list_files, destroy, destroy_all, list`);
  }
}
