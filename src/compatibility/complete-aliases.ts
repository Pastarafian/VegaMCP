export const toolAliases: Record<string, { tool: string; action: string; transform?: Function }> = {
  // Browser tools → web.browse with sub-action
  'browser_navigate': { 
    tool: 'web', 
    action: 'browse',
    transform: (args: any) => ({ ...args, operation: 'navigate' })
  },
  'browser_click': { 
    tool: 'web', 
    action: 'browse',
    transform: (args: any) => ({ ...args, operation: 'click' })
  },
  'browser_type': { 
    tool: 'web', 
    action: 'browse',
    transform: (args: any) => ({ ...args, operation: 'type' })
  },
  'browser_screenshot': { 
    tool: 'web', 
    action: 'browse',
    transform: (args: any) => ({ ...args, operation: 'screenshot' })
  },
  'browser_snapshot': { 
    tool: 'web', 
    action: 'browse',
    transform: (args: any) => ({ ...args, operation: 'snapshot' })
  },
  'browser_execute_js': { 
    tool: 'web', 
    action: 'browse',
    transform: (args: any) => ({ ...args, operation: 'execute_js' })
  },
  'browser_console_logs': { 
    tool: 'web', 
    action: 'browse',
    transform: (args: any) => ({ ...args, operation: 'console_logs' })
  },
  'browser_close': { 
    tool: 'web', 
    action: 'browse',
    transform: (args: any) => ({ ...args, operation: 'close' })
  },
  
  // Search → web.search
  'web_search': { tool: 'web', action: 'search' },
  'github_scraper': { 
    tool: 'web', 
    action: 'github',
    transform: (args: any) => ({ ...args, operation: args.action || 'search_repos' })
  },
  
  // Code tools → code.*
  'sandbox_execute': { 
    tool: 'code', 
    action: 'execute',
    transform: (args: any) => ({ language: args.environment || 'python', code: args.code, timeout: args.timeout })
  },
  'code_analysis': { 
    tool: 'code', 
    action: 'analyze',
    transform: (args: any) => ({ file: args.file, code: args.code, language: args.language, operation: args.action })
  },
  'shell': { 
    tool: 'code', 
    action: 'shell',
    transform: (args: any) => ({ ...args, operation: args.action })
  },
  'filesystem': { 
    tool: 'code', 
    action: 'file',
    transform: (args: any) => ({ ...args, operation: args.action })
  },
  'git_tools': { 
    tool: 'code', 
    action: 'git',
    transform: (args: any) => ({ ...args, operation: args.action })
  },
  'document_reader': { 
    tool: 'code', 
    action: 'read',
    transform: (args: any) => ({ ...args, operation: args.action || 'read' })
  },
  
  // AI / Reasoning
  'route_to_reasoning_model': { 
    tool: 'ai', 
    action: 'reason',
    transform: (args: any) => ({ prompt: args.problem || args.prompt, model: args.model, mode: args.mode || 'single' })
  },
  'llm_router': { 
    tool: 'ai', 
    action: 'reason',
    transform: (args: any) => ({ prompt: args.prompt, model: 'auto', mode: args.action || 'route' })
  },
  'sequential_thinking': { 
    tool: 'ai', 
    action: 'think',
    transform: (args: any) => ({ problem: args.problem || args.input, steps: args.steps })
  },
  'hypothesis_generator': {
    tool: 'ai',
    action: 'hypothesis',
    transform: (args: any) => ({ ...args, operation: args.action })
  },
  'synthesis_engine': {
    tool: 'ai',
    action: 'synthesize',
    transform: (args: any) => ({ ...args, operation: args.action })
  },

  // Swarm
  'swarm': { tool: 'swarm', action: 'manage' },

  // Data / Database
  'database': { tool: 'data', action: 'sql' },

  // Ops
  'watcher': { tool: 'ops', action: 'watcher' },
  'webhook': { tool: 'ops', action: 'webhook' },
  'schedule_task': { tool: 'ops', action: 'schedule' },
  
  // Security
  'security_scanner': { tool: 'security', action: 'scan' },

  // Sentry
  'sentry_projects': { tool: 'sentry', action: 'projects' },
  'sentry_issues': { tool: 'sentry', action: 'issues' },
  'sentry_events': { tool: 'sentry', action: 'events' },
  'sentry_alerts': { tool: 'sentry', action: 'alerts' },
  
  // Memory
  'memory': { tool: 'memory', action: 'graph' },
  'memory_bridge': { tool: 'memory', action: 'bridge' },
  'vault': { tool: 'memory', action: 'vault' },
  
  // Intel
  'agent_intel': { tool: 'intel', action: 'metrics' },
  'analytics': { tool: 'intel', action: 'server_metrics' },
  
  // Protocol
  'tool_discovery': { tool: 'protocol', action: 'discovery' },
  'tool_search': { tool: 'protocol', action: 'search' },
  'mcp_apps': { tool: 'protocol', action: 'apps' },
  'zero_trust': { tool: 'protocol', action: 'auth' },
  'gateway': { tool: 'protocol', action: 'gateway' },
  'multimodal_embeddings': { tool: 'protocol', action: 'embeddings' }
};
