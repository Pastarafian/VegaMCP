# Browser Module — Playwright Automation

> **Module:** Browser Automation  
> **Engine:** Playwright (Chromium headless)  
> **Tools Exposed:** 8  
> **Session Model:** Persistent per-server-lifecycle

---

## 1. Purpose

The Browser Module gives the AI a **fully interactive headless browser** to autonomously test,  
validate, and debug web UIs it builds. Instead of guessing whether code works, the AI can  
navigate to the running app, interact with it, capture results, and self-correct.

---

## 2. Session Architecture

```
┌─────────────────────────────────┐
│     VegaMCP Server Process      │
│                                 │
│  ┌───────────────────────────┐  │
│  │   Browser Session Pool    │  │
│  │                           │  │
│  │  ┌─────────────────────┐  │  │
│  │  │  Chromium Instance   │  │  │
│  │  │  (Incognito Context) │  │  │
│  │  │                      │  │  │
│  │  │  • Page 1 (active)   │  │  │
│  │  │  • Console log buffer│  │  │
│  │  │  • Network log buffer│  │  │
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Key Design Decisions:

- **Lazy initialization**: Browser is NOT launched at server start. It spins up on first tool call.
- **Persistent session**: Once launched, the browser stays alive for subsequent calls (no spin-up penalty).
- **Incognito context**: Every session uses a fresh incognito context — no cookies, no saved sessions.
- **Console capture**: All `console.log`, `console.warn`, `console.error` are buffered and retrievable.
- **Auto-cleanup**: Browser is gracefully closed when the MCP server process exits.

---

## 3. Tool Specifications

### 3.1 `browser_navigate`

Navigate to a URL and wait for the page to load.

```json
{
  "name": "browser_navigate",
  "description": "Navigate the headless browser to a URL. Waits for the page to reach 'domcontentloaded' state. Use this to open your local dev server, external docs, or any web page for testing. The browser launches automatically on first use.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "The URL to navigate to (e.g., 'http://localhost:3000', 'https://example.com')"
      },
      "waitUntil": {
        "type": "string",
        "description": "When to consider navigation complete",
        "enum": ["domcontentloaded", "load", "networkidle"],
        "default": "domcontentloaded"
      },
      "timeout": {
        "type": "number",
        "description": "Navigation timeout in milliseconds",
        "default": 30000,
        "maximum": 60000
      }
    },
    "required": ["url"]
  }
}
```

**Returns:**
```json
{
  "success": true,
  "url": "http://localhost:3000",
  "title": "My App",
  "status": 200,
  "loadTimeMs": 342
}
```

### 3.2 `browser_click`

Click an element on the page.

```json
{
  "name": "browser_click",
  "description": "Click an element on the current page. You can target by CSS selector, text content, or accessibility role. If the element is not found, returns an error with the current page structure hint.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "selector": {
        "type": "string",
        "description": "CSS selector to find the element (e.g., '#login-btn', '.submit-form button')"
      },
      "text": {
        "type": "string",
        "description": "Alternative: find element by exact text content (e.g., 'Submit', 'Login')"
      },
      "role": {
        "type": "string",
        "description": "Alternative: find element by ARIA role (e.g., 'button', 'link', 'checkbox')"
      },
      "timeout": {
        "type": "number",
        "description": "Max wait time for element to appear (ms)",
        "default": 5000
      }
    }
  }
}
```

**Returns:**
```json
{
  "success": true,
  "element": {
    "tag": "button",
    "text": "Submit",
    "id": "login-btn"
  }
}
```

### 3.3 `browser_type`

Type text into an input field.

```json
{
  "name": "browser_type",
  "description": "Type text into an input field on the current page. First finds the element, clicks it to focus, then types character by character for realism. Optionally clear the field first.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "selector": {
        "type": "string",
        "description": "CSS selector for the input field"
      },
      "text": {
        "type": "string",
        "description": "Text to type into the field"
      },
      "clearFirst": {
        "type": "boolean",
        "description": "Whether to clear existing content before typing",
        "default": true
      },
      "pressEnter": {
        "type": "boolean",
        "description": "Whether to press Enter after typing",
        "default": false
      }
    },
    "required": ["selector", "text"]
  }
}
```

### 3.4 `browser_screenshot`

Capture a PNG screenshot of the current page.

```json
{
  "name": "browser_screenshot",
  "description": "Capture a screenshot of the current browser page. Returns the image as a base64-encoded PNG. Use this to visually verify UI layout, check for rendering errors, or document the current state.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "fullPage": {
        "type": "boolean",
        "description": "Capture the entire scrollable page (true) or just the viewport (false)",
        "default": false
      },
      "selector": {
        "type": "string",
        "description": "Optional: capture only a specific element by CSS selector"
      }
    }
  }
}
```

### 3.5 `browser_snapshot`

Get the accessibility tree snapshot — the primary tool for LLM-driven interaction.

```json
{
  "name": "browser_snapshot",
  "description": "Get a structured accessibility snapshot of the current page. This returns the DOM as an accessibility tree that LLMs can reason about — far more useful than screenshots for understanding page structure, finding interactive elements, and detecting layout issues. This is the PREFERRED tool for understanding page content.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "root": {
        "type": "string",
        "description": "Optional CSS selector to scope the snapshot to a subtree"
      }
    }
  }
}
```

**Returns:**
```json
{
  "snapshot": {
    "role": "document",
    "name": "My App",
    "children": [
      {
        "role": "navigation",
        "name": "Main Menu",
        "children": [
          { "role": "link", "name": "Home", "url": "/" },
          { "role": "link", "name": "About", "url": "/about" }
        ]
      },
      {
        "role": "main",
        "children": [
          { "role": "heading", "name": "Welcome", "level": 1 },
          { "role": "textbox", "name": "Email", "value": "" },
          { "role": "button", "name": "Submit" }
        ]
      }
    ]
  }
}
```

### 3.6 `browser_execute_js`

Execute arbitrary JavaScript in the page context.

```json
{
  "name": "browser_execute_js",
  "description": "Execute JavaScript code in the browser page context. Returns the serialized result. Use for reading DOM state, checking variable values, triggering events, or any custom interaction not covered by other tools.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "JavaScript code to execute in the page. Must be a single expression or IIFE that returns a value."
      }
    },
    "required": ["code"]
  }
}
```

### 3.7 `browser_console_logs`

Retrieve buffered console output.

```json
{
  "name": "browser_console_logs",
  "description": "Retrieve all console messages (log, warn, error, info) captured since the last call to this tool or since navigation. Also includes uncaught exceptions and unhandled promise rejections. The buffer is cleared after reading.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "level": {
        "type": "string",
        "description": "Optional filter by log level",
        "enum": ["all", "log", "warn", "error", "info"],
        "default": "all"
      }
    }
  }
}
```

**Returns:**
```json
{
  "logs": [
    { "level": "log", "text": "App initialized", "timestamp": "2026-02-23T15:50:00Z" },
    { "level": "error", "text": "TypeError: Cannot read property 'map' of undefined", "timestamp": "2026-02-23T15:50:01Z", "stack": "at UserList.render (app.js:45)" }
  ],
  "uncaughtExceptions": [
    { "message": "Unhandled promise rejection: NetworkError", "timestamp": "2026-02-23T15:50:02Z" }
  ]
}
```

### 3.8 `browser_close`

Close the browser session and release resources.

```json
{
  "name": "browser_close",
  "description": "Close the headless browser session and release all resources. The browser will be re-launched automatically on the next browser tool call. Use this to reset state or free memory.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

---

## 4. Security Constraints

- **Incognito only**: All sessions use incognito contexts — no access to real browser profiles
- **URL allowlist**: By default, only `localhost` and `127.0.0.1` URLs are allowed. External URLs require explicit opt-in via `.env` config (`BROWSER_ALLOW_EXTERNAL=true`)
- **No file:// protocol**: `file://` URLs are strictly blocked to prevent local file exfiltration
- **JavaScript sandboxing**: `browser_execute_js` runs in the page context only — no access to Node.js APIs
- **Resource limits**: Max 1 browser instance, max 3 pages, auto-close after 5 minutes of inactivity

---

## 5. Error Handling

All browser tools follow a consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "ELEMENT_NOT_FOUND",
    "message": "No element matching selector '#login-btn' found on the page",
    "hint": "Available buttons: ['Submit Form', 'Cancel', 'Back']",
    "pageUrl": "http://localhost:3000/login"
  }
}
```

Error codes:
- `BROWSER_NOT_READY` — Browser failed to launch
- `NAVIGATION_TIMEOUT` — Page took too long to load
- `ELEMENT_NOT_FOUND` — Selector/text/role didn't match any element
- `ELEMENT_NOT_VISIBLE` — Element exists but is hidden or off-screen
- `EXECUTION_ERROR` — JavaScript execution threw an exception
- `URL_BLOCKED` — URL is not in the allowlist
- `SESSION_EXPIRED` — Browser was auto-closed due to inactivity
