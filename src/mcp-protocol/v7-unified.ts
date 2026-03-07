import { getAvailableTools } from '../index.js';

export function getV7Tools() {
  const v6Tools = getAvailableTools();
  const v6Map = new Map();
  for (const t of v6Tools) {
    v6Map.set(t.schema.name, t);
  }

  // OMNI-CLUSTERS: Super-condensed mega tools — ALL tools mapped, zero leaks
  const clusters = [
    {
      name: "omni_assistant",
      description: "Core AI intelligence: reasoning, budget, auto-update, prompts, web search (speed/balanced/quality modes + domain filter), code analysis, docs, sequential thinking, expert toolkits, knowledge engine, memory graph, semantic memory (vector search), context7 library docs.",
      tools: [
        'route_to_reasoning_model', 'token_budget', 'auto_update', 'prompt_library', 
        'web_search', 'github_scraper', 'code_analysis', 'REDACTED_sequential_thinking',
        'REDACTED_document_reader', 'elicit', 'knowledge_engine', 'memory', 'expert_toolkits',
        'context7_docs', 'semantic_memory'
      ]
    },
    {
      name: "omni_swarm",
      description: "Agent orchestration: swarm ops, agent intel/ops, A2A protocol, agent graphs, agentic sampling, multimodal embeddings, session manager, MCP relay.",
      tools: [
        'swarm', 'agent_intel', 'agent_ops', 'a2a_protocol', 'agent_graphs', 
        'agentic_sampling_v2', 'multimodal_embeddings', 'session_manager', 'mcp_relay'
      ]
    },
    {
      name: "omni_automation",
      description: "Action & control: browser, workflow, filesystem, shell, git, MCP tasks, API requests, sandbox, watchers, webhooks, schedule, notify, the_claw, claw_command_center, ide_autoclicker, vps_control, image_generation.",
      tools: [
        'browser', 'workflow_execute', 'REDACTED_filesystem', 'REDACTED_git', 'REDACTED_shell', 
        'mcp_tasks', 'api_request', 'sandbox_testing', 'watcher', 'webhook', 
        'schedule_task', 'notify', 'the_claw', 'claw_command_center', 
        'ide_autoclicker', 'vps_control', 'image_generation'
      ]
    },
    {
      name: "omni_systems",
      description: "Infrastructure: database, postgres_client, health check, analytics, skills, seed data, sentry, OAuth, gateway, tool search, MCP apps, vault, dynamic indexing.",
      tools: [
        'REDACTED_database', 'REDACTED_health_check', 'REDACTED_analytics', 'REDACTED_skills', 'REDACTED_seed_data', 
        'sentry', 'oauth_manage', 'gateway', 'tool_search', 'mcp_apps',
        'REDACTED_vault', 'dynamic_indexing', 'postgres_client'
      ]
    },
    {
      name: "omni_research",
      description: "Research & Science: graph RAG, agentic RAG, self evolution, hypothesis gen, quality gate, synthesis engine, LLM router, memory bridge, tool discovery, sentinel, LLM output evaluation.",
      tools: [
        'graph_rag', 'agentic_rag', 'self_evolution', 'hypothesis_generator', 
        'quality_gate', 'synthesis_engine', 'llm_router', 'memory_bridge', 
        'tool_discovery', 'sentinel', 'llm_eval'
      ]
    },
    {
      name: "omni_testing",
      description: "QA & Security: mobile, web, API, DB, server, desktop, accessibility, security, visual, advanced testing, security scanner, stress test, zero trust.",
      tools: [
        'mobile_testing', 'web_testing', 'api_testing', 'accessibility', 
        'desktop_testing', 'advanced_testing', 'database_testing', 
        'server_testing', 'security_testing', 'visual_testing',
        'security_scanner', 'stress_test', 'zero_trust'
      ]
    }
  ];

  const unified: any[] = [];
  
  for (const cluster of clusters) {
    // Generate unified sub-tool properties based on real schemas of underlying tools
    unified.push({
      schema: {
        name: cluster.name,
        description: cluster.description,
        inputSchema: {
          type: 'object',
          properties: {
            tool_target: {
              type: 'string',
              enum: cluster.tools,
              description: 'The precise sub-tool to execute within this omni-cluster.'
            },
            payload: {
              type: 'object',
              description: "The arguments payload exactly matching the target tool's native inputSchema requirements.",
              additionalProperties: true
            }
          },
          required: ['tool_target', 'payload']
        }
      },
      handler: async (args: any) => {
        const { tool_target, payload } = args;
        const targetTool = v6Map.get(tool_target);
        if (!targetTool) {
           // If a tool is unavailable due to missing env vars, fail gracefully.
           return { content: [{ type: 'text', text: `Tool ${tool_target} is disabled or unavailable.` }], isError: true };
        }
        
        try {
          return await targetTool.handler(payload);
        } catch (error: any) {
           return { content: [{ type: 'text', text: `Error in ${tool_target}: ${error.message}` }], isError: true };
        }
      }
    });
  }

  // Also include any left over tools exactly as they were if we somehow missed any (useful for backwards compatibility or loose tools)
  const mappedTools = new Set(clusters.flatMap(c => c.tools));
  for (const t of v6Tools) {
    if (!mappedTools.has(t.schema.name)) {
      unified.push(t);
    }
  }

  return unified;
}
