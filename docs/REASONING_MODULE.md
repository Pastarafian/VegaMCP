# Reasoning Module — Multi-Model Intelligence Router

> **Module:** Reasoning Router  
> **Default Backend:** DeepSeek R1 via OpenRouter  
> **Fallback:** Direct DeepSeek API  
> **Tools Exposed:** 1  
> **Resources Exposed:** 0

---

## 1. Purpose

The Reasoning Module provides an **escape hatch** for complex logic problems.  
When the primary AI encounters a problem that requires deep Chain-of-Thought reasoning —  
algorithm design, mathematical proofs, complex refactoring strategies — it delegates to  
a specialized reasoning model and uses the returned logic map as a blueprint.

---

## 2. Architecture

```
┌─────────────────────────────────┐
│         VegaMCP Server          │
│                                 │
│  ┌───────────────────────────┐  │
│  │   Reasoning Router Tool   │  │
│  │                           │  │
│  │  1. Receive problem       │  │
│  │  2. Inject memory context │  │
│  │  3. Select model          │  │
│  │  4. Send API request      │  │
│  │  5. Extract CoT + answer  │  │
│  │  6. Log token usage       │  │
│  │  7. Return structured     │  │
│  └──────────┬────────────────┘  │
│             │                   │
│    ┌────────▼────────┐          │
│    │ OpenRouter API  │          │
│    │ (model router)  │          │
│    │                 │          │
│    │ ┌─────────────┐ │          │
│    │ │ DeepSeek R1 │ │          │
│    │ │ Claude      │ │          │
│    │ │ GPT-4o      │ │          │
│    │ │ Llama 3     │ │          │
│    │ │ Gemma       │ │          │
│    │ └─────────────┘ │          │
│    └─────────────────┘          │
└─────────────────────────────────┘
```

### Model Selection Strategy

| Model | Best For | Cost Tier |
|-------|----------|-----------|
| `deepseek/deepseek-r1` | Complex reasoning, algorithms, math | $ |
| `deepseek/deepseek-chat` | General coding, fast responses | $ |
| `anthropic/claude-3.5-sonnet` | Nuanced analysis, documentation | $$$ |
| `openai/gpt-4o` | Broad knowledge, balanced | $$ |
| `meta-llama/llama-3.1-405b` | Open-weight, long context | $$ |

---

## 3. Tool Specification

### 3.1 `route_to_reasoning_model`

```json
{
  "name": "route_to_reasoning_model",
  "description": "Delegate a complex reasoning problem to a specialized AI model. Use this for: algorithm design, mathematical logic, complex refactoring strategies, architectural trade-off analysis, or any problem requiring deep Chain-of-Thought reasoning. The tool sends the problem to the selected model, extracts the reasoning chain and final answer, and returns them separately. Optionally injects relevant memory context from the knowledge graph.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "problem": {
        "type": "string",
        "description": "Clear description of the problem to solve. Be as specific as possible — include constraints, input/output examples, and any relevant code snippets."
      },
      "model": {
        "type": "string",
        "description": "Which model to use. Default is DeepSeek R1 for maximum reasoning depth.",
        "enum": [
          "deepseek/deepseek-r1",
          "deepseek/deepseek-chat",
          "anthropic/claude-3.5-sonnet",
          "openai/gpt-4o",
          "meta-llama/llama-3.1-405b"
        ],
        "default": "deepseek/deepseek-r1"
      },
      "systemPrompt": {
        "type": "string",
        "description": "Optional system prompt to guide the model's behavior. If not provided, a default reasoning-focused prompt is used.",
        "default": "You are an expert software engineer and algorithmic thinker. Solve the given problem step by step, showing your complete reasoning process. Be precise and thorough."
      },
      "includeMemoryContext": {
        "type": "boolean",
        "description": "Whether to inject relevant context from the memory graph into the prompt. Searches for entities related to the problem description.",
        "default": true
      },
      "maxTokens": {
        "type": "number",
        "description": "Maximum tokens for the response",
        "default": 4096,
        "maximum": 16384
      },
      "temperature": {
        "type": "number",
        "description": "Sampling temperature (0.0 = deterministic, 1.0 = creative)",
        "default": 0.2,
        "minimum": 0,
        "maximum": 1
      }
    },
    "required": ["problem"]
  }
}
```

**Returns:**
```json
{
  "success": true,
  "model": "deepseek/deepseek-r1",
  "reasoning": {
    "chainOfThought": "Let me analyze this step by step...\n1. First, we need to consider...\n2. The key insight is...\n3. Therefore, the optimal approach is...",
    "steps": [
      "Identify the recursive substructure",
      "Define the memoization table dimensions",
      "Establish base cases",
      "Write the transition formula",
      "Implement bottom-up with O(n) space optimization"
    ]
  },
  "answer": "Here is the optimized implementation:\n\n```typescript\nfunction longestSubsequence(arr: number[]): number {\n  // ... implementation\n}\n```",
  "usage": {
    "promptTokens": 342,
    "completionTokens": 1205,
    "totalTokens": 1547,
    "estimatedCost": "$0.0023"
  },
  "memoryContextUsed": [
    "Project uses TypeScript strict mode",
    "Array utilities are in src/utils/array.ts"
  ]
}
```

---

## 4. Chain-of-Thought Extraction

For DeepSeek R1 specifically, the model outputs its reasoning inside `<think>` tags:

```
<think>
Let me break down this problem...
Step 1: We need to find the longest common subsequence...
Step 2: The dynamic programming approach uses a 2D table...
</think>

Here is the implementation:
```

The tool **automatically parses** these tags:
1. Extracts content within `<think>...</think>` → `reasoning.chainOfThought`
2. Splits reasoning into numbered steps → `reasoning.steps`
3. Everything after `</think>` → `answer`

For non-R1 models (which don't use `<think>` tags), the entire response is placed in `answer`,  
and `reasoning` is set to `null`.

---

## 5. Memory Context Injection

When `includeMemoryContext` is true:

1. Extract keywords from the `problem` description
2. Run `search_graph` with those keywords
3. Append matching entity observations to the system prompt:

```
--- PROJECT CONTEXT ---
The following facts are from the project's knowledge graph:
• Entity "Database Schema": Uses PostgreSQL 15, all tables have created_at/updated_at
• Entity "API Convention": All endpoints return JSON, error format follows RFC 7807
• Entity "Auth Service": Uses JWT with RS256, tokens expire after 1 hour
--- END CONTEXT ---
```

This ensures the reasoning model has project-specific knowledge even though  
it has no access to the codebase.

---

## 6. Error Handling

```json
{
  "success": false,
  "error": {
    "code": "MODEL_TIMEOUT",
    "message": "DeepSeek R1 did not respond within 120 seconds. The problem may be too complex or the service may be overloaded.",
    "suggestion": "Try breaking the problem into smaller parts, or switch to a faster model like deepseek/deepseek-chat."
  }
}
```

Error codes:
- `REASONING_NOT_CONFIGURED` — No API key set (OPENROUTER_API_KEY or DEEPSEEK_API_KEY)
- `MODEL_TIMEOUT` — Response took too long (default timeout: 120s)
- `MODEL_UNAVAILABLE` — Selected model is temporarily offline
- `RATE_LIMITED` — API rate limit hit
- `CONTEXT_TOO_LONG` — Problem + memory context exceeds model's context window
- `API_ERROR` — Generic API failure

---

## 7. Cost Tracking

Every call logs token usage to a local SQLite table:

```sql
CREATE TABLE IF NOT EXISTS reasoning_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
```

This enables the AI (or user) to query: "How much have I spent on reasoning calls this week?"

---

## 8. Timeout & Retry Strategy

- **Default timeout**: 120 seconds (R1 can take 30-60s for complex reasoning)
- **Retry policy**: 1 retry on timeout or 5xx error, with exponential backoff
- **Circuit breaker**: After 3 consecutive failures for a model, mark it as unavailable for 5 minutes
