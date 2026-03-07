const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('grep -rn "All providers timed out" /opt/', (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
}).connect({host: '185.249.74.99', username: 'root', password: process.env.VPS_PASSWORD || '15zopNEGotHEHGe'});
