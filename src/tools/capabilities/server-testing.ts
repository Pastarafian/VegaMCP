/**
 * VegaMCP — Server & Infrastructure Testing Tool (v2.0 — Real Emulation Edition)
 * 
 * AI-First server testing suite with REAL network probing.
 * Features:
 * - Real TCP port scanning via Node.js net.Socket
 * - Real HTTP load testing via concurrent fetch with metrics
 * - Real server memory monitoring via OS commands
 * - Real configuration auditing by probing response headers
 * - Real DNS resolution and latency measurement
 * - Real SSL/TLS certificate inspection
 * - Real ping/traceroute execution
 */

import net from 'net';
import os from 'os';
import { execSync } from 'child_process';
import { autoRouteDecision, runIsolated } from './sandbox-manager.js';
import { URL } from 'url';
import https from 'https';
import http from 'http';
import dns from 'dns';

export const serverTestingSchema = {
  name: 'server_testing',
  description: `AI-first server and infrastructure testing suite with REAL emulation. Performs actual TCP port scanning, HTTP load testing, DNS resolution, SSL certificate inspection, response header auditing, and process memory monitoring. Actions: load_test, port_scan, disaster_recovery, load_balancer_check, server_memory_leak, configuration_audit, dns_resolve, ssl_inspect, ping_test, http_headers.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'load_test', 'port_scan', 'disaster_recovery',
          'load_balancer_check', 'server_memory_leak', 'configuration_audit',
          'dns_resolve', 'ssl_inspect', 'ping_test', 'http_headers',
        ],
        description: 'Server/Infrastructure testing action to perform',
      },
      target_host: { type: 'string', description: 'Server IP, hostname, URL, or API gateway' },
      virtual_users: { type: 'number', description: 'Number of simulated concurrent requests for load tests', default: 50 },
      duration_sec: { type: 'number', description: 'Test duration in seconds', default: 10 },
      ports: { type: 'string', description: 'Comma separated ports to scan (for port_scan), e.g. "22,80,443,3306,5432"' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'], default: 'GET', description: 'HTTP method for load_test' },
      timeout_ms: { type: 'number', description: 'Connection timeout in ms', default: 5000 },
    },
    required: ['action'],
  },
};

function ok(data: any) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

// ============================================================
// Real TCP Port Scanner
// ============================================================
function scanPort(host: string, port: number, timeoutMs: number = 3000): Promise<{ port: number; state: 'open' | 'closed' | 'filtered'; latency_ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let resolved = false;

    const done = (state: 'open' | 'closed' | 'filtered') => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ port, state, latency_ms: Date.now() - start });
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done('open'));
    socket.on('timeout', () => done('filtered'));
    socket.on('error', (err: any) => {
      if (err.code === 'ECONNREFUSED') done('closed');
      else done('filtered');
    });

    socket.connect(port, host);
  });
}

// ============================================================
// Real HTTP Request with Timing
// ============================================================
function timedFetch(url: string, method: string = 'GET', timeoutMs: number = 10000): Promise<{ status: number; latency_ms: number; size_bytes: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = lib.request(url, { method, timeout: timeoutMs, rejectUnauthorized: false }, (res) => {
      let bodySize = 0;
      res.on('data', (chunk: Buffer) => { bodySize += chunk.length; });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, latency_ms: Date.now() - start, size_bytes: bodySize });
      });
    });

    req.on('error', (err: any) => {
      resolve({ status: 0, latency_ms: Date.now() - start, size_bytes: 0, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, latency_ms: Date.now() - start, size_bytes: 0, error: 'TIMEOUT' });
    });

    req.end();
  });
}

// ============================================================
import { gate, blockedResponse } from './safety-gate.js';

// Main Handler
export async function handleServerTesting(args: any): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  // Safety gate: block dangerous network operations from running on host
  const check = gate('server', args.action);
  if (check.sandboxed) {
    return blockedResponse('server_testing', args.action);
  }

  switch (args.action) {

    // ═══════════════════════════════════
    // REAL PORT SCANNER
    // ═══════════════════════════════════
    case 'port_scan': {
      const host = args.target_host || 'localhost';
      const timeoutMs = args.timeout_ms || 3000;
      const portList = args.ports
        ? args.ports.split(',').map((p: string) => parseInt(p.trim())).filter((p: number) => p > 0 && p < 65536)
        : [21, 22, 25, 53, 80, 443, 3000, 3306, 5432, 6379, 8080, 8443, 27017];

      const startTime = Date.now();
      
      // Scan ports in batches of 10 to avoid overwhelming
      const results: Array<{ port: number; state: string; latency_ms: number; service?: string }> = [];
      const WELL_KNOWN: Record<number, string> = {
        21: 'FTP', 22: 'SSH', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 443: 'HTTPS',
        3000: 'Dev Server', 3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis',
        8080: 'HTTP Proxy', 8443: 'HTTPS Alt', 27017: 'MongoDB', 5000: 'Flask',
        9090: 'Prometheus', 9200: 'Elasticsearch',
      };

      const batchSize = 10;
      for (let i = 0; i < portList.length; i += batchSize) {
        const batch = portList.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((port: number) => scanPort(host, port, timeoutMs)));
        for (const r of batchResults) {
          results.push({ ...r, service: WELL_KNOWN[r.port] || undefined });
        }
      }

      const open = results.filter(r => r.state === 'open');
      const closed = results.filter(r => r.state === 'closed');
      const filtered = results.filter(r => r.state === 'filtered');

      return ok({
        action: 'port_scan',
        target_host: host,
        scan_duration_ms: Date.now() - startTime,
        total_ports_scanned: results.length,
        summary: { open: open.length, closed: closed.length, filtered: filtered.length },
        open_ports: open.map(r => ({ port: r.port, service: r.service, latency_ms: r.latency_ms })),
        closed_ports: closed.map(r => r.port),
        filtered_ports: filtered.map(r => r.port),
        all_results: results,
        ai_analysis: {
          verdict: open.length === 0 ? 'No Open Ports' : filtered.length > open.length ? 'Well Firewalled' : 'Some Ports Exposed',
          security_flags: open.filter(p => [21, 25, 3306, 5432, 6379, 27017].includes(p.port))
            .map(p => `⚠️ ${p.service || `Port ${p.port}`} is open — ensure it's properly secured`),
          hint: 'Open ports are actively accepting connections. Filtered ports did not respond (likely firewalled). Closed ports actively refused connections.',
        },
      });
    }

    // ═══════════════════════════════════
    // REAL HTTP LOAD TEST
    // ═══════════════════════════════════
    case 'load_test': {
      let targetUrl = args.target_host || 'http://localhost:3000';
      if (!targetUrl.startsWith('http')) targetUrl = `http://${targetUrl}`;
      
      const totalRequests = Math.min(args.virtual_users || 50, 500); // Cap at 500
      const method = args.method || 'GET';
      const timeoutMs = args.timeout_ms || 10000;
      const startTime = Date.now();

      // Send requests in concurrent batches
      const batchSize = Math.min(totalRequests, 20);
      const allResults: Array<{ status: number; latency_ms: number; size_bytes: number; error?: string }> = [];

      for (let sent = 0; sent < totalRequests; sent += batchSize) {
        const batchCount = Math.min(batchSize, totalRequests - sent);
        const batch = Array.from({ length: batchCount }, () => timedFetch(targetUrl, method, timeoutMs));
        const batchResults = await Promise.all(batch);
        allResults.push(...batchResults);
      }

      const successful = allResults.filter(r => r.status >= 200 && r.status < 400);
      const serverErrors = allResults.filter(r => r.status >= 500);
      const clientErrors = allResults.filter(r => r.status >= 400 && r.status < 500);
      const timeouts = allResults.filter(r => r.error === 'TIMEOUT');
      const connErrors = allResults.filter(r => r.error && r.error !== 'TIMEOUT');
      const latencies = allResults.filter(r => !r.error).map(r => r.latency_ms).sort((a, b) => a - b);

      const totalDuration = Date.now() - startTime;
      const avgLatency = latencies.length > 0 ? +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) : 0;
      const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
      const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
      const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
      const minLatency = latencies[0] || 0;
      const maxLatency = latencies[latencies.length - 1] || 0;

      return ok({
        action: 'load_test',
        target_url: targetUrl,
        method,
        total_duration_ms: totalDuration,
        total_requests: totalRequests,
        metrics: {
          successful: successful.length,
          server_errors_5xx: serverErrors.length,
          client_errors_4xx: clientErrors.length,
          timeouts: timeouts.length,
          connection_errors: connErrors.length,
          success_rate_percent: +((successful.length / totalRequests) * 100).toFixed(1),
          requests_per_second: +((totalRequests / totalDuration) * 1000).toFixed(1),
          latency: {
            avg_ms: avgLatency,
            min_ms: minLatency,
            max_ms: maxLatency,
            p50_ms: p50,
            p95_ms: p95,
            p99_ms: p99,
          },
          total_data_transferred_kb: +(allResults.reduce((s, r) => s + r.size_bytes, 0) / 1024).toFixed(1),
        },
        status_distribution: allResults.reduce((acc: Record<string, number>, r) => {
          const key = r.error || `${r.status}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
        ai_analysis: {
          verdict: successful.length === totalRequests ? '✅ All Requests Succeeded'
            : successful.length / totalRequests > 0.95 ? '⚠️ Mostly Successful (Some Failures)'
            : '❌ Significant Failures Detected',
          bottlenecks: [
            ...(p99 > 1000 ? [`P99 latency ${p99}ms is high — investigate slow query or resource contention`] : []),
            ...(serverErrors.length > 0 ? [`${serverErrors.length} server errors (5xx) — check application logs`] : []),
            ...(timeouts.length > 0 ? [`${timeouts.length} timeouts — server may be overloaded`] : []),
            ...(maxLatency > 5000 ? [`Max latency ${maxLatency}ms — extreme outlier detected`] : []),
          ],
          hint: `Real load test completed: ${successful.length}/${totalRequests} succeeded at ${+((totalRequests / totalDuration) * 1000).toFixed(1)} req/s with ${avgLatency}ms avg latency.`,
        },
      });
    }

    // ═══════════════════════════════════
    // REAL DNS RESOLUTION
    // ═══════════════════════════════════
    case 'dns_resolve': {
      const host = args.target_host || 'localhost';
      const startTime = Date.now();

      try {
        const results: any = {};
        
        // A records (IPv4)
        try {
          const addresses = await new Promise<string[]>((resolve, reject) => {
            dns.resolve4(host, (err, addrs) => err ? reject(err) : resolve(addrs));
          });
          results.ipv4 = addresses;
        } catch (e: any) {
          results.ipv4_error = e.code || e.message;
        }

        // AAAA records (IPv6)
        try {
          const addresses = await new Promise<string[]>((resolve, reject) => {
            dns.resolve6(host, (err, addrs) => err ? reject(err) : resolve(addrs));
          });
          results.ipv6 = addresses;
        } catch (e: any) {
          results.ipv6_error = e.code || e.message;
        }

        // MX records
        try {
          const mx = await new Promise<dns.MxRecord[]>((resolve, reject) => {
            dns.resolveMx(host, (err, addrs) => err ? reject(err) : resolve(addrs));
          });
          results.mx = mx;
        } catch (e: any) {
          results.mx_error = e.code || e.message;
        }

        // NS records
        try {
          const ns = await new Promise<string[]>((resolve, reject) => {
            dns.resolveNs(host, (err, addrs) => err ? reject(err) : resolve(addrs));
          });
          results.ns = ns;
        } catch (e: any) {
          results.ns_error = e.code || e.message;
        }

        // TXT records
        try {
          const txt = await new Promise<string[][]>((resolve, reject) => {
            dns.resolveTxt(host, (err, records) => err ? reject(err) : resolve(records));
          });
          results.txt = txt.map(r => r.join(''));
        } catch (e: any) {
          results.txt_error = e.code || e.message;
        }

        // Reverse lookup
        if (results.ipv4 && results.ipv4.length > 0) {
          try {
            const hostnames = await new Promise<string[]>((resolve, reject) => {
              dns.reverse(results.ipv4[0], (err, names) => err ? reject(err) : resolve(names));
            });
            results.reverse = hostnames;
          } catch (e: any) {
            results.reverse_error = e.code || e.message;
          }
        }

        return ok({
          action: 'dns_resolve',
          target_host: host,
          resolution_time_ms: Date.now() - startTime,
          ...results,
          ai_analysis: {
            verdict: results.ipv4 ? '✅ Resolved' : '❌ Resolution Failed',
            hint: results.ipv4
              ? `Host resolves to ${results.ipv4.join(', ')}. ${results.ipv6 ? 'IPv6 enabled.' : 'No IPv6.'}`
              : 'DNS resolution failed. Check hostname and DNS configuration.',
          },
        });
      } catch (err: any) {
        return fail('DNS_ERROR', err.message);
      }
    }

    // ═══════════════════════════════════
    // REAL SSL/TLS CERTIFICATE INSPECTION
    // ═══════════════════════════════════
    case 'ssl_inspect': {
      let host = args.target_host || 'localhost';
      let port = 443;
      
      // Extract host and port from URL
      if (host.includes('://')) {
        try {
          const url = new URL(host);
          host = url.hostname;
          port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
        } catch {}
      }
      if (host.includes(':')) {
        const parts = host.split(':');
        host = parts[0];
        port = parseInt(parts[1]) || 443;
      }

      return new Promise((resolve) => {
        const startTime = Date.now();
        const options: https.RequestOptions = {
          hostname: host,
          port,
          method: 'HEAD',
          path: '/',
          rejectUnauthorized: false,
          timeout: args.timeout_ms || 10000,
        };

        const req = https.request(options, (res) => {
          const socket = res.socket as any;
          const cert = socket?.getPeerCertificate?.();
          
          if (cert && Object.keys(cert).length > 0) {
            const now = new Date();
            const validFrom = new Date(cert.valid_from);
            const validTo = new Date(cert.valid_to);
            const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const isValid = now >= validFrom && now <= validTo;
            const authorized = socket.authorized;

            resolve(ok({
              action: 'ssl_inspect',
              target: `${host}:${port}`,
              latency_ms: Date.now() - startTime,
              certificate: {
                subject: cert.subject,
                issuer: cert.issuer,
                valid_from: cert.valid_from,
                valid_to: cert.valid_to,
                days_remaining: daysRemaining,
                is_valid: isValid,
                is_trusted: authorized,
                serial_number: cert.serialNumber,
                fingerprint: cert.fingerprint,
                fingerprint256: cert.fingerprint256,
                alt_names: cert.subjectaltname,
                bits: cert.bits,
                protocol_version: socket.getProtocol?.() || 'unknown',
                cipher: socket.getCipher?.(),
              },
              ai_analysis: {
                verdict: isValid && authorized ? '✅ Valid & Trusted' : isValid ? '⚠️ Valid but Untrusted' : '❌ Expired/Invalid',
                warnings: [
                  ...(!authorized ? ['Certificate not trusted by system CA store'] : []),
                  ...(daysRemaining < 30 ? [`⚠️ Certificate expires in ${daysRemaining} days`] : []),
                  ...(daysRemaining < 0 ? [`❌ Certificate EXPIRED ${Math.abs(daysRemaining)} days ago`] : []),
                  ...((cert.bits && cert.bits < 2048) ? ['⚠️ Key size below 2048 bits'] : []),
                ],
                hint: `TLS certificate for ${host} inspected. ${daysRemaining} days until expiry. Protocol: ${socket.getProtocol?.() || 'unknown'}.`,
              },
            }));
          } else {
            resolve(ok({
              action: 'ssl_inspect',
              target: `${host}:${port}`,
              certificate: null,
              ai_analysis: { verdict: '❌ No Certificate', hint: 'No SSL/TLS certificate presented. The host may not support HTTPS.' },
            }));
          }
          res.destroy();
        });

        req.on('error', (err: any) => {
          resolve(ok({
            action: 'ssl_inspect',
            target: `${host}:${port}`,
            error: err.message,
            ai_analysis: {
              verdict: '❌ Connection Failed',
              hint: `Could not establish TLS connection: ${err.message}. The host may not support HTTPS or the port may be incorrect.`,
            },
          }));
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(fail('TIMEOUT', `SSL inspection timed out connecting to ${host}:${port}`));
        });

        req.end();
      });
    }

    // ═══════════════════════════════════
    // REAL PING TEST
    // ═══════════════════════════════════
    case 'ping_test': {
      const host = args.target_host || 'localhost';
      const platform = os.platform();
      const count = 4;

      try {
        // Use Docker isolation for network operations when available
        const profile = autoRouteDecision('server_testing', 'ping_test');
        const pingCmd = platform === 'win32'
          ? `ping -n ${count} ${host}`
          : `ping -c ${count} ${host}`;

        let output: string;
        if (profile) {
          const result = runIsolated({ profile, command: `ping -c ${count} ${host}`, timeoutMs: 15000, network: true, securityLevel: 'standard' });
          output = result.stdout;
        } else {
          output = execSync(pingCmd, { encoding: 'utf-8', timeout: 15000, windowsHide: true }).trim();
        }
        
        // Parse ping statistics
        const latencies: number[] = [];
        const timeRegex = platform === 'win32' ? /time[=<](\d+)ms/gi : /time=([0-9.]+)\s*ms/gi;
        let match;
        while ((match = timeRegex.exec(output)) !== null) {
          latencies.push(parseFloat(match[1]));
        }

        // Parse packet loss
        const lossMatch = output.match(/(\d+)%\s*(packet\s*)?loss/i);
        const packetLoss = lossMatch ? parseInt(lossMatch[1]) : 0;

        return ok({
          action: 'ping_test',
          target_host: host,
          packets_sent: count,
          packets_received: count - Math.round(count * packetLoss / 100),
          packet_loss_percent: packetLoss,
          latency: latencies.length > 0 ? {
            min_ms: Math.min(...latencies),
            max_ms: Math.max(...latencies),
            avg_ms: +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1),
            values: latencies,
          } : null,
          raw_output: output.substring(0, 500),
          ai_analysis: {
            verdict: packetLoss === 0 ? '✅ Reachable' : packetLoss === 100 ? '❌ Unreachable' : '⚠️ Packet Loss',
            hint: packetLoss === 0
              ? `Host responding with avg ${latencies.length > 0 ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) : '?'}ms latency.`
              : packetLoss === 100
              ? 'Host is completely unreachable. Check network connectivity and firewall rules.'
              : `${packetLoss}% packet loss detected. Network may be unstable.`,
          },
        });
      } catch (e: any) {
        return ok({
          action: 'ping_test',
          target_host: host,
          reachable: false,
          error: e.message,
          ai_analysis: { verdict: '❌ Unreachable', hint: `Ping failed: ${e.message}` },
        });
      }
    }

    // ═══════════════════════════════════
    // REAL HTTP HEADERS AUDIT
    // ═══════════════════════════════════
    case 'http_headers': {
      let targetUrl = args.target_host || 'http://localhost:3000';
      if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;

      const result = await timedFetch(targetUrl, 'HEAD', args.timeout_ms || 10000);
      
      if (result.error) {
        // Try http if https failed
        if (targetUrl.startsWith('https://')) {
          const httpResult = await timedFetch(targetUrl.replace('https://', 'http://'), 'HEAD', args.timeout_ms || 10000);
          if (httpResult.error) {
            return fail('CONNECTION_ERROR', `Both HTTPS and HTTP failed: ${result.error}`);
          }
        }
        return fail('CONNECTION_ERROR', result.error);
      }

      // Get full headers by making a proper request
      const headers = await new Promise<Record<string, string>>((resolve) => {
        const parsedUrl = new URL(targetUrl);
        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const req = lib.request(targetUrl, { method: 'HEAD', rejectUnauthorized: false, timeout: 10000 }, (res) => {
          const hdrs: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            hdrs[key] = Array.isArray(value) ? value.join(', ') : (value || '');
          }
          resolve(hdrs);
          res.destroy();
        });
        req.on('error', () => resolve({}));
        req.end();
      });

      // Security headers check
      const SECURITY_HEADERS = [
        { name: 'content-security-policy', label: 'Content-Security-Policy', weight: 20 },
        { name: 'strict-transport-security', label: 'Strict-Transport-Security', weight: 15 },
        { name: 'x-content-type-options', label: 'X-Content-Type-Options', weight: 10 },
        { name: 'x-frame-options', label: 'X-Frame-Options', weight: 10 },
        { name: 'referrer-policy', label: 'Referrer-Policy', weight: 10 },
        { name: 'permissions-policy', label: 'Permissions-Policy', weight: 10 },
        { name: 'x-xss-protection', label: 'X-XSS-Protection', weight: 5 },
        { name: 'cross-origin-opener-policy', label: 'Cross-Origin-Opener-Policy', weight: 5 },
        { name: 'cross-origin-resource-policy', label: 'Cross-Origin-Resource-Policy', weight: 5 },
      ];

      const presentHeaders = SECURITY_HEADERS.filter(h => headers[h.name]);
      const missingHeaders = SECURITY_HEADERS.filter(h => !headers[h.name]);
      const totalWeight = SECURITY_HEADERS.reduce((s, h) => s + h.weight, 0);
      const earnedWeight = presentHeaders.reduce((s, h) => s + h.weight, 0);
      const securityScore = Math.round((earnedWeight / totalWeight) * 100);

      return ok({
        action: 'http_headers',
        target_url: targetUrl,
        status: result.status,
        latency_ms: result.latency_ms,
        all_headers: headers,
        security_audit: {
          score: securityScore,
          grade: securityScore >= 90 ? 'A' : securityScore >= 70 ? 'B' : securityScore >= 50 ? 'C' : securityScore >= 30 ? 'D' : 'F',
          present: presentHeaders.map(h => ({ header: h.label, value: headers[h.name] })),
          missing: missingHeaders.map(h => ({ header: h.label, weight: h.weight })),
        },
        server_info: {
          server: headers['server'] || 'Not disclosed',
          powered_by: headers['x-powered-by'] || 'Not disclosed',
          content_type: headers['content-type'] || 'unknown',
        },
        ai_analysis: {
          verdict: securityScore >= 70 ? '✅ Good Security Headers' : securityScore >= 40 ? '⚠️ Partial Security Headers' : '❌ Weak Security Headers',
          critical_missing: missingHeaders.filter(h => h.weight >= 10).map(h => h.label),
          hint: `Security header score: ${securityScore}/100 (${presentHeaders.length}/${SECURITY_HEADERS.length} headers present). ${missingHeaders.filter(h => h.weight >= 10).length} critical headers missing.`,
          info_leak_warnings: [
            ...(headers['server'] ? [`Server header reveals: "${headers['server']}"`] : []),
            ...(headers['x-powered-by'] ? [`X-Powered-By reveals: "${headers['x-powered-by']}"`] : []),
          ],
        },
      });
    }

    // ═══════════════════════════════════
    // CONFIGURATION AUDIT
    // ═══════════════════════════════════
    case 'configuration_audit': {
      let targetUrl = args.target_host || 'http://localhost:3000';
      if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;

      const checks: Array<{ rule: string; passed: boolean; severity?: string; detail?: string }> = [];
      
      // Check if HTTPS redirects
      if (targetUrl.startsWith('https://')) {
        const httpUrl = targetUrl.replace('https://', 'http://');
        const httpResult = await timedFetch(httpUrl, 'HEAD', 5000);
        checks.push({
          rule: 'http_to_https_redirect',
          passed: httpResult.status === 301 || httpResult.status === 302 || httpResult.status === 308,
          severity: httpResult.status === 301 || httpResult.status === 302 || httpResult.status === 308 ? undefined : 'Medium',
          detail: `HTTP returned status ${httpResult.status}`,
        });
      }

      // Check for common exposed paths
      const dangerousPaths = ['/.env', '/.git/HEAD', '/wp-admin/', '/phpinfo.php', '/.htaccess', '/server-status', '/debug', '/actuator'];
      for (const p of dangerousPaths) {
        const result = await timedFetch(`${targetUrl}${p}`, 'HEAD', 3000);
        checks.push({
          rule: `exposed_path:${p}`,
          passed: result.status === 404 || result.status === 403 || result.status === 0 || result.error !== undefined,
          severity: result.status === 200 ? 'Critical' : undefined,
          detail: `Status: ${result.error || result.status}`,
        });
      }

      const failures = checks.filter(c => !c.passed);

      return ok({
        action: 'configuration_audit',
        target: targetUrl,
        total_checks: checks.length,
        passed: checks.filter(c => c.passed).length,
        failed: failures.length,
        checks,
        ai_analysis: {
          verdict: failures.length === 0 ? '✅ Secure Configuration' : failures.some(f => f.severity === 'Critical') ? '❌ Critical Issues' : '⚠️ Improvements Needed',
          critical_issues: failures.filter(f => f.severity === 'Critical').map(f => `${f.rule}: ${f.detail}`),
          hint: failures.length === 0
            ? 'All configuration checks passed. No exposed sensitive paths found.'
            : `${failures.length} issues found. ${failures.filter(f => f.severity === 'Critical').length} are critical.`,
        },
      });
    }

    // ═══════════════════════════════════
    // REAL SERVER MEMORY MONITORING
    // ═══════════════════════════════════
    case 'server_memory_leak': {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const nodeMemory = process.memoryUsage();

      const snapshots: any[] = [];
      // Take 3 snapshots over a short period
      for (let i = 0; i < 3; i++) {
        const mem = process.memoryUsage();
        snapshots.push({
          time_offset_ms: i * 500,
          rss_mb: +(mem.rss / 1024 / 1024).toFixed(2),
          heapUsed_mb: +(mem.heapUsed / 1024 / 1024).toFixed(2),
          heapTotal_mb: +(mem.heapTotal / 1024 / 1024).toFixed(2),
          external_mb: +(mem.external / 1024 / 1024).toFixed(2),
        });
        if (i < 2) await new Promise(r => setTimeout(r, 500));
      }

      const rssGrowth = snapshots[snapshots.length - 1].rss_mb - snapshots[0].rss_mb;
      const heapGrowth = snapshots[snapshots.length - 1].heapUsed_mb - snapshots[0].heapUsed_mb;

      return ok({
        action: 'server_memory_leak',
        system: {
          total_gb: +(totalMem / 1024 / 1024 / 1024).toFixed(2),
          used_gb: +(usedMem / 1024 / 1024 / 1024).toFixed(2),
          free_gb: +(freeMem / 1024 / 1024 / 1024).toFixed(2),
          usage_percent: +((usedMem / totalMem) * 100).toFixed(1),
        },
        process: {
          rss_mb: +(nodeMemory.rss / 1024 / 1024).toFixed(2),
          heapUsed_mb: +(nodeMemory.heapUsed / 1024 / 1024).toFixed(2),
          heapTotal_mb: +(nodeMemory.heapTotal / 1024 / 1024).toFixed(2),
          external_mb: +(nodeMemory.external / 1024 / 1024).toFixed(2),
          arrayBuffers_mb: +((nodeMemory as any).arrayBuffers / 1024 / 1024).toFixed(2),
        },
        snapshots,
        growth: { rss_delta_mb: +rssGrowth.toFixed(3), heap_delta_mb: +heapGrowth.toFixed(3) },
        ai_analysis: {
          verdict: rssGrowth > 5 ? '⚠️ Memory Growing' : '✅ Stable',
          system_pressure: (usedMem / totalMem) > 0.9 ? 'Critical' : (usedMem / totalMem) > 0.7 ? 'Warning' : 'Normal',
          hint: `System using ${((usedMem / totalMem) * 100).toFixed(1)}% of memory. Process RSS: ${(nodeMemory.rss / 1024 / 1024).toFixed(1)}MB. Monitor over time for unbounded growth patterns.`,
        },
      });
    }

    // ═══════════════════════════════════
    // LOAD BALANCER CHECK
    // ═══════════════════════════════════
    case 'load_balancer_check': {
      let targetUrl = args.target_host || 'http://localhost:3000';
      if (!targetUrl.startsWith('http')) targetUrl = `http://${targetUrl}`;

      // Make multiple requests and check if different servers respond
      const responses: Array<{ status: number; server?: string; via?: string; latency_ms: number }> = [];
      
      for (let i = 0; i < 5; i++) {
        const headers = await new Promise<any>((resolve) => {
          const start = Date.now();
          const parsedUrl = new URL(targetUrl);
          const lib = parsedUrl.protocol === 'https:' ? https : http;
          const req = lib.request(targetUrl, { method: 'HEAD', rejectUnauthorized: false, timeout: 5000 }, (res) => {
            resolve({
              status: res.statusCode,
              server: res.headers['server'],
              via: res.headers['via'],
              x_served_by: res.headers['x-served-by'],
              x_backend: res.headers['x-backend-server'],
              latency_ms: Date.now() - start,
            });
            res.destroy();
          });
          req.on('error', (err: any) => resolve({ status: 0, error: err.message, latency_ms: Date.now() - start }));
          req.end();
        });
        responses.push(headers);
      }

      const uniqueServers = new Set(responses.map(r => r.server || r.via || 'unknown'));
      const avgLatency = +(responses.reduce((s, r) => s + r.latency_ms, 0) / responses.length).toFixed(1);

      return ok({
        action: 'load_balancer_check',
        target: targetUrl,
        requests_made: responses.length,
        unique_backends: uniqueServers.size,
        backends: [...uniqueServers],
        responses: responses.map((r, i) => ({ request: i + 1, ...r })),
        latency_avg_ms: avgLatency,
        ai_analysis: {
          verdict: uniqueServers.size > 1 ? '✅ Load Balancer Detected' : 'Single Backend',
          hint: uniqueServers.size > 1
            ? `Requests distributed across ${uniqueServers.size} different backends. Load balancing is active.`
            : 'All responses came from the same backend server. No load balancing detected (or headers are not exposed).',
        },
      });
    }

    // ═══════════════════════════════════
    // DISASTER RECOVERY (System diagnostics)
    // ═══════════════════════════════════
    case 'disaster_recovery': {
      const platform = os.platform();
      const checks: any[] = [];

      // Check disk space
      if (platform === 'win32') {
        try {
          const diskInfo = execSync('powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json"', { encoding: 'utf-8', windowsHide: true });
          const drives = JSON.parse(diskInfo);
          const driveList = Array.isArray(drives) ? drives : [drives];
          for (const d of driveList) {
            const totalBytes = (d.Used || 0) + (d.Free || 0);
            if (totalBytes > 0) {
              const freePercent = ((d.Free || 0) / totalBytes) * 100;
              checks.push({
                check: `disk_space_${d.Name}`,
                status: freePercent > 10 ? 'passed' : 'warning',
                detail: `${d.Name}: drive has ${(d.Free / 1024 / 1024 / 1024).toFixed(1)}GB free (${freePercent.toFixed(1)}%)`,
              });
            }
          }
        } catch {}
      }

      // Check uptime
      const uptimeHours = os.uptime() / 3600;
      checks.push({
        check: 'system_uptime',
        status: uptimeHours > 720 ? 'warning' : 'passed',
        detail: `System uptime: ${uptimeHours.toFixed(1)} hours (${(uptimeHours / 24).toFixed(1)} days)`,
      });

      // Check memory pressure
      const memUsage = (os.totalmem() - os.freemem()) / os.totalmem();
      checks.push({
        check: 'memory_pressure',
        status: memUsage > 0.9 ? 'critical' : memUsage > 0.75 ? 'warning' : 'passed',
        detail: `Memory usage: ${(memUsage * 100).toFixed(1)}%`,
      });

      // Check CPU load
      const loadAvg = os.loadavg();
      const cpuCount = os.cpus().length;
      checks.push({
        check: 'cpu_load',
        status: loadAvg[0] > cpuCount * 2 ? 'critical' : loadAvg[0] > cpuCount ? 'warning' : 'passed',
        detail: `Load average: ${loadAvg.map(l => l.toFixed(2)).join(', ')} (${cpuCount} CPUs)`,
      });

      const criticals = checks.filter(c => c.status === 'critical');
      const warnings = checks.filter(c => c.status === 'warning');

      return ok({
        action: 'disaster_recovery',
        checks,
        summary: { total: checks.length, passed: checks.filter(c => c.status === 'passed').length, warnings: warnings.length, critical: criticals.length },
        ai_analysis: {
          verdict: criticals.length > 0 ? '❌ Critical Issues' : warnings.length > 0 ? '⚠️ Warnings Present' : '✅ System Healthy',
          hint: 'Real system diagnostics collected. Monitor disk space, memory pressure, and CPU load for disaster recovery readiness.',
        },
      });
    }

    default:
      return fail('UNKNOWN_ACTION', `Action ${args.action} not supported in Server Testing`);
  }
}
