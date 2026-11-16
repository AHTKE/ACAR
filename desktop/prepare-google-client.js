/* ============================================================
   desktop/prepare-google-client.js
   ------------------------------------------------------------
   بيتنفّذ قبل كل بناء للديسكتوب. القراءة والأولوية (الملف أولًا
   ثم متغيّرات البيئة) والتحقق كلهم في google-keys.js — الملف ده
   بس بيكتب الملف المضمّن في النسخة ويطبع بصمة المفتاح.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const keys = require('./google-keys');

const DEFAULT_REDIRECT = keys.DEFAULT_REDIRECT;

function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const out = Object.assign({}, data, {
    client_id: keys.clean(data.client_id),
    client_secret: keys.clean(data.client_secret),
    redirect_uris: Array.isArray(data.redirect_uris) ? data.redirect_uris : [DEFAULT_REDIRECT]
  });
  if (out.redirect_uris.indexOf(DEFAULT_REDIRECT) < 0) out.redirect_uris.push(DEFAULT_REDIRECT);
  delete out.type;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function prepare(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const resolved = keys.resolveForBuild({ env: env, file: opts.file });

  let source = 'file';
  if (resolved.source === 'env') source = 'env';
  else if (resolved.needsRedirect) source = 'file-updated';

  if (resolved.source === 'env' || resolved.needsRedirect) {
    writeFile(resolved.file, resolved.keys);
  }

  return {
    source: source,
    file: resolved.file,
    clientIdTail: keys.tail(resolved.keys.client_id),
    warn: resolved.warnings
  };
}

module.exports = prepare;
module.exports.prepare = prepare;
module.exports.normalize = keys.normalize;
module.exports.validateId = keys.validateId;
module.exports.validateSecret = keys.validateSecret;
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
