const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('export PATH="$HOME/.cargo/bin:$PATH" && cd /opt/rust_vnc && cargo build --release', { pty: true }, (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.on('close', code => conn.end());
  });
}).connect({host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD'});
