import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Monitor, 
  MessageSquare, 
  Cpu, 
  Settings, 
  Terminal as TermIcon, 
  Zap, 
  ShieldCheck, 
  Activity, 
  Layout, 
  CircleDot,
  MousePointer2,
  Lock,
  Search
} from 'lucide-react';



export default function App() {
  const [activeTab, setActiveTab] = useState('vegaclaw');
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const [agentPrompt, setAgentPrompt] = useState('');
  const [injectStatus, setInjectStatus] = useState('');

  const handleInject = async () => {
    if(!agentPrompt.trim()) return;
    setInjectStatus('Injecting...');
    try {
        const res = await fetch('http://127.0.0.1:4242/api/inject', {
            method: 'POST',
            body: JSON.stringify({prompt: agentPrompt})
        });
        if(res.ok) {
            setInjectStatus('Prompt Injected!');
            setAgentPrompt('');
            setTimeout(() => setInjectStatus(''), 3000);
        } else {
            setInjectStatus('Failed to inject');
        }
    } catch(e) {
        setInjectStatus('Bridge disconnected');
    }
  };

  const [taskOn, setTaskOn] = useState(false);
  const [stats] = useState({ ocr: 142, ui: 12, ml: 4, win: '96%' });
  const [vpsChat, setVpsChat] = useState<{role: 'system'|'user'|'agent', msg: string, tag?: string}[]>([
    { role: 'system', msg: 'VegaClaw Omni-Swarm Active 🦅' }
  ]);
  const [vpsChatIn, setVpsChatIn] = useState('');
  const [streamTick] = useState(Date.now());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const addChatLog = (role: 'user'|'agent'|'system', msg: string, tag?: string) => {
    setVpsChat(p => [...p, { role, msg, tag }]);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [vpsChat]);

  const sendVpsChat = async (text?: string) => {
    const t = text || vpsChatIn.trim();
    if (!t || taskOn) return;
    setVpsChatIn('');
    addChatLog('user', t);
    setTaskOn(true);
    setTimeout(() => {
      addChatLog('agent', 'Command accepted. Orchestrating swarm...', 'act');
      setTaskOn(false);
    }, 1000);
  };

  const tabs = [
    { id: 'vps', label: 'VPS Live', icon: Monitor },
    { id: 'vegaclaw', label: 'VegaClaw', icon: MousePointer2 },
    { id: 'swarm', label: 'Swarm Core', icon: Cpu },
    { id: 'chat', label: 'Terminal', icon: TermIcon },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#05050a] text-slate-200">
      {/* HEADER */}
      <header className="hdr">
        <div className="logo-container">
          <div className="logo">VEGACLAW</div>
          <div className="logo-sub">Hyper-Agentic Command Centre</div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="conn">
            <div className="conn-dot"></div>
            <span>SWARM ONLINE</span>
          </div>
          <div className="hdr-r hidden md:flex">
            <div className="badge">OCR <b>{stats.ocr}</b></div>
            <div className="badge">UI <b>{stats.ui}</b></div>
            <div className="badge">WIN <b>{stats.win}</b></div>
          </div>
        </div>
      </header>

      {/* TABS */}
      <nav className="flex bg-[#0a0a14] border-b border-white/5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 
              ${activeTab === t.id 
                ? 'text-cyan-400 border-cyan-400 bg-cyan-400/5' 
                : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/5'}`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          
          {/* VEGACLAW TAB */}
          {activeTab === 'vegaclaw' && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 p-8 overflow-y-auto"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-2 space-y-6">
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
                      <Zap className="text-cyan-400" /> Multi-Threaded Automation
                    </h2>
                    <p className="text-slate-400 mb-6 leading-relaxed">
                      VegaClaw v10 is orchestrating autonomously via the Chrome DevTools Protocol. 
                      It is currently monitoring 4 Antigravity instances for 'Run', 'Accept', and 'Allow' buttons.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Status', val: 'Active', color: 'text-emerald-400' },
                        { label: 'Mode', val: 'Shadow Scan', color: 'text-cyan-400' },
                        { label: 'Latency', val: '42ms', color: 'text-amber-400' },
                        { label: 'Coverage', val: '100%', color: 'text-purple-400' },
                      ].map(s => (
                        <div key={s.label} className="p-3 rounded-lg bg-black/40 border border-white/5">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">{s.label}</div>
                          <div className={`text-sm font-bold ${s.color}`}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                      <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                        <Lock size={16} className="text-amber-400" /> Typing Protection
                      </h3>
                      <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-400/10 border border-emerald-400/20">
                        <span className="text-xs font-bold text-emerald-400 uppercase">Input Detection Active</span>
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981]"></div>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-4 italic">
                        Bot will pause for 5 seconds after any key press to ensure zero-interference typing.
                      </p>
                    </div>
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                      <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                        <Search size={16} className="text-purple-400" /> Deep Scanner
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Recursive Shadow DOM Depth</span>
                          <span>Unlimited</span>
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="w-full h-full bg-purple-500"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-indigo-500/20">
                    <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                       <MessageSquare size={16} className="text-indigo-400" /> Agentic Prompt Injector
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">
                       Send prompts directly into the Antigravity terminal or chat interface via CDP.
                    </p>
                    <div className="flex gap-2">
                       <input 
                         value={agentPrompt}
                         onChange={e => setAgentPrompt(e.target.value)}
                         onKeyDown={e => e.key === 'Enter' && handleInject()}
                         placeholder="e.g. Write a script to monitor website uptime..."
                         className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-xs focus:border-indigo-500 outline-none"
                       />
                       <button onClick={handleInject} className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-400 font-bold text-xs uppercase tracking-wider transition-colors">
                         Inject
                       </button>
                    </div>
                    {injectStatus && <div className="text-[10px] mt-2 text-indigo-400">{injectStatus}</div>}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-cyan-500/20">
                    <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-cyan-400">Swarm Health</h3>
                    <div className="space-y-4">
                      {['Core Engine', 'Shadow Finder', 'CDP Bridge', 'Typing Guard'].map(h => (
                        <div key={h} className="flex items-center justify-between">
                          <span className="text-xs text-slate-300">{h}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">STABLE</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* VPS LIVE TAB */}
          {activeTab === 'vps' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex overflow-hidden"
            >
              {/* CHAT PANEL */}
              <div className={`chat-col ${chatCollapsed ? 'w-11' : 'w-72'}`}>
                <div className="chat-toggle" onClick={() => setChatCollapsed(!chatCollapsed)}>
                  {chatCollapsed ? <CircleDot size={12} /> : <CircleDot size={12} />}
                </div>
                {!chatCollapsed && (
                  <div className="flex flex-col h-full bg-[#0a0a14]">
                    <div className="p-4 border-b border-white/5">
                      <div className="text-xs font-bold uppercase tracking-widest text-cyan-400">Agentic Control</div>
                      <div className="text-[10px] text-slate-500">Vision-driven VPS actions</div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {vpsChat.map((m, i) => (
                        <div key={i} className={`text-xs p-3 rounded-xl border ${m.role === 'user' ? 'bg-cyan-500/10 border-cyan-500/20 ml-4' : 'bg-white/5 border-white/10 mr-4'}`}>
                          {m.msg}
                        </div>
                      ))}
                    </div>
                    <div className="p-4 border-t border-white/5">
                      <div className="flex gap-2">
                        <textarea 
                          value={vpsChatIn}
                          onChange={e => setVpsChatIn(e.target.value)}
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:border-cyan-500 outline-none"
                          placeholder="Speak to the swarm..."
                        />
                        <button onClick={() => sendVpsChat()} className="p-2 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 transition-colors">
                          <Zap size={14} fill="currentColor" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SCREEN PANEL */}
              <div 
                className="flex-1 flex flex-col bg-black overflow-hidden relative focus:outline-none"
                tabIndex={0}
                onKeyDown={(e) => {
                  e.preventDefault();
                  let key = e.key;
                  if (key.length === 1 || key === 'Enter' || key === 'Backspace' || key === 'Tab' || key === 'Escape') {
                    fetch('/bridge/type', {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({ key: key })
                    }).catch(() => {});
                  }
                }}
              >
                <div className="flex-1 flex items-center justify-center p-4 relative">
                  <img 
                    src={`/api/stream?t=${streamTick}`} 
                    className="max-w-full max-h-full object-contain rounded-lg border border-white/5 shadow-2xl cursor-crosshair" 
                    alt="VPS Live View" 
                    draggable={false}
                    onClick={(e) => {
                      const rect = (e.target as HTMLImageElement).getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      const width = rect.width;
                      const height = rect.height;
                      // Calculate percentage relative to image bounds
                      const pctX = x / width;
                      const pctY = y / height;
                      // Assuming 1920x1080 native resolution as per KI
                      const nativeX = Math.round(pctX * 1920);
                      const nativeY = Math.round(pctY * 1080);
                      
                      fetch('/bridge/click', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ x: nativeX, y: nativeY })
                      }).catch(() => {});
                    }}
                  />
                  
                  {/* LIVE BADGE overlays */}
                  <div className="absolute top-6 left-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 border border-emerald-500/30 backdrop-blur-md">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">LIVE</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 backdrop-blur-md">
                      <span className="text-[10px] font-mono text-slate-400">1920×1080</span>
                    </div>
                  </div>
                  
                  <div className="absolute top-6 right-6 flex gap-2">
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold text-cyan-400 uppercase tracking-widest hover:bg-cyan-500/20 transition-all backdrop-blur-md">
                      <span>⟳ Reconnect</span>
                    </button>
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-purple-400 uppercase tracking-widest hover:bg-purple-500/20 transition-all backdrop-blur-md">
                      <span>🧠 Analyze</span>
                    </button>
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 uppercase tracking-widest hover:bg-white/10 transition-all backdrop-blur-md">
                      <span>⛶ Fullscreen</span>
                    </button>
                  </div>
                </div>
                
              </div>
            </motion.div>
          )}

          {/* SWARM TAB */}
          {activeTab === 'swarm' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 p-8 overflow-y-auto"
            >
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                   <h2 className="text-2xl font-bold flex items-center gap-3">
                     <Cpu className="text-purple-500" /> Omni-Cluster Radar
                   </h2>
                   <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                     14 Agents Online
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { name: 'System Architect', role: 'DeepSeek-V3', load: 12, color: 'bg-cyan-500' },
                    { name: 'Code Generator', role: 'Qwen-2.5', load: 64, color: 'bg-purple-500' },
                    { name: 'Vision Engine', role: 'VegaOCR-v2', load: 8, color: 'bg-emerald-500' },
                    { name: 'Search Agent', role: 'Searx-Omni', load: 0, color: 'bg-amber-500' },
                    { name: 'UI Specialist', role: 'Claw-UI', load: 22, color: 'bg-pink-500' },
                    { name: 'Security Guard', role: 'Vault-V8', load: 1, color: 'bg-red-500' },
                  ].map(a => (
                    <div key={a.name} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-xs font-bold">{a.name}</div>
                          <div className="text-[10px] text-slate-500">{a.role}</div>
                        </div>
                        <Activity size={16} className={a.load > 50 ? 'text-amber-500' : 'text-emerald-500'} />
                      </div>
                      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${a.load}%` }}
                          className={`h-full ${a.color}`}
                        ></motion.div>
                      </div>
                      <div className="flex justify-between mt-2 text-[9px] font-mono text-slate-600">
                        <span>Load: {a.load}%</span>
                        <span>{a.load > 0 ? 'ACTIVE' : 'IDLE'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 p-8 overflow-y-auto"
            >
              <div className="max-w-2xl mx-auto space-y-8">
                <section>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                    <ShieldCheck size={18} className="text-cyan-400" /> Resource Allocation
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-xs text-slate-400 font-bold uppercase">Hardware Allocation (VRAM/RAM)</span>
                        <span className="text-xs font-bold text-cyan-400">14 GB</span>
                      </div>
                      <input type="range" className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500" min="2" max="64" defaultValue="14" />
                      <div className="text-[10px] text-slate-600 mt-2 italic text-right">Recommended for 14-agent swarm concurrency</div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                    <Layout size={18} className="text-purple-400" /> Endpoint Connections
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {[
                       { label: 'VegaMCP Core', val: 'http://localhost:8000' },
                       { label: 'Swarm VPS Control', val: 'http://185.x.x.x:4280' },
                       { label: 'Ollama Engine', val: 'http://localhost:11434' },
                       { label: 'Telegram Relay', val: 'Active (+42)' },
                     ].map(e => (
                       <div key={e.label} className="p-4 rounded-xl bg-white/5 border border-white/10">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">{e.label}</div>
                        <code className="text-[11px] text-cyan-500/80">{e.val}</code>
                       </div>
                     ))}
                  </div>
                </section>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* FOOTER STATSBAR */}
      <footer className="h-8 bg-[#0a0a14] border-t border-white/5 flex items-center px-4 justify-between text-[10px] text-slate-500 font-mono">
        <div className="flex gap-4">
          <div className="flex items-center gap-1"><Zap size={10} className="text-cyan-500" /> Latency: 12ms</div>
          <div className="flex items-center gap-1"><MessageSquare size={10} className="text-purple-500" /> Buffers: 4.2k</div>
        </div>
        <div className="uppercase tracking-widest text-slate-600">Vega v7.2.0 • Build Mar2026-Alpha</div>
      </footer>
    </div>
  );
}
