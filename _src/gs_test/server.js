// Playwright용: 가짜 시트 위에서 실제 Apps Script 코드를 돌리는 로컬 서버 (node server.js [port])
const http = require('http');
require('./fake.js');
const port = Number(process.argv[2] || 8790);
http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.url.startsWith('/__now')) {  // 시간 앞당기기: /__now?add=분
    const add = Number(new URL(req.url, 'http://x').searchParams.get('add') || 0);
    global.__NOW += add * 60000; res.writeHead(200, h); return res.end(JSON.stringify({ now: global.__NOW }));
  }
  let b = ''; req.on('data', c => b += c);
  req.on('end', () => {
    const out = req.method === 'POST' ? doPost({ postData: { contents: b } }) : doGet({ parameter: Object.fromEntries(new URL(req.url, 'http://x').searchParams) });
    res.writeHead(200, h); res.end(out.getContent());
  });
}).listen(port, '127.0.0.1', () => console.log('fake sheet on', port));
