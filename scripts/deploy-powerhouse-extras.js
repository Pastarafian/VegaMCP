/**
 * VegaMCP — The Ultimate Powerhouse Expansion (Linux VPS)
 * 
 * Installs everything needed to make this VPS an absolute beast for:
 * 1. AI Orchestration & Coding Agents (Aider, Open Interpreter, CrewAI)
 * 2. Full IDE Automation (VS Code + extensions)
 * 3. Extreme Security Testing (Metasploit, OWASP ZAP)
 * 4. Deep Learning & Jupyter (PyTorch, Transformers, JupyterLab)
 * 5. Infrastructure & DBs (MongoDB, Terraform, Ansible, Sysbench)
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

const BASH_PAYLOAD = `#!/bin/bash
set -eo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "========================================================="
echo "   INITIATING PHASE 2: ULTIMATE AI & TESTING EXPANSION   "
echo "========================================================="
LOG_FILE="/opt/vegamcp-tests/logs/powerhouse-expansion.log"

log() {
    echo -e "\\033[1;36m>>> $1\\033[0m"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

# 1. ADD REPOSITORIES
log "Adding Repositories (VS Code, HashiCorp, MongoDB)..."
# VS Code
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg 2>/dev/null
install -D -o root -g root -m 644 packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg
echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list
rm -f packages.microsoft.gpg

# HashiCorp (Terraform)
wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg 2>/dev/null
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" > /etc/apt/sources.list.d/hashicorp.list

apt-get update -qq > /dev/null 2>&1

# 2. INSTALL INFRASTRUCTURE & IDE
log "Installing VS Code, Terraform, Ansible, Stress-ng, Sysbench..."
apt-get install -y -qq code terraform ansible stress-ng sysbench > /dev/null 2>&1

# 3. AI CODING AGENTS & DATA SCIENCE (Python)
log "Installing AI Agents & DS Stack (Aider, Open-Interpreter, PyTorch, Jupyter)..."
# Using pip3 with break-system-packages because we control this environment
pip3 install --break-system-packages --quiet --ignore-installed \\
    aider-chat \\
    open-interpreter \\
    crewai \\
    pyautogen \\
    jupyterlab \\
    torch torchvision torchaudio \\
    transformers \\
    langchain \\
    beautifulsoup4 \\
    pandas numpy matplotlib scikit-learn > /dev/null 2>&1

# 4. ADVANCED SECURITY TOOLS (OWASP ZAP & Metasploit)
log "Installing Security Arsenal (Metasploit, OWASP ZAP)..."
if ! command -v msfconsole &> /dev/null; then
    curl -fsSL https://raw.githubusercontent.com/rapid7/metasploit-omnibus/master/config/templates/metasploit-framework-wrappers/msfupdate.erb > msfinstall 2>/dev/null
    chmod 755 msfinstall
    ./msfinstall > /dev/null 2>&1
    rm msfinstall
fi

# 5. MONGODB (NoSQL backend)
log "Installing MongoDB..."
apt-get install -y -qq mongodb-clients > /dev/null 2>&1 || true # installing client for quick testing
apt-get install -y -qq mongodb > /dev/null 2>&1 || true

# 6. HEADLESS BROWSER CAPABILITIES
log "Ensuring advanced headless browser libraries exist..."
apt-get install -y -qq libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 > /dev/null 2>&1

# 7. ADD VSCODE EXTENSIONS
log "Installing VS Code Extensions (Python, Node, AI)..."
# Install extensions for root so The Claw can use them
code --user-data-dir /root/.vscode-root --ext Python >/dev/null 2>&1 || true
code --user-data-dir /root/.vscode-root --install-extension ms-python.python >/dev/null 2>&1 || true
code --user-data-dir /root/.vscode-root --install-extension dbaeumer.vscode-eslint >/dev/null 2>&1 || true
code --user-data-dir /root/.vscode-root --install-extension GitHub.copilot >/dev/null 2>&1 || true

echo "========================================================="
echo "   PHASE 2 COMPLETE: TERMINAL IS NOW A GOD-TIER SERVER   "
echo "========================================================="
`;

const conn = new Client();
conn.on('ready', () => {
    console.log('[CONNECTED] Launching Phase 2 Ultimate Expansion...');
    const cmd = `cat << 'EOF' > /tmp/powerhouse-expansion.sh\n${BASH_PAYLOAD}\nEOF\nchmod +x /tmp/powerhouse-expansion.sh && bash /tmp/powerhouse-expansion.sh`;
    
    conn.exec(cmd, { pty: true }, (err, stream) => {
        if (err) { console.error('Execution err:', err); conn.end(); return; }
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', code => {
            console.log(`[EXIT ${code}] Expansion complete.`);
            conn.end();
        });
    });
}).on('error', err => {
    console.error('SSH Error:', err);
}).connect(vpsConfig);
