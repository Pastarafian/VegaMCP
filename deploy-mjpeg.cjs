const fs = require('fs');
const { Client } = require('ssh2');

const vps = { host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD' };

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
      console.log('Pushing server handler for MJPEG...');
      await pushFile(conn, 'c:/tmp/claw-server.js', '/opt/claw-server.js');
      console.log('Pushing GUI to point to streaming endpoint...');
      await pushFile(conn, 'c:/tmp/claw-gui.html', '/opt/claw-gui.html');
      
      console.log('Restarting server...');
      await execCmd(conn, 'pm2 restart claw-server');
      console.log('Done mapping streaming endpoint!');
    } catch (e) {
      console.error(e);
    } finally {
      conn.end();
    }
  }).connect(vps);
};
run();
