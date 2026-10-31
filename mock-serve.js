/* خادم اختبار: يقدّم dist/ ويحاكي حساب مصرَّح (admin) حتى نختبر التنقل الحقيقي */
const http = require('http');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname);
  const json = (o, code) => {
    res.statusCode = code || 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(o));
  };
  if (p === '/api/google/status') {
    return json({ configured: true, connected: true, email: 'gstsyusudg@gmail.com', verdict: 'ok' });
  }
  if (p === '/api/sync/pull') return json({ ok: false, error: 'mock' });
  if (p.startsWith('/api/')) return json({ ok: false, error: 'mock' }, 404);

  let file = path.join(dist, p === '/' ? 'index.html' : p.slice(1));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(dist, 'index.html');
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => console.log('mock on ' + PORT));
