const { Client } = require('ssh2');

const VPS_IP = 'REDACTED_IP';
const VNC_PORT = 5901;

console.log('Establishing secure VNC tunnel to VPS...');

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established.');
    const net = require('net');
    
    // Create a local server to listen on 5901
    const server = net.createServer((socket) => {
        conn.forwardOut(
            socket.remoteAddress,
            socket.remotePort,
            '127.0.0.1',
            VNC_PORT,
            (err, stream) => {
                if (err) {
                    console.error('Forwarding error:', err);
                    return socket.end();
                }
                socket.pipe(stream);
                stream.pipe(socket);
            }
        );
    });

    server.listen(VNC_PORT, '127.0.0.1', () => {
        console.log(`\\n>>> VNC TUNNEL ACTIVE <<<`);
        console.log(`=> Connect your VNC Viewer to: localhost:${VNC_PORT}`);
        console.log(`=> Password (when prompted):   REDACTED_PASSWORD\\n`);
        console.log('Press Ctrl+C to close the tunnel.');
    });

    server.on('error', (err) => {
        console.error('Local server error:', err.message);
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${VNC_PORT} is already in use locally!`);
        }
    });

}).on('error', (err) => {
    console.error('SSH Connection Error:', err.message);
}).connect({
    host: VPS_IP,
    port: 22,
    username: 'root',
    password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD'
});
