import tkinter as tk
import asyncio
import websockets
import json
import urllib.request
import threading
import time

PORT = 9222
STATE = {
    'running': True,
    'paused': False,
    'speed_ms': 2000,
    'connected': False,
    'targets': 0,
    'clicks': 0,
    'scans': 0,
    'last_msg': "Starting..."
}

# The injection script using MutationObserver + precise keywords
INJECTION_JS = """
(function(){
  if(window.__vcpy2) return JSON.stringify({s:'active', c:window.__vcpy2c||0, m:window.__vcpy2m||''});
  if(window.__vcpy) window.__vcpy = false; // Kill old version flag
  window.__vcpy2 = true;
  window.__vcpy2c = window.__vcpyc || 0;
  window.__vcpy2m = window.__vcpym || '';
  
  const BL = ['delete','remove','uninstall','format','reset','sign out','log out','close', 'cancel','discard','reject','deny','dismiss','erase','drop','no','run and debug','go back','go forward','more actions'];
  const BCMD = ['rm ','rm -','del ','format ','fdisk','mkfs','dd if=','DROP TABLE','DROP DATABASE'];

  function scan() {
    let all = document.querySelectorAll('button, [role=button], a, div[class*=cursor-pointer], span[class*=cursor-pointer], div[class*=actionable], div[class*=flex]');
    for(let e of all) {
      if(e.dataset && e.dataset.vcpy) continue;
      
      let raw = (e.innerText||e.textContent||e.getAttribute('aria-label')||'').trim();
      if(!raw) continue;
      
      let t = raw.split(/\\r?\\n/)[0].trim().toLowerCase();
      if(t.length > 60 || t.length < 2) continue;
      
      if(BL.some(b => t.includes(b))) continue;
      
      // Prevent standard VSCode menu bars from being blindly clicked
      let cls = (e.className || '').toString().toLowerCase();
      if(cls.includes('menubar-menu')) continue;
      
      let kw = null;
      if(t === 'run' || t.startsWith('run ') || t === 'always run' || t.startsWith('rescue run')) kw = 'run';
      else if(t === 'accept all' || t === 'accept' || t === 'allow this conversation' || t.startsWith('allow')) kw = 'allow';
      else if(['retry','continue','approve','trust','ok','yes','apply'].includes(t)) kw = 'ok';
      
      if(!kw) continue;
      
      let r = e.getBoundingClientRect();
      if(r.width === 0 || r.height === 0) continue;
      let s = window.getComputedStyle(e);
      if(s.display === 'none' || s.visibility === 'hidden') continue;
      
      if(kw === 'run') {
        let p = e, blocked = false;
        for(let j=0; j<4 && p; j++) {
          let cd = p.querySelector('code,pre');
          if(cd && BCMD.some(bc => (cd.textContent||'').includes(bc))) { blocked=true; break; }
          p = p.parentElement;
        }
        if(blocked) continue;
      }
      
      e.dataset.vcpy = '1';
      
      try {
        let cx = r.left + r.width/2;
        let cy = r.top + r.height/2;
        let pDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy });
        let pUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy });
        let cEv = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy });
        
        e.dispatchEvent(pDown);
        e.dispatchEvent(pUp);
        e.dispatchEvent(cEv);
        if(typeof e.click === 'function') setTimeout(() => e.click(), 50);
      } catch(ex) { e.click(); }
      
      // Drop focus immediately so terminal typing is not interrupted
      if(typeof e.blur === 'function') e.blur();
      
      window.__vcpy2c++;
      window.__vcpy2m = 'Clicked ' + kw + ' (' + t.slice(0, 15) + ')';
      
      setTimeout(() => { if(e.dataset) delete e.dataset.vcpy; }, 5000);
    }
  }

  let thr = null;
  new MutationObserver(() => {
    if(thr) return;
    thr = setTimeout(() => { thr = null; scan(); }, 100);
  }).observe(document.body, {childList:true, subtree:true});
  
  setInterval(scan, 1500);
  setTimeout(scan, 300);
  return JSON.stringify({s:'injected', c:window.__vcpy2c, m:'injected'});
})();
"""

async def cdp_eval_async(ws_url, code):
    try:
        async with websockets.connect(ws_url, ping_timeout=2) as ws:
            msg = {
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {"expression": code, "returnByValue": True}
            }
            await ws.send(json.dumps(msg))
            resp = await asyncio.wait_for(ws.recv(), timeout=2.0)
            return json.loads(resp)
    except:
        return None

async def scanner_loop():
    while STATE['running']:
        if STATE['paused']:
            await asyncio.sleep(0.5)
            continue
            
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{PORT}/json")
            with urllib.request.urlopen(req, timeout=2) as resp:
                targets = json.loads(resp.read())
                
            injected = 0
            for t in targets:
                if t.get('type') not in ('page', 'iframe'):
                    continue
                ws_url = t.get('webSocketDebuggerUrl')
                if not ws_url:
                    continue
                    
                # Inject payload
                res = await cdp_eval_async(ws_url, INJECTION_JS)
                if res and 'result' in res and 'result' in res['result']:
                    injected += 1
                
                # Query count
                count_res = await cdp_eval_async(ws_url, "JSON.stringify({c:window.__vcpy2c||0, m:window.__vcpy2m||''})")
                if count_res and 'result' in count_res and 'result' in count_res['result']:
                    try:
                        val = json.loads(count_res['result']['result']['value'])
                        if val.get('c', 0) > STATE['clicks']:
                            STATE['clicks'] = val['c']
                            print(f"[CLICK] {val.get('m', 'clicked')}")
                    except:
                        pass

            STATE['targets'] = injected
            STATE['connected'] = True
            STATE['scans'] += 1
            if STATE['clicks'] > 0:
                STATE['last_msg'] = f"Active ({injected}) clicks:{STATE['clicks']}"
            else:
                STATE['last_msg'] = f"Active ({injected} targets)"
                
        except Exception as e:
            STATE['connected'] = False
            STATE['last_msg'] = "No CDP Connection"
            
        await asyncio.sleep(STATE['speed_ms'] / 1000.0)

def start_asyncio_thread():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(scanner_loop())

class PillHotbar(tk.Tk):
    def __init__(self):
        super().__init__()
        self.overrideredirect(True) # Remove windows borders
        self.attributes('-topmost', True)
        self.configure(bg='#0E1117')
        
        # Position bottom right
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        w = 460
        h = 44
        self.geometry(f"{w}x{h}+{sw - w - 20}+{sh - h - 56}")
        
        # Dragging variables
        self._offsetx = 0
        self._offsety = 0
        
        self.bind('<Button-1>', self.click_window)
        self.bind('<B1-Motion>', self.drag_window)
        
        # Fonts & Colors
        bg_col = '#0E1117'
        btn_bg = '#161B22'
        fg_cyan = '#00D4FF'
        fg_amber = '#F59E0B'
        fg_green = '#22C55E'
        fg_gray = '#64748B'
        
        # Title
        tk.Label(self, text="CLAW", fg=fg_cyan, bg=bg_col, font=("Segoe UI", 11, "bold")).place(x=12, y=10)
        
        # Info labels
        self.lbl_info = tk.Label(self, text="Starting...", fg=fg_amber, bg=bg_col, font=("Segoe UI", 8))
        self.lbl_info.place(x=65, y=5)
        
        self.lbl_count = tk.Label(self, text="Python CDP mode", fg=fg_gray, bg=bg_col, font=("Consolas", 7))
        self.lbl_count.place(x=65, y=24)
        
        # Buttons
        self.btn_play = tk.Button(self, text="Play", fg=fg_green, bg=btn_bg, relief='flat', font=("Segoe UI", 8, "bold"), command=self.do_play)
        self.btn_play.place(x=210, y=7, width=50, height=30)
        
        self.btn_pause = tk.Button(self, text="Pause", fg=fg_amber, bg=btn_bg, relief='flat', font=("Segoe UI", 8, "bold"), command=self.do_pause)
        self.btn_pause.place(x=264, y=7, width=54, height=30)
        
        self.btn_speed = tk.Button(self, text="2s", fg='#A855F7', bg=btn_bg, relief='flat', font=("Segoe UI", 8, "bold"), command=self.do_speed)
        self.btn_speed.place(x=322, y=7, width=34, height=30)
        
        self.btn_stop = tk.Button(self, text="Stop", fg='#EF4444', bg=btn_bg, relief='flat', font=("Segoe UI", 8, "bold"), command=self.do_stop)
        self.btn_stop.place(x=360, y=7, width=42, height=30)
        
        self.btn_x = tk.Button(self, text="X", fg=fg_gray, bg=btn_bg, relief='flat', font=("Segoe UI", 8, "bold"), command=self.do_close)
        self.btn_x.place(x=406, y=7, width=40, height=30)
        
        # Update loop
        self.update_ui()
        
    def click_window(self, event):
        self._offsetx = event.x
        self._offsety = event.y
        
    def drag_window(self, event):
        x = self.winfo_pointerx() - self._offsetx
        y = self.winfo_pointery() - self._offsety
        self.geometry(f"+{x}+{y}")
        
    def do_play(self):
        STATE['paused'] = False
        
    def do_pause(self):
        STATE['paused'] = True
        
    def do_speed(self):
        s = STATE['speed_ms']
        if s <= 1500:
            STATE['speed_ms'] = 5000
            self.btn_speed.config(text="5s")
        elif s <= 3000:
            STATE['speed_ms'] = 1000
            self.btn_speed.config(text="1s")
        else:
            STATE['speed_ms'] = 2000
            self.btn_speed.config(text="2s")
            
    def do_stop(self):
        STATE['paused'] = True
        self.lbl_info.config(text="Stopped", fg="#EF4444")
        
    def do_close(self):
        STATE['running'] = False
        self.destroy()
        
    def update_ui(self):
        if not STATE['running']:
            return
            
        if STATE['paused']:
            self.lbl_info.config(text="Paused", fg="#F59E0B")
        else:
            self.lbl_info.config(text=STATE['last_msg'], fg="#22C55E" if STATE['connected'] else "#EF4444")
            
        self.lbl_count.config(text=f"{STATE['clicks']} clicks | scan {STATE['scans']}")
        
        # Schedule next update
        self.after(500, self.update_ui)

if __name__ == '__main__':
    t = threading.Thread(target=start_asyncio_thread, daemon=True)
    t.start()
    
    app = PillHotbar()
    app.mainloop()
    print("Done")
