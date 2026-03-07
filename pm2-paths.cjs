const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('pm2 jlist', (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => {
      const data = JSON.parse(out);
      data.forEach(p => console.log(`${p.name}: ${p.pm2_env.pm_exec_path}`));
      conn.end();
    });
  });
}).connect({host: '185.249.74.99', username: 'root', password: process.env.VPS_PASSWORD || '15zopNEGotHEHGe'});
