const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('tail -n 50 /opt/rust_vnc/build_err.log', (err2, stream2) => {
    stream2.on('data', d => process.stdout.write(d));
    stream2.on('close', () => conn.end());
  });
}).connect({host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD'});
