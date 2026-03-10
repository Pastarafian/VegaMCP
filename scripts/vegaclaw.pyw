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

INJECT_JS = """
(function() {
    var text = %s;
    var box = document.querySelector('textarea, [contenteditable="true"]') || document.querySelector('input[type="text"]');
    if (!box) return "No input box found";
    
    if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
        box.value = text;
        box.dispatchEvent(new Event('input', {bubbles: true}));
    } else {
        box.innerText = text;
        box.dispatchEvent(new Event('input', {bubbles: true}));
    }
    
    var btn = document.querySelector('button[type="submit"]') || (box.parentElement && box.parentElement.querySelector('button'));
    if (btn) btn.click();
    else box.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));
    
    return "Injected prompt";
})()
"""

READ_DOM_JS = """
(function() {
    return document.body.innerText;
})()
"""

def start_agentic_bridge():
    """Runs a local HTTP server to receive agentic commands and execute them via CDP."""
    class AgenticBridgeHandler(BaseHTTPRequestHandler):
        def log_message(self, format, *args): pass  # Silence access logs
        def do_POST(self):
            try:
                length = int(self.headers.get('Content-Length', 0))
                data = json.loads(self.rfile.read(length).decode('utf-8')) if length > 0 else {}
                if self.path == '/api/inject':
                    command_queue.put({'action': 'inject', 'prompt': data.get('prompt', '')})
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"status": "queued"}')
                else:
                    self.send_response(404)
                    self.end_headers()
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                
        def do_GET(self):
            if self.path == '/api/dom':
                res_q = queue.Queue()
                command_queue.put({'action': 'read_dom', 'res_q': res_q})
                try:
                    res = res_q.get(timeout=5)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"dom": res}).encode('utf-8'))
                except queue.Empty:
                    self.send_response(504)
                    self.end_headers()

    server = HTTPServer(('127.0.0.1', 4242), AgenticBridgeHandler)
    server.serve_forever()
FINDER_JS = """
(function(){
  if(window.__vc13) return JSON.stringify({s:'active', c:window.__vc13c||0});
  window.__vc13 = true;
  window.__vc13c = 0;
  window.__vc13typing = 0;

  document.addEventListener('keydown', function(e) {
    if(e.key && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter')) {
      window.__vc13typing = Date.now();
    }
  }, true);

  var WL = ['run', 'accept all', 'allow'];
  var BLOCK = ['run and debug', 'run_cli', 'running', 'runner', 'run extension'];
  var DANGER = ['rm ', 'del ', 'format ', 'fdisk', 'mkfs', 'DROP '];

  // Auto-scroll: find the chat scroll container and keep it pinned to bottom
  function autoScroll() {
    // Look for the deepest scrollable container in the right panel area
    var candidates = document.querySelectorAll('[class*="overflow"]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var cs = window.getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
        // Only scroll if we're NOT near the bottom already (user might be reading history)
        var distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distFromBottom > 200) {
          el.scrollTop = el.scrollHeight;
        }
      }
    }
  }

  function scan() {
    if (Date.now() - window.__vc13typing < 5000) return;

    // Auto-scroll chat to bottom to reveal new buttons
    autoScroll();

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
      if (e.dataset && e.dataset.vc13) continue;

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

      e.dataset.vc13 = '1';
      e.click();
      window.__vc13c++;
      setTimeout(function(el){ return function(){ if(el.dataset) delete el.dataset.vc13; } }(e), 5000);
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
                        for p in pages:
                            ws = p.get('webSocketDebuggerUrl')
                            if not ws: continue
                            
                            try:
                                res = loop.run_until_complete(_cdp_eval(ws, FINDER_JS))
                                if res:
                                    val = res.get('result', {}).get('result', {}).get('value', '{}')
                                    status = json.loads(val)
                                    if isinstance(status, dict):
                                        c = status.get('c', 0)
                                        s = status.get('s', '?')
                                        if c > 0:
                                            self.total_clicks = max(self.total_clicks, c)
                                        self.status_text = "Active"
                                        self.status_color = "#22c55e"
                            except Exception as ex:
                                pass  # connection errors are normal during page transitions
                            
                            # AGENTIC CODING: Process commands from HTTP Bridge using CDP
                            while not command_queue.empty():
                                try:
                                    cmd = command_queue.get_nowait()
                                    if cmd['action'] == 'inject':
                                        safe_str = json.dumps(cmd['prompt'])
                                        js = INJECT_JS % safe_str
                                        loop.run_until_complete(_cdp_eval(ws, js))
                                        self.status_text = "Prompt Injected!"
                                        self.status_color = "#3b82f6"
                                    elif cmd['action'] == 'read_dom':
                                        res = loop.run_until_complete(_cdp_eval(ws, READ_DOM_JS))
                                        val = ""
                                        if res and 'result' in res and 'result' in res['result']:
                                            val = res['result']['result'].get('value', '')
                                        cmd['res_q'].put(val)
                                except queue.Empty:
                                    break

            except:
                pass
            
            time.sleep(POLL_INTERVAL)

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    VegaClawApp().run()
