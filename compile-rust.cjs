const fs = require('fs');
const { Client } = require('ssh2');

const vps = { host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD' };

const execCmd = (conn, cmd) => new Promise((resolve, reject) => {
  conn.exec(cmd, (err, stream) => {
    if (err) return reject(err);
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', code => resolve());
  });
});

const run = async () => {
  const conn = new Client();
  conn.on('ready', async () => {
    try {
      console.log('Compiling...');
      await execCmd(conn, 'export PATH="$HOME/.cargo/bin:$PATH" && cd /opt/rust_vnc && cargo build --release');
    } catch (e) {
      console.error(e);
    } finally {
      conn.end();
    }
  }).connect(vps);
};
run();
