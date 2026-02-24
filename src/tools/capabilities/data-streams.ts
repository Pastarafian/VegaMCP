/**
 * VegaMCP — Data Streams (Pub/Sub)
 * Named channels for agent-to-agent reactive communication.
 * Agents publish findings, other agents subscribe and react.
 */

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface StreamMessage {
  id: string;
  stream: string;
  publisher: string;
  content: any;
  tags: string[];
  timestamp: string;
}

interface Stream {
  name: string;
  description: string;
  subscribers: string[];
  messages: StreamMessage[];
  maxBuffer: number;
  createdAt: string;
  totalPublished: number;
}

// In-memory store
const streams = new Map<string, Stream>();

export const dataStreamSchema = {
  name: 'data_stream',
  description: 'Pub/Sub data streams for agent communication. Create named channels, publish messages, ' +
    'subscribe agents, and read stream contents. Enables reactive agent coordination — ' +
    'agents publish findings and other agents react to them.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'publish', 'subscribe', 'unsubscribe', 'read', 'list', 'delete'],
        description: 'Action to perform',
      },
      stream: {
        type: 'string',
        description: 'Stream name (e.g. "research-findings", "code-reviews", "alerts")',
      },
      description: {
        type: 'string',
        description: 'Stream description (for create)',
      },
      publisher: {
        type: 'string',
        description: 'Publisher agent ID (for publish)',
      },
      subscriber: {
        type: 'string',
        description: 'Subscriber agent ID (for subscribe/unsubscribe)',
      },
      content: {
        type: 'string',
        description: 'Message content — string or object (for publish)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Message tags for filtering (for publish)',
      },
      max_buffer: {
        type: 'number',
        description: 'Max messages to buffer (for create)',
        default: 50,
      },
      limit: {
        type: 'number',
        description: 'Max messages to return (for read)',
        default: 20,
      },
      tag: {
        type: 'string',
        description: 'Filter by tag (for read)',
      },
      since: {
        type: 'string',
        description: 'ISO timestamp — only return messages after this time (for read)',
      },
    },
    required: ['action'],
  },
};

export function handleDataStream(args: any): string {
  try {
    const { action } = args;

    switch (action) {
      case 'create': {
        if (!args.stream) {
          return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'stream name is required' } });
        }
        if (streams.has(args.stream)) {
          return JSON.stringify({ success: false, error: { code: 'ALREADY_EXISTS', message: `Stream "${args.stream}" already exists` } });
        }
        const stream: Stream = {
          name: args.stream,
          description: args.description || '',
          subscribers: [],
          messages: [],
          maxBuffer: args.max_buffer || 50,
          createdAt: new Date().toISOString(),
          totalPublished: 0,
        };
        streams.set(args.stream, stream);
        return JSON.stringify({
          success: true,
          stream: { name: stream.name, description: stream.description, maxBuffer: stream.maxBuffer },
          message: `Stream "${stream.name}" created`,
        });
      }

      case 'publish': {
        if (!args.stream) {
          return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'stream name is required' } });
        }
        // Auto-create stream if it doesn't exist
        if (!streams.has(args.stream)) {
          streams.set(args.stream, {
            name: args.stream,
            description: 'Auto-created stream',
            subscribers: [],
            messages: [],
            maxBuffer: 50,
            createdAt: new Date().toISOString(),
            totalPublished: 0,
          });
        }
        const stream = streams.get(args.stream)!;
        const msg: StreamMessage = {
          id: `sm-${genId()}`,
          stream: args.stream,
          publisher: args.publisher || 'unknown',
          content: args.content || '',
          tags: args.tags || [],
          timestamp: new Date().toISOString(),
        };
        stream.messages.push(msg);
        stream.totalPublished++;
        // Trim buffer
        while (stream.messages.length > stream.maxBuffer) {
          stream.messages.shift();
        }
        return JSON.stringify({
          success: true,
          messageId: msg.id,
          stream: args.stream,
          subscribers: stream.subscribers.length,
          bufferSize: stream.messages.length,
        });
      }

      case 'subscribe': {
        const stream = streams.get(args.stream);
        if (!stream) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Stream "${args.stream}" not found` } });
        }
        if (!args.subscriber) {
          return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'subscriber is required' } });
        }
        if (!stream.subscribers.includes(args.subscriber)) {
          stream.subscribers.push(args.subscriber);
        }
        return JSON.stringify({
          success: true,
          stream: args.stream,
          subscriber: args.subscriber,
          totalSubscribers: stream.subscribers.length,
        });
      }

      case 'unsubscribe': {
        const stream = streams.get(args.stream);
        if (!stream) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Stream "${args.stream}" not found` } });
        }
        stream.subscribers = stream.subscribers.filter(s => s !== args.subscriber);
        return JSON.stringify({
          success: true,
          stream: args.stream,
          subscriber: args.subscriber,
          totalSubscribers: stream.subscribers.length,
        });
      }

      case 'read': {
        const stream = streams.get(args.stream);
        if (!stream) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Stream "${args.stream}" not found` } });
        }
        let msgs = [...stream.messages];
        if (args.tag) {
          msgs = msgs.filter(m => m.tags.includes(args.tag));
        }
        if (args.since) {
          const sinceDate = new Date(args.since).getTime();
          msgs = msgs.filter(m => new Date(m.timestamp).getTime() > sinceDate);
        }
        const limit = args.limit || 20;
        const result = msgs.slice(-limit);
        return JSON.stringify({
          success: true,
          stream: args.stream,
          messages: result.map(m => ({
            id: m.id,
            publisher: m.publisher,
            content: m.content,
            tags: m.tags,
            timestamp: m.timestamp,
          })),
          count: result.length,
          totalInBuffer: stream.messages.length,
          subscribers: stream.subscribers,
        });
      }

      case 'list': {
        const allStreams = Array.from(streams.values());
        return JSON.stringify({
          success: true,
          streams: allStreams.map(s => ({
            name: s.name,
            description: s.description,
            subscribers: s.subscribers.length,
            bufferedMessages: s.messages.length,
            totalPublished: s.totalPublished,
            createdAt: s.createdAt,
          })),
          count: allStreams.length,
        });
      }

      case 'delete': {
        if (!streams.has(args.stream)) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Stream "${args.stream}" not found` } });
        }
        streams.delete(args.stream);
        return JSON.stringify({ success: true, message: `Stream "${args.stream}" deleted` });
      }

      default:
        return JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: { code: 'STREAM_ERROR', message: err.message } });
  }
}
