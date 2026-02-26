/**
 * VegaMCP — MCP Apps (UI Capabilities, January 2026)
 * Tools return interactive HTML UI components rendered in sandboxed iframes.
 * Progressive enhancement: text fallback when client doesn't support MCP Apps.
 */

export interface MCPApp {
  name: string;
  toolName: string;
  description: string;
  htmlContent: string;
}

const appRegistry = new Map<string, MCPApp>();

/**
 * Generate analytics dashboard HTML
 */
export function generateAnalyticsDashboard(data: Record<string, any>): string {
  const { totalCalls = 0, successRate = 0, topTools = [], avgDurationMs = 0 } = data;
  const toolBars = (topTools as any[]).slice(0, 8)
    .map((t: any) => `<div class="bar"><div class="fill" style="width:${Math.min(100, (t.calls / Math.max(1, totalCalls)) * 300)}%">${t.tool || t.name}</div><span>${t.calls || t.count}</span></div>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#0f0f1a;color:#e0e0e0;font-family:Inter,system-ui,sans-serif;padding:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.card{background:#1a1a2e;border:1px solid #333;border-radius:12px;padding:20px;text-align:center}
.card h3{color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.card .value{font-size:32px;font-weight:700;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.bar-chart{background:#1a1a2e;border-radius:12px;padding:20px;border:1px solid #333}
.bar{display:flex;align-items:center;margin:8px 0;height:32px}
.fill{background:linear-gradient(90deg,#667eea,#764ba2);border-radius:6px;padding:4px 12px;font-size:13px;color:#fff;white-space:nowrap;min-width:60px}
.bar span{margin-left:8px;color:#888;font-size:13px}
h2{margin-bottom:16px;font-size:18px;color:#fff}
</style></head><body>
<h2>📊 VegaMCP Analytics</h2>
<div class="grid">
<div class="card"><h3>Total Calls</h3><div class="value">${totalCalls}</div></div>
<div class="card"><h3>Success Rate</h3><div class="value">${successRate}%</div></div>
<div class="card"><h3>Avg Duration</h3><div class="value">${avgDurationMs}ms</div></div>
<div class="card"><h3>Active Tools</h3><div class="value">${(topTools as any[]).length}</div></div>
</div>
<div class="bar-chart"><h2>Top Tools</h2>${toolBars || '<p style="color:#666">No data yet</p>'}</div>
</body></html>`;
}

/**
 * Generate knowledge graph visualization HTML
 */
export function generateGraphVisualization(entities: any[], relations: any[]): string {
  const nodes = entities.slice(0, 30).map((e, i) => `{id:${i},label:"${(e.name || e).replace(/"/g, '\\"')}",type:"${e.entityType || 'entity'}"}`).join(',');
  const edges = relations.slice(0, 50).map((r, i) => {
    const fromIdx = entities.findIndex((e: any) => (e.name || e) === r.from);
    const toIdx = entities.findIndex((e: any) => (e.name || e) === r.to);
    return fromIdx >= 0 && toIdx >= 0 ? `{from:${fromIdx},to:${toIdx},label:"${(r.relationType || r.relation || '').replace(/"/g, '\\"')}"}` : '';
  }).filter(Boolean).join(',');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}body{background:#0f0f1a;overflow:hidden}
canvas{display:block}
.info{position:fixed;top:10px;right:10px;background:#1a1a2e;color:#e0e0e0;padding:12px 16px;border-radius:8px;font-family:Inter,system-ui,sans-serif;font-size:13px;border:1px solid #333}
</style></head><body>
<canvas id="c"></canvas>
<div class="info">🧠 ${entities.length} entities · ${relations.length} relations</div>
<script>
const nodes=[${nodes}],edges=[${edges}];
const c=document.getElementById('c'),ctx=c.getContext('2d');
c.width=innerWidth;c.height=innerHeight;
const colors={entity:'#667eea',concept:'#764ba2',tool:'#f093fb',person:'#4facfe',default:'#43e97b'};
nodes.forEach((n,i)=>{n.x=c.width/2+Math.cos(i*2.4)*Math.min(c.width,c.height)*0.35;n.y=c.height/2+Math.sin(i*2.4)*Math.min(c.width,c.height)*0.35;n.vx=0;n.vy=0});
function draw(){ctx.clearRect(0,0,c.width,c.height);
edges.forEach(e=>{const a=nodes[e.from],b=nodes[e.to];if(!a||!b)return;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle='rgba(102,126,234,0.3)';ctx.lineWidth=1;ctx.stroke();const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;ctx.fillStyle='#555';ctx.font='10px Inter';ctx.fillText(e.label,mx,my)});
nodes.forEach(n=>{ctx.beginPath();ctx.arc(n.x,n.y,8,0,Math.PI*2);ctx.fillStyle=colors[n.type]||colors.default;ctx.fill();ctx.fillStyle='#fff';ctx.font='11px Inter';ctx.textAlign='center';ctx.fillText(n.label,n.x,n.y-14)});
requestAnimationFrame(draw)}
draw();
</script></body></html>`;
}

/**
 * Generate swarm activity monitor HTML
 */
export function generateSwarmMonitor(agents: any[], tasks: any[]): string {
  const agentRows = agents.map((a: any) =>
    `<tr><td>${a.name || a.id}</td><td><span class="badge ${a.status || 'idle'}">${a.status || 'idle'}</span></td><td>${a.tasksCompleted || 0}</td></tr>`
  ).join('');
  const taskRows = tasks.slice(0, 10).map((t: any) =>
    `<tr><td>${t.id?.slice(0, 12) || '-'}</td><td>${t.type || '-'}</td><td><span class="badge ${t.status}">${t.status}</span></td><td>${t.assignedTo || '-'}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#0f0f1a;color:#e0e0e0;font-family:Inter,system-ui,sans-serif;padding:20px}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{text-align:left;padding:8px 12px;color:#888;font-size:12px;text-transform:uppercase;border-bottom:1px solid #333}
td{padding:8px 12px;border-bottom:1px solid #1f1f35}
.badge{padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.badge.idle{background:#333;color:#888}.badge.running,.badge.active{background:#1b4332;color:#43e97b}
.badge.completed,.badge.done{background:#1a1a4e;color:#667eea}.badge.failed{background:#4a1515;color:#f87171}
h2{margin:16px 0 8px;font-size:16px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.header h1{font-size:20px;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
</style></head><body>
<div class="header"><h1>🐝 Swarm Monitor</h1><span style="color:#666">${new Date().toLocaleTimeString()}</span></div>
<h2>Agents (${agents.length})</h2>
<table><thead><tr><th>Agent</th><th>Status</th><th>Completed</th></tr></thead><tbody>${agentRows || '<tr><td colspan="3" style="color:#666">No agents</td></tr>'}</tbody></table>
<h2>Recent Tasks</h2>
<table><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Assigned</th></tr></thead><tbody>${taskRows || '<tr><td colspan="4" style="color:#666">No tasks</td></tr>'}</tbody></table>
</body></html>`;
}

/**
 * Register an MCP App
 */
export function registerApp(name: string, toolName: string, description: string, htmlContent: string): void {
  appRegistry.set(name, { name, toolName, description, htmlContent });
}

/**
 * Get an MCP App by name
 */
export function getApp(name: string): MCPApp | null {
  return appRegistry.get(name) || null;
}

/**
 * List all registered apps
 */
export function listApps(): MCPApp[] {
  return Array.from(appRegistry.values());
}

// ── Tool Schema & Handler ──

export const mcpAppsSchema = {
  name: 'mcp_apps',
  description: 'MCP Apps — interactive UI dashboards rendered in sandboxed iframes. Generate analytics dashboards, knowledge graph visualizations, and swarm monitors. Returns HTML that clients can render inline.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['analytics_dashboard', 'graph_viz', 'swarm_monitor', 'list_apps', 'custom'] },
      data: { type: 'object', description: 'Data to visualize (varies by action)' },
      entities: { type: 'array', description: 'Entities for graph visualization' },
      relations: { type: 'array', description: 'Relations for graph visualization' },
      agents: { type: 'array', description: 'Agents for swarm monitor' },
      tasks: { type: 'array', description: 'Tasks for swarm monitor' },
      html: { type: 'string', description: 'Custom HTML (for custom action)' },
      title: { type: 'string', description: 'App title' },
    },
    required: ['action'],
  },
};

export function handleMCPApps(args: any): string {
  try {
    switch (args.action) {
      case 'analytics_dashboard': {
        const html = generateAnalyticsDashboard(args.data || {});
        return JSON.stringify({
          success: true,
          app: { type: 'ui', mimeType: 'text/html', content: html },
          fallback: `Analytics: ${(args.data?.totalCalls || 0)} calls, ${(args.data?.successRate || 0)}% success rate`,
        });
      }
      case 'graph_viz': {
        const html = generateGraphVisualization(args.entities || [], args.relations || []);
        return JSON.stringify({
          success: true,
          app: { type: 'ui', mimeType: 'text/html', content: html },
          fallback: `Graph: ${(args.entities || []).length} entities, ${(args.relations || []).length} relations`,
        });
      }
      case 'swarm_monitor': {
        const html = generateSwarmMonitor(args.agents || [], args.tasks || []);
        return JSON.stringify({
          success: true,
          app: { type: 'ui', mimeType: 'text/html', content: html },
          fallback: `Swarm: ${(args.agents || []).length} agents, ${(args.tasks || []).length} tasks`,
        });
      }
      case 'list_apps': {
        const apps = listApps();
        return JSON.stringify({ success: true, apps: apps.map(a => ({ name: a.name, tool: a.toolName, description: a.description })) });
      }
      case 'custom': {
        if (!args.html) return JSON.stringify({ success: false, error: 'html required' });
        return JSON.stringify({
          success: true,
          app: { type: 'ui', mimeType: 'text/html', content: args.html },
          title: args.title || 'Custom App',
        });
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
