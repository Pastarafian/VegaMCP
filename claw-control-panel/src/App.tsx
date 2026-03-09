import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, MessageSquare, 
  BrainCircuit, Terminal, 
  Layers, Globe,
  Zap, Clock, Monitor,
  Send
} from 'lucide-react';


interface Message {
  role: 'user' | 'system' | 'assistant';
  text: string;
  thinking?: string;
}

const BRIDGE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://127.0.0.1:42019' 
  : window.location.origin + '/bridge';

const getAuthCookie = () => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; vegatech_auth=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
  return null;
};

const getAuthToken = () => getAuthCookie() || localStorage.getItem('vega_session');

const apiFetch = async (endpoint: string, options: any = {}) => {
  const token = getAuthToken();
  const headers = { 
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  return fetch(`${BRIDGE}${endpoint}`, { 
    ...options, 
    headers,
    credentials: 'include' 
  });
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'vps' | 'chat' | 'settings'>('vps'); 
  const [fleet, setFleet] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(false);


  // Poll for live telemetry
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const statusResp = await apiFetch('/status').then(r => r.json());
        setFleet(statusResp.fleet || []);
        setIsOnline(statusResp.status === 'online');
      } catch (e) { 
        setIsOnline(false);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#0b1120] text-[#e2e8f0] font-['Inter',system-ui,sans-serif] overflow-hidden select-none">
      
      {/* ══ Top Header Bar ══ */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-[#0b1120] border-b border-[#1e293b]/60 shrink-0">
        {/* Left: Logo + Connection */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[#06b6d4] text-xl font-black tracking-tight">VEGACLAW</span>
          </div>
          <span className="text-[#64748b] text-xs">Command Center</span>
          <div className="flex items-center gap-1.5 ml-2">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#22c55e] shadow-[0_0_6px_#22c55e]' : 'bg-red-500'}`} />
            <span className={`text-xs font-medium ${isOnline ? 'text-[#22c55e]' : 'text-red-500'}`}>
              {isOnline ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Right: Metric badges */}
        <div className="flex items-center gap-2">
          <MetricBadge label="OCR" value="0" color="blue" />
          <MetricBadge label="UI" value="0" color="blue" />
          <MetricBadge label="ML" value="0" color="blue" />
          <MetricBadge label="RTn" value="OK" color="green" />
        </div>
      </header>

      {/* ══ Tab Navigation ══ */}
      <nav className="flex items-center gap-1 px-5 py-1.5 bg-[#0b1120] border-b border-[#1e293b]/60 shrink-0">
        <NavTab active={activeTab === 'vps'} onClick={() => setActiveTab('vps')} icon={<Monitor className="w-4 h-4" />} label="VPS Control" />
        <NavTab active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare className="w-4 h-4" />} label="Chat" />
        <NavTab active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings className="w-4 h-4" />} label="Settings" />
      </nav>

      {/* ══ Main Content ══ */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'vps' && <VPSControlTab />}
        {activeTab === 'chat' && <ChatTab fleet={fleet} />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>


    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/* Small Components                                               */
/* ═══════════════════════════════════════════════════════════════ */

function MetricBadge({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-[#1e3a5f] text-[#60a5fa] border-[#2563eb]/30',
    green: 'bg-[#14532d]/60 text-[#4ade80] border-[#22c55e]/30',
    red: 'bg-red-950/60 text-red-400 border-red-500/30',
  };
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold ${colorMap[color] || colorMap.blue}`}>
      <span className="opacity-70">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function NavTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200
        ${active 
          ? 'bg-[#3b82f6] text-white shadow-[0_0_12px_rgba(59,130,246,0.3)]' 
          : 'text-[#94a3b8] hover:text-white hover:bg-white/5'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}



/* ═══════════════════════════════════════════════════════════════ */
/* VPS Control Tab                                                */
/* ═══════════════════════════════════════════════════════════════ */

function VPSControlTab() {
  const [activeSubTab, setActiveSubTab] = useState('matrix');
  const [chatInput, setChatInput] = useState('');

  return (
    <div className="flex-1 flex overflow-hidden">
      
      {/* ── Left Sidebar (Swarm Copilot Style) ── */}
      <aside className="w-[320px] bg-[#0a0e17] border-r border-[#1e293b] flex flex-col shrink-0 relative z-10 shadow-2xl">
        <div className="p-4 border-b border-[#1e293b] bg-[#0a0e17]">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 tracking-tight">
            <BrainCircuit className="w-5 h-5 text-[#06b6d4]" /> Agentic Control
          </h2>
          <div className="flex gap-2 mt-4">
            <button className="flex-1 py-1.5 bg-black hover:bg-white/5 text-[#94a3b8] text-[11px] font-bold rounded-full border border-[#1e293b] transition-colors flex justify-center items-center gap-1"><Zap className="w-3 h-3"/> Audit</button>
            <button className="flex-1 py-1.5 bg-black hover:bg-white/5 text-[#94a3b8] text-[11px] font-bold rounded-full border border-[#1e293b] transition-colors flex justify-center items-center gap-1"><Monitor className="w-3 h-3 text-[#f59e0b]"/> Screen</button>
            <button className="flex-1 py-1.5 bg-black hover:bg-white/5 text-[#94a3b8] text-[11px] font-bold rounded-full border border-[#1e293b] transition-colors flex justify-center items-center gap-1"><Terminal className="w-3 h-3 text-[#06b6d4]"/> Shell</button>
            <button className="flex-1 py-1.5 bg-black hover:bg-white/5 text-[#94a3b8] text-[11px] font-bold rounded-full border border-[#1e293b] transition-colors flex justify-center items-center gap-1">Clear</button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black/40">
          <div className="mb-4 bg-[#0a0e17] border border-[#1e293b] rounded-xl p-4 shadow-lg">
            <h3 className="text-[13px] font-bold text-white mb-2">VegaClaw Engine Active 🦀</h3>
            <p className="text-[12px] text-[#94a3b8] leading-relaxed">I have full agentic control. I can use computer vision, navigate the UI, or manage the VPS. What are we building?</p>
          </div>
        </div>

        <div className="p-4 bg-[#0a0e17] border-t border-[#1e293b]">
          <div className="relative">
            <input 
              type="text" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask the swarm..." 
              className="w-full bg-black border border-[#1e293b] rounded-xl px-4 py-3 pr-12 text-sm text-white focus:border-[#a855f7] outline-none transition-colors" 
            />
            <button className="absolute right-2 top-2 p-1.5 bg-[#06b6d4] hover:bg-[#06b6d4]/90 text-white rounded-[10px] transition-transform active:scale-95 shadow-md flex items-center justify-center w-8 h-8">
              <div className="w-0 h-0 border-t-4 border-t-transparent border-l-6 border-l-white border-b-4 border-b-transparent ml-1"></div>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content Block ── */}
      <main className="flex-1 overflow-hidden relative flex flex-col bg-[#0a0e17] shadow-[inset_20px_0_30px_-20px_rgba(0,0,0,0.5)]">
        
        {/* ── Secondary Tab Bar (Matrix Ops Style) ── */}
        <div className="h-10 bg-[#0a0e17] border-b border-[#1e293b] flex items-end px-2 shrink-0">
           <div 
             onClick={() => setActiveSubTab('matrix')}
             className={`px-5 py-1.5 border border-[#1e293b] border-b-0 rounded-t-md text-[12px] font-bold flex items-center gap-2 mr-1 cursor-pointer transition-colors ${activeSubTab === 'matrix' ? 'bg-[#111823] text-white' : 'bg-transparent text-[#94a3b8] border-transparent hover:text-white'}`}>
              <Layers className="w-3.5 h-3.5 text-[#06b6d4]" /> Matrix View
           </div>
           <div 
             onClick={() => setActiveSubTab('desktop')}
             className={`px-5 py-1.5 border border-[#1e293b] border-b-0 rounded-t-md text-[12px] font-bold flex items-center gap-2 mr-1 cursor-pointer transition-colors ${activeSubTab === 'desktop' ? 'bg-[#111823] text-white' : 'bg-transparent text-[#94a3b8] border-transparent hover:text-white'}`}>
              <div className="w-3 h-3 bg-[#3b82f6] rounded-sm"></div> Desktop (noVNC)
           </div>
           <div 
             onClick={() => setActiveSubTab('terminal')}
             className={`px-5 py-1.5 border border-[#1e293b] border-b-0 rounded-t-md text-[12px] font-bold flex items-center gap-2 mr-1 cursor-pointer transition-colors ${activeSubTab === 'terminal' ? 'bg-[#111823] text-white' : 'bg-transparent text-[#94a3b8] border-transparent hover:text-white'}`}>
              <div className="w-3 h-3 bg-[#f59e0b] rounded-sm" style={{transform: "rotate(45deg)"}}></div> Terminal (tty)
           </div>
           <div 
             onClick={() => setActiveSubTab('pm2')}
             className={`px-5 py-1.5 border border-[#1e293b] border-b-0 rounded-t-md text-[12px] font-bold flex items-center gap-2 mr-1 cursor-pointer transition-colors ${activeSubTab === 'pm2' ? 'bg-[#111823] text-white' : 'bg-transparent text-[#94a3b8] border-transparent hover:text-white'}`}>
              <div className="w-3 h-3 bg-white opacity-80 rounded-sm"></div> Process Manager
           </div>
           <div 
             onClick={() => setActiveSubTab('fullide')}
             className={`px-5 py-1.5 border border-[#1e293b] border-b-0 rounded-t-md text-[12px] font-bold flex items-center gap-2 mr-1 cursor-pointer transition-colors ${activeSubTab === 'fullide' ? 'bg-[#111823] text-white' : 'bg-transparent text-[#94a3b8] border-transparent hover:text-white'}`}>
              <div className="w-3 h-3 bg-[#06b6d4] rounded-full"></div> Full IDE (Antigravity)
           </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-[#2a2d2a]/5">
          <div className="flex items-center justify-between px-4 py-1.5 bg-[#0b1612]">
              <div className="text-[12px] font-bold text-[#4ade80] flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> Live VPS Feed
              </div>
              <div className="text-[10px] text-[#4ade80]/60 font-mono">
                  Permanent Display: Desktop / Terminals
              </div>
          </div>
          <div className="flex-1 overflow-auto m-1 ring-1 ring-[#1e293b] relative bg-black flex items-center justify-center">
              <img 
                id="vps-stream"
                src={`${BRIDGE}/api/stream?t=${Date.now()}`} 
                className="w-full h-full object-contain z-10" 
                alt="VPS Stream"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const ph = document.getElementById('stream-placeholder');
                  if (ph) ph.style.display = 'flex';
                }}
                onLoad={(e) => {
                  e.currentTarget.style.display = 'block';
                  const ph = document.getElementById('stream-placeholder');
                  if (ph) ph.style.display = 'none';
                }}
              />
              <div id="stream-placeholder" className="absolute inset-0 flex items-center justify-center flex-col text-center bg-[#0d1117] z-0 hidden">
                <div className="w-16 h-16 rounded-xl bg-[#1e293b]/50 border border-[#1e293b] flex items-center justify-center mx-auto mb-4">
                  <Monitor className="w-8 h-8 text-[#334155]" />
                </div>
                <p className="text-[#334155] text-sm font-medium">VPS Display Stream</p>
                <p className="text-[#1e293b] text-[11px] mt-1">Awaiting vision feed connection...</p>
              </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/* Chat Tab                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function ChatTab({ fleet }: { fleet: any[] }) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeAgent = fleet[0];
  
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'system', 
      text: 'Swarm Intelligence Active 🦐. I have full agentic control. What are we building?',
      thinking: 'Initialized 14-agent swarm. Ready for high-fidelity code synthesis on remote gateways.'
    },
  ]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg: Message = { role: 'user', text: input };
    setMessages([...messages, userMsg]);
    const cmd = input;
    setInput('');
    setIsLoading(true);
    try {
      const resp = await apiFetch('/command', {
        method: 'POST',
        body: JSON.stringify({ action: 'chat', text: cmd, agent_id: activeAgent?.id || 'vps-1' })
      });
      const result = await resp.json();
      let answer = result.ai_hint || (result.success ? "Action complete." : "Command failed.");
      let thinking = "";
      const thinkMatch = answer.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch) {
         thinking = thinkMatch[1].trim();
         answer = answer.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      }
      setMessages(m => [...m, { role: 'system', text: answer, thinking: thinking || result.reasoning }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'system', text: "Bridge connection failed. Is Control Server running on 42019?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Chat Messages */}
      <div className="flex-1 flex flex-col bg-[#0f172a]">
        <div className="px-5 py-3 border-b border-[#1e293b]/40 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-[#06b6d4]'}`} />
          <span className="text-xs font-semibold text-[#94a3b8]">
            {isLoading ? 'Processing...' : 'AI Command Terminal'}
          </span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fadeIn`}>
              <div className={`max-w-[85%] p-4 rounded-xl text-[13px] leading-relaxed
                ${msg.role === 'user' 
                  ? 'bg-[#06b6d4]/15 border border-[#06b6d4]/20 text-white rounded-br-none' 
                  : 'bg-[#0b1120] border border-[#1e293b]/60 text-[#e2e8f0] rounded-bl-none'}`}>
                
                {msg.thinking && (
                  <div className="mb-3 p-3 bg-white/5 border border-white/5 rounded-lg text-[11px] text-[#94a3b8] italic">
                    <div className="flex items-center gap-2 mb-1 uppercase font-bold text-[9px] tracking-widest text-[#06b6d4]">
                      <BrainCircuit className="w-3 h-3" /> Reasoning
                    </div>
                    {msg.thinking}
                  </div>
                )}
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>
              <span className="text-[9px] text-[#475569] mt-1 uppercase font-bold tracking-widest px-2">
                {msg.role === 'user' ? 'Commander' : 'VegaClaw'}
              </span>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-[#1e293b]/40">
          <form onSubmit={handleSend} className="relative">
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              placeholder="Type command for the swarm..."
              className="w-full bg-[#0b1120] border border-[#1e293b]/60 rounded-lg p-3 pr-12 text-sm text-white focus:border-[#06b6d4]/40 outline-none min-h-[50px] max-h-[150px] transition-all resize-none"
            />
            <button type="submit" className="absolute right-2.5 bottom-2.5 p-2 bg-[#06b6d4] hover:bg-[#06b6d4]/80 text-white rounded-md transition-transform active:scale-95">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/* Settings Tab                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function SettingsTab() {
  return (
    <div className="flex-1 overflow-y-auto p-8 animate-fadeIn">
      <div className="mb-8">
        <h2 className="text-xl font-bold tracking-tight mb-1 text-white">System Configuration</h2>
        <p className="text-sm text-[#64748b]">Manage Control Bridge ports and agent registry gateways.</p>
      </div>
      
      <div className="max-w-3xl space-y-6">
        <div className="bg-[#0f172a] border border-[#1e293b]/60 rounded-xl p-6">
          <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#06b6d4]" /> Connection Infrastructure
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">Control Bridge Port (HTTP)</label>
              <div className="flex items-center gap-3 bg-[#0b1120] border border-[#1e293b]/60 rounded-lg px-4 py-3">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-white font-mono font-bold">42019</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">Tauri Asset Port</label>
              <div className="flex items-center gap-3 bg-[#0b1120] border border-[#1e293b]/60 rounded-lg px-4 py-3">
                <Clock className="w-4 h-4 text-[#a855f7]" />
                <span className="text-white font-mono font-bold">42018</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-red-950/20 border border-red-500/20 rounded-xl p-6">
          <h3 className="text-sm font-bold text-red-400 mb-2">DANGER: NEURAL PURGE</h3>
          <p className="text-xs text-[#64748b] mb-4">Executing this will permanently delete all learned agent positions and project memories.</p>
          <button className="px-6 py-2.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-500/30 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all">
            Execute System Reset
          </button>
        </div>
      </div>
    </div>
  );
}
