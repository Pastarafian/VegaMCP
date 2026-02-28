// GENERATED V7 UNIFIED TOOLS
export const v7Schemas = [
  {
    "name": "memory",
    "description": "Unified memory capability cluster.\n- graph: from memory\n- bridge: from memory_bridge\n",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "The specific sub-action to perform",
          "enum": [
            "graph",
            "bridge"
          ]
        },
        "entities": {
          "type": "array",
          "description": "Array of {name, type, domain, observations} for create_entities",
          "items": {
            "type": "object"
          }
        },
        "relations": {
          "type": "array",
          "description": "Array of {from, to, type} for create_relations",
          "items": {
            "type": "object"
          }
        },
        "entity_name": {
          "type": "string",
          "description": "Entity name for graph storage (for learn action)"
        },
        "observations": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Facts to add (add_observations)"
        },
        "query": {
          "type": "string",
          "description": "Search query (for recall actions)"
        },
        "domain": {
          "type": "string",
          "description": "Knowledge domain (e.g., research, engineering, science)"
        },
        "names": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Entity names (open_nodes, delete)"
        },
        "content": {
          "type": "string",
          "description": "Content to learn (for learn action)"
        },
        "entity_type": {
          "type": "string",
          "enum": [
            "concept",
            "hypothesis",
            "fact",
            "constraint",
            "method",
            "tool",
            "pattern",
            "failure"
          ],
          "description": "Type of knowledge entity"
        },
        "source": {
          "type": "string",
          "description": "Source of knowledge (e.g., user, agent:visionary, arxiv, wolfram)"
        },
        "confidence": {
          "type": "number",
          "description": "Initial confidence score 0.0-1.0 (default: 0.5)"
        },
        "limit": {
          "type": "number",
          "description": "Max results to return (default: 20)"
        },
        "related_to": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "entity_name": {
                "type": "string"
              },
              "relation_type": {
                "type": "string"
              },
              "strength": {
                "type": "number"
              }
            }
          },
          "description": "Related entities to link (for learn action)"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Tags for categorization"
        },
        "is_constraint": {
          "type": "boolean",
          "description": "Whether this is a learned guardrail/constraint"
        },
        "is_failure": {
          "type": "boolean",
          "description": "Whether this is a past failure record"
        },
        "min_confidence": {
          "type": "number",
          "description": "Minimum confidence threshold for results (default: 0.0)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "ai",
    "description": "Unified ai capability cluster.\n- reason: from route_to_reasoning_model\n- hypothesis: from hypothesis_generator\n- synthesize: from synthesis_engine\n",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "The specific sub-action to perform",
          "enum": [
            "reason",
            "hypothesis",
            "synthesize"
          ]
        },
        "problem": {
          "type": "string",
          "description": "The problem to solve. Include constraints, examples, and code snippets."
        },
        "mode": {
          "type": "string",
          "enum": [
            "analyze",
            "quick",
            "code",
            "debug",
            "explain",
            "debate",
            "chain",
            "critique",
            "auto"
          ],
          "description": "Reasoning mode. Default: auto (smart-picks based on problem)."
        },
        "model": {
          "type": "string",
          "enum": [
            "deepseek/deepseek-r1",
            "deepseek/deepseek-chat",
            "deepseek/deepseek-v3",
            "anthropic/claude-3.5-sonnet",
            "anthropic/claude-sonnet-4",
            "anthropic/claude-opus-4",
            "openai/gpt-4o",
            "openai/gpt-4.1",
            "openai/o3-mini",
            "meta-llama/llama-3.1-405b",
            "meta-llama/llama-4-maverick",
            "moonshot/kimi-128k",
            "moonshot/kimi-32k",
            "google/gemini-2.0-flash",
            "google/gemini-2.5-pro",
            "google/gemini-2.5-flash",
            "groq/llama-3.3-70b",
            "groq/mixtral-8x7b",
            "mistral/mistral-large",
            "mistral/codestral",
            "together/qwen-2.5-72b",
            "together/qwen-3-235b",
            "xai/grok-3-mini",
            "ollama/auto"
          ],
          "description": "Override model selection. Leave blank for auto-routing."
        },
        "systemPrompt": {
          "type": "string",
          "description": "Custom system prompt. Or use preset name: engineer, mathematician, security_auditor, architect, teacher, critic, creative, data_scientist, debugger, devops."
        },
        "session_id": {
          "type": "string",
          "description": "Continue a conversation session. Omit to start new."
        },
        "output_format": {
          "type": "string",
          "enum": [
            "free",
            "json",
            "code_only",
            "markdown",
            "structured"
          ],
          "description": "Output format. Default: free."
        },
        "debate_models": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Models to use in debate mode (2-3 models). Auto-selected if omitted."
        },
        "maxTokens": {
          "type": "number",
          "description": "Max response tokens (256-16384)."
        },
        "temperature": {
          "type": "number",
          "description": "Sampling temperature 0.0-1.0."
        },
        "includeMemoryContext": {
          "type": "boolean",
          "description": "Inject relevant memory graph context. Default: true."
        },
        "checkBudget": {
          "type": "boolean",
          "description": "Check token budget before calling. Default: true."
        },
        "topic": {
          "type": "string",
          "description": "Research topic or domain to generate hypotheses for (for generate/debate)"
        },
        "hypothesis_id": {
          "type": "string",
          "description": "Hypothesis ID (for get/approve/reject)"
        },
        "constraints": {
          "type": "string",
          "description": "Additional constraints or context for generation"
        },
        "seed_ideas": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Seed ideas to combine (for evolve action)"
        },
        "status_filter": {
          "type": "string",
          "enum": [
            "proposed",
            "debating",
            "approved",
            "rejected",
            "prototyping",
            "verified",
            "failed"
          ],
          "description": "Filter hypotheses by status (for list)"
        },
        "creativity": {
          "type": "number",
          "description": "Creativity level 0.0-1.0 for the Visionary (default: 0.8)"
        },
        "rigor": {
          "type": "number",
          "description": "Rigor level 0.0-1.0 for the Adversary (default: 0.9)"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Knowledge sources to include: knowledge, code_snippets, failures, hypotheses, all (default: all)"
        },
        "limit": {
          "type": "number",
          "description": "Max training pairs to generate (default: 100)"
        },
        "include_contrastive": {
          "type": "boolean",
          "description": "Include failure-based contrastive pairs (default: true)"
        },
        "content": {
          "type": "string",
          "description": "Raw text to distill into an axiom"
        },
        "source_label": {
          "type": "string",
          "description": "Source label for provenance tracking"
        },
        "url": {
          "type": "string",
          "description": "URL to harvest knowledge from"
        },
        "query": {
          "type": "string",
          "description": "Relevance query for filtering (optional)"
        },
        "max_depth": {
          "type": "number",
          "description": "Max crawl depth (default: 0, single page)"
        },
        "text": {
          "type": "string",
          "description": "Raw text to ingest"
        },
        "category": {
          "type": "string",
          "description": "Category for the knowledge entry"
        },
        "metadata": {
          "type": "object",
          "properties": {},
          "description": "Additional metadata"
        },
        "output_path": {
          "type": "string",
          "description": "Output file path for JSONL export"
        },
        "format": {
          "type": "string",
          "enum": [
            "jsonl",
            "json",
            "csv"
          ],
          "description": "Export format (default: jsonl)"
        },
        "prompt": {
          "type": "string",
          "description": "The prompt to route/analyze"
        },
        "preference": {
          "type": "string",
          "enum": [
            "quality",
            "speed",
            "cost",
            "balanced"
          ],
          "description": "Routing preference (default: balanced)"
        },
        "capability": {
          "type": "string",
          "enum": [
            "general",
            "code",
            "reasoning",
            "creative",
            "translation",
            "analysis"
          ],
          "description": "Required capability (default: general)"
        },
        "max_tokens": {
          "type": "number",
          "description": "Max tokens for response (default: 1000)"
        },
        "force_model": {
          "type": "string",
          "description": "Force a specific model (bypass routing)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "token_budget",
    "description": "Manage token usage budgets. Track spending across AI models, set daily/hourly limits, get cost recommendations, and monitor per-model breakdown. Helps control API costs.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "get_usage",
            "set_budget",
            "get_budget",
            "check_model",
            "get_recommendation",
            "get_history"
          ],
          "description": "Action to perform"
        },
        "budget_type": {
          "type": "string",
          "enum": [
            "daily",
            "hourly"
          ],
          "description": "Budget type (for set_budget)"
        },
        "limit_usd": {
          "type": "number",
          "description": "Budget limit in USD (for set_budget)"
        },
        "model": {
          "type": "string",
          "description": "Model to check (for check_model)"
        },
        "estimated_tokens": {
          "type": "number",
          "description": "Estimated tokens for the call (for check_model)",
          "default": 4096
        },
        "days": {
          "type": "number",
          "description": "Number of days of history (for get_history)",
          "default": 7
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "knowledge_engine",
    "description": "Semantic knowledge base with vector search. Store and search knowledge, code snippets, and prompt templates using AI-powered similarity matching. Supports automatic deduplication. Collections: knowledge, code_snippets, prompt_templates.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "search",
            "add",
            "similar",
            "deduplicate",
            "stats",
            "delete",
            "clear_collection",
            "batch_add"
          ],
          "description": "Action to perform"
        },
        "query": {
          "type": "string",
          "description": "Search query (for search, similar)"
        },
        "content": {
          "type": "string",
          "description": "Content to add (for add)"
        },
        "id": {
          "type": "string",
          "description": "Entry ID (for add, delete). Auto-generated if not provided."
        },
        "collection": {
          "type": "string",
          "enum": [
            "knowledge",
            "code_snippets",
            "prompt_templates"
          ],
          "description": "Collection to operate on",
          "default": "knowledge"
        },
        "metadata": {
          "type": "object",
          "description": "Metadata to attach (for add)",
          "properties": {}
        },
        "limit": {
          "type": "number",
          "description": "Max results (for search)",
          "default": 10
        },
        "threshold": {
          "type": "number",
          "description": "Minimum similarity threshold 0.0-1.0 (for search)",
          "default": 0.15
        },
        "items": {
          "type": "array",
          "description": "Array of items to add (for batch_add). Each item: { id?, content, metadata? }",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "content": {
                "type": "string"
              },
              "metadata": {
                "type": "object",
                "properties": {}
              }
            }
          }
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "auto_update",
    "description": "Auto-update daemon for the knowledge base. Periodically refreshes news, research papers, trending repos, and more from external APIs. Actions: status (check daemon state), run_now (trigger immediate update), configure (change intervals), history (view past updates), start/stop (control daemon).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "status",
            "run_now",
            "configure",
            "history",
            "start",
            "stop"
          ],
          "description": "Action to perform"
        },
        "source": {
          "type": "string",
          "enum": [
            "google_news",
            "arxiv",
            "openalex",
            "github_trends",
            "stackexchange",
            "crossref",
            "all"
          ],
          "description": "Which source to update (for run_now) or configure"
        },
        "interval_hours": {
          "type": "number",
          "description": "New update interval in hours (for configure)"
        },
        "limit": {
          "type": "number",
          "description": "Max entries to show (for history)",
          "default": 10
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "prompt_library",
    "description": "Automated prompt system with 20+ token-optimized templates. Auto-selects best prompt from context. Actions: auto (auto-pick from context), use (run named template), create, list, search, get, delete, update. Categories: coding, testing, security, architecture, education, documentation, research, planning, debugging, quick, agent.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "auto",
            "use",
            "create",
            "list",
            "search",
            "get",
            "delete",
            "update"
          ],
          "description": "Action. \"auto\" = auto-select best prompt from context."
        },
        "name": {
          "type": "string",
          "description": "Template name (for use, get, delete, update)"
        },
        "context": {
          "type": "string",
          "description": "Task context for auto-selection (for auto)"
        },
        "variables": {
          "type": "object",
          "description": "Variable values for interpolation (for use, auto)",
          "properties": {}
        },
        "template": {
          "type": "string",
          "description": "Template text with {{variable}} placeholders (for create, update)"
        },
        "variable_names": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Variable names (for create)"
        },
        "category": {
          "type": "string",
          "description": "Category filter (for create, list)"
        },
        "description": {
          "type": "string",
          "description": "Template description (for create)"
        },
        "triggers": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Auto-activation trigger phrases (for create)"
        },
        "query": {
          "type": "string",
          "description": "Search query (for search)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "browser",
    "description": "Browser automation via headless Chromium. Actions: navigate (go to URL), click (click element), type (enter text), screenshot (capture page), snapshot (accessibility tree), execute_js (run JavaScript), console_logs (get logs), close (close browser).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "navigate",
            "click",
            "type",
            "screenshot",
            "snapshot",
            "execute_js",
            "console_logs",
            "close"
          ],
          "description": "Browser action"
        },
        "url": {
          "type": "string",
          "description": "URL (navigate)"
        },
        "selector": {
          "type": "string",
          "description": "CSS selector (click, type)"
        },
        "text": {
          "type": "string",
          "description": "Text to type (type)"
        },
        "script": {
          "type": "string",
          "description": "JavaScript code (execute_js)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "swarm",
    "description": "Unified swarm capability cluster.\n- manage: from swarm\n",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "The specific sub-action to perform",
          "enum": [
            "manage"
          ]
        },
        "task_id": {
          "type": "string",
          "description": "Task ID (get_status, cancel)"
        },
        "title": {
          "type": "string",
          "description": "Task title (create_task)"
        },
        "description": {
          "type": "string",
          "description": "Task description"
        },
        "priority": {
          "type": "string",
          "description": "Task priority"
        },
        "agent_id": {
          "type": "string",
          "description": "Agent ID (agent_control)"
        },
        "command": {
          "type": "string",
          "description": "Control command (agent_control)"
        },
        "message": {
          "type": "string",
          "description": "Broadcast message"
        },
        "trigger": {
          "type": "object",
          "description": "Trigger config (register_trigger)"
        },
        "pipeline": {
          "type": "array",
          "description": "Pipeline steps (run_pipeline)",
          "items": {
            "type": "object"
          }
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "code",
    "description": "Unified code capability cluster.\n- execute: from sandbox_execute\n- analyze: from code_analysis\n",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "The specific sub-action to perform",
          "enum": [
            "execute",
            "analyze"
          ]
        },
        "code": {
          "type": "string",
          "description": "Source code to analyze"
        },
        "environment": {
          "type": "string",
          "description": "Runtime environment",
          "enum": [
            "python",
            "javascript"
          ],
          "default": "python"
        },
        "timeout": {
          "type": "number",
          "description": "Timeout in seconds",
          "default": 30
        },
        "language": {
          "type": "string",
          "enum": [
            "typescript",
            "javascript",
            "python",
            "rust",
            "go",
            "auto"
          ],
          "description": "Programming language (auto-detect if not specified)",
          "default": "auto"
        },
        "filename": {
          "type": "string",
          "description": "Optional filename (helps with language detection and context)"
        },
        "store_results": {
          "type": "boolean",
          "description": "Store analysis in knowledge engine",
          "default": false
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "api_request",
    "description": "Make an external API request through the gateway. Features: response caching, per-endpoint rate limiting, circuit breaker for failing endpoints, and cost tracking. Supports GET, POST, PUT, DELETE.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string",
          "description": "API endpoint URL"
        },
        "method": {
          "type": "string",
          "description": "HTTP method",
          "enum": [
            "GET",
            "POST",
            "PUT",
            "DELETE"
          ],
          "default": "GET"
        },
        "headers": {
          "type": "object",
          "description": "Request headers",
          "properties": {}
        },
        "body": {
          "type": "object",
          "description": "Request body (for POST/PUT)",
          "properties": {}
        },
        "cache_ttl": {
          "type": "number",
          "description": "Cache TTL in seconds (0 = no cache)",
          "default": 300
        },
        "timeout": {
          "type": "number",
          "description": "Request timeout in ms",
          "default": 30000
        }
      },
      "required": [
        "url"
      ]
    }
  },
  {
    "name": "ops",
    "description": "Unified ops capability cluster.\n- watcher: from watcher\n- webhook: from webhook\n- schedule: from schedule_task\n",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "The specific sub-action to perform",
          "enum": [
            "watcher",
            "webhook",
            "schedule"
          ]
        },
        "path": {
          "type": "string",
          "description": "Path to watch (create)"
        },
        "id": {
          "type": "string",
          "description": "Webhook ID (delete, test)"
        },
        "patterns": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Glob patterns (create)"
        },
        "url": {
          "type": "string",
          "description": "URL (create)"
        },
        "events": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Event types (create)"
        },
        "schedule_id": {
          "type": "string",
          "description": "Schedule ID (required for get/pause/resume/delete/run_now)"
        },
        "name": {
          "type": "string",
          "description": "Human-readable name for the schedule (for create)"
        },
        "schedule_type": {
          "type": "string",
          "enum": [
            "cron",
            "interval",
            "once"
          ],
          "description": "Type of schedule: cron expression, fixed interval, or one-time delayed"
        },
        "expression": {
          "type": "string",
          "description": "Cron expression (e.g. \"*/5 * * * *\") or interval in ms (e.g. \"60000\" for 1 min)"
        },
        "task_type": {
          "type": "string",
          "description": "Swarm task type to create when schedule fires"
        },
        "input_data": {
          "type": "object",
          "description": "Input data to pass to the created task",
          "properties": {}
        },
        "priority": {
          "type": "number",
          "description": "0=emergency, 1=high, 2=normal, 3=background"
        },
        "max_runs": {
          "type": "number",
          "description": "Maximum number of times to run (null = unlimited)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "workflow_execute",
    "description": "Execute a multi-step workflow (state machine) with conditional branching. Choose a built-in template (research_report, code_pipeline, content_creation) or define a custom workflow.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "template": {
          "type": "string",
          "description": "Built-in template name",
          "enum": [
            "research_report",
            "code_pipeline",
            "content_creation"
          ]
        },
        "custom_workflow": {
          "type": "object",
          "description": "Custom workflow definition (if not using a template)",
          "properties": {
            "name": {
              "type": "string"
            },
            "states": {
              "type": "object",
              "description": "Map of state IDs to state definitions",
              "properties": {}
            },
            "initial_state": {
              "type": "string"
            }
          }
        },
        "input": {
          "type": "object",
          "description": "Input data passed to the first step",
          "properties": {}
        },
        "priority": {
          "type": "number",
          "description": "Pipeline priority",
          "default": 2
        }
      }
    }
  },
  {
    "name": "notify",
    "description": "Send a notification to the user or retrieve notification history. Supports info, success, warning, and error levels. Notifications are stored in memory for later retrieval.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "send",
            "list",
            "mark_read",
            "clear"
          ],
          "description": "Action to perform",
          "default": "send"
        },
        "title": {
          "type": "string",
          "description": "Notification title (for send)"
        },
        "body": {
          "type": "string",
          "description": "Notification body/message (for send)"
        },
        "level": {
          "type": "string",
          "enum": [
            "info",
            "success",
            "warning",
            "error"
          ],
          "description": "Notification severity level",
          "default": "info"
        },
        "channel": {
          "type": "string",
          "description": "Notification channel (e.g. \"swarm\", \"task\", \"system\")",
          "default": "system"
        },
        "metadata": {
          "type": "object",
          "description": "Optional metadata to attach to the notification",
          "properties": {}
        },
        "notification_id": {
          "type": "string",
          "description": "Notification ID (for mark_read)"
        },
        "limit": {
          "type": "number",
          "description": "Max notifications to return (for list)",
          "default": 20
        },
        "unread_only": {
          "type": "boolean",
          "description": "Only return unread notifications (for list)",
          "default": false
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "intel",
    "description": "Unified intel capability cluster.\n- metrics: from agent_intel\n",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "The specific sub-action to perform",
          "enum": [
            "metrics"
          ]
        },
        "agent_id": {
          "type": "string",
          "description": "Agent ID"
        },
        "message": {
          "type": "string",
          "description": "Message content (conversation)"
        },
        "thread_id": {
          "type": "string",
          "description": "Thread ID (conversation)"
        },
        "trace_id": {
          "type": "string",
          "description": "Trace ID (reasoning_trace)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "agent_ops",
    "description": "Agent operational tools. Actions: data_stream (pub/sub data streams), goal_tracker (track goals/milestones), ab_test (compare model outputs).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "data_stream",
            "goal_tracker",
            "ab_test"
          ],
          "description": "Operations action"
        },
        "stream_id": {
          "type": "string",
          "description": "Stream ID (data_stream)"
        },
        "goal": {
          "type": "string",
          "description": "Goal description (goal_tracker)"
        },
        "test_name": {
          "type": "string",
          "description": "Test name (ab_test)"
        },
        "variants": {
          "type": "array",
          "description": "Test variants (ab_test)",
          "items": {
            "type": "object"
          }
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_health_check",
    "description": "Comprehensive diagnostics for the VegaMCP server. Checks API key validity, database integrity, Ollama reachability, Playwright status, swarm health, vector store, token budget, and data directory. Use this to verify everything is working correctly.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "verbose": {
          "type": "boolean",
          "description": "Include detailed diagnostics for each check",
          "default": false
        },
        "checks": {
          "type": "array",
          "description": "Specific checks to run. Default: all. Options: api_keys, database, ollama, playwright, swarm, vector_store, budget, disk",
          "items": {
            "type": "string"
          }
        }
      },
      "required": []
    }
  },
  {
    "name": "vegamcp_analytics",
    "description": "Real-time analytics for the VegaMCP server. Track tool usage frequency, latency, error rates, agent performance, and session timeline. Use to understand which tools are most used, which are slowest, and identify bottlenecks.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "dashboard",
            "tool_usage",
            "errors",
            "timeline",
            "top_tools",
            "session_info",
            "reset"
          ],
          "description": "Action to perform"
        },
        "tool": {
          "type": "string",
          "description": "Filter by specific tool name (for tool_usage, timeline)"
        },
        "limit": {
          "type": "number",
          "description": "Max results to return",
          "default": 20
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_skills",
    "description": "Advanced skills engine. Skills are self-contained instruction folders that teach agents HOW to do tasks. Features: auto-activation triggers, multi-file skills, vector search, usage tracking, skill chaining, and runtime creation. Better than Anthropic's skill system.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "list",
            "get",
            "create",
            "update",
            "delete",
            "search",
            "activate",
            "rate",
            "import_from_url",
            "seed_defaults"
          ],
          "description": "Action to perform"
        },
        "name": {
          "type": "string",
          "description": "Skill name (for get, create, update, delete, activate, rate)"
        },
        "description": {
          "type": "string",
          "description": "Skill description (for create)"
        },
        "instructions": {
          "type": "string",
          "description": "Skill instructions in markdown (for create, update)"
        },
        "category": {
          "type": "string",
          "description": "Skill category (for create, list filter)"
        },
        "triggers": {
          "type": "array",
          "description": "Auto-activation trigger phrases (for create, update)",
          "items": {
            "type": "string"
          }
        },
        "tags": {
          "type": "array",
          "description": "Tags for categorization (for create, update)",
          "items": {
            "type": "string"
          }
        },
        "query": {
          "type": "string",
          "description": "Search query (for search)"
        },
        "context": {
          "type": "string",
          "description": "Current conversation context to match triggers (for activate)"
        },
        "rating": {
          "type": "number",
          "description": "Rating 1-5 (for rate)"
        },
        "url": {
          "type": "string",
          "description": "GitHub raw URL to import SKILL.md from (for import_from_url)"
        },
        "files": {
          "type": "object",
          "description": "Additional files to include in the skill (for create). Key=filename, value=content",
          "properties": {}
        },
        "limit": {
          "type": "number",
          "description": "Max results",
          "default": 20
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_filesystem",
    "description": "Read, write, search, and manage local files. Secure with configurable access controls. Actions: read_file, write_file, list_directory, search_files, get_file_info, move_file, delete_file, create_directory, read_multiple.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "read_file",
            "write_file",
            "list_directory",
            "search_files",
            "get_file_info",
            "move_file",
            "delete_file",
            "create_directory",
            "read_multiple"
          ],
          "description": "Action to perform"
        },
        "path": {
          "type": "string",
          "description": "File or directory path"
        },
        "content": {
          "type": "string",
          "description": "Content to write (for write_file)"
        },
        "destination": {
          "type": "string",
          "description": "Destination path (for move_file)"
        },
        "pattern": {
          "type": "string",
          "description": "Search pattern — glob or text (for search_files)"
        },
        "recursive": {
          "type": "boolean",
          "description": "Search recursively (default true)"
        },
        "encoding": {
          "type": "string",
          "description": "File encoding (default utf-8)"
        },
        "paths": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Multiple file paths (for read_multiple)"
        },
        "max_depth": {
          "type": "number",
          "description": "Max directory depth for listing"
        },
        "append": {
          "type": "boolean",
          "description": "Append to file instead of overwrite (for write_file)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_git",
    "description": "Git version control operations — status, log, diff, commit, branch, checkout, add, blame, stash, tag. Actions: status, log, diff, commit, branch_list, branch_create, checkout, add, blame, stash, tag, remote, reset, show.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "status",
            "log",
            "diff",
            "commit",
            "branch_list",
            "branch_create",
            "checkout",
            "add",
            "blame",
            "stash",
            "tag",
            "remote",
            "reset",
            "show"
          ],
          "description": "Git action to perform"
        },
        "path": {
          "type": "string",
          "description": "File path (for add, blame, diff)"
        },
        "message": {
          "type": "string",
          "description": "Commit message (for commit)"
        },
        "branch": {
          "type": "string",
          "description": "Branch name (for branch_create, checkout)"
        },
        "limit": {
          "type": "number",
          "description": "Max entries to return (for log, default 20)"
        },
        "ref": {
          "type": "string",
          "description": "Git ref — commit hash, branch, or tag (for show, diff, reset)"
        },
        "cwd": {
          "type": "string",
          "description": "Working directory (defaults to WORKSPACE_ROOT)"
        },
        "stash_action": {
          "type": "string",
          "description": "Stash sub-action: push, pop, list, drop"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_sequential_thinking",
    "description": "Dynamic chain-of-thought reasoning with branching and revision. Break complex problems into sequential thought steps, revise earlier thinking, and explore alternative branches. Actions: start, think, revise, branch, summarize, list_sessions, get_session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "start",
            "think",
            "revise",
            "branch",
            "summarize",
            "list_sessions",
            "get_session"
          ],
          "description": "Action to perform"
        },
        "session_id": {
          "type": "string",
          "description": "Session ID (auto-generated on start)"
        },
        "title": {
          "type": "string",
          "description": "Problem title (for start)"
        },
        "thought": {
          "type": "string",
          "description": "The thought content (for think, revise, branch)"
        },
        "reasoning": {
          "type": "string",
          "description": "Why this thought follows from the previous (for think, revise)"
        },
        "confidence": {
          "type": "number",
          "description": "Confidence in this thought 0.0-1.0 (for think, revise)"
        },
        "revises_step": {
          "type": "number",
          "description": "Step number being revised (for revise)"
        },
        "branch_name": {
          "type": "string",
          "description": "Name for the alternative branch (for branch)"
        },
        "next_step_needed": {
          "type": "boolean",
          "description": "Whether more thinking is needed (for think). Set false to indicate conclusion."
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_database",
    "description": "Query SQLite databases, CSV, and JSON files. Open databases, run SQL queries, list tables, describe schemas, and export data. Actions: open, query, execute, list_tables, describe_table, close, list_connections, query_csv, query_json.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "open",
            "query",
            "execute",
            "list_tables",
            "describe_table",
            "close",
            "list_connections",
            "query_csv",
            "query_json"
          ],
          "description": "Action to perform"
        },
        "db_id": {
          "type": "string",
          "description": "Database connection ID (auto-generated on open, required for other actions)"
        },
        "path": {
          "type": "string",
          "description": "Path to database file (for open, query_csv, query_json)"
        },
        "sql": {
          "type": "string",
          "description": "SQL query to execute (for query, execute)"
        },
        "table": {
          "type": "string",
          "description": "Table name (for describe_table)"
        },
        "limit": {
          "type": "number",
          "description": "Max rows to return (default 100)"
        },
        "read_only": {
          "type": "boolean",
          "description": "Open in read-only mode (default true)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_document_reader",
    "description": "Read and parse documents — text, Markdown, HTML, CSV, JSON, and basic PDF text extraction. Actions: read, extract_metadata, search_content, summarize_structure, batch_read.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "read",
            "extract_metadata",
            "search_content",
            "summarize_structure",
            "batch_read"
          ],
          "description": "Action to perform"
        },
        "path": {
          "type": "string",
          "description": "Path to the document"
        },
        "paths": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Multiple file paths (for batch_read)"
        },
        "query": {
          "type": "string",
          "description": "Text to search for (for search_content)"
        },
        "max_length": {
          "type": "number",
          "description": "Max characters to return (default 50000)"
        },
        "format": {
          "type": "string",
          "description": "Override format detection: text, markdown, html, csv, json, pdf"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_shell",
    "description": "Execute shell commands with safety controls, timeout, and output capture. Supports running commands, background processes, and environment info. ⚠️ Use responsibly. Actions: execute, execute_background, get_output, kill, system_info, which, env.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "execute",
            "execute_background",
            "get_output",
            "kill",
            "system_info",
            "which",
            "env"
          ],
          "description": "Action to perform"
        },
        "command": {
          "type": "string",
          "description": "Shell command to execute"
        },
        "cwd": {
          "type": "string",
          "description": "Working directory (defaults to WORKSPACE_ROOT)"
        },
        "timeout": {
          "type": "number",
          "description": "Timeout in seconds (default 30, max 300)"
        },
        "process_id": {
          "type": "string",
          "description": "Process ID (for get_output, kill)"
        },
        "program": {
          "type": "string",
          "description": "Program name (for which)"
        },
        "var_name": {
          "type": "string",
          "description": "Environment variable name (for env)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_vault",
    "description": "Obsidian/Notion-style local knowledge base. Read, write, search, and analyze markdown notes with wiki-link support, daily notes, tags, and backlink graphs. Actions: read_note, write_note, search, list_notes, link_graph, daily_note, tags, recent, delete_note.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "read_note",
            "write_note",
            "search",
            "list_notes",
            "link_graph",
            "daily_note",
            "tags",
            "recent",
            "delete_note"
          ],
          "description": "Action to perform"
        },
        "name": {
          "type": "string",
          "description": "Note name (without .md extension)"
        },
        "content": {
          "type": "string",
          "description": "Note content in Markdown (for write_note)"
        },
        "query": {
          "type": "string",
          "description": "Search query (for search)"
        },
        "folder": {
          "type": "string",
          "description": "Subfolder within vault (for write_note, list_notes)"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Tags to add to note (for write_note)"
        },
        "append": {
          "type": "boolean",
          "description": "Append to existing note (for write_note)"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default 20)"
        },
        "vault_path": {
          "type": "string",
          "description": "Override vault path (defaults to VAULT_PATH or OBSIDIAN_VAULT env)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "vegamcp_seed_data",
    "description": "Manage built-in knowledge libraries: PolyAlgo (160+ algorithms), EasyPrompts (150+ prompt templates), and BugTaxonomy (17 categories, 400+ keywords). Actions: seed (load all), status, search_algorithms, search_prompts, classify_bug, taxonomy_info.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "seed",
            "status",
            "search_algorithms",
            "search_prompts",
            "classify_bug",
            "classify_commits",
            "taxonomy_info"
          ],
          "description": "Action to perform"
        },
        "query": {
          "type": "string",
          "description": "Search query (for search_algorithms, search_prompts)"
        },
        "text": {
          "type": "string",
          "description": "Text to classify (for classify_bug)"
        },
        "lines": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Commit messages to classify (for classify_commits)"
        },
        "category": {
          "type": "string",
          "description": "Filter by category (for search_algorithms, search_prompts)"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default 10)"
        },
        "force": {
          "type": "boolean",
          "description": "Force re-seed even if already seeded"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "mobile_testing",
    "description": "AI-first mobile app testing. Manage Android emulators and iOS simulators, install & launch apps, take screenshots, dump UI hierarchy (accessibility tree), capture structured logcat, simulate touch/swipe/type, profile performance, simulate network/battery/orientation changes, record screen, and extract crash logs. All outputs are structured JSON optimized for AI consumption. Actions: \n  Android: avd_list, avd_create, emulator_start, emulator_stop, device_list, app_install, app_launch, app_stop, app_clear, screenshot, ui_tree, logcat, touch, swipe, type_text, key_event, shell, performance, network_sim, battery_sim, orientation, screen_record, crash_logs, monkey_test.\n  iOS (macOS only): sim_list, sim_create, sim_boot, sim_shutdown, sim_install, sim_launch, sim_screenshot, sim_ui_tree, sim_logs.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "platform": {
          "type": "string",
          "enum": [
            "android",
            "ios"
          ],
          "default": "android",
          "description": "Target platform"
        },
        "action": {
          "type": "string",
          "enum": [
            "avd_list",
            "avd_create",
            "emulator_start",
            "emulator_stop",
            "device_list",
            "app_install",
            "app_launch",
            "app_stop",
            "app_clear",
            "screenshot",
            "ui_tree",
            "screen_record",
            "touch",
            "swipe",
            "type_text",
            "key_event",
            "logcat",
            "crash_logs",
            "performance",
            "network_sim",
            "battery_sim",
            "orientation",
            "shell",
            "monkey_test",
            "sim_list",
            "sim_create",
            "sim_boot",
            "sim_shutdown",
            "sim_install",
            "sim_launch",
            "sim_screenshot",
            "sim_ui_tree",
            "sim_logs"
          ],
          "description": "Testing action to perform"
        },
        "device_id": {
          "type": "string",
          "description": "Device/emulator serial (default: first available)"
        },
        "avd_name": {
          "type": "string",
          "description": "AVD name (avd_create, emulator_start)"
        },
        "system_image": {
          "type": "string",
          "description": "System image (avd_create), e.g. \"system-images;android-35;google_apis;x86_64\""
        },
        "device_profile": {
          "type": "string",
          "description": "Device profile (avd_create), e.g. \"pixel_7\"",
          "default": "pixel_7"
        },
        "apk_path": {
          "type": "string",
          "description": "Path to APK file (app_install)"
        },
        "package_name": {
          "type": "string",
          "description": "Package name (app_launch, app_stop, app_clear)"
        },
        "activity_name": {
          "type": "string",
          "description": "Activity to launch (app_launch)"
        },
        "x": {
          "type": "number",
          "description": "X coordinate (touch, swipe start)"
        },
        "y": {
          "type": "number",
          "description": "Y coordinate (touch, swipe start)"
        },
        "x2": {
          "type": "number",
          "description": "End X coordinate (swipe)"
        },
        "y2": {
          "type": "number",
          "description": "End Y coordinate (swipe)"
        },
        "duration_ms": {
          "type": "number",
          "description": "Duration in ms (swipe, screen_record)",
          "default": 300
        },
        "text": {
          "type": "string",
          "description": "Text to type (type_text)"
        },
        "key_code": {
          "type": "string",
          "description": "Key event code (key_event), e.g. \"KEYCODE_HOME\", \"KEYCODE_BACK\""
        },
        "command": {
          "type": "string",
          "description": "Raw ADB shell command (shell)"
        },
        "log_level": {
          "type": "string",
          "enum": [
            "verbose",
            "debug",
            "info",
            "warn",
            "error",
            "fatal"
          ],
          "default": "info",
          "description": "Minimum log level (logcat)"
        },
        "log_lines": {
          "type": "number",
          "description": "Number of recent log lines (logcat)",
          "default": 50
        },
        "log_filter": {
          "type": "string",
          "description": "Tag filter for logcat, e.g. \"WebView:*\" or package name"
        },
        "perf_metric": {
          "type": "string",
          "enum": [
            "memory",
            "cpu",
            "battery",
            "gfx",
            "network",
            "all"
          ],
          "default": "all",
          "description": "Performance metric to collect"
        },
        "network_type": {
          "type": "string",
          "enum": [
            "wifi",
            "lte",
            "3g",
            "edge",
            "none",
            "full"
          ],
          "default": "full",
          "description": "Network condition to simulate"
        },
        "battery_level": {
          "type": "number",
          "description": "Battery level 0-100 (battery_sim)"
        },
        "battery_charging": {
          "type": "boolean",
          "description": "Whether charging (battery_sim)",
          "default": false
        },
        "rotation": {
          "type": "string",
          "enum": [
            "0",
            "1",
            "2",
            "3"
          ],
          "description": "0=portrait, 1=landscape-left, 2=portrait-inverted, 3=landscape-right"
        },
        "monkey_events": {
          "type": "number",
          "description": "Number of random events (monkey_test)",
          "default": 500
        },
        "full_page": {
          "type": "boolean",
          "description": "Capture full scrollable content (screenshot)",
          "default": false
        },
        "sim_device_type": {
          "type": "string",
          "description": "iOS device type (sim_create), e.g. \"iPhone 15 Pro\""
        },
        "sim_runtime": {
          "type": "string",
          "description": "iOS runtime (sim_create), e.g. \"iOS-17-0\""
        },
        "bundle_id": {
          "type": "string",
          "description": "iOS bundle ID (sim_launch)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "web_testing",
    "description": "Web application quality testing via Playwright. Actions: lighthouse (performance audit with scores), visual_regression (screenshot comparison), responsive_test (multi-viewport check), console_audit (error/warning capture), network_waterfall (resource timing analysis), form_test (form validation testing), link_check (broken link detection), storage_audit (cookies/localStorage), css_coverage (unused style detection), core_web_vitals (LCP/CLS/TTFB measurement). All outputs include ai_analysis blocks.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "lighthouse",
            "visual_regression",
            "responsive_test",
            "console_audit",
            "network_waterfall",
            "form_test",
            "link_check",
            "storage_audit",
            "css_coverage",
            "core_web_vitals"
          ],
          "description": "Testing action to perform"
        },
        "url": {
          "type": "string",
          "description": "URL to test (required for most actions)"
        },
        "baseline_name": {
          "type": "string",
          "description": "Name for the baseline screenshot (visual_regression)"
        },
        "threshold": {
          "type": "number",
          "description": "Pixel diff threshold 0.0-1.0 (visual_regression)",
          "default": 0.1
        },
        "viewports": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Custom viewports [{width, height, name}] (responsive_test). Defaults to mobile/tablet/desktop."
        },
        "form_selector": {
          "type": "string",
          "description": "CSS selector for the form (form_test)"
        },
        "max_depth": {
          "type": "number",
          "description": "Max crawl depth for link_check (default: 1)",
          "default": 1
        },
        "min_level": {
          "type": "string",
          "enum": [
            "log",
            "info",
            "warning",
            "error"
          ],
          "default": "warning",
          "description": "Minimum console level to capture"
        },
        "include_external": {
          "type": "boolean",
          "description": "Include external stylesheets in coverage (css_coverage)",
          "default": true
        },
        "timeout": {
          "type": "number",
          "description": "Navigation timeout in ms",
          "default": 30000
        },
        "wait_for": {
          "type": "string",
          "enum": [
            "load",
            "domcontentloaded",
            "networkidle"
          ],
          "default": "load",
          "description": "Wait condition before testing"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "api_testing",
    "description": "API quality testing platform. Actions: discover_endpoints (parse OpenAPI/Swagger specs), contract_test (validate responses against schema), load_test (concurrent request stress testing), auth_flow (test authentication flows), validate_response (check status/schema/timing), sequence_test (multi-step API workflows), mock_server (stub endpoints for dev), diff_test (compare endpoint responses across environments). All outputs include ai_analysis blocks.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "discover_endpoints",
            "contract_test",
            "load_test",
            "auth_flow",
            "validate_response",
            "sequence_test",
            "mock_server",
            "diff_test"
          ],
          "description": "API testing action to perform"
        },
        "url": {
          "type": "string",
          "description": "API endpoint URL"
        },
        "method": {
          "type": "string",
          "enum": [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "HEAD",
            "OPTIONS"
          ],
          "default": "GET",
          "description": "HTTP method"
        },
        "headers": {
          "type": "object",
          "description": "Request headers as key-value pairs"
        },
        "body": {
          "type": "object",
          "description": "Request body (for POST/PUT/PATCH)"
        },
        "timeout": {
          "type": "number",
          "description": "Request timeout in ms",
          "default": 10000
        },
        "spec_url": {
          "type": "string",
          "description": "OpenAPI/Swagger spec URL (discover_endpoints)"
        },
        "expected_status": {
          "type": "number",
          "description": "Expected HTTP status code (contract_test, validate_response)"
        },
        "expected_schema": {
          "type": "object",
          "description": "Expected JSON schema for response validation"
        },
        "concurrency": {
          "type": "number",
          "description": "Number of concurrent requests (load_test)",
          "default": 10
        },
        "total_requests": {
          "type": "number",
          "description": "Total requests to send (load_test)",
          "default": 50
        },
        "ramp_up_ms": {
          "type": "number",
          "description": "Ramp-up period in ms (load_test)",
          "default": 1000
        },
        "auth_type": {
          "type": "string",
          "enum": [
            "bearer",
            "basic",
            "api_key",
            "oauth2"
          ],
          "description": "Authentication type (auth_flow)"
        },
        "auth_credentials": {
          "type": "object",
          "description": "Auth credentials { token?, username?, password?, key?, client_id?, client_secret?, token_url? }"
        },
        "steps": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Sequence steps [{method, url, headers?, body?, extract?, assert?}] (sequence_test)"
        },
        "url_b": {
          "type": "string",
          "description": "Second URL to compare against (diff_test)"
        },
        "mock_routes": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Mock routes [{method, path, status, response}] (mock_server)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "accessibility",
    "description": "WCAG accessibility compliance testing via Playwright. Actions: wcag_audit (full WCAG 2.1 check with severity scoring), contrast_check (color contrast ratio validation), keyboard_nav (tab order and focus trap detection), aria_audit (ARIA role/label/state validation), screen_reader (landmark and live region testing), focus_management (focus indicator and logical flow testing). All outputs include ai_analysis blocks with WCAG violation details.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "wcag_audit",
            "contrast_check",
            "keyboard_nav",
            "aria_audit",
            "screen_reader",
            "focus_management"
          ],
          "description": "Accessibility testing action to perform"
        },
        "url": {
          "type": "string",
          "description": "URL to test (required for most actions)"
        },
        "level": {
          "type": "string",
          "enum": [
            "A",
            "AA",
            "AAA"
          ],
          "default": "AA",
          "description": "WCAG conformance level to check"
        },
        "max_tabs": {
          "type": "number",
          "description": "Max Tab key presses for keyboard_nav (default: 50)",
          "default": 50
        },
        "selector": {
          "type": "string",
          "description": "Optional CSS selector to scope the audit"
        },
        "timeout": {
          "type": "number",
          "description": "Navigation timeout in ms",
          "default": 30000
        },
        "wait_for": {
          "type": "string",
          "enum": [
            "load",
            "domcontentloaded",
            "networkidle"
          ],
          "default": "load",
          "description": "Wait condition before testing"
        },
        "include_passing": {
          "type": "boolean",
          "description": "Include passing checks in output",
          "default": false
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "web",
    "description": "Unified web capability cluster.\n- github: from github_scraper\n- search: from web_search\n",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "The specific sub-action to perform",
          "enum": [
            "github",
            "search"
          ]
        },
        "query": {
          "type": "string",
          "description": "Search query (for search, batch_search)"
        },
        "language": {
          "type": "string",
          "description": "Programming language filter (e.g., typescript, python, rust)"
        },
        "owner": {
          "type": "string",
          "description": "Repository owner (for fetch_file, analyze_repo)"
        },
        "repo": {
          "type": "string",
          "description": "Repository name (for fetch_file, analyze_repo)"
        },
        "path": {
          "type": "string",
          "description": "File path within repo (for fetch_file)"
        },
        "branch": {
          "type": "string",
          "description": "Branch name (for fetch_file)",
          "default": "main"
        },
        "sort": {
          "type": "string",
          "enum": [
            "stars",
            "forks",
            "updated",
            "best-match"
          ],
          "description": "Sort order",
          "default": "best-match"
        },
        "per_page": {
          "type": "number",
          "description": "Results per page (max 30)",
          "default": 10
        },
        "stars_min": {
          "type": "number",
          "description": "Minimum stars filter (for search_repos)"
        },
        "since": {
          "type": "string",
          "enum": [
            "daily",
            "weekly",
            "monthly"
          ],
          "description": "Trending timeframe",
          "default": "weekly"
        },
        "store_results": {
          "type": "boolean",
          "description": "Store results in knowledge engine",
          "default": false
        },
        "url": {
          "type": "string",
          "description": "URL to read (for read_url, summarize_url)"
        },
        "urls": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Multiple URLs to read (for batch_search)"
        },
        "num_results": {
          "type": "number",
          "description": "Number of results (max 20)",
          "default": 5
        },
        "search_depth": {
          "type": "string",
          "enum": [
            "basic",
            "advanced"
          ],
          "description": "Search depth (Tavily). Advanced provides better results but uses more credits.",
          "default": "basic"
        },
        "include_answer": {
          "type": "boolean",
          "description": "Include AI-generated answer summary (Tavily)",
          "default": true
        },
        "max_content_length": {
          "type": "number",
          "description": "Max content length per page (chars)",
          "default": 5000
        },
        "queries": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Multiple queries for batch_search (max 5)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "self_evolution",
    "description": "Self-Evolution Engine (RLM 2.0) — The feedback transformer that lets the system learn from its own mistakes. Records failures as guardrails, tracks successes as patterns, consolidates memory, and provides evolution metrics. Actions: record_failure (learn from error), record_success (reinforce good patterns), recall_failures (query past mistakes), recall_constraints (query learned guardrails), consolidate (run nightly memory promotion), evolve_constraint (refine an existing guardrail), metrics (system self-assessment), pre_check (query before attempting something new).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "record_failure",
            "record_success",
            "recall_failures",
            "recall_constraints",
            "consolidate",
            "evolve_constraint",
            "metrics",
            "pre_check"
          ],
          "description": "Action to perform"
        },
        "error_log": {
          "type": "string",
          "description": "Error log or failure description (for record_failure)"
        },
        "context": {
          "type": "string",
          "description": "Context of the execution (what was being attempted)"
        },
        "hypothesis_id": {
          "type": "string",
          "description": "Linked hypothesis ID (optional)"
        },
        "constraint": {
          "type": "string",
          "description": "Suggested constraint/guardrail to learn (for record_failure)"
        },
        "success_description": {
          "type": "string",
          "description": "Description of what succeeded (for record_success)"
        },
        "pattern": {
          "type": "string",
          "description": "Pattern extracted from success (for record_success)"
        },
        "query": {
          "type": "string",
          "description": "Search query (for recall_failures, recall_constraints, pre_check)"
        },
        "constraint_id": {
          "type": "string",
          "description": "ID of constraint to evolve (for evolve_constraint)"
        },
        "refined_constraint": {
          "type": "string",
          "description": "Updated constraint text (for evolve_constraint)"
        },
        "limit": {
          "type": "number",
          "description": "Max results to return (default: 10)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "quality_gate",
    "description": "Quality Gate & Regression Tracker — monitors system quality over time. Records snapshots of quality metrics, detects regressions (score drops), provides trend data, and enforces quality gates (pass/fail thresholds). Tracks arbitrary dimensions: task_performance, knowledge_quality, hypothesis_success, agent_efficiency, system_health, code_quality, data_accuracy, user_satisfaction.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "record",
            "check",
            "trend",
            "history",
            "gate",
            "clear"
          ],
          "description": "Action to perform"
        },
        "dimension": {
          "type": "string",
          "enum": [
            "task_performance",
            "knowledge_quality",
            "hypothesis_success",
            "agent_efficiency",
            "system_health",
            "code_quality",
            "data_accuracy",
            "user_satisfaction",
            "custom"
          ],
          "description": "Quality dimension to track"
        },
        "score": {
          "type": "number",
          "description": "Quality score 0.0-100.0 (for record)"
        },
        "metadata": {
          "type": "object",
          "properties": {},
          "description": "Additional metadata for the snapshot"
        },
        "notes": {
          "type": "string",
          "description": "Human-readable notes for the snapshot"
        },
        "threshold": {
          "type": "number",
          "description": "Regression threshold — minimum score drop to flag (default: 5.0)"
        },
        "gate_minimum": {
          "type": "number",
          "description": "Gate minimum score — below this = fail (for gate action, default: 60)"
        },
        "last_n": {
          "type": "number",
          "description": "Number of snapshots to show (default: 20)"
        },
        "source": {
          "type": "string",
          "description": "Source of the snapshot (e.g., agent:visionary, tool:hypothesis_gen)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "stress_test",
    "description": "Stress Test Engine — fuzz/chaos testing for AI pipelines. Inject adverse conditions (API failures, rate limits, corrupted data, cascade failures, resource exhaustion, timeouts, concurrent overload, garbage input) and check that the system degrades gracefully. Built-in blueprints test common failure modes. Custom blueprints supported. Actions: run (execute a blueprint), run_all (full stress suite), list (show blueprints), create (custom blueprint), history (past runs).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "run",
            "run_all",
            "list",
            "create",
            "history"
          ],
          "description": "Action to perform"
        },
        "blueprint": {
          "type": "string",
          "description": "Blueprint name to run (for run action)"
        },
        "target": {
          "type": "string",
          "description": "Target system/pipeline to stress test (e.g., \"memory_bridge\", \"hypothesis_gen\", \"swarm\")"
        },
        "intensity": {
          "type": "number",
          "description": "Stress intensity 0.1-10.0 (default: 1.0)"
        },
        "custom_steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "delay_ms": {
                "type": "number"
              },
              "event_type": {
                "type": "string"
              },
              "magnitude": {
                "type": "number"
              },
              "description": {
                "type": "string"
              }
            }
          },
          "description": "Custom stress steps (for create action)"
        },
        "custom_assertions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "check": {
                "type": "string"
              },
              "value": {},
              "description": {
                "type": "string"
              }
            }
          },
          "description": "Custom assertions to check after stress (for create action)"
        },
        "last_n": {
          "type": "number",
          "description": "Number of historical results to show (default: 20)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "sentinel",
    "description": "Sentinel — self-healing diagnostic system. Captures crash forensics, auto-fixes known problems, runs diagnostic clinics, detects anomalies, and grades system health. Actions: diagnose (full system check), snapshot (record a failure), heal (auto-fix a known problem), register_fix (add new auto-fix), list_fixes (show available fixes), anomaly_check (detect degradation), grade (overall health grade), history (past diagnostics).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "diagnose",
            "snapshot",
            "heal",
            "register_fix",
            "list_fixes",
            "anomaly_check",
            "grade",
            "history"
          ],
          "description": "Action to perform"
        },
        "error_type": {
          "type": "string",
          "description": "Exception/error type name"
        },
        "error_message": {
          "type": "string",
          "description": "Error message"
        },
        "stack_trace": {
          "type": "string",
          "description": "Stack trace or context"
        },
        "component": {
          "type": "string",
          "description": "Component that failed (e.g., memory_bridge, swarm, hypothesis_gen)"
        },
        "context": {
          "type": "object",
          "properties": {},
          "description": "Additional context data"
        },
        "pattern_id": {
          "type": "string",
          "description": "Pattern ID to heal or register"
        },
        "fix_name": {
          "type": "string",
          "description": "Human-readable fix name"
        },
        "fix_description": {
          "type": "string",
          "description": "Description of what the fix does"
        },
        "fix_action": {
          "type": "string",
          "description": "Fix action code/instructions"
        },
        "safe": {
          "type": "boolean",
          "description": "Whether the fix has no side effects (default: true)"
        },
        "subsystem": {
          "type": "string",
          "enum": [
            "all",
            "memory",
            "swarm",
            "tools",
            "database",
            "network",
            "security"
          ],
          "description": "Subsystem to diagnose (default: all)"
        },
        "last_n": {
          "type": "number",
          "description": "Number of entries to show (default: 20)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "security",
    "description": "Unified security capability cluster.\n- scan: from security_scanner\n",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "The specific sub-action to perform",
          "enum": [
            "scan"
          ]
        },
        "code": {
          "type": "string",
          "description": "Source code to scan (for scan action)"
        },
        "file_path": {
          "type": "string",
          "description": "Absolute file path to scan (for scan_file action)"
        },
        "language": {
          "type": "string",
          "enum": [
            "auto",
            "python",
            "javascript",
            "typescript",
            "rust",
            "go",
            "c",
            "cpp",
            "java",
            "html",
            "css"
          ],
          "description": "Language hint (default: auto-detect from extension)"
        },
        "categories": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Categories to scan for (default: all). Options: security, gui, logic, performance, crash, data, concurrency, config"
        },
        "severity_min": {
          "type": "string",
          "enum": [
            "info",
            "low",
            "medium",
            "high",
            "critical"
          ],
          "description": "Minimum severity to report (default: low)"
        },
        "max_findings": {
          "type": "number",
          "description": "Max findings to return (default: 50)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "graph_rag",
    "description": "GraphRAG — Hybrid retrieval combining knowledge graph traversal with vector similarity search. Builds rich retrieval context for LLM queries by fusing structured entity-relation data with semantic similarity results. Strategies: vector (fast), graph (precise), hybrid (best). Returns formatted context blocks with provenance.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "The retrieval query"
        },
        "strategy": {
          "type": "string",
          "enum": [
            "vector",
            "graph",
            "hybrid"
          ],
          "description": "Retrieval strategy (default: hybrid)"
        },
        "max_results": {
          "type": "number",
          "description": "Max results per source (default: 10)"
        },
        "depth": {
          "type": "number",
          "description": "Graph traversal depth for entity relations (default: 2)"
        },
        "collections": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Vector collections to search (default: all)"
        },
        "format": {
          "type": "string",
          "enum": [
            "context",
            "json",
            "markdown"
          ],
          "description": "Output format (default: context)"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "protocol",
    "description": "Unified protocol capability cluster.\n- discovery: from tool_discovery\n- gateway: from gateway\n- search: from tool_search\n- apps: from mcp_apps\n- embeddings: from multimodal_embeddings\n- auth: from zero_trust\n",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "The specific sub-action to perform",
          "enum": [
            "discovery",
            "gateway",
            "search",
            "apps",
            "embeddings",
            "auth"
          ]
        },
        "query": {
          "type": "string",
          "description": "Search query (for search)"
        },
        "category": {
          "type": "string",
          "description": "Filter by category"
        },
        "limit": {
          "type": "number"
        },
        "tool_name": {
          "type": "string",
          "description": "Tool name (for get_schema)"
        },
        "tool_description": {
          "type": "string",
          "description": "Description of tool capability"
        },
        "tool_category": {
          "type": "string",
          "description": "Category for the tool"
        },
        "tool_tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Tags for discoverability"
        },
        "user_id": {
          "type": "string",
          "description": "Filter by user (for audit_log)"
        },
        "only_blocked": {
          "type": "boolean",
          "description": "Only show blocked calls"
        },
        "text": {
          "type": "string",
          "description": "Text to check for prompt injection"
        },
        "data": {
          "type": "object",
          "description": "Data to visualize (varies by action)"
        },
        "entities": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Entities for graph visualization"
        },
        "relations": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Relations for graph visualization"
        },
        "agents": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Agents for swarm monitor"
        },
        "tasks": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Tasks for swarm monitor"
        },
        "html": {
          "type": "string",
          "description": "Custom HTML (for custom action)"
        },
        "title": {
          "type": "string",
          "description": "App title"
        },
        "content": {
          "type": "string",
          "description": "Text content or description"
        },
        "modality": {
          "type": "string",
          "enum": [
            "text",
            "image",
            "audio",
            "mixed"
          ],
          "description": "Filter by modality"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "mime_type": {
          "type": "string"
        },
        "path": {
          "type": "string",
          "description": "Original file path"
        },
        "duration": {
          "type": "number",
          "description": "Audio duration in seconds"
        },
        "width": {
          "type": "number"
        },
        "height": {
          "type": "number"
        },
        "min_score": {
          "type": "number",
          "description": "Minimum similarity score (default: 0.1)"
        },
        "name": {
          "type": "string",
          "description": "Agent name (for provision)"
        },
        "role": {
          "type": "string",
          "description": "Agent role (for provision)"
        },
        "permissions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "resource": {
                "type": "string"
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        },
        "agent_id": {
          "type": "string"
        },
        "token": {
          "type": "string",
          "description": "Agent token (for authenticate)"
        },
        "agent_action": {
          "type": "string",
          "description": "Action to check (for check_permission)"
        },
        "resource": {
          "type": "string",
          "description": "Resource to check (for check_permission)"
        },
        "reason": {
          "type": "string",
          "description": "Suspension reason"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "agentic_rag",
    "description": "Agentic RAG — autonomous retrieval agent. Plans multi-step retrieval strategies, chains vector + graph searches, self-validates context quality, and composes final retrieval context with provenance. Actions: retrieve (autonomous multi-step retrieval), plan (show retrieval strategy without executing), validate (check context quality), compose (merge multiple contexts).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "retrieve",
            "plan",
            "validate",
            "compose"
          ],
          "description": "Action to perform"
        },
        "query": {
          "type": "string",
          "description": "The retrieval query"
        },
        "max_steps": {
          "type": "number",
          "description": "Max retrieval steps (default: 5)"
        },
        "min_quality": {
          "type": "number",
          "description": "Minimum quality score 0-1 (default: 0.3)"
        },
        "contexts": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Multiple contexts to compose (for compose action)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "elicit",
    "description": "Ask the AI model for structured input when more context is needed. Uses MCP Sampling to request information from the reasoning model. Supports text, number, boolean, and enum field types.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "message": {
          "type": "string",
          "description": "What information is needed"
        },
        "context": {
          "type": "string",
          "description": "Additional context for the AI"
        },
        "fields": {
          "type": "object",
          "description": "Fields to request: { fieldName: { type, description, enumValues?, default? } }",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "string",
                  "number",
                  "boolean",
                  "enum"
                ]
              },
              "description": {
                "type": "string"
              },
              "enumValues": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "default": {}
            }
          }
        }
      },
      "required": [
        "message",
        "fields"
      ]
    }
  },
  {
    "name": "mcp_tasks",
    "description": "Manage async MCP tasks. Submit long-running operations, check status, get results, cancel tasks, and clean up expired entries.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "status",
            "list",
            "cancel",
            "cleanup",
            "result"
          ]
        },
        "task_id": {
          "type": "string",
          "description": "Task ID (for status/cancel/result)"
        },
        "status_filter": {
          "type": "string",
          "enum": [
            "pending",
            "running",
            "completed",
            "failed",
            "cancelled"
          ],
          "description": "Filter by status (for list)"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "oauth_manage",
    "description": "Manage OAuth 2.1 authorization. Register API keys, view scopes, check authorization status, and inspect Protected Resource Metadata.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "status",
            "metadata",
            "scopes",
            "register_key",
            "check"
          ]
        },
        "key": {
          "type": "string",
          "description": "API key (for register_key)"
        },
        "name": {
          "type": "string",
          "description": "Key name (for register_key)"
        },
        "key_scopes": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Scopes for new key"
        },
        "tool_name": {
          "type": "string",
          "description": "Tool to check scopes for (for check/scopes)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "session_manager",
    "description": "Manage MCP sessions for connection resumability. Create, inspect, and clean up sessions. Sessions store state and queue messages for redelivery on reconnect.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "create",
            "get",
            "set_state",
            "get_state",
            "drain",
            "destroy",
            "cleanup",
            "metrics"
          ]
        },
        "session_id": {
          "type": "string"
        },
        "key": {
          "type": "string",
          "description": "State key (for set_state/get_state)"
        },
        "value": {
          "type": "string",
          "description": "State value as JSON (for set_state)"
        },
        "user_id": {
          "type": "string",
          "description": "User ID (for create)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "a2a_protocol",
    "description": "Agent-to-Agent (A2A) protocol for inter-agent communication. Create tasks, process requests, discover agents, delegate work, and serve VegaMCP's Agent Card.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "agent_card",
            "create_task",
            "process_task",
            "task_status",
            "delegate",
            "discover",
            "register_agent",
            "list_agents"
          ]
        },
        "message": {
          "type": "string",
          "description": "Task message (for create_task/delegate)"
        },
        "task_id": {
          "type": "string",
          "description": "Task ID (for process_task/task_status)"
        },
        "agent_url": {
          "type": "string",
          "description": "Agent URL (for delegate)"
        },
        "capability": {
          "type": "string",
          "description": "Capability to search for (for discover)"
        },
        "agent_card": {
          "type": "object",
          "description": "Agent Card JSON (for register_agent)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "agent_graphs",
    "description": "Hierarchical multi-agent DAGs. Create structured agent dependency graphs, compute execution order via topological sort, identify parallel groups, and manage agent handoffs with context passing.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "create",
            "add_agent",
            "add_edge",
            "plan",
            "parallel_groups",
            "handoff",
            "summary",
            "list"
          ]
        },
        "graph_id": {
          "type": "string"
        },
        "name": {
          "type": "string",
          "description": "Graph or agent name"
        },
        "role": {
          "type": "string",
          "description": "Agent role"
        },
        "capabilities": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "dependencies": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Agent IDs this depends on"
        },
        "parent_id": {
          "type": "string",
          "description": "Parent agent for hierarchy"
        },
        "from_id": {
          "type": "string"
        },
        "to_id": {
          "type": "string"
        },
        "edge_type": {
          "type": "string",
          "enum": [
            "dependency",
            "handoff",
            "data-flow",
            "hierarchy"
          ]
        },
        "data": {
          "type": "object",
          "description": "Handoff data"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "agentic_sampling_v2",
    "description": "Advanced server-side agent loops via MCP Sampling. Supports multi-turn conversations, autonomous Plan→Execute→Evaluate→Refine cycles, tool composition, and token budget tracking. The server drives the LLM through multi-step reasoning.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "run_loop",
            "multi_turn",
            "status",
            "list"
          ]
        },
        "goal": {
          "type": "string",
          "description": "Goal for the agent loop (for run_loop)"
        },
        "context": {
          "type": "string",
          "description": "Additional context"
        },
        "messages": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "role": {
                "type": "string"
              },
              "content": {
                "type": "string"
              }
            }
          },
          "description": "Message history (for multi_turn)"
        },
        "max_steps": {
          "type": "number",
          "description": "Max reasoning steps (default: 5)"
        },
        "max_tokens": {
          "type": "number",
          "description": "Token budget (default: 10000)"
        },
        "loop_id": {
          "type": "string",
          "description": "Loop ID (for status)"
        }
      },
      "required": [
        "action"
      ]
    }
  },
  {
    "name": "dynamic_indexing",
    "description": "Real-time event-driven indexing pipeline. Emit index events when data changes, subscribe to events for automatic re-indexing, process event batches, and trigger full reindexes. No manual rebuilds needed.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "emit",
            "subscribe",
            "unsubscribe",
            "process",
            "start_auto",
            "stop_auto",
            "reindex",
            "stats"
          ]
        },
        "event_type": {
          "type": "string",
          "enum": [
            "create",
            "update",
            "delete"
          ]
        },
        "source": {
          "type": "string",
          "enum": [
            "entity",
            "observation",
            "relation",
            "file",
            "tool_output"
          ]
        },
        "data": {
          "type": "object",
          "description": "Event data"
        },
        "subscription_id": {
          "type": "string"
        },
        "interval_ms": {
          "type": "number",
          "description": "Auto-processing interval in ms (default: 5000)"
        }
      },
      "required": [
        "action"
      ]
    }
  }
];

export const v7Mapping = {
  "memory": [
    {
      "action": "graph",
      "v6Name": "memory"
    },
    {
      "action": "bridge",
      "v6Name": "memory_bridge"
    }
  ],
  "ai": [
    {
      "action": "reason",
      "v6Name": "route_to_reasoning_model"
    },
    {
      "action": "hypothesis",
      "v6Name": "hypothesis_generator"
    },
    {
      "action": "synthesize",
      "v6Name": "synthesis_engine"
    }
  ],
  "token_budget": [],
  "knowledge_engine": [],
  "auto_update": [],
  "prompt_library": [],
  "browser": [],
  "swarm": [
    {
      "action": "manage",
      "v6Name": "swarm"
    }
  ],
  "code": [
    {
      "action": "execute",
      "v6Name": "sandbox_execute"
    },
    {
      "action": "analyze",
      "v6Name": "code_analysis"
    }
  ],
  "api_request": [],
  "ops": [
    {
      "action": "watcher",
      "v6Name": "watcher"
    },
    {
      "action": "webhook",
      "v6Name": "webhook"
    },
    {
      "action": "schedule",
      "v6Name": "schedule_task"
    }
  ],
  "workflow_execute": [],
  "notify": [],
  "intel": [
    {
      "action": "metrics",
      "v6Name": "agent_intel"
    }
  ],
  "agent_ops": [],
  "vegamcp_health_check": [],
  "vegamcp_analytics": [],
  "vegamcp_skills": [],
  "vegamcp_filesystem": [],
  "vegamcp_git": [],
  "vegamcp_sequential_thinking": [],
  "vegamcp_database": [],
  "vegamcp_document_reader": [],
  "vegamcp_shell": [],
  "vegamcp_vault": [],
  "vegamcp_seed_data": [],
  "mobile_testing": [],
  "web_testing": [],
  "api_testing": [],
  "accessibility": [],
  "web": [
    {
      "action": "github",
      "v6Name": "github_scraper"
    },
    {
      "action": "search",
      "v6Name": "web_search"
    }
  ],
  "self_evolution": [],
  "quality_gate": [],
  "stress_test": [],
  "sentinel": [],
  "security": [
    {
      "action": "scan",
      "v6Name": "security_scanner"
    }
  ],
  "graph_rag": [],
  "protocol": [
    {
      "action": "discovery",
      "v6Name": "tool_discovery"
    },
    {
      "action": "gateway",
      "v6Name": "gateway"
    },
    {
      "action": "search",
      "v6Name": "tool_search"
    },
    {
      "action": "apps",
      "v6Name": "mcp_apps"
    },
    {
      "action": "embeddings",
      "v6Name": "multimodal_embeddings"
    },
    {
      "action": "auth",
      "v6Name": "zero_trust"
    }
  ],
  "agentic_rag": [],
  "elicit": [],
  "mcp_tasks": [],
  "oauth_manage": [],
  "session_manager": [],
  "a2a_protocol": [],
  "agent_graphs": [],
  "agentic_sampling_v2": [],
  "dynamic_indexing": []
};
