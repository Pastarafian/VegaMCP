/**
 * VegaMCP — Path Guard
 * Prevents path traversal attacks using canonical path resolution.
 */

import path from 'node:path';
import fs from 'node:fs';

const BLOCKED_SEGMENTS = [
  '.env',
  '.git',
  '.ssh',
  '.gnupg',
  'node_modules/.cache',
  '.npmrc',
  '.yarnrc',
];

/**
 * Validate that a file path is safe to access within the workspace.
 * Uses canonical path resolution to prevent traversal attacks.
 */
export function isPathSafe(inputPath: string, workspaceRoot: string): { safe: boolean; reason?: string; resolved?: string } {
  try {
    // Normalize workspace root
    const normalizedRoot = path.resolve(workspaceRoot).replace(/\\/g, '/');

    // Resolve the input path against the workspace root
    const resolved = path.resolve(workspaceRoot, inputPath).replace(/\\/g, '/');

    // Check if path is within workspace (string prefix check after normalization)
    if (!resolved.startsWith(normalizedRoot)) {
      return { safe: false, reason: `Path escapes workspace root: resolved to ${resolved}` };
    }

    // Check for blocked segments
    const relativePath = resolved.slice(normalizedRoot.length).toLowerCase();
    for (const blocked of BLOCKED_SEGMENTS) {
      if (relativePath.includes(blocked.toLowerCase())) {
        return { safe: false, reason: `Path contains blocked segment: ${blocked}` };
      }
    }

    // If the path exists, resolve symlinks and re-check
    if (fs.existsSync(resolved)) {
      try {
        const realPath = fs.realpathSync(resolved).replace(/\\/g, '/');
        if (!realPath.startsWith(normalizedRoot)) {
          return { safe: false, reason: `Symlink resolves outside workspace: ${realPath}` };
        }
      } catch {
        // realpathSync can fail for various reasons; treat as unsafe
        return { safe: false, reason: 'Could not resolve real path (possible symlink issue)' };
      }
    }

    return { safe: true, resolved };
  } catch (err: any) {
    return { safe: false, reason: `Path validation error: ${err.message}` };
  }
}

/**
 * Validate a URL for browser navigation.
 */
export function isUrlAllowed(url: string, allowExternal: boolean): { allowed: boolean; reason?: string } {
  try {
    const parsed = new URL(url);

    // Always block file:// protocol
    if (parsed.protocol === 'file:') {
      return { allowed: false, reason: 'file:// protocol is blocked for security' };
    }

    // Block data: protocol
    if (parsed.protocol === 'data:') {
      return { allowed: false, reason: 'data: protocol is blocked for security' };
    }

    // Block javascript: protocol
    if (parsed.protocol === 'javascript:') {
      return { allowed: false, reason: 'javascript: protocol is blocked for security' };
    }

    // Always allow localhost variants
    const localhosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    if (localhosts.includes(parsed.hostname)) {
      return { allowed: true };
    }

    // External URLs require explicit opt-in
    if (!allowExternal) {
      return { allowed: false, reason: `External URL blocked. Only localhost URLs are allowed. Set BROWSER_ALLOW_EXTERNAL=true to enable.` };
    }

    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'Invalid URL format' };
  }
}
