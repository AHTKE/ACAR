/* اختبار تجهيز مفاتيح Google قبل بناء الديسكتوب. */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const prepare = require('./desktop/prepare-google-client');
const { validateId, validateSecret, DEFAULT_REDIRECT } = prepare;

const ID = '123456789012-testclientidforchecks.apps.googleusercontent.com';
const SECRET = 'GOCSPX-testsecret0123456789abcd';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nizam-gbuild-'));

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); }
};
const throws = (fn) => {
  try { fn(); return ''; } catch (e) { return String((e && e.message) || e); }
};

console.log('\n[1] فحص الصيغ');
ok('Client ID صالح', validateId(ID));
ok('Client ID غلط مرفوض', !validateId('not-a-client-id'));
ok('Client Secret صالح', validateSecret(SECRET));
ok('Client Secret غلط مرفوض', !validateSecret('secret'));

console.log('\n[2] التوليد من متغيرات البيئة');
const envFile = path.join(tmp, 'env', 'google-client.json');
const envOut = prepare({ file: envFile, env: { NIZAM_GOOGLE_CLIENT_ID: ID, NIZAM_GOOGLE_CLIENT_SECRET: SECRET } });
const envJson = JSON.parse(fs.readFileSync(envFile, 'utf8'));
ok('اتكتب من env', envOut.source === 'env', envOut.source);
ok('client_id صح', envJson.client_id === ID);
ok('client_secret صح', envJson.client_secret === SECRET);
ok('redirect محلي', Array.isArray(envJson.redirect_uris) && envJson.redirect_uris.indexOf(DEFAULT_REDIRECT) >= 0);
ok('المسار 47820', DEFAULT_REDIRECT === 'http://127.0.0.1:47820/api/google/callback');

console.log('\n[3] استخدام ملف موجود وإضافة redirect ناقص');
const fileFile = path.join(tmp, 'existing', 'google-client.json');
fs.mkdirSync(path.dirname(fileFile), { recursive: true });
fs.writeFileSync(fileFile, JSON.stringify({ client_id: ID, client_secret: SECRET }));
const fileOut = prepare({ file: fileFile, env: {} });
const fileJson = JSON.parse(fs.readFileSync(fileFile, 'utf8'));
ok('اتقرأ من الملف', fileOut.source === 'file-updated', fileOut.source);
ok('redirect اتضاف', fileJson.redirect_uris.indexOf(DEFAULT_REDIRECT) >= 0);
ok('السر ما اتغيّرش', fileJson.client_secret === SECRET);

console.log('\n[4] الفشل الواضح');
ok('ملف ناقص بيفشل', /مفاتيح Google مش موجودة/.test(throws(() => prepare({ file: path.join(tmp, 'none.json'), env: {} }))));
ok('مفتاح واحد بيفشل', /مع بعض/.test(throws(() => prepare({ file: path.join(tmp, 'one.json'), env: { NIZAM_GOOGLE_CLIENT_ID: ID } }))));
ok('ID غلط بيفشل', /Client_ID|CLIENT_ID|client_id/i.test(throws(() => prepare({ file: path.join(tmp, 'bad.json'), env: { NIZAM_GOOGLE_CLIENT_ID: 'bad', NIZAM_GOOGLE_CLIENT_SECRET: SECRET } }))));
ok('Secret غلط بيفشل', /secret|SECRET/i.test(throws(() => prepare({ file: path.join(tmp, 'bad2.json'), env: { NIZAM_GOOGLE_CLIENT_ID: ID, NIZAM_GOOGLE_CLIENT_SECRET: 'bad' } }))));

console.log('\n[5] ربط البناء');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'desktop', 'package.json'), 'utf8'));
ok('الملف مضمّن في files', (pkg.build.files || []).indexOf('google-client.json') >= 0);
for (const s of ['dist:win64', 'dist:win32', 'dist:win-portable64', 'dist:win-portable32', 'dist:win-all', 'dist:linux', 'dist:mac']) {
  ok('سكربت ' + s + ' بيجهّز المفاتيح', String(pkg.scripts[s] || '').indexOf('prepare-google-client.js') >= 0, pkg.scripts[s]);
}
ok('مفيش publish سبب فشل البناء', !pkg.build.publish);

console.log('\n==================================================');
console.log('  PASS: ' + pass + '   FAIL: ' + fail);
console.log('==================================================');
process.exit(fail ? 1 : 0);
