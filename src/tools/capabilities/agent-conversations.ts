/**
 * VegaMCP — Agent Conversations
 * Inter-agent chat system with thread management.
 * Supports local Ollama models or cloud API for generating agent responses.
 */

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Message {
  id: string;
  threadId: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  metadata: Record<string, any>;
}

interface Thread {
  id: string;
  participants: string[];
  topic: string;
  createdAt: string;
  lastActivity: string;
  messageCount: number;
  status: 'active' | 'closed';
}

// In-memory stores
const threads = new Map<string, Thread>();
const messages = new Map<string, Message[]>(); // threadId -> messages

export const agentConversationSchema = {
  name: 'agent_conversation',
  description: 'Manage inter-agent conversations. Create threads, send messages between agents, ' +
    'and read conversation history. Enables agents to collaborate by discussing tasks, ' +
    'asking questions, and sharing findings in structured threads.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create_thread', 'send_message', 'read_thread', 'list_threads', 'close_thread'],
        description: 'Action to perform',
      },
      thread_id: {
        type: 'string',
        description: 'Thread ID (for send_message, read_thread, close_thread)',
      },
      participants: {
        type: 'array',
        items: { type: 'string' },
        description: 'Agent IDs participating in the thread (for create_thread)',
      },
      topic: {
        type: 'string',
        description: 'Thread topic/subject (for create_thread)',
      },
      from: {
        type: 'string',
        description: 'Sender agent ID (for send_message)',
      },
      to: {
        type: 'string',
        description: 'Recipient agent ID (for send_message)',
      },
      content: {
        type: 'string',
        description: 'Message content (for send_message)',
      },
      metadata: {
        type: 'object',
        description: 'Optional metadata to attach',
        properties: {},
      },
      limit: {
        type: 'number',
        description: 'Max messages to return (for read_thread)',
        default: 20,
      },
      agent_id: {
        type: 'string',
        description: 'Filter threads by participant agent (for list_threads)',
      },
    },
    required: ['action'],
  },
};

export function handleAgentConversation(args: any): string {
  try {
    const { action } = args;

    switch (action) {
      case 'create_thread': {
        if (!args.participants || args.participants.length < 2) {
          return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'Need at least 2 participants' } });
        }
        const now = new Date().toISOString();
        const thread: Thread = {
          id: `thread-${genId()}`,
          participants: args.participants,
          topic: args.topic || 'General Discussion',
          createdAt: now,
          lastActivity: now,
          messageCount: 0,
          status: 'active',
        };
        threads.set(thread.id, thread);
        messages.set(thread.id, []);
        return JSON.stringify({
          success: true,
          thread: { id: thread.id, topic: thread.topic, participants: thread.participants },
          message: `Thread "${thread.topic}" created with ${thread.participants.length} participants`,
        });
      }

      case 'send_message': {
        const thread = threads.get(args.thread_id);
        if (!thread) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Thread not found' } });
        }
        if (thread.status === 'closed') {
          return JSON.stringify({ success: false, error: { code: 'THREAD_CLOSED', message: 'Thread is closed' } });
        }
        const msg: Message = {
          id: `msg-${genId()}`,
          threadId: args.thread_id,
          from: args.from || 'unknown',
          to: args.to || 'all',
          content: args.content || '',
          timestamp: new Date().toISOString(),
          metadata: args.metadata || {},
        };
        const threadMsgs = messages.get(args.thread_id) || [];
        threadMsgs.push(msg);
        messages.set(args.thread_id, threadMsgs);
        thread.messageCount++;
        thread.lastActivity = msg.timestamp;
        return JSON.stringify({
          success: true,
          message: { id: msg.id, from: msg.from, to: msg.to, timestamp: msg.timestamp },
          threadMessageCount: thread.messageCount,
        });
      }

      case 'read_thread': {
        const thread = threads.get(args.thread_id);
        if (!thread) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Thread not found' } });
        }
        const limit = args.limit || 20;
        const threadMsgs = (messages.get(args.thread_id) || []).slice(-limit);
        return JSON.stringify({
          success: true,
          thread: { id: thread.id, topic: thread.topic, participants: thread.participants, status: thread.status },
          messages: threadMsgs.map(m => ({
            id: m.id, from: m.from, to: m.to, content: m.content, timestamp: m.timestamp,
          })),
          count: threadMsgs.length,
          totalMessages: thread.messageCount,
        });
      }

      case 'list_threads': {
        let allThreads = Array.from(threads.values());
        if (args.agent_id) {
          allThreads = allThreads.filter(t => t.participants.includes(args.agent_id));
        }
        return JSON.stringify({
          success: true,
          threads: allThreads.map(t => ({
            id: t.id,
            topic: t.topic,
            participants: t.participants,
            messageCount: t.messageCount,
            lastActivity: t.lastActivity,
            status: t.status,
          })),
          count: allThreads.length,
        });
      }

      case 'close_thread': {
        const thread = threads.get(args.thread_id);
        if (!thread) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Thread not found' } });
        }
        thread.status = 'closed';
        return JSON.stringify({ success: true, message: `Thread "${thread.topic}" closed` });
      }

      default:
        return JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: { code: 'CONVERSATION_ERROR', message: err.message } });
  }
}
