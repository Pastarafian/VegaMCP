# Security Specification — Guardrails & Hardening

> **Applies to:** All VegaMCP modules  
> **Threat Model:** Local MCP server with AI-driven tool calls  
> **Principle:** Defense in depth — every tool validates independently

---

## 1. Threat Overview

| Threat | Vector | Severity |
|--------|--------|----------|
| **Path Traversal** | AI constructs `../../etc/passwd` in file paths | 🔴 Critical |
| **Prompt Injection via Tool Output** | Sentry stack traces contain embedded instructions | 🟠 High |
| **API Key Leakage** | AI reads `.env` or logs API keys in responses | 🔴 Critical |
| **Runaway Tool Loops** | AI calls Sentry 1000x in a loop | 🟡 Medium |
| **Input Overflow** | Extremely long strings exhaust memory | 🟡 Medium |
| **Browser Escape** | Playwright navigates to malicious sites | 🟠 High |
| **Destructive Actions** | AI resolves Sentry issues or deletes memory without confirmation | 🟠 High |

---

## 2. Path Guard

### 2.1 Canonical Path Resolution

Simple `../` string filtering is **insufficient** (CVE-2025-53110).

The path guard performs:

1. **Normalize**: Convert all path separators to forward slashes
2. **Resolve**: Use `path.resolve()` to get the absolute canonical path
3. **Symlink resolution**: Follow all symlinks to get the real path
4. **Jail check**: Verify the resolved path starts with the allowed workspace root
5. **Blocklist check**: Reject paths containing `.env`, `.git/`, `node_modules/.cache`

```typescript
// Implementation pattern
function isPathSafe(inputPath: string, workspaceRoot: string): boolean {
  const resolved = path.resolve(workspaceRoot, inputPath);
  const real = fs.realpathSync.native(resolved);
  const normalizedRoot = path.resolve(workspaceRoot);
  
  // Must be within workspace
  if (!real.startsWith(normalizedRoot)) return false;
  
  // Must not access sensitive files
  const blocklist = ['.env', '.git/', 'node_modules/.cache', '.ssh', '.gnupg'];
  if (blocklist.some(b => real.includes(b))) return false;
  
  return true;
}
```

### 2.2 URL Guard (Browser Module)

```typescript
function isUrlAllowed(url: string, allowExternal: boolean): boolean {
  const parsed = new URL(url);
  
  // Always block file:// protocol
  if (parsed.protocol === 'file:') return false;
  
  // Always allow localhost
  if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) return true;
  
  // External URLs require explicit opt-in
  return allowExternal;
}
```

---

## 3. Rate Limiter

### 3.1 Per-Tool Rate Limits

| Tool Category | Max Calls/Minute | Max Calls/Hour |
|--------------|------------------|----------------|
| Memory tools | 60 | 500 |
| Browser tools | 30 | 200 |
| Sentry tools | 30 | 150 |
| Reasoning tools | 10 | 50 |

### 3.2 Implementation

Uses a sliding window counter per tool category:

```typescript
interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour: number;
}

class RateLimiter {
  private windows: Map<string, number[]> = new Map();
  
  check(category: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const timestamps = this.windows.get(category) || [];
    
    // Clean old entries
    const oneHourAgo = now - 3600000;
    const recent = timestamps.filter(t => t > oneHourAgo);
    
    // Check minute window
    const oneMinuteAgo = now - 60000;
    const lastMinute = recent.filter(t => t > oneMinuteAgo);
    if (lastMinute.length >= config.maxPerMinute) return false;
    
    // Check hour window
    if (recent.length >= config.maxPerHour) return false;
    
    recent.push(now);
    this.windows.set(category, recent);
    return true;
  }
}
```

### 3.3 Rate Limit Response

When a rate limit is hit, the tool returns:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded for browser tools: 30 calls/minute. Try again in 45 seconds.",
    "retryAfterMs": 45000
  }
}
```

---

## 4. Input Validator

### 4.1 String Length Caps

| Parameter Type | Max Length | Rationale |
|---------------|-----------|-----------|
| Entity name | 200 chars | Prevent memory bloat |
| Observation | 2000 chars | Reasonable fact length |
| Search query | 500 chars | FTS5 query limit |
| JavaScript code | 10000 chars | Security boundary |
| Problem description | 20000 chars | Context window limit |
| URL | 2048 chars | Standard URL limit |
| CSS selector | 500 chars | Prevent injection |

### 4.2 Schema Enforcement

Every tool call is validated against its Zod schema before execution:

```typescript
import { z } from 'zod';

const createEntitiesSchema = z.object({
  entities: z.array(z.object({
    name: z.string().min(1).max(200),
    type: z.enum(['service', 'convention', 'pattern', 'bug-fix', 'dependency', 'config', 'concept']),
    domain: z.string().max(100).default('general'),
    observations: z.array(z.string().max(2000)).max(20).optional(),
  })).min(1).max(50),
});
```

### 4.3 Injection Prevention

- All SQL queries use **parameterized statements** (never string concatenation)
- JavaScript passed to `browser_execute_js` runs in the **page context only** (no Node.js access)
- Sentry API responses are **sanitized** to remove any text that looks like prompt injection patterns:
  - Strip sequences matching `ignore previous instructions`
  - Strip sequences matching `system:` or `assistant:`
  - Log sanitized content for audit

---

## 5. Output Sanitization

### 5.1 Sentry Stack Traces

Production error messages can contain user-controlled data that might include  
prompt injection attempts. Before returning Sentry data to the AI:

1. Strip any content matching known prompt injection patterns
2. Truncate individual string fields to 5000 characters
3. Remove any embedded base64 data (potential data exfiltration)
4. Remove any URLs containing auth tokens or API keys

### 5.2 Browser Console Logs

Console output from the browser is sanitized similarly:

1. Truncate total console buffer to 50 entries
2. Truncate individual log messages to 2000 characters
3. Strip any `data:` URLs (prevent data exfiltration via console)

---

## 6. Environment Isolation

### 6.1 API Key Protection

```
✅ API keys stored in .env file (never committed to git)
✅ .env is in .gitignore
✅ Keys loaded via process.env at startup only
✅ Keys never included in tool responses
✅ Keys never logged to stdout/stderr
❌ Keys never passed in tool input schemas
❌ Keys never included in error messages
```

### 6.2 Browser Isolation

```
✅ Incognito context — no saved cookies or sessions
✅ No access to real user browser profiles
✅ file:// protocol blocked
✅ Download capability disabled
✅ Clipboard access disabled
✅ Geolocation disabled
✅ Camera/microphone disabled
```

---

## 7. Destructive Action Guards

Certain tools modify external state. These require special handling:

| Tool | Destructive? | Guard |
|------|-------------|-------|
| `create_entities` | No (local only) | None needed |
| `delete_entities` | Soft destructive | Logged with undo info |
| `sentry_resolve_issue` | Yes (production) | Response includes explicit warning |
| `browser_execute_js` | Potentially | Runs in page sandbox only |

For `sentry_resolve_issue`, the response includes:

```json
{
  "success": true,
  "warning": "⚠️ This issue has been marked as resolved in production Sentry. This affects your team's issue tracking.",
  "undoAction": "To unresolve: call sentry_resolve_issue with resolution='unresolved'"
}
```

---

## 8. Audit Logging

All tool calls are logged to a local SQLite table for forensic analysis:

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_name TEXT NOT NULL,
  input_hash TEXT NOT NULL,     -- SHA-256 of input (not the raw input)
  success BOOLEAN NOT NULL,
  error_code TEXT,
  duration_ms INTEGER,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
```

This enables queries like:
- "How many Sentry calls were made in the last hour?"
- "Which tools are failing most often?"
- "When was the last destructive action?"
