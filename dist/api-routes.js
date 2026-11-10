/* ============================================================
   api-routes.js — قائمة مسارات /api المشتركة
   ------------------------------------------------------------
   Vercel لا تمرّر المسارات المتداخلة إلى catch-all الموجود في
   api/[...path].js، لذلك لكل مجموعة مسارات دالة صريحة:
     api/google/[action].js
     api/sync/[action].js
   والقائمة هنا هي المصدر الوحيد المسموح به للثلاث دوال.
   ============================================================ */

export const GOOGLE_ACTIONS = [
  'status',
  'ping',
  'check',
  'capabilities',
  'login',
  'callback',
  'access-token',
  'upload',
  'notify',
  'disconnect'
];

export const SYNC_ACTIONS = [
  'pull',
  'push',
  'folder',
  'versions',
  'version'
];

export const ROUTES = [
  ...GOOGLE_ACTIONS.map((action) => '/api/google/' + action),
  ...SYNC_ACTIONS.map((action) => '/api/sync/' + action)
];
