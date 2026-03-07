const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    sftp.fastGet('/opt/claw-vision-worker.py', 'c:/tmp/claw-vision-worker.py', err => {
      conn.end();
    });
  });
}).connect({host: '185.249.74.99', username: 'root', password: process.env.VPS_PASSWORD || '15zopNEGotHEHGe'});
