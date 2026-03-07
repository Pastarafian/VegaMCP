import React, { useState, useEffect } from 'react';
import { TerminalSquare, LayoutGrid, CheckSquare, Settings, MessageSquare, Cpu, HardDrive, Activity, Wifi, Brain, Lightbulb, Sparkles, ArrowRight, Search, Plus, RefreshCw } from 'lucide-react';

const BRIDGE = 'http://127.0.0.1:42019';

export default function App() {
  const [activeTab, setActiveTab] = useState('chat'); 
  const [logs, setLogs] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(false);

  // Poll for live telemetry
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [logsResp, statusResp] = await Promise.all([
          fetch(`${BRIDGE}/logs`).then(r => r.json()),
          fetch(`${BRIDGE}/status`).then(r => r.json())
        ]);
        setLogs(logsResp || []);
        setFleet(statusResp.fleet || []);
        setIsOnline(statusResp.status === 'online');
      } catch (e) { 
        setIsOnline(false);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-[#060c15] text-slate-300 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-16 lg:w-64 glass-panel border-r border-[#1e293b] flex flex-col justify-between py-6 shrink-0 z-20 transition-all duration-300">
        <div className="px-4">
          <div className="flex items-center gap-3 mb-12 pl-2 cursor-pointer">
            <div className="relative">
              <TerminalSquare className={`w-8 h-8 ${isOnline ? 'text-blue-500' : 'text-slate-600'}`} />
              {isOnline && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white hidden lg:block tracking-wide">The Claw</h1>
          </div>

          <nav className="space-y-2">
            <NavItem icon={<MessageSquare className="w-5 h-5" />}  label="AI Orchestrator"  active={activeTab === 'chat'}  onClick={() => setActiveTab('chat')}  />
            <NavItem icon={<Brain className="w-5 h-5" />}  label="Memory & Ideas"  active={activeTab === 'memory'}  onClick={() => setActiveTab('memory')}  />
            <NavItem icon={<LayoutGrid className="w-5 h-5" />}  label="Fleet Dashboard"  active={activeTab === 'grid'}  onClick={() => setActiveTab('grid')}  />
            <NavItem icon={<CheckSquare className="w-5 h-5" />}  label="Task Manager"  active={activeTab === 'tasks'}  onClick={() => setActiveTab('tasks')}  />
          </nav>
        </div>

        <div className="px-4">
          <NavItem icon={<Settings className="w-5 h-5" />}  label="System Settings"  active={activeTab === 'settings'}  onClick={() => setActiveTab('settings')}  />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col overflow-hidden">
        {activeTab === 'chat' && <AiChatTab fleet={fleet} logs={logs} />}
        {activeTab === 'memory' && <MemoryTab />}
        {activeTab === 'grid' && <FleetDashboard fleet={fleet} />}
        {activeTab === 'tasks' && <TaskManager />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>

    </div>
  );
}

// ── Components ──

function NavItem({ icon, label, active, onClick, badge }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group
        ${active ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'}`}
    >
      <div className={`transition-colors ${active ? 'text-blue-400' : 'group-hover:text-blue-300'}`}>
        {icon}
      </div>
      <span className="hidden lg:block font-medium text-sm">{label}</span>
      {badge && badge !== "0" && (
        <span className="hidden lg:flex ml-auto bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full border border-blue-500/20">
          {badge}
        </span>
      )}
    </button>
  );
}

// ── AiChatTab ──
function AiChatTab({ fleet, logs }: { fleet: any[], logs: any[] }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'system', text: 'Welcome to The Claw Orchestrator. What would you like your fleet to accomplish today?' },
  ]);

  const handleSend = async (e: any) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const userMsg = { role: 'user', text: input };
    setMessages([...messages, userMsg]);
    setInput('');
    
    try {
      const resp = await fetch(`${BRIDGE}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prompt', prompt_text: input, agent_id: fleet[0]?.id || 'vps-1' })
      });
      const result = await resp.json();
      
      setMessages(m => [...m, { 
        role: 'system', 
        text: result.success 
          ? `Command Executed: ${JSON.stringify(result.content || result.ai_hint)}` 
          : `Error: ${result.error || 'Unknown execution failure'}` 
      }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'system', text: "Bridge connection failed. Is The Claw server running on port 42019?" }]);
    }
  };

  return (
    <div className="h-full flex flex-col pt-8 pb-4 px-6 animate-slideIn">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-light text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulseGlow"></span>
            Orchestrator Chat
          </h2>
          <p className="text-sm text-slate-400 mt-1">Conversational AI to manage the fleet, assign tasks, and monitor agents.</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto mb-6 pr-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed border shadow-sm
              ${msg.role === 'user' 
                ? 'bg-blue-600/10 border-blue-500/20 text-blue-100' 
                : 'glass-panel text-slate-300 border-white/5'}`}
            >
              <div className="flex items-center gap-2 mb-2 opacity-50 text-[10px] uppercase font-bold tracking-tighter">
                {msg.role === 'user' ? 'User Commander' : 'Claw Orchestrator'}
              </div>
              <div dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }} />
            </div>
          </div>
        ))}
        {logs.slice(-2).map((log, i) => (
          <div key={'log-'+i} className="flex justify-start opacity-70 italic">
            <div className={`text-[10px] px-2 py-0.5 rounded border border-white/5 
              ${log.type === 'sight' ? 'text-purple-400' : log.type === 'thought' ? 'text-blue-400' : 'text-slate-500'}`}>
              [{log.type?.toUpperCase()}] {log.message}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="relative mt-auto">
        <textarea 
          placeholder="e.g. Run a system benchmark on all connected IDEs."
          className="w-full glass-input rounded-xl bg-slate-900/40 p-5 pr-16 text-slate-100 placeholder-slate-500 resize-none h-24 shadow-inner"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
        />
        <button type="submit" className="absolute right-4 bottom-4 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
          <MessageSquare className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// Memory & Ideas Tab — Persistent Project Memory + AI Brainstorming
// ═══════════════════════════════════════════════════════════════

function MemoryTab() {
  const [projects, setProjects] = useState<string[]>([]);
  const [activeProject, setActiveProject] = useState<string>('');
  const [memories, setMemories] = useState<any[]>([]);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [brainstormTopic, setBrainstormTopic] = useState('');
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [crossPollinate, setCrossPollinate] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [subTab, setSubTab] = useState<'timeline' | 'ideas' | 'brainstorm'>('timeline');

  // Load projects on mount
  useEffect(() => {
    fetch(`${BRIDGE}/memory`).then(r => r.json()).then(data => {
      setProjects(data.projects || []);
      if (data.projects?.length > 0) setActiveProject(data.projects[0]);
    }).catch(() => {});
  }, []);

  // Load project data when active project changes
  useEffect(() => {
    if (!activeProject) return;
    fetch(`${BRIDGE}/memory?project=${activeProject}`).then(r => r.json()).then(data => {
      setMemories(data.memories || []);
      setIdeas((data.memories || []).filter((m: any) => m.type === 'idea'));
    }).catch(() => {});
  }, [activeProject]);

  const handleBrainstorm = async () => {
    if (!brainstormTopic.trim() || !activeProject) return;
    setIsBrainstorming(true);
    try {
      const resp = await fetch(`${BRIDGE}/brainstorm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: activeProject, topic: brainstormTopic, cross_pollinate: crossPollinate })
      });
      const session = await resp.json();
      // Refresh memories
      const memResp = await fetch(`${BRIDGE}/memory?project=${activeProject}`).then(r => r.json());
      setMemories(memResp.memories || []);
      setIdeas((memResp.memories || []).filter((m: any) => m.type === 'idea'));
      setSubTab('ideas');
    } catch (err) {
      console.error('Brainstorm failed', err);
    }
    setIsBrainstorming(false);
    setBrainstormTopic('');
  };

  const handleInitProject = async () => {
    if (!newProjectName.trim()) return;
    await fetch(`${BRIDGE}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'memory_init', name: newProjectName, description: '', tech_stack: [] })
    });
    setProjects([...projects, newProjectName.toLowerCase().replace(/\s+/g, '_')]);
    setActiveProject(newProjectName.toLowerCase().replace(/\s+/g, '_'));
    setNewProjectName('');
  };

  const typeColors: Record<string, string> = {
    milestone: 'text-green-400 bg-green-500/10 border-green-500/20',
    decision: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    bug: 'text-red-400 bg-red-500/10 border-red-500/20',
    idea: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    observation: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    insight: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    brainstorm: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
    task_completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  };

  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto animate-slideIn">
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-light text-white flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            Project Memory & Ideas
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Persistent memory across sessions. AI brainstorms ideas autonomously and cross-pollinates from other projects.
          </p>
        </div>
      </header>

      {/* Project Selector */}
      <div className="flex items-center gap-3 mb-6">
        <select 
          className="glass-input rounded-lg px-4 py-2 text-slate-200 min-w-48"
          value={activeProject}
          onChange={(e) => setActiveProject(e.target.value)}
        >
          <option value="">Select Project...</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="New project name..."
            className="glass-input rounded-lg px-3 py-2 text-sm text-slate-200 w-48"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInitProject()}
          />
          <button onClick={handleInitProject} className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <span className="text-xs text-slate-500 ml-auto">
          {projects.length} project{projects.length !== 1 ? 's' : ''} tracked
        </span>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10 pb-1">
        {(['timeline', 'ideas', 'brainstorm'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`px-4 py-2 text-sm rounded-t-lg transition-colors capitalize
              ${subTab === tab ? 'text-white bg-white/10 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {tab === 'timeline' && <Activity className="inline w-4 h-4 mr-1.5" />}
            {tab === 'ideas' && <Lightbulb className="inline w-4 h-4 mr-1.5" />}
            {tab === 'brainstorm' && <Sparkles className="inline w-4 h-4 mr-1.5" />}
            {tab}
          </button>
        ))}
      </div>

      {/* Sub-tab Content */}
      {subTab === 'timeline' && (
        <div className="space-y-3 pb-20">
          {memories.length === 0 && (
            <div className="glass-panel p-12 text-center text-slate-500 rounded-xl">
              No memories yet. Start working and The Claw will auto-journal your milestones, decisions, and insights.
            </div>
          )}
          {memories.map((mem, i) => (
            <div key={mem.id || i} className="glass-panel rounded-lg p-4 flex items-start gap-4 group hover:border-white/20 transition-colors">
              <div className={`text-[9px] uppercase font-bold px-2 py-1 rounded border shrink-0 tracking-widest ${typeColors[mem.type] || typeColors.observation}`}>
                {mem.type}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-200 text-sm">{mem.title}</div>
                <div className="text-xs text-slate-400 mt-1 line-clamp-2">{mem.content}</div>
                <div className="flex items-center gap-2 mt-2">
                  {mem.tags?.map((t: string, j: number) => (
                    <span key={j} className="text-[9px] bg-white/5 text-slate-500 px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              </div>
              <div className="text-[10px] text-slate-600 shrink-0">
                {mem.timestamp ? new Date(mem.timestamp).toLocaleDateString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'ideas' && (
        <div className="space-y-3 pb-20">
          {ideas.length === 0 && (
            <div className="glass-panel p-12 text-center text-slate-500 rounded-xl">
              No ideas yet. Go to the <span className="text-purple-400">Brainstorm</span> tab to generate some!
            </div>
          )}
          {ideas.map((idea, i) => (
            <div key={idea.id || i} className="glass-panel rounded-xl p-5 group hover:border-purple-500/30 transition-colors relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-base font-medium text-white flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-400" />
                    {idea.title}
                  </h4>
                  <p className="text-sm text-slate-400 mt-2 leading-relaxed">{idea.content}</p>
                  <div className="flex items-center gap-2 mt-3">
                    {idea.tags?.slice(0, 4).map((t: string, j: number) => (
                      <span key={j} className="text-[9px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">{t}</span>
                    ))}
                  </div>
                </div>
                {idea.confidence && (
                  <div className="text-right shrink-0 ml-4">
                    <div className="text-2xl font-light text-purple-400">{Math.round(idea.confidence * 100)}%</div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">Score</div>
                  </div>
                )}
              </div>
              {idea.parent_id && (
                <div className="mt-2 text-[10px] text-slate-600 flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" /> Evolved from: {idea.parent_id}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {subTab === 'brainstorm' && (
        <div className="space-y-6 pb-20">
          <div className="glass-panel rounded-xl p-6 border border-purple-500/20">
            <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI Brainstorm Engine
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Enter a topic and The Claw will autonomously generate ideas using DeepSeek, Ollama, or OpenRouter.
              Enable <span className="text-purple-400">Cross-Pollinate</span> to pull inspiration from ALL your other projects.
            </p>
            
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1.5">Brainstorm Topic</label>
                <input
                  type="text"
                  placeholder="e.g. What features would make this project 10x better?"
                  className="w-full glass-input rounded-lg px-4 py-3 text-slate-200"
                  value={brainstormTopic}
                  onChange={(e) => setBrainstormTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBrainstorm()}
                />
              </div>
              <label className="flex items-center gap-2 shrink-0 cursor-pointer px-3 py-3 rounded-lg hover:bg-white/5 transition-colors">
                <input type="checkbox" checked={crossPollinate} onChange={(e) => setCrossPollinate(e.target.checked)} className="accent-purple-500" />
                <span className="text-xs text-purple-400 whitespace-nowrap">Cross-Pollinate</span>
              </label>
              <button
                onClick={handleBrainstorm}
                disabled={isBrainstorming || !brainstormTopic.trim()}
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-all shrink-0
                  ${isBrainstorming 
                    ? 'bg-purple-600/30 text-purple-400 cursor-wait' 
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.3)]'}`}
              >
                {isBrainstorming ? (
                  <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
                ) : (
                  <Sparkles className="w-4 h-4 inline mr-2" />
                )}
                {isBrainstorming ? 'Thinking...' : 'Generate Ideas'}
              </button>
            </div>
          </div>

          {/* Quick prompts */}
          <div className="flex flex-wrap gap-2">
            {[
              'What new features would blow users away?',
              'Find quick wins we can ship this week',
              'What are we missing compared to competitors?',
              'Suggest a completely new product direction',
              'How can we monetize this project?',
              'What automations would save the most time?',
            ].map((prompt, i) => (
              <button
                key={i}
                onClick={() => setBrainstormTopic(prompt)}
                className="text-xs text-slate-500 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/5 hover:border-purple-500/30 transition-all"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ── FleetDashboard ──
function FleetDashboard({ fleet }: { fleet: any[] }) {
  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto animate-slideIn">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-light text-white">Fleet Dashboard</h2>
          <p className="text-sm text-slate-400 mt-1">Live telemetry and hardware utilization across connected clients.</p>
        </div>
      </header>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-20">
        {fleet.length === 0 && (
          <div className="col-span-2 glass-panel p-12 text-center text-slate-500 rounded-xl border-dashed">
            No agents registered. Use 'register' command to add nodes to the fleet.
          </div>
        )}
        {fleet.map(agent => (
          <div key={agent.id} className="glass-panel rounded-xl p-6 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-lg font-medium text-white flex items-center gap-3">
                  {agent.name}
                  <span className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-widest ${agent.status === 'idle' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'}`}>
                    {agent.status}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">{agent.id} • {agent.ide}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-blue-400"/> CPU</p>
                <span className="text-xl font-light text-slate-200">{agent.cpu || 0}%</span>
              </div>
              <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5 text-purple-400"/> Model</p>
                <p className="text-sm font-medium text-slate-200 mt-2 truncate">{agent.model}</p>
              </div>
              <div className="bg-black/30 rounded-lg p-1 border border-white/5 col-span-2 overflow-hidden h-12 opacity-50">
                 <div className="text-[8px] text-slate-500 p-1 line-clamp-2 italic">
                   Sight: {agent.last_state || 'No vision data'}
                 </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TaskManager ──
function TaskManager() {
  const [tasks] = useState([
    { id: 'T-101', title: 'Global Optimization Loop', agent: 'System', progress: 10, status: 'Active', time: 'Ongoing' },
  ]);
  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto animate-slideIn">
      <header className="mb-8">
        <h2 className="text-2xl font-light text-white">Global Task Manager</h2>
        <p className="text-sm text-slate-400 mt-1">Track workflows and assigned tasks across all agents.</p>
      </header>
      <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4 font-medium">Task / Workflow</th>
              <th className="p-4 font-medium">Assigned Agent</th>
              <th className="p-4 font-medium w-1/4">Progress</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tasks.map(task => (
              <tr key={task.id} className="hover:bg-white/5 transition-colors cursor-pointer">
                <td className="p-4">
                  <div className="font-medium text-slate-200">{task.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{task.id}</div>
                </td>
                <td className="p-4"><span className="px-2 py-1 bg-white/5 rounded text-xs border border-white/10">{task.agent}</span></td>
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-8">{task.progress}%</span>
                    <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all duration-1000" style={{ width: `${task.progress}%` }} />
                    </div>
                  </div>
                </td>
                <td className="p-4"><span className="text-xs px-2 py-1 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/30">{task.status}</span></td>
                <td className="p-4 text-right text-slate-400 text-xs">{task.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── SettingsTab ──
function SettingsTab() {
  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto animate-slideIn">
      <header className="mb-8">
        <h2 className="text-2xl font-light text-white">System Settings</h2>
        <p className="text-sm text-slate-400 mt-1">Configure your orchestration engine and connection ports.</p>
      </header>
      <div className="max-w-2xl space-y-6">
        <div className="glass-panel rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-medium text-white mb-4">Connection Bridge</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Control Bridge (HTTP)</label>
              <input type="text" readOnly className="w-full glass-input rounded-lg px-4 py-2 text-slate-200 opacity-50" defaultValue="42019" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Tauri Dashboard</label>
              <input type="text" readOnly className="w-full glass-input rounded-lg px-4 py-2 text-slate-200 opacity-50" defaultValue="42018" />
            </div>
          </div>
        </div>
        <div className="glass-panel rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-medium text-white mb-4">Memory Storage</h3>
          <p className="text-sm text-slate-400">Persistent memory is stored at <code className="text-blue-400">~/.claw-memory/</code></p>
          <p className="text-xs text-slate-500 mt-2">Each project gets its own subdirectory with memories.json, brainstorms.json, and context.json.</p>
        </div>
        <div className="glass-panel rounded-xl p-6 border border-red-500/20 bg-red-500/5">
          <h3 className="text-lg font-medium text-red-400 mb-2">Danger Zone</h3>
          <p className="text-sm text-slate-400 mb-4">Purge all learned positions, workflows, and project memories.</p>
          <button className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 px-5 py-2 rounded-lg text-sm transition-colors">
            Reset All Memory
          </button>
        </div>
      </div>
    </div>
  );
}
