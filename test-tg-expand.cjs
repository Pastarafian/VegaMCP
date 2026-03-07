const https = require('https');
const BOT_TOKEN = '7752961016:AAEZopg2RkYbvCDg-C2kTHHWd12Eu6d61Gs';
const CHAT_ID = '8174978162';

function sendTg(msg, parseMode) {
  const data = JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: parseMode });
  const req = https.request({
    hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST', headers: { 'Content-Type': 'application/json' }
  }, res => {
    let buf = '';
    res.on('data', c => buf += c);
    res.on('end', () => console.log(parseMode, buf));
  });
  req.write(data); req.end();
}

// Test Markdown with **> expandable blockquote **
sendTg('Test Markdown expand:\n**> This is an\nexpandable blockquote**', 'Markdown');
sendTg('Test Markdown expand 2:\n**> This is an\n> expandable blockquote**', 'Markdown');
sendTg('Test HTML blockquote:\n<blockquote expandable>This should be exactly what we need, an expandable blockquote!</blockquote>', 'HTML');
