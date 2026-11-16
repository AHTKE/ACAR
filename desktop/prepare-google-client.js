/* ============================================================
   desktop/prepare-google-client.js
   ------------------------------------------------------------
   بيتنفّذ قبل كل بناء للديسكتوب. بيضمن إن google-client.json
   موجود وجواه مفاتيح صالحة.

   ترتيب المصادر (مهم): الملف الأول، وبعده متغيّرات البيئة.
   عشان لو المستخدم حطّ عميل OAuth جديد في الملف، البناء ما ياخدش
   مفتاح قديم من متغيّر بيئة قديم بالغلط.

   بيقبل شكل Google الرسمي لما تنزّل JSON من الـConsole:
     { "installed": { "client_id": "...", "client_secret": "..." } }
   أو الشكل المسطّح:
     { "client_id": "...", "client_secret": "..." }
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

function validateId(id) {
  return ID_RE.test(clean(id));
}

function validateSecret(secret) {
  return SECRET_RE.test(clean(secret));
}

/* Google بينزّل الملف جوّه installed (Desktop) أو web (Web application) */
function normalize(data) {
  if (!data || typeof data !== 'object') return {};
  const inner = data.installed || data.web;
  const base = inner && typeof inner === 'object' ? Object.assign({}, data, inner) : data;
  return {
    client_id: clean(base.client_id),
    client_secret: clean(base.client_secret),
    redirect_uris: Array.isArray(base.redirect_uris) ? base.redirect_uris : null
  };
}

/* آخر جزء بيميّز المفتاح فعلًا (نهاية الـID ثابتة لكل المفاتيح) */
function tail(id) {
  const v = clean(id).split('.')[0];
  return v.length > 20 ? v.slice(0, 13) + '…' + v.slice(-6) : v;
}

function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const out = Object.assign({}, data, {
    client_id: clean(data.client_id),
    client_secret: clean(data.client_secret),
    redirect_uris: Array.isArray(data.redirect_uris) ? data.redirect_uris : [DEFAULT_REDIRECT]
  });
  if (out.redirect_uris.indexOf(DEFAULT_REDIRECT) < 0) out.redirect_uris.push(DEFAULT_REDIRECT);
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function prepare(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const file = opts.file || process.env.NIZAM_GOOGLE_CLIENT_FILE ||
    path.join(__dirname, 'google-client.json');
  const warn = [];

  const envId = clean(env.NIZAM_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID);
  const envSecret = clean(env.NIZAM_GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET);

  /* 1) الملف — هو المصدر الأساسي */
  let fileData = null;
  let fileError = null;
  if (fs.existsSync(file)) {
    try {
      const norm = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (!norm.client_id || !norm.client_secret) {
        fileError = 'ملف google-client.json ناقص client_id أو client_secret.';
      } else if (!validateId(norm.client_id)) {
        fileError = 'client_id داخل google-client.json غير صالح.';
      } else if (!validateSecret(norm.client_secret)) {
        fileError = 'client_secret داخل google-client.json غير صالح.';
      } else {
        fileData = norm;
      }
    } catch (e) {
      fileError = 'ملف google-client.json غير صالح (JSON مكسور).';
    }
  }

  if (fileData) {
    if ((envId || envSecret) && (envId !== fileData.client_id || envSecret !== fileData.client_secret)) {
      warn.push('فيه متغيّرات بيئة بمفاتيح Google مختلفة عن الملف — البناء هيستخدم الملف ' +
        path.basename(file) + '. لو عايز البيئة، شيل الملف.');
    }
    const needsRedirect = !fileData.redirect_uris ||
      fileData.redirect_uris.indexOf(DEFAULT_REDIRECT) < 0;
    if (needsRedirect) {
      writeFile(file, fileData);
      return { source: 'file-updated', file, clientIdTail: tail(fileData.client_id), warn };
    }
    return { source: 'file', file, clientIdTail: tail(fileData.client_id), warn };
  }

  /* 2) متغيّرات البيئة — لو مفيش ملف صالح */
  if (envId || envSecret) {
    if (!envId || !envSecret) {
      throw new Error('لازم NIZAM_GOOGLE_CLIENT_ID و NIZAM_GOOGLE_CLIENT_SECRET مع بعض.');
    }
    if (!validateId(envId)) {
      throw new Error('NIZAM_GOOGLE_CLIENT_ID غير صالح: لازم ينتهي بـ .apps.googleusercontent.com.');
    }
    if (!validateSecret(envSecret)) {
      throw new Error('NIZAM_GOOGLE_CLIENT_SECRET غير صالح: لازم يبدأ بـ GOCSPX-.');
    }
    writeFile(file, {
      client_id: envId,
      client_secret: envSecret,
      redirect_uris: [DEFAULT_REDIRECT]
    });
    if (fileError) warn.push('الملف الموجود اتجاهل لأنه غير صالح: ' + fileError);
    return { source: 'env', file, clientIdTail: tail(envId), warn };
  }

  if (fileError) throw new Error(fileError);
  throw new Error('مفاتيح Google مش موجودة. اضبط NIZAM_GOOGLE_CLIENT_ID و NIZAM_GOOGLE_CLIENT_SECRET، أو ضع desktop/google-client.json قبل البناء.');
}

module.exports = prepare;
module.exports.prepare = prepare;
module.exports.normalize = normalize;
module.exports.validateId = validateId;
module.exports.validateSecret = validateSecret;
module.exports.DEFAULT_REDIRECT = DEFAULT_REDIRECT;

if (require.main === module) {
  try {
    const out = prepare();
    console.log('✔ مفاتيح Google جاهزة للبناء (' + out.source + '): ' + out.file);
    console.log('  Client ID المستخدم: ' + out.clientIdTail);
    out.warn.forEach(function (w) { console.log('⚠ ' + w); });
  } catch (e) {
    console.error('✖ ' + ((e && e.message) || e));
    process.exit(1);
  }
}
