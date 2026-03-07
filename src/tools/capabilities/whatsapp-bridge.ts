/**
 * VegaMCP — WhatsApp Conversational AI Bridge
 * 
 * A fully conversational AI assistant in WhatsApp that understands
 * natural language and controls The Claw fleet autonomously.
 * 
 * NOT a command parser — this is a real AI conversation.
 * You talk to it like a person, it figures out what to do.
 * 
 * Examples:
 *   "Hey, what's happening on my VPS right now?"
 *   "Can you brainstorm some ideas for the trading bot?"
 *   "Switch the model on VPS-1 to GPT-4o and run a benchmark"
 *   "What did we decide about the database last week?"
 *   "Open the file explorer on my desktop machine"
 * 
 * Security:
 *   - Only responds to WHATSAPP_AUTHORIZED_NUMBER
 *   - Auth session stored locally
 *   - Conversation history kept in memory (not persisted to disk)
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { AdaptiveRouter } from './adaptive-router.js';

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const BRIDGE_URL = 'http://127.0.0.1:42019';
const AUTH_DIR = path.join(os.homedir(), '.claw-memory', 'whatsapp-auth');
const AUTHORIZED_NUMBER = process.env.WHATSAPP_AUTHORIZED_NUMBER || '';
const LOG_FILE = path.join(os.homedir(), '.claw-memory', 'whatsapp-bridge.log');

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ═══════════════════════════════════════════════════════════════
// Conversation Memory (per-user, in-memory)
// ═══════════════════════════════════════════════════════════════

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const conversations = new Map<string, ConversationMessage[]>();
const MAX_HISTORY = 30; // Keep last 30 messages for context

function getHistory(sender: string): ConversationMessage[] {
  if (!conversations.has(sender)) {
    conversations.set(sender, []);
  }
  return conversations.get(sender)!;
}

function addToHistory(sender: string, role: 'user' | 'assistant', content: string) {
  const history = getHistory(sender);
  history.push({ role, content });
  // Trim to keep context window manageable
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

// ═══════════════════════════════════════════════════════════════
// The Claw System Prompt — Defines the AI's personality & powers
// ═══════════════════════════════════════════════════════════════

async function buildSystemPrompt(): Promise<string> {
  // Fetch live fleet status for context
  let fleetContext = 'Fleet status unknown (bridge may be offline).';
  let memoryContext = 'No project memories loaded yet.';
  
  try {
    const statusResp = await fetch(`${BRIDGE_URL}/status`);
    const status = await statusResp.json() as any;
    if (status.fleet?.length > 0) {
      fleetContext = `Connected agents:\n${status.fleet.map((a: any) => 
        `- ${a.name} (${a.id}) — Status: ${a.status}, IDE: ${a.ide}, Model: ${a.model}`
      ).join('\n')}`;
    } else {
      fleetContext = 'No agents currently connected to the fleet.';
    }
  } catch { /* bridge offline */ }

  try {
    const memResp = await fetch(`${BRIDGE_URL}/memory`);
    const memData = await memResp.json() as any;
    if (memData.projects?.length > 0) {
      memoryContext = `Known projects: ${memData.projects.join(', ')}`;
    }
  } catch { /* no memory data */ }

  return `You are The Claw — a brilliant, friendly AI assistant that controls a fleet of computers and development environments. You speak through WhatsApp.

PERSONALITY:
- Warm, witty, and competent. Like a trusted tech co-founder who's always online.
- Never robotic or formal. Use casual language, occasional emoji, but stay sharp.
- Be proactive — suggest things the user might not have thought of.
- Keep responses concise for WhatsApp (no walls of text). Use line breaks and bold (*text*) for readability.
- If something fails, be honest and suggest alternatives.

YOUR CAPABILITIES:
You can perform ANY of these actions by including a JSON action block in your response.
When you want to execute an action, include it wrapped in <action>...</action> tags.
You can include MULTIPLE actions in one response. The system will execute them and you'll see results.

Available actions:
1. *Fleet Control*
   <action>{"action": "look", "agent_id": "..."}</action> — Take a screenshot of what an agent sees
   <action>{"action": "prompt", "agent_id": "...", "prompt_text": "..."}</action> — Send a command to an agent
   <action>{"action": "click", "agent_id": "...", "x": 100, "y": 200}</action> — Click on screen
   <action>{"action": "type_text", "agent_id": "...", "text": "..."}</action> — Type text
   <action>{"action": "switch_model", "agent_id": "...", "model_name": "..."}</action> — Switch AI model
   <action>{"action": "ide_action", "agent_id": "...", "actionName": "toggle_terminal"}</action> — IDE control
   <action>{"action": "register", "agent_id": "...", "agent_name": "...", "ide": "cursor"}</action> — Register new agent

2. *Memory & Ideas*
   <action>{"action": "memory_record", "project": "...", "type": "milestone|decision|bug|idea|insight", "title": "...", "content": "...", "tags": [...]}</action>
   <action>{"action": "memory_recall", "project": "...", "query": "..."}</action>
   <action>{"action": "memory_brainstorm", "project": "...", "topic": "..."}</action>
   <action>{"action": "memory_cross_pollinate", "project": "...", "topic": "..."}</action>
   <action>{"action": "memory_context", "project": "..."}</action>
   <action>{"action": "memory_list_projects"}</action>
   <action>{"action": "memory_cross_search", "query": "..."}</action>

3. *Observability*
   <action>{"action": "get_logs", "limit": 20}</action>
   <action>{"action": "reflect", "query": "..."}</action>

CURRENT STATE:
${fleetContext}
${memoryContext}
Time: ${new Date().toLocaleString()}

RULES:
- If the user asks about their fleet/machines, check status or take a screenshot first.
- If they want to remember something, save it to memory immediately.
- If they ask "what have we been working on", pull project context.
- If they want ideas, run a brainstorm. If they mention other projects, use cross-pollination.
- When executing actions, briefly explain what you're doing in natural language.
- If the bridge is offline, tell the user conversationally and suggest they check the server.
- NEVER expose raw JSON to the user. Always speak naturally.
- You can chain multiple actions in one response when it makes sense.`;
}

// ═══════════════════════════════════════════════════════════════
// Action Executor — Extracts and runs <action> blocks
// ═══════════════════════════════════════════════════════════════

async function executeActions(aiResponse: string): Promise<{ cleanText: string; results: any[] }> {
  const actionRegex = /<action>([\s\S]*?)<\/action>/g;
  const results: any[] = [];
  let match;

  while ((match = actionRegex.exec(aiResponse)) !== null) {
    try {
      const actionData = JSON.parse(match[1].trim());
      log(`⚡ Executing action: ${actionData.action}`);
      
      const resp = await fetch(`${BRIDGE_URL}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionData),
      });
      const result = await resp.json();
      results.push({ action: actionData.action, result });
      log(`✅ Action result: ${JSON.stringify(result).substring(0, 200)}`);
    } catch (err: any) {
      results.push({ action: 'error', error: err.message });
      log(`❌ Action failed: ${err.message}`);
    }
  }

  // Remove action tags from the response text the user sees
  const cleanText = aiResponse.replace(/<action>[\s\S]*?<\/action>/g, '').trim();
  return { cleanText, results };
}

// ═════════════════════════════════════════════════════════════════
// LLM Caller — Uses Adaptive Router for fleet-aware model selection
// ═════════════════════════════════════════════════════════════════

async function chat(messages: ConversationMessage[]): Promise<string> {
  // Extract system prompt and user messages
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs = messages.filter(m => m.role !== 'system');
  const systemPrompt = systemMsg?.content || 'You are The Claw, an AI assistant.';
  const userPrompt = userMsgs.map(m => `[${m.role}]: ${m.content}`).join('\n\n');

  try {
    // Fetch fleet nodes for adaptive routing
    let fleetNodes: { id: string; name: string; ollamaUrl: string }[] = [];
    try {
      const statusResp = await fetch(`${BRIDGE_URL}/status`, { signal: AbortSignal.timeout(3000) });
      const status = await statusResp.json() as any;
      fleetNodes = (status.fleet || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        ollamaUrl: `http://${a.host || 'localhost'}:11434`,
      }));
    } catch { /* no fleet data */ }

    // AdaptiveRouter probes all nodes, picks the best model, and calls it
    const result = await AdaptiveRouter.chat(systemPrompt, userPrompt, 'conversation', fleetNodes);
    log(`🧠 Model used: ${result.model} | Node: ${result.node} | Reason: ${result.reason}`);
    
    if (result.text) return result.text;
  } catch (err: any) {
    log(`⚠️ Adaptive routing failed: ${err.message}`);
  }

  return "Hey, I can't reach any AI models right now. Make sure Ollama is running locally, or set DEEPSEEK_API_KEY in your .env. I'll be here when you're back! 🦀";
}

// ═══════════════════════════════════════════════════════════════
// Main Conversation Handler
// ═══════════════════════════════════════════════════════════════

async function handleConversation(sender: string, userText: string): Promise<string> {
  // Add user message to history
  addToHistory(sender, 'user', userText);

  // Build system prompt with live context
  const systemPrompt = await buildSystemPrompt();
  
  // Assemble full conversation for the LLM
  const fullConversation: ConversationMessage[] = [
    { role: 'system', content: systemPrompt },
    ...getHistory(sender),
  ];

  // Get AI response
  const aiResponse = await chat(fullConversation);

  // Execute any embedded actions
  const { cleanText, results } = await executeActions(aiResponse);

  // If actions returned results, do a follow-up to summarize naturally
  let finalResponse = cleanText;
  if (results.length > 0) {
    // Add action results context and ask AI to summarize
    const resultsContext = results.map(r => 
      `Action "${r.action}" result: ${JSON.stringify(r.result || r.error).substring(0, 300)}`
    ).join('\n');

    addToHistory(sender, 'assistant', cleanText);
    
    // Inject action results as system context (direct push, not via addToHistory type constraint)
    const history = getHistory(sender);
    history.push({ role: 'system', content: `[ACTION RESULTS — summarize these naturally for the user, don't show raw data]\n${resultsContext}` });

    const followUp: ConversationMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    const summary = await chat(followUp);
    
    // Clean any stray action tags from follow-up
    finalResponse = cleanText + (summary ? '\n\n' + summary.replace(/<action>[\s\S]*?<\/action>/g, '').trim() : '');
    
    // Remove the system results message from history (internal only)
    const sysIdx = history.findIndex(m => m.role === 'system' && m.content.includes('[ACTION RESULTS'));
    if (sysIdx !== -1) history.splice(sysIdx, 1);
  }

  // Save assistant response to history
  addToHistory(sender, 'assistant', finalResponse);

  // Trim for WhatsApp (4096 char limit per message)
  if (finalResponse.length > 4000) {
    finalResponse = finalResponse.substring(0, 3950) + '\n\n_... (message trimmed)_';
  }

  return finalResponse || "I'm thinking... give me a sec and try again 🤔";
}

// ═══════════════════════════════════════════════════════════════
// WhatsApp Connection
// ═══════════════════════════════════════════════════════════════

async function startWhatsAppBridge() {
  log('🦀 Starting The Claw WhatsApp AI Bridge...');

  if (!AUTHORIZED_NUMBER) {
    log('⚠️  WARNING: No WHATSAPP_AUTHORIZED_NUMBER set. Set it in .env for security!');
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    browser: ['The Claw', 'Desktop', '1.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      log('📱 QR Code displayed — scan with WhatsApp to connect The Claw');
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        log(`Connection lost (${reason}). Reconnecting in 5s...`);
        setTimeout(() => startWhatsAppBridge(), 5000);
      } else {
        log('Logged out. Delete ~/.claw-memory/whatsapp-auth/ and restart.');
      }
    }

    if (connection === 'open') {
      log('✅ WhatsApp AI Bridge is live!');
      log(`🔒 Authorized: ${AUTHORIZED_NUMBER || 'EVERYONE (set WHATSAPP_AUTHORIZED_NUMBER!)'}`);
    }
  });

  // Message handler
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const sender = msg.key.remoteJid || '';
      const senderNumber = sender.replace('@s.whatsapp.net', '').replace('@g.us', '');

      // Security gate
      if (AUTHORIZED_NUMBER && !sender.includes(AUTHORIZED_NUMBER)) {
        log(`🚫 Blocked: ${senderNumber}`);
        continue;
      }

      // Extract text content
      const text = msg.message.conversation
        || msg.message.extendedTextMessage?.text
        || '';

      if (!text.trim()) continue;

      log(`📩 ${senderNumber}: ${text}`);

      // Show "typing" indicator
      await sock.sendPresenceUpdate('composing', sender);

      try {
        // Full AI conversation — no command parsing, pure natural language
        const response = await handleConversation(senderNumber, text);
        
        log(`📤 Response (${response.length} chars)`);

        // Send response
        await sock.sendPresenceUpdate('paused', sender);
        await sock.sendMessage(sender, { text: response });

      } catch (err: any) {
        log(`❌ Error: ${err.message}`);
        await sock.sendPresenceUpdate('paused', sender);
        await sock.sendMessage(sender, {
          text: `Something went wrong on my end — ${err.message}. I'll sort it out, try again in a sec 🛠️`
        });
      }
    }
  });

  return sock;
}

// ═══════════════════════════════════════════════════════════════
// Launch
// ═══════════════════════════════════════════════════════════════

startWhatsAppBridge().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
