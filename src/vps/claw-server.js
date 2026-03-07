const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const path = require('path');
const Database = require('/opt/node_modules/better-sqlite3');

// Vision Agent
let visionAgent, visionActions;
try {
  const va = require('/opt/claw-vision-agent.js');
  visionAgent = va.agent;
  visionActions = va.actions;
  console.log('[VisionAgent] Loaded');
} catch (e) {
  console.log('[VisionAgent] Not available:', e.message);
  visionAgent = { executeTask: () => ({ error: 'Vision agent not loaded' }), status: () => ({}), stop: () => ({}), execAction: () => ({}) };
  visionActions = { screenshot: () => ({ error: 'Not available' }) };
}

const PORT = process.env.CLAW_PORT || 4280;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const AUTHORIZED_ID = process.env.TELEGRAM_AUTHORIZED_ID || '';
const OLLAMA_PORT = process.env.OLLAMA_PORT || 11434;

// ═══════════════════════════════════════════════════════════════
// SQLite Chat Memory (persistent, searchable)
// ═══════════════════════════════════════════════════════════════
const DB_PATH = '/opt/claw-memory.db';
const db = new Database(DB_PATH);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_messages_source ON messages(source);
`);

// Full-text search index
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content, source, role,
      content='messages',
      content_rowid='id'
    );
    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, source, role) VALUES (new.id, new.content, new.source, new.role);
    END;
  `);
  console.log('🗄️  SQLite DB ready with FTS5 at', DB_PATH);
} catch (e) {
  console.log('🗄️  SQLite DB ready (FTS5 skipped):', e.message);
}

// Workspace table
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    last_accessed INTEGER DEFAULT 0
  );
`);

// Prepared statements (fast)
const stmtInsert = db.prepare('INSERT INTO messages (source, role, content, model, timestamp) VALUES (?, ?, ?, ?, ?)');
const stmtRecent = db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?');
const stmtAfter = db.prepare('SELECT * FROM messages WHERE id > ? ORDER BY id ASC LIMIT 200');
const stmtSearch = db.prepare(`SELECT m.id, m.source, m.role, m.content, m.model, m.timestamp
  FROM messages_fts f JOIN messages m ON f.rowid = m.id
  WHERE messages_fts MATCH ? ORDER BY m.timestamp DESC LIMIT ?`);
const stmtCount = db.prepare('SELECT COUNT(*) as count FROM messages');
const stmtLastId = db.prepare('SELECT MAX(id) as maxId FROM messages');

// Workspace state
let activeWorkspace = null;

// Server-side log buffer
const logBuffer = [];
const MAX_LOGS = 200;
function addLog(level, msg) {
  const entry = { ts: Date.now(), level, msg };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  console.log(`[${level}] ${msg}`);
}

let coderRunning = false;
let tgOffset = 0;
let botReady = false;
let chatHistory = [];     // Rolling in-memory buffer for Ollama context
const MAX_HISTORY = 30;
let lastUserText = '';     // For retry
let activeRequest = null;  // For cancel
let confirmMode = false;   // Require confirmation before destructive actions
let pendingAction = null;  // Action awaiting confirmation

// Model management
const AVAILABLE_MODELS = {
  'llama3': { provider: 'ollama', name: 'llama3', label: 'Llama 3 (local)' },
  'qwen': { provider: 'ollama', name: 'qwen2.5-coder', label: 'Qwen 2.5 Coder (local)' },
  'deepseek': { provider: 'deepseek', name: 'deepseek-chat', label: 'DeepSeek Chat (cloud)' },
  'deepseek-r1': { provider: 'deepseek', name: 'deepseek-reasoner', label: 'DeepSeek R1 Reasoner (cloud)' },
};
let activeModel = 'llama3'; // Default to local

// Coding modes
const CODING_MODES = {
  chat:      { label: '💬 Chat',       desc: 'General conversation and Q&A', icon: '💬' },
  coder:     { label: '⚡ Coder',      desc: 'Agentic file editing — reads, writes, and creates files directly', icon: '⚡' },
  architect: { label: '📐 Architect',  desc: 'Planning, documentation, and system design', icon: '📐' },
  visual:    { label: '👁️ Visual',     desc: 'Controls Antigravity IDE via VNC (screenshot-driven)', icon: '👁️' },
};
let activeMode = 'chat';

// Session persistence — restore from SQLite
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS session (key TEXT PRIMARY KEY, value TEXT)`).run();
  const savedModel = db.prepare('SELECT value FROM session WHERE key = ?').get('activeModel');
  const savedWorkspace = db.prepare('SELECT value FROM session WHERE key = ?').get('activeWorkspace');
  const savedConfirm = db.prepare('SELECT value FROM session WHERE key = ?').get('confirmMode');
  const savedMode = db.prepare('SELECT value FROM session WHERE key = ?').get('activeMode');
  if (savedModel) activeModel = savedModel.value;
  if (savedWorkspace) activeWorkspace = savedWorkspace.value;
  if (savedConfirm) confirmMode = savedConfirm.value === 'true';
  if (savedMode && CODING_MODES[savedMode.value]) activeMode = savedMode.value;
  console.log(`🔄 Session restored: model=${activeModel}, mode=${activeMode}, workspace=${activeWorkspace || 'none'}, confirm=${confirmMode}`);
} catch (e) { console.log('Session restore skip:', e.message); }

function saveSession(key, value) {
  try { db.prepare('INSERT OR REPLACE INTO session (key, value) VALUES (?, ?)').run(key, String(value)); } catch {}
}

// ═══════════════════════════════════════════════════════════════
// File Operations (for Coder mode)
// ═══════════════════════════════════════════════════════════════

function readFile(filePath) {
  const resolved = path.resolve(activeWorkspace || '/root', filePath);
  try {
    if (!fs.existsSync(resolved)) return { error: `File not found: ${resolved}` };
    const content = fs.readFileSync(resolved, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 200) {
      return { path: resolved, lines: lines.length, content: lines.slice(0, 200).join('\n') + `\n\n... (${lines.length - 200} more lines)` };
    }
    return { path: resolved, lines: lines.length, content };
  } catch (e) { return { error: e.message }; }
}

function writeFile(filePath, content) {
  const resolved = path.resolve(activeWorkspace || '/root', filePath);
  try {
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');
    return { success: true, path: resolved, bytes: content.length };
  } catch (e) { return { error: e.message }; }
}

function editFile(filePath, search, replace) {
  const resolved = path.resolve(activeWorkspace || '/root', filePath);
  try {
    if (!fs.existsSync(resolved)) return { error: `File not found: ${resolved}` };
    let content = fs.readFileSync(resolved, 'utf8');
    if (!content.includes(search)) return { error: `Search string not found in ${resolved}` };
    const count = (content.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    content = content.replace(search, replace);
    fs.writeFileSync(resolved, content, 'utf8');
    return { success: true, path: resolved, replacements: count };
  } catch (e) { return { error: e.message }; }
}

// ═══════════════════════════════════════════════════════════════
// UI & Telegram Markdown -> HTML Transpiler
// ═══════════════════════════════════════════════════════════════

// Telegram only supports `<blockquote expandable>` strictly inside `parse_mode: 'HTML'`.
// This transpiler converts the raw markdown response into valid HTML schema so the AI can use expandable tags.
function mdToHtml(text) {
  let out = '';
  const blocks = text.split(/(```[\s\S]*?```|<tg-expand>[\s\S]*?<\/tg-expand>)/g);
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].startsWith('```')) {
      const match = blocks[i].match(/```([\w-]*)\n?([\s\S]*?)```/);
      if (match) {
        const code = match[2].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        out += `<pre><code class="language-${match[1] || ''}">${code}</code></pre>`;
      } else { out += blocks[i]; }
    } else if (blocks[i].startsWith('<tg-expand>')) {
      let t = blocks[i].match(/<tg-expand>([\s\S]*?)<\/tg-expand>/)[1];
      t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      out += `<blockquote expandable>${t}</blockquote>`;
    } else {
      let t = blocks[i];
      t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      t = t.replace(/(^|[\s])\*([^*]+)\*([\s.,!?]|$)/g, '$1<i>$2</i>$3');
      t = t.replace(/(^|[\s])_([^_]+)_([\s.,!?]|$)/g, '$1<i>$2</i>$3');
      t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      out += t;
    }
  }
  return out;
}

// Clean up model outputs for display
// Returns { answer, thinking } — thinking is preserved for expandable UI
function extractThinking(text) {
  if (!text) return { answer: '', thinking: null };
  let thinking = null;
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) thinking = thinkMatch[1].trim();
  // Strip think tags from answer
  let answer = text.replace(/<\/?think>/g, '').replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  // Strip [ACTION:...] blocks completely so they don't leak into GUI/Telegram
  answer = answer.replace(/\[ACTION:[^\]]+\]/g, '').trim();
  return { answer, thinking };
}

function formatResponse(text) {
  return extractThinking(text).answer;
}

function addMessage(source, text, model, thinking) {
  const role = (source === 'telegram-in' || source === 'gui-in') ? 'user'
    : (source === 'telegram-out' || source === 'gui-out') ? 'assistant'
    : 'system';
  const ts = Date.now();
  // If thinking wasn't passed explicitly, try to extract it
  if (!thinking && text) {
    const extracted = extractThinking(text);
    if (extracted.thinking) {
      thinking = extracted.thinking;
      text = extracted.answer; // Store clean answer, thinking separately
    }
  }
  // Persist to SQLite (with thinking)
  const result = stmtInsert.run(source, role, text, model || null, ts);
  const msgId = Number(result.lastInsertRowid);
  // Store thinking if present
  if (thinking) {
    try { stmtUpdateThinking.run(thinking, msgId); } catch {}
  }
  const msg = { id: msgId, source, role, text, model: model || null, timestamp: ts, thinking: thinking || null };
  
  // Track in rolling conversation buffer
  if (role === 'user' || role === 'assistant') {
    chatHistory.push({ role, content: text });
    if (chatHistory.length > MAX_HISTORY) chatHistory = chatHistory.slice(-MAX_HISTORY);
  }
  
  return msg;
}

// Load recent history from DB into chatHistory buffer
function loadHistoryFromDb() {
  const rows = stmtRecent.all(40); // Last 40 messages
  rows.reverse(); // oldest first
  chatHistory = [];
  for (const row of rows) {
    if (row.role === 'user' || row.role === 'assistant') {
      chatHistory.push({ role: row.role, content: row.content });
    }
  }
  if (chatHistory.length > MAX_HISTORY) chatHistory = chatHistory.slice(-MAX_HISTORY);
  const total = stmtCount.get();
  console.log(`🗄️  Loaded ${chatHistory.length} messages into context (${total.count} total in DB)`);
}

// Search chat history
function searchMessages(query, limit = 20) {
  try {
    return stmtSearch.all(query, limit);
  } catch {
    // Fallback to LIKE search if FTS fails
    const stmt = db.prepare('SELECT * FROM messages WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?');
    return stmt.all('%' + query + '%', limit);
  }
}

// ═══════════════════════════════════════════════════════════════
// Chat Management — Edit, Delete, Merge, Dedup, Sync
// ═══════════════════════════════════════════════════════════════

// Add FTS triggers for UPDATE and DELETE (original only had INSERT)
try {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, source, role)
        VALUES('delete', old.id, old.content, old.source, old.role);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, source, role)
        VALUES('delete', old.id, old.content, old.source, old.role);
      INSERT INTO messages_fts(rowid, content, source, role)
        VALUES (new.id, new.content, new.source, new.role);
    END;
  `);
} catch (e) { console.log('[ChatMgmt] FTS trigger setup:', e.message); }

// Add sync tracking columns (idempotent)
try {
  db.exec(`ALTER TABLE messages ADD COLUMN edited_at INTEGER DEFAULT NULL`);
} catch { /* column may already exist */ }
try {
  db.exec(`ALTER TABLE messages ADD COLUMN sync_status TEXT DEFAULT 'synced'`);
} catch { /* column may already exist */ }
try {
  db.exec(`ALTER TABLE messages ADD COLUMN merged_from TEXT DEFAULT NULL`);
} catch { /* column may already exist */ }
try {
  db.exec(`ALTER TABLE messages ADD COLUMN thinking TEXT DEFAULT NULL`);
} catch { /* column may already exist */ }

// Context labelling columns
try { db.exec(`ALTER TABLE messages ADD COLUMN task_id TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE messages ADD COLUMN workspace_id TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE messages ADD COLUMN project_id TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE messages ADD COLUMN labels TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE messages ADD COLUMN archived INTEGER DEFAULT 0`); } catch {}

// Indexes for context queries
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_workspace ON messages(workspace_id)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_archived ON messages(archived)`); } catch {}

// Prepared statements for chat management
const stmtUpdateThinking = db.prepare('UPDATE messages SET thinking = ? WHERE id = ?');
const stmtEditMsg = db.prepare('UPDATE messages SET content = ?, edited_at = ?, sync_status = ? WHERE id = ?');
const stmtDeleteMsg = db.prepare('DELETE FROM messages WHERE id = ?');
const stmtGetMsg = db.prepare('SELECT * FROM messages WHERE id = ?');
const stmtGetBySource = db.prepare('SELECT * FROM messages WHERE source = ? ORDER BY id DESC LIMIT ?');
const stmtGetRange = db.prepare('SELECT * FROM messages WHERE id BETWEEN ? AND ? ORDER BY id ASC');
const stmtDeleteRange = db.prepare('DELETE FROM messages WHERE id BETWEEN ? AND ?');

// Archive statements (soft-delete, preserves data)
const stmtArchiveMsg = db.prepare('UPDATE messages SET archived = 1 WHERE id = ?');
const stmtArchiveRange = db.prepare('UPDATE messages SET archived = 1 WHERE id BETWEEN ? AND ?');
const stmtUnarchiveMsg = db.prepare('UPDATE messages SET archived = 0 WHERE id = ?');

// Context labelling statements
const stmtSetTaskId = db.prepare('UPDATE messages SET task_id = ? WHERE id = ?');
const stmtSetWorkspaceId = db.prepare('UPDATE messages SET workspace_id = ? WHERE id = ?');
const stmtSetProjectId = db.prepare('UPDATE messages SET project_id = ? WHERE id = ?');
const stmtSetLabels = db.prepare('UPDATE messages SET labels = ? WHERE id = ?');
const stmtFindDupes = db.prepare(`
  SELECT m1.id as id1, m2.id as id2, m1.content, m1.source as source1, m2.source as source2,
    m1.timestamp as ts1, m2.timestamp as ts2
  FROM messages m1
  JOIN messages m2 ON m1.content = m2.content AND m1.id < m2.id
    AND ABS(m1.timestamp - m2.timestamp) < ?
  ORDER BY m1.timestamp DESC
  LIMIT ?
`);
const stmtGetUnsyncedEdits = db.prepare("SELECT * FROM messages WHERE sync_status = 'edited' ORDER BY edited_at ASC LIMIT ?");
const stmtMarkSynced = db.prepare("UPDATE messages SET sync_status = 'synced' WHERE id = ?");
const stmtPurgeTest = db.prepare(`DELETE FROM messages WHERE content LIKE '%[TEST]%' OR content LIKE '%[DEBUG]%' OR content LIKE '%test message%' OR content LIKE '%testing 1%2%3%'`);

// Edit a message in the DB (and mark for sync)
function editMessage(id, newContent) {
  const existing = stmtGetMsg.get(id);
  if (!existing) return { error: `Message #${id} not found` };
  stmtEditMsg.run(newContent, Date.now(), 'edited', id);
  addLog('chat', `Edited message #${id} (${existing.source})`);
  // Refresh in-memory context
  loadHistoryFromDb();
  return { success: true, id, oldContent: existing.content.substring(0, 100), newContent: newContent.substring(0, 100), source: existing.source };
}

// Delete a message — DISABLED: messages are immutable. Use archive instead.
function deleteMessage(id) {
  return { error: 'Message deletion is disabled. Messages are immutable for data integrity. Use /api/chat/archive to hide messages instead.' };
}

function deleteMessageRange(startId, endId) {
  return { error: 'Message deletion is disabled. Messages are immutable for data integrity. Use /api/chat/archive to hide messages instead.' };
}

// ═══════════════════════════════════════════════════════════════
// Context Labelling — Task/Workspace/Project tagging
// ═══════════════════════════════════════════════════════════════

// Archive a message (soft-delete: hidden from normal views but preserved)
function archiveMessage(id) {
  const existing = stmtGetMsg.get(id);
  if (!existing) return { error: `Message #${id} not found` };
  stmtArchiveMsg.run(id);
  addLog('chat', `Archived message #${id}`);
  return { success: true, id, archived: true };
}

function archiveMessageRange(startId, endId) {
  const msgs = stmtGetRange.all(startId, endId);
  if (msgs.length === 0) return { error: `No messages in range ${startId}-${endId}` };
  stmtArchiveRange.run(startId, endId);
  addLog('chat', `Archived ${msgs.length} messages (IDs ${startId}-${endId})`);
  return { success: true, archivedCount: msgs.length, range: `${startId}-${endId}` };
}

function unarchiveMessage(id) {
  stmtUnarchiveMsg.run(id);
  return { success: true, id, archived: false };
}

// Label a message with task/workspace/project context
function labelMessage(id, { taskId, workspaceId, projectId, labels }) {
  const existing = stmtGetMsg.get(id);
  if (!existing) return { error: `Message #${id} not found` };
  if (taskId !== undefined) stmtSetTaskId.run(taskId, id);
  if (workspaceId !== undefined) stmtSetWorkspaceId.run(workspaceId, id);
  if (projectId !== undefined) stmtSetProjectId.run(projectId, id);
  if (labels !== undefined) stmtSetLabels.run(typeof labels === 'string' ? labels : JSON.stringify(labels), id);
  addLog('chat', `Labelled message #${id}: task=${taskId || '-'} workspace=${workspaceId || '-'} project=${projectId || '-'}`);
  return { success: true, id, taskId, workspaceId, projectId, labels };
}

// Label a range of messages (bulk tagging)
function labelMessageRange(startId, endId, context) {
  const msgs = stmtGetRange.all(startId, endId);
  if (msgs.length === 0) return { error: `No messages in range ${startId}-${endId}` };
  for (const msg of msgs) labelMessage(msg.id, context);
  return { success: true, labelledCount: msgs.length, range: `${startId}-${endId}`, context };
}

// Get messages by context (task, workspace, project, or labels)
function getMessagesByContext({ taskId, workspaceId, projectId, label, includeArchived, limit }) {
  const maxLimit = Math.min(limit || 200, 1000);
  let sql = 'SELECT * FROM messages WHERE 1=1';
  const params = [];
  if (!includeArchived) { sql += ' AND (archived IS NULL OR archived = 0)'; }
  if (taskId) { sql += ' AND task_id = ?'; params.push(taskId); }
  if (workspaceId) { sql += ' AND workspace_id = ?'; params.push(workspaceId); }
  if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
  if (label) { sql += ' AND labels LIKE ?'; params.push(`%${label}%`); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(maxLimit);
  const msgs = db.prepare(sql).all(...params);
  return { messages: msgs.reverse(), count: msgs.length, context: { taskId, workspaceId, projectId, label } };
}

// List all known tasks/workspaces/projects
function listContexts() {
  const tasks = db.prepare('SELECT DISTINCT task_id as id, COUNT(*) as count FROM messages WHERE task_id IS NOT NULL GROUP BY task_id ORDER BY MAX(timestamp) DESC').all();
  const workspaces = db.prepare('SELECT DISTINCT workspace_id as id, COUNT(*) as count FROM messages WHERE workspace_id IS NOT NULL GROUP BY workspace_id ORDER BY MAX(timestamp) DESC').all();
  const projects = db.prepare('SELECT DISTINCT project_id as id, COUNT(*) as count FROM messages WHERE project_id IS NOT NULL GROUP BY project_id ORDER BY MAX(timestamp) DESC').all();
  return { tasks, workspaces, projects };
}

// Merge multiple messages into one (keeps the earliest, deletes the rest)
function mergeMessages(ids, mergedContent) {
  if (!ids || ids.length < 2) return { error: 'Need at least 2 message IDs to merge' };
  const msgs = ids.map(id => stmtGetMsg.get(id)).filter(Boolean);
  if (msgs.length < 2) return { error: 'Not enough valid messages found' };

  // Sort by ID (chronological)
  msgs.sort((a, b) => a.id - b.id);
  const keepMsg = msgs[0];
  const removeIds = msgs.slice(1).map(m => m.id);

  // If no custom merged content provided, concatenate all messages
  const finalContent = mergedContent || msgs.map(m => m.content).join('\n\n---\n\n');

  // Update the kept message with merged content
  db.prepare('UPDATE messages SET content = ?, edited_at = ?, sync_status = ?, merged_from = ? WHERE id = ?')
    .run(finalContent, Date.now(), 'edited', JSON.stringify(ids), keepMsg.id);

  // Delete the others
  for (const rid of removeIds) {
    stmtDeleteMsg.run(rid);
  }

  addLog('chat', `Merged ${msgs.length} messages → #${keepMsg.id} (removed: ${removeIds.join(', ')})`);
  loadHistoryFromDb();
  return {
    success: true,
    keptId: keepMsg.id,
    removedIds: removeIds,
    mergedCount: msgs.length,
    contentPreview: finalContent.substring(0, 200),
  };
}

// Find and remove duplicate messages (same content within a time window)
function dedupMessages(windowMs = 60000, dryRun = true) {
  const dupes = stmtFindDupes.all(windowMs, 100);
  if (dupes.length === 0) return { duplicates: 0, message: 'No duplicates found' };

  const toDelete = [];
  for (const d of dupes) {
    // Keep the one with more info (longer source or earlier timestamp)
    toDelete.push(d.id2); // Keep id1, remove id2
  }

  if (dryRun) {
    return {
      duplicates: dupes.length,
      wouldDelete: toDelete.length,
      preview: dupes.slice(0, 5).map(d => ({
        keep: d.id1,
        remove: d.id2,
        content: d.content.substring(0, 80),
        sources: `${d.source1} vs ${d.source2}`,
      })),
      message: 'Dry run — use dryRun=false to actually delete',
    };
  }

  // Actually delete duplicates
  const delStmt = db.prepare('DELETE FROM messages WHERE id = ?');
  let deleted = 0;
  for (const id of [...new Set(toDelete)]) {
    delStmt.run(id);
    deleted++;
  }
  addLog('chat', `Dedup: removed ${deleted} duplicate messages`);
  loadHistoryFromDb();
  return { duplicates: dupes.length, deleted, message: `Removed ${deleted} duplicate messages` };
}

// Purge test/debug messages
function purgeTestMessages() {
  const before = stmtCount.get().count;
  stmtPurgeTest.run();
  const after = stmtCount.get().count;
  const removed = before - after;
  addLog('chat', `Purged ${removed} test/debug messages`);
  loadHistoryFromDb();
  return { success: true, removed, remaining: after };
}

// Get messages pending sync (edited but not yet pushed to Telegram)
function getUnsyncedEdits(limit = 50) {
  return stmtGetUnsyncedEdits.all(limit);
}

// Mark a message as synced after pushing to Telegram
function markMessageSynced(id) {
  stmtMarkSynced.run(id);
  return { success: true, id };
}

// Get chat statistics by source
function getChatStats() {
  const total = stmtCount.get().count;
  const bySource = db.prepare('SELECT source, COUNT(*) as count FROM messages GROUP BY source ORDER BY count DESC').all();
  const byRole = db.prepare('SELECT role, COUNT(*) as count FROM messages GROUP BY role ORDER BY count DESC').all();
  const editedCount = db.prepare("SELECT COUNT(*) as count FROM messages WHERE sync_status = 'edited'").all();
  const oldest = db.prepare('SELECT MIN(timestamp) as ts FROM messages').get();
  const newest = db.prepare('SELECT MAX(timestamp) as ts FROM messages').get();
  return {
    total,
    bySource,
    byRole,
    pendingSync: editedCount[0]?.count || 0,
    oldestMessage: oldest?.ts ? new Date(oldest.ts).toISOString() : null,
    newestMessage: newest?.ts ? new Date(newest.ts).toISOString() : null,
    contextSize: chatHistory.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// Natural Language Intent Detection
// ═══════════════════════════════════════════════════════════════
function detectIntent(text) {
  const t = text.toLowerCase().trim();
  
  const startPatterns = [
    /start\s*(the)?\s*(coder|coding|bot|agent|agentic)/,
    /begin\s*(the)?\s*(coder|coding|bot|agent)/,
    /launch\s*(the)?\s*(coder|coding|bot|agent)/,
    /turn\s*on\s*(the)?\s*(coder|coding|bot|agent)/,
    /enable\s*(the)?\s*(coder|coding|bot|agent)/,
    /fire\s*up\s*(the)?\s*(coder|coding|bot|agent)/,
    /activate\s*(the)?\s*(coder|coding|bot|agent)/,
    /run\s*(the)?\s*(coder|coding|bot|agent)/,
    /spin\s*up\s*(the)?\s*(coder|coding|bot|agent)/,
    /kick\s*off\s*(the)?\s*(coder|coding|bot|agent)/,
    /^start$/,
    /let'?s\s*(start|go|code|begin)/,
    /can you\s*(start|launch|begin|run)\s*(the)?\s*(coder|coding|bot)?/,
    /get\s*(the)?\s*(coder|bot|agent)\s*(going|running|started)/,
  ];
  if (startPatterns.some(p => p.test(t))) return 'start_coder';

  const stopPatterns = [
    /stop\s*(the)?\s*(coder|coding|bot|agent|agentic)/,
    /end\s*(the)?\s*(coder|coding|bot|agent)/,
    /halt\s*(the)?\s*(coder|coding|bot|agent)/,
    /turn\s*off\s*(the)?\s*(coder|coding|bot|agent)/,
    /disable\s*(the)?\s*(coder|coding|bot|agent)/,
    /kill\s*(the)?\s*(coder|coding|bot|agent)/,
    /shut\s*(the)?\s*(coder|coding|bot|agent)\s*down/,
    /shutdown\s*(the)?\s*(coder|coding|bot|agent)/,
    /deactivate\s*(the)?\s*(coder|coding|bot|agent)/,
    /pause\s*(the)?\s*(coder|coding|bot|agent)/,
    /can you\s*(stop|kill|end|halt|pause)\s*(the)?\s*(coder|coding|bot)?/,
    /^stop$/,
  ];
  if (stopPatterns.some(p => p.test(t))) return 'stop_coder';

  const restartMatch = t.match(/restart\s*(the)?\s*(ollama|antigravity|server|claw)/i);
  if (restartMatch) return 'restart_' + restartMatch[2].toLowerCase();

  const statusPatterns = [
    /what'?s\s*(the)?\s*status/,
    /how'?s\s*(the)?\s*(server|vps|system)/,
    /system\s*(status|health|info)/,
    /server\s*(status|health|info)/,
    /check\s*(the)?\s*(status|health|system|server)/,
    /how\s*are\s*(things|we)\s*(looking|doing)/,
    /give\s*me\s*(a)?\s*status/,
  ];
  if (statusPatterns.some(p => p.test(t))) return 'status';

  const searchPatterns = [
    /search\s*(for)?\s*(.+)/,
    /look\s*up\s*(.+)/,
    /what\s*do\s*you\s*know\s*about\s*(.+)/,
  ];
  for (const p of searchPatterns) {
    const match = t.match(p);
    if (match) return { intent: 'search', query: match[match.length - 1] };
  }

  // Workspace intents
  const openMatch = t.match(/(?:open|switch|cd|go to|load|use)\s+(?:workspace\s+|project\s+)?(.+)/i);
  if (openMatch) return { intent: 'open_workspace', name: openMatch[1].trim() };

  const listFilesMatch = t.match(/(?:list|show|what)\s*(?:files|tree|structure|ls)/i);
  if (listFilesMatch) return { intent: 'list_files' };

  const workspacesMatch = t.match(/(?:list|show|my)\s*(?:workspaces|projects)/i);
  if (workspacesMatch) return { intent: 'list_workspaces' };

  // Plan/Execute intents
  const planMatch = t.match(/(?:plan|create a plan|make a plan|plan for|plan to)\s+(.+)/i);
  if (planMatch) return { intent: 'plan', task: planMatch[1] };
  if (/^(go|execute|do it|run it|start plan|begin|proceed)$/i.test(t)) return { intent: 'plan_go' };
  if (/^(next|continue|next step|keep going)$/i.test(t)) return { intent: 'plan_next' };
  if (/^(skip)$/i.test(t)) return { intent: 'plan_skip' };
  if (/^(abort|cancel|cancel plan|stop plan)$/i.test(t)) return { intent: 'plan_abort' };
  if (/^(plan status|show plan|current plan)$/i.test(t)) return { intent: 'plan_status' };

  // Git intents
  if (/(?:git\s*)?commit/i.test(t)) return { intent: 'git_commit', msg: t.replace(/.*commit\s*/i, '') };

  // Model switching
  const modelMatch = t.match(/(?:use model|switch model|set model|model)\s+(.+)/i);
  if (modelMatch) return { intent: 'set_model', model: modelMatch[1].trim().toLowerCase() };
  if (/(?:list models|models|available models|what models)/i.test(t)) return { intent: 'list_models' };
  if (/(?:current model|which model|active model)/i.test(t)) return { intent: 'current_model' };

  // Mode switching
  const modeMatch = t.match(/(?:switch to|set|use|go to|enter)\s+(\w+)\s*mode/i);
  if (modeMatch) return { intent: 'set_mode', mode: modeMatch[1].trim().toLowerCase() };
  if (/^(chat mode|coder mode|architect mode|visual mode)$/i.test(t)) return { intent: 'set_mode', mode: t.replace(/\s*mode\s*$/i, '').trim().toLowerCase() };
  if (/(?:list modes|modes|available modes|what modes|current mode|which mode)/i.test(t)) return { intent: 'list_modes' };

  // File operations (coder mode)
  const readMatch = t.match(/(?:read|show|cat|view|open)\s+(?:file\s+)?(.+\.\w+)/i);
  if (readMatch) return { intent: 'read_file', file: readMatch[1].trim() };

  // Verify/Test intents
  if (/^(verify|check|lint|test|run tests|validate)$/i.test(t)) return { intent: 'verify' };

  // Message management
  if (/^(cancel|stop it|abort|nevermind|nvm)$/i.test(t)) return { intent: 'cancel' };
  if (/^(retry|again|redo|try again|resend)$/i.test(t)) return { intent: 'retry' };
  if (/^(undo|revert|rollback|go back)$/i.test(t)) return { intent: 'undo' };
  const revertMatch = t.match(/revert\s*(?:to)?\s*([a-f0-9]{6,40})/i);
  if (revertMatch) return { intent: 'revert_to', hash: revertMatch[1] };
  if (/^(history|git log|commits|show commits)$/i.test(t)) return { intent: 'git_log' };

  // Screenshot
  if (/(?:screenshot|screen ?shot|show me|what does it look like|send a screenshot|capture screen|desktop)/i.test(t)) return { intent: 'screenshot' };

  // Health check
  if (/(?:health|system status|how is the server|server status|machine stats|performance)/i.test(t)) return { intent: 'health_check' };

  // Confirmation mode
  if (/(?:confirm mode|confirmation|ask before|safe mode)/i.test(t)) return { intent: 'toggle_confirm' };
  if (/^(approve|yes|go ahead|do it|confirm|proceed|ok)$/i.test(t)) return { intent: 'approve' };
  if (/^(reject|no|don't|deny|refuse|nope)$/i.test(t)) return { intent: 'reject' };

  // Browse intents
  const browseMatch = t.match(/(?:browse|fetch|read|visit|open url|curl)\s+(https?:\/\/\S+)/i);
  if (browseMatch) return { intent: 'browse', url: browseMatch[1] };
  const searchWebMatch = t.match(/(?:google|search web|web search|search online)\s+(.+)/i);
  if (searchWebMatch) return { intent: 'web_search', query: searchWebMatch[1] };

  // Test generation
  const testGenMatch = t.match(/(?:generate tests?|write tests?|create tests?)\s*(?:for)?\s+(.+)/i);
  if (testGenMatch) return { intent: 'gen_tests', file: testGenMatch[1].trim() };

  // Repo map
  if (/(?:repo map|map|codebase|overview|structure|analyze project)/i.test(t)) return { intent: 'repo_map' };

  // Log cleanup and merging
  if (/(?:clean up|cleanup|merge\s+(?:logs|chat|messages)|compress\s+(?:logs|history|chat)|remove testing logs)/i.test(t)) return { intent: 'compress_history' };

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Workspace Manager
// ═══════════════════════════════════════════════════════════════
async function findWorkspace(name) {
  // First check DB
  const existing = db.prepare('SELECT * FROM workspaces WHERE name LIKE ? OR path LIKE ?').get('%'+name+'%', '%'+name+'%');
  if (existing) return existing.path;

  // Search filesystem
  const result = await new Promise(r => exec(
    `find /root /opt /home -maxdepth 3 -type d -iname '*${name.replace(/[^a-zA-Z0-9]/g, '')}*' 2>/dev/null | head -5`,
    { timeout: 5000 }, (e, o) => r((o || '').trim())
  ));
  const paths = result.split('\n').filter(p => p && !p.includes('node_modules') && !p.includes('.git'));
  if (paths.length > 0) {
    // Register the first match
    try {
      db.prepare('INSERT OR IGNORE INTO workspaces (name, path, last_accessed) VALUES (?, ?, ?)').run(name, paths[0], Date.now());
    } catch {}
    return paths[0];
  }
  return null;
}

async function listWorkspaceFiles(path, depth = 2) {
  const tree = await new Promise(r => exec(
    `find '${path}' -maxdepth ${depth} -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/__pycache__/*' 2>/dev/null | head -40`,
    { timeout: 5000 }, (e, o) => r((o || '').trim())
  ));
  return tree;
}

// ═══════════════════════════════════════════════════════════════
// 1. PLAN → EXECUTE ENGINE (like Devin/Cline)
// ═══════════════════════════════════════════════════════════════
let activePlan = null; // { steps: [], currentStep: 0, status: 'planning'|'executing'|'paused'|'done' }

async function generatePlan(task) {
  addLog('plan', 'Generating plan for: ' + task.substring(0, 60));
  const prompt = `You are a planning agent. Given this task, create a numbered step-by-step implementation plan.
Each step must be ONE concrete action (create file, edit file, run command, etc).
Format EXACTLY as:
1. [ACTION] Description
2. [ACTION] Description

ACTION must be one of: CREATE_FILE, EDIT_FILE, RUN_CMD, INSTALL, TEST, GIT_COMMIT

Task: ${task}
Active workspace: ${activeWorkspace || '/root'}

Provide 3-10 steps. Be specific with file paths and commands.`;

  const result = await chatOllamaRaw(prompt);
  const steps = result.split('\n')
    .filter(l => /^\d+\.\s*\[/.test(l.trim()))
    .map(l => {
      const match = l.match(/^\d+\.\s*\[(\w+)\]\s*(.+)/);
      return match ? { action: match[1], description: match[2], status: 'pending' } : null;
    })
    .filter(Boolean);

  if (steps.length === 0) {
    return { error: 'Could not generate a plan. Try rephrasing.', raw: result };
  }

  activePlan = { task, steps, currentStep: 0, status: 'planned', createdAt: Date.now() };
  addLog('plan', `Plan created: ${steps.length} steps`);
  return activePlan;
}

async function executeNextStep() {
  if (!activePlan || activePlan.status === 'done') return { error: 'No active plan' };
  if (activePlan.currentStep >= activePlan.steps.length) {
    activePlan.status = 'done';
    return { done: true, message: '✅ All steps completed!' };
  }

  const step = activePlan.steps[activePlan.currentStep];
  step.status = 'running';
  activePlan.status = 'executing';
  addLog('plan', `Executing step ${activePlan.currentStep + 1}: ${step.description.substring(0, 60)}`);

  try {
    let result;
    const ws = activeWorkspace || '/root';

    if (step.action === 'RUN_CMD' || step.action === 'INSTALL') {
      // Extract command from description using AI
      const cmd = await chatOllamaRaw(`Extract ONLY the shell command from this step. Return JUST the command, nothing else:\n${step.description}\nWorkspace: ${ws}`);
      const cleanCmd = cmd.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').split('\n')[0];
      result = await runCmd(cleanCmd, ws);
      step.output = result;
    } else if (step.action === 'CREATE_FILE' || step.action === 'EDIT_FILE') {
      // Generate file content using AI
      const code = await chatOllamaRaw(`Generate the complete file content for this step. Return ONLY the code, no explanations:\n${step.description}\nWorkspace: ${ws}\nTask context: ${activePlan.task}`);
      step.output = 'Code generated (' + code.length + ' chars)';
      // Parse filename from description
      const fileMatch = step.description.match(/[`']?([/\w.-]+\.\w+)[`']?/);
      if (fileMatch) {
        const filePath = fileMatch[1].startsWith('/') ? fileMatch[1] : ws + '/' + fileMatch[1];
        const cleanCode = code.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
        await runCmd(`mkdir -p $(dirname '${filePath}') && cat > '${filePath}' << 'CLAW_EOF'\n${cleanCode}\nCLAW_EOF`, ws);
        result = `Created ${filePath}`;
        // Auto git commit
        await gitAutoCommit(ws, `[Claw] ${step.description.substring(0, 50)}`);
      } else {
        result = 'Generated code but could not determine file path';
      }
    } else if (step.action === 'TEST') {
      result = await runVerification(ws);
    } else if (step.action === 'GIT_COMMIT') {
      result = await gitAutoCommit(ws, step.description);
    } else {
      result = 'Unknown action: ' + step.action;
    }

    step.status = 'done';
    step.result = result;
    activePlan.currentStep++;

    if (activePlan.currentStep >= activePlan.steps.length) {
      activePlan.status = 'done';
    } else {
      activePlan.status = 'paused'; // Wait for user approval for next step
    }

    return { step: activePlan.currentStep, total: activePlan.steps.length, result, done: activePlan.status === 'done' };
  } catch (e) {
    step.status = 'failed';
    step.error = e.message;
    activePlan.status = 'paused';
    return { error: e.message, step: activePlan.currentStep + 1 };
  }
}

function formatPlan() {
  if (!activePlan) return 'No active plan.';
  const lines = activePlan.steps.map((s, i) => {
    const icon = s.status === 'done' ? '✅' : s.status === 'running' ? '⏳' : s.status === 'failed' ? '❌' : i === activePlan.currentStep ? '👉' : '⬜';
    return `${icon} ${i + 1}. [${s.action}] ${s.description}`;
  });
  return `📋 *Plan: ${activePlan.task}*\n\n${lines.join('\n')}\n\n_${activePlan.status === 'done' ? '✅ Complete!' : activePlan.status === 'planned' ? 'Reply "go" to start' : 'Reply "next" for next step, "skip" to skip, "abort" to cancel'}_`;
}

// ═══════════════════════════════════════════════════════════════
// 2. GIT AUTO-COMMIT (like Aider)
// ═══════════════════════════════════════════════════════════════
async function gitAutoCommit(wsPath, message) {
  const ws = wsPath || activeWorkspace || '/root';
  // Check if git repo
  const isGit = await runCmd(`cd '${ws}' && git rev-parse --git-dir 2>/dev/null && echo YES || echo NO`);
  if (!isGit.includes('YES')) {
    // Init repo
    await runCmd(`cd '${ws}' && git init && git add -A && git commit -m "Initial commit by The Claw"`, ws);
    addLog('git', 'Initialized git repo at ' + ws);
    return 'Git repo initialized + initial commit';
  }

  // Stage and commit
  const diff = await runCmd(`cd '${ws}' && git diff --stat HEAD 2>/dev/null`);
  if (!diff || diff.trim() === '') {
    const untracked = await runCmd(`cd '${ws}' && git ls-files --others --exclude-standard | head -5`);
    if (!untracked.trim()) return 'No changes to commit';
  }

  const commitMsg = message || `[Claw] Auto-commit at ${new Date().toISOString()}`;
  await runCmd(`cd '${ws}' && git add -A && git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, ws);
  addLog('git', `Committed: ${commitMsg}`);
  return `✅ Committed: ${commitMsg}`;
}

// ═══════════════════════════════════════════════════════════════
// 3. SELF-VERIFICATION (like Devin 2.2)
// ═══════════════════════════════════════════════════════════════
async function runVerification(wsPath) {
  const ws = wsPath || activeWorkspace || '/root';
  const results = [];
  addLog('verify', 'Running verification on ' + ws);

  // Detect project type
  const hasPackageJson = await runCmd(`test -f '${ws}/package.json' && echo yes || echo no`);
  const hasPyproject = await runCmd(`test -f '${ws}/pyproject.toml' && echo yes || echo no`);
  const hasRequirements = await runCmd(`test -f '${ws}/requirements.txt' && echo yes || echo no`);
  const hasMakefile = await runCmd(`test -f '${ws}/Makefile' && echo yes || echo no`);

  // JavaScript/TypeScript
  if (hasPackageJson.includes('yes')) {
    // Lint
    const lint = await runCmd(`cd '${ws}' && npx eslint . --max-warnings 10 2>&1 | tail -20`, ws);
    results.push({ check: 'ESLint', output: lint || '✅ No issues', passed: !lint.includes('error') });

    // Type check
    const hasTsConfig = await runCmd(`test -f '${ws}/tsconfig.json' && echo yes || echo no`);
    if (hasTsConfig.includes('yes')) {
      const tsc = await runCmd(`cd '${ws}' && npx tsc --noEmit 2>&1 | tail -20`, ws);
      results.push({ check: 'TypeScript', output: tsc || '✅ No type errors', passed: !tsc.includes('error') });
    }

    // Tests
    const pkgJson = await runCmd(`cat '${ws}/package.json'`);
    if (pkgJson.includes('"test"')) {
      const test = await runCmd(`cd '${ws}' && npm test 2>&1 | tail -30`, ws);
      results.push({ check: 'Tests', output: test, passed: !test.includes('FAIL') && !test.includes('Error') });
    }
  }

  // Python
  if (hasPyproject.includes('yes') || hasRequirements.includes('yes')) {
    // Syntax check
    const pyCheck = await runCmd(`cd '${ws}' && python3 -m py_compile $(find . -name '*.py' -maxdepth 3 | head -10 | tr '\\n' ' ') 2>&1`, ws);
    results.push({ check: 'Python Syntax', output: pyCheck || '✅ No syntax errors', passed: !pyCheck.includes('Error') });

    // Pytest
    const hasPytest = await runCmd(`cd '${ws}' && python3 -m pytest --co -q 2>/dev/null | head -5`);
    if (hasPytest && !hasPytest.includes('no tests')) {
      const pytest = await runCmd(`cd '${ws}' && python3 -m pytest -x --tb=short 2>&1 | tail -20`, ws);
      results.push({ check: 'Pytest', output: pytest, passed: pytest.includes('passed') && !pytest.includes('failed') });
    }
  }

  // If no specific checks, do a basic file syntax scan
  if (results.length === 0) {
    const shellCheck = await runCmd(`cd '${ws}' && for f in $(find . -name '*.sh' -maxdepth 2 | head -5); do bash -n "$f" 2>&1; done`);
    results.push({ check: 'Shell syntax', output: shellCheck || '✅ OK', passed: true });
  }

  const allPassed = results.every(r => r.passed);
  addLog('verify', `Verification ${allPassed ? 'PASSED' : 'FAILED'}: ${results.map(r => r.check + ':' + (r.passed ? '✅' : '❌')).join(', ')}`);

  return {
    passed: allPassed,
    results,
    summary: results.map(r => `${r.passed ? '✅' : '❌'} ${r.check}: ${(r.output || '').substring(0, 100)}`).join('\n')
  };
}

// ═══════════════════════════════════════════════════════════════
// 4. LOG SYNTHESIS & MERGING ENGINE
// ═══════════════════════════════════════════════════════════════
async function compressHistory(chatId) {
  if (chatId) await sendTelegram(chatId, '🧹 _Analyzing recent logs for compression..._').catch(()=>{});
  
  try {
    // Grab the last 50 messages to look for testing/vps/system spam
    const msgs = db.prepare('SELECT id, source, role, content, timestamp, model FROM messages ORDER BY id DESC LIMIT 50').all();
    msgs.reverse();
    
    // We only want to compress high-volume non-conversational noise:
    // vps_log sources, bash outputs, system notifications, or deep verification logs
    const garbageIds = [];
    const logStrings = [];
    let oldestGarbageMsg = null;
    
    for (const m of msgs) {
      if (
        m.source.startsWith('vps-') || 
        m.role === 'system' || 
        m.model === 'bash' || 
        m.content.includes('Running verification on') ||
        m.content.includes('Executing step') ||
        (m.role === 'assistant' && (m.content.includes('✅') || m.content.includes('❌') || m.content.includes('npm test')))
      ) {
        // Skip adding our own synthesis logs to the garbage collector
        if (!m.content.includes('📋 **Merged System Logs:**') && !m.content.includes('🧠 **Automated Log Synthesis:**')) {
           garbageIds.push(m.id);
           logStrings.push(`[${m.role.toUpperCase()}] ${m.content.replace(/\n/g, ' ')}`);
           
           // We're iterating oldest first because we ran msgs.reverse(), 
           // so the first one we find is the oldest structurally in the timeline
           if (!oldestGarbageMsg) oldestGarbageMsg = m;
        }
      }
    }
    
    if (garbageIds.length < 4 || !oldestGarbageMsg) {
      if(chatId) await sendTelegram(chatId, '🤷 Not enough testing or system logs to warrant a compression merge.');
      return;
    }
    
    // We send a temporary loading message to telegram but don't save it to DB
    let tgMsgId = null;
    if(chatId) {
      try {
        const loading = await sendTelegram(chatId, `🧩 _Merging ${garbageIds.length} technical log rows into a single lossless timeline..._`);
        if (loading && loading.ok) tgMsgId = loading.result.message_id;
      } catch (e) {}
    }

    const prompt = `You are a Log Consolidation Engine using Lossless Extraction principles. The following are raw terminal, system, and VPS agent logs from a user's recent automated testing process.
    
Your task is to cleanly MERGE all these logs into a single consecutive Timeline block.
CRITICAL RULES for Lossless Merging:
1. Do NOT summarize away exact numbers, coordinate pairs, file names, or test result counts.
2. Remove standard conversational robotic filler (e.g. "Executing step X") but KEEP the actual commands run and the exact output. 
3. De-duplicate identical operations or overlapping system outputs.
4. Format as a clean, structured Markdown bulleted timeline.
5. You MUST NOT invent, hallucinate, or rewrite the technical data. It must be a 1:1 reflection of the raw data just structurally merged to remove spam.

RAW LOGS:
${logStrings.join('\n')}`;

    // Prefer active model for summary extraction
    const summaryResult = await chatOllama(prompt);
    
    // Remove reasoning tags if any
    let summary = typeof summaryResult === 'string' ? summaryResult : (summaryResult?.text || '');
    summary = summary.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    
    // Remove [ACTION] tags from the output to keep it clean
    summary = summary.replace(/\[ACTION:[^\]]+\]/g, '').trim();
    
    const finalText = `📋 **Merged System Logs:**\n\n${summary}`;
    
    // 1. Remove the oldest item from the deletion list because we will edit it in place
    const editId = oldestGarbageMsg.id;
    const deleteIds = garbageIds.filter(id => id !== editId);
    
    // 2. Delete the remaining noisy rows
    if (deleteIds.length > 0) {
      const marks = deleteIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM messages WHERE id IN (${marks})`).run(...deleteIds);
      try { db.prepare(`DELETE FROM messages_fts WHERE rowid IN (${marks})`).run(...deleteIds); } catch(e){}
    }
    
    // 3. Edit the oldest message in-place to preserve timeline integrity
    db.prepare('UPDATE messages SET source=?, role=?, content=?, model=? WHERE id=?').run(
      'gui-out', 'assistant', finalText, activeModel, editId
    );
    try {
      db.prepare(`UPDATE messages_fts SET content=?, source=?, role=? WHERE rowid=?`).run(
        finalText, 'gui-out', 'assistant', editId
      );
    } catch(e){}
    
    loadHistoryFromDb();
    
    // 4. Update telegram
    if (chatId) {
      try {
        if (tgMsgId) {
          await tgApi('editMessageText', {
            chat_id: chatId,
            message_id: tgMsgId,
            parse_mode: 'HTML',
            text: mdToHtml(finalText)
          });
        } else {
           await sendTelegram(chatId, finalText);
        }
      } catch (e) {}
    }
    
  } catch (e) {
    if (chatId) await sendTelegram(chatId, '❌ Compression failed: ' + e.message).catch(()=>{});
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. WEB BROWSING (like Devin/Cline)
// ═══════════════════════════════════════════════════════════════
function browseWeb(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    addLog('web', 'Fetching: ' + url);
    const req = protocol.get(url, { timeout: 10000, headers: { 'User-Agent': 'TheClaw/1.0' } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return browseWeb(res.headers.location).then(resolve);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Strip HTML to text
        const text = data
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 6000);
        addLog('web', `Fetched ${url}: ${text.length} chars`);
        resolve(text);
      });
    });
    req.on('error', e => resolve('Error fetching: ' + e.message));
    req.on('timeout', () => { req.destroy(); resolve('Timeout fetching: ' + url); });
  });
}

async function webSearch(query) {
  // Use DuckDuckGo HTML search (no API key needed)
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await browseWeb(url);
  addLog('web', 'Search results for: ' + query);
  return html.substring(0, 3000);
}

// ═══════════════════════════════════════════════════════════════
// 5. TEST GENERATION (like Devin/Aider)
// ═══════════════════════════════════════════════════════════════
async function generateTests(filePath) {
  const ws = activeWorkspace || '/root';
  const fullPath = filePath.startsWith('/') ? filePath : ws + '/' + filePath;
  addLog('test', 'Generating tests for: ' + fullPath);

  const content = await runCmd(`cat '${fullPath}' 2>/dev/null | head -200`);
  if (!content || content.includes('No such file')) {
    return 'File not found: ' + fullPath;
  }

  const ext = fullPath.split('.').pop();
  let framework, testPath;

  if (['js', 'ts', 'tsx', 'jsx'].includes(ext)) {
    framework = 'jest';
    testPath = fullPath.replace(/\.([jt]sx?)$/, '.test.$1');
  } else if (ext === 'py') {
    framework = 'pytest';
    testPath = fullPath.replace(/\.py$/, '_test.py').replace(/\/([^/]+)$/, '/test_$1');
  } else {
    return 'Unsupported file type: ' + ext;
  }

  const prompt = `Generate comprehensive ${framework} tests for this code. Include edge cases. Return ONLY the test code:\n\n\`\`\`${ext}\n${content}\n\`\`\``;

  const testCode = await chatOllamaRaw(prompt);
  const cleanCode = testCode.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');

  await runCmd(`mkdir -p $(dirname '${testPath}') && cat > '${testPath}' << 'CLAW_EOF'\n${cleanCode}\nCLAW_EOF`);
  await gitAutoCommit(ws, `[Claw] Generate tests for ${filePath}`);
  addLog('test', `Tests written to: ${testPath}`);

  return `✅ Tests generated: ${testPath}\n\nCode:\n\`\`\`\n${cleanCode.substring(0, 1000)}${cleanCode.length > 1000 ? '\n...' : ''}\n\`\`\``;
}

// ═══════════════════════════════════════════════════════════════
// 6. REPO MAP (like Aider)
// ═══════════════════════════════════════════════════════════════
async function buildRepoMap(wsPath) {
  const ws = wsPath || activeWorkspace || '/root';
  addLog('repomap', 'Building repo map for: ' + ws);

  // File tree
  const tree = await runCmd(`cd '${ws}' && find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/__pycache__/*' -not -path '*/dist/*' -not -path '*/build/*' -not -name '*.lock' -not -name '*.map' | sort | head -80`);

  // File type stats
  const stats = await runCmd(`cd '${ws}' && find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -15`);

  // LOC count
  const loc = await runCmd(`cd '${ws}' && find . -name '*.py' -o -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.rs' -o -name '*.go' | grep -v node_modules | grep -v .git | head -50 | xargs wc -l 2>/dev/null | tail -1`);

  // Key files
  const keyFiles = await runCmd(`cd '${ws}' && ls -la package.json pyproject.toml Cargo.toml Makefile Dockerfile docker-compose.yml README.md tsconfig.json 2>/dev/null`);

  // Git info
  const gitInfo = await runCmd(`cd '${ws}' && git log --oneline -5 2>/dev/null`);
  const gitBranch = await runCmd(`cd '${ws}' && git branch --show-current 2>/dev/null`);

  // Function/class index for key files
  const symbols = await runCmd(`cd '${ws}' && grep -rn 'function \\|class \\|def \\|const \\|export ' --include='*.py' --include='*.js' --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v node_modules | grep -v test | head -40`);

  const map = `📊 *REPO MAP: ${ws}*

📁 *File Tree:*
\`\`\`
${tree}
\`\`\`

📈 *File Types:*
\`\`\`
${stats}
\`\`\`

📏 *Lines of Code:* ${loc}
🌿 *Git Branch:* ${gitBranch || 'N/A'}

📋 *Recent Commits:*
${gitInfo || 'No git history'}

🔑 *Key Files:*
\`\`\`
${keyFiles || 'None detected'}
\`\`\`

🗺️ *Symbols (functions/classes):*
\`\`\`
${symbols || 'None found'}
\`\`\``;

  addLog('repomap', `Map built: ${tree.split('\n').length} files`);
  return map;
}

// Helper: run command and get output
function runCmd(cmd, cwd) {
  return new Promise(r => exec(cmd, {
    timeout: 15000, shell: '/bin/bash', maxBuffer: 2 * 1024 * 1024,
    cwd: cwd || undefined,
  }, (e, o, se) => r(((o || '') + (se || '')).trim())));
}

// Helper: raw Ollama chat (no history, for internal use)
function chatOllamaRaw(prompt) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'llama3',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });
    const req = http.request({
      hostname: '127.0.0.1', port: OLLAMA_PORT, path: '/api/chat',
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.message?.content || parsed.response || '');
        } catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.write(payload);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// Multi-Provider AI Chat (Ollama → DeepSeek fallback)
// ═══════════════════════════════════════════════════════════════
const DEEPSEEK_KEY = 'sk-9548e74042624531b949e6057f763dae';

function getKnowledgeContext(userText) {
  // Pull relevant knowledge from DB based on user's message
  try {
    const keywords = userText.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3);
    if (keywords.length === 0) return '';
    const results = db.prepare(
      "SELECT content FROM messages WHERE source='knowledge' AND (" +
      keywords.map(() => "content LIKE ?").join(' OR ') +
      ") LIMIT 3"
    ).all(...keywords.map(k => '%' + k + '%'));
    if (results.length === 0) return '';
    return '\n\nRELEVANT KNOWLEDGE FROM DB:\n' + results.map(r => r.content).join('\n---\n');
  } catch { return ''; }
}

function buildSystemPrompt(userText) {
  const knowledgeCtx = getKnowledgeContext(userText);
  return `You are The Claw, an extremely capable AI assistant and agentic orchestrator running on a powerful Linux VPS (AMD EPYC, 12-core, 24GB RAM, 695GB NVMe). Agentic Coder is ${coderRunning ? 'RUNNING' : 'STOPPED'}.

PERSONALITY: Sharp, friendly, proactive. Like a brilliant DevOps engineer and senior developer who's always online and always remembers context.

YOU CAN:
- Write complete, production-quality code in any language
- Debug complex issues and suggest fixes
- Design architectures and plan projects
- Help with DevOps, Docker, CI/CD, server management
- Brainstorm ideas and cross-pollinate concepts
- Control agentic coders and IDE instances
- Manage the entire Vega ecosystem (17 projects)
- Search your persistent memory (SQLite with FTS5)

VEGA ECOSYSTEM (your toolbelt):
- VegaMCP: MCP server with 60+ tools (knowledge engine, vector DB, project memory, adaptive router, swarm, sandbox)
- VegaTrading: Full trading terminal (60 Python engines, Telegram bot, Oracle AI)
- VegaInvest: Financial forensics terminal (14 modules)
- VegaScience: Scientific research pipeline (Julia math engine)
- VegaCrypto: Algorithmic crypto trading (6 strategies, Rust+tokio)
- VegaProtect: AI cybersecurity (13 proprietary tools, kernel-level)
- VegaAutomate: Vision-based desktop automation
- VegaVision: Eye comfort (Tauri+Rust)
- VegaOptimizer: Windows system optimizer (Tauri+Rust)
- VegaJournal: AI publication engine
- Vega Lattice: Decentralized compute network (in design)

CONTEXT:
- Running on Ubuntu with XFCE desktop via VNC
- Ollama (llama3 + qwen2.5-coder) running locally
- DeepSeek API available as cloud fallback
- Antigravity IDE installed
- Python, Node.js, Rust, Go, .NET, Java available
- PyTorch, Jupyter, Whisper, aider, open-interpreter installed
- This chat synced with Telegram + Command Center GUI
- 🎤 Voice messages transcribed via Whisper
- 🗄️ SQLite persistent memory with full-text search

THINKING PROCESS:
- ALWAYS start your response with <think> tags containing your internal reasoning
- Inside <think>, analyze the question, consider approaches, weigh trade-offs
- After </think>, provide your actual answer
- Keep thinking concise (2-5 sentences) but show real reasoning
- Example: <think>The user wants X. I should consider Y and Z. Best approach is...</think>\nHere is my answer...

TOOLS YOU CAN USE:
When you want to use a tool, include an [ACTION] tag in your response. The system will execute it and show the result.
Available actions:
- [ACTION:repo_map] — Show project structure, files, symbols, git info
- [ACTION:plan:description] — Create a step-by-step implementation plan
- [ACTION:verify] — Run lint, type checks, and tests on the workspace
- [ACTION:commit:message] — Git add + commit with message
- [ACTION:browse:url] — Fetch and read a web page
- [ACTION:search_web:query] — Search the web
- [ACTION:gen_tests:filepath] — Generate tests for a file
- [ACTION:open_workspace:name] — Find and open a project workspace
- [ACTION:run:command] — Execute a shell command
- [ACTION:screenshot] — Capture a screenshot of the VPS desktop
- [ACTION:screenshot:code] — Capture focused on the IDE/editor window
- [ACTION:health_check] — Show system health report (CPU, RAM, disk, services)

Examples of conversational tool use:
- User: "What does the project look like?" → Include [ACTION:repo_map] in your response
- User: "Let's add authentication" → Include [ACTION:plan:add JWT authentication to the project]
- User: "Does it pass tests?" → Include [ACTION:verify]
- User: "Save this progress" → Include [ACTION:commit:added authentication module]
- User: "How do I use React hooks?" → Include [ACTION:search_web:react hooks tutorial]
Do NOT explain the action syntax to the user. Just use it naturally.

CURRENT MODE: ${CODING_MODES[activeMode]?.label || 'Chat'} — ${CODING_MODES[activeMode]?.desc || ''}
${activeMode === 'coder' ? `
CODER MODE INSTRUCTIONS:
- You ARE a code editor. When asked to change code, DO IT directly using actions.
- [ACTION:read_file:path] — Read a file's contents
- [ACTION:write_file:path] — Create/overwrite a file (provide full content after the action tag)
- [ACTION:edit_file:path:SEARCH>>>REPLACE] — Find & replace in a file
- Always read the file first before editing to understand context
- After editing, suggest [ACTION:verify] to check for errors
- If confirm mode is on, destructive edits will need approval
` : ''}${activeMode === 'architect' ? `
ARCHITECT MODE INSTRUCTIONS:
- Focus on system design, planning, and documentation
- Create detailed plans with [ACTION:plan:description]
- Analyze project structure with [ACTION:repo_map]
- Suggest architecture decisions before implementation
- Write design docs and READMEs
` : ''}${activeMode === 'visual' ? `
VISUAL MODE INSTRUCTIONS:
- You control the Antigravity IDE via VNC screenshots
- Take screenshots frequently: [ACTION:screenshot:code]
- After executing commands, screenshot to verify: [ACTION:screenshot:terminal]
- Guide the user through what you see on screen
- Report IDE state, errors, and suggestions based on visuals
` : ''}
RULES:
- Be concise but thorough
- You have full conversation history — reference past discussions when relevant
- When coding, use the owner's preferred stack (React+TS+Tailwind+Tauri, dark mode, Vega design system)
- Suggest next steps proactively
- Use [ACTION] tags when the conversation naturally calls for it
- Active workspace: ${activeWorkspace || 'none set'}
- Active model: ${AVAILABLE_MODELS[activeModel]?.label || activeModel}
- Active mode: ${CODING_MODES[activeMode]?.label || 'Chat'}
- Confirm mode: ${confirmMode ? 'ON (ask before destructive actions)' : 'OFF'}
Current time: ${new Date().toLocaleString()}${knowledgeCtx}`;
}

// Standard chat (non-streaming, for GUI)
function chatOllama(userText) {
  const modelInfo = AVAILABLE_MODELS[activeModel] || AVAILABLE_MODELS['llama3'];
  addLog('chat', `Using model: ${modelInfo.label}`);

  // If active model is cloud-only, go straight to DeepSeek
  if (modelInfo.provider === 'deepseek') {
    const systemPrompt = buildSystemPrompt(userText);
    return chatDeepSeek(userText, systemPrompt);
  }

  return new Promise((resolve) => {
    const systemPrompt = buildSystemPrompt(userText);
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-20),
      { role: 'user', content: userText },
    ];

    const payload = JSON.stringify({ model: modelInfo.name, messages: ollamaMessages, stream: false });

    const req = http.request({
      hostname: '127.0.0.1', port: OLLAMA_PORT, path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 600000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.message?.content || parsed.response || 'No response';
          resolve({ text: formatResponse(text), model: modelInfo.name });
        } catch (e) {
          addLog('warn', 'Ollama parse failed, trying DeepSeek...');
          chatDeepSeek(userText, systemPrompt).then(resolve);
        }
      });
    });
    req.on('error', (e) => {
      addLog('warn', 'Ollama error: ' + e.message + ', trying DeepSeek...');
      chatDeepSeek(userText, systemPrompt).then(resolve);
    });
    req.on('timeout', () => {
      req.destroy();
      if (activeRequest === req) activeRequest = null;
      addLog('warn', 'Stream timeout, falling back to DeepSeek');
      chatDeepSeek(userText, systemPrompt).then(resolve);
    });
    req.write(payload);
    req.end();
  });
}

// Format thinking + answer for Telegram display
function formatThinkingResponse(raw) {
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    let thinking = thinkMatch[1].trim();
    let answer = raw.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    answer = answer.replace(/\[ACTION:[^\]]+\]/g, '').trim(); // Remove actions from chat view
    
    // Telegram only collapses blockquotes if they are >= 3 lines. Pad shorter thoughts.
    const newlines = (thinking.match(/\n/g) || []).length;
    if (newlines < 2) {
      thinking += '\n‎\n‎\n‎'; // Add invisible zero-width blocks to force height
    }
    
    return {
      thinking,
      answer,
      // Wrap the thinking block in our custom tg-expand tag so mdToHtml can map it to Telegram's exclusive expandable blockquote
      formatted: `<tg-expand>💭 **Thought Process**\n${thinking}</tg-expand>\n\n${answer}`,
      hasThinking: true,
    };
  }
  // If it's still streaming the think block, try to hide it
  if (raw.includes('<think>')) {
      const parts = raw.split('<think>');
      return { thinking: '', answer: parts[0].trim(), formatted: parts[0].trim(), hasThinking: false };
  }
  const polished = raw.replace(/\[ACTION:[^\]]+\]/g, '').trim();
  return { thinking: '', answer: raw, formatted: polished, hasThinking: false };
}

// Local Model Verification System
async function verifyAndRepairMessage(text, chatId = null, sentMsgId = null) {
  if (!text || text.length < 20) return text;
  
  // Fast heuristic: counting code blocks
  const openCodeBlocks = (text.match(/```/g) || []).length;
  const hasUnclosedCode = openCodeBlocks % 2 !== 0; // Odd number of backticks
  
  // Fast heuristic: checking if it ends naturally
  const endings = /[.!?\n`>:]$/;
  const seemsTruncated = hasUnclosedCode || !endings.test(text.trim());
  
  if (!seemsTruncated) return text;

  addLog('info', 'Message seems truncated or broken. Running local Llama 3 verify & repair...');

  // Inject a visual indicator into the live Telegram message so the user knows an edit is happening
  if (chatId && sentMsgId) {
    let cleanStatus = formatResponse(text);
    if (cleanStatus.length > 3900) cleanStatus = cleanStatus.substring(0, 3900);
    tgApi('editMessageText', {
      chat_id: chatId,
      message_id: sentMsgId,
      text: mdToHtml(cleanStatus + '\n\n⏳ _Auto-repairing truncated response..._'),
      parse_mode: 'HTML'
    }).catch(() => {});
  }

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'llama3',
      messages: [
        { role: 'system', content: 'You are an auto-correction AI. The user will provide a message generated by another AI that got cut off mid-sentence or has unclosed code blocks. YOUR ONLY JOB is to finish the message completely. Return the ENTIRE message perfectly stitched back together. Do NOT explain what you did. DO NOT add conversational filler.' },
        { role: 'user', content: 'Here is the truncated message:\n\n' + text }
      ],
      stream: false
    });

    const req = http.request({
      hostname: '127.0.0.1', port: OLLAMA_PORT, path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (activeRequest === req) activeRequest = null;
        try {
          const parsed = JSON.parse(data);
          let fixed = parsed.message?.content;
          if (fixed && fixed.length >= text.length) {
            addLog('info', 'Local Llama 3 successfully repaired message.');
            resolve(fixed);
          } else {
             addLog('warn', 'Llama 3 repair failed, doing naive patching.');
             resolve(text + (hasUnclosedCode ? '\n```' : '...'));
          }
        } catch (e) {
          resolve(text + (hasUnclosedCode ? '\n```' : '...'));
        }
      });
    });
    activeRequest = req;
    req.on('error', () => { if (activeRequest === req) activeRequest = null; resolve(text + (hasUnclosedCode ? '\n```' : '...')); });
    req.on('timeout', () => { req.destroy(); if (activeRequest === req) activeRequest = null; resolve(text + (hasUnclosedCode ? '\n```' : '...')); });
    req.write(payload);
    req.end();
  });
}

// Streaming chat for Telegram (live typing + thinking effect)
function chatOllamaStream(userText, chatId) {
  const modelInfo = AVAILABLE_MODELS[activeModel] || AVAILABLE_MODELS['llama3'];

  // Cloud model: non-streaming fallback with thinking display
  if (modelInfo.provider === 'deepseek') {
    return (async () => {
      const sentResult = await sendTelegram(chatId, '🧠 _Thinking via DeepSeek..._');
      const sentMsgId = sentResult?.result?.message_id;
      const systemPrompt = buildSystemPrompt(userText);
      const result = await chatDeepSeek(userText, systemPrompt);
      
      const finalAnswer = await verifyAndRepairMessage(result.text, chatId, sentMsgId);
      if (finalAnswer !== result.text) result.text = finalAnswer;

      const formatted = formatResponse(result.text);
      if (sentMsgId) {
        await tgApi('editMessageText', {
          chat_id: chatId, message_id: sentMsgId,
          text: formatted.substring(0, 4096),
        }).catch(() => {});
      }
      return { text: formatted, model: modelInfo.name, streamed: true };
    })();
  }

  return new Promise((resolve) => {
    const systemPrompt = buildSystemPrompt(userText);
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-20),
      { role: 'user', content: userText },
    ];

    const payload = JSON.stringify({ model: modelInfo.name, messages: ollamaMessages, stream: true });
    let accumulated = '';
    let sentMsgId = null;
    let lastEdit = 0;
    let phase = 'init'; // 'init' -> 'thinking' -> 'answering'
    const EDIT_INTERVAL = 1500;

    // Send initial "thinking" message
    sendTelegram(chatId, '🧠 _Thinking..._').then(result => {
      if (result && result.result) sentMsgId = result.result.message_id;
    }).catch(() => {});

    const req = http.request({
      hostname: '127.0.0.1', port: OLLAMA_PORT, path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    }, (res) => {
      res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              accumulated += parsed.message.content;
            }

            // Detect phase transitions
            if (phase === 'init' && accumulated.includes('<think>')) {
              phase = 'thinking';
            }
            if (phase === 'thinking' && accumulated.includes('</think>')) {
              phase = 'answering';
            }

            // Live edit periodically
            const now = Date.now();
            if (sentMsgId && (now - lastEdit > EDIT_INTERVAL) && accumulated.length > 0) {
              lastEdit = now;
              let preview;
              if (phase === 'thinking') {
                const thinkContent = accumulated.replace('<think>', '').substring(0, 800);
                preview = `🧠 <b>Thinking...</b>\n\n<i>${mdToHtml(thinkContent)}</i> ▌`;
              } else if (phase === 'answering') {
                const result = formatThinkingResponse(accumulated);
                preview = mdToHtml(result.formatted.substring(0, 4000)) + ' ▌';
              } else {
                preview = mdToHtml(accumulated.substring(0, 4000)) + ' ▌';
              }
              tgApi('editMessageText', {
                chat_id: chatId,
                message_id: sentMsgId,
                text: preview,
                parse_mode: 'HTML',
              }).catch(() => {
                tgApi('editMessageText', {
                  chat_id: chatId,
                  message_id: sentMsgId,
                  text: preview.replace(/<[^>]+>/g, ''),
                }).catch(() => {});
              });
            }
          } catch {}
        }
      });
      res.on('end', async () => {
        const result = formatThinkingResponse(accumulated || 'No response');
        
        // Let the local verifier run and fix truncations
        const finalAnswer = await verifyAndRepairMessage(result.answer, chatId, sentMsgId);

        // Final edit with formatted thinking + fixed answer
        if (sentMsgId) {
          let finalTextToEdit = finalAnswer;
          if (result.hasThinking && result.thinking) {
              // Enforce padding for Telegram height requirement again here
              let t = result.thinking;
              if ((t.match(/\n/g) || []).length < 2) t += '\n‎\n‎\n‎';
              finalTextToEdit = `<tg-expand>💭 **Thought Process**\n${t}</tg-expand>\n\n${finalAnswer}`;
          }
          tgApi('editMessageText', {
            chat_id: chatId,
            message_id: sentMsgId,
            text: mdToHtml(finalTextToEdit.substring(0, 4096)),
            parse_mode: 'HTML',
          }).catch(() => {
            tgApi('editMessageText', {
              chat_id: chatId,
              message_id: sentMsgId,
              text: finalAnswer.replace(/[_*`\\[\]]/g, '').substring(0, 4096),
            }).catch(() => {});
          });
        }
        if (activeRequest === req) activeRequest = null;
        // Store just the answer in chat history
        resolve({ text: formatResponse(finalAnswer), thinking: result.thinking, model: modelInfo.name, streamed: true });
      });
    });
    activeRequest = req;
    req.on('error', (e) => {
      if (activeRequest === req) activeRequest = null;
      addLog('warn', 'Stream error, falling back to DeepSeek: ' + e.message);
      if (sentMsgId) {
        tgApi('editMessageText', {
          chat_id: chatId, message_id: sentMsgId,
          text: '⚡ _Switching to DeepSeek..._', parse_mode: 'Markdown',
        }).catch(() => {});
      }
      chatDeepSeek(userText, systemPrompt).then(result => {
        if (sentMsgId) {
          tgApi('editMessageText', {
            chat_id: chatId, message_id: sentMsgId,
            text: result.text.substring(0, 4096),
          }).catch(() => {});
        }
        resolve(result);
      });
    });
    req.on('timeout', () => {
      req.destroy();
      addLog('warn', 'Stream timeout, falling back to DeepSeek');
      chatDeepSeek(userText, systemPrompt).then(resolve);
    });
    req.write(payload);
    req.end();
  });
}

// DeepSeek Cloud Fallback
function chatDeepSeek(userText, systemPrompt) {
  return new Promise((resolve) => {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-10), // Fewer for cloud (token cost)
      { role: 'user', content: userText },
    ];

    const payload = JSON.stringify({ model: 'deepseek-chat', messages, stream: false, max_tokens: 2048 });

    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_KEY,
      },
      timeout: 600000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (activeRequest === req) activeRequest = null;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.message?.content || 'No response from DeepSeek';
          resolve({ text, model: 'deepseek-chat' });
        } catch (e) {
          resolve({ text: 'Both Ollama and DeepSeek failed: ' + e.message, model: 'error' });
        }
      });
    });
    activeRequest = req;
    req.on('error', (e) => { if (activeRequest === req) activeRequest = null; resolve({ text: 'All AI providers offline: ' + e.message, model: 'error' }); });
    req.on('timeout', () => { req.destroy(); if (activeRequest === req) activeRequest = null; resolve({ text: 'All providers timed out', model: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// Telegram Bot API
// ═══════════════════════════════════════════════════════════════
function tgApi(method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
      timeout: 15000,
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve({ ok: false }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

function sendTelegram(chatId, text) {
  return tgApi('sendMessage', {
    chat_id: chatId,
    text: text.substring(0, 4000),
    parse_mode: 'Markdown',
  }).catch(() => {
    return tgApi('sendMessage', { chat_id: chatId, text: text.substring(0, 4000) });
  });
}

// Send message with inline keyboard buttons
function sendTelegramWithButtons(chatId, text, buttons) {
  return tgApi('sendMessage', {
    chat_id: chatId,
    text: text.substring(0, 4000),
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify({
      inline_keyboard: buttons
    }),
  }).catch(() => {
    return tgApi('sendMessage', { chat_id: chatId, text: text.substring(0, 4000) });
  });
}

const DEFAULT_BUTTONS = [
  [
    { text: '🔄 Retry', callback_data: 'retry' },
    { text: '↩️ Undo', callback_data: 'undo' },
    { text: '❌ Cancel', callback_data: 'cancel' },
    { text: '✅ Verify', callback_data: 'verify' },
  ],
  [
    { text: '🗺️ Map', callback_data: 'repo_map' },
    { text: '📸 Shot', callback_data: 'screenshot' },
    { text: '📊 Health', callback_data: 'health_check' },
    { text: '🤖 Models', callback_data: 'list_models' },
  ],
  [
    { text: '📋 Git Log', callback_data: 'git_log' },
    { text: '🗜️ Compress', callback_data: 'compress_logs' },
  ]
];

// Confirm mode buttons (when AI wants to execute something destructive)
const CONFIRM_BUTTONS = [
  [
    { text: '✅ Approve', callback_data: 'approve' },
    { text: '❌ Reject', callback_data: 'reject' },
  ]
];

// ═══════════════════════════════════════════════════════════════
// VPS Screenshot with Smart Window Focusing
// ═══════════════════════════════════════════════════════════════

// Detect which window to focus based on conversation context
function detectScreenTarget(context) {
  const t = (context || '').toLowerCase();
  if (/code|editor|ide|file|script|function|class|import/.test(t)) return 'code';
  if (/terminal|shell|bash|command|output|console/.test(t)) return 'terminal';
  if (/browser|web|page|site|ui|frontend|app/.test(t)) return 'browser';
  if (/desktop|screen|everything|full/.test(t)) return 'desktop';
  return 'desktop'; // default to full desktop
}

async function captureVPSScreenshot(target = 'desktop') {
  const screenshotPath = `/tmp/vps_screenshot_${Date.now()}.png`;
  
  // Focus the right window before capturing
  const focusCommands = {
    code: 'xdotool search --name "Visual Studio Code\\|Cursor\\|Antigravity\\|code" windowactivate --sync 2>/dev/null || true',
    terminal: 'xdotool search --name "Terminal\\|xterm\\|bash\\|tmux" windowactivate --sync 2>/dev/null || true',
    browser: 'xdotool search --name "Firefox\\|Chrome\\|Chromium" windowactivate --sync 2>/dev/null || true',
    desktop: 'true', // no focus needed — grab everything
  };

  const focusCmd = focusCommands[target] || focusCommands.desktop;
  
  return new Promise((resolve) => {
    // Set DISPLAY for VNC, focus window, wait, then screenshot
    const cmd = `export DISPLAY=:1 && ${focusCmd} && sleep 0.3 && scrot -o ${screenshotPath} 2>/dev/null || import -window root ${screenshotPath} 2>/dev/null`;
    exec(cmd, { timeout: 10000, shell: '/bin/bash' }, (err) => {
      if (err || !fs.existsSync(screenshotPath)) {
        resolve(null);
      } else {
        resolve(screenshotPath);
      }
    });
  });
}

// Send photo to Telegram
function sendTelegramPhoto(chatId, photoPath, caption) {
  return new Promise((resolve, reject) => {
    const boundary = '----VegaClaw' + Date.now();
    const photoData = fs.readFileSync(photoPath);
    
    let body = '';
    body += `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
    if (caption) body += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption.substring(0, 1024)}\r\n`;
    
    const header = Buffer.from(body + `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="screenshot.png"\r\nContent-Type: image/png\r\n\r\n`);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([header, photoData, footer]);
    
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendPhoto`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
        // Clean up screenshot
        try { fs.unlinkSync(photoPath); } catch {}
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Determine if AI response warrants a screenshot
function shouldAutoScreenshot(aiText, userText) {
  const combined = (aiText + ' ' + userText).toLowerCase();
  // If discussing something visual, running a UI, or the AI mentions looking at something
  if (/(?:take a look|see the|here'?s what|looks like|screenshot|displayed|showing|running now|launched|opened|started the)/i.test(combined)) return true;
  if (/(?:ui|interface|frontend|dashboard|page|window|desktop|gui)/i.test(combined) && /(?:check|look|see|show|running)/i.test(combined)) return true;
  return false;
}

// Health check function
async function getHealthReport() {
  const run = (cmd) => new Promise(r => exec(cmd, { timeout: 5000, shell: '/bin/bash' }, (e, o) => r((o || '').trim())));
  
  const [cpu, ram, disk, uptime, loadAvg, procs] = await Promise.all([
    run("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
    run("free -m | awk '/Mem/{printf \"%d/%dMB (%.0f%%)\", $3, $2, ($3/$2)*100}'"),
    run("df -h / | awk 'NR==2{printf \"%s/%s (%s)\", $3, $2, $5}'"),
    run("uptime -p"),
    run("cat /proc/loadavg | awk '{print $1, $2, $3}'"),
    run("pm2 jlist"),
  ]);
  
  let pm2Info = '';
  try {
    const pm2List = JSON.parse(procs);
    pm2Info = pm2List.map(p => `  • ${p.name}: ${p.pm2_env?.status || '?'} (${Math.round((p.monit?.memory || 0) / 1024 / 1024)}MB)`).join('\n');
  } catch { pm2Info = '  (unavailable)'; }
  
  return `🖥️ *VPS Health Report*\n\n` +
    `*CPU:* ${cpu}%\n` +
    `*RAM:* ${ram}\n` +
    `*Disk:* ${disk}\n` +
    `*Uptime:* ${uptime}\n` +
    `*Load:* ${loadAvg}\n\n` +
    `*Services:*\n${pm2Info}`;
}

// Download a file from Telegram
function downloadTgFile(filePath, localPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(localPath);
    https.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(localPath); });
    }).on('error', reject);
  });
}

// Transcribe audio file using Whisper
function transcribeAudio(audioPath) {
  return new Promise((resolve) => {
    const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
    exec(`ffmpeg -y -i ${audioPath} ${wavPath} 2>/dev/null && python3 /opt/transcribe.py ${wavPath}`,
      { timeout: 120000 },
      (err, stdout) => {
        try { fs.unlinkSync(audioPath); } catch {}
        try { fs.unlinkSync(wavPath); } catch {}
        resolve(err ? null : stdout.trim());
      }
    );
  });
}

// ═══════════════════════════════════════════════════════════════
// FIX: Flush old updates on startup to prevent duplicate messages
// ═══════════════════════════════════════════════════════════════
async function flushOldUpdates() {
  try {
    console.log('🧹 Flushing old Telegram updates...');
    const result = await tgApi('getUpdates', { offset: -1, limit: 1 });
    if (result.ok && result.result && result.result.length > 0) {
      tgOffset = result.result[result.result.length - 1].update_id + 1;
      // Call once more to confirm the offset
      await tgApi('getUpdates', { offset: tgOffset, limit: 1, timeout: 0 });
      console.log(`🧹 Flushed. Starting from offset ${tgOffset}`);
    } else {
      console.log('🧹 No old updates to flush');
    }
    botReady = true;
  } catch (e) {
    console.log('🧹 Flush error (continuing anyway):', e.message);
    botReady = true;
  }
}

// ═══════════════════════════════════════════════════════════════
// Poll Telegram for new messages
// ═══════════════════════════════════════════════════════════════
async function pollTelegram() {
  if (!botReady) {
    setTimeout(pollTelegram, 500);
    return;
  }
  
  try {
    const result = await tgApi('getUpdates', { offset: tgOffset, timeout: 5, limit: 10 });
    if (result.ok && result.result) {
      for (const update of result.result) {
        tgOffset = update.update_id + 1;

        // Handle callback queries (inline button presses)
        if (update.callback_query) {
          const cb = update.callback_query;
          const chatId = cb.message?.chat?.id;
          const action = cb.data;
          tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: '⏳ Running...' }).catch(() => {});
          try {
            if (action === 'retry') {
              if (lastUserText) {
                const ai = await chatOllamaStream(lastUserText, chatId);
                addMessage('telegram-out', ai.text, ai.model, ai.thinking);
              } else { await sendTelegram(chatId, '🤷 Nothing to retry.'); }
            } else if (action === 'cancel') {
              if (activeRequest) {
                activeRequest.destroy();
                activeRequest = null;
                await sendTelegram(chatId, '❌ _Generation cancelled._');
              } else { await sendTelegram(chatId, '🤷 Nothing is generating.'); }
            } else if (action === 'undo') {
              const ws = activeWorkspace || '/root';
              const last = await runCmd(`cd '${ws}' && git log --oneline -1 2>/dev/null`);
              if (last) { await runCmd(`cd '${ws}' && git revert HEAD --no-edit 2>/dev/null`); await sendTelegram(chatId, `↩️ *Reverted:* \`${last}\``); }
              else { await sendTelegram(chatId, '🤷 No commits to undo.'); }
            } else if (action === 'verify') {
              await sendTelegram(chatId, '🔍 _Verifying..._');
              const v = await runVerification();
              await sendTelegram(chatId, (v.passed ? '✅ *Passed!*' : '❌ *Failed:*') + '\n\n' + v.summary);
            } else if (action === 'repo_map') {
              await sendTelegram(chatId, '🗺️ _Mapping..._');
              const map = await buildRepoMap();
              await sendTelegram(chatId, map.substring(0, 4000));
            } else if (action === 'git_log') {
              const ws = activeWorkspace || '/root';
              const log = await runCmd(`cd '${ws}' && git log --oneline -15 2>/dev/null`);
              await sendTelegram(chatId, `📋 *Commits:*\n\`\`\`\n${log || 'No history'}\n\`\`\``);
            } else if (action === 'list_models') {
              const list = Object.entries(AVAILABLE_MODELS).map(([k, v]) => `• \`${k}\` — ${v.label}${k === activeModel ? ' ✅' : ''}`).join('\n');
              await sendTelegram(chatId, `🤖 *Models:*\n\n${list}\n\nSay \`use model [name]\` to switch.`);
            } else if (action === 'screenshot') {
              await sendTelegram(chatId, '📸 _Capturing..._');
              const photoPath = await captureVPSScreenshot('desktop');
              if (photoPath) { await sendTelegramPhoto(chatId, photoPath, '📸 VPS Desktop'); }
              else { await sendTelegram(chatId, '❌ Screenshot failed.'); }
            } else if (action === 'health_check') {
              const report = await getHealthReport();
              await sendTelegram(chatId, report);
            } else if (action === 'compress_logs') {
              await sendTelegram(chatId, '🗜️ _Compressing chat history..._');
              try {
                await compressHistory(chatId);
                await sendTelegram(chatId, '✅ Chat history compressed.');
              } catch (e) { await sendTelegram(chatId, '❌ Compression failed: ' + e.message); }
            } else if (action === 'approve') {
              if (pendingAction) {
                const pa = pendingAction; pendingAction = null;
                await sendTelegram(chatId, `✅ Executing: ${pa.description}`);
                try { const r = await pa.execute(); await sendTelegram(chatId, formatResponse(r || 'Done.')); }
                catch (e) { await sendTelegram(chatId, '❌ ' + e.message); }
              } else { await sendTelegram(chatId, '🤷 Nothing pending.'); }
            } else if (action === 'reject') {
              if (pendingAction) { pendingAction = null; await sendTelegram(chatId, '🚫 Cancelled.'); }
              else { await sendTelegram(chatId, '🤷 Nothing to cancel.'); }
            }
          } catch (e) { addLog('error', 'Callback error: ' + e.message); }
          continue;
        }

        const msg = update.message;
        if (!msg) continue;
        const userId = String(msg.from.id);
        if (AUTHORIZED_ID && userId !== AUTHORIZED_ID) continue;

        // ── Voice messages ──
        if (msg.voice) {
          console.log('🎤 Voice message received');
          await sendTelegram(msg.chat.id, '🎤 _Transcribing..._');
          try {
            const fileInfo = await tgApi('getFile', { file_id: msg.voice.file_id });
            if (fileInfo.ok && fileInfo.result.file_path) {
              const localPath = `/tmp/voice_${Date.now()}.ogg`;
              await downloadTgFile(fileInfo.result.file_path, localPath);
              const transcript = await transcribeAudio(localPath);
              if (transcript) {
                console.log(`🎤 Transcribed: "${transcript}"`);
                addMessage('telegram-in', '🎤 ' + transcript);
                
                const intent = detectIntent(transcript);
                if (intent === 'start_coder') {
                  coderRunning = true;
                  addMessage('sys', 'Agentic Coder started via voice');
                  await sendTelegram(msg.chat.id, '🎤 _"' + transcript + '"_\n\n✅ *Agentic Coder started!*');
                  continue;
                }
                if (intent === 'stop_coder') {
                  coderRunning = false;
                  addMessage('sys', 'Agentic Coder stopped via voice');
                  await sendTelegram(msg.chat.id, '🎤 _"' + transcript + '"_\n\n⏹ *Agentic Coder stopped.*');
                  continue;
                }
                if (intent === 'status') {
                  const run = (cmd) => new Promise(r => exec(cmd, { timeout: 3000 }, (e, o) => r((o || '').trim())));
                  const cpu = await run("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d. -f1");
                  const ram = await run("free -m | awk '/Mem/{printf \"%d/%dMB (%.0f%%)\", $3, $2, ($3/$2)*100}'");
                  await sendTelegram(msg.chat.id, '🎤 _"' + transcript + '"_\n\n🖥️ CPU: ' + cpu + '% | RAM: ' + ram);
                  continue;
                }
                
                const ai = await chatOllama(transcript);
                addMessage('telegram-out', ai.text, ai.model);
                await sendTelegram(msg.chat.id, '🎤 _"' + transcript + '"_\n\n' + ai.text);
              } else {
                await sendTelegram(msg.chat.id, '❌ Could not transcribe. Try again or type your message.');
              }
            }
          } catch (e) {
            console.log('Voice error:', e.message);
            await sendTelegram(msg.chat.id, '❌ Voice error: ' + e.message);
          }
          continue;
        }

        // ── Text messages ──
        if (!msg.text) continue;
        const text = msg.text;
        console.log(`📱 TG: ${text.substring(0, 80)}${text.length > 80 ? '...' : ''}`);

        if (text === '/start') {
          await sendTelegram(msg.chat.id, '🦀 *The Claw is online!*\n\nJust talk to me naturally:\n• _"How\'s the server doing?"_\n• _"Start the coder"_\n• _"Stop the bot"_\n• _"$free -h"_ (run shell commands)\n• 🎤 Send a voice message\n• Or just chat!\n\n_Synced with Command Center GUI_');
          continue;
        }

        const intent = detectIntent(text);

        if (intent === 'start_coder') {
          coderRunning = true;
          addMessage('sys', 'Agentic Coder started via Telegram');
          await sendTelegram(msg.chat.id, '✅ *Agentic Coder started!* Say "stop" anytime.');
          continue;
        }
        if (intent === 'stop_coder') {
          coderRunning = false;
          addMessage('sys', 'Agentic Coder stopped via Telegram');
          await sendTelegram(msg.chat.id, '⏹ *Agentic Coder stopped.* Say "start" to resume.');
          continue;
        }
        if (intent === 'status' || text === '/status') {
          const run = (cmd) => new Promise(r => exec(cmd, { timeout: 3000 }, (e, o) => r((o || '').trim())));
          const cpu = await run("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d. -f1");
          const ram = await run("free -m | awk '/Mem/{printf \"%d/%dMB (%.0f%%)\", $3, $2, ($3/$2)*100}'");
          const disk = await run("df -h / | awk 'NR==2{print $5}'");
          const load = await run("cat /proc/loadavg | awk '{print $1}'");
          await sendTelegram(msg.chat.id, `🖥️ *VPS Status*\n\n• CPU: ${cpu}%\n• RAM: ${ram}\n• Disk: ${disk}\n• Load: ${load}\n• Coder: ${coderRunning ? '✅ Running' : '⏹ Stopped'}\n• Services: All online`);
          continue;
        }
        if (intent && intent.startsWith('restart_')) {
          const svc = intent.split('_')[1];
          const cmds = { ollama: 'systemctl restart ollama', antigravity: 'pm2 restart antigravity', server: 'pm2 restart all', claw: 'pm2 restart claw-gui' };
          exec(cmds[svc] || cmds.server, { timeout: 10000 }, () => {});
          addMessage('sys', `Restarting ${svc} via Telegram`);
          await sendTelegram(msg.chat.id, `🔄 *Restarting ${svc}...*`);
          continue;
        }

        // Workspace intents
        if (intent && intent.intent === 'open_workspace') {
          addMessage('telegram-in', text);
          const wsPath = await findWorkspace(intent.name);
          if (wsPath) {
            activeWorkspace = wsPath;
            saveSession('activeWorkspace', wsPath);
            db.prepare('UPDATE workspaces SET last_accessed = ? WHERE path = ?').run(Date.now(), wsPath);
            const files = await listWorkspaceFiles(wsPath, 1);
            addMessage('telegram-out', '📂 Opened: ' + wsPath, 'workspace');
            await sendTelegram(msg.chat.id, `📂 *Workspace opened:*\n\`${wsPath}\`\n\n\`\`\`\n${files}\n\`\`\``);
          } else {
            await sendTelegram(msg.chat.id, `❌ Could not find workspace matching "${intent.name}". Try a more specific name.`);
          }
          continue;
        }
        if (intent && intent.intent === 'list_files') {
          if (!activeWorkspace) {
            await sendTelegram(msg.chat.id, '❌ No workspace active. Say "open [project name]" first.');
            continue;
          }
          const files = await listWorkspaceFiles(activeWorkspace);
          await sendTelegram(msg.chat.id, `📂 *${activeWorkspace}*:\n\`\`\`\n${files}\n\`\`\``);
          continue;
        }
        if (intent && intent.intent === 'list_workspaces') {
          const ws = db.prepare('SELECT name, path, last_accessed FROM workspaces ORDER BY last_accessed DESC LIMIT 10').all();
          if (ws.length === 0) {
            await sendTelegram(msg.chat.id, 'No workspaces registered yet. Say "open [project]" to find and register one.');
          } else {
            const list = ws.map((w, i) => `${i+1}. *${w.name}* → \`${w.path}\``).join('\n');
            await sendTelegram(msg.chat.id, `📂 *Your Workspaces:*\n\n${list}\n\n_Active: ${activeWorkspace || 'none'}_`);
          }
          continue;
        }
        if (intent && intent.intent === 'search') {
          addMessage('telegram-in', text);
          const results = searchMessages(intent.query, 10);
          if (results.length === 0) {
            await sendTelegram(msg.chat.id, `🔍 No results for "${intent.query}"`);
          } else {
            const list = results.map(r => `• [${r.source}] ${r.content.substring(0, 80)}...`).join('\n');
            await sendTelegram(msg.chat.id, `🔍 *Search: "${intent.query}"*\n${results.length} results:\n\n${list}`);
          }
          continue;
        }

        // ── Plan/Execute intents ──
        if (intent && intent.intent === 'plan') {
          addMessage('telegram-in', text);
          await sendTelegram(msg.chat.id, '📋 _Planning..._');
          const plan = await generatePlan(intent.task);
          if (plan.error) {
            await sendTelegram(msg.chat.id, '❌ ' + plan.error + (plan.raw ? '\n\n' + plan.raw.substring(0, 500) : ''));
          } else {
            addMessage('telegram-out', formatPlan(), 'plan');
            await sendTelegram(msg.chat.id, formatPlan());
          }
          continue;
        }
        if (intent && (intent.intent === 'plan_go' || intent.intent === 'plan_next')) {
          if (!activePlan) {
            await sendTelegram(msg.chat.id, '❌ No active plan. Say "plan [your task]" first.');
            continue;
          }
          await sendTelegram(msg.chat.id, `⏳ Executing step ${activePlan.currentStep + 1}...`);
          const result = await executeNextStep();
          if (result.error) {
            await sendTelegram(msg.chat.id, `❌ Step failed: ${result.error}\n\n${formatPlan()}`);
          } else if (result.done) {
            addMessage('telegram-out', '✅ Plan complete!', 'plan');
            await sendTelegram(msg.chat.id, `✅ *Plan complete!*\n\n${formatPlan()}`);
          } else {
            const output = typeof result.result === 'object' ? JSON.stringify(result.result).substring(0, 500) : String(result.result || '').substring(0, 500);
            await sendTelegram(msg.chat.id, `✅ Step ${result.step}/${result.total} done.\n\n${output}\n\n${formatPlan()}`);
          }
          continue;
        }
        if (intent && intent.intent === 'plan_skip') {
          if (activePlan && activePlan.currentStep < activePlan.steps.length) {
            activePlan.steps[activePlan.currentStep].status = 'done';
            activePlan.steps[activePlan.currentStep].result = 'Skipped';
            activePlan.currentStep++;
            await sendTelegram(msg.chat.id, `⏭ Step skipped.\n\n${formatPlan()}`);
          }
          continue;
        }
        if (intent && intent.intent === 'plan_abort') {
          activePlan = null;
          await sendTelegram(msg.chat.id, '🛑 Plan aborted.');
          continue;
        }
        if (intent && intent.intent === 'plan_status') {
          await sendTelegram(msg.chat.id, formatPlan());
          continue;
        }

        // ── Model switching ──
        if (intent && intent.intent === 'set_model') {
          const key = Object.keys(AVAILABLE_MODELS).find(k => k.includes(intent.model) || AVAILABLE_MODELS[k].name.includes(intent.model));
          if (key) {
            activeModel = key;
            saveSession('activeModel', key);
            const m = AVAILABLE_MODELS[key];
            addLog('model', 'Switched to: ' + m.label);
            await sendTelegram(msg.chat.id, `✅ *Model switched to:* ${m.label}\n_Provider: ${m.provider}_`);
          } else {
            const list = Object.entries(AVAILABLE_MODELS).map(([k, v]) => `• \`${k}\` — ${v.label}`).join('\n');
            await sendTelegram(msg.chat.id, `❌ Unknown model "${intent.model}"\n\n*Available:*\n${list}`);
          }
          continue;
        }
        if (intent && intent.intent === 'list_models') {
          const list = Object.entries(AVAILABLE_MODELS).map(([k, v]) => {
            const active = k === activeModel ? ' ✅' : '';
            return `• \`${k}\` — ${v.label}${active}`;
          }).join('\n');
          await sendTelegram(msg.chat.id, `🤖 *Available Models:*\n\n${list}\n\n_Current: ${AVAILABLE_MODELS[activeModel].label}_\n\nSay \`use model [name]\` to switch.`);
          continue;
        }
        if (intent && intent.intent === 'current_model') {
          const m = AVAILABLE_MODELS[activeModel];
          await sendTelegram(msg.chat.id, `🤖 *Active model:* ${m.label}\n_Provider: ${m.provider}_`);
          continue;
        }

        // ── Mode switching ──
        if (intent && intent.intent === 'set_mode') {
          const key = Object.keys(CODING_MODES).find(k => k === intent.mode || k.startsWith(intent.mode));
          if (key) {
            activeMode = key;
            saveSession('activeMode', key);
            const m = CODING_MODES[key];
            // Auto-switch model for coding modes
            if (key === 'coder' && activeModel !== 'qwen') {
              activeModel = 'qwen'; saveSession('activeModel', 'qwen');
            }
            addLog('mode', 'Switched to: ' + m.label);
            let modeMsg = `${m.icon} *Mode: ${m.label}*\n_${m.desc}_`;
            if (key === 'coder') modeMsg += '\n\n\ud83d\udca1 I can now read, edit, and create files directly. Try: "read server.js" or "add a login endpoint"';
            if (key === 'visual') modeMsg += '\n\n\ud83d\udca1 I will use VNC screenshots to see and interact with the IDE.';
            if (key === 'architect') modeMsg += '\n\n\ud83d\udca1 I will focus on planning and design. Try: "plan a microservice architecture"';
            await sendTelegram(msg.chat.id, modeMsg);
          } else {
            const list = Object.entries(CODING_MODES).map(([k, v]) => `• \`${k}\` — ${v.label}: ${v.desc}${k === activeMode ? ' ✅' : ''}`).join('\n');
            await sendTelegram(msg.chat.id, `❌ Unknown mode. Available:\n\n${list}`);
          }
          continue;
        }
        if (intent && intent.intent === 'list_modes') {
          const list = Object.entries(CODING_MODES).map(([k, v]) => `• \`${k}\` — ${v.label}: ${v.desc}${k === activeMode ? ' ✅' : ''}`).join('\n');
          await sendTelegram(msg.chat.id, `🔧 *Available Modes:*\n\n${list}\n\n_Current: ${CODING_MODES[activeMode].label}_\n\nSay \`switch to [mode] mode\` to change.`);
          continue;
        }

        // ── File operations ──
        if (intent && intent.intent === 'read_file') {
          const result = readFile(intent.file);
          if (result.error) {
            await sendTelegram(msg.chat.id, `❌ ${result.error}`);
          } else {
            await sendTelegram(msg.chat.id, `📄 *${intent.file}* (${result.lines} lines)\n\`\`\`\n${result.content.substring(0, 3500)}\n\`\`\``);
          }
          continue;
        }

        // ── Screenshot ──
        if (intent && intent.intent === 'screenshot') {
          await sendTelegram(msg.chat.id, '📸 _Capturing..._');
          const target = detectScreenTarget(text + ' ' + lastUserText);
          const photoPath = await captureVPSScreenshot(target);
          if (photoPath) {
            await sendTelegramPhoto(msg.chat.id, photoPath, `📸 VPS Screenshot (${target})`);
          } else {
            await sendTelegram(msg.chat.id, '❌ Screenshot failed. Is DISPLAY set? Try: `$scrot /tmp/test.png`');
          }
          continue;
        }

        // ── Health check ──
        if (intent && intent.intent === 'health_check') {
          const report = await getHealthReport();
          await sendTelegram(msg.chat.id, report);
          continue;
        }

        // ── Confirmation mode ──
        if (intent && intent.intent === 'toggle_confirm') {
          confirmMode = !confirmMode;
          saveSession('confirmMode', confirmMode);
          await sendTelegram(msg.chat.id, confirmMode
            ? '🛡️ *Confirmation mode ON* — I\'ll ask before destructive actions (commits, file edits, deploys).'
            : '⚡ *Confirmation mode OFF* — Actions execute immediately.');
          continue;
        }
        if (intent && intent.intent === 'approve') {
          if (pendingAction) {
            const action = pendingAction;
            pendingAction = null;
            await sendTelegram(msg.chat.id, `✅ *Approved.* Executing: ${action.description}`);
            try {
              const result = await action.execute();
              await sendTelegram(msg.chat.id, formatResponse(result || 'Done.'));
            } catch (e) { await sendTelegram(msg.chat.id, '❌ Error: ' + e.message); }
          } else {
            await sendTelegram(msg.chat.id, '🤷 Nothing pending approval.');
          }
          continue;
        }
        if (intent && intent.intent === 'reject') {
          if (pendingAction) {
            pendingAction = null;
            await sendTelegram(msg.chat.id, '🚫 *Cancelled.*');
          } else {
            await sendTelegram(msg.chat.id, '🤷 Nothing to cancel.');
          }
          continue;
        }

        // ── Git commit ──
        if (intent && intent.intent === 'git_commit') {
          addMessage('telegram-in', text);
          if (confirmMode) {
            pendingAction = {
              description: 'Git commit: ' + (intent.msg || 'auto-message'),
              execute: () => gitAutoCommit(null, intent.msg || null),
            };
            await sendTelegramWithButtons(msg.chat.id, 
              `🛡️ *Confirm commit?*\n_${intent.msg || 'auto-generated message'}_`,
              [[{ text: '✅ Approve', callback_data: 'approve' }, { text: '🚫 Reject', callback_data: 'reject' }]]
            );
          } else {
            const result = await gitAutoCommit(null, intent.msg || null);
            addMessage('telegram-out', result, 'git');
            await sendTelegram(msg.chat.id, result);
          }
          continue;
        }

        // ── Verify/lint/test ──
        if (intent && intent.intent === 'verify') {
          addMessage('telegram-in', text);
          await sendTelegram(msg.chat.id, '🔍 _Running verification..._');
          const v = await runVerification();
          const msg2 = v.passed ? '✅ *All checks passed!*' : '❌ *Some checks failed:*';
          addMessage('telegram-out', msg2 + '\n' + v.summary, 'verify');
          await sendTelegram(msg.chat.id, msg2 + '\n\n' + v.summary);
          continue;
        }

        // ── Compress/Clean Logs ──
        if (intent && intent.intent === 'compress_history') {
          addMessage('telegram-in', text);
          await compressHistory(msg.chat.id);
          continue;
        }

        // ── Web browsing ──
        if (intent && intent.intent === 'browse') {
          addMessage('telegram-in', text);
          await sendTelegram(msg.chat.id, '🌐 _Fetching..._');
          const content = await browseWeb(intent.url);
          addMessage('telegram-out', content.substring(0, 500), 'web');
          await sendTelegram(msg.chat.id, `🌐 *${intent.url}*\n\n${content.substring(0, 3500)}`);
          continue;
        }
        if (intent && intent.intent === 'web_search') {
          addMessage('telegram-in', text);
          await sendTelegram(msg.chat.id, '🔍 _Searching..._');
          const results = await webSearch(intent.query);
          addMessage('telegram-out', results.substring(0, 500), 'web');
          await sendTelegram(msg.chat.id, `🔍 *Web: "${intent.query}"*\n\n${results.substring(0, 3500)}`);
          continue;
        }

        // ── Test generation ──
        if (intent && intent.intent === 'gen_tests') {
          addMessage('telegram-in', text);
          await sendTelegram(msg.chat.id, '🧪 _Generating tests..._');
          const result = await generateTests(intent.file);
          addMessage('telegram-out', result.substring(0, 500), 'test');
          await sendTelegram(msg.chat.id, result.substring(0, 4000));
          continue;
        }

        // ── Repo map ──
        if (intent && intent.intent === 'repo_map') {
          addMessage('telegram-in', text);
          await sendTelegram(msg.chat.id, '🗺️ _Building repo map..._');
          const map = await buildRepoMap();
          addMessage('telegram-out', 'Repo map generated', 'repomap');
          await sendTelegram(msg.chat.id, map.substring(0, 4000));
          continue;
        }

        // Regular message → universal chat
        addMessage('telegram-in', text);
        lastUserText = text;

        if (text.startsWith('$')) {
          const cmd = text.substring(1).trim();
          addLog('cmd', '$ ' + cmd);
          const output = await new Promise(r => exec(cmd, { timeout: 15000, shell: '/bin/bash', maxBuffer: 1024 * 1024 }, (e, o, se) => r(((o || '') + (se || '')).substring(0, 3000))));
          addMessage('telegram-out', output, 'bash');
          await sendTelegram(msg.chat.id, '```\n' + output + '\n```');
          continue;
        }

        // 🔥 Stream response to Telegram (live typing)
        addLog('chat', 'Streaming response to Telegram...');
        const ai = await chatOllamaStream(text, msg.chat.id);
        addMessage('telegram-out', ai.text, ai.model, ai.thinking);
        addLog('chat', `Response complete (${ai.model}, ${ai.text.length} chars)`);

        // 🧠 Parse AI response for [ACTION:...] tags and auto-execute
        const actionRe = /\[ACTION:(\w+)(?::([^\]]+))?\]/g;
        let actionMatch;
        while ((actionMatch = actionRe.exec(ai.text)) !== null) {
          const action = actionMatch[1];
          const arg = actionMatch[2] || '';
          addLog('action', `AI triggered: ${action} ${arg}`);
          try {
            let actionResult = '';
            if (action === 'repo_map') actionResult = await buildRepoMap();
            else if (action === 'plan') { const p = await generatePlan(arg); actionResult = p.error ? '❌ ' + p.error : formatPlan(); }
            else if (action === 'verify') { const v = await runVerification(); actionResult = v.summary; }
            else if (action === 'commit') actionResult = await gitAutoCommit(null, arg || null);
            else if (action === 'browse') actionResult = await browseWeb(arg);
            else if (action === 'search_web') actionResult = await webSearch(arg);
            else if (action === 'gen_tests') actionResult = await generateTests(arg);
            else if (action === 'open_workspace') {
              const wsPath = await findWorkspace(arg);
              if (wsPath) { activeWorkspace = wsPath; db.prepare('UPDATE workspaces SET last_accessed = ? WHERE path = ?').run(Date.now(), wsPath); actionResult = '📂 Opened: ' + wsPath; }
              else actionResult = '❌ Workspace not found: ' + arg;
            }
            else if (action === 'run') actionResult = await runCmd(arg, activeWorkspace);
            else if (action === 'read_file') {
              const r = readFile(arg);
              actionResult = r.error ? '\u274c ' + r.error : `\ud83d\udcc4 *${arg}* (${r.lines} lines)\n\`\`\`\n${r.content}\n\`\`\``;
            }
            else if (action === 'write_file') {
              // Content comes after the action tag in the AI response
              const writeMatch = ai.text.match(new RegExp(`\\[ACTION:write_file:${arg.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}\\]\\s*\`\`\`[\\w]*\\n([\\s\\S]*?)\`\`\``));
              if (writeMatch) {
                const r = writeFile(arg, writeMatch[1]);
                actionResult = r.error ? '\u274c ' + r.error : `\u2705 Written: ${r.path} (${r.bytes} bytes)`;
              } else { actionResult = '\u274c No code block found after write_file action'; }
            }
            else if (action === 'edit_file') {
              const parts = arg.split('>>>');
              if (parts.length === 2) {
                const [filePath, rest] = [parts[0].replace(/:$/, ''), ''];
                // Parse SEARCH>>>REPLACE from arg
                const editMatch = arg.match(/^(.+?):(.+?)>>>(.+)$/s);
                if (editMatch) {
                  const r = editFile(editMatch[1], editMatch[2], editMatch[3]);
                  actionResult = r.error ? '\u274c ' + r.error : `\u2705 Edited: ${r.path} (${r.replacements} replacements)`;
                } else { actionResult = '\u274c edit_file format: path:SEARCH>>>REPLACE'; }
              } else { actionResult = '\u274c edit_file format: path:SEARCH>>>REPLACE'; }
            }
            else if (action === 'screenshot') {
              const target = detectScreenTarget(arg || text);
              const photoPath = await captureVPSScreenshot(target);
              if (photoPath) { await sendTelegramPhoto(msg.chat.id, photoPath, `📸 ${target}`); }
            }
            else if (action === 'health_check') actionResult = await getHealthReport();
            if (actionResult) {
              const cleaned = formatResponse(typeof actionResult === 'object' ? JSON.stringify(actionResult) : actionResult);
              addMessage('telegram-out', cleaned, 'action:' + action);
              await sendTelegram(msg.chat.id, cleaned.substring(0, 4000));
            }
          } catch (e) { addLog('error', 'Action failed: ' + action + ' — ' + e.message); }
        }

        // Send quick-action buttons after each response
        await sendTelegramWithButtons(msg.chat.id, '⚡ _Quick actions:_', DEFAULT_BUTTONS);

        // 📸 Smart auto-screenshot: if response mentions visual topics
        if (shouldAutoScreenshot(ai.text, text)) {
          const target = detectScreenTarget(text + ' ' + ai.text);
          addLog('screenshot', 'Auto-capturing: ' + target);
          const photoPath = await captureVPSScreenshot(target);
          if (photoPath) {
            await sendTelegramPhoto(msg.chat.id, photoPath, `📸 Here's what it looks like (${target})`);
          }
        }
      }
    }
  } catch (e) {
    console.log('Poll error:', e.message);
  }
  setTimeout(pollTelegram, 1500);
}

// ═══════════════════════════════════════════════════════════════
// HTTP Server (password protected)
// ═══════════════════════════════════════════════════════════════
const HTML_RAW = fs.readFileSync('/opt/claw-gui.html', 'utf8');
const HTML_GZIPPED = zlib.gzipSync(Buffer.from(HTML_RAW, 'utf8'), { level: 9 });
const HTML_ETAG = '"' + crypto.createHash('md5').update(HTML_RAW).digest('hex') + '"';
const AUTH_PASSWORD = process.env.CLAW_PASSWORD || 'REDACTED_PASSWORD';
const AUTH_TOKEN = Buffer.from('vega:' + AUTH_PASSWORD).toString('base64');

// ═══════════════════════════════════════════════════════════════
// Performance: Gzip compression helper
// ═══════════════════════════════════════════════════════════════
function sendCompressed(req, res, statusCode, contentType, body) {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Connection': 'keep-alive',
  };
  // Only compress responses > 1KB (below that, overhead isn't worth it)
  if (acceptEncoding.includes('gzip') && bodyStr.length > 1024) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    const compressed = zlib.gzipSync(Buffer.from(bodyStr, 'utf8'), { level: 6 });
    headers['Content-Length'] = compressed.length;
    res.writeHead(statusCode, headers);
    res.end(compressed);
  } else {
    headers['Content-Length'] = Buffer.byteLength(bodyStr, 'utf8');
    res.writeHead(statusCode, headers);
    res.end(bodyStr);
  }
}

function sendJSON(req, res, statusCode, data) {
  sendCompressed(req, res, statusCode, 'application/json; charset=utf-8', JSON.stringify(data));
}

function checkAuth(req, res) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString();
    const [, pwd] = decoded.split(':');
    if (pwd === AUTH_PASSWORD || decoded === 'vega:' + AUTH_PASSWORD) return true;
  }
  // Check cookie auth too
  const cookies = (req.headers.cookie || '').split(';').map(c => c.trim());
  const authCookie = cookies.find(c => c.startsWith('claw_auth='));
  if (authCookie && authCookie.substring('claw_auth='.length) === AUTH_TOKEN) return true;
  
  return false;
}

const server = http.createServer(async (req, res) => {
  // Login endpoint (no auth needed)
  if (req.url === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        if (password === AUTH_PASSWORD) {
          res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Set-Cookie': `claw_auth=${AUTH_TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
          });
          return res.end(JSON.stringify({ ok: true }));
        }
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Wrong password' }));
      } catch { res.writeHead(400); res.end('Invalid'); }
    });
    return;
  }

  // All other routes require auth
  if (!checkAuth(req, res)) {
    // Serve a login page
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end([
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>VegaClaw</title>',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">',
        '<style>',
        '*{margin:0;padding:0;box-sizing:border-box}',
        'body{background:#08080d;color:#e0e0e0;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}',
        '.login{background:linear-gradient(145deg,#10101a,#14142a);border:1px solid #1e1e3a;border-radius:20px;padding:48px 40px;width:380px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5)}',
        '.icon{font-size:48px;margin-bottom:16px}',
        'h1{font-size:26px;font-weight:700;background:linear-gradient(135deg,#a78bfa,#6366f1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}',
        'p{color:#666;margin-bottom:28px;font-size:14px;letter-spacing:1px;text-transform:uppercase}',
        'input{width:100%;padding:14px 18px;background:#0d0d1a;border:1px solid #2a2a4a;border-radius:10px;color:#fff;font-size:15px;margin-bottom:18px;outline:none;transition:border .2s;font-family:Inter,system-ui}',
        'input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.15)}',
        'button{width:100%;padding:14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;color:#fff;font-size:15px;cursor:pointer;font-weight:600;transition:transform .1s,opacity .2s;font-family:Inter,system-ui}',
        'button:hover{opacity:0.9;transform:translateY(-1px)}button:active{transform:translateY(0)}',
        '.err{color:#f87171;margin-top:12px;display:none;font-size:13px}',
        '</style></head>',
        '<body><div class="login">',
        '<div class="icon">&#x1F980;</div>',
        '<h1>VegaClaw</h1>',
        '<p>Command Center</p>',
        '<input id="pwd" type="password" placeholder="Enter password" autofocus onkeydown="if(event.key===\'Enter\')login()">',
        '<button onclick="login()">Authenticate</button>',
        '<div class="err" id="err">Incorrect password</div>',
        '</div>',
        '<script>async function login(){const p=document.getElementById("pwd").value;const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p})});if(r.ok){location.reload()}else{document.getElementById("err").style.display="block"}}</script>',
        '</body></html>',
      ].join('\n'));
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  if (req.url === '/' || req.url === '/index.html') {
    // ETag: skip the body entirely if the browser already has it
    if (req.headers['if-none-match'] === HTML_ETAG) {
      res.writeHead(304);
      return res.end();
    }
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'ETag': HTML_ETAG,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Connection': 'keep-alive',
    };
    // Serve pre-gzipped HTML (compressed at startup, zero runtime cost)
    if (acceptEncoding.includes('gzip')) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      headers['Content-Length'] = HTML_GZIPPED.length;
      res.writeHead(200, headers);
      return res.end(HTML_GZIPPED);
    }
    headers['Content-Length'] = Buffer.byteLength(HTML_RAW, 'utf8');
    res.writeHead(200, headers);
    return res.end(HTML_RAW);
  }

  // ═══════════════════ Vision Agent API ═══════════════════
  if (req.url && req.url.startsWith('/api/vision')) {
    const jsonReply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    
    // POST /api/vision/task — Start an agentic task
    if (req.url === '/api/vision/task' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { task, maxSteps } = JSON.parse(body);
          if (!task) return jsonReply(400, { error: 'Provide a task' });
          // Run async, return immediately
          visionAgent.executeTask(task, maxSteps || 25).then(result => {
            console.log('[VisionAgent] Task complete:', JSON.stringify(result).substring(0, 200));
          });
          return jsonReply(200, { started: true, task });
        } catch (e) { return jsonReply(400, { error: e.message }); }
      });
      return;
    }

    // GET /api/vision/status — Get current agent status
    if (req.url === '/api/vision/status') {
      return jsonReply(200, visionAgent.status());
    }

    // POST /api/vision/stop — Stop current task
    if (req.url === '/api/vision/stop' && req.method === 'POST') {
      return jsonReply(200, visionAgent.stop());
    }

    // POST /api/vision/action — Execute a single action directly
    if (req.url === '/api/vision/action' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { action, params } = JSON.parse(body);
          const result = visionAgent.execAction(action, params || {});
          return jsonReply(200, result);
        } catch (e) { return jsonReply(400, { error: e.message }); }
      });
      return;
    }

    // GET /api/vision/screenshot — Take a screenshot and return as base64
    if (req.url === '/api/vision/screenshot') {
      try {
        const shot = visionActions.screenshot();
        return jsonReply(200, { file: shot.file, base64: shot.base64 });
      } catch (e) { return jsonReply(500, { error: e.message }); }
    }

    return jsonReply(404, { error: 'Unknown vision endpoint' });
  }

  // Persistent VPS Chat Sync (SQLite-backed)
  if (req.url === '/api/vps/history') {
    const vpsSource = `vps-${activeWorkspace || 'global'}`;
    
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { text, type, extra } = JSON.parse(body);
          if (text || extra) {
             const role = type === 'u' ? 'user' : (type === 's' ? 'system' : 'assistant');
             const fullText = (text || '') + (extra || '');
             db.prepare('INSERT INTO messages (source, role, content, model, timestamp) VALUES (?, ?, ?, ?, ?)').run(
               vpsSource, role, fullText, 'vps_log', Date.now()
             );
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400); res.end('Error');
        }
      });
      return;
    }
    
    // GET
    res.writeHead(200, { 'Content-Type': 'application/json' });
    try {
      const dbHits = db.prepare('SELECT id, role, content as text, thinking, model, timestamp FROM messages WHERE source = ? ORDER BY id DESC LIMIT 100').all(vpsSource).reverse();
      const mapped = dbHits.map(row => ({
        id: row.id,
        type: row.role === 'user' ? 'u' : (row.role === 'system' ? 's' : 'a'),
        text: row.text,
        thinking: row.thinking || null,
        model: row.model || null,
        timestamp: row.timestamp,
        extra: ''
      }));
      // Add standard init message seamlessly
      if (mapped.length === 0) mapped.push({ id: 0, text: 'VegaClaw v2 — 4-lane vision race engine active', type: 's', extra: '' });
      return res.end(JSON.stringify(mapped));
    } catch {
      return res.end(JSON.stringify([]));
    }
  }


  if (req.url === '/api/metrics') {
    const run = (cmd) => new Promise(r => exec(cmd, { timeout: 3000 }, (e, o) => r((o || '').trim())));
    const cpu = await run("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d. -f1");
    const ram = await run("free -m | awk '/Mem/{printf \"%d/%dMB (%.0f%%)\", $3, $2, ($3/$2)*100}'");
    const disk = await run("df -h / | awk 'NR==2{print $3\" / \"$2\" (\"$5\")\"}'");
    const uptime = await run("uptime -p");
    const load = await run("cat /proc/loadavg | awk '{print $1, $2, $3}'");
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ cpu: cpu + '%', ram, disk, uptime, load }));
  }

  if (req.url && req.url.startsWith('/api/messages')) {
    const url = new URL(req.url, 'http://localhost');
    const after = parseInt(url.searchParams.get('after') || '0');
    const newMsgs = stmtAfter.all(after);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ messages: newMsgs }));
  }

  // Mode switching
  if (req.url && req.url.startsWith('/api/mode')) {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { mode } = JSON.parse(body);
          if (CODING_MODES[mode]) {
            activeMode = mode;
            saveSession('activeMode', mode);
            if (mode === 'coder' && activeModel !== 'qwen') {
              activeModel = 'qwen'; saveSession('activeModel', 'qwen');
            }
            addLog('mode', 'GUI switched to: ' + CODING_MODES[mode].label);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, mode, label: CODING_MODES[mode].label }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unknown mode', available: Object.keys(CODING_MODES) }));
          }
        } catch { res.writeHead(400); res.end('Invalid JSON'); }
      });
      return;
    }
    // GET: list modes
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      active: activeMode, 
      modes: Object.entries(CODING_MODES).map(([k, v]) => ({ key: k, ...v, active: k === activeMode }))
    }));
  }

  // Session state
  if (req.url === '/api/session') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      model: activeModel,
      modelLabel: AVAILABLE_MODELS[activeModel]?.label,
      mode: activeMode,
      modeLabel: CODING_MODES[activeMode]?.label,
      workspace: activeWorkspace,
      confirmMode,
    }));
  }

  // Search messages
  if (req.url && req.url.startsWith('/api/search')) {
    const url = new URL(req.url, 'http://localhost');
    const q = url.searchParams.get('q') || '';
    const limit = parseInt(url.searchParams.get('limit') || '20');
    if (!q) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing ?q= parameter' }));
    }
    const results = searchMessages(q, limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ query: q, results, count: results.length }));
  }

  // DB stats
  if (req.url === '/api/stats') {
    const total = stmtCount.get();
    const lastId = stmtLastId.get();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      totalMessages: total.count,
      lastId: lastId.maxId,
      dbPath: DB_PATH,
      contextSize: chatHistory.length,
      coderRunning,
    }));
  }

  // ═══════════════════ Chat Management API ═══════════════════
  if (req.url && req.url.startsWith('/api/chat/')) {
    const chatAction = req.url.replace('/api/chat/', '').split('?')[0];

    // GET /api/chat/stats — Full chat statistics by source
    if (chatAction === 'stats' && req.method === 'GET') {
      const stats = getChatStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(stats));
    }

    // GET /api/chat/sync-status — Get messages that have been edited but not synced
    if (chatAction === 'sync-status') {
      const url = new URL(req.url, 'http://localhost');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const unsynced = getUnsyncedEdits(limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ pending: unsynced.length, messages: unsynced }));
    }

    // POST endpoints — parse body
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          let result;

          switch (chatAction) {
            case 'edit': {
              // PUT /api/chat/edit { id: number, content: string }
              if (!data.id || !data.content) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Provide id and content' }));
              }
              result = editMessage(data.id, data.content);
              break;
            }

            case 'delete': {
              // DISABLED: Messages are immutable
              result = { error: 'Message deletion is disabled. Use /api/chat/archive to hide messages instead.' };
              break;
            }

            case 'archive': {
              // POST /api/chat/archive { id: number } or { startId, endId } or { id, unarchive: true }
              if (data.unarchive && data.id) {
                result = unarchiveMessage(data.id);
              } else if (data.startId && data.endId) {
                result = archiveMessageRange(data.startId, data.endId);
              } else if (data.id) {
                result = archiveMessage(data.id);
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Provide id, or startId+endId for range archive' }));
              }
              break;
            }

            case 'label': {
              // POST /api/chat/label { id, taskId?, workspaceId?, projectId?, labels? }
              // POST /api/chat/label { startId, endId, taskId?, workspaceId?, projectId?, labels? }
              if (data.startId && data.endId) {
                result = labelMessageRange(data.startId, data.endId, {
                  taskId: data.taskId, workspaceId: data.workspaceId,
                  projectId: data.projectId, labels: data.labels,
                });
              } else if (data.id) {
                result = labelMessage(data.id, {
                  taskId: data.taskId, workspaceId: data.workspaceId,
                  projectId: data.projectId, labels: data.labels,
                });
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Provide id (or startId+endId) and at least one label field (taskId, workspaceId, projectId, labels)' }));
              }
              break;
            }

            case 'context': {
              // POST /api/chat/context { taskId?, workspaceId?, projectId?, label?, includeArchived?, limit? }
              result = getMessagesByContext(data);
              break;
            }

            case 'contexts': {
              // POST /api/chat/contexts — list all known tasks/workspaces/projects
              result = listContexts();
              break;
            }

            case 'merge': {
              // POST /api/chat/merge { ids: number[], content?: string }
              if (!data.ids || !Array.isArray(data.ids)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Provide ids array (at least 2)' }));
              }
              result = mergeMessages(data.ids, data.content);
              break;
            }

            case 'dedup': {
              // POST /api/chat/dedup { windowMs?: number, dryRun?: boolean }
              result = dedupMessages(data.windowMs || 60000, data.dryRun !== false);
              break;
            }

            case 'purge-tests': {
              // POST /api/chat/purge-tests — DISABLED (no deletion)
              result = { error: 'Purge is disabled. Messages are immutable. Use /api/chat/archive instead.' };
              break;
            }

            case 'mark-synced': {
              // POST /api/chat/mark-synced { id: number }
              if (!data.id) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Provide message id' }));
              }
              result = markMessageSynced(data.id);
              break;
            }

            default:
              res.writeHead(404, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                error: `Unknown chat action: ${chatAction}`,
                available: ['edit', 'archive', 'label', 'context', 'contexts', 'merge', 'dedup', 'mark-synced', 'sync-status', 'stats'],
              }));
          }

          const status = result.error ? 400 : 200;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  // Logs
  if (req.url && req.url.startsWith('/api/logs')) {
    const url = new URL(req.url, 'http://localhost');
    const after = parseInt(url.searchParams.get('after') || '0');
    const filtered = logBuffer.filter(l => l.ts > after);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ logs: filtered }));
  }

  if (req.url === '/api/exec' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { command } = JSON.parse(body);
        exec(command, { timeout: 15000, shell: '/bin/bash', maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ output: ((stdout || '') + (stderr || '')).substring(0, 4000) || '(no output)' }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ output: 'Error: ' + e.message }));
      }
    });
    return;
  }

  // Handle direct VPS input events (mouse / keyboard) via xdotool
  // SECURITY: All inputs are sanitized to prevent command injection
  if (req.url === '/api/vps/input' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) { req.destroy(); } });
    req.on('end', () => {
      try {
        const { type, x, y, button, key } = JSON.parse(body);
        let cmd = '';
        if (type === 'click') {
          // Sanitize: x, y, button MUST be finite integers
          const sx = Math.round(Number(x) || 0);
          const sy = Math.round(Number(y) || 0);
          const sb = [1, 2, 3].includes(Number(button)) ? Number(button) : 1;
          if (sx < 0 || sx > 10000 || sy < 0 || sy > 10000) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Coordinates out of range (0-10000)' }));
          }
          cmd = `export DISPLAY=:1 && xdotool mousemove ${sx} ${sy} click ${sb}`;
        } else if (type === 'key') {
          // WHITELIST: Only known xdotool key names are allowed
          const KEY_MAP = {
            'Enter': 'Return', 'Backspace': 'BackSpace', 'Delete': 'Delete',
            'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
            'Escape': 'Escape', 'Control': 'Control_L', 'Shift': 'Shift_L', 'Alt': 'Alt_L',
            'Tab': 'Tab', 'Home': 'Home', 'End': 'End', 'PageUp': 'Prior', 'PageDown': 'Next',
            'Insert': 'Insert', 'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
            'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8', 'F9': 'F9',
            'F10': 'F10', 'F11': 'F11', 'F12': 'F12', ' ': 'space',
          };
          let mappedKey = KEY_MAP[key];
          if (!mappedKey && typeof key === 'string' && key.length === 1 && /^[a-zA-Z0-9`~!@#$%^&*()\-_=+\[\]{}\\|;:'",.<>/?]$/.test(key)) {
            mappedKey = key; // single printable character
          }
          if (!mappedKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid key: ' + String(key).substring(0, 20) }));
          }
          // Defense-in-depth: strip any shell metacharacters from the mapped key
          mappedKey = mappedKey.replace(/[;&|`$(){}]/g, '');
          cmd = `export DISPLAY=:1 && xdotool key --clearmodifiers "${mappedKey}"`;
        }

        if (cmd) {
          exec(cmd, { timeout: 2000, shell: '/bin/bash' }); // Fire and forget
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid input type. Use click or key.' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.url === '/api/stream') {
    const vReq = require('http').request({ hostname: '127.0.0.1', port: 4282, path: '/stream', timeout: 30000 }, vRes => {
      res.writeHead(200, {
        'Content-Type': vRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache, private',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache'
      });
      vRes.pipe(res);
    });
    vReq.on('error', () => res.end());
    req.on('close', () => { vReq.destroy(); });
    vReq.end();
    return;
  }

  if (req.url === '/api/chat/history') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    let history = [], sysHistory = [];
    try {
      const vpsSource = `vps-${activeWorkspace || 'global'}`;
      history = db.prepare('SELECT id, source, role, content as message, model, timestamp FROM messages WHERE source IN (?, ?, ?, ?, ?) ORDER BY id DESC LIMIT 100').all('telegram-in', 'gui-in', 'telegram-out', 'gui-out', vpsSource).reverse();
      sysHistory = db.prepare('SELECT id, source, role, content as message, model, timestamp FROM messages WHERE role=? ORDER BY id DESC LIMIT 20').all('system').reverse();
    } catch (e) { console.log(e.message) }
    res.end(JSON.stringify({ chat: history, system: sysHistory }));
    return;
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);

        const intent = detectIntent(message);
        if (intent === 'start_coder') {
          coderRunning = true;
          addMessage('sys', 'Agentic Coder started from GUI');
          sendTelegram(AUTHORIZED_ID, '🤖 Agentic Coder *started* from Command Center').catch(() => {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ response: '✅ Agentic Coder started! Send me a coding task.', model: 'system' }));
        }
        if (intent === 'stop_coder') {
          coderRunning = false;
          addMessage('sys', 'Agentic Coder stopped from GUI');
          sendTelegram(AUTHORIZED_ID, '⏹ Agentic Coder *stopped* from Command Center').catch(() => {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ response: '⏹ Agentic Coder stopped.', model: 'system' }));
        }

        if (message.startsWith('$')) {
          const cmd = message.substring(1).trim();
          const output = await new Promise(r => exec(cmd, { timeout: 15000, shell: '/bin/bash', maxBuffer: 1024 * 1024 }, (e, o, se) => r(((o || '') + (se || '')).substring(0, 4000))));
          addMessage('gui-out', output, 'bash');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response: output, model: 'bash' }));
          sendTelegram(AUTHORIZED_ID, '🖥️ `$ ' + cmd + '`\n```\n' + output.substring(0, 2000) + '\n```').catch(() => {});
          return;
        }

        const ai = await chatOllama(message);
        addMessage('gui-out', ai.text, ai.model);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ response: ai.text, model: ai.model }));
        sendTelegram(AUTHORIZED_ID, '🖥️ *GUI*: ' + message.substring(0, 100) + '\n\n' + ai.text.substring(0, 3000)).catch(() => {});

      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ response: 'Error: ' + e.message }));
      }
    });
    return;
  }

  if (req.url === '/api/coder' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { action } = JSON.parse(body);
        coderRunning = action === 'start';
        addMessage('sys', `Agentic Coder ${coderRunning ? 'started' : 'stopped'} from Command Center`);
        sendTelegram(AUTHORIZED_ID, `${coderRunning ? '🤖' : '⏹'} Agentic Coder *${coderRunning ? 'started' : 'stopped'}* from Command Center`).catch(() => {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ running: coderRunning }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ running: coderRunning }));
      }
    });
    return;
  }
  // ═══════════════════ Vision Agent API ═══════════════════
  if (req.url && req.url.startsWith('/api/vision')) {
    const jsonReply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };

    if (req.url === '/api/vision/task' && req.method === 'POST') {
      let body = ''; req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { task, maxSteps } = JSON.parse(body);
          visionAgent.executeTask(task, maxSteps || 25).then(r => {
            console.log('[Vision] Task done:', r.success, r.summary || r.reason || '');
          });
          jsonReply(200, { started: true, task });
        } catch (e) { jsonReply(400, { error: e.message }); }
      });
      return;
    }
    if (req.url === '/api/vision/status') { jsonReply(200, visionAgent.status()); return; }
    if (req.url === '/api/vision/stop' && req.method === 'POST') { jsonReply(200, visionAgent.stop()); return; }

    if (req.url === '/api/vision/action' && req.method === 'POST') {
      let body = ''; req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { action, params } = JSON.parse(body);
          const result = visionAgent.execAction(action, params || {});
          jsonReply(200, result);
        } catch (e) { jsonReply(400, { error: e.message }); }
      });
      return;
    }

    if (req.url === '/api/vision/screenshot') {
      try {
        const s = visionActions.screenshot();
        jsonReply(200, { file: s.file, base64: s.base64 });
      } catch (e) { jsonReply(500, { error: e.message }); }
      return;
    }

    // Proxy to Python vision worker for /api/vision/analyze
    if (req.url === '/api/vision/analyze') {
      const vReq = require('http').request({ hostname: '127.0.0.1', port: 4281, path: '/analyze',
        method: req.method === 'POST' ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' }, timeout: 30000 }, vRes => {
        let d = ''; vRes.on('data', c => d += c);
        vRes.on('end', () => { try { jsonReply(200, JSON.parse(d)); } catch { jsonReply(200, { raw: d }); } });
      });
      vReq.on('error', () => jsonReply(503, { error: 'Vision worker offline' }));
      vReq.on('timeout', () => { vReq.destroy(); jsonReply(504, { error: 'Vision worker timeout' }); });
      if (req.method === 'POST') { let b = ''; req.on('data', c => b += c); req.on('end', () => { vReq.write(b); vReq.end(); }); }
      else { vReq.end(); }
      return;
    }

    jsonReply(404, { error: 'Unknown vision endpoint' });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ═══════════════════════════════════════════════════════════════
// Startup
// ═══════════════════════════════════════════════════════════════
server.keepAliveTimeout = 120000;  // 120s keep-alive (industry standard: Cloudflare=100s, AWS ALB=60s)
server.headersTimeout = 125000;    // Must be > keepAliveTimeout
server.maxRequestsPerSocket = 1000; // Allow 1000 requests per socket (HTTP/1.1 pipelining)
server.timeout = 300000;           // 5min request timeout (for long AI/vision requests)

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`🦀 The Claw Command Center v8 — http://localhost:${PORT}`);
  
  // 1. Load conversation context from SQLite DB
  loadHistoryFromDb();
  
  // 2. Flush old Telegram updates to prevent duplicates
  await flushOldUpdates();
  
  // 3. Start polling (clean)
  console.log('📱 Telegram bot polling started (SQLite-backed)');
  pollTelegram();
  
  const total = stmtCount.get();
  sendTelegram(AUTHORIZED_ID, `🦀 *The Claw v8 is online!*\n🗄️ SQLite memory: ${total.count} messages stored\n🔍 Full-text search enabled`).catch(() => {});
});

// Graceful shutdown
process.on('SIGTERM', () => { db.close(); process.exit(0); });
process.on('SIGINT', () => { db.close(); process.exit(0); });
