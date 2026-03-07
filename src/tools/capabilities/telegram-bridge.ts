/**
 * VegaMCP — Telegram AI Bridge for The Claw
 * 
 * Control your entire fleet from Telegram:
 *   "What's happening on the Linux VPS?"
 *   "Take a screenshot of VPS-2"
 *   "Run a benchmark on the server"
 *   "Open VS Code on the VPS and create a new project"
 * 
 * Setup:
 *   1. Message @BotFather on Telegram → /newbot
 *   2. Set TELEGRAM_BOT_TOKEN in .env
 *   3. Set TELEGRAM_AUTHORIZED_ID in .env (your numeric Telegram user ID)
 *   4. Run: npx tsx src/tools/capabilities/telegram-bridge.ts
 */

import { config } from 'dotenv';
config();

import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { AdaptiveRouter } from './adaptive-router.js';

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const AUTHORIZED_ID = process.env.TELEGRAM_AUTHORIZED_ID || '';
const BRIDGE_URL = 'http://127.0.0.1:42019';
const LOG_DIR = path.join(os.homedir(), '.claw-memory');
const LOG_FILE = path.join(LOG_DIR, 'telegram-bridge.log');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ═══════════════════════════════════════════════════════════════
// Conversation Memory
// ═══════════════════════════════════════════════════════════════

interface Message { role: 'user' | 'assistant' | 'system'; content: string; }

const conversations = new Map<string, Message[]>();
const MAX_HISTORY = 40;

function getHistory(chatId: string): Message[] {
  if (!conversations.has(chatId)) conversations.set(chatId, []);
  return conversations.get(chatId)!;
}

function addToHistory(chatId: string, role: 'user' | 'assistant', content: string) {
  const h = getHistory(chatId);
  h.push({ role, content });
  if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
}

// ═══════════════════════════════════════════════════════════════
// System Prompt — The Claw's brain
// ═══════════════════════════════════════════════════════════════

async function buildSystemPrompt(): Promise<string> {
  let fleetContext = 'Fleet status unknown.';
  let memoryContext = '';

  try {
    const resp = await fetch(`${BRIDGE_URL}/status`, { signal: AbortSignal.timeout(3000) });
    const status = await resp.json() as any;
    if (status.fleet?.length > 0) {
      fleetContext = `Connected agents:\n${status.fleet.map((a: any) =>
        `• ${a.name} (${a.id}) — ${a.status} | IDE: ${a.ide} | Model: ${a.model}`
      ).join('\n')}`;
    }
  } catch { /* offline */ }

  try {
    const resp = await fetch(`${BRIDGE_URL}/memory`, { signal: AbortSignal.timeout(3000) });
    const data = await resp.json() as any;
    if (data.projects?.length > 0) memoryContext = `\nKnown projects: ${data.projects.join(', ')}`;
  } catch { /* none */ }

  return `You are The Claw — a powerful AI orchestrator that controls a fleet of computers through Telegram.

PERSONALITY:
- Sharp, friendly, competent. Like a brilliant DevOps engineer who's always online.
- Use Telegram markdown: *bold*, _italic_, \`code\`, \`\`\`code blocks\`\`\`
- Keep messages concise but informative. Use bullet points and emoji.
- Be proactive and suggest actions.

YOUR FLEET:
${fleetContext}${memoryContext}

VPS-2 CAPABILITIES (Linux Powerhouse):
- 12-core CPU, 24GB RAM, 695GB NVMe
- Ollama running llama3 + qwen2.5-coder locally
- Full desktop via VNC (XFCE)
- VS Code, Antigravity IDE, Chrome, Firefox installed
- Python, Node.js, Rust, Go, Java, .NET
- PyTorch, Jupyter, aider, open-interpreter
- Metasploit, Terraform, Ansible

ACTIONS — Include <action>...</action> tags to execute:

Fleet Control:
  <action>{"action": "look", "agent_id": "vps-2"}</action> — Screenshot
  <action>{"action": "prompt", "agent_id": "vps-2", "prompt_text": "..."}</action> — Send command
  <action>{"action": "click", "agent_id": "vps-2", "x": 100, "y": 200}</action> — Click
  <action>{"action": "type_text", "agent_id": "vps-2", "text": "..."}</action> — Type
  <action>{"action": "send_key", "agent_id": "vps-2", "key_name": "enter"}</action> — Keypress
  <action>{"action": "exec_ssh", "agent_id": "vps-2", "command": "..."}</action> — Run shell command

Memory:
  <action>{"action": "memory_record", "project": "...", "type": "idea", "title": "...", "content": "..."}</action>
  <action>{"action": "memory_recall", "project": "...", "query": "..."}</action>
  <action>{"action": "memory_brainstorm", "project": "...", "topic": "..."}</action>

Logs:
  <action>{"action": "get_logs", "limit": 20}</action>

RULES:
- When asked about the VPS, take a screenshot or run a command first.
- NEVER show raw JSON to the user.
- Chain multiple actions when needed.
- Time: ${new Date().toLocaleString()}`;
}

// ═══════════════════════════════════════════════════════════════
// Action Executor
// ═══════════════════════════════════════════════════════════════

async function executeActions(response: string): Promise<{ clean: string; results: any[] }> {
  const regex = /<action>([\s\S]*?)<\/action>/g;
  const results: any[] = [];
  let match;

  while ((match = regex.exec(response)) !== null) {
    try {
      const action = JSON.parse(match[1].trim());
      log(`⚡ Action: ${action.action}`);

      // Special: exec_ssh runs directly over SSH
      if (action.action === 'exec_ssh') {
        const { Client } = await import('ssh2');
        const result = await new Promise<string>((resolve) => {
          const conn = new Client();
          conn.on('ready', () => {
            conn.exec(action.command, { pty: true }, (err: any, stream: any) => {
              if (err) { resolve(`Error: ${err.message}`); conn.end(); return; }
              let out = '';
              stream.on('data', (d: Buffer) => out += d.toString());
              stream.on('close', () => { resolve(out.substring(0, 2000)); conn.end(); });
              setTimeout(() => { resolve(out.substring(0, 2000) + '\n(timeout)'); conn.end(); }, 10000);
            });
          }).on('error', (e: any) => resolve(`SSH Error: ${e.message}`))
            .connect({
              host: process.env.VEGAMCP_VPS_2_HOST || 'REDACTED_IP',
              port: 22,
              username: process.env.VEGAMCP_VPS_2_USERNAME || 'root',
              password: process.env.VEGAMCP_VPS_2_PASSWORD || '',
            });
        });
        results.push({ action: 'exec_ssh', result });
        continue;
      }

      // Standard gateway actions
      const resp = await fetch(`${BRIDGE_URL}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
        signal: AbortSignal.timeout(15000),
      });
      results.push({ action: action.action, result: await resp.json() });
    } catch (err: any) {
      results.push({ action: 'error', error: err.message });
      log(`❌ ${err.message}`);
    }
  }

  return { clean: response.replace(/<action>[\s\S]*?<\/action>/g, '').trim(), results };
}

// ═══════════════════════════════════════════════════════════════
// LLM Chat
// ═══════════════════════════════════════════════════════════════

async function chat(messages: Message[]): Promise<string> {
  const sys = messages.find(m => m.role === 'system');
  const rest = messages.filter(m => m.role !== 'system');
  const prompt = rest.map(m => `[${m.role}]: ${m.content}`).join('\n\n');

  try {
    let fleetNodes: any[] = [];
    try {
      const r = await fetch(`${BRIDGE_URL}/status`, { signal: AbortSignal.timeout(3000) });
      const s = await r.json() as any;
      fleetNodes = (s.fleet || []).map((a: any) => ({
        id: a.id, name: a.name, ollamaUrl: `http://${a.host || 'localhost'}:11434`,
      }));
    } catch { }

    const result = await AdaptiveRouter.chat(
      sys?.content || 'You are The Claw.',
      prompt, 'conversation', fleetNodes
    );
    log(`🧠 Model: ${result.model} | Node: ${result.node}`);
    return result.text || '';
  } catch (err: any) {
    log(`⚠️ LLM failed: ${err.message}`);
  }

  return "I can't reach any AI models right now. Check Ollama or your API keys! 🛠️";
}

// ═══════════════════════════════════════════════════════════════
// Message Handler
// ═══════════════════════════════════════════════════════════════

async function handleMessage(chatId: string, text: string): Promise<string> {
  addToHistory(chatId, 'user', text);

  const systemPrompt = await buildSystemPrompt();
  const full: Message[] = [
    { role: 'system', content: systemPrompt },
    ...getHistory(chatId),
  ];

  const aiResponse = await chat(full);
  const { clean, results } = await executeActions(aiResponse);

  let final = clean;
  if (results.length > 0) {
    const ctx = results.map(r =>
      `Action "${r.action}": ${JSON.stringify(r.result || r.error).substring(0, 500)}`
    ).join('\n');

    addToHistory(chatId, 'assistant', clean);
    const h = getHistory(chatId);
    h.push({ role: 'system', content: `[ACTION RESULTS — summarize naturally]\n${ctx}` });

    const summary = await chat([{ role: 'system', content: systemPrompt }, ...h]);
    final = clean + (summary ? '\n\n' + summary.replace(/<action>[\s\S]*?<\/action>/g, '').trim() : '');

    const idx = h.findIndex(m => m.content.includes('[ACTION RESULTS'));
    if (idx !== -1) h.splice(idx, 1);
  }

  addToHistory(chatId, 'assistant', final);

  // Telegram 4096 char limit
  if (final.length > 4000) {
    final = final.substring(0, 3950) + '\n\n_... (trimmed)_';
  }

  return final || "Processing... try again in a sec 🤔";
}

// ═══════════════════════════════════════════════════════════════
// Telegram Bot
// ═══════════════════════════════════════════════════════════════

async function startTelegramBridge() {
  if (!BOT_TOKEN) {
    console.error(`
╔══════════════════════════════════════════════════════════╗
║  Telegram Bridge — Setup Required                         ║
╠══════════════════════════════════════════════════════════╣
║                                                           ║
║  1. Open Telegram and message @BotFather                  ║
║  2. Send /newbot and follow the prompts                   ║
║  3. Copy the token and add to your .env:                  ║
║                                                           ║
║     TELEGRAM_BOT_TOKEN=your_token_here                    ║
║     TELEGRAM_AUTHORIZED_ID=your_user_id                   ║
║                                                           ║
║  To find your user ID, message @userinfobot               ║
║                                                           ║
╚══════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  const bot = new TelegramBot(BOT_TOKEN, { polling: true });
  log('🤖 The Claw Telegram Bridge is starting...');

  const me = await bot.getMe();
  log(`✅ Connected as @${me.username}`);

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id.toString();
    bot.sendMessage(chatId, `🦀 *The Claw is online!*\n\nI'm your AI orchestrator. I can:\n• Control your Linux VPS remotely\n• Run shell commands\n• Take screenshots\n• Write and test code\n• Brainstorm ideas\n\nJust talk to me naturally!\n\n_Your Chat ID: ${chatId}_`, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id.toString();
    try {
      const resp = await fetch(`${BRIDGE_URL}/status`, { signal: AbortSignal.timeout(3000) });
      const data = await resp.json() as any;
      const txt = data.fleet?.map((a: any) => `• *${a.name}* — ${a.status}`).join('\n') || 'No agents connected';
      bot.sendMessage(chatId, `🖥️ *Fleet Status*\n\n${txt}`, { parse_mode: 'Markdown' });
    } catch {
      bot.sendMessage(chatId, '⚠️ Bridge offline. Fleet status unavailable.');
    }
  });

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id.toString();
    const userId = msg.from?.id?.toString() || '';

    // Security gate
    if (AUTHORIZED_ID && userId !== AUTHORIZED_ID) {
      log(`🚫 Blocked: ${userId} (${msg.from?.username})`);
      bot.sendMessage(chatId, '🔒 Unauthorized. Contact the admin.');
      return;
    }

    log(`📩 ${msg.from?.username}: ${msg.text}`);
    
    // Show typing indicator
    bot.sendChatAction(chatId, 'typing');

    try {
      const response = await handleMessage(chatId, msg.text);
      log(`📤 Response (${response.length} chars)`);
      
      // Try markdown first, fall back to plain text
      try {
        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      } catch {
        await bot.sendMessage(chatId, response);
      }
    } catch (err: any) {
      log(`❌ Error: ${err.message}`);
      bot.sendMessage(chatId, `Something broke — ${err.message} 🛠️`);
    }
  });

  log('🦀 The Claw Telegram Bridge is live!');
}

// ═══════════════════════════════════════════════════════════════
// Launch
// ═══════════════════════════════════════════════════════════════

startTelegramBridge().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
