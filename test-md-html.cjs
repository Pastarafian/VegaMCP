function mdToHtml(text) {
  // Simple markdown to Telegram HTML converter
  let out = '';
  // Split by code blocks to avoid touching code content (except escaping < > &)
  const blocks = text.split(/(```[\s\S]*?```)/g);
  for (let i = 0; i < blocks.length; i++) {
    if (i % 2 === 1) { // It's a code block
      const match = blocks[i].match(/```([\w-]*)\n?([\s\S]*?)```/);
      if (match) {
        const lang = match[1] || '';
        const code = match[2].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        out += `<pre><code class="language-${lang}">${code}</code></pre>`;
      } else {
        out += blocks[i];
      }
    } else { // Normal text
      let t = blocks[i];
      // Escape HTML entities
      t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Inline code
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      // Bold
      t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      // Italic (catch both *italic* and _italic_)
      t = t.replace(/(^|[\s])\*([^*]+)\*([\s.,!?]|$)/g, '$1<i>$2</i>$3');
      t = t.replace(/(^|[\s])_([^_]+)_([\s.,!?]|$)/g, '$1<i>$2</i>$3');
      // Links
      t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      // Expandable blockquotes (custom tag injection)
      t = t.replace(/<tg-expand>([\s\S]*?)<\/tg-expand>/g, '<blockquote expandable>$1</blockquote>');
      // Actually, since we escaped < and >, we use a magic string or preserve them:
      out += t;
    }
  }
  return out;
}

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

const raw = `
<expand>💭 Thought Process
I am thinking about this!
And it is multi-line with some math <3
</expand>

Here is the **bold** answer!
\`\`\`javascript
if (a < b) {
  console.log("hello & world");
}
\`\`\`
`.trim();

// Custom pre-processor to inject the blockquote safely
function process(raw) {
    let text = raw;
    let expandBlock = '';
    const expMatch = text.match(/<expand>([\s\S]*?)<\/expand>/);
    if (expMatch) {
       let content = expMatch[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
       expandBlock = `<blockquote expandable>${content}</blockquote>\n`;
       text = text.replace(/<expand>[\s\S]*?<\/expand>/, '');
    }
    
    let out = mdToHtml(text);
    return expandBlock + out;
}

sendTg(process(raw), 'HTML');
