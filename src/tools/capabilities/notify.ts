/**
 * VegaMCP — Notify Tool
 * Send notifications to the host/user. Supports multiple channels.
 * Inspired by MCP Notify Server and Desktop notification MCP servers.
 */

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Notification {
  id: string;
  channel: string;
  title: string;
  body: string;
  level: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
  metadata: Record<string, any>;
}

// In-memory notification store
const notifications: Notification[] = [];
const MAX_NOTIFICATIONS = 200;

export const notifyToolSchema = {
  name: 'notify',
  description: 'Send a notification to the user or retrieve notification history. ' +
    'Supports info, success, warning, and error levels. ' +
    'Notifications are stored in memory for later retrieval.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['send', 'list', 'mark_read', 'clear'],
        description: 'Action to perform',
        default: 'send',
      },
      title: {
        type: 'string',
        description: 'Notification title (for send)',
      },
      body: {
        type: 'string',
        description: 'Notification body/message (for send)',
      },
      level: {
        type: 'string',
        enum: ['info', 'success', 'warning', 'error'],
        description: 'Notification severity level',
        default: 'info',
      },
      channel: {
        type: 'string',
        description: 'Notification channel (e.g. "swarm", "task", "system")',
        default: 'system',
      },
      metadata: {
        type: 'object',
        description: 'Optional metadata to attach to the notification',
        properties: {},
      },
      notification_id: {
        type: 'string',
        description: 'Notification ID (for mark_read)',
      },
      limit: {
        type: 'number',
        description: 'Max notifications to return (for list)',
        default: 20,
      },
      unread_only: {
        type: 'boolean',
        description: 'Only return unread notifications (for list)',
        default: false,
      },
    },
    required: ['action'],
  },
};

export function handleNotifyTool(args: any): string {
  try {
    const action = args.action || 'send';

    switch (action) {
      case 'send': {
        if (!args.title && !args.body) {
          return JSON.stringify({ success: false, error: { code: 'MISSING_CONTENT', message: 'Either title or body is required' } });
        }

        const notification: Notification = {
          id: `notif-${randomId()}`,
          channel: args.channel || 'system',
          title: args.title || '',
          body: args.body || '',
          level: args.level || 'info',
          timestamp: new Date().toISOString(),
          read: false,
          metadata: args.metadata || {},
        };

        notifications.unshift(notification);

        // Trim old notifications
        while (notifications.length > MAX_NOTIFICATIONS) {
          notifications.pop();
        }

        // Log to stderr for MCP hosts that capture it
        const icon = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' }[notification.level] || 'ℹ️';
        process.stderr.write(`\n${icon} [${notification.channel.toUpperCase()}] ${notification.title}: ${notification.body}\n`);

        return JSON.stringify({
          success: true,
          notification: {
            id: notification.id,
            level: notification.level,
            channel: notification.channel,
            title: notification.title,
          },
          message: `Notification sent: "${notification.title}"`,
          totalUnread: notifications.filter(n => !n.read).length,
        });
      }

      case 'list': {
        const limit = args.limit || 20;
        const unreadOnly = args.unread_only || false;

        let filtered = unreadOnly
          ? notifications.filter(n => !n.read)
          : notifications;

        if (args.channel) {
          filtered = filtered.filter(n => n.channel === args.channel);
        }

        const result = filtered.slice(0, limit);

        return JSON.stringify({
          success: true,
          notifications: result.map(n => ({
            id: n.id,
            channel: n.channel,
            title: n.title,
            body: n.body,
            level: n.level,
            timestamp: n.timestamp,
            read: n.read,
          })),
          count: result.length,
          totalNotifications: notifications.length,
          totalUnread: notifications.filter(n => !n.read).length,
        });
      }

      case 'mark_read': {
        if (args.notification_id === 'all') {
          const count = notifications.filter(n => !n.read).length;
          notifications.forEach(n => { n.read = true; });
          return JSON.stringify({ success: true, message: `Marked ${count} notifications as read` });
        }

        const notif = notifications.find(n => n.id === args.notification_id);
        if (!notif) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
        }
        notif.read = true;
        return JSON.stringify({ success: true, message: `Notification "${notif.title}" marked as read` });
      }

      case 'clear': {
        const count = notifications.length;
        notifications.length = 0;
        return JSON.stringify({ success: true, message: `Cleared ${count} notifications` });
      }

      default:
        return JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: { code: 'NOTIFY_ERROR', message: err.message } });
  }
}
