/* ============================================================
   preview-local.mjs — معاينة محلية بنفس منطق Vercel
   يقدّم dist/ كملفات ثابتة + نفس مسارات worker.js اللي Vercel
   بيناديها من دالة catch-all واحدة، يعني شاشة ربط Google بتشتغل
   هنا نفس شغلها هناك.
   التشغيل: node preview-local.mjs   ثم افتح http://localhost:4567
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import run from './vercel-run.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const PORT = Number(process.env.PORT || 4567);

/* المفاتيح من الملفات المحلية (متجاهَلة لو مش موجودة — مبتتطبعش خالص) */
for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
  const f = path.join(root, name);
  if (fs.existsSync(f) && !process.env[name]) {
    process.env[name] = fs.readFileSync(f, 'utf8').trim();
  }
}

/* نفس المسارات اللي بيخدمها catch-all على Vercel */
const ROUTES = [
  '/api/google/status',
  '/api/google/ping',
  '/api/google/check',
  '/api/google/capabilities',
  '/api/google/login',
  '/api/google/callback',
  '/api/google/access-token',
  '/api/google/upload',
  '/api/google/notify',
  '/api/google/disconnect',
  '/api/sync/pull',
  '/api/sync/push',
  '/api/sync/folder',
  '/api/sync/versions',
  '/api/sync/version'
];
const handlers = new Map();
for (const route of ROUTES) {
  handlers.set(route, (req, res) => {
    /* المعاينة المحلية http مش https، وVercel بيحدد البروتوكول
       في الهيدرز. نضبطه هنا عشان روابط OAuth المحلية تطلع http. */
    if (!req.headers['x-forwarded-proto']) req.headers['x-forwarded-proto'] = 'http';
    if (!req.headers['x-forwarded-host'] && req.headers.host) req.headers['x-forwarded-host'] = req.headers.host;
    return run(req, res, route);
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = decodeURIComponent(url.pathname);

  const handler = handlers.get(pathname);
  if (handler) {
    try {
      await handler(req, res);
    } catch (e) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: e && e.message ? e.message : 'خطأ' }));
    }
    return;
  }
  if (pathname.startsWith('/api/')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'مسار غير معروف' }));
    return;
  }

  let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  let file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(dist, 'index.html');
  }
  const type = TYPES[path.extname(file)] || 'application/octet-stream';
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('listening on ' + PORT);
  console.log('GOOGLE_CLIENT_ID ' + (process.env.GOOGLE_CLIENT_ID ? 'مضبوط' : 'مش مضبوط'));
  console.log('GOOGLE_CLIENT_SECRET ' + (process.env.GOOGLE_CLIENT_SECRET ? 'مضبوط' : 'مش مضبوط'));
});