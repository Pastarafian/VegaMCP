/**
 * VegaMCP — Swarm Agent Control Tool
 */

import { logAudit } from '../../db/graph-store.js';
import { getOrchestrator } from '../../swarm/orchestrator.js';

export const swarmAgentControlSchema = {
  name: 'swarm_agent_control',
  description: 'Control a swarm agent: start, stop, pause, or restart it.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      agent_id: { type: 'string', description: 'Agent ID to control' },
      action: { type: 'string', description: 'Action to perform', enum: ['start', 'stop', 'pause', 'restart'] },
    },
    required: ['agent_id', 'action'],
  },
};

export async function handleSwarmAgentControl(args: any) {
  const start = Date.now();
  try {
    const orchestrator = getOrchestrator();
    let success = false;

    switch (args.action) {
      case 'start':
        success = await orchestrator.startAgent(args.agent_id);
        break;
      case 'stop':
        success = await orchestrator.stopAgent(args.agent_id);
        break;
      case 'pause':
        success = await orchestrator.pauseAgent(args.agent_id);
        break;
      case 'restart':
        success = await orchestrator.restartAgent(args.agent_id);
        break;
      default:
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${args.action}` } }) }] };
    }

    if (!success) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'AGENT_NOT_FOUND', message: `Agent ${args.agent_id} not found` } }) }] };
    }

    logAudit('swarm_agent_control', `${args.action} agent ${args.agent_id}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, agent_id: args.agent_id, action: args.action }) }] };
  } catch (err: any) {
    logAudit('swarm_agent_control', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
