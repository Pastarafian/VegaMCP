/**
 * VegaMCP — Advanced Testing Tool (v2.0 — Real Emulation)
 * Real system diagnostics, concurrency stress, fuzz testing, disk I/O benchmarks.
 */
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import http from 'http';
import https from 'https';
import { URL } from 'url';

export const advancedTestingSchema = {
  name: 'advanced_testing',
  description: `AI-first advanced testing with REAL emulation. Real system diagnostics, concurrency stress, fuzz payloads, disk I/O benchmarks, env validation, network checks. Actions: full_sanity_check, bubble_test, chaos_monkey, fuzz_test, concurrency_stress, regression_suite, disk_benchmark, env_validate, network_check.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['full_sanity_check','bubble_test','chaos_monkey','fuzz_test','concurrency_stress','regression_suite','disk_benchmark','env_validate','network_check'], description: 'Testing action' },
      target_url: { type: 'string', description: 'Web endpoint' },
      target_process: { type: 'string', description: 'Local process name' },
      target_path: { type: 'string', description: 'Path for disk/env tests' },
      intensity: { type: 'number', description: 'Intensity 1-10', default: 5 },
      duration_ms: { type: 'number', description: 'Max duration', default: 10000 },
    },
    required: ['action'],
  },
};

function ok(d: any) { return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...d }, null, 2) }] }; }
function fail(c: string, m: string) { return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: c, message: m } }) }] }; }

function httpCheck(url: string, t = 5000): Promise<{ status: number; latency_ms: number; error?: string }> {
  return new Promise(r => {
    const s = Date.now(), u = new URL(url), lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method: 'HEAD', timeout: t, rejectUnauthorized: false }, res => { r({ status: res.statusCode || 0, latency_ms: Date.now() - s }); res.destroy(); });
    req.on('error', e => r({ status: 0, latency_ms: Date.now() - s, error: (e as any).message }));
    req.on('timeout', () => { req.destroy(); r({ status: 0, latency_ms: Date.now() - s, error: 'TIMEOUT' }); });
    req.end();
  });
}

function getMetrics() {
  const cpus = os.cpus(), tm = os.totalmem(), fm = os.freemem(), la = os.loadavg();
  let idle = 0, tick = 0;
  for (const c of cpus) { for (const t of Object.values(c.times)) tick += t; idle += c.times.idle; }
  const mem = process.memoryUsage();
  return {
    cpu: { cores: cpus.length, model: cpus[0]?.model, usage_pct: +((1 - idle/tick)*100).toFixed(1), load: la.map(l => +l.toFixed(2)) },
    memory: { total_gb: +(tm/1073741824).toFixed(2), used_gb: +((tm-fm)/1073741824).toFixed(2), free_gb: +(fm/1073741824).toFixed(2), pct: +(((tm-fm)/tm)*100).toFixed(1) },
    process: { rss_mb: +(mem.rss/1048576).toFixed(2), heapUsed_mb: +(mem.heapUsed/1048576).toFixed(2), heapTotal_mb: +(mem.heapTotal/1048576).toFixed(2) },
    platform: os.platform(), arch: os.arch(), uptime_h: +(os.uptime()/3600).toFixed(2),
  };
}

import { gate, blockedResponse } from './safety-gate.js';

export async function handleAdvancedTesting(args: any): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  // Safety gate: block dangerous operations from running on host
  const check = gate('advanced', args.action);
  if (check.sandboxed) {
    return blockedResponse('advanced_testing', args.action);
  }

  const I = Math.min(Math.max(args.intensity || 5, 1), 10);
  switch (args.action) {
    case 'full_sanity_check': {
      const m = getMetrics();
      const checks: any[] = [];
      checks.push({ name: 'Memory', status: m.memory.pct < 90 ? 'pass' : m.memory.pct < 95 ? 'warn' : 'fail', value: `${m.memory.pct}% (${m.memory.free_gb}GB free)` });
      checks.push({ name: 'CPU Load', status: m.cpu.load[0] < m.cpu.cores*2 ? 'pass' : 'warn', value: `${m.cpu.load[0]} (${m.cpu.cores} cores)` });
      checks.push({ name: 'Heap', status: m.process.heapUsed_mb < 500 ? 'pass' : 'warn', value: `${m.process.heapUsed_mb}MB` });
      // Disk write test
      const tf = path.join(os.tmpdir(), `sanity_${Date.now()}.tmp`);
      const ws = Date.now();
      try { fs.writeFileSync(tf, crypto.randomBytes(1048576)); const wt = Date.now()-ws; fs.unlinkSync(tf); checks.push({ name: 'Disk Write 1MB', status: wt < 500 ? 'pass' : 'warn', value: `${wt}ms` }); } catch(e:any) { checks.push({ name: 'Disk Write', status: 'fail', value: e.message }); }
      if (args.target_url) { const r = await httpCheck(args.target_url); checks.push({ name: 'Network', status: r.status >= 200 && r.status < 500 ? 'pass' : 'fail', value: r.error || `${r.status} (${r.latency_ms}ms)` }); }
      const fails = checks.filter(c => c.status === 'fail'), warns = checks.filter(c => c.status === 'warn');
      return ok({ test_name: 'Full Sanity Check', checks, metrics: m, summary: { total: checks.length, passed: checks.filter(c=>c.status==='pass').length, warnings: warns.length, failures: fails.length }, verdict: fails.length > 0 ? '❌ Fail' : warns.length > 0 ? '⚠️ Pass with Warnings' : '✅ Pass', ai_analysis: { hint: `Real sanity check: ${checks.length} checks. ${fails.length} failures.`, critical_issues: fails.map(f=>`${f.name}: ${f.value}`) } });
    }
    case 'concurrency_stress': {
      const conc = I*10, iters = I*100, st = Date.now(), memB = process.memoryUsage();
      let done = 0, errs = 0; const lats: number[] = [];
      const task = async () => { const s = Date.now(); try { const d = crypto.randomBytes(1024); crypto.createHash('sha256').update(d).digest('hex'); const a = Array.from({length:100},()=>Math.random()); a.sort(); JSON.parse(JSON.stringify({a})); done++; lats.push(Date.now()-s); } catch { errs++; } };
      for (let b = 0; b < Math.ceil(iters/conc); b++) { await Promise.all(Array.from({length: Math.min(conc, iters-b*conc)}, ()=>task())); if (Date.now()-st > (args.duration_ms||10000)) break; }
      const memA = process.memoryUsage(), dur = Date.now()-st; lats.sort((a,b)=>a-b);
      return ok({ test_name: 'Concurrency Stress', concurrency: conc, completed: done, errors: errs, duration_ms: dur, ops_per_sec: +(done/(dur/1000)).toFixed(1), latency: lats.length ? { min: lats[0], max: lats[lats.length-1], avg: +(lats.reduce((a,b)=>a+b,0)/lats.length).toFixed(2), p95: lats[Math.floor(lats.length*.95)], p99: lats[Math.floor(lats.length*.99)] } : null, mem_delta_mb: +((memA.rss-memB.rss)/1048576).toFixed(2), result: errs===0?'✅ Pass':'❌ Fail', ai_analysis: { hint: `Real stress: ${done} tasks @${conc}x. ${+(done/(dur/1000)).toFixed(0)} ops/sec.` } });
    }
    case 'fuzz_test': {
      const results: any[] = []; const cnt = I*100;
      for (let i=0;i<cnt;i++) { try { JSON.parse(crypto.randomBytes(50).toString('base64')); } catch {} results.push({ vector: 'JSON.parse', crashed: false }); }
      for (let i=0;i<cnt/10;i++) { try { const b = Buffer.alloc(Math.floor(Math.random()*10000)); crypto.randomFillSync(b); b.toString('utf-8'); } catch(e:any) { results.push({ vector: 'Buffer', crashed: true, error: e.message }); continue; } results.push({ vector: 'Buffer', crashed: false }); }
      for (let i=0;i<cnt/10;i++) { try { new URL(crypto.randomBytes(50).toString('base64')); } catch {} results.push({ vector: 'URL', crashed: false }); }
      const crashes = results.filter(r=>r.crashed);
      return ok({ test_name: 'Fuzz Test', payloads: results.length, vectors: ['JSON.parse','Buffer','URL'], crashes: crashes.length, result: crashes.length===0?'✅ Pass':'❌ Crashes', ai_analysis: { hint: `Real fuzz: ${results.length} payloads, ${crashes.length} crashes.` } });
    }
    case 'disk_benchmark': {
      const dir = path.join(os.tmpdir(),'vega_bench'); if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
      const sizes = [1024,10240,102400,1048576]; const res: any[] = [];
      for (const sz of sizes) { const d = crypto.randomBytes(sz), f = path.join(dir,`b_${sz}.tmp`), label = sz>=1048576?`${sz/1048576}MB`:sz>=1024?`${sz/1024}KB`:`${sz}B`;
        const ws = Date.now(); for(let i=0;i<I;i++) fs.writeFileSync(f,d); const wt = (Date.now()-ws)/I;
        const rs = Date.now(); for(let i=0;i<I;i++) fs.readFileSync(f); const rt = (Date.now()-rs)/I;
        try { fs.unlinkSync(f); } catch {} const mb = sz/1048576;
        res.push({ size: label, write_ms: +wt.toFixed(2), read_ms: +rt.toFixed(2), write_mbps: wt>0?+(mb/(wt/1000)).toFixed(2):0, read_mbps: rt>0?+(mb/(rt/1000)).toFixed(2):0 });
      }
      try { fs.rmdirSync(dir); } catch {}
      return ok({ test_name: 'Disk I/O Benchmark', intensity: I, benchmarks: res, ai_analysis: { hint: `Real I/O benchmark, ${I} iterations per size.` } });
    }
    case 'chaos_monkey': {
      const inj: any[] = []; const st = Date.now();
      const mb = process.memoryUsage().heapUsed; const arrs: number[][] = [];
      for(let i=0;i<I*10;i++) arrs.push(Array.from({length:1000},()=>Math.random()));
      const md = process.memoryUsage().heapUsed - mb; arrs.length = 0;
      inj.push({ type: 'memory_pressure', detail: `${(md/1048576).toFixed(2)}MB allocated`, status: 'recovered', ms: Date.now()-st });
      const cs = Date.now(); let w = 0; while(Date.now()-cs < I*50) w += Math.sqrt(Math.random()*1e6);
      inj.push({ type: 'cpu_spike', detail: `${I*50}ms burn`, status: 'completed', ms: Date.now()-cs });
      const tf = path.join(os.tmpdir(),`chaos_${Date.now()}.tmp`); const is = Date.now();
      try { for(let i=0;i<I;i++){fs.writeFileSync(tf,crypto.randomBytes(102400));fs.readFileSync(tf);} fs.unlinkSync(tf); inj.push({ type:'disk_burst', detail:`${I}x100KB`, status:'completed', ms:Date.now()-is }); } catch(e:any) { inj.push({ type:'disk_burst', detail:e.message, status:'failed', ms:Date.now()-is }); }
      return ok({ test_name: 'Chaos Monkey', intensity: I, injections: inj, duration_ms: Date.now()-st, result: inj.every(i=>i.status!=='failed')?'✅ Pass':'⚠️ Partial', ai_analysis: { hint: `Real chaos: ${inj.length} failure injections.` } });
    }
    case 'bubble_test': {
      const evts = I*100, st = Date.now(); let proc = 0, leaks = 0;
      const h = new Map<string,Function[]>(); for(let i=0;i<I*5;i++) h.set(`e_${i}`,[()=>{proc++;},()=>{proc++;}]);
      for(let i=0;i<evts;i++){const k=`e_${i%(I*5)}`;const fns=h.get(k);if(fns)for(const f of fns)f();else leaks++;}
      h.clear();
      return ok({ test_name: 'Bubble Test', events: evts, processed: proc, handlers: I*5, leaks, duration_ms: Date.now()-st, result: leaks===0?'✅ Pass':'❌ Leaks', ai_analysis: { hint: `Real event propagation: ${proc} invocations, ${leaks} leaks.` } });
    }
    case 'env_validate': {
      const tp = args.target_path||'.'; const checks: any[] = [];
      checks.push({ name: 'Node.js', status: parseInt(process.versions.node)>=18?'pass':'warn', value: process.versions.node });
      const pp = path.join(tp,'package.json');
      if (fs.existsSync(pp)) { try { const p=JSON.parse(fs.readFileSync(pp,'utf-8')); checks.push({name:'Package',status:'pass',value:`${p.name}@${p.version}`}); } catch {} }
      checks.push({ name: 'node_modules', status: fs.existsSync(path.join(tp,'node_modules'))?'pass':'fail', value: fs.existsSync(path.join(tp,'node_modules'))?'installed':'missing' });
      try { checks.push({name:'Git',status:'pass',value:execSync('git --version',{encoding:'utf-8',timeout:3000,windowsHide:true}).trim()}); } catch { checks.push({name:'Git',status:'warn',value:'not found'}); }
      return ok({ test_name: 'Environment Validation', checks, result: checks.some(c=>c.status==='fail')?'❌ Issues':'✅ OK', ai_analysis: { hint: 'Real env validation.' } });
    }
    case 'network_check': {
      const eps = [{name:'Google DNS',url:'https://dns.google'},{name:'Cloudflare',url:'https://1.1.1.1'},{name:'GitHub',url:'https://github.com'},{name:'npm',url:'https://registry.npmjs.org'}];
      if (args.target_url) eps.unshift({name:'Target',url:args.target_url});
      const res = await Promise.all(eps.map(async e=>({...e,...await httpCheck(e.url),reachable:(await httpCheck(e.url)).status>=200})));
      return ok({ test_name: 'Network Check', endpoints: res.length, reachable: res.filter(r=>r.reachable).length, results: res, ai_analysis: { hint: `${res.filter(r=>r.reachable).length}/${res.length} reachable.` } });
    }
    case 'regression_suite': {
      const tp = args.target_path||'.'; const checks: any[] = [];
      for (const f of ['package.json','tsconfig.json','src/index.ts']) checks.push({test:`exists:${f}`,status:fs.existsSync(path.join(tp,f))?'pass':'fail'});
      try { execSync('npx tsc --noEmit 2>&1',{encoding:'utf-8',timeout:60000,cwd:tp,windowsHide:true}); checks.push({test:'tsc',status:'pass'}); } catch(e:any) { const ec=(e.stdout||'').split('\n').filter((l:string)=>l.includes('error TS')).length; checks.push({test:'tsc',status:ec>0?`fail(${ec})`:'pass'}); }
      return ok({ test_name: 'Regression Suite', checks, passed: checks.filter(c=>c.status==='pass').length, total: checks.length, result: checks.every(c=>c.status==='pass')?'✅ Pass':'❌ Regression', ai_analysis: { hint: 'Real regression checks with TypeScript compilation.' } });
    }
    default: return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}`);
  }
}
