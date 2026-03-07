import { Client } from 'ssh2';
import net from 'net';
import { config } from 'dotenv';
config();

const vps1Config = {
    host: process.env.VEGAMCP_VPS_1_HOST,
    port: parseInt(process.env.VEGAMCP_VPS_1_SSH_PORT || '22'),
    username: process.env.VEGAMCP_VPS_1_USERNAME,
    password: process.env.VEGAMCP_VPS_1_PASSWORD
};

const vps2Config = {
    host: process.env.VEGAMCP_VPS_2_HOST,
    port: parseInt(process.env.VEGAMCP_VPS_2_SSH_PORT || '22'),
    username: process.env.VEGAMCP_VPS_2_USERNAME,
    password: process.env.VEGAMCP_VPS_2_PASSWORD
};

const REMOTE_GATEWAY_PORT = 42015;

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  The Claw — Secure Gateway Tunnel Manager            ║');
console.log('╚══════════════════════════════════════════════════════╝');

function createGatewayTunnel(name, config, localPort) {
    if (!config.host || !config.username || !config.password) {
        console.log(`[SKIP] ${name}: Credentials not fully configured in .env`);
        return;
    }

    const server = net.createServer((localSocket) => {
        const conn = new Client();
        
        conn.on('ready', () => {
            conn.forwardOut('127.0.0.1', 0, '127.0.0.1', REMOTE_GATEWAY_PORT, (err, remoteStream) => {
                if (err) {
                    console.error(`[${name} ERR] Tunnel forwarding failed:`, err.message);
                    localSocket.end();
                    conn.end();
                    return;
                }
                localSocket.pipe(remoteStream).pipe(localSocket);
                remoteStream.on('close', () => conn.end());
                localSocket.on('close', () => conn.end());
            });
        });

        conn.on('error', (err) => {
            console.error(`[${name} SSH ERR]`, err.message);
            localSocket.end();
        });

        conn.connect(config);
    });

    server.listen(localPort, '127.0.0.1', () => {
        console.log(`[READY] ${name} Gateway active -> localhost:${localPort}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[ERR] Local port ${localPort} for ${name} is already in use.`);
        } else {
            console.error(`[${name} ERR]`, err.message);
        }
    });
}

// Map VPS-1 to localhost 42015
createGatewayTunnel('VPS-1 (Windows)', vps1Config, 42015);

// Map VPS-2 to localhost 42016
createGatewayTunnel('VPS-2 (Linux)', vps2Config, 42016);

console.log('Tunnels are running. The Claw will now be able to communicate with the remote Sentinel gateways securely.\n');
