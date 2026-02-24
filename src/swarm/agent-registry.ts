/**
 * VegaMCP — Agent Registry
 * Central factory that creates and registers all swarm agents.
 */

import { SwarmAgent } from './agent-base.js';
import { getOrchestrator } from './orchestrator.js';

// Agent Implementations
import { ResearcherAgent } from './agents/researcher.js';
import { AnalystAgent } from './agents/analyst.js';
import { WriterAgent } from './agents/writer.js';
import { CoderAgent } from './agents/coder.js';
import { PlannerAgent } from './agents/planner.js';
import { ReviewerAgent } from './agents/reviewer.js';
import { CriticAgent } from './agents/critic.js';
import { IntegratorAgent } from './agents/integrator.js';
import { MonitorAgent } from './agents/monitor.js';
import { SummarizerAgent } from './agents/summarizer.js';

/**
 * Create all agent instances and register them with the orchestrator.
 */
export function registerAllAgents(): SwarmAgent[] {
  const orchestrator = getOrchestrator();
  const agents: SwarmAgent[] = [];

  // --- Research Coordinator Agents ---
  const researcher = new ResearcherAgent();
  orchestrator.registerAgentInstance(researcher);
  agents.push(researcher);

  const analyst = new AnalystAgent();
  orchestrator.registerAgentInstance(analyst);
  agents.push(analyst);

  const writer = new WriterAgent();
  orchestrator.registerAgentInstance(writer);
  agents.push(writer);

  const coder = new CoderAgent();
  orchestrator.registerAgentInstance(coder);
  agents.push(coder);

  const planner = new PlannerAgent();
  orchestrator.registerAgentInstance(planner);
  agents.push(planner);

  // --- Quality Coordinator Agents ---
  const reviewer = new ReviewerAgent();
  orchestrator.registerAgentInstance(reviewer);
  agents.push(reviewer);

  const critic = new CriticAgent();
  orchestrator.registerAgentInstance(critic);
  agents.push(critic);

  // --- Operations Coordinator Agents ---
  const integrator = new IntegratorAgent();
  orchestrator.registerAgentInstance(integrator);
  agents.push(integrator);

  const monitor = new MonitorAgent();
  orchestrator.registerAgentInstance(monitor);
  agents.push(monitor);

  const summarizer = new SummarizerAgent();
  orchestrator.registerAgentInstance(summarizer);
  agents.push(summarizer);

  console.error(`[Swarm] Registered ${agents.length} agents across 3 coordinators`);
  return agents;
}

/**
 * Agent name → class mapping for dynamic instantiation.
 */
export const AGENT_MAP: Record<string, new () => SwarmAgent> = {
  'researcher': ResearcherAgent,
  'analyst': AnalystAgent,
  'writer': WriterAgent,
  'coder': CoderAgent,
  'planner': PlannerAgent,
  'reviewer': ReviewerAgent,
  'critic': CriticAgent,
  'integrator': IntegratorAgent,
  'monitor': MonitorAgent,
  'summarizer': SummarizerAgent,
};
