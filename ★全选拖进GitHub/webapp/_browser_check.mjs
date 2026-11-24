import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9334, CDP = 9333;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream',
  '.png': 'image/png', '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    res.writeHead(404); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const tmp = path.join(os.tmpdir(), 'wb_kb_edge_' + Date.now());
const edge = spawn(EDGE, [
  '--headless=new', '--remote-debugging-port=' + CDP, '--disable-gpu',
  '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + tmp,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

let wsUrl = null;
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json();
    const page = list.find(x => x.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (e) { /* 还没起来 */ }
  await new Promise(r => setTimeout(r, 300));
}
if (!wsUrl) {
  console.log('FAIL 拿不到 CDP 调试端口');
  edge.kill(); server.close(); process.exit(1);
}

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push('EXC ' + (d.text || '') + ' ' + (d.exception?.description || '').slice(0, 160));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    const t = m.params.entry.text || '';
    if (!/favicon|404|Failed to load resource/i.test(t)) errors.push('LOG ' + t.slice(0, 160));
  }
};
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJs = async expr => {
  const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return m.result?.result?.value;
};

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
await new Promise(r => setTimeout(r, 6000));

const init = await evalJs(`(() => {
  if (typeof window.enterApp === 'function') { try { window.enterApp(); } catch (e) {} }
  return { sendChat: typeof window.sendChat, ask: typeof window.ask,
           quickQ: !!document.getElementById('quickQ'),
           chips: document.querySelectorAll('#quickQ .chip').length,
           greeting: (document.querySelector('#chatBox .msg.assistant') || {}).textContent };
})()`);

await evalJs(`(() => { document.getElementById('chatInput').value = '动作总是记不住怎么办？'; window.sendChat(); return 1; })()`);
await new Promise(r => setTimeout(r, 1700));
const after = await evalJs(`(() => {
  const msgs = document.querySelectorAll('#chatBox .msg.assistant');
  return { count: msgs.length, last: (msgs[msgs.length - 1] || {}).textContent,
           chips: Array.from(document.querySelectorAll('#quickQ .chip')).map(b => b.textContent) };
})()`);

await evalJs(`(() => { window.ask('给我打个分吧'); return 1; })()`);
await new Promise(r => setTimeout(r, 1700));
const after2 = await evalJs(`(() => {
  const msgs = document.querySelectorAll('#chatBox .msg.assistant');
  return { last: (msgs[msgs.length - 1] || {}).textContent,
           chips: Array.from(document.querySelectorAll('#quickQ .chip')).map(b => b.textContent) };
})()`);

const fatal = errors.filter(e => /SyntaxError|ReferenceError|TypeError|is not defined|Failed to resolve module|does not provide an export/i.test(e));
const checks = [
  ['模块正常加载（sendChat 挂到 window）', init.sendChat === 'function'],
  ['ask 挂到 window', init.ask === 'function'],
  ['quickQ 容器存在', init.quickQ === true],
  ['开场白已换成新版本', /不联网/.test(init.greeting || '') && /答不上来/.test(init.greeting || '')],
  ['首次快捷按钮 10 个', init.chips === 10],
  ['发消息后产生回复', (after.count || 0) >= 2 && !/正在想/.test(after.last || '')],
  ['回复有实质内容', /记|慢|分段|起手/.test(after.last || '')],
  ['答完后建议按钮刷新为 4 个', (after.chips || []).length === 4],
  ['建议按钮贴合刚聊的话题', (after.chips || []).some(x => /分段|慢练|录像|顺序/.test(x))],
  ['打分请求被明确接住', /不打分/.test(after2.last || '')],
  ['无致命 JS 错误', fatal.length === 0]
];
let pass = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (ok) pass += 1; }
console.log('----');
console.log('BROWSER PASS=' + pass + '/' + checks.length);
console.log('ALL_ERRORS(' + errors.length + '): ' + errors.slice(0, 5).join(' | '));
console.log('REPLY1: ' + (after.last || '').slice(0, 90).replace(/\n/g, ' / '));
console.log('CHIPS1: ' + JSON.stringify(after.chips));
console.log('REPLY2: ' + (after2.last || '').slice(0, 90).replace(/\n/g, ' / '));

try { ws.close(); } catch (e) {}
try { edge.kill(); } catch (e) {}
server.close();
process.exit(pass === checks.length ? 0 : 2);
