const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('export PATH="$HOME/.cargo/bin:$PATH" && cd /opt/rust_vnc && export DISPLAY=:1 && pm2 restart rust_vnc --update-env', (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({host: '185.249.74.99', username: 'root', password: process.env.VPS_PASSWORD || '15zopNEGotHEHGe'});
