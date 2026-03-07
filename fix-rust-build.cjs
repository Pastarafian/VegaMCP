const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('apt-get update && apt-get install -y libxcb-randr0-dev', (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.on('close', () => {
      conn.exec('export PATH="$HOME/.cargo/bin:$PATH" && cd /opt/rust_vnc && cargo build --release', (err2, stream2) => {
        stream2.on('data', d => process.stdout.write(d));
        stream2.stderr.on('data', d => process.stdout.write(d));
        stream2.on('close', () => {
          conn.exec('pm2 delete rust_vnc 2>/dev/null || true', () => {
             conn.exec('cd /opt/rust_vnc && pm2 start ./target/release/rust_vnc --name rust_vnc', () => conn.end());
          });
        });
      });
    });
  });
}).connect({host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD'});
