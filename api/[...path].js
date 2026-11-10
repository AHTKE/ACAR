/* ============================================================
   api/[...path].js — دالة Vercel واحدة لكل مسارات /api/*
   ------------------------------------------------------------
   Vercel Hobby بيسمح بـ12 دالة فقط لكل نشر. المشروع كان فيه 13
   ملفًا داخل api/، فكل ملف كان بيتحسب دالة مستقلة ويفشل البناء.
   الملف ده catch-all واحد بيوجّه كل مسار لنفس worker.js، من غير
   تغيير أي رابط أو وظيفة في الواجهة أو الديسكتوب.

   ملاحظة: الملفات القديمة api/google/*.js و api/sync/*.js
   اتشالت لأنها كانت مجرد أغلفة رقيقة لنفس worker.js.
   ============================================================ */
import run from '../vercel-run.js';
import { ROUTES } from '../api-routes.js';

/* كل المسارات اللي worker.js بيدعمها. مفيش مسار بيتحول هنا إلا لو
   موجود في القائمة، فأي /api/غير معروف بيرجع 404 JSON.
   المسارات المتداخلة ليها دوال صريحة في api/google/[action].js
   و api/sync/[action].js لأن Vercel مش بيمرّرها للـcatch-all. */
export { ROUTES };

const ALLOWED = new Set(ROUTES);

function apiPathOf(req) {
  /* Vercel catch-all بيمرّر الأجزاء في req.query.path، وبعض
     البيئات بتسيب req.url بالمسار الأصلي. بنتعامل مع الحالتين. */
  let p = req && req.query ? req.query.path : null;
  if (Array.isArray(p)) p = p.join('/');
  if (p) {
    p = decodeURIComponent(String(p)).replace(/^\/+|\/+$/g, '');
    if (p.indexOf('api/') === 0) return '/' + p;
    return '/api/' + p;
  }
  try {
    return decodeURIComponent(new URL(String(req && req.url || ''), 'http://localhost').pathname);
  } catch (e) {
    return '';
  }
}

export default async function handler(req, res) {
  const apiPath = apiPathOf(req);
  if (!ALLOWED.has(apiPath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ok: false, error: 'مسار غير معروف' }));
    return;
  }
  return run(req, res, apiPath);
}
