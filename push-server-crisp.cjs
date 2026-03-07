const { Client } = require('ssh2');

const vps = { host: '185.249.74.99', username: 'root', password: process.env.VPS_PASSWORD || '15zopNEGotHEHGe' };

const pushFile = (conn, local, remote) => new Promise((resolve, reject) => {
  conn.sftp((err, sftp) => {
    if (err) return reject(err);
    sftp.fastPut(local, remote, { converters: [] }, err => {
      if (err) reject(err); else resolve();
    });
  });
});

const execCmd = (conn, cmd) => new Promise((resolve, reject) => {
  conn.exec(cmd, (err, stream) => {
    if (err) return reject(err);
    let out = '';
    stream.on('data', d => out += d).on('close', () => resolve(out));
  });
});

const run = async () => {
  const conn = new Client();
  conn.on('ready', async () => {
    try {
      console.log('Pushing updated server to strip <think> and [ACTION] tags...');
      await pushFile(conn, 'c:/tmp/claw-server.js', '/opt/claw-server.js');
      console.log('Restarting PM2 claw-server...');
      await execCmd(conn, 'pm2 restart claw-server');
      console.log('Successfully deployed Crisp chat updates!');
    } catch (e) {
      console.error(e);
    } finally {
      conn.end();
    }
  }).connect(vps);
};
run();
