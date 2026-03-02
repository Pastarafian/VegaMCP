import { getAvailableTools } from '../index.js';

export function getV7Tools() {
  const v6Tools = getAvailableTools();
  const v6Map = new Map();
  for (const t of v6Tools) {
    v6Map.set(t.schema.name, t);
  }

  // OMNI-CLUSTERS: Super-condensed mega tools that combine all logic
  const clusters = [
    {
      name: "omni_assistant",
      description: "Core intelligence and utility cluster: ai, budget, update, prompt library, web search, code analysis, document reader, sequential thinking.",
      tools: [
        'route_to_reasoning_model', 'token_budget', 'auto_update', 'prompt_library', 
        'web_search', 'github_scraper', 'code_analysis', 'sequential_thinking',
        'document_reader', 'elicit', 'knowledge_engine', 'memory'
      ]
    },
    {
      name: "omni_swarm",
      description: "Agent orchestration cluster: swarm operations, agent intelligence, agent ops, a2a_protocol, agent graphs, agentic sampling, multidomdal, session_manager.",
      tools: [
        'swarm', 'agent_intel', 'agent_ops', 'a2a_protocol', 'agent_graphs', 
        'agentic_sampling_v2', 'multimodal_embeddings', 'session_manager'
      ]
    },
    {
      name: "omni_automation",
      description: "Action cluster: browser control, workflow execution, filesystem, shell, git, mcp_tasks, api_request, sentinel, ab_test.",
      tools: [
        'browser', 'workflow_execute', 'filesystem', 'git_tools', 'shell', 
        'mcp_tasks', 'api_request', 'sandbox_execute', 'watcher', 'webhook', 'schedule', 'notify'
      ]
    },
    {
      name: "omni_systems",
      description: "Infrastructure cluster: database, health check, analytics, skills, seed data, sentry, oauth, gateway, tool_search.",
      tools: [
        'database', 'health_check', 'analytics', 'skills', 'seed_data', 
        'sentry', 'oauth_manage', 'gateway', 'tool_search', 'mcp_apps'
      ]
    },
    {
      name: "omni_research",
      description: "Research & Science cluster: graph rag, self evolution, hypothesis gen, quality gate, synthesis engine, tool discovery.",
      tools: [
        'graph_rag', 'agentic_rag', 'self_evolution', 'hypothesis_gen', 
        'quality_gate', 'synthesis_engine', 'llm_router', 'memory_bridge', 'tool_discovery'
      ]
    },
    {
      name: "omni_testing",
      description: "Automated QA and Security cluster: mobile, web, api, db, server, desktop, accessibility, security, visual, stress, design.",
      tools: [
        'mobile_testing', 'web_testing', 'api_testing', 'accessibility', 
        'design_toolkit', 'desktop_testing', 'advanced_testing', 
        'database_testing', 'server_testing', 'security_testing', 'visual_testing',
        'security_scanner', 'stress_test', 'zero_trust', 'vault'
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
