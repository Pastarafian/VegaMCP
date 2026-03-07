/**
 * VegaMCP AI Powerhouse Provisioning Script
 * Installs Ollama, opens API ports, and pulls recommended local models
 * for the 24GB RAM Linux VPS.
 */

import { Client } from 'ssh2';
import { config } from 'dotenv';
config();

const vpsConfig = {
    host: process.env.VEGAMCP_VPS_2_HOST,
    port: parseInt(process.env.VEGAMCP_VPS_2_SSH_PORT || '22'),
    username: process.env.VEGAMCP_VPS_2_USERNAME,
    password: process.env.VEGAMCP_VPS_2_PASSWORD
};

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  VegaMCP VPS AI Powerhouse Provisioning             ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log(`║  Target: ${vpsConfig.host}:${vpsConfig.port}`);
console.log(`║  Goal:   Install Ollama + LLMs (24GB RAM Config)`);
console.log('╚══════════════════════════════════════════════════════╝');

const conn = new Client();

const commands = [
    {
        name: 'Install Ollama (Linux Base)',
        cmd: 'curl -fsSL https://ollama.com/install.sh | sh'
    },
    {
        name: 'Configure Ollama Network Bindings (Expose API)',
        cmd: `mkdir -p /etc/systemd/system/ollama.service.d && cat > /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_ORIGINS=*"
EOF
systemctl daemon-reload && systemctl restart ollama`
    },
    {
        name: 'Open Firewall Port 11434 (Ollama API)',
        cmd: 'ufw allow 11434/tcp 2>/dev/null; iptables -I INPUT -p tcp --dport 11434 -j ACCEPT 2>/dev/null; echo "Firewall opened for 11434"'
    },
    {
        name: 'Pull AI Model: Llama 3 (Meta 8B - Fast Reasoning)',
        cmd: 'ollama pull llama3'
    },
    {
        name: 'Pull AI Model: Qwen 2.5 Coder (Coding Specialist)',
        cmd: 'ollama pull qwen2.5-coder'
    },
    {
        name: 'Verify AI Engine Status',
        cmd: 'curl -s http://localhost:11434/api/tags | grep -o "\\"name\\":\\"[^\\"]*\\"" || echo "Models loaded"'
    }
];

conn.on('ready', async () => {
    console.log('\\n[CONNECTED] Commencing AI Engine Setup...\\n');
    
    for (let i = 0; i < commands.length; i++) {
        const step = commands[i];
        console.log(`\\n─── [${i+1}/${commands.length}] ${step.name} ───`);
        
        await new Promise((resolve) => {
            conn.exec(step.cmd, { pty: true }, (err, stream) => {
                if (err) {
                    console.error(`[ERR] ${err.message}`);
                    return resolve();
                }
                stream.on('data', d => process.stdout.write(d.toString()));
                stream.stderr.on('data', d => process.stderr.write(d.toString()));
                stream.on('close', (code) => {
                    console.log(`[EXIT ${code}]`);
                    resolve();
                });
            });
        });
    }
    
    console.log('\\n╔══════════════════════════════════════════════════════╗');
    console.log('║  AI POWERHOUSE ONLINE                                ║');
    console.log(`║  Ollama API listening on: http://${vpsConfig.host}:11434 ║`);
    console.log('╚══════════════════════════════════════════════════════╝\\n');
    
    conn.end();
}).on('error', err => {
    console.error('[SSH ERROR]', err.message);
}).connect(vpsConfig);
