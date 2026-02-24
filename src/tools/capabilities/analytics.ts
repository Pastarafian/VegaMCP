/**
 * VegaMCP — Analytics Tool
 * 
 * Real-time analytics for the VegaMCP server:
 * - Tool call frequency & latency tracking
 * - Per-tool error rates
 * - Token consumption trends (by model, by hour)
 * - Agent performance benchmarks
 * - Session timeline
 * - Top performers & bottlenecks
 * 
 * MCP Tool: vegamcp_analytics
 */

import { logAudit } from '../../db/graph-store.js';
import { getSwarmStats, getMetrics, getMetricsSummary } from '../../db/swarm-store.js';

// ═══════════════════════════════════════════════
// IN-MEMORY ANALYTICS STORE
// ═══════════════════════════════════════════════

interface ToolCallRecord {
  tool: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

interface SessionStats {
  startedAt: number;
  totalCalls: number;
  totalDurationMs: number;
  toolCalls: Map<string, { count: number; totalMs: number; errors: number; lastCall: number }>;
  errorLog: Array<{ tool: string; error: string; timestamp: number }>;
  timeline: ToolCallRecord[];
}

// Global session — persists for the lifetime of the server
const session: SessionStats = {
  startedAt: Date.now(),
  totalCalls: 0,
  totalDurationMs: 0,
  toolCalls: new Map(),
  errorLog: [],
  timeline: [],
};

/**
 * Record a tool invocation. Called from the tool wrapper in index.ts.
 */
export function recordToolCall(toolName: string, durationMs: number, success: boolean, error?: string): void {
  session.totalCalls++;
  session.totalDurationMs += durationMs;

  const existing = session.toolCalls.get(toolName) || { count: 0, totalMs: 0, errors: 0, lastCall: 0 };
  existing.count++;
  existing.totalMs += durationMs;
  existing.lastCall = Date.now();
  if (!success) existing.errors++;
  session.toolCalls.set(toolName, existing);

  // Keep timeline capped at 500 entries
  if (session.timeline.length > 500) session.timeline.shift();
  session.timeline.push({ tool: toolName, timestamp: Date.now(), durationMs, success, error });

  if (!success && error) {
    if (session.errorLog.length > 100) session.errorLog.shift();
    session.errorLog.push({ tool: toolName, error, timestamp: Date.now() });
  }
}

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const analyticsSchema = {
  name: 'vegamcp_analytics',
  description: 'Real-time analytics for the VegaMCP server. Track tool usage frequency, latency, error rates, agent performance, and session timeline. Use to understand which tools are most used, which are slowest, and identify bottlenecks.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['dashboard', 'tool_usage', 'errors', 'timeline', 'top_tools', 'session_info', 'reset'],
        description: 'Action to perform',
      },
      tool: { type: 'string', description: 'Filter by specific tool name (for tool_usage, timeline)' },
      limit: { type: 'number', description: 'Max results to return', default: 20 },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleAnalytics(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  try {
    switch (args.action) {
      case 'dashboard': {
        const uptimeMs = Date.now() - session.startedAt;
        const uptimeHrs = Math.round(uptimeMs / 3600000 * 10) / 10;
        const uptimeMins = Math.round(uptimeMs / 60000);

        // Top 5 most-used tools
        const toolEntries = Array.from(session.toolCalls.entries())
          .sort((a, b) => b[1].count - a[1].count);
        const topTools = toolEntries.slice(0, 5).map(([name, stats]) => ({
          tool: name,
          calls: stats.count,
          avgMs: Math.round(stats.totalMs / stats.count),
          errors: stats.errors,
          errorRate: Math.round((stats.errors / stats.count) * 1000) / 10 + '%',
        }));

        // Slowest tools
        const slowest = toolEntries
          .filter(([, s]) => s.count > 0)
          .map(([name, stats]) => ({
            tool: name,
            avgMs: Math.round(stats.totalMs / stats.count),
            calls: stats.count,
          }))
          .sort((a, b) => b.avgMs - a.avgMs)
          .slice(0, 5);

        // Swarm stats
        let swarmStats;
        try { swarmStats = getSwarmStats(); } catch { swarmStats = null; }

        const avgLatency = session.totalCalls > 0 ? Math.round(session.totalDurationMs / session.totalCalls) : 0;

        const output: any = {
          success: true,
          dashboard: {
            uptime: uptimeHrs >= 1 ? `${uptimeHrs}h` : `${uptimeMins}m`,
            uptimeMs,
            totalToolCalls: session.totalCalls,
            uniqueToolsUsed: session.toolCalls.size,
            avgLatencyMs: avgLatency,
            totalErrors: session.errorLog.length,
            callsPerMinute: uptimeMins > 0 ? Math.round(session.totalCalls / uptimeMins * 10) / 10 : session.totalCalls,
            topTools,
            slowestTools: slowest,
          },
        };

        if (swarmStats) {
          output.dashboard.swarm = {
            agents: swarmStats.totalAgents,
            activeAgents: swarmStats.activeAgents,
            tasksCompleted: swarmStats.completedTasks,
            tasksFailed: swarmStats.failedTasks,
            activeTasks: swarmStats.activeTasks,
          };
        }

        logAudit('analytics', 'dashboard', true, undefined, Date.now() - start);
        return result(output);
      }

      case 'tool_usage': {
        const entries = Array.from(session.toolCalls.entries())
          .filter(([name]) => !args.tool || name === args.tool)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, args.limit || 50)
          .map(([name, stats]) => ({
            tool: name,
            calls: stats.count,
            totalMs: stats.totalMs,
            avgMs: Math.round(stats.totalMs / stats.count),
            errors: stats.errors,
            errorRate: Math.round((stats.errors / stats.count) * 1000) / 10 + '%',
            lastCall: new Date(stats.lastCall).toISOString(),
          }));

        return result({ success: true, toolUsage: entries, totalTools: session.toolCalls.size });
      }

      case 'errors': {
        const errors = session.errorLog
          .filter(e => !args.tool || e.tool === args.tool)
          .slice(-(args.limit || 20))
          .reverse()
          .map(e => ({
            tool: e.tool,
            error: e.error,
            timestamp: new Date(e.timestamp).toISOString(),
            agoSeconds: Math.round((Date.now() - e.timestamp) / 1000),
          }));

        return result({ success: true, errors, totalErrors: session.errorLog.length });
      }

      case 'timeline': {
        const timeline = session.timeline
          .filter(t => !args.tool || t.tool === args.tool)
          .slice(-(args.limit || 20))
          .reverse()
          .map(t => ({
            tool: t.tool,
            durationMs: t.durationMs,
            success: t.success,
            timestamp: new Date(t.timestamp).toISOString(),
            error: t.error,
          }));

        return result({ success: true, timeline, totalRecords: session.timeline.length });
      }

      case 'top_tools': {
        const limit = args.limit || 10;

        const byCount = Array.from(session.toolCalls.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, limit)
          .map(([name, s]) => ({ tool: name, count: s.count }));

        const byLatency = Array.from(session.toolCalls.entries())
          .filter(([, s]) => s.count >= 2)
          .sort((a, b) => (b[1].totalMs / b[1].count) - (a[1].totalMs / a[1].count))
          .slice(0, limit)
          .map(([name, s]) => ({ tool: name, avgMs: Math.round(s.totalMs / s.count), calls: s.count }));

        const byErrors = Array.from(session.toolCalls.entries())
          .filter(([, s]) => s.errors > 0)
          .sort((a, b) => b[1].errors - a[1].errors)
          .slice(0, limit)
          .map(([name, s]) => ({ tool: name, errors: s.errors, errorRate: Math.round((s.errors / s.count) * 100) + '%' }));

        return result({ success: true, mostUsed: byCount, slowest: byLatency, mostErrors: byErrors });
      }

      case 'session_info': {
        const uptimeMs = Date.now() - session.startedAt;
        return result({
          success: true,
          session: {
            startedAt: new Date(session.startedAt).toISOString(),
            uptimeMs,
            uptimeHuman: formatDuration(uptimeMs),
            totalCalls: session.totalCalls,
            totalDurationMs: session.totalDurationMs,
            uniqueTools: session.toolCalls.size,
            totalErrors: session.errorLog.length,
          },
        });
      }

      case 'reset': {
        session.totalCalls = 0;
        session.totalDurationMs = 0;
        session.toolCalls.clear();
        session.errorLog.length = 0;
        session.timeline.length = 0;
        session.startedAt = Date.now();
        return result({ success: true, message: 'Analytics session reset' });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}. Use: dashboard, tool_usage, errors, timeline, top_tools, session_info, reset` });
    }
  } catch (err: any) {
    return result({ success: false, error: err.message });
  }
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function result(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
