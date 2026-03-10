"""
VegaClaw v10 - Multi-threaded Autoclicker
- UI stays responsive (main thread)
- CDP polling/clicking runs in a background thread
- Communicates via state variables
"""

import tkinter as tk
import json
import asyncio
import websockets
import urllib.request
import threading
import time
import queue
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 9222
POLL_INTERVAL = 1.0  # Background thread sleeps 1s between loops

command_queue = queue.Queue()

# ═══════════════════════════════════════════════════════════════
# AGENTIC JS — Antigravity-specific DOM manipulation
# ═══════════════════════════════════════════════════════════════

INJECT_JS = """
(function() {
    var text = %s;
    // Antigravity chat input is a contenteditable div
    var box = document.querySelector('div[contenteditable="true"]');
    if (!box) return JSON.stringify({ok:false, error:"No chat input found"});

    // Focus and clear
    box.focus();
    box.innerText = '';

    // Use execCommand for proper React/Prosemirror state sync
    document.execCommand('insertText', false, text);

    // Dispatch input event for framework state sync
    box.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: text}));

    // Small delay then submit via Enter key
    setTimeout(function() {
        box.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
        box.dispatchEvent(new KeyboardEvent('keypress', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
        box.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    }, 100);

    return JSON.stringify({ok:true, injected:text.substring(0,80)});
})()
"""

READ_RESPONSE_JS = """
(function() {
    // Assistant messages have the leading-relaxed class
    var msgs = document.querySelectorAll('div.leading-relaxed.select-text');
    if (msgs.length === 0) return JSON.stringify({ok:false, error:"No messages found"});
    var last = msgs[msgs.length - 1];
    return JSON.stringify({
        ok: true,
        text: last.innerText,
        messageCount: msgs.length
    });
})()
"""

AI_STATUS_JS = """
(function() {
    // Check for Stop button (visible when AI is generating)
    var stopBtn = document.querySelector('[aria-label="Stop"]');
    // Check for "Thinking" or streaming indicators
    var thinking = document.querySelector('[class*="thinking"], [class*="Thinking"]');
    // Check for pulsing/animating elements near the chat (not sidebar spinners)
    var chatArea = document.querySelector('div.overflow-y-auto[class*="grow"]');
    var chatSpinners = 0;
    if (chatArea) {
        var spins = chatArea.querySelectorAll('.animate-spin, .animate-pulse');
        chatSpinners = spins.length;
    }
    // Check for "waiting for approval" type buttons
    var approvalBtns = document.querySelectorAll('button');
    var pendingApprovals = 0;
    for (var i = 0; i < approvalBtns.length; i++) {
        var t = (approvalBtns[i].innerText || '').trim().toLowerCase();
        if (t === 'run' || t.startsWith('accept') || t.startsWith('allow')) pendingApprovals++;
    }
    return JSON.stringify({
        busy: !!(stopBtn || thinking || chatSpinners > 0),
        hasStopButton: !!stopBtn,
        chatSpinners: chatSpinners,
        pendingApprovals: pendingApprovals
    });
})()
"""

READ_CHAT_JS = """
(function() {
    var result = [];
    // Find all message groups - user messages and assistant messages
    var groups = document.querySelectorAll('div[class*="flex"][class*="flex-col"][class*="gap-2"][class*="group"]');
    for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        // User messages have a specific bg class
        var userDiv = g.querySelector('div[class*="bg-gray-500"]');
        var assistDiv = g.querySelector('div.leading-relaxed');
        if (userDiv) {
            result.push({role: 'user', text: userDiv.innerText.trim()});
        }
        if (assistDiv) {
            result.push({role: 'assistant', text: assistDiv.innerText.substring(0, 2000)});
        }
    }
    // If group selector didn't work, fall back to direct message extraction
    if (result.length === 0) {
        var assistMsgs = document.querySelectorAll('div.leading-relaxed.select-text');
        for (var i = 0; i < assistMsgs.length; i++) {
            result.push({role: 'assistant', text: assistMsgs[i].innerText.substring(0, 2000)});
        }
    }
    return JSON.stringify({ok: true, messages: result, count: result.length});
})()
"""

def start_agentic_bridge():
    """HTTP bridge for agentic coding — accepts commands, routes to CDP."""
    class AgenticBridgeHandler(BaseHTTPRequestHandler):
        def log_message(self, format, *args): pass

        def _json_response(self, code, data):
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))

        def do_OPTIONS(self):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()

        def do_POST(self):
            try:
                length = int(self.headers.get('Content-Length', 0))
                data = json.loads(self.rfile.read(length).decode('utf-8')) if length > 0 else {}

                if self.path == '/api/inject':
                    prompt = data.get('prompt', '')
                    target = data.get('target', None)  # optional: target specific window
                    if not prompt:
                        self._json_response(400, {'error': 'No prompt provided'})
                        return
                    command_queue.put({'action': 'inject', 'prompt': prompt, 'target': target})
                    self._json_response(200, {'status': 'queued', 'prompt': prompt[:80]})

                elif self.path == '/api/task':
                    # Queue a multi-step task
                    steps = data.get('steps', [])
                    if not steps:
                        self._json_response(400, {'error': 'No steps provided'})
                        return
                    for step in steps:
                        command_queue.put({'action': 'inject', 'prompt': step})
                    self._json_response(200, {'status': 'queued', 'steps': len(steps)})

                else:
                    self._json_response(404, {'error': 'Unknown endpoint'})
            except Exception as e:
                self._json_response(400, {'error': str(e)})

        def do_GET(self):
            if self.path == '/api/status':
                res_q = queue.Queue()
                command_queue.put({'action': 'ai_status', 'res_q': res_q})
                try:
                    res = res_q.get(timeout=5)
                    self._json_response(200, res)
                except queue.Empty:
                    self._json_response(200, {'busy': False, 'connected': False})

            elif self.path == '/api/read':
                res_q = queue.Queue()
                command_queue.put({'action': 'read_response', 'res_q': res_q})
                try:
                    res = res_q.get(timeout=5)
                    self._json_response(200, res)
                except queue.Empty:
                    self._json_response(504, {'error': 'Timeout reading response'})

            elif self.path == '/api/chat':
                res_q = queue.Queue()
                command_queue.put({'action': 'read_chat', 'res_q': res_q})
                try:
                    res = res_q.get(timeout=5)
                    self._json_response(200, res)
                except queue.Empty:
                    self._json_response(504, {'error': 'Timeout reading chat'})

            elif self.path == '/api/pages':
                res_q = queue.Queue()
                command_queue.put({'action': 'list_pages', 'res_q': res_q})
                try:
                    res = res_q.get(timeout=5)
                    self._json_response(200, res)
                except queue.Empty:
                    self._json_response(504, {'error': 'Timeout'})

            elif self.path == '/api/health':
                self._json_response(200, {'status': 'ok', 'service': 'vegaclaw-agentic-bridge'})

            else:
                self._json_response(404, {'error': 'Unknown endpoint'})

    server = HTTPServer(('0.0.0.0', 4242), AgenticBridgeHandler)
    server.serve_forever()
FINDER_JS = """
(function(){
  // QUARANTINE ZOMBIE LOOPS FROM PRIOR PYTHON RESTARTS
  if (!window.__vc21_purged) {
    for (var i=1; i<21; i++) {
      try {
        Object.defineProperty(window, '__vc'+i+'typing', { get: function(){return Number.MAX_SAFE_INTEGER;}, set: function(){} });
        Object.defineProperty(window, '__vc'+i+'scrolled', { get: function(){return Number.MAX_SAFE_INTEGER;}, set: function(){} });
        Object.defineProperty(window, '__vc'+i+'paused', { get: function(){return true;}, set: function(){} });
      } catch(e) {}
    }
    try { Object.defineProperty(window, '_vega_last_kp', { get: function(){return Number.MAX_SAFE_INTEGER;}, set: function(){} }); } catch(e){}
    window.__vc21_purged = true;
  }

  var scrollLeft = window.__vc21scrolled ? Math.max(0, 10 - Math.floor((Date.now() - window.__vc21scrolled)/1000)) : 0;
  if(window.__vc21) return JSON.stringify({s:'active', c:window.__vc21c||0, scroll_pause: scrollLeft});
  window.__vc21 = true;
  window.__vc21c = 0;
  window.__vc21typing = 0;
  window.__vc21scrolled = 0;

  document.addEventListener('keydown', function(e) {
    if(e.key && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter')) {
      window.__vc21typing = Date.now();
    }
    if(['PageUp','PageDown','ArrowUp','ArrowDown'].includes(e.key)) {
      window.__vc21scrolled = Date.now();
    }
  }, true);

  document.addEventListener('mousedown', function(e) {
    window.__vc21scrolled = Date.now();
  }, {capture: true, passive: true});

  document.addEventListener('wheel', function(e) {
    window.__vc21scrolled = Date.now();
  }, {capture: true, passive: true});

  document.addEventListener('touchmove', function(e) {
    window.__vc21scrolled = Date.now();
  }, {capture: true, passive: true});

  var WL = ['run', 'accept all', 'allow'];
  var BLOCK = ['run and debug', 'run_cli', 'running', 'runner', 'run extension'];
  var DANGER = ['rm ', 'del ', 'format ', 'fdisk', 'mkfs', 'DROP '];

  // Auto-scroll: find the chat scroll container and keep it pinned to bottom
  function autoScroll() {
    if (window.__vc21paused) return;

    var candidates = document.querySelectorAll('[class*="overflow"]');
    var isReadingHistory = false;
    var userJustInteracted = (Date.now() - window.__vc21scrolled < 10000);

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var cs = window.getComputedStyle(el);
      
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
        if (el.__vc21_wasPinned === undefined) el.__vc21_wasPinned = true;
        
        var distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        
        if (userJustInteracted) {
           // User is actively moving around! Update their memory.
           el.__vc21_wasPinned = (distFromBottom <= 200);
           isReadingHistory = true;
        } else {
           // User has hands off the mouse.
           if (el.__vc21_wasPinned) {
              // They were pinned to the bottom. Even if a 500px codeblock just rendered
              // natively and pushed distFromBottom to 500px, DO NOT lock the timer. 
              // Instantly yank them down to track the new growth.
              el.scrollTop = el.scrollHeight;
              el.__vc21_wasPinned = true; // Stay pinned
           } else {
              // They purposefully left it scrolled up 30 minutes ago. Respect it.
              isReadingHistory = true;
           }
        }
      }
    }

    return isReadingHistory;
  }

  function scan() {
    if (window.__vc21paused) return;
    if (Date.now() - window.__vc21typing < 5000) return;
    
    // AutoScroll executes, and tells us if the user is occupying the UI (reading history/dragging)
    var isBusy = autoScroll();
    if (isBusy) return; // Do not click buttons if they are scrolling around or reading old logs

    function walk(root, out) {
      try {
        var els = root.querySelectorAll('button, [role="button"], a, span, div, .cursor-pointer');
        for (var i = 0; i < els.length; i++) {
          out.push(els[i]);
          if (els[i].shadowRoot) walk(els[i].shadowRoot, out);
        }
      } catch(e) {}
      return out;
    }
    var btns = walk(document, []);

    for (var i = 0; i < btns.length; i++) {
      var e = btns[i];
      if (e.dataset && e.dataset.vc21) continue;

      var raw = (e.innerText || e.textContent || '').trim();
      if (!raw) continue;
      var t = raw.split('\\n')[0].trim().toLowerCase();
      if (t.length > 50 || t.length < 2) continue;

      var skip = false;
      for (var b = 0; b < BLOCK.length; b++) {
        if (t === BLOCK[b] || t.indexOf(BLOCK[b]) === 0) { skip = true; break; }
      }
      if (skip) continue;

      var matched = null;
      for (var k = 0; k < WL.length; k++) {
        if (t === WL[k] || t.startsWith(WL[k] + ' ') || t.startsWith(WL[k] + '(')) {
          matched = WL[k]; break;
        }
      }
      if (!matched) continue;

      var r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.top < 0 || r.bottom > window.innerHeight + 50) continue;
      var cs = window.getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

      if (matched === 'run') {
        var danger = false, p = e;
        for (var j = 0; j < 5 && p; j++) {
          var codes = p.querySelectorAll('code, pre');
          for (var x = 0; x < codes.length; x++) {
            var ct = (codes[x].textContent || '').toUpperCase();
            for (var d = 0; d < DANGER.length; d++) {
              if (ct.indexOf(DANGER[d].toUpperCase()) >= 0) { danger = true; break; }
            }
            if (danger) break;
          }
          if (danger) break;
          p = p.parentElement;
        }
        if (danger) continue;
      }

      e.dataset.vc21 = '1';
      e.click();
      window.__vc21c++;
      setTimeout(function(el){ return function(){ if(el.dataset) delete el.dataset.vc21; } }(e), 5000);
    }
  }

  var thr = null;
  new MutationObserver(function() {
    if (thr) return;
    thr = setTimeout(function() { thr = null; scan(); }, 200);
  }).observe(document.body, {childList:true, subtree:true});

  setInterval(scan, 2000);
  setTimeout(scan, 500);

  return JSON.stringify({s:'injected', c:0});
})()
"""


# ═══════════════════════════════════════
# CDP Helpers (Thread-safe)
# ═══════════════════════════════════════

def get_targets():
    all_targets = []
    for p in range(9222, 9242):
        try:
            r = urllib.request.urlopen(f"http://127.0.0.1:{p}/json", timeout=0.1)
            all_targets.extend(json.loads(r.read()))
        except:
            pass
    return all_targets

async def _cdp_eval(ws_url, js_code):
    try:
        async with websockets.connect(ws_url, close_timeout=1) as ws:
            payload = {
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {"expression": js_code, "returnByValue": True}
            }
            await ws.send(json.dumps(payload))
            resp = await asyncio.wait_for(ws.recv(), timeout=1)
            return json.loads(resp)
    except:
        return None

async def _cdp_click(ws_url, x, y):
    try:
        async with websockets.connect(ws_url, close_timeout=1) as ws:
            for i, mtype in enumerate(['mousePressed', 'mouseReleased']):
                payload = {
                    "id": i + 1,
                    "method": "Input.dispatchMouseEvent",
                    "params": {
                        "type": mtype, "x": x, "y": y,
                        "button": "left", "clickCount": 1
                    }
                }
                await ws.send(json.dumps(payload))
                await asyncio.wait_for(ws.recv(), timeout=1)
            return True
    except:
        return False

# ═══════════════════════════════════════
# THE PILL
# ═══════════════════════════════════════

class VegaClawApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("VegaClaw v10")
        self.root.overrideredirect(True)
        self.root.attributes('-topmost', True)
        self.root.attributes('-alpha', 0.95)
        self.root.configure(bg='#0e1117')

        # State vars
        self.paused = False
        self.stopped = False
        self.total_clicks = 0
        self.status_text = "Searching..."
        self.status_color = "#f59e0b"
        self.pause_until = 0

        # Position
        sw, sh = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
        self.root.geometry(f"400x38+{sw - 420}+{sh - 80}")

        # UI Build
        frame = tk.Frame(self.root, bg='#0e1117', padx=2, pady=2)
        frame.pack(fill='both', expand=True)

        tk.Label(frame, text="CLAW", font=("Segoe UI", 9, "bold"), fg='#00d4ff', bg='#0e1117').pack(side='left', padx=8)
        
        self.ui_status = tk.Label(frame, text=self.status_text, font=("Segoe UI", 8), fg=self.status_color, bg='#0e1117', width=12, anchor='w')
        self.ui_status.pack(side='left')

        self.ui_count = tk.Label(frame, text="0 clicks", font=("Consolas", 8), fg='#64748b', bg='#0e1117', width=10, anchor='w')
        self.ui_count.pack(side='left')

        self.ui_timer = tk.Label(frame, text="", font=("Consolas", 8, "bold"), fg='#f43f5e', bg='#0e1117', width=10, anchor='w')
        self.ui_timer.pack(side='left')

        # Buttons
        self.btns = {}
        for name, txt, clr in [('play','Play','#22c55e'), ('pause','Pause','#f59e0b'), ('stop','Stop','#ef4444')]:
            b = tk.Label(frame, text=txt, font=("Segoe UI", 8, "bold"), bg='#1c2128', fg=clr, padx=8, pady=2, cursor='hand2')
            b.pack(side='left', padx=2)
            b.bind('<Button-1>', lambda e, n=name: self.set_state(n))
            self.btns[name] = b

        tk.Label(frame, text="\u2715", font=("Segoe UI", 8, "bold"), bg='#1c2128', fg='#64748b', padx=8, pady=2, cursor='hand2').pack(side='left', padx=2)
        self.root.bind('<Button-1>', self._start_drag)
        self.root.bind('<B1-Motion>', self._on_drag)

        # Background Thread
        self.thread = threading.Thread(target=self.worker_loop, daemon=True)
        self.thread.start()

        # UI Refresh Loop
        self.refresh_ui()

    def _start_drag(self, e): self._dx, self._dy = e.x, e.y
    def _on_drag(self, e): self.root.geometry(f"+{self.root.winfo_x()+(e.x-self._dx)}+{self.root.winfo_y()+(e.y-self._dy)}")

    def set_state(self, action):
        if action == 'play':
            self.paused = False
            self.stopped = False
            self.status_text = "Active"
            self.status_color = "#22c55e"
        elif action == 'pause':
            self.paused = True
            self.stopped = False
            self.status_text = "Paused"
            self.status_color = "#f59e0b"
        elif action == 'stop':
            self.paused = False
            self.stopped = True
            self.status_text = "Stopped"
            self.status_color = "#ef4444"
        
        # Visual feedback: highlights
        for name, btn in self.btns.items():
            btn.configure(bg='#2d333b' if name == action else '#1c2128')

    def refresh_ui(self):
        self.ui_status.configure(text=self.status_text, fg=self.status_color)
        self.ui_count.configure(text=f"{self.total_clicks} clicks")
        
        # Smoothly update timer locally on the UI thread
        if hasattr(self, 'pause_until') and self.pause_until > time.time():
            rem = int(self.pause_until - time.time() + 0.99)
            self.ui_timer.configure(text=f"Pause: {rem}s")
        else:
            self.ui_timer.configure(text="")

        self.root.after(200, self.refresh_ui)

    def worker_loop(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Start the Agentic REST API Bridge
        threading.Thread(target=start_agentic_bridge, daemon=True).start()
        
        while True:
            if self.stopped:
                time.sleep(0.5)
                continue
            
            try:
                targets = get_targets()
                pages = [t for t in targets if t.get('type') == 'page' and t.get('webSocketDebuggerUrl')]
                
                if not pages:
                    if not self.paused:
                        self.status_text = "Searching..."
                        self.status_color = "#f59e0b"
                else:
                    if not self.paused:
                        self.status_text = f"Active ({len(pages)}p)"
                        self.status_color = "#22c55e"
                    else:
                        self.status_text = "Paused"
                        self.status_color = "#f59e0b"
                        
                    for p in pages:
                        ws = p.get('webSocketDebuggerUrl')
                        if not ws: continue
                        
                        try:
                            # We need to pass the paused state explicitly to the injected JS so it can stop auto-scrolling
                            pause_flag = "window.__vc21paused = true;" if self.paused else "window.__vc21paused = false;"
                            
                            res = loop.run_until_complete(_cdp_eval(ws, pause_flag + FINDER_JS))
                            if res:
                                val = res.get('result', {}).get('result', {}).get('value', '{}')
                                status = json.loads(val)
                                if isinstance(status, dict):
                                    c = status.get('c', 0)
                                    s = status.get('s', '?')
                                    sp = status.get('scroll_pause', 0)
                                    if c > 0:
                                        self.total_clicks = max(self.total_clicks, c)
                                    
                                    # Let UI thread handle visual countdown
                                    if sp > 0:
                                        self.pause_until = time.time() + sp
                                    else:
                                        self.pause_until = 0
                        except Exception as ex:
                            pass  # connection errors are normal during page transitions
                        
                        # AGENTIC CODING: Process commands from HTTP Bridge using CDP
                        while not command_queue.empty():
                            try:
                                cmd = command_queue.get_nowait()
                                action = cmd.get('action', '')

                                if action == 'inject':
                                    safe_str = json.dumps(cmd['prompt'])
                                    js = INJECT_JS % safe_str
                                    loop.run_until_complete(_cdp_eval(ws, js))
                                    self.status_text = "Prompt Injected!"
                                    self.status_color = "#3b82f6"

                                elif action == 'read_response':
                                    res = loop.run_until_complete(_cdp_eval(ws, READ_RESPONSE_JS))
                                    val = {}
                                    try:
                                        if res and 'result' in res:
                                            raw = res['result'].get('result', {}).get('value', '{}')
                                            val = json.loads(raw)
                                    except: pass
                                    cmd['res_q'].put(val)

                                elif action == 'ai_status':
                                    res = loop.run_until_complete(_cdp_eval(ws, AI_STATUS_JS))
                                    val = {'busy': False, 'connected': True}
                                    try:
                                        if res and 'result' in res:
                                            raw = res['result'].get('result', {}).get('value', '{}')
                                            val = json.loads(raw)
                                            val['connected'] = True
                                    except: pass
                                    cmd['res_q'].put(val)

                                elif action == 'read_chat':
                                    res = loop.run_until_complete(_cdp_eval(ws, READ_CHAT_JS))
                                    val = {}
                                    try:
                                        if res and 'result' in res:
                                            raw = res['result'].get('result', {}).get('value', '{}')
                                            val = json.loads(raw)
                                    except: pass
                                    cmd['res_q'].put(val)

                                elif action == 'list_pages':
                                    cmd['res_q'].put({'pages': [{'title': t.get('title',''), 'url': t.get('url','')} for t in targets]})

                            except queue.Empty:
                                break

            except:
                pass
            
            time.sleep(POLL_INTERVAL)

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    VegaClawApp().run()
