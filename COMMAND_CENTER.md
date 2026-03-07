# ⚙️ Command Center & Telegram Setup

The Claw Command Center is production-grade software that bridges the gap between your local IDE and a remote AI powerhouse (like a Windows or Linux VPS). 

It features:
1. A **Telegram Bot** endpoint to control agents from your phone.
2. An **SQLite Chat Curation Backend** for perfect synchronization.
3. An **Omni-Agent Visual Layer** to screenshot your IDE and automatically click/type to assist you.

---

## 🚀 1. Setup the Command Center Server

The Command Center backend code is located natively inside the `VegaMCP` repo:
`src/vps/claw-server.js`

### Step 1: Install Dependencies
The server relies on global packages. SSH into your remote VPS (or open a terminal locally) and run:
```bash
npm install -g better-sqlite3 node-telegram-bot-api
```

### Step 2: Configure Environment Variables
In your `.env` file (or exported natively on your terminal/VPS):
```bash
CLAW_PORT=4280
TELEGRAM_BOT_TOKEN=1234567890:AAH... # Get from BotFather
TELEGRAM_AUTHORIZED_ID=123456789   # Your personal Telegram User ID
OLLAMA_PORT=11434                  # Default
```

### Step 3: Start the Command Center
You can run it manually, but it's best to use a process manager like PM2:
```bash
pm2 start src/vps/claw-server.js --name claw-command-center
```
*The server will immediately initialize the SQLite Database (`/opt/claw-memory.db` or local equivalents) and enable the Full-Text Search (FTS5) indexes.*

---

## 📱 2. The Telegram Bot

To control VegaMCP from WhatsApp or Telegram, you must register a bot API key.

### Step 1: Register with BotFather
1. Open Telegram and search for `@BotFather`.
2. Type `/newbot` and follow the instructions to name your bot (e.g., `Vega_Claw_Bot`).
3. Copy the **HTTP API Token** provided and paste it into `TELEGRAM_BOT_TOKEN`.

### Step 2: Get your Authorized ID
To ensure no one else can control your VPS:
1. Search for `@userinfobot` on Telegram.
2. Send it a message, and it will return your unique ID (e.g., `987654321`).
3. Set this ID as `TELEGRAM_AUTHORIZED_ID` in your `.env`.

### Step 3: Commands & Usage
Message your bot directly on Telegram. You can simply type naturally, as the server uses NLP Intent Detection:
- *"Start the agent"* -> Starts `coder` mode.
- *"Stop"* -> Stops execution.
- *"Show me a screenshot"* -> Takes a capture of the VPS desktop.
- *"Execute a plan to build a login page"* -> Launches an autonomous loop via The Claw.

---

## 🛡️ 3. The "Dirty-Marker" Sync Protocol

When chatting across the VS Code GUI, Telegram, and native terminal simultaneously, messages can get dropped. The Command Center fixes this using the Dirty-Marker protocol.

### How it works:
1. Every message written by you or the AI is stored immutably in SQLite.
2. Edits are processed cleanly. (A message is marked `sync_status = 'edited'`).
3. Deletions are strictly disabled. We use an `archived` boolean for soft-deleting.
4. Telegram or the GUI constantly polls the `/api/chat/sync` endpoint. It pulls down any state changes and applies them cleanly (e.g., parsing `<think>` tags into expandable UI accordions).

You do not need to manage this! It runs completely in the background, ensuring 100% data fidelity.
