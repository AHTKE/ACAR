/* ============================================================
   vercel-run.js — مُشغّل الـWorker على Vercel (مشكل من ملفات api/)
   ------------------------------------------------------------
   كل ملف جوه api/ بينادي run(req, res, '/api/....') بالمسار
   الصريح، فمفيش أي اعتماد على تسمية المسارات في Vercel.

   المتغيّرات المطلوبة في Vercel ← Settings ← Environment Variables:
     GOOGLE_CLIENT_ID
     GOOGLE_CLIENT_SECRET
   تخزين الربط والإعدادات في كوكي آمن (شوف vercel-db.js).
   ============================================================ */

import worker from './worker.js';
import { createCookieDB } from './vercel-db.js';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length'
]);

function originOf(req) {
  const proto = String((req.headers['x-forwarded-proto'] || 'https')).split(',')[0].trim() || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return proto + '://' + host;
}

function queryOf(req) {
  const u = String(req.url || '');
  const i = u.indexOf('?');
  return i < 0 ? '' : u.slice(i);
}

function send(res, key, value) {
  if (value == null) return;
  if (typeof res.setHeader === 'function') res.setHeader(key, value);
}

export default async function run(req, res, apiPath) {
  /* نجمع جسم الطلب (Vercel بيعطيه stream) */
  let raw = '';
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    raw = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', () => resolve(''));
    });
  }

  /* مخزن الحالة مبني فوق كوكي — الجديد بيترسم على الرد بنفسه */
  const store = createCookieDB(req.headers.cookie || '');

  const headers = new Headers();
  for (const k of Object.keys(req.headers)) {
    if (HOP_BY_HOP.has(String(k).toLowerCase())) continue;
    const v = req.headers[k];
    if (v == null) continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  }

  const url = originOf(req) + apiPath + queryOf(req);
  const init = { method: req.method || 'GET', headers, redirect: 'manual' };
  if (raw) init.body = raw;

  let response;
  try {
    response = await worker.fetch(new Request(url, init), {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      DB: store.db,
      ASSETS: { fetch: async () => new Response('غير مدعوم على Vercel', { status: 404 }) }
    });
  } catch (e) {
    res.statusCode = 500;
    send(res, 'Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: (e && e.message) || 'خطأ غير متوقع' }));
    return;
  }

  res.statusCode = response.status;
  const ct = response.headers.get('content-type');
  if (ct) send(res, 'Content-Type', ct);
  const cc = response.headers.get('cache-control');
  if (cc) send(res, 'Cache-Control', cc);
  const loc = response.headers.get('location');
  if (loc) send(res, 'Location', loc);

  /* كل ترويسات Set-Cookie (بنبنيها رأسياً لأن القيم فيها فواصل) */
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  const pending = store.pendingCookie();
  const all = setCookies.slice();
  if (pending) all.push(pending);
  if (all.length) send(res, 'Set-Cookie', all);

  if (req.method === 'HEAD') { res.end(); return; }

  const buf = Buffer.from(await response.arrayBuffer());
  send(res, 'Content-Length', String(buf.length));
  res.end(buf);
}
