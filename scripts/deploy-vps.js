/**
 * VegaMCP VPS Deployment Agent
 * 
 * Connects to the VPS over SSH, uploads the payload, and executes
 * the full deployment pipeline: Logger → Assessment → Optimization → Tools → Gateway
 * 
 * Run locally: node scripts/deploy-vps.js
 */

import { Client } from 'ssh2';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config();

const vpsConfig = {
    host: process.env.VEGAMCP_VPS_1_HOST,
    port: parseInt(process.env.VEGAMCP_VPS_1_SSH_PORT || '22'),
    username: process.env.VEGAMCP_VPS_1_USERNAME,
    password: process.env.VEGAMCP_VPS_1_PASSWORD
};

const PAYLOAD_DIR = path.join(process.cwd(), 'vps-testing-suite', 'payload');
const GATEWAY_DIR = path.join(process.cwd(), 'vps-testing-suite', 'gateway-src');
const REMOTE_BASE = 'C:/VegaMCP-Tests';
const REMOTE_PAYLOAD = `${REMOTE_BASE}/payload`;
const REMOTE_GATEWAY = `${REMOTE_PAYLOAD}/gateway-src`;

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  VegaMCP VPS Deployment Agent                       ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log(`║  Target: ${vpsConfig.host}:${vpsConfig.port}`);
console.log(`║  User:   ${vpsConfig.username}`);
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

        for (const file of files) {
            const remoteFolder = file.remote.substring(0, file.remote.lastIndexOf('/'));
            sftp.mkdir(remoteFolder, { mode: 0o755 }, () => {
                sftp.fastPut(file.local, file.remote, (err) => {
                    if (err) console.error(`  [FAIL] ${path.basename(file.local)}: ${err.message}`);
                    else console.log(`  [OK]   ${path.basename(file.local)}`);
                    done++;
                    if (done === files.length) resolve();
                });
            });
        }
    });
}

const conn = new Client();
conn.on('ready', async () => {
    console.log('\n[CONNECTED] SSH session established.\n');

    try {
        // 1. Create remote directories
        console.log('─── Step 1: Creating Remote Directories ───');
        await exec(conn, `powershell -Command "New-Item -ItemType Directory -Force -Path '${REMOTE_PAYLOAD}','${REMOTE_GATEWAY}/src','${REMOTE_BASE}/logs','${REMOTE_BASE}/results','${REMOTE_BASE}/media' | Out-Null"`);

        // 2. Upload all payload scripts + gateway source
        console.log('\n─── Step 2: Uploading Payload via SFTP ───');
        await new Promise((resolve, reject) => {
            conn.sftp(async (err, sftp) => {
                if (err) return reject(err);
                await uploadDir(sftp, PAYLOAD_DIR, REMOTE_PAYLOAD);
                await uploadDir(sftp, GATEWAY_DIR, REMOTE_GATEWAY);
                resolve();
            });
        });

        // 3. Execute the deployment pipeline
        const steps = [
            { name: 'Start Logger',        script: 'start-logger.ps1' },
            { name: 'Assess Hardware',     script: 'assess-vps.ps1' },
            { name: 'Optimize VPS',        script: 'optimize-vps.ps1' },
            { name: 'Install Testing Suite', script: 'install-tools.ps1' },
            { name: 'Compile & Register Gateway', script: 'install-gateway.ps1' },
        ];

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            console.log(`\n─── Step ${i + 3}: ${step.name} ───`);
            const result = await exec(conn, `powershell -ExecutionPolicy Bypass -File ${REMOTE_PAYLOAD}/${step.script}`);
            if (result.code !== 0) {
                console.error(`[WARN] ${step.name} exited with code ${result.code}`);
            }
        }

        console.log('\n╔══════════════════════════════════════════════════════╗');
        console.log('║  VPS DEPLOYMENT COMPLETE                             ║');
        console.log('║  The VPS is now a fully armed testing powerhouse.    ║');
        console.log('╚══════════════════════════════════════════════════════╝');

    } catch (err) {
        console.error('\n[FATAL]', err.message);
    } finally {
        conn.end();
    }
}).on('error', (err) => {
    console.error('[SSH ERROR]', err.message);
}).connect(vpsConfig);
