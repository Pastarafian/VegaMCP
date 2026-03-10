import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Monitor, 
  MessageSquare, 
  Cpu, 
  Zap, 
  ShieldCheck, 
  Activity,
  Lock,
  Search,
  Send,
  Loader2,
  Bot,
  User,
  ChevronRight,
  Sparkles,
  Command,
  Database,
  Play,
  Pause,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  Terminal,
  Flame,
  BarChart3,
  Globe,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileCode,
  Rocket
} from 'lucide-react';

// ─── CONFIG ────────────────────────────────────────────────────
const BRIDGE_IP = import.meta.env.VITE_VPS_IP || '127.0.0.1';
const BRIDGE_PORT = import.meta.env.VITE_VPS_PORT || '4242';
const BRIDGE_URL = `http://${BRIDGE_IP}:${BRIDGE_PORT}`;

// ─── TYPES ─────────────────────────────────────────────────────
interface ChatMsg {
  id: string;
  role: 'system' | 'user' | 'agent';
  msg: string;
  time: string;
  tag?: string;
}

interface BridgeHealth {
  status: string;
  service?: string;
  connected: boolean;
  latencyMs: number;
}

interface BridgePage {
  title: string;
  url: string;
}

interface LogEntry {
  ts: string;
  level: 'info' | 'success' | 'warning' | 'error';
  source: string;
  message: string;
}

// ─── HELPERS ───────────────────────────────────────────────────
const ts = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const uid = () => Math.random().toString(36).substr(2, 9);

async function bridgeGet(path: string) {
  const t0 = performance.now();
  const r = await fetch(`${BRIDGE_URL}${path}`, { signal: AbortSignal.timeout(5000) });
  const latencyMs = Math.round(performance.now() - t0);
  return { data: await r.json(), latencyMs, ok: r.ok };
}

async function bridgePost(path: string, body: object) {
  const r = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { data: await r.json(), ok: r.ok };
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [activeTab, setActiveTab] = useState('vegaclaw');

  // ─── Bridge State ────────────────────────────────────────────
  const [health, setHealth] = useState<BridgeHealth>({ status: 'unknown', connected: false, latencyMs: 0 });
  const [pages, setPages] = useState<BridgePage[]>([]);
  const [aiStatus, setAiStatus] = useState<{ busy: boolean; connected: boolean }>({ busy: false, connected: false });
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((level: LogEntry['level'], source: string, message: string) => {
    setLogs(prev => [...prev.slice(-200), { ts: ts(), level, source, message }]);
  }, []);

  // ─── Polling Engine ──────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      while (alive) {
        try {
          const h = await bridgeGet('/api/health');
          setHealth({ status: h.data.status, service: h.data.service, connected: h.ok, latencyMs: h.latencyMs });

          const p = await bridgeGet('/api/pages');
          if (p.data?.pages) setPages(p.data.pages);

          const s = await bridgeGet('/api/status');
          if (s.data) setAiStatus({ busy: s.data.busy ?? false, connected: s.data.connected ?? false });
        } catch {
          setHealth(prev => ({ ...prev, connected: false }));
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    };
    poll();
    return () => { alive = false; };
  }, []);

  // ─── Inject State ────────────────────────────────────────────
  const [agentPrompt, setAgentPrompt] = useState('');
  const [injectStatus, setInjectStatus] = useState<'idle' | 'injecting' | 'success' | 'error'>('idle');

  const handleInject = async () => {
    if (!agentPrompt.trim()) return;
    setInjectStatus('injecting');
    try {
      const res = await bridgePost('/api/inject', { prompt: agentPrompt });
      if (res.ok) {
        setInjectStatus('success');
        addLog('success', 'Injector', `Prompt injected: ${agentPrompt.slice(0, 60)}...`);
        addChatLog('user', agentPrompt);
        setAgentPrompt('');
        setTimeout(() => {
          addChatLog('agent', 'Directive received. Executing via CDP bridge.', 'ack');
        }, 800);
        setTimeout(() => setInjectStatus('idle'), 2500);
      } else {
        setInjectStatus('error');
        addLog('error', 'Injector', 'Bridge returned non-OK status');
        setTimeout(() => setInjectStatus('idle'), 2500);
      }
    } catch {
      setInjectStatus('error');
      addLog('error', 'Injector', `Bridge unreachable at ${BRIDGE_URL}`);
      setTimeout(() => setInjectStatus('idle'), 2500);
    }
  };

  // ─── Chat State ──────────────────────────────────────────────
  const [vpsChat, setVpsChat] = useState<ChatMsg[]>([
    { id: uid(), role: 'system', msg: 'VegaClaw Omni-Swarm initialized. Bridge polling active.', time: ts() }
  ]);
  const [vpsChatIn, setVpsChatIn] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const addChatLog = useCallback((role: ChatMsg['role'], msg: string, tag?: string) => {
    setVpsChat(p => [...p, { id: uid(), role, msg, time: ts(), tag }]);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [vpsChat]);

  const sendVpsChat = async (text?: string) => {
    const t = text || vpsChatIn.trim();
    if (!t) return;
    setVpsChatIn('');
    addChatLog('user', t);
    // Attempt to inject to bridge
    try {
      await bridgePost('/api/inject', { prompt: t });
      addLog('info', 'Chat', `Sent to bridge: ${t.slice(0, 50)}`);
      setTimeout(() => addChatLog('agent', 'Directive acknowledged. VegaClaw autoclicker will handle subsequent approvals.', 'act'), 1200);
    } catch {
      addChatLog('system', 'Bridge unreachable. Message saved locally.', 'err');
    }
  };

  // ─── RLM Pipeline State (REAL — talks to bridge backend) ─────
  const [forgeRunning, setForgeRunning] = useState(false);
  const [forgeGoal, setForgeGoal] = useState('Create beautiful websites that generate ad revenue');
  const [forgeModel, setForgeModel] = useState('llama3');
  const [forgePid, setForgePid] = useState<number | null>(null);
  const [forgeLog, setForgeLog] = useState<string[]>([]);
  const forgeLogRef = useRef<HTMLDivElement>(null);

  // Poll RLM status + log every 2s when tab is active
  useEffect(() => {
    let alive = true;
    const pollRlm = async () => {
      while (alive) {
        try {
          const s = await bridgeGet('/api/rlm/status');
          if (s.data) {
            setForgeRunning(s.data.running);
            setForgePid(s.data.pid);
          }
          if (s.data?.running || forgeLog.length > 0) {
            const l = await bridgeGet('/api/rlm/log');
            if (l.data?.lines) setForgeLog(l.data.lines);
          }
        } catch {}
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    pollRlm();
    return () => { alive = false; };
  }, []);

  // Auto-scroll forge log
  useEffect(() => {
    forgeLogRef.current?.scrollTo({ top: forgeLogRef.current.scrollHeight, behavior: 'smooth' });
  }, [forgeLog]);

  const startForge = async () => {
    if (!forgeGoal.trim()) return;
    try {
      const res = await bridgePost('/api/rlm/start', { goal: forgeGoal, model: forgeModel });
      if (res.data?.ok) {
        setForgeRunning(true);
        addLog('success', 'RLM', `Pipeline ignited: ${forgeGoal}`);
      } else {
        addLog('warning', 'RLM', res.data?.message || 'Could not start');
      }
    } catch {
      addLog('error', 'RLM', `Bridge unreachable at ${BRIDGE_URL}`);
    }
  };

  const stopForge = async () => {
    try {
      const res = await bridgePost('/api/rlm/stop', {});
      if (res.data?.ok) {
        setForgeRunning(false);
        setForgePid(null);
        addLog('warning', 'RLM', 'Pipeline halted by operator');
      }
    } catch {
      addLog('error', 'RLM', 'Failed to stop pipeline');
    }
  };

  // ─── TABS CONFIG ─────────────────────────────────────────────
  const tabs = [
    { id: 'vegaclaw', label: 'Command Centre', icon: Command, color: 'text-indigo-400' },
    { id: 'vps', label: 'VPS Live View', icon: Monitor, color: 'text-cyan-400' },
    { id: 'forge', label: 'FORGE Pipeline', icon: Flame, color: 'text-orange-400' },
    { id: 'swarm', label: 'Swarm Core', icon: Cpu, color: 'text-fuchsia-400' },
    { id: 'logs', label: 'System Logs', icon: Database, color: 'text-emerald-400' },
  ];

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0a0a0f] text-slate-200 selection:bg-indigo-500/30 font-['Outfit',sans-serif]">
      {/* AMBIENT GLOW */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-[20%] right-[-10%] w-[30%] h-[50%] bg-cyan-600/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] left-[20%] w-[50%] h-[40%] bg-fuchsia-600/10 blur-[140px] rounded-full mix-blend-screen" />
      </div>

      {/* HEADER */}
      <header className="relative z-20 flex items-center justify-between px-8 py-5 border-b border-indigo-500/10 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] border border-indigo-500/30">
            <Sparkles className="text-cyan-400 w-6 h-6" />
            <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-cyan-200">
              VEGACLAW UI
            </h1>
            <p className="text-[10px] font-bold tracking-[0.2em] text-indigo-400 uppercase">Hyper-Agentic Operating System</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Latency Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/10">
            <Clock size={12} className="text-slate-500" />
            <span className="text-[10px] font-mono text-slate-400">{health.latencyMs}ms</span>
          </div>
          {/* Connection Status */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${health.connected ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className={`w-2 h-2 rounded-full ${health.connected ? 'bg-emerald-400 shadow-[0_0_10px_#10b981] animate-pulse' : 'bg-red-400 shadow-[0_0_10px_#ef4444]'}`} />
            <span className={`text-[10px] font-bold tracking-widest uppercase ${health.connected ? 'text-emerald-400' : 'text-red-400'}`}>
              {health.connected ? 'Bridge Online' : 'Bridge Offline'}
            </span>
          </div>
          {/* AI Status */}
          {aiStatus.connected && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${aiStatus.busy ? 'bg-amber-500/10 border-amber-500/20' : 'bg-cyan-500/10 border-cyan-500/20'}`}>
              {aiStatus.busy ? <Loader2 size={12} className="animate-spin text-amber-400" /> : <CheckCircle size={12} className="text-cyan-400" />}
              <span className={`text-[10px] font-bold tracking-widest uppercase ${aiStatus.busy ? 'text-amber-400' : 'text-cyan-400'}`}>
                {aiStatus.busy ? 'AI Working' : 'AI Idle'}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* SIDEBAR */}
        <aside className="w-64 flex flex-col pt-8 bg-[#0d0d14]/60 backdrop-blur-2xl border-r border-indigo-500/10">
          <div className="px-6 mb-6">
            <h2 className="text-[11px] font-bold tracking-[0.1em] text-slate-500 uppercase">Dashboards</h2>
          </div>
          <nav className="flex flex-col gap-2 px-4">
            {tabs.map(t => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${isActive ? 'bg-indigo-500/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
                >
                  {isActive && (
                    <motion.div layoutId="nav-bg" className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent rounded-xl border border-indigo-500/20" />
                  )}
                  <t.icon size={18} className={`relative z-10 ${isActive ? t.color : 'opacity-60 group-hover:opacity-100'}`} />
                  <span className="relative z-10 text-sm font-semibold tracking-wide">{t.label}</span>
                  {t.id === 'forge' && forgeRunning && (
                    <span className="relative z-10 ml-auto w-2 h-2 rounded-full bg-orange-400 animate-pulse shadow-[0_0_8px_#f97316]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Stats */}
          <div className="mt-auto p-6 border-t border-indigo-500/10 bg-gradient-to-b from-transparent to-[#0a0a0f]">
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-black/40 border border-white/5 shadow-inner">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Active Pages</span>
                <span className="text-cyan-400 font-mono font-bold">{pages.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Bridge Target</span>
                <span className="text-indigo-400 font-mono text-[10px]">{BRIDGE_IP}:{BRIDGE_PORT}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Latency</span>
                <span className={`font-mono font-bold ${health.latencyMs < 100 ? 'text-emerald-400' : health.latencyMs < 500 ? 'text-amber-400' : 'text-red-400'}`}>
                  {health.latencyMs}ms
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-500" style={{ width: `${Math.min(100, health.latencyMs / 5)}%` }} />
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0f]">
          <AnimatePresence mode="popLayout">

            {/* ════════════════════ COMMAND CENTRE TAB ════════════════════ */}
            {activeTab === 'vegaclaw' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -10 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex flex-col h-full overflow-y-auto p-8 custom-scrollbar"
              >
                <div className="max-w-6xl w-full mx-auto space-y-8">
                  {/* HERO STATS */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                      { l: 'Bridge Status', v: health.connected ? 'Online' : 'Offline', c: health.connected ? 'from-emerald-500/20 to-emerald-500/5' : 'from-red-500/20 to-red-500/5', ic: health.connected ? 'text-emerald-400' : 'text-red-400', Icon: health.connected ? Wifi : WifiOff },
                      { l: 'Active Pages', v: String(pages.length), c: 'from-cyan-500/20 to-cyan-500/5', ic: 'text-cyan-400', Icon: Globe },
                      { l: 'AI Status', v: aiStatus.busy ? 'Working' : aiStatus.connected ? 'Idle' : 'Disconnected', c: aiStatus.busy ? 'from-amber-500/20 to-amber-500/5' : 'from-purple-500/20 to-purple-500/5', ic: aiStatus.busy ? 'text-amber-400' : 'text-purple-400', Icon: Bot },
                      { l: 'FORGE', v: forgeRunning ? `PID ${forgePid}` : 'Inactive', c: forgeRunning ? 'from-orange-500/20 to-orange-500/5' : 'from-indigo-500/20 to-indigo-500/5', ic: forgeRunning ? 'text-orange-400' : 'text-indigo-400', Icon: Flame },
                    ].map(st => (
                      <div key={st.l} className={`p-5 rounded-2xl bg-gradient-to-br ${st.c} border border-white/5 backdrop-blur-md relative overflow-hidden group`}>
                        <div className="relative z-10 flex flex-col gap-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{st.l}</span>
                          <span className={`text-2xl font-black ${st.ic}`}>{st.v}</span>
                        </div>
                        <div className="absolute right-3 bottom-2 opacity-10 group-hover:scale-110 transition-transform duration-500">
                          <st.Icon size={64} className={st.ic} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* TWO COLUMN LAYOUT */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                    {/* LEFT COL */}
                    <div className="lg:col-span-3 space-y-8">
                      {/* INJECTOR */}
                      <div className="relative p-8 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-xl shadow-2xl">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 rounded-t-3xl opacity-50" />
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400"><Zap size={20} /></div>
                          <h2 className="text-xl font-bold tracking-tight">Agentic Dominance Protocol</h2>
                        </div>
                        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                          Inject prompts directly into the active Antigravity workspace via the CDP bridge. The autoclicker handles subsequent Run/Accept approvals automatically.
                        </p>
                        <div className="flex flex-col gap-4">
                          <div className="relative group">
                            <textarea
                              value={agentPrompt}
                              onChange={e => setAgentPrompt(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleInject(); }}
                              placeholder="Enter directive... (Ctrl+Enter to inject)"
                              className="w-full h-32 bg-black/40 border border-indigo-500/20 rounded-xl p-4 text-sm text-white placeholder-slate-600 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50 outline-none transition-all resize-none shadow-inner font-mono"
                            />
                            <div className="absolute bottom-4 right-4 text-xs font-mono text-slate-500">CDP Bridged ⚡</div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs">
                              <ShieldCheck size={14} className="text-emerald-500" />
                              <span className="text-slate-400">Secure Injection Layer active</span>
                            </div>
                            <button
                              onClick={handleInject}
                              disabled={injectStatus === 'injecting' || !agentPrompt.trim()}
                              className="relative overflow-hidden px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold tracking-widest uppercase text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                              {injectStatus === 'injecting' ? (
                                <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> INJECTING</span>
                              ) : injectStatus === 'success' ? (
                                <span className="text-emerald-300">SUCCESS</span>
                              ) : injectStatus === 'error' ? (
                                <span className="text-red-300">FAILED</span>
                              ) : (
                                <span className="flex items-center gap-2">EXECUTE PROTOCOL <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" /></span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* STATUS CARDS */}
                      <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                          <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-white">
                            <Lock size={16} className="text-amber-400" /> Typing Guard
                          </h3>
                          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                            Autoclicking suspends for 5s after user input. Scroll lock pauses for 10s on manual scroll.
                          </p>
                          <div className="flex items-center justify-center p-4 rounded-xl bg-gradient-to-b from-black/40 to-black/80 border border-white/5">
                            <span className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                              <span className="relative flex h-2 w-2 shadow-[0_0_10px_#f59e0b]">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                              </span>
                              GUARD MONITORING
                            </span>
                          </div>
                        </div>
                        <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                          <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-white">
                            <Search size={16} className="text-fuchsia-400" /> Deep DOM Scanner
                          </h3>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-slate-400">
                                <span>Shadow DOM Depth</span>
                                <span className="text-white font-bold">Infinite</span>
                              </div>
                              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden shadow-inner">
                                <div className="w-full h-full bg-gradient-to-r from-fuchsia-600 to-purple-400" />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20">
                              <Activity size={14} className="text-fuchsia-400" />
                              <span className="text-[10px] text-fuchsia-400 uppercase tracking-widest font-bold">Fuzzy Regex Matching Active</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COL: Chat */}
                    <div className="lg:col-span-2 flex flex-col">
                      <div className="flex-1 flex flex-col rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-xl overflow-hidden shadow-2xl relative">
                        <div className="px-6 py-4 border-b border-indigo-500/10 bg-black/20 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400"><MessageSquare size={16} /></div>
                            <h2 className="text-sm font-bold text-white tracking-wide">Swarm Intelligence Feed</h2>
                          </div>
                        </div>
                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                          {vpsChat.map(m => {
                            const isUser = m.role === 'user';
                            const isSys = m.role === 'system';
                            return (
                              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={m.id}
                                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[90%] ${isUser ? 'ml-auto' : 'mr-auto'}`}>
                                <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                                  <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center border ${isUser ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : isSys ? 'bg-slate-800 border-slate-600 text-slate-400' : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'}`}>
                                    {isUser ? <User size={12} /> : isSys ? <ShieldCheck size={12} /> : <Bot size={12} />}
                                  </div>
                                  <div className={`p-3 rounded-2xl shadow-sm text-[13px] leading-relaxed relative group
                                    ${isUser ? 'bg-gradient-to-br from-indigo-600 to-indigo-500 text-white rounded-br-sm' : isSys ? 'bg-white/5 text-slate-400 border border-white/10 rounded-tl-sm' : 'bg-white/10 text-white border border-white/10 rounded-tl-sm backdrop-blur-md'}`}>
                                    {m.msg}
                                  </div>
                                </div>
                                <div className={`text-[9px] font-mono text-slate-600 mt-1 px-8 ${isUser ? 'text-right' : 'text-left'}`}>
                                  {m.time} {m.tag && <span className="ml-2 uppercase text-cyan-500/80 bg-cyan-500/10 px-1 rounded">{m.tag}</span>}
                                </div>
                              </motion.div>
                            );
                          })}
                          <div ref={chatEndRef} />
                        </div>
                        {/* Input */}
                        <div className="p-4 border-t border-white/5 bg-black/40">
                          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-1 focus-within:border-cyan-500/50 transition-all">
                            <input
                              type="text"
                              value={vpsChatIn}
                              onChange={e => setVpsChatIn(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && sendVpsChat()}
                              placeholder="Direct the swarm..."
                              className="flex-1 bg-transparent border-none outline-none text-sm text-white px-3 py-2 placeholder-slate-600"
                            />
                            <button onClick={() => sendVpsChat()} disabled={!vpsChatIn.trim()} className="w-8 h-8 flex items-center justify-center rounded-lg bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-50 transition-colors">
                              <Send size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ════════════════════ VPS LIVE VIEW TAB ════════════════════ */}
            {activeTab === 'vps' && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col h-full overflow-y-auto p-8 custom-scrollbar"
              >
                <div className="max-w-6xl w-full mx-auto space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-white">VPS Live View</h2>
                      <p className="text-sm text-slate-400 mt-1">Real-time monitoring of connected Antigravity IDE instances</p>
                    </div>
                    <button onClick={async () => {
                      try {
                        const p = await bridgeGet('/api/pages');
                        if (p.data?.pages) setPages(p.data.pages);
                        addLog('info', 'VPS', 'Pages refreshed');
                      } catch { addLog('error', 'VPS', 'Failed to refresh pages'); }
                    }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all text-xs font-bold uppercase tracking-widest">
                      <RefreshCw size={14} /> Refresh
                    </button>
                  </div>

                  {/* Connection Info */}
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20">
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bridge Endpoint</span>
                        <p className="text-lg font-mono font-bold text-cyan-400 mt-1">{BRIDGE_URL}</p>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</span>
                        <p className={`text-lg font-bold mt-1 ${health.connected ? 'text-emerald-400' : 'text-red-400'}`}>
                          {health.connected ? '● Connected' : '○ Disconnected'}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Round-Trip</span>
                        <p className="text-lg font-mono font-bold text-white mt-1">{health.latencyMs}ms</p>
                      </div>
                    </div>
                  </div>

                  {/* Pages Grid */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                      <Globe size={16} className="text-cyan-400" /> Connected Pages ({pages.length})
                    </h3>
                    {pages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-4">
                        <Monitor size={48} className="opacity-20" />
                        <p className="text-sm font-bold tracking-widest uppercase">No pages detected</p>
                        <p className="text-xs text-slate-600">Ensure a Chromium browser with --remote-debugging-port=9222 is running</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pages.map((p, i) => (
                          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                            className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 transition-all group">
                            <div className="flex items-start gap-3">
                              <div className="shrink-0 w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                                <Globe size={18} className="text-cyan-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-white truncate">{p.title || 'Untitled'}</h4>
                                <p className="text-xs text-slate-500 font-mono truncate mt-1">{p.url}</p>
                              </div>
                              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] mt-2 animate-pulse" />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* API Endpoints Reference */}
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <Terminal size={16} className="text-indigo-400" /> Bridge API Endpoints
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { method: 'GET', path: '/api/health', desc: 'Bridge health check' },
                        { method: 'GET', path: '/api/status', desc: 'AI busy/idle status' },
                        { method: 'GET', path: '/api/read', desc: 'Read last AI response' },
                        { method: 'GET', path: '/api/chat', desc: 'Full chat history' },
                        { method: 'GET', path: '/api/pages', desc: 'Connected browser pages' },
                        { method: 'POST', path: '/api/inject', desc: 'Inject prompt into IDE' },
                        { method: 'POST', path: '/api/task', desc: 'Queue multi-step task' },
                      ].map(ep => (
                        <div key={ep.path} className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ep.method === 'GET' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>{ep.method}</span>
                          <span className="text-xs font-mono text-white flex-1">{ep.path}</span>
                          <span className="text-[10px] text-slate-500">{ep.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ════════════════════ FORGE PIPELINE TAB ════════════════════ */}
            {activeTab === 'forge' && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col h-full overflow-y-auto p-8 custom-scrollbar"
              >
                <div className="max-w-6xl w-full mx-auto space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">FORGE Pipeline</h2>
                      <p className="text-sm text-slate-400 mt-1">24/7 Autonomous Software Factory — Infinite ideation and construction</p>
                    </div>
                    {forgeRunning ? (
                      <button onClick={stopForge} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all text-xs font-bold uppercase tracking-widest">
                        <Pause size={16} /> Halt Pipeline
                      </button>
                    ) : (
                      <button onClick={startForge} disabled={!forgeGoal.trim()} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 hover:bg-orange-500/30 transition-all text-xs font-bold uppercase tracking-widest disabled:opacity-50">
                        <Rocket size={16} /> Ignite FORGE
                      </button>
                    )}
                  </div>

                  {/* FORGE Status Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-orange-500/15 to-transparent border border-orange-500/20">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pipeline Status</span>
                      <p className={`text-2xl font-black mt-1 ${forgeRunning ? 'text-orange-400' : 'text-slate-500'}`}>
                        {forgeRunning ? 'ACTIVE' : 'IDLE'}
                      </p>
                    </div>
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/15 to-transparent border border-amber-500/20">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Process PID</span>
                      <p className="text-2xl font-black text-amber-400 mt-1">{forgePid ?? '—'}</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-yellow-500/15 to-transparent border border-yellow-500/20">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Model Engine</span>
                      <p className="text-2xl font-black text-yellow-400 mt-1">{forgeModel}</p>
                    </div>
                  </div>

                  {/* Goal + Model Configuration */}
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <Sparkles size={16} className="text-orange-400" /> Mission Goal
                    </h3>
                    <div className="flex gap-4">
                      <input
                        type="text"
                        value={forgeGoal}
                        onChange={(e: any) => setForgeGoal(e.target.value)}
                        placeholder="e.g. Create websites that make money with ad revenue"
                        disabled={forgeRunning}
                        className="flex-1 bg-black/40 border border-orange-500/20 rounded-xl p-4 text-sm text-white placeholder-slate-600 focus:border-orange-400 focus:ring-1 focus:ring-orange-400/50 outline-none transition-all disabled:opacity-50"
                      />
                      <select
                        value={forgeModel}
                        onChange={(e: any) => setForgeModel(e.target.value)}
                        disabled={forgeRunning}
                        className="bg-black/40 border border-orange-500/20 rounded-xl px-4 py-3 text-sm text-white focus:border-orange-400 outline-none transition-all disabled:opacity-50"
                      >
                        <option value="llama3">Llama 3</option>
                        <option value="codellama">CodeLlama</option>
                        <option value="mistral">Mistral</option>
                        <option value="deepseek-coder">DeepSeek Coder</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-3">
                      Set a high-level objective, then click <strong className="text-orange-400">Ignite FORGE</strong>. The pipeline will autonomously ideate → plan → code → evaluate → learn 24/7.
                    </p>
                  </div>

                  {/* Architecture Diagram */}
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                    <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
                      <BarChart3 size={16} className="text-orange-400" /> Pipeline Architecture
                    </h3>
                    <div className="flex items-center justify-between gap-2 px-4">
                      {[
                        { icon: Sparkles, label: 'Ideation', desc: 'AI invents novel project', col: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
                        { icon: FileCode, label: 'Generation', desc: 'Full codebase created', col: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
                        { icon: Play, label: 'Execution', desc: 'Auto-approved via CDP', col: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
                        { icon: CheckCircle, label: 'Validation', desc: 'Build & run verified', col: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                        { icon: RefreshCw, label: 'Loop', desc: 'Next epoch begins', col: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
                      ].map((step, i) => (
                        <div key={step.label} className="flex items-center gap-2">
                          <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${step.col} min-w-[100px]`}>
                            <step.icon size={24} />
                            <span className="text-xs font-bold">{step.label}</span>
                            <span className="text-[9px] text-slate-500 text-center">{step.desc}</span>
                          </div>
                          {i < 4 && <ChevronRight size={16} className="text-slate-600 shrink-0" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* FORGE Live Log */}
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <Terminal size={16} className="text-orange-400" /> FORGE Live Output
                    </h3>
                    <div ref={forgeLogRef} className="bg-black/60 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs custom-scrollbar border border-white/5">
                      {forgeLog.length === 0 ? (
                        <span className="text-slate-600">Pipeline output will appear here when FORGE is ignited...</span>
                      ) : (
                        forgeLog.map((line, i) => (
                          <div key={i} className="text-slate-300 py-0.5">{line}</div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ════════════════════ SWARM CORE TAB ════════════════════ */}
            {activeTab === 'swarm' && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col h-full overflow-y-auto p-8 custom-scrollbar"
              >
                <div className="max-w-6xl w-full mx-auto space-y-8">
                  <div>
                    <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-purple-300">Swarm Core</h2>
                    <p className="text-sm text-slate-400 mt-1">Distributed orchestration engine configuration and fleet topology</p>
                  </div>

                  {/* Swarm Architecture */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { label: 'Orchestrator', desc: 'vegaclaw_forge.py', status: forgeRunning ? 'Running' : 'Standby', icon: Cpu, col: 'from-fuchsia-500/15 to-transparent border-fuchsia-500/20', active: forgeRunning },
                      { label: 'Pilot Agent', desc: 'agentic_pilot.py', status: 'Ready', icon: Bot, col: 'from-purple-500/15 to-transparent border-purple-500/20', active: true },
                      { label: 'Swarm Router', desc: 'vps_swarm_coding.py', status: 'Ready', icon: Globe, col: 'from-indigo-500/15 to-transparent border-indigo-500/20', active: true },
                    ].map(s => (
                      <div key={s.label} className={`p-6 rounded-2xl bg-gradient-to-br ${s.col} border relative overflow-hidden`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{s.label}</span>
                            <p className="text-sm font-mono text-white mt-1">{s.desc}</p>
                            <p className={`text-xs font-bold mt-2 ${s.active ? 'text-emerald-400' : 'text-slate-500'}`}>{s.status}</p>
                          </div>
                          <s.icon size={32} className="text-white/10" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Fleet Components */}
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                    <h3 className="text-sm font-bold text-white mb-4">Fleet Component Map</h3>
                    <div className="space-y-3">
                      {[
                        { name: 'vegaclaw.pyw', role: 'CDP Autoclicker + HTTP Bridge', port: '4242', status: health.connected },
                        { name: 'vegaclaw_watchdog.ps1', role: '100% Uptime Guardian', port: 'N/A', status: true },
                        { name: 'agentic_pilot.py', role: 'Autonomous Prompt Orchestrator', port: 'N/A', status: true },
                        { name: 'vegaclaw_forge.py', role: '24/7 Infinite Software Factory', port: 'N/A', status: forgeRunning },
                        { name: 'vegaclaw_rlm_pipeline.py', role: 'Self-Improving RLM Coding Engine', port: 'N/A', status: true },
                        { name: 'vps_swarm_coding.py', role: 'Parallel Fleet Task Dispatcher', port: 'N/A', status: true },
                        { name: 'install-tools.ps1', role: 'VPS Bootstrap & Provisioning', port: 'N/A', status: true },
                      ].map(c => (
                        <div key={c.name} className="flex items-center gap-4 p-4 rounded-xl bg-black/30 border border-white/5 hover:border-fuchsia-500/30 transition-all">
                          <div className={`w-2 h-2 rounded-full ${c.status ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'}`} />
                          <FileCode size={16} className="text-fuchsia-400" />
                          <span className="text-sm font-mono font-bold text-white w-48">{c.name}</span>
                          <span className="text-xs text-slate-400 flex-1">{c.role}</span>
                          <span className="text-[10px] font-mono text-slate-500">:{c.port}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Execution Modes */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                      <h3 className="text-sm font-bold text-white mb-3">Sequential Mode</h3>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">Tasks execute one node at a time. Ideal for dependent multi-step workflows.</p>
                      <code className="text-[10px] font-mono text-fuchsia-400 bg-fuchsia-500/10 px-3 py-2 rounded-lg block">
                        python vps_swarm_coding.py --task build.txt --nodes 10.0.0.1,10.0.0.2
                      </code>
                    </div>
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                      <h3 className="text-sm font-bold text-white mb-3">Parallel Mode</h3>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">All nodes execute simultaneously. Maximum throughput for independent tasks.</p>
                      <code className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-3 py-2 rounded-lg block">
                        python vps_swarm_coding.py --task build.txt --nodes 10.0.0.1,10.0.0.2 --parallel
                      </code>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ════════════════════ SYSTEM LOGS TAB ════════════════════ */}
            {activeTab === 'logs' && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col h-full overflow-hidden p-8"
              >
                <div className="max-w-6xl w-full mx-auto flex flex-col h-full gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">System Logs</h2>
                      <p className="text-sm text-slate-400 mt-1">Real-time event stream from all subsystems</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-500">{logs.length} events</span>
                      <button onClick={() => setLogs([])} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-xs font-bold uppercase tracking-widest">
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Log Stream */}
                  <div className="flex-1 bg-black/60 rounded-2xl border border-white/5 overflow-y-auto p-4 font-mono text-xs custom-scrollbar">
                    {logs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
                        <Database size={32} className="opacity-20" />
                        <p className="text-sm">Events will stream here in real-time...</p>
                      </div>
                    ) : (
                      logs.map((log, i) => {
                        const levelColor = {
                          info: 'text-slate-400',
                          success: 'text-emerald-400',
                          warning: 'text-amber-400',
                          error: 'text-red-400',
                        }[log.level];
                        const levelIcon = {
                          info: Activity,
                          success: CheckCircle,
                          warning: AlertTriangle,
                          error: XCircle,
                        }[log.level];
                        const LI = levelIcon;
                        return (
                          <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                            className="flex items-start gap-3 py-1.5 border-b border-white/[0.03] last:border-0">
                            <span className="text-slate-600 w-20 shrink-0">{log.ts}</span>
                            <LI size={12} className={`${levelColor} mt-0.5 shrink-0`} />
                            <span className={`text-[10px] font-bold uppercase tracking-wider w-16 shrink-0 ${levelColor}`}>{log.level}</span>
                            <span className="text-indigo-400 w-20 shrink-0">[{log.source}]</span>
                            <span className="text-slate-300 flex-1">{log.message}</span>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      ` }} />
    </div>
  );
}
