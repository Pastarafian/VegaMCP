const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('pm2 list && netstat -tlnp', (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({host: '185.249.74.99', username: 'root', password: process.env.VPS_PASSWORD || '15zopNEGotHEHGe'});
