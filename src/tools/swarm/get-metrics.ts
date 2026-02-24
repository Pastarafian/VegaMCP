/**
 * VegaMCP — Swarm Get Metrics Tool
 */

import { logAudit } from '../../db/graph-store.js';
import { getMetrics, getMetricsSummary, getSwarmStats } from '../../db/swarm-store.js';

export const swarmGetMetricsSchema = {
  name: 'swarm_get_metrics',
  description: 'Retrieve performance metrics for agents and the swarm overall. Can filter by agent, metric name, or get a summary dashboard.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      agent_id: { type: 'string', description: 'Optional: specific agent to get metrics for' },
      metric_name: { type: 'string', description: 'Optional: specific metric (e.g. task_latency_ms, llm_tokens_used)' },
      summary: { type: 'boolean', description: 'If true, return aggregated summary instead of raw metrics', default: false },
      limit: { type: 'number', description: 'Max number of raw metrics to return', default: 50 },
    },
  },
};

export async function handleSwarmGetMetrics(args: any) {
  const start = Date.now();
  try {
    if (args.summary) {
      const summary = getMetricsSummary(args.agent_id);
      const stats = getSwarmStats();

      const result = {
        success: true,
        swarmStats: stats,
        metricsSummary: summary,
      };

      logAudit('swarm_get_metrics', 'Retrieved metrics summary', true, undefined, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    const metrics = getMetrics(args.agent_id, args.metric_name, args.limit || 50);

    const result = {
      success: true,
      metrics: metrics.map(m => ({
        ...m,
        metadata: m.metadata ? (() => { try { return JSON.parse(m.metadata!); } catch { return m.metadata; } })() : null,
      })),
      count: metrics.length,
    };

    logAudit('swarm_get_metrics', `Retrieved ${metrics.length} metrics`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('swarm_get_metrics', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
