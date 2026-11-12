/* ============================================================
   desktop/prepare-google-client.js
   ------------------------------------------------------------
   بيتنفّذ قبل كل بناء للديسكتوب. بيضمن إن google-client.json
   موجود وجواه مفاتيح صالحة، سواء جاءت من:
     • NIZAM_GOOGLE_CLIENT_ID / NIZAM_GOOGLE_CLIENT_SECRET
     • GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  (GitHub/Vercel)
     • ملف google-client.json موجود محلياً
   ولو مفيش مفاتيح صالحة بيفشل البناء برسالة واضحة — عشان ما
   نطلعش نسخة بتفتح الموقع بدل ما تربط Google محلياً.
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
    .replace(/^[\s"'\u0060]+/, '')
    .replace(/[\s"'\u0060]+$/, '')
    .replace(/[\r\n\t]/g, '')
    .trim();
}

function validateId(id) {
  return ID_RE.test(clean(id));
}

function validateSecret(secret) {
  return SECRET_RE.test(clean(secret));
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

  let id = clean(env.NIZAM_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID);
  let secret = clean(env.NIZAM_GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET);

  if (id || secret) {
    if (!id || !secret) {
      throw new Error('لازم NIZAM_GOOGLE_CLIENT_ID و NIZAM_GOOGLE_CLIENT_SECRET مع بعض.');
    }
    if (!validateId(id)) {
      throw new Error('NIZAM_GOOGLE_CLIENT_ID غير صالح: لازم ينتهي بـ .apps.googleusercontent.com.');
    }
    if (!validateSecret(secret)) {
      throw new Error('NIZAM_GOOGLE_CLIENT_SECRET غير صالح: لازم يبدأ بـ GOCSPX-.');
    }
    writeFile(file, {
      client_id: id,
      client_secret: secret,
      redirect_uris: [DEFAULT_REDIRECT]
    });
    return { source: 'env', file: file };
  }

  if (!fs.existsSync(file)) {
    throw new Error('مفاتيح Google مش موجودة. اضبط NIZAM_GOOGLE_CLIENT_ID و NIZAM_GOOGLE_CLIENT_SECRET، أو ضع desktop/google-client.json قبل البناء.');
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error('ملف google-client.json غير صالح (JSON مكسور).');
  }
  id = clean(data.client_id);
  secret = clean(data.client_secret);
  if (!id || !secret) {
    throw new Error('ملف google-client.json ناقص client_id أو client_secret.');
  }
  if (!validateId(id)) {
    throw new Error('client_id داخل google-client.json غير صالح.');
  }
  if (!validateSecret(secret)) {
    throw new Error('client_secret داخل google-client.json غير صالح.');
  }
  if (!Array.isArray(data.redirect_uris) || data.redirect_uris.indexOf(DEFAULT_REDIRECT) < 0) {
    writeFile(file, data);
    return { source: 'file-updated', file: file };
  }
  return { source: 'file', file: file };
}

module.exports = prepare;
module.exports.prepare = prepare;
module.exports.validateId = validateId;
module.exports.validateSecret = validateSecret;
module.exports.DEFAULT_REDIRECT = DEFAULT_REDIRECT;

if (require.main === module) {
  try {
    const out = prepare();
    console.log('✔ مفاتيح Google جاهزة للبناء (' + out.source + '): ' + out.file);
  } catch (e) {
    console.error('✖ ' + ((e && e.message) || e));
    process.exit(1);
  }
}
