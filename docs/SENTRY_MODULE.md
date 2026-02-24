# Sentry Module — Live Production Observability

> **Module:** Sentry Telemetry  
> **API:** Sentry REST API v0  
> **Authentication:** Bearer token (stored in `.env`)  
> **Tools Exposed:** 4  
> **Resources Exposed:** 1

---

## 1. Purpose

The Sentry Module connects your local development environment directly to **live production errors**.  
When a user reports a crash, the AI pulls the full stack trace, breadcrumbs, and environment context  
from Sentry, cross-references it with your local codebase, and drafts the fix — all without  
opening a browser.

---

## 2. API Integration

### 2.1 Base Configuration

```
Base URL: https://sentry.io/api/0/
Auth Header: Authorization: Bearer {SENTRY_AUTH_TOKEN}
Rate Limit: Respect Sentry's X-Sentry-Rate-Limit headers
```

### 2.2 Required Scopes

The auth token needs these scopes:
- `project:read` — Read project configuration
- `event:read` — Read error events and stack traces
- `event:write` — Resolve/unresolve issues (for `sentry_resolve_issue`)

---

## 3. Tool Specifications

### 3.1 `sentry_search_issues`

Search and filter production issues.

```json
{
  "name": "sentry_search_issues",
  "description": "Search for issues (error groups) in your Sentry project. Supports filtering by status, time range, and search query. Returns a summary list — use sentry_get_issue_detail for full details on a specific issue.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query (e.g., 'TypeError', 'login crash', 'database timeout'). Supports Sentry search syntax.",
        "default": ""
      },
      "status": {
        "type": "string",
        "description": "Filter by issue status",
        "enum": ["unresolved", "resolved", "ignored", "all"],
        "default": "unresolved"
      },
      "sortBy": {
        "type": "string",
        "description": "Sort order for results",
        "enum": ["date", "priority", "freq", "user"],
        "default": "date"
      },
      "timeRange": {
        "type": "string",
        "description": "Time window to search within",
        "enum": ["1h", "24h", "7d", "14d", "30d"],
        "default": "24h"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of issues to return",
        "default": 10,
        "maximum": 25
      }
    }
  }
}
```

**Returns:**
```json
{
  "issues": [
    {
      "id": "PROJ-1234",
      "title": "TypeError: Cannot read property 'user' of undefined",
      "culprit": "app/services/auth.js in validateToken",
      "status": "unresolved",
      "level": "error",
      "count": 147,
      "userCount": 23,
      "firstSeen": "2026-02-22T10:30:00Z",
      "lastSeen": "2026-02-23T15:45:00Z",
      "assignedTo": null,
      "shortId": "PROJ-1234",
      "permalink": "https://sentry.io/organizations/myorg/issues/1234/"
    }
  ],
  "totalCount": 42
}
```

### 3.2 `sentry_get_issue_detail`

Get full details including stack trace, tags, and environment.

```json
{
  "name": "sentry_get_issue_detail",
  "description": "Get detailed information about a specific Sentry issue, including the full stack trace from the latest event, environment variables, tags, release version, and affected user count. Use this after finding an issue with sentry_search_issues.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "issueId": {
        "type": "string",
        "description": "The issue ID (numeric or short ID like 'PROJ-1234')"
      },
      "includeStacktrace": {
        "type": "boolean",
        "description": "Whether to include the full stack trace",
        "default": true
      },
      "includeEnvironment": {
        "type": "boolean",
        "description": "Whether to include environment/device context",
        "default": true
      }
    },
    "required": ["issueId"]
  }
}
```

**Returns:**
```json
{
  "issue": {
    "id": "1234",
    "title": "TypeError: Cannot read property 'user' of undefined",
    "status": "unresolved",
    "level": "error",
    "platform": "javascript",
    "count": 147,
    "userCount": 23,
    "firstSeen": "2026-02-22T10:30:00Z",
    "lastSeen": "2026-02-23T15:45:00Z"
  },
  "latestEvent": {
    "eventId": "abc123",
    "timestamp": "2026-02-23T15:45:00Z",
    "release": "v2.3.1",
    "environment": "production",
    "stacktrace": {
      "frames": [
        {
          "filename": "app/services/auth.js",
          "function": "validateToken",
          "lineNo": 45,
          "colNo": 12,
          "context": [
            [43, "  const decoded = jwt.verify(token, secret);"],
            [44, "  const userId = decoded.sub;"],
            [45, "  const profile = await db.users.findOne({ id: userId });"],
            [46, "  return profile.user;  // <-- profile can be null"],
            [47, "};"]
          ],
          "inApp": true
        }
      ]
    },
    "tags": {
      "browser": "Chrome 120",
      "os": "Windows 11",
      "url": "/api/v1/profile"
    },
    "contexts": {
      "browser": { "name": "Chrome", "version": "120.0.0" },
      "os": { "name": "Windows", "version": "11" },
      "device": { "family": "Desktop" }
    }
  }
}
```

### 3.3 `sentry_get_breadcrumbs`

Get the user's navigation trail before the crash.

```json
{
  "name": "sentry_get_breadcrumbs",
  "description": "Get the breadcrumb trail (user actions leading up to the error) for a specific issue's latest event. Shows HTTP requests, UI clicks, console messages, and navigation events in chronological order. Essential for reproducing the bug.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "issueId": {
        "type": "string",
        "description": "The issue ID to get breadcrumbs for"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of breadcrumbs to return (most recent)",
        "default": 30,
        "maximum": 100
      }
    },
    "required": ["issueId"]
  }
}
```

**Returns:**
```json
{
  "breadcrumbs": [
    { "type": "navigation", "category": "navigation", "data": { "from": "/login", "to": "/dashboard" }, "timestamp": "2026-02-23T15:44:50Z" },
    { "type": "http", "category": "fetch", "data": { "method": "GET", "url": "/api/v1/profile", "status_code": 200 }, "timestamp": "2026-02-23T15:44:51Z" },
    { "type": "ui.click", "category": "ui.click", "message": "button.settings-btn", "timestamp": "2026-02-23T15:44:55Z" },
    { "type": "http", "category": "fetch", "data": { "method": "GET", "url": "/api/v1/profile/settings", "status_code": 500 }, "timestamp": "2026-02-23T15:44:55Z" },
    { "type": "error", "category": "console", "message": "TypeError: Cannot read property 'user' of undefined", "timestamp": "2026-02-23T15:44:56Z" }
  ]
}
```

### 3.4 `sentry_resolve_issue`

Mark an issue as resolved.

```json
{
  "name": "sentry_resolve_issue",
  "description": "Mark a Sentry issue as resolved. This is a DESTRUCTIVE action — it affects production issue tracking. The AI should only call this after confirming a fix has been applied and verified. Returns the updated issue status.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "issueId": {
        "type": "string",
        "description": "The issue ID to resolve"
      },
      "resolution": {
        "type": "string",
        "description": "Resolution type",
        "enum": ["resolved", "resolvedInNextRelease", "ignored"],
        "default": "resolved"
      },
      "comment": {
        "type": "string",
        "description": "Optional comment explaining the resolution (e.g., 'Fixed null check in auth.js:45')"
      }
    },
    "required": ["issueId"]
  }
}
```

---

## 4. Resource Specifications

### 4.1 `sentry://issues/recent`

A read-only resource that returns the 10 most recent unresolved issues.  
Auto-refreshes on each access (no caching).

---

## 5. Error Handling

```json
{
  "success": false,
  "error": {
    "code": "SENTRY_AUTH_FAILED",
    "message": "Invalid or expired Sentry auth token. Check SENTRY_AUTH_TOKEN in .env",
    "statusCode": 401
  }
}
```

Error codes:
- `SENTRY_NOT_CONFIGURED` — Missing SENTRY_AUTH_TOKEN, SENTRY_ORG, or SENTRY_PROJECT
- `SENTRY_AUTH_FAILED` — Token is invalid or expired
- `SENTRY_RATE_LIMITED` — Too many API requests (respects `Retry-After` header)
- `SENTRY_ISSUE_NOT_FOUND` — Issue ID doesn't exist
- `SENTRY_API_ERROR` — Generic API failure with details

---

## 6. Rate Limiting

The tool respects Sentry's rate limit headers:
- `X-Sentry-Rate-Limit-Remaining`
- `X-Sentry-Rate-Limit-Reset`

If a rate limit is hit, the tool waits for the reset period and retries once.  
If still limited, it returns a `SENTRY_RATE_LIMITED` error.

Server-side rate limiting is also applied: max **30 calls per minute** across all Sentry tools.
