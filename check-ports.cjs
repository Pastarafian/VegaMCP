const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('ss -tlnp', (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).on('error', err => console.error('SSH Error:', err.message))
.connect({host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD'});
