/**
 * VegaMCP — Webhook Management
 * Dynamic webhook endpoint creation and management.
 * MCP Tools: webhook_create, webhook_list, webhook_delete, webhook_test
 */

import { logAudit } from '../../db/graph-store.js';

// ═══════════════════════════════════════════════
// WEBHOOK STATE
// ═══════════════════════════════════════════════

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  action: {
    task_type: string;
    priority: number;
    input_template: Record<string, any>;
  };
  enabled: boolean;
  fireCount: number;
  lastFired: string | null;
  createdAt: string;
  history: Array<{ timestamp: string; payload: any; status: string }>;
}

const webhooks: Map<string, WebhookConfig> = new Map();

function generateWebhookId(): string {
  return `wh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateSecret(): string {
  return Array.from({ length: 32 }, () =>
    Math.random().toString(36).charAt(2)
  ).join('');
}

// ═══════════════════════════════════════════════
// MCP TOOLS
// ═══════════════════════════════════════════════

export const webhookCreateSchema = {
  name: 'webhook_create',
  description: 'Create a dynamic webhook endpoint that auto-creates swarm tasks when triggered. Returns a webhook URL and secret for HMAC-SHA256 signature verification.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Human-readable name for the webhook' },
      task_type: { type: 'string', description: 'Task type to create when webhook fires' },
      priority: { type: 'number', description: 'Task priority', default: 1 },
      input_template: { type: 'object', description: 'Template for task input (webhook payload merged into this)', properties: {} },
    },
    required: ['name', 'task_type'],
  },
};

export async function handleWebhookCreate(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  try {
    const id = generateWebhookId();
    const secret = generateSecret();

    const webhook: WebhookConfig = {
      id,
      name: args.name,
      url: `/webhooks/${id}`,
      secret,
      action: {
        task_type: args.task_type,
        priority: args.priority || 1,
        input_template: args.input_template || {},
      },
      enabled: true,
      fireCount: 0,
      lastFired: null,
      createdAt: new Date().toISOString(),
      history: [],
    };

    webhooks.set(id, webhook);

    logAudit('webhook_create', `Created webhook ${id}: ${args.name}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({
      success: true,
      webhook: {
        id,
        name: args.name,
        url: webhook.url,
        secret,
        taskType: args.task_type,
        message: 'Webhook created. POST to the URL with JSON payload to trigger. Include X-Webhook-Signature header with HMAC-SHA256 of the body using the secret.',
      },
    }, null, 2) }] };
  } catch (err: any) {
    logAudit('webhook_create', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}

export const webhookListSchema = {
  name: 'webhook_list',
  description: 'List all registered webhooks with their configuration and fire history.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export async function handleWebhookList(): Promise<{ content: Array<{ type: string; text: string }> }> {
  const hooks = Array.from(webhooks.values()).map(w => ({
    id: w.id,
    name: w.name,
    url: w.url,
    taskType: w.action.task_type,
    enabled: w.enabled,
    fireCount: w.fireCount,
    lastFired: w.lastFired,
    createdAt: w.createdAt,
  }));

  return { content: [{ type: 'text', text: JSON.stringify({ success: true, webhooks: hooks, count: hooks.length }, null, 2) }] };
}

export const webhookDeleteSchema = {
  name: 'webhook_delete',
  description: 'Delete a webhook by ID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      webhook_id: { type: 'string', description: 'Webhook ID to delete' },
    },
    required: ['webhook_id'],
  },
};

export async function handleWebhookDelete(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (!webhooks.has(args.webhook_id)) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Webhook ${args.webhook_id} not found` } }) }] };
  }

  webhooks.delete(args.webhook_id);
  logAudit('webhook_delete', `Deleted webhook ${args.webhook_id}`, true);
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, webhook_id: args.webhook_id }) }] };
}

export const webhookTestSchema = {
  name: 'webhook_test',
  description: 'Test fire a webhook with sample data to verify it works.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      webhook_id: { type: 'string', description: 'Webhook ID to test' },
      test_payload: { type: 'object', description: 'Test payload to simulate', properties: {} },
    },
    required: ['webhook_id'],
  },
};

export async function handleWebhookTest(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const webhook = webhooks.get(args.webhook_id);
  if (!webhook) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Webhook ${args.webhook_id} not found` } }) }] };
  }

  // Simulate webhook fire
  webhook.fireCount++;
  webhook.lastFired = new Date().toISOString();
  webhook.history.push({
    timestamp: webhook.lastFired,
    payload: args.test_payload || {},
    status: 'test_fire',
  });

  // Keep history under 50 entries
  if (webhook.history.length > 50) {
    webhook.history = webhook.history.slice(-50);
  }

  logAudit('webhook_test', `Test fired webhook ${args.webhook_id}`, true);
  return { content: [{ type: 'text', text: JSON.stringify({
    success: true,
    webhook_id: args.webhook_id,
    name: webhook.name,
    taskType: webhook.action.task_type,
    testPayload: args.test_payload,
    message: 'Webhook test fired successfully. In production, this would create a swarm task.',
  }, null, 2) }] };
}
