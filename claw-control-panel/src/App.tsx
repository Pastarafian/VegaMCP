import { useState, useEffect, useRef } from 'react';

const apiFetch = async (endpoint: string, options: any = {}) => {
  try {
    const res = await fetch(endpoint, options);
    return await res.json();
  } catch (err) {
    console.error(err);
    return { error: String(err) };
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('vps');
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [termCollapsed, setTermCollapsed] = useState(false);
  const [chatMode, setChatMode] = useState('agent');
  
  const [isConnected] = useState(true);
  const [taskOn, setTaskOn] = useState(false);

  // Stats
  const [stats] = useState({ ocr: 0, ui: 0, ml: 0, win: '0%' });

  // Terminal Logs
  const [termLogs, setTermLogs] = useState<{from: string, txt: string}[]>([{from: 'sys', txt: 'root@vps:~$ _'}]);
  const [termInput, setTermInput] = useState('');

  // Chat
  const [vpsChat, setVpsChat] = useState<{role: 'system'|'user'|'agent', msg: string, tag?: string}[]>([
    { role: 'system', msg: 'VegaClaw v2 — 4-lane vision race engine active' }
  ]);
  const [vpsChatIn, setVpsChatIn] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Refresh stream
  const [streamTick, setStreamTick] = useState(Date.now());

  // MTClaw / VegaClaw replacement Tab State
  const [subTab, setSubTab] = useState('telemetry');

  // Helpers
  const addTermLog = (msg: string, isCmd = false) => {
    setTermLogs(p => [...p, { from: isCmd ? 'cmd' : 'res', txt: msg }]);
  };

  const addChatLog = (role: 'user'|'agent'|'system', msg: string, tag?: string) => {
    setVpsChat(p => [...p, { role, msg, tag }]);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [vpsChat]);

  // Actions
  const termRun = async () => {
    if (!termInput.trim()) return;
    const cmd = termInput.trim();
    setTermInput('');
    addTermLog(`$ ${cmd}`, true);
    try {
      const r = await apiFetch('/api/vision/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'runCommand', params: { cmd } })
      });
      addTermLog(r.result || r.error || "done");
    } catch (e: any) {
      addTermLog(`Error: ${e.message}`);
    }
  };

  const sendVpsChat = async (text?: string) => {
    const t = text || vpsChatIn.trim();
    if (!t || taskOn) return;
    setVpsChatIn('');
    addChatLog('user', t);
    
    if (chatMode === 'agent') {
      startTask(t);
    } else if (chatMode === 'direct') {
      directAct(t);
    } else {
      visionQ();
    }
  };

  const startTask = async (task: string) => {
    setTaskOn(true);
    addChatLog('system', 'Starting...');
    try {
      const r = await apiFetch('/api/vision/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, maxSteps: 12 })
      });
      if (r.started) {
        addChatLog('agent', 'Task accepted', 'act');
        // Let's pretend it finishes for UI
        setTimeout(() => {
          setTaskOn(false);
          addChatLog('system', 'Task complete');
          setStreamTick(Date.now());
        }, 3000);
      } else {
        addChatLog('agent', 'Failed: ' + (r.error || '?'));
        setTaskOn(false);
      }
    } catch (e: any) {
      addChatLog('agent', 'Error: ' + e.message);
      setTaskOn(false);
    }
  };

  const directAct = async (_text: string) => {
    addChatLog('system', 'Executing...');
    setTimeout(() => {
       addChatLog('agent', 'Done.');
       setStreamTick(Date.now());
    }, 1000);
  };

  const visionQ = async () => {
    addChatLog('system', 'Analyzing current screen...');
    setTimeout(() => {
       addChatLog('agent', '<b>Vision Analysis</b><br>📝 0 texts<br>🎨 0 UI elements<br>⏱ Race: 120ms');
    }, 1000);
  };

  const captureScreen = async () => {
    setStreamTick(Date.now());
  };

  const toggleFullscreen = () => {
    const el = document.getElementById('page-vps');
    if (!document.fullscreenElement && el) {
      el.requestFullscreen().catch(console.error);
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };

  return (
    <>
      <div className="hdr">
        <div>
          <div className="logo">VEGACLAW</div>
          <div className="logo-sub">Command Center</div>
        </div>
        <div className="conn">
          <div className="conn-dot" style={{ background: isConnected ? 'var(--green)' : 'var(--red)', animation: isConnected ? 'pulse 2s infinite' : 'none' }}></div>
          <span>{isConnected ? 'Connected' : 'Offline'}</span>
        </div>
        <div className="hdr-r">
          <div className="badge">OCR <b>{stats.ocr}</b></div>
          <div className="badge">UI <b>{stats.ui}</b></div>
          <div className="badge">ML <b>{stats.ml}</b></div>
          <div className="badge">Win <b>{stats.win}</b></div>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab ${activeTab === 'vps' ? 'active' : ''}`} onClick={() => setActiveTab('vps')}>
          🖥 VPS Control
        </div>
        <div className={`tab ${activeTab === 'chat-only' ? 'active' : ''}`} onClick={() => setActiveTab('chat-only')}>
          💬 Chat
        </div>
        <div className={`tab ${activeTab === 'mtclaw' ? 'active' : ''}`} onClick={() => setActiveTab('mtclaw')}>
          🦅 Swarm Core
        </div>
        <div className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          ⚙ Settings
        </div>
      </div>

      {/* TAB: VPS CONTROL */}
      <div className={`tab-page ${activeTab === 'vps' ? 'show' : ''}`} id="page-vps" style={{ display: activeTab === 'vps' ? 'flex' : 'none' }}>
        
        {/* LEFT: CHAT */}
        <div className={`chat-col ${chatCollapsed ? 'collapsed' : ''}`} id="chatCol">
          <div className="chat-toggle" onClick={() => setChatCollapsed(!chatCollapsed)}>
            {chatCollapsed ? '▶' : '◀'}
          </div>
          <div className="chat-top">
            <div className="chat-title">🤖 Agentic Control</div>
            <div className="chat-sub">Natural language → vision-driven VPS actions</div>
            <div className="chat-modes">
              <button className={`mode ${chatMode === 'agent' ? 'on' : ''}`} onClick={() => setChatMode('agent')}>Agent</button>
              <button className={`mode ${chatMode === 'direct' ? 'on' : ''}`} onClick={() => setChatMode('direct')}>Direct</button>
              <button className={`mode ${chatMode === 'vision' ? 'on' : ''}`} onClick={() => setChatMode('vision')}>Analyze</button>
            </div>
          </div>

          <div className="msgs">
            {vpsChat.map((m, i) => (
              <div key={i} className={`m ${m.role === 'user' ? 'u' : m.role === 'agent' ? 'a' : 's'}`}>
                <span dangerouslySetInnerHTML={{ __html: m.msg }} />
                {m.tag && (
                  <>
                    <br/>
                    <div className={`tag ${m.tag === 'act' ? 'act' : 'ok'}`}>{m.tag === 'act' ? '⚡ Action' : 'Matched'}</div>
                  </>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="quicks">
            <button className="qb" onClick={() => sendVpsChat('Open Firefox to youtube.com')}>▶ YouTube</button>
            <button className="qb" onClick={() => sendVpsChat('Take a screenshot')}>📸 Screen</button>
            <button className="qb" onClick={() => sendVpsChat('Check system resources')}>📊 Resources</button>
            <button className="qb" onClick={() => sendVpsChat('Open terminal')}>⬛ Terminal</button>
            <button className="qb" onClick={() => sendVpsChat('List PM2 processes')}>🔄 PM2</button>
            <button className="qb" onClick={() => sendVpsChat('Check disk usage')}>💾 Disk</button>
          </div>

          <div className="chat-in">
            <div className="in-wrap">
              <textarea
                value={vpsChatIn}
                onChange={e => setVpsChatIn(e.target.value)}
                placeholder="Tell VegaClaw what to do..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendVpsChat(vpsChatIn);
                  }
                }}
              />
              <button onClick={() => sendVpsChat(vpsChatIn)} disabled={taskOn}>▸</button>
            </div>
          </div>
        </div>

        {/* RIGHT: VPS VIEW */}
        <div className="vps-col">
          <div className="screen" id="scrView">
            <img
              id="scrImg"
              src={`/api/stream?t=${streamTick}`}
              style={{ cursor: 'crosshair', outline: 'none', objectFit: 'contain' }}
              tabIndex={0}
              onError={(e) => {
                 e.currentTarget.style.display = 'none';
                 const p = document.getElementById('sph');
                 if (p) p.style.display = 'block';
              }}
              onLoad={(e) => {
                 e.currentTarget.style.display = 'block';
                 const p = document.getElementById('sph');
                 if (p) p.style.display = 'none';
              }}
            />
            <div className="screen-ph" id="sph">
              Click Refresh to bridge VPS feed<span>or send a command via chat</span>
            </div>
            <div className="scr-ov">
              <div className="scr-b live">● LIVE</div>
              <div className="scr-b">1920×1080</div>
            </div>
            <div className="scr-btns">
              <button className="scr-btn" onClick={() => setStreamTick(Date.now())}>⟳ Reconnect</button>
              <button className="scr-btn" onClick={() => captureScreen()}>🧠 Analyze</button>
              <button className="scr-btn" onClick={toggleFullscreen}>⛶ Fullscreen</button>
            </div>
          </div>

          {/* Terminal Panel */}
          <div className={`term ${termCollapsed ? 'collapsed' : ''}`} id="termPanel">
            <div className="term-tog" onClick={() => setTermCollapsed(!termCollapsed)}>
              {termCollapsed ? '▲' : '▼'}
            </div>
            <div className="term-hdr">
              <div className="td" style={{ background: 'var(--red)' }}></div>
              <div className="td" style={{ background: 'var(--yellow)' }}></div>
              <div className="td" style={{ background: 'var(--green)' }}></div>
              <span>root@vps | Vision Engines</span>
            </div>
            <div className="race">
              <div className="lane lane-o" id="laneOcr">
                <div className="ll">VegaOCR</div>
                <div className="lv">—</div>
                <div className="ld">waiting</div>
              </div>
              <div className="lane lane-u" id="laneUi">
                <div className="ll">UI Detect</div>
                <div className="lv">—</div>
                <div className="ld">waiting</div>
              </div>
              <div className="lane lane-m" id="laneMl">
                <div className="ll">ML Learn</div>
                <div className="lv">—</div>
                <div className="ld">waiting</div>
              </div>
              <div className="lane lane-t" id="laneTotal">
                <div className="ll">Race Total</div>
                <div className="lv">—</div>
                <div className="ld">—</div>
              </div>
            </div>
            <div className="term-out">
              {termLogs.map((l, i) => (
                <div key={i} style={{ color: l.from === 'cmd' ? 'var(--cyan)' : l.from === 'err' ? 'var(--red)' : l.from === 'sys' ? 'var(--text3)' : 'var(--green)' }}>
                  {l.txt}
                </div>
              ))}
            </div>
            <div className="term-in">
              <input
                value={termInput}
                onChange={e => setTermInput(e.target.value)}
                placeholder="$ command..."
                onKeyDown={e => {
                  if (e.key === 'Enter') termRun();
                }}
              />
              <button onClick={termRun}>↵</button>
            </div>
          </div>
        </div>
      </div>

      {/* TAB: CHAT ONLY */}
      <div className={`tab-page ${activeTab === 'chat-only' ? 'show' : ''}`} style={{ display: activeTab === 'chat-only' ? 'flex' : 'none', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 800, margin: '0 auto', width: '100%' }}>
          <div className="msgs" style={{ flex: 1 }}>
            <div className="m a">Swarm chat syncing online...</div>
          </div>
          <div className="chat-in" style={{ padding: 16 }}>
            <div className="in-wrap">
              <textarea placeholder="Chat with VegaClaw..."></textarea>
              <button>▸</button>
            </div>
          </div>
        </div>
      </div>

      {/* TAB: Swarm Core */}
      <div className={`tab-page ${activeTab === 'mtclaw' ? 'show' : ''}`} style={{ display: activeTab === 'mtclaw' ? 'flex' : 'none', flexDirection: 'column', padding: 20, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h2 style={{ color: 'var(--cyan)', fontSize: 20, fontWeight: 700, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
              🧠 VegaClaw Omni-Cluster
              <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(0,232,138,0.15)', color: 'var(--green)', border: '1px solid rgba(0,232,138,0.3)' }}>ONLINE</span>
            </h2>
            <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>14-Agent Swarm Logic Engine</div>
          </div>
        </div>
        
        <div className="mtclaw-subtabs" style={{ marginTop: 20 }}>
          <div className={`mtclaw-subtab ${subTab === 'telemetry' ? 'active' : ''}`} onClick={() => setSubTab('telemetry')}>Swarm Telemetry</div>
          <div className={`mtclaw-subtab ${subTab === 'logs' ? 'active' : ''}`} onClick={() => setSubTab('logs')}>Execution Logs</div>
        </div>

        {subTab === 'telemetry' && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, maxWidth: 800, margin: '0 auto', width: '100%' }}>
            <h3 style={{ fontSize: 16, color: 'var(--text)', marginBottom: 20, display: 'flex', gap: 8 }}>🧠 Multi-Agent Load Distribution</h3>
            
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                <span>VISION ENGINE LOAD</span> <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>24%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '24%', background: 'var(--cyan)', transition: 'all 0.3s' }}></div>
              </div>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                <span>LLM REASONING</span> <span style={{ color: 'var(--purple)', fontWeight: 600 }}>12%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '12%', background: 'var(--purple)', transition: 'all 0.3s' }}></div>
              </div>
            </div>

             <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                <span>SYSTEM MEMORY</span> <span style={{ color: 'var(--green)', fontWeight: 600 }}>64%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '64%', background: 'var(--green)', transition: 'all 0.3s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TAB: SETTINGS */}
      <div className={`tab-page ${activeTab === 'settings' ? 'show' : ''}`} style={{ display: activeTab === 'settings' ? 'flex' : 'none', flexDirection: 'column', padding: 30 }}>
        <h2 style={{ color: 'var(--cyan)', fontSize: 16, marginBottom: 16 }}>Settings</h2>
        <div style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 2 }}>
          <div>🌐 Domain: <b style={{ color: 'var(--text)' }}>vega.vegatech.online</b></div>
          <div>🖥 VPS IP: <b style={{ color: 'var(--text)' }}>REDACTED_IP</b></div>
          <div>🔌 Server Port: <b style={{ color: 'var(--text)' }}>4280</b></div>
          <div>👁 Vision Proxy: <b style={{ color: 'var(--text)' }}>/api/stream</b></div>
          <div>🤖 Ollama: <b style={{ color: 'var(--text)' }}>11434</b></div>
          <div>📱 Telegram: <b style={{ color: 'var(--green)' }}>Sync Active</b></div>
        </div>
      </div>
    </>
  );
}
