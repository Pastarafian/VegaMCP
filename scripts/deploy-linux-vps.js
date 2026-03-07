/**
 * VegaMCP Linux VPS Deployment Agent
 * 
 * Connects to the Ubuntu VPS over SSH, uploads the payload, and executes
 * the full deployment pipeline: Logger → Assessment → Optimization → Tools → Gateway
 * 
 * Run locally: node scripts/deploy-linux-vps.js
 */

import { Client } from 'ssh2';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config();

const vpsConfig = {
    host: process.env.VEGAMCP_VPS_2_HOST,
    port: parseInt(process.env.VEGAMCP_VPS_2_SSH_PORT || '22'),
    username: process.env.VEGAMCP_VPS_2_USERNAME,
    password: process.env.VEGAMCP_VPS_2_PASSWORD
};

const PAYLOAD_DIR = path.join(process.cwd(), 'vps-testing-suite', 'payload-linux');
const GATEWAY_DIR = path.join(process.cwd(), 'vps-testing-suite', 'gateway-src-linux');
const REMOTE_BASE = '/opt/REDACTED-tests';
const REMOTE_PAYLOAD = `${REMOTE_BASE}/payload`;
const REMOTE_GATEWAY = `${REMOTE_PAYLOAD}/gateway-src`;

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  VegaMCP Linux VPS Deployment Agent                 ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log(`║  Target: ${vpsConfig.host}:${vpsConfig.port}`);
console.log(`║  User:   ${vpsConfig.username}`);
console.log(`║  OS:     Ubuntu (Linux)`);
console.log('╚══════════════════════════════════════════════════════╝');

function exec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let stdout = '', stderr = '';
            stream.on('close', (code) => resolve({ code, stdout, stderr }));
            stream.on('data', (d) => { stdout += d; process.stdout.write(d); });
            stream.stderr.on('data', (d) => { stderr += d; process.stderr.write(d); });
        });
    });
}

function uploadDir(sftp, localDir, remoteDir) {
    return new Promise((resolve, reject) => {
        const files = [];
        function walk(dir, rel) {
            for (const f of fs.readdirSync(dir)) {
                const full = path.join(dir, f);
                const stat = fs.statSync(full);
                if (stat.isDirectory() && f !== 'target' && f !== 'node_modules') {
                    walk(full, path.join(rel, f));
                } else if (stat.isFile()) {
                    files.push({ local: full, remote: `${remoteDir}/${path.join(rel, f).replace(/\\/g, '/')}` });
                }
            }
        }
        walk(localDir, '');

        let done = 0;
        if (files.length === 0) return resolve();

        // Create all directories first, then upload
        const dirs = new Set(files.map(f => f.remote.substring(0, f.remote.lastIndexOf('/'))));
        let dirsCreated = 0;
        const totalDirs = dirs.size;

        if (totalDirs === 0) {
            uploadFiles();
            return;
        }

        for (const dir of dirs) {
            // Use recursive mkdir via exec since sftp.mkdir isn't recursive
            sftp.mkdir(dir, { mode: 0o755 }, () => {
                dirsCreated++;
                if (dirsCreated === totalDirs) uploadFiles();
            });
        }

        function uploadFiles() {
            for (const file of files) {
                sftp.fastPut(file.local, file.remote, (err) => {
                    if (err) console.error(`  [FAIL] ${path.basename(file.local)}: ${err.message}`);
                    else console.log(`  [OK]   ${path.basename(file.local)}`);
                    done++;
                    if (done === files.length) resolve();
                });
            }
        }
    });
}

const conn = new Client();
conn.on('ready', async () => {
    console.log('\n[CONNECTED] SSH session established.\n');

    try {
        // 1. Create remote directories
        console.log('─── Step 1: Creating Remote Directories ───');
        await exec(conn, `mkdir -p ${REMOTE_PAYLOAD} ${REMOTE_GATEWAY}/src ${REMOTE_BASE}/logs ${REMOTE_BASE}/results ${REMOTE_BASE}/media`);

        // 2. Upload all payload scripts + gateway source
        console.log('\n─── Step 2: Uploading Payload via SFTP ───');
        await new Promise((resolve, reject) => {
            conn.sftp(async (err, sftp) => {
                if (err) return reject(err);

                // Create remote dirs first
                await exec(conn, `mkdir -p ${REMOTE_PAYLOAD} ${REMOTE_GATEWAY}/src`);

                await uploadDir(sftp, PAYLOAD_DIR, REMOTE_PAYLOAD);
                await uploadDir(sftp, GATEWAY_DIR, REMOTE_GATEWAY);
                resolve();
            });
        });

        // 3. Make all scripts executable
        console.log('\n─── Step 3: Setting Execute Permissions ───');
        await exec(conn, `chmod +x ${REMOTE_PAYLOAD}/*.sh`);

        // 4. Execute the deployment pipeline
        const steps = [
            { name: 'Start Logger',           script: 'start-logger.sh' },
            { name: 'Assess Hardware',        script: 'assess-vps.sh' },
            { name: 'Optimize VPS',           script: 'optimize-vps.sh' },
            { name: 'Install Testing Suite',  script: 'install-tools.sh' },
            { name: 'Compile & Register Gateway', script: 'install-gateway.sh' },
        ];

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            console.log(`\n─── Step ${i + 4}: ${step.name} ───`);
            const result = await exec(conn, `bash ${REMOTE_PAYLOAD}/${step.script}`);
            if (result.code !== 0) {
                console.error(`[WARN] ${step.name} exited with code ${result.code}`);
            }
        }

        console.log('\n╔══════════════════════════════════════════════════════╗');
        console.log('║  LINUX VPS DEPLOYMENT COMPLETE                       ║');
        console.log('║  The Ubuntu VPS is now a fully armed testing fortress ║');
        console.log('╚══════════════════════════════════════════════════════╝');

    } catch (err) {
        console.error('\n[FATAL]', err.message);
    } finally {
        conn.end();
    }
}).on('error', (err) => {
    console.error('[SSH ERROR]', err.message);
}).connect(vpsConfig);
