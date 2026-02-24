/**
 * VegaMCP — Swarm Broadcast Tool
 */

import { logAudit } from '../../db/graph-store.js';
import { getOrchestrator } from '../../swarm/orchestrator.js';

export const swarmBroadcastSchema = {
  name: 'swarm_broadcast',
  description: 'Send a message to all agents or a filtered subset. Use for coordination, alerts, or configuration changes.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      message: { type: 'string', description: 'Message to broadcast' },
      coordinator: { type: 'string', description: 'Optional: only send to agents under this coordinator (research, risk, execution)' },
      status: { type: 'string', description: 'Optional: only send to agents with this status' },
    },
    required: ['message'],
  },
};

export async function handleSwarmBroadcast(args: any) {
  const start = Date.now();
  try {
    const orchestrator = getOrchestrator();
    const count = await orchestrator.broadcastMessage(args.message, {
      coordinator: args.coordinator,
      status: args.status,
    });

    logAudit('swarm_broadcast', `Broadcast to ${count} agents`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, recipientCount: count, message: args.message }) }] };
  } catch (err: any) {
    logAudit('swarm_broadcast', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
