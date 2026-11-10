/* ============================================================
   vercel-dispatch.js — مُوزّع دوال Vercel المتداخلة
   ------------------------------------------------------------
   api/google/[action].js و api/sync/[action].js بيستخدموا الدالة
   دي علشان يوجّهوا الطلب لنفس worker.js بنفس المسار الكامل.
   ============================================================ */

import run from './vercel-run.js';

function actionOf(req) {
  let action = req && req.query ? req.query.action : '';
  if (Array.isArray(action)) action = action[0];
  try {
    action = decodeURIComponent(String(action || ''));
  } catch (e) {
    action = '';
  }
  return action.replace(/^\/+|\/+$/g, '');
}

export function createActionHandler(prefix, actions) {
  const allowed = new Set(actions);

  return async function handler(req, res) {
    const action = actionOf(req);
    if (!allowed.has(action)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ ok: false, error: 'مسار غير معروف' }));
      return;
    }
    return run(req, res, prefix + '/' + action);
  };
}
