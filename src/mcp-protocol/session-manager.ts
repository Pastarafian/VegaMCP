/**
 * VegaMCP — Session Manager (MCP 2025-03-26)
 * Session resumability with Mcp-Session-Id tracking.
 * Stores undelivered messages for redelivery on reconnect.
 */

export interface MCPSession {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  userId?: string;
  state: Record<string, any>;
  pendingMessages: any[];
  expiresAt: number;
}

const sessions = new Map<string, MCPSession>();
const SESSION_TTL = 30 * 60 * 1000;  // 30 minutes
const MAX_PENDING = 100;

function genSessionId(): string {
  // Cryptographically-inspired random ID
  const parts = [];
  for (let i = 0; i < 4; i++) {
    parts.push(Math.random().toString(36).slice(2, 8));
  }
  return parts.join('-');
}

/**
 * Create a new session
 */
export function createSession(userId?: string): MCPSession {
  const id = genSessionId();
  const now = Date.now();
  const session: MCPSession = {
    id,
    createdAt: now,
    lastActiveAt: now,
    userId,
    state: {},
    pendingMessages: [],
    expiresAt: now + SESSION_TTL,
  };
  sessions.set(id, session);
  return session;
}

/**
 * Get an existing session
 */
export function getSession(sessionId: string): MCPSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  session.lastActiveAt = Date.now();
  session.expiresAt = Date.now() + SESSION_TTL;
  return session;
}

/**
 * Store state in session
 */
export function setSessionState(sessionId: string, key: string, value: any): void {
  const session = getSession(sessionId);
  if (session) session.state[key] = value;
}

/**
 * Get state from session
 */
export function getSessionState(sessionId: string, key: string): any {
  const session = getSession(sessionId);
  return session?.state[key];
}

/**
 * Queue a message for a session (for redelivery on reconnect)
 */
export function queueMessage(sessionId: string, message: any): void {
  const session = getSession(sessionId);
  if (!session) return;
  session.pendingMessages.push({ message, queuedAt: Date.now() });
  while (session.pendingMessages.length > MAX_PENDING) {
    session.pendingMessages.shift();
  }
}

/**
 * Drain pending messages (on reconnect)
 */
export function drainMessages(sessionId: string): any[] {
  const session = getSession(sessionId);
  if (!session) return [];
  const messages = session.pendingMessages.map(p => p.message);
  session.pendingMessages = [];
  return messages;
}

/**
 * Destroy a session
 */
export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Clean up expired sessions
 */
export function cleanupSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * Get session metrics
 */
export function getSessionMetrics(): {
  activeSessions: number;
  totalPendingMessages: number;
  oldestSession: number;
} {
  let totalPending = 0;
  let oldest = Date.now();
  for (const session of sessions.values()) {
    totalPending += session.pendingMessages.length;
    if (session.createdAt < oldest) oldest = session.createdAt;
  }
  return {
    activeSessions: sessions.size,
    totalPendingMessages: totalPending,
    oldestSession: sessions.size > 0 ? Date.now() - oldest : 0,
  };
}

// ── Tool Schema & Handler ──
export const sessionSchema = {
  name: 'session_manager',
  description: 'Manage MCP sessions for connection resumability. Create, inspect, and clean up sessions. Sessions store state and queue messages for redelivery on reconnect.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create', 'get', 'set_state', 'get_state', 'drain', 'destroy', 'cleanup', 'metrics'] },
      session_id: { type: 'string' },
      key: { type: 'string', description: 'State key (for set_state/get_state)' },
      value: { type: 'string', description: 'State value as JSON (for set_state)' },
      user_id: { type: 'string', description: 'User ID (for create)' },
    },
    required: ['action'],
  },
};

export function handleSession(args: any): string {
  try {
    switch (args.action) {
      case 'create': {
        const session = createSession(args.user_id);
        return JSON.stringify({ success: true, sessionId: session.id, expiresAt: new Date(session.expiresAt).toISOString() });
      }
      case 'get': {
        if (!args.session_id) return JSON.stringify({ success: false, error: 'session_id required' });
        const session = getSession(args.session_id);
        if (!session) return JSON.stringify({ success: false, error: 'Session not found or expired' });
        return JSON.stringify({ success: true, session: { id: session.id, userId: session.userId, stateKeys: Object.keys(session.state), pendingMessages: session.pendingMessages.length, expiresAt: new Date(session.expiresAt).toISOString() }});
      }
      case 'set_state': {
        if (!args.session_id || !args.key) return JSON.stringify({ success: false, error: 'session_id and key required' });
        const val = args.value ? JSON.parse(args.value) : null;
        setSessionState(args.session_id, args.key, val);
        return JSON.stringify({ success: true, key: args.key });
      }
      case 'get_state': {
        if (!args.session_id || !args.key) return JSON.stringify({ success: false, error: 'session_id and key required' });
        return JSON.stringify({ success: true, value: getSessionState(args.session_id, args.key) });
      }
      case 'drain': {
        if (!args.session_id) return JSON.stringify({ success: false, error: 'session_id required' });
        const msgs = drainMessages(args.session_id);
        return JSON.stringify({ success: true, messages: msgs, count: msgs.length });
      }
      case 'destroy': {
        if (!args.session_id) return JSON.stringify({ success: false, error: 'session_id required' });
        destroySession(args.session_id);
        return JSON.stringify({ success: true, message: 'Session destroyed' });
      }
      case 'cleanup': {
        const cleaned = cleanupSessions();
        return JSON.stringify({ success: true, message: `Cleaned ${cleaned} expired sessions` });
      }
      case 'metrics': {
        return JSON.stringify({ success: true, metrics: getSessionMetrics() });
      }
      default: return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
