/**
 * VegaMCP — Resource Links in Tool Results (MCP 2025-06-18)
 * Tool results can include links to MCP resources for lazy context loading.
 * Clients can fetch linked resources on demand without bloating the initial response.
 */

export interface ResourceLink {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Create a resource link to a memory entity
 */
export function entityLink(entityName: string): ResourceLink {
  return {
    uri: `vegamcp://entities/${encodeURIComponent(entityName)}`,
    name: entityName,
    description: `Knowledge graph entity: ${entityName}`,
    mimeType: 'application/json',
  };
}

/**
 * Create a resource link to entity observations
 */
export function observationsLink(entityName: string): ResourceLink {
  return {
    uri: `vegamcp://entities/${encodeURIComponent(entityName)}/observations`,
    name: `${entityName} observations`,
    description: `All observations for entity: ${entityName}`,
    mimeType: 'application/json',
  };
}

/**
 * Create a resource link to the memory graph state
 */
export function graphLink(): ResourceLink {
  return {
    uri: 'vegamcp://memory/graph',
    name: 'Knowledge Graph',
    description: 'Full knowledge graph state',
    mimeType: 'application/json',
  };
}

/**
 * Create a resource link to swarm task status
 */
export function taskLink(taskId: string): ResourceLink {
  return {
    uri: `vegamcp://swarm/tasks/${taskId}`,
    name: `Task ${taskId}`,
    description: `Swarm task status and results`,
    mimeType: 'application/json',
  };
}

/**
 * Create a resource link to analytics data
 */
export function analyticsLink(period: string = 'today'): ResourceLink {
  return {
    uri: `vegamcp://analytics/${period}`,
    name: `Analytics (${period})`,
    description: `Tool usage analytics for ${period}`,
    mimeType: 'application/json',
  };
}

/**
 * Create a resource link to a file
 */
export function fileLink(filePath: string): ResourceLink {
  return {
    uri: `file://${filePath.replace(/\\/g, '/')}`,
    name: filePath.split(/[/\\]/).pop() || filePath,
    description: `File: ${filePath}`,
  };
}

/**
 * Attach resource links to a tool response
 */
export function withResourceLinks(
  response: any,
  links: ResourceLink[]
): any {
  if (!links.length) return response;
  return {
    ...response,
    _meta: {
      ...(response._meta || {}),
      resourceLinks: links,
    },
  };
}

/**
 * Auto-detect resource links from tool output text
 * Scans for entity names, task IDs, etc. and creates relevant links.
 */
export function autoDetectLinks(text: string, knownEntities: string[] = []): ResourceLink[] {
  const links: ResourceLink[] = [];
  const seen = new Set<string>();

  // Match entity names from known list
  for (const entity of knownEntities) {
    if (text.includes(entity) && !seen.has(entity)) {
      links.push(entityLink(entity));
      seen.add(entity);
    }
  }

  // Match task IDs (pattern: task-xxxxx or swarm-xxxxx)
  const taskMatches = text.match(/(?:task|swarm)-[a-z0-9]{6,}/gi);
  if (taskMatches) {
    for (const taskId of new Set(taskMatches)) {
      links.push(taskLink(taskId));
    }
  }

  // Match file paths
  const pathMatches = text.match(/(?:\/[\w.-]+)+\.\w{1,6}/g);
  if (pathMatches) {
    for (const filepath of new Set(Array.from(pathMatches).slice(0, 5))) {
      links.push(fileLink(filepath));
    }
  }

  return links.slice(0, 10);  // Cap at 10 links
}
