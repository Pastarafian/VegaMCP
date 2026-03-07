const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('cd /opt/rust_vnc && export PATH="$HOME/.cargo/bin:$PATH" && cargo build --release 2> build_err.log', (err, stream) => {
    stream.on('close', code => {
      conn.exec('cat /opt/rust_vnc/build_err.log', (err2, stream2) => {
        stream2.on('data', d => process.stdout.write(d));
        stream2.on('close', () => conn.end());
      });
    });
  });
}).connect({host: '185.249.74.99', username: 'root', password: process.env.VPS_PASSWORD || '15zopNEGotHEHGe'});
