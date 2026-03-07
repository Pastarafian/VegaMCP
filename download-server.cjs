const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    sftp.fastGet('/opt/claw-server.js', 'c:/tmp/claw-server.js', err => {
      sftp.fastGet('/opt/claw-gui.js', 'c:/tmp/claw-gui.js', err => {
        conn.end();
      });
    });
  });
}).connect({host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD'});
