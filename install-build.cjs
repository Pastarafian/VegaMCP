const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('apt-get update && apt-get install -y libx11-dev libxext-dev libxrender-dev libxinerama-dev libxcursor-dev libxfixes-dev libxrandr-dev libxi-dev libvulkan-dev', (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.on('close', () => {
      conn.exec('export PATH="$HOME/.cargo/bin:$PATH" && cd /opt/rust_vnc && cargo build --release', (err2, stream2) => {
        stream2.on('data', d => process.stdout.write(d));
        stream2.stderr.on('data', d => process.stdout.write(d));
        stream2.on('close', () => conn.end());
      });
    });
  });
}).connect({host: '185.249.74.99', username: 'root', password: process.env.VPS_PASSWORD || '15zopNEGotHEHGe'});
