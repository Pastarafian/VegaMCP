const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('export PATH="$HOME/.cargo/bin:$PATH" && cd /opt/rust_vnc && cargo clean && cargo build --release 2> build_err.log', (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.on('close', code => {
      conn.exec('cat /opt/rust_vnc/build_err.log', (err2, stream2) => {
        let errs = '';
        stream2.on('data', d => errs += d.toString());
        stream2.on('close', () => {
          const lines = errs.split('\\n');
          const idx = lines.findIndex(l => l.includes('error: linking with `cc` failed'));
          if (idx !== -1) {
             console.log(lines.slice(idx, idx + 40).join('\\n'));
          } else {
             console.log(errs);
          }
          conn.end();
        });
      });
    });
  });
}).connect({host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD'});
