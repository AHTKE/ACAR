/* ============================================================
   desktop/google-keys.js — مكان واحد لقراءة مفاتيح Google
   ------------------------------------------------------------
   كل حاجة بتتعامل مع المفاتيح (البناء / الفحص / الخادم) بتقرأ
   من هنا، عشان الصيغة والأولوية ما يتكرّروش في أكتر من ملف.

   الأولوية:
     • البناء (resolveForBuild): الملف أولًا ثم متغيّرات البيئة.
       السبب: لو حطيت عميل OAuth جديد في الملف، مفتاح قديم في
       متغيّر بيئة ما يلغيهوش وقت البناء.
     • التشغيل (runtimeKeys): متغيّر البيئة الصريح يتغلّب على الملف
       (للاختبارات والتشغيل المؤقت) — والنسخة المبنية بتستخدم ملفها.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_REDIRECT = 'http://127.0.0.1:47820/api/google/callback';
const ID_RE = /^\d{6,}-[a-z0-9_-]{10,}\.apps\.googleusercontent\.com$/i;
const SECRET_RE = /^GOCSPX-[A-Za-z0-9_-]{8,}$/;

function clean(v) {
  return String(v == null ? '' : v)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[\s"'`]+/, '')
    .replace(/[\s"'`]+$/, '')
    .replace(/[\r\n\t]/g, '')
    .trim();
}

/* Google بينزّل الملف جوّه installed (Desktop) أو web (Web application) */
function normalize(data) {
  if (!data || typeof data !== 'object') return {};
  const inner = data.installed || data.web;
  const base = inner && typeof inner === 'object' ? Object.assign({}, data, inner) : data;
  return {
    client_id: clean(base.client_id),
    client_secret: clean(base.client_secret),
    redirect_uris: Array.isArray(base.redirect_uris) ? base.redirect_uris : [],
    type: data.installed ? 'Desktop app' : data.web ? 'Web application' : 'غير معروف'
  };
}

function validateId(id) {
  return ID_RE.test(clean(id));
}

function validateSecret(secret) {
  return SECRET_RE.test(clean(secret));
}

/* آخر جزء بيميّز المفتاح فعلًا (نهاية الـID ثابتة لكل المفاتيح) */
function tail(id) {
  const v = clean(id).split('.')[0];
  return v.length > 20 ? v.slice(0, 13) + '…' + v.slice(-6) : v;
}

function keyFile(env, file) {
  return file || env.NIZAM_GOOGLE_CLIENT_FILE || path.join(__dirname, 'google-client.json');
}

/* قراءة الملف: بترجّع { exists, keys, error } من غير ما ترمي استثناء */
function readFileKey(file) {
  if (!fs.existsSync(file)) return { exists: false, keys: null, error: null };
  try {
    const keys = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!keys.client_id || !keys.client_secret) {
      return { exists: true, keys: null, error: 'ملف google-client.json ناقص client_id أو client_secret.' };
    }
    if (!validateId(keys.client_id)) {
      return { exists: true, keys: null, error: 'client_id داخل google-client.json غير صالح.' };
    }
    if (!validateSecret(keys.client_secret)) {
      return { exists: true, keys: null, error: 'client_secret داخل google-client.json غير صالح.' };
    }
    return { exists: true, keys: keys, error: null };
  } catch (e) {
    return { exists: true, keys: null, error: 'ملف google-client.json غير صالح (JSON مكسور).' };
  }
}

function readEnvKey(env) {
  const clientId = clean(env.NIZAM_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(env.NIZAM_GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET);
  return (clientId || clientSecret) ? { client_id: clientId, client_secret: clientSecret } : null;
}

/* البناء: الملف أولًا، والبيئة بديل لو الملف مش موجود/غير صالح */
function resolveForBuild(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const file = keyFile(env, opts.file);
  const fromFile = readFileKey(file);
  const fromEnv = readEnvKey(env);
  const warnings = [];

  if (fromFile.keys) {
    if (fromEnv && (fromEnv.client_id !== fromFile.keys.client_id ||
      fromEnv.client_secret !== fromFile.keys.client_secret)) {
      warnings.push('فيه متغيّرات بيئة بمفاتيح Google مختلفة عن الملف — البناء هيستخدم الملف ' +
        path.basename(file) + '. لو عايز البيئة، شيل الملف.');
    }
    return {
      source: 'file',
      file: file,
      keys: fromFile.keys,
      warnings: warnings,
      needsRedirect: (fromFile.keys.redirect_uris || []).indexOf(DEFAULT_REDIRECT) < 0
    };
  }

  if (fromEnv) {
    if (!fromEnv.client_id || !fromEnv.client_secret) {
      throw new Error('لازم NIZAM_GOOGLE_CLIENT_ID و NIZAM_GOOGLE_CLIENT_SECRET مع بعض.');
    }
    if (!validateId(fromEnv.client_id)) {
      throw new Error('NIZAM_GOOGLE_CLIENT_ID غير صالح: لازم ينتهي بـ .apps.googleusercontent.com.');
    }
    if (!validateSecret(fromEnv.client_secret)) {
      throw new Error('NIZAM_GOOGLE_CLIENT_SECRET غير صالح: لازم يبدأ بـ GOCSPX-.');
    }
    if (fromFile.error) warnings.push('الملف الموجود اتجاهل لأنه غير صالح: ' + fromFile.error);
    return {
      source: 'env',
      file: file,
      keys: { client_id: fromEnv.client_id, client_secret: fromEnv.client_secret, redirect_uris: [DEFAULT_REDIRECT] },
      warnings: warnings,
      needsRedirect: true
    };
  }

  if (fromFile.error) throw new Error(fromFile.error);
  throw new Error('مفاتيح Google مش موجودة. اضبط NIZAM_GOOGLE_CLIENT_ID و NIZAM_GOOGLE_CLIENT_SECRET، أو ضع desktop/google-client.json قبل البناء.');
}

/* التشغيل: البيئة الصريحة تتغلّب على الملف (بدون تحقق — عشان رسائل
   الخطأ تطلع من التشخيص مش من هنا) */
function runtimeKeys(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const file = keyFile(env, opts.file);
  const fromFile = readFileKey(file);
  const fromEnv = readEnvKey(env);
  return {
    client_id: (fromEnv && fromEnv.client_id) || (fromFile.keys && fromFile.keys.client_id) || '',
    client_secret: (fromEnv && fromEnv.client_secret) || (fromFile.keys && fromFile.keys.client_secret) || '',
    file: file,
    source: fromEnv ? 'env' : (fromFile.keys ? 'file' : '')
  };
}

module.exports = {
  DEFAULT_REDIRECT: DEFAULT_REDIRECT,
  ID_RE: ID_RE,
  SECRET_RE: SECRET_RE,
  clean: clean,
  normalize: normalize,
  validateId: validateId,
  validateSecret: validateSecret,
  tail: tail,
  keyFile: keyFile,
  readFileKey: readFileKey,
  readEnvKey: readEnvKey,
  resolveForBuild: resolveForBuild,
  runtimeKeys: runtimeKeys
};
