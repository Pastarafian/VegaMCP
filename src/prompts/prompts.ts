/**
 * VegaMCP — MCP Prompts
 * Pre-built workflow prompts for common multi-step operations.
 */

export const mcpPrompts = [
  {
    name: 'investigate_error',
    description: 'Investigate a production error by chaining: Sentry lookup → source correlation → fix.',
    arguments: [
      { name: 'issueId', description: 'Sentry issue ID or search query', required: true },
    ],
  },
  {
    name: 'architecture_review',
    description: 'Review the project architecture by querying the memory graph and analyzing patterns.',
    arguments: [
      { name: 'focus', description: 'Specific area to review (optional)', required: false },
    ],
  },
  {
    name: 'research_pipeline',
    description: 'Run a multi-agent research pipeline: research → analyze → review → summarize.',
    arguments: [
      { name: 'topic', description: 'Topic to research', required: true },
      { name: 'depth', description: 'Research depth (quick, standard, deep)', required: false },
    ],
  },
  {
    name: 'swarm_status_report',
    description: 'Generate a comprehensive status report of the agent swarm, including agent health, task metrics, and system performance.',
    arguments: [],
  },
  {
    name: 'code_review_pipeline',
    description: 'Execute a full code review pipeline: analyze code → critique → suggest improvements → summarize.',
    arguments: [
      { name: 'code', description: 'Code or file path to review', required: true },
      { name: 'language', description: 'Programming language', required: false },
    ],
  },
  {
    name: 'content_pipeline',
    description: 'Generate polished content: research → draft → critique → revise → publish.',
    arguments: [
      { name: 'topic', description: 'Content topic', required: true },
      { name: 'format', description: 'Output format (article, docs, email, report)', required: false },
    ],
  },
  {
    name: 'project_planning',
    description: 'Create a project plan: decompose tasks → estimate → identify dependencies → generate roadmap.',
    arguments: [
      { name: 'project', description: 'Project description', required: true },
      { name: 'constraints', description: 'Time/resource constraints', required: false },
    ],
  },
];

export function getPromptMessages(name: string, args: Record<string, string>): Array<{ role: string; content: { type: string; text: string } }> {
  switch (name) {
    case 'investigate_error':
      return [{ role: 'user', content: { type: 'text', text:
        `Investigate the production error "${args.issueId}". Follow these steps:\n\n` +
        `1. Use \`sentry_search_issues\` to find the error\n` +
        `2. Use \`sentry_get_issue_detail\` to get the full stack trace\n` +
        `3. Use \`sentry_get_breadcrumbs\` for the event timeline\n` +
        `4. Cross-reference with the memory graph using \`search_graph\`\n` +
        `5. Suggest a fix based on the findings\n` +
        `6. Store your findings with \`create_entities\`` } }];

    case 'architecture_review':
      return [{ role: 'user', content: { type: 'text', text:
        `Review the project architecture${args.focus ? ` focusing on "${args.focus}"` : ''}.\n\n` +
        `1. Use \`search_graph\` with domain "project-arch" to find architecture entities\n` +
        `2. Use \`open_nodes\` to read full entity details\n` +
        `3. Analyze relationships and identify potential improvements\n` +
        `4. Store any new insights using \`add_observations\`` } }];

    case 'research_pipeline':
      return [{ role: 'user', content: { type: 'text', text:
        `Run a multi-agent research pipeline on "${args.topic}".\n\n` +
        `Depth: ${args.depth || 'standard'}\n\n` +
        `Pipeline:\n` +
        `1. Use \`swarm_create_task\` with task_type "research" to assign the Researcher agent\n` +
        `2. Use \`swarm_create_task\` with task_type "data_analysis" for the Analyst to find patterns\n` +
        `3. Use \`swarm_create_task\` with task_type "review" for the Reviewer to validate findings\n` +
        `4. Use \`swarm_create_task\` with task_type "summarize" for the Summarizer to create a report\n\n` +
        `Or use \`workflow_execute\` with template "research_report" to automate the entire pipeline.\n\n` +
        `Monitor progress with \`swarm_get_task_status\` and check results with \`swarm_get_metrics\`.` } }];

    case 'swarm_status_report':
      return [{ role: 'user', content: { type: 'text', text:
        `Generate a comprehensive swarm status report.\n\n` +
        `1. Use \`swarm_list_agents\` to get all agent states\n` +
        `2. Use \`swarm_get_metrics\` with summary=true for performance data\n` +
        `3. Check active tasks and their progress\n` +
        `4. Identify any agents in error state\n` +
        `5. Summarize overall swarm health and recommendations` } }];

    case 'code_review_pipeline':
      return [{ role: 'user', content: { type: 'text', text:
        `Review the following code${args.language ? ` (${args.language})` : ''}:\n\n${args.code}\n\n` +
        `Pipeline:\n` +
        `1. Use \`swarm_create_task\` with task_type "code_review" for the Coder to analyze the code\n` +
        `2. Use \`swarm_create_task\` with task_type "critique" for the Critic to find issues\n` +
        `3. Use \`swarm_create_task\` with task_type "review" for the Reviewer to validate the review\n` +
        `4. Use \`swarm_create_task\` with task_type "summarize" for a final assessment\n\n` +
        `Or use \`workflow_execute\` with template "code_pipeline" to automate the process.` } }];

    case 'content_pipeline':
      return [{ role: 'user', content: { type: 'text', text:
        `Create polished content about "${args.topic}".\n` +
        `Format: ${args.format || 'article'}\n\n` +
        `Pipeline:\n` +
        `1. Use \`swarm_create_task\` with task_type "research" to gather information\n` +
        `2. Use \`swarm_create_task\` with task_type "content_creation" for the Writer to draft\n` +
        `3. Use \`swarm_create_task\` with task_type "critique" for the Critic to review\n` +
        `4. Use \`swarm_create_task\` with task_type "content_creation" to revise based on feedback\n` +
        `5. Use \`swarm_create_task\` with task_type "summarize" for final publication\n\n` +
        `Or use \`workflow_execute\` with template "content_creation" to automate.` } }];

    case 'project_planning':
      return [{ role: 'user', content: { type: 'text', text:
        `Create a project plan for: "${args.project}"\n` +
        `${args.constraints ? `Constraints: ${args.constraints}\n` : ''}\n` +
        `Pipeline:\n` +
        `1. Use \`swarm_create_task\` with task_type "planning" for the Planner to decompose tasks\n` +
        `2. Use \`swarm_create_task\` with task_type "research" for the Researcher to gather requirements\n` +
        `3. Use \`swarm_create_task\` with task_type "review" for the Reviewer to validate the plan\n` +
        `4. Use \`swarm_create_task\` with task_type "summarize" for the final roadmap\n\n` +
        `Store the plan in the memory graph using \`create_entities\` for future reference.` } }];

    default:
      return [{ role: 'user', content: { type: 'text', text: `Unknown prompt: ${name}` } }];
  }
}
