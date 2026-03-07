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
    res.on('end', () => console.log(JSON.stringify(JSON.parse(buf), null, 2)));
  });
  req.write(data); req.end();
}

function process(raw) {
    let text = raw;
    let expandBlock = '';
    const expMatch = text.match(/<expand>([\s\S]*?)<\/expand>/);
    if (expMatch) {
       let content = expMatch[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
       expandBlock = `<blockquote expandable>${content}</blockquote>\n`;
       text = text.replace(/<expand>[\s\S]*?<\/expand>/, '');
    }
    
    // Convert to HTML
    let out = '';
    const blocks = text.split(/(```[\s\S]*?```|<tg-expand>[\s\S]*?<\/tg-expand>)/g);
    for (let i = 0; i < blocks.length; i++) {
        if (!blocks[i]) continue;
        if (blocks[i].startsWith('```')) {
            const match = blocks[i].match(/```([\w-]*)\n?([\s\S]*?)```/);
            if (match) {
                const code = match[2].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                out += `<pre><code class="language-${match[1] || ''}">${code}</code></pre>`;
            } else { out += blocks[i]; }
        } else {
            let t = blocks[i];
            t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
            t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
            out += t;
        }
    }
    return expandBlock + out;
}

const raw = `
<expand>💭 <b>Thought Process</b>
I am thinking about this right now.
I need to add more than 3 lines so it correctly collapses in Telegram.
If it is too short it just shows as a regular quote.
Line 4 is here.
Line 5 is here.
And finally line 6.
</expand>

Here is the **bold** answer!
\`\`\`javascript
if (a < b) {
  console.log("hello test");
}
\`\`\`
`.trim();

sendTg(process(raw), 'HTML');
