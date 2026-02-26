/**
 * VegaMCP — OAuth 2.1 Authorization Framework (MCP 2025-06-18)
 * MCP servers are OAuth 2.0 Resource Servers.
 * Implements token validation, scope-based access control, and Protected Resource Metadata.
 */

export type OAuthScope =
  | 'read:memory' | 'write:memory'
  | 'read:browser' | 'write:browser'
  | 'read:swarm' | 'write:swarm'
  | 'read:analytics' | 'write:analytics'
  | 'execute:shell' | 'execute:tools'
  | 'admin:*';

export interface TokenPayload {
  sub: string;           // Subject (user/agent ID)
  aud: string;           // Audience (must be this server)
  iss: string;           // Issuer (authorization server)
  exp: number;           // Expiry timestamp
  iat: number;           // Issued-at timestamp
  scope: string;         // Space-separated scopes
  jti?: string;          // Token ID (for replay prevention)
}

export interface OAuthConfig {
  issuerUrl?: string;
  audience: string;
  requiredScopes?: OAuthScope[];
  apiKeys?: Map<string, { scopes: OAuthScope[]; name: string }>;
}

// Tool → required scopes mapping
const TOOL_SCOPES: Record<string, OAuthScope[]> = {
  // Memory tools
  create_entities: ['write:memory'],
  create_relations: ['write:memory'],
  add_observations: ['write:memory'],
  delete_entities: ['write:memory'],
  search_graph: ['read:memory'],
  open_nodes: ['read:memory'],
  graph_rag: ['read:memory'],
  agentic_rag: ['read:memory'],
  memory_bridge: ['read:memory'],
  // Browser tools
  browser_navigate: ['read:browser', 'write:browser'],
  browser_screenshot: ['read:browser'],
  browser_click: ['write:browser'],
  browser_type: ['write:browser'],
  // Swarm tools
  swarm_submit_task: ['write:swarm'],
  swarm_status: ['read:swarm'],
  // Shell & Filesystem (high privilege)
  shell: ['execute:shell'],
  filesystem: ['execute:shell'],
  // Analytics & Monitoring
  analytics: ['read:analytics'],
  health_check: ['read:analytics'],
  ab_test: ['write:analytics'],
  // Default — most tools just need execute:tools
};

let config: OAuthConfig = {
  audience: 'vegamcp',
  apiKeys: new Map(),
};

const usedTokenIds = new Set<string>();  // Replay prevention
const TOKEN_REPLAY_WINDOW = 300000;  // 5 minutes

/**
 * Configure OAuth settings
 */
export function configureOAuth(newConfig: Partial<OAuthConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Register an API key with associated scopes
 */
export function registerApiKey(key: string, name: string, scopes: OAuthScope[]): void {
  if (!config.apiKeys) config.apiKeys = new Map();
  config.apiKeys.set(key, { scopes, name });
}

/**
 * Validate a Bearer token (JWT) — basic validation without crypto
 * In production, this would verify the signature with the issuer's public key.
 */
export function validateToken(authHeader: string): { valid: boolean; payload?: TokenPayload; error?: string } {
  if (!authHeader) return { valid: false, error: 'No authorization header' };

  // Check API key auth
  if (authHeader.startsWith('ApiKey ') || authHeader.startsWith('Bearer sk-')) {
    const key = authHeader.replace(/^(ApiKey |Bearer )/, '');
    const entry = config.apiKeys?.get(key);
    if (entry) {
      return {
        valid: true,
        payload: {
          sub: entry.name,
          aud: config.audience,
          iss: 'vegamcp-local',
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
          scope: entry.scopes.join(' '),
        },
      };
    }
    return { valid: false, error: 'Invalid API key' };
  }

  // JWT Bearer token
  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Expected Bearer token' };
  }

  const token = authHeader.slice(7);
  try {
    // Decode JWT (base64url)
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, error: 'Malformed JWT' };

    const payloadStr = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    const payload = JSON.parse(payloadStr) as TokenPayload;

    // Validate audience
    if (payload.aud !== config.audience) {
      return { valid: false, error: `Invalid audience: expected ${config.audience}, got ${payload.aud}` };
    }

    // Validate expiry
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return { valid: false, error: 'Token expired' };
    }

    // Replay prevention
    if (payload.jti) {
      if (usedTokenIds.has(payload.jti)) {
        return { valid: false, error: 'Token replay detected' };
      }
      usedTokenIds.add(payload.jti);
      setTimeout(() => usedTokenIds.delete(payload.jti!), TOKEN_REPLAY_WINDOW);
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: `Token validation error: ${err.message}` };
  }
}

/**
 * Check if a token has the required scopes for a tool
 */
export function hasScope(payload: TokenPayload, requiredScopes: OAuthScope[]): boolean {
  const tokenScopes = new Set(payload.scope.split(' '));
  if (tokenScopes.has('admin:*')) return true;  // Admin has all access
  return requiredScopes.every(s => tokenScopes.has(s));
}

/**
 * Get required scopes for a tool
 */
export function getToolScopes(toolName: string): OAuthScope[] {
  return TOOL_SCOPES[toolName] || ['execute:tools'];
}

/**
 * Check authorization for a specific tool call
 */
export function authorizeToolCall(
  toolName: string,
  authHeader?: string
): { authorized: boolean; error?: string; missingScopes?: OAuthScope[] } {
  // If no auth configured (STDIO mode), allow all
  if (!config.issuerUrl && (!config.apiKeys || config.apiKeys.size === 0)) {
    return { authorized: true };
  }

  if (!authHeader) {
    return {
      authorized: false,
      error: 'Authentication required',
      missingScopes: getToolScopes(toolName),
    };
  }

  const validation = validateToken(authHeader);
  if (!validation.valid || !validation.payload) {
    return { authorized: false, error: validation.error };
  }

  const requiredScopes = getToolScopes(toolName);
  if (!hasScope(validation.payload, requiredScopes)) {
    return {
      authorized: false,
      error: 'Insufficient scopes',
      missingScopes: requiredScopes,
    };
  }

  return { authorized: true };
}

/**
 * Generate OAuth Protected Resource Metadata (RFC 9728)
 */
export function getProtectedResourceMetadata(): Record<string, any> {
  return {
    resource: `https://vegamcp.local`,
    authorization_servers: config.issuerUrl ? [config.issuerUrl] : [],
    scopes_supported: [
      'read:memory', 'write:memory',
      'read:browser', 'write:browser',
      'read:swarm', 'write:swarm',
      'read:analytics', 'write:analytics',
      'execute:shell', 'execute:tools',
      'admin:*',
    ],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://github.com/Pastarafian/VegaMCP',
    resource_signing_alg_values_supported: ['RS256', 'ES256'],
  };
}

/**
 * Generate WWW-Authenticate challenge for insufficient scopes
 */
export function getWWWAuthenticate(missingScopes: OAuthScope[]): string {
  return `Bearer realm="vegamcp", scope="${missingScopes.join(' ')}", error="insufficient_scope"`;
}

// Tool schema & handler for managing OAuth
export const oauthSchema = {
  name: 'oauth_manage',
  description: 'Manage OAuth 2.1 authorization. Register API keys, view scopes, check authorization status, and inspect Protected Resource Metadata.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['status', 'metadata', 'scopes', 'register_key', 'check'] },
      key: { type: 'string', description: 'API key (for register_key)' },
      name: { type: 'string', description: 'Key name (for register_key)' },
      key_scopes: { type: 'array', items: { type: 'string' }, description: 'Scopes for new key' },
      tool_name: { type: 'string', description: 'Tool to check scopes for (for check/scopes)' },
    },
    required: ['action'],
  },
};

export function handleOAuth(args: any): string {
  try {
    switch (args.action) {
      case 'status':
        return JSON.stringify({
          success: true,
          configured: !!(config.issuerUrl || (config.apiKeys && config.apiKeys.size > 0)),
          issuer: config.issuerUrl || 'none',
          apiKeysRegistered: config.apiKeys?.size || 0,
          audience: config.audience,
        });
      case 'metadata':
        return JSON.stringify({ success: true, metadata: getProtectedResourceMetadata() });
      case 'scopes':
        if (args.tool_name) {
          return JSON.stringify({ success: true, tool: args.tool_name, requiredScopes: getToolScopes(args.tool_name) });
        }
        return JSON.stringify({ success: true, allToolScopes: TOOL_SCOPES });
      case 'register_key':
        if (!args.key || !args.name) return JSON.stringify({ success: false, error: 'key and name required' });
        registerApiKey(args.key, args.name, (args.key_scopes || ['execute:tools']) as OAuthScope[]);
        return JSON.stringify({ success: true, message: `API key registered for ${args.name}` });
      case 'check':
        const auth = authorizeToolCall(args.tool_name || 'search_graph');
        return JSON.stringify({ success: true, ...auth });
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
