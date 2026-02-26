/**
 * VegaMCP — Agent Graphs (Hierarchical Multi-Agent DAGs)
 * Structured multi-agent systems with hierarchical organization,
 * dependency-based execution, and standardized handoff patterns.
 */

export interface AgentNode {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  dependencies: string[];   // IDs of agents this depends on
  status: 'idle' | 'waiting' | 'running' | 'completed' | 'failed';
  input?: any;
  output?: any;
  parent?: string;          // Parent sub-orchestrator
}

export interface AgentEdge {
  from: string;
  to: string;
  type: 'dependency' | 'handoff' | 'data-flow' | 'hierarchy';
  metadata?: Record<string, any>;
}

export interface AgentGraph {
  id: string;
  name: string;
  nodes: Map<string, AgentNode>;
  edges: AgentEdge[];
  status: 'created' | 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: string;
  executionOrder?: string[];
}

const graphs = new Map<string, AgentGraph>();

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Create a new agent graph
 */
export function createGraph(name: string): AgentGraph {
  const graph: AgentGraph = {
    id: genId('graph'),
    name,
    nodes: new Map(),
    edges: [],
    status: 'created',
    createdAt: new Date().toISOString(),
  };
  graphs.set(graph.id, graph);
  return graph;
}

/**
 * Add a node (agent) to the graph
 */
export function addAgent(
  graphId: string,
  name: string,
  role: string,
  capabilities: string[] = [],
  dependencies: string[] = [],
  parent?: string
): AgentNode {
  const graph = graphs.get(graphId);
  if (!graph) throw new Error(`Graph not found: ${graphId}`);

  const node: AgentNode = {
    id: genId('agent'),
    name, role, capabilities, dependencies,
    status: 'idle', parent,
  };
  graph.nodes.set(node.id, node);

  // Auto-create dependency edges
  for (const depId of dependencies) {
    graph.edges.push({ from: depId, to: node.id, type: 'dependency' });
  }

  // Hierarchy edge
  if (parent) {
    graph.edges.push({ from: parent, to: node.id, type: 'hierarchy' });
  }

  return node;
}

/**
 * Add an edge (relationship) between agents
 */
export function addEdge(graphId: string, fromId: string, toId: string, type: AgentEdge['type']): void {
  const graph = graphs.get(graphId);
  if (!graph) throw new Error(`Graph not found: ${graphId}`);
  graph.edges.push({ from: fromId, to: toId, type });
}

/**
 * Topological sort for execution order (respects dependencies)
 */
export function computeExecutionOrder(graphId: string): string[] {
  const graph = graphs.get(graphId);
  if (!graph) throw new Error(`Graph not found: ${graphId}`);

  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Initialize
  for (const [id] of graph.nodes) {
    inDegree.set(id, 0);
    adjList.set(id, []);
  }

  // Build adjacency from dependency edges
  for (const edge of graph.edges) {
    if (edge.type === 'dependency') {
      adjList.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adjList.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (order.length !== graph.nodes.size) {
    throw new Error('Cycle detected in agent graph — cannot compute execution order');
  }

  graph.executionOrder = order;
  return order;
}

/**
 * Get agents that can run in parallel (same level of dependencies resolved)
 */
export function getParallelGroups(graphId: string): string[][] {
  const graph = graphs.get(graphId);
  if (!graph) throw new Error(`Graph not found: ${graphId}`);

  if (!graph.executionOrder) computeExecutionOrder(graphId);

  const levels = new Map<string, number>();
  for (const nodeId of graph.executionOrder!) {
    const node = graph.nodes.get(nodeId)!;
    let maxDepLevel = -1;
    for (const depId of node.dependencies) {
      maxDepLevel = Math.max(maxDepLevel, levels.get(depId) || 0);
    }
    levels.set(nodeId, maxDepLevel + 1);
  }

  // Group by level
  const groups = new Map<number, string[]>();
  for (const [nodeId, level] of levels) {
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level)!.push(nodeId);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([, group]) => group);
}

/**
 * Execute a handoff between agents (context passing)
 */
export function handoff(graphId: string, fromId: string, toId: string, data: any): void {
  const graph = graphs.get(graphId);
  if (!graph) throw new Error(`Graph not found: ${graphId}`);

  const fromNode = graph.nodes.get(fromId);
  const toNode = graph.nodes.get(toId);
  if (!fromNode || !toNode) throw new Error('Agent not found');

  fromNode.output = data;
  toNode.input = data;
  toNode.status = 'waiting';

  graph.edges.push({ from: fromId, to: toId, type: 'handoff', metadata: { handoffAt: new Date().toISOString() } });
}

/**
 * Get graph summary
 */
export function getGraphSummary(graphId: string): Record<string, any> {
  const graph = graphs.get(graphId);
  if (!graph) throw new Error(`Graph not found: ${graphId}`);

  const nodes = Array.from(graph.nodes.values());
  const statusCounts: Record<string, number> = {};
  for (const n of nodes) {
    statusCounts[n.status] = (statusCounts[n.status] || 0) + 1;
  }

  return {
    id: graph.id,
    name: graph.name,
    status: graph.status,
    nodeCount: nodes.length,
    edgeCount: graph.edges.length,
    statusCounts,
    agents: nodes.map(n => ({ id: n.id, name: n.name, role: n.role, status: n.status, deps: n.dependencies.length })),
    executionOrder: graph.executionOrder,
    parallelGroups: graph.executionOrder ? getParallelGroups(graphId).map(g => g.map(id => graph.nodes.get(id)!.name)) : undefined,
  };
}

// ── Tool Schema & Handler ──

export const agentGraphsSchema = {
  name: 'agent_graphs',
  description: 'Hierarchical multi-agent DAGs. Create structured agent dependency graphs, compute execution order via topological sort, identify parallel groups, and manage agent handoffs with context passing.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create', 'add_agent', 'add_edge', 'plan', 'parallel_groups', 'handoff', 'summary', 'list'] },
      graph_id: { type: 'string' },
      name: { type: 'string', description: 'Graph or agent name' },
      role: { type: 'string', description: 'Agent role' },
      capabilities: { type: 'array', items: { type: 'string' } },
      dependencies: { type: 'array', items: { type: 'string' }, description: 'Agent IDs this depends on' },
      parent_id: { type: 'string', description: 'Parent agent for hierarchy' },
      from_id: { type: 'string' }, to_id: { type: 'string' },
      edge_type: { type: 'string', enum: ['dependency', 'handoff', 'data-flow', 'hierarchy'] },
      data: { type: 'object', description: 'Handoff data' },
    },
    required: ['action'],
  },
};

export function handleAgentGraphs(args: any): string {
  try {
    switch (args.action) {
      case 'create': {
        const graph = createGraph(args.name || 'Unnamed Graph');
        return JSON.stringify({ success: true, graphId: graph.id, name: graph.name });
      }
      case 'add_agent': {
        if (!args.graph_id) return JSON.stringify({ success: false, error: 'graph_id required' });
        const node = addAgent(args.graph_id, args.name || 'Agent', args.role || 'worker', args.capabilities || [], args.dependencies || [], args.parent_id);
        return JSON.stringify({ success: true, agentId: node.id, name: node.name });
      }
      case 'add_edge': {
        if (!args.graph_id || !args.from_id || !args.to_id) return JSON.stringify({ success: false, error: 'graph_id, from_id, to_id required' });
        addEdge(args.graph_id, args.from_id, args.to_id, (args.edge_type || 'dependency') as any);
        return JSON.stringify({ success: true });
      }
      case 'plan': {
        if (!args.graph_id) return JSON.stringify({ success: false, error: 'graph_id required' });
        const order = computeExecutionOrder(args.graph_id);
        const graph = graphs.get(args.graph_id)!;
        return JSON.stringify({ success: true, executionOrder: order.map(id => ({ id, name: graph.nodes.get(id)!.name })) });
      }
      case 'parallel_groups': {
        if (!args.graph_id) return JSON.stringify({ success: false, error: 'graph_id required' });
        const groups = getParallelGroups(args.graph_id);
        const graph = graphs.get(args.graph_id)!;
        return JSON.stringify({ success: true, groups: groups.map((g, i) => ({ level: i, agents: g.map(id => graph.nodes.get(id)!.name) })) });
      }
      case 'handoff': {
        if (!args.graph_id || !args.from_id || !args.to_id) return JSON.stringify({ success: false, error: 'graph_id, from_id, to_id required' });
        handoff(args.graph_id, args.from_id, args.to_id, args.data || {});
        return JSON.stringify({ success: true, message: 'Handoff complete' });
      }
      case 'summary': {
        if (!args.graph_id) return JSON.stringify({ success: false, error: 'graph_id required' });
        return JSON.stringify({ success: true, ...getGraphSummary(args.graph_id) });
      }
      case 'list': {
        const all = Array.from(graphs.values());
        return JSON.stringify({ success: true, graphs: all.map(g => ({ id: g.id, name: g.name, status: g.status, nodeCount: g.nodes.size })) });
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
