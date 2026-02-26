/**
 * VegaMCP — Dynamic Indexing & Real-Time Updates
 * Event-driven re-indexing pipeline. When data changes, vectors and graphs
 * are automatically updated without full rebuilds.
 */

export interface IndexEvent {
  id: string;
  type: 'create' | 'update' | 'delete';
  source: 'entity' | 'observation' | 'relation' | 'file' | 'tool_output';
  data: Record<string, any>;
  timestamp: string;
  processed: boolean;
}

export interface IndexSubscription {
  id: string;
  source: string;
  callback: (event: IndexEvent) => Promise<void>;
  filter?: (event: IndexEvent) => boolean;
}

// Event queue and subscriptions
const eventQueue: IndexEvent[] = [];
const subscriptions = new Map<string, IndexSubscription>();
const processedEvents = new Set<string>();
let processingInterval: any = null;
const MAX_QUEUE_SIZE = 1000;
const BATCH_SIZE = 20;

function genId(): string {
  return `idx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Emit an indexing event
 */
export function emitIndexEvent(
  type: IndexEvent['type'],
  source: IndexEvent['source'],
  data: Record<string, any>
): string {
  const event: IndexEvent = {
    id: genId(),
    type, source, data,
    timestamp: new Date().toISOString(),
    processed: false,
  };

  eventQueue.push(event);

  // Prevent queue overflow
  while (eventQueue.length > MAX_QUEUE_SIZE) {
    eventQueue.shift();
  }

  return event.id;
}

/**
 * Subscribe to indexing events
 */
export function subscribe(
  source: string,
  callback: (event: IndexEvent) => Promise<void>,
  filter?: (event: IndexEvent) => boolean
): string {
  const id = genId();
  subscriptions.set(id, { id, source, callback, filter });
  return id;
}

/**
 * Unsubscribe
 */
export function unsubscribe(subId: string): void {
  subscriptions.delete(subId);
}

/**
 * Process pending events in batch
 */
export async function processBatch(): Promise<{ processed: number; errors: number }> {
  const pending = eventQueue.filter(e => !e.processed).slice(0, BATCH_SIZE);
  let processed = 0;
  let errors = 0;

  for (const event of pending) {
    if (processedEvents.has(event.id)) {
      event.processed = true;
      continue;
    }

    for (const sub of subscriptions.values()) {
      // Match source or wildcard
      if (sub.source !== '*' && sub.source !== event.source) continue;
      // Apply filter
      if (sub.filter && !sub.filter(event)) continue;

      try {
        await sub.callback(event);
        processed++;
      } catch {
        errors++;
      }
    }

    event.processed = true;
    processedEvents.add(event.id);

    // Cleanup old processed IDs (keep last 5000)
    if (processedEvents.size > 5000) {
      const arr = Array.from(processedEvents);
      for (let i = 0; i < 1000; i++) processedEvents.delete(arr[i]);
    }
  }

  return { processed, errors };
}

/**
 * Start automatic batch processing
 */
export function startAutoProcessing(intervalMs: number = 5000): void {
  if (processingInterval) return;
  processingInterval = setInterval(async () => {
    const pending = eventQueue.filter(e => !e.processed);
    if (pending.length > 0) {
      await processBatch();
    }
  }, intervalMs);
}

/**
 * Stop automatic processing
 */
export function stopAutoProcessing(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
}

/**
 * Force reindex all (rebuild from scratch)
 */
export function triggerFullReindex(source: IndexEvent['source'] = 'entity'): string {
  return emitIndexEvent('update', source, { fullReindex: true, triggeredAt: new Date().toISOString() });
}

/**
 * Get indexing stats
 */
export function getIndexingStats(): Record<string, any> {
  const pending = eventQueue.filter(e => !e.processed);
  const bySource: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const event of eventQueue) {
    bySource[event.source] = (bySource[event.source] || 0) + 1;
    byType[event.type] = (byType[event.type] || 0) + 1;
  }

  return {
    totalEvents: eventQueue.length,
    pendingEvents: pending.length,
    processedEvents: processedEvents.size,
    subscriptions: subscriptions.size,
    autoProcessing: !!processingInterval,
    bySource,
    byType,
  };
}

// ── Tool Schema & Handler ──

export const dynamicIndexingSchema = {
  name: 'dynamic_indexing',
  description: 'Real-time event-driven indexing pipeline. Emit index events when data changes, subscribe to events for automatic re-indexing, process event batches, and trigger full reindexes. No manual rebuilds needed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['emit', 'subscribe', 'unsubscribe', 'process', 'start_auto', 'stop_auto', 'reindex', 'stats'] },
      event_type: { type: 'string', enum: ['create', 'update', 'delete'] },
      source: { type: 'string', enum: ['entity', 'observation', 'relation', 'file', 'tool_output'] },
      data: { type: 'object', description: 'Event data' },
      subscription_id: { type: 'string' },
      interval_ms: { type: 'number', description: 'Auto-processing interval in ms (default: 5000)' },
    },
    required: ['action'],
  },
};

export function handleDynamicIndexing(args: any): string {
  try {
    switch (args.action) {
      case 'emit': {
        if (!args.event_type || !args.source) return JSON.stringify({ success: false, error: 'event_type and source required' });
        const id = emitIndexEvent(args.event_type, args.source, args.data || {});
        return JSON.stringify({ success: true, eventId: id });
      }
      case 'subscribe': {
        if (!args.source) return JSON.stringify({ success: false, error: 'source required' });
        const id = subscribe(args.source, async (event) => {
          // Default handler: log the event
          console.error(`[DynamicIndex] ${event.type} ${event.source}: ${JSON.stringify(event.data).slice(0, 100)}`);
        });
        return JSON.stringify({ success: true, subscriptionId: id });
      }
      case 'unsubscribe': {
        if (!args.subscription_id) return JSON.stringify({ success: false, error: 'subscription_id required' });
        unsubscribe(args.subscription_id);
        return JSON.stringify({ success: true });
      }
      case 'process': {
        // Use .then to handle the promise
        const stats = { processed: 0, errors: 0 };
        processBatch().then(r => { stats.processed = r.processed; stats.errors = r.errors; });
        return JSON.stringify({ success: true, message: 'Batch processing initiated', pending: eventQueue.filter(e => !e.processed).length });
      }
      case 'start_auto': {
        startAutoProcessing(args.interval_ms || 5000);
        return JSON.stringify({ success: true, message: `Auto-processing started (${args.interval_ms || 5000}ms interval)` });
      }
      case 'stop_auto': {
        stopAutoProcessing();
        return JSON.stringify({ success: true, message: 'Auto-processing stopped' });
      }
      case 'reindex': {
        const id = triggerFullReindex(args.source || 'entity');
        return JSON.stringify({ success: true, eventId: id, message: 'Full reindex triggered' });
      }
      case 'stats': {
        return JSON.stringify({ success: true, ...getIndexingStats() });
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
