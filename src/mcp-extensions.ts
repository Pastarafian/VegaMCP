/**
 * VegaMCP — MCP Protocol Extensions
 * 
 * Implements MCP spec features:
 * 1. Sampling — request LLM completions from the host
 * 2. Completion — autocomplete for prompts/resources
 * 3. Structured Logging — proper MCP log notifications
 * 4. Progress Notifications — percentage updates for long ops
 * 5. Roots — file system scoping
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

// ═══════════════════════════════════════════════
// SINGLETON SERVER REFERENCE
// ═══════════════════════════════════════════════

let _server: Server | null = null;

export function setServerRef(s: Server): void {
  _server = s;
}

export function getServerRef(): Server | null {
  return _server;
}

// ═══════════════════════════════════════════════
// 1. SAMPLING — Request LLM from host
// ═══════════════════════════════════════════════

export interface SamplingOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  modelHints?: string[];
}

/**
 * Request an LLM completion from the host client via MCP sampling.
 * Falls back gracefully if the client doesn't support sampling.
 */
export async function requestSampling(
  userMessage: string,
  options: SamplingOptions = {}
): Promise<string | null> {
  const server = _server;
  if (!server) return null;

  try {
    const clientCaps = server.getClientCapabilities?.();
    if (!clientCaps?.sampling) {
      return null; // Client doesn't support sampling
    }

    const result = await server.createMessage({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: userMessage },
        },
      ],
      maxTokens: options.maxTokens || 1000,
      ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
      ...(options.modelHints ? {
        modelPreferences: {
          hints: options.modelHints.map(name => ({ name })),
        },
      } : {}),
    });

    // Extract text from the result
    if ('content' in result) {
      const content = result.content;
      if (typeof content === 'object' && 'type' in content && content.type === 'text') {
        return (content as any).text || null;
      }
      if (Array.isArray(content)) {
        return content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
      }
    }
    return null;
  } catch {
    return null; // Sampling not available or failed
  }
}

/**
 * Check if the connected client supports sampling.
 */
export function isSamplingAvailable(): boolean {
  const server = _server;
  if (!server) return false;
  try {
    const caps = server.getClientCapabilities?.();
    return !!caps?.sampling;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════
// 2. COMPLETION — Autocomplete arguments
// ═══════════════════════════════════════════════

export interface CompletionEntry {
  values: string[];
  total?: number;
  hasMore?: boolean;
}

/** Registry of completions for prompt arguments and resource URIs */
const promptCompletions: Map<string, Map<string, () => CompletionEntry>> = new Map();
const resourceCompletions: Map<string, () => CompletionEntry> = new Map();

export function registerPromptCompletion(
  promptName: string,
  argName: string,
  provider: () => CompletionEntry
): void {
  if (!promptCompletions.has(promptName)) {
    promptCompletions.set(promptName, new Map());
  }
  promptCompletions.get(promptName)!.set(argName, provider);
}

export function registerResourceCompletion(
  uriTemplate: string,
  provider: () => CompletionEntry
): void {
  resourceCompletions.set(uriTemplate, provider);
}

export function getPromptCompletions(promptName: string, argName: string, prefix: string): CompletionEntry {
  const promptMap = promptCompletions.get(promptName);
  if (!promptMap) return { values: [] };
  const provider = promptMap.get(argName);
  if (!provider) return { values: [] };
  const entry = provider();
  // Filter by prefix
  const filtered = entry.values.filter(v => v.toLowerCase().startsWith(prefix.toLowerCase()));
  return {
    values: filtered.slice(0, 100),
    total: filtered.length,
    hasMore: filtered.length > 100,
  };
}

export function getResourceCompletions(uriTemplate: string, prefix: string): CompletionEntry {
  const provider = resourceCompletions.get(uriTemplate);
  if (!provider) return { values: [] };
  const entry = provider();
  const filtered = entry.values.filter(v => v.toLowerCase().startsWith(prefix.toLowerCase()));
  return {
    values: filtered.slice(0, 100),
    total: filtered.length,
    hasMore: filtered.length > 100,
  };
}

// ═══════════════════════════════════════════════
// 3. STRUCTURED LOGGING
// ═══════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

/**
 * Send a structured log message via MCP protocol.
 * Falls back to console.error if not connected.
 */
export async function mcpLog(
  level: LogLevel,
  message: string,
  logger?: string,
  data?: unknown
): Promise<void> {
  const server = _server;
  if (server) {
    try {
      await server.sendLoggingMessage({
        level,
        logger: logger || 'vegamcp',
        data: data !== undefined ? data : message,
      });
      return;
    } catch {
      // Fall through to console
    }
  }
  // Fallback to console
  const prefix = logger ? `[${logger}]` : '[VegaMCP]';
  console.error(`${prefix} ${level.toUpperCase()}: ${message}`);
}

// ═══════════════════════════════════════════════
// 4. PROGRESS NOTIFICATIONS
// ═══════════════════════════════════════════════

/**
 * Create a progress reporter for a long-running operation.
 * Emits MCP progress notifications if the request included a progressToken.
 */
export function createProgressReporter(
  progressToken?: string | number,
  total?: number
): (current: number, message?: string) => void {
  const server = _server;
  if (!server || !progressToken) {
    return () => {}; // No-op if no token
  }

  return (current: number, message?: string) => {
    try {
      server.notification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: current,
          total: total || 100,
          ...(message ? { message } : {}),
        },
      } as any);
    } catch {
      // Silently fail — progress is optional
    }
  };
}

// ═══════════════════════════════════════════════
// 5. ROOTS — File system scoping
// ═══════════════════════════════════════════════

let cachedRoots: Array<{ uri: string; name?: string }> = [];

/**
 * Fetch roots from the client and cache them.
 */
export async function fetchRoots(): Promise<Array<{ uri: string; name?: string }>> {
  const server = _server;
  if (!server) return cachedRoots;

  try {
    const clientCaps = server.getClientCapabilities?.();
    if (!clientCaps?.roots) return cachedRoots;

    const result = await server.listRoots();
    cachedRoots = result.roots || [];
    return cachedRoots;
  } catch {
    return cachedRoots;
  }
}

/**
 * Get cached roots (non-async).
 */
export function getCachedRoots(): Array<{ uri: string; name?: string }> {
  return cachedRoots;
}

/**
 * Check if a path is within one of the declared roots.
 */
export function isPathWithinRoots(filePath: string): boolean {
  if (cachedRoots.length === 0) return true; // No roots = no restriction
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return cachedRoots.some(root => {
    const rootPath = root.uri.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/').toLowerCase();
    return normalized.startsWith(rootPath);
  });
}
