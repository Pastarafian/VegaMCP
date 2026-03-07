const fs = require('fs');
const { Client } = require('ssh2');

const vps = { host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD' };

const run = async () => {
  const conn = new Client();
  conn.on('ready', () => {
    conn.sftp((err, sftp) => {
      sftp.fastGet('/opt/rust_vnc/build_err.log', 'c:/tmp/build_err.log', {}, (err) => {
        if (err) console.error(err);
        else console.log('Downloaded build_err.log');
        conn.end();
      });
    });
  }).connect(vps);
};
run();
