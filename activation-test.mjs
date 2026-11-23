/* ============================================================
   activation-test.mjs — اختبار خدمة تفعيل الأجهزة
   ------------------------------------------------------------
   بيشغّل worker.js نفسه بمخزن D1 وهمي في الذاكرة (بدون شبكة)،
   ويتأكد من: كلمة المرور، الكود المخصّص للجهاز، الانتهاء، الإلغاء،
   حد المحاولات، صلاحية الأدمن، وعدم تخزين أي سر كنص صريح.
   التشغيل: node activation-test.mjs
   ============================================================ */
import worker from './worker.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

/* ---------- mini D1 في الذاكرة ---------- */
function splitTop(s) {
  const out = [];
  let cur = '', depth = 0, q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") q = !q;
    if (!q && c === '(') depth++;
    if (!q && c === ')') depth--;
    if (!q && depth === 0 && c === ',') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

function literal(tok, args, i) {
  const t = tok.trim();
  if (t === '?') return { v: args[i], i: i + 1 };
  if (/^'.*'$/.test(t)) return { v: t.slice(1, -1), i };
  if (/^-?\d+$/.test(t)) return { v: Number(t), i };
  if (/^null$/i.test(t)) return { v: null, i };
  throw new Error('قيمة غير مدعومة في الاختبار: ' + t);
}

function createFakeDB() {
  const t = { activation_settings: [], activation_devices: [], activation_passes: [], activation_events: [], google_connections: [] };
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function run(q0, args) {
    const q = norm(q0).replace(/\s*;\s*$/, '');
    let m;

    if (/^CREATE TABLE/i.test(q)) return null;

    if ((m = q.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES \((.+)\)( ON CONFLICT\((\w+)\) DO UPDATE SET (.+))?$/i))) {
      const table = m[1];
      if (!t[table]) throw new Error('جدول غير معروف: ' + table);
      const cols = m[2].split(',').map((c) => c.trim());
      const vals = [];
      let ai = 0;
      splitTop(m[3]).forEach((tok) => { const r = literal(tok, args, ai); ai = r.i; vals.push(r.v); });
      const row = {};
      cols.forEach((c, k) => { row[c] = vals[k]; });
      if (table === 'activation_settings' || table === 'google_settings') {
        const key = cols[0];
        const ex = t[table].find((r) => r[key] === row[key]);
        if (ex) Object.assign(ex, row); else t[table].push(row);
        return null;
      }
      if (table === 'google_connections') { t[table].push(row); return null; }
      if (table === 'activation_events') { row.id = t[table].length + 1; t[table].push(row); return null; }
      if (m[4] && m[5]) {   /* ON CONFLICT DO UPDATE */
        const key = m[5];
        const ex = t[table].find((r) => r[key] === row[key]);
        if (ex) {
          splitTop(m[6]).forEach((setPart) => {
            const mm = setPart.match(/^(\w+)\s*=\s*(.+)$/);
            if (!mm) return;
            if (/^excluded\./i.test(mm[2])) ex[mm[1]] = row[mm[1]];
            else ex[mm[1]] = literal(mm[2], args, 0).v;
          });
          return null;
        }
      }
      t[table].push(row);
      return null;
    }

    if ((m = q.match(/^UPDATE (\w+) SET (.+?)(?: WHERE (\w+) = (.+))?$/i))) {
      const table = m[1];
      if (!t[table]) throw new Error('جدول غير معروف: ' + table);
      let where = null, wi = null;
      /* نفصل القيم: لازم نعرف عدد الـ? في SET قبل WHERE */
      const setParts = splitTop(m[2]);
      const sets = setParts.map((p) => {
        const mm = p.match(/^(\w+)\s*=\s*(.+)$/);
        if (!mm) throw new Error('SET غير مفهوم: ' + p);
        return { col: mm[1], tok: mm[2] };
      });
      const useArgs = [];
      sets.forEach((s) => { if (s.tok.trim() === '?') useArgs.push(s); });
      let ai = 0;
      const assigned = [];
      sets.forEach((s) => {
        if (s.tok.trim() === '?') { assigned.push({ col: s.col, v: args[ai++] }); }
        else assigned.push({ col: s.col, v: literal(s.tok, args, ai).v });
      });
      if (m[3]) {
        where = m[3];
        if (m[4].trim() === '?') { wi = args[ai++]; }
        else where = null;   /* قيمة ثابتة */
        if (wi === null && m[4].trim() !== '?') wi = undefined;
      }
      const rows = t[table].filter((r) => (where ? r[where] === wi : true));
      rows.forEach((r) => assigned.forEach((a) => { r[a.col] = a.v; }));
      return null;
    }

    if ((m = q.match(/^SELECT (.+?) FROM (\w+)(?: WHERE (\w+) = (.+?))?(?: ORDER BY (\w+) DESC)?(?: LIMIT (\d+))?$/i))) {
      const table = m[2];
      if (!t[table]) throw new Error('جدول غير معروف: ' + table);
      let rows = t[table].slice();
      if (m[3]) {
        let v;
        if (m[4].trim() === '?') v = args[0];
        else v = literal(m[4], args, 0).v;
        rows = rows.filter((r) => r[m[3]] === v);
      }
      if (m[5]) rows.sort((a, b) => String(b[m[5]] || '').localeCompare(String(a[m[5]] || '')));
      if (m[6]) rows = rows.slice(0, Number(m[6]));
      return rows;
    }

    if ((m = q.match(/^DELETE FROM (\w+)(?: WHERE (\w+) < (.+))?$/i))) {
      const table = m[1];
      if (!t[table]) throw new Error('جدول غير معروف: ' + table);
      if (!m[2]) { t[table] = []; return null; }
      const v = m[3].trim() === '?' ? args[0] : literal(m[3], args, 0).v;
      t[table] = t[table].filter((r) => !(r[m[2]] < v));
      return null;
    }

    throw new Error('أمر غير مدعوم في الاختبار: ' + q.slice(0, 120));
  }

  return {
    tables: t,
    async exec() { return { success: true }; },
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() { const rows = run(sql, args); return rows && rows.length ? rows[0] : null; },
        async all() { return { results: run(sql, args) || [], success: true }; },
        async run() { run(sql, args); return { success: true, meta: {} }; }
      };
      return stmt;
    }
  };
}

/* ---------- استدعاء الـ worker ---------- */
const env = { DB: createFakeDB() };

function callReq(path, { method = 'GET', body, cookie } = {}) {
  const headers = { origin: 'https://app.example.com' };
  if (cookie) headers.cookie = cookie;
  const init = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  }
  return worker.fetch(new Request('https://app.example.com' + path, init), env)
    .then(async (r) => ({ status: r.status, data: await r.json() }));
}

const DEV = 'dev-1111-2222-3333';
const ADMIN_COOKIE = 'gconn=tok-admin';

async function main() {
  console.log('\n— تفعيل الأجهزة —\n');

  /* الأدمن: سطر ربط Google بإيميل إدارة */
  env.DB.tables.google_connections.push({
    client_token: 'tok-admin', refresh_token: 'r', email: 'gstsyusudg@gmail.com'
  });

  /* 1) بدون سجل مركزي (كوكي Vercel) → متاحة:false وما بتقفلش */
  const cookieEnv = { DB: env.DB, COOKIE_STORE: true };
  const noStore = await worker.fetch(new Request('https://app.example.com/api/activation/status?device=' + DEV), cookieEnv)
    .then((r) => r.json());
  ok('Vercel (بدون سجل مركزي): available=false', noStore.available === false && noStore.enforced === false);
  ok('Vercel: مش بيدّعي تفعيل', noStore.activated === false);

  /* 2) الحالة الافتراضية: التفعيل متوقف */
  let s = await callReq('/api/activation/status?device=' + DEV);
  ok('الحالة الافتراضية: التطبيق مفتوح (enforced=false)', s.data.ok && s.data.enforced === false, JSON.stringify(s.data));
  ok('الجهاز غير مسجّل في البداية', s.data.device.status === 'none');

  /* 3) من غير كلمة مرور: مفيش تسجيل */
  let r = await callReq('/api/activation/request', { method: 'POST', body: { device: DEV, passcode: '123456', name: 'مكتب' } });
  ok('طلب بكلمة مرور غير موجودة → مرفوض', r.data.ok === false && r.data.code === 'BAD_PASSCODE');

  /* 4) الأدمن بس يقدر يصدر كلمة مرور */
  r = await callReq('/api/activation/passcode', { method: 'POST', body: {} });
  ok('غير الأدمن ممنوع من إصدار كلمة المرور', r.status === 401 && r.data.ok === false, JSON.stringify(r));

  r = await callReq('/api/activation/passcode', { method: 'POST', body: {}, cookie: ADMIN_COOKIE });
  const passcode = r.data.passcode;
  ok('الأدمن أصدر كلمة مرور تشغيلية 6 أرقام', r.data.ok && /^\d{6}$/.test(passcode), JSON.stringify(r.data));
  ok('صلاحية كلمة المرور 5 دقائق', r.data.expiresIn === 300);

  /* 5) كلمة مرور مخزّنة كـ hash فقط */
  const passRow = env.DB.tables.activation_passes[0];
  ok('كلمة المرور مش مخزّنة كنص صريح', passRow && String(passRow.pass_hash).length === 64 &&
    String(passRow.pass_hash).indexOf(passcode) === -1);

  /* 6) تسجيل الجهاز بكلمة المرور الصحيحة */
  r = await callReq('/api/activation/request', { method: 'POST', body: { device: DEV, passcode, name: 'مكتب المحاسبة' } });
  ok('تسجيل الجهاز بكلمة مرور سارية', r.data.ok === true && r.data.device.status === 'pending', JSON.stringify(r.data));
  ok('اسم الجهاز اتحفظ', r.data.device.name === 'مكتب المحاسبة');

  /* 7) التحقق قبل إصدار كود */
  r = await callReq('/api/activation/verify', { method: 'POST', body: { device: DEV, passcode, code: '12345678' } });
  ok('كود غير صادر → مرفوض', r.data.ok === false && r.data.code === 'NO_CODE');

  /* 8) إصدار كود مخصّص للجهاز */
  r = await callReq('/api/activation/issue', { method: 'POST', body: { device: DEV }, cookie: ADMIN_COOKIE });
  const code = r.data.code;
  ok('الأدمن أصدر كود تفعيل 8 أرقام', r.data.ok && /^\d{8}$/.test(code), JSON.stringify(r.data));
  const devRow = env.DB.tables.activation_devices.find((d) => d.device_id === DEV);
  ok('الكود مخزّن كـ hash مربوط بالجهاز', !!devRow.code_hash && devRow.code_hash.length === 64 &&
    String(devRow.code_hash).indexOf(code) === -1);

  /* 9) كود جهاز تاني مش بيفعّل هذا الجهاز */
  r = await callReq('/api/activation/verify', { method: 'POST', body: { device: DEV, passcode, code: '00000000' } });
  ok('كود غلط → مرفوض', r.data.ok === false && r.data.code === 'BAD_CODE', JSON.stringify(r.data));

  /* 10) التفعيل الصحيح */
  r = await callReq('/api/activation/verify', { method: 'POST', body: { device: DEV, passcode, code } });
  ok('تفعيل ناجح بكلمة المرور + الكود', r.data.ok === true && r.data.activated === true, JSON.stringify(r.data));
  s = await callReq('/api/activation/status?device=' + DEV);
  ok('الحالة بقت مفعّل', s.data.activated === true && s.data.device.status === 'active');

  /* 11) الكود بيتستهلك بعد النجاح */
  const used = env.DB.tables.activation_devices.find((d) => d.device_id === DEV);
  ok('كود التفعيل اتمسح بعد الاستخدام', used.code_hash === '');
  r = await callReq('/api/activation/verify', { method: 'POST', body: { device: DEV, passcode, code } });
  ok('الجهاز المفعّل يفضل مفعّل (بلا إعادة استهلاك)', r.data.ok === true && r.data.activated === true);

  /* 12) كلمة مرور منتهية */
  env.DB.tables.activation_passes.forEach((p) => { p.expires_at = Date.now() - 1000; });
  const DEV2 = 'dev-aaaa-bbbb-cccc';
  r = await callReq('/api/activation/request', { method: 'POST', body: { device: DEV2, passcode, name: 'لابتوب' } });
  ok('كلمة مرور منتهية → مرفوضة', r.data.ok === false && r.data.code === 'BAD_PASSCODE');

  /* 13) الأدمن: تفعيل الطلب + كلمة مرور جديدة + كود + رفض جهاز ملغي */
  r = await callReq('/api/activation/enforce', { method: 'POST', body: { enabled: true }, cookie: ADMIN_COOKIE });
  ok('تشغيل طلب تفعيل الأجهزة', r.data.ok === true && r.data.enforced === true);
  s = await callReq('/api/activation/status?device=' + DEV2);
  ok('الجهاز الجديد مقفول (enforced=true, activated=false)', s.data.enforced === true && s.data.activated === false);

  r = await callReq('/api/activation/passcode', { method: 'POST', body: {}, cookie: ADMIN_COOKIE });
  const pass2 = r.data.passcode;
  r = await callReq('/api/activation/request', { method: 'POST', body: { device: DEV2, passcode: pass2, name: 'لابتوب' } });
  ok('تسجيل جهاز تاني', r.data.ok === true);
  r = await callReq('/api/activation/issue', { method: 'POST', body: { device: DEV2 }, cookie: ADMIN_COOKIE });
  const code2 = r.data.code;
  r = await callReq('/api/activation/verify', { method: 'POST', body: { device: DEV2, passcode: pass2, code: code2 } });
  ok('تفعيل الجهاز التاني', r.data.ok === true && r.data.activated === true);

  /* 14) قائمة الأجهزة للأدمن */
  r = await callReq('/api/activation/devices', { cookie: ADMIN_COOKIE });
  ok('الأدمن يشوف كل الأجهزة', r.data.ok === true && r.data.devices.length === 2, JSON.stringify(r.data));
  ok('القائمة فيها الحالة ووقت التفعيل', r.data.devices.some((d) => d.status === 'active' && !!d.activatedAt));

  /* 15) الإلغاء يمنع الدخول على التطبيقين */
  r = await callReq('/api/activation/revoke', { method: 'POST', body: { device: DEV2 }, cookie: ADMIN_COOKIE });
  ok('إلغاء تفعيل جهاز', r.data.ok === true && r.data.device.status === 'revoked');
  s = await callReq('/api/activation/status?device=' + DEV2);
  ok('بعد الإلغاء: الحالة مش مفعّلة', s.data.activated === false && s.data.device.status === 'revoked');
  r = await callReq('/api/activation/verify', { method: 'POST', body: { device: DEV2, passcode: pass2, code: code2 } });
  ok('الجهاز الملغي ما يقدرش يتفعّل بكوده القديم', r.data.ok === false && r.data.code === 'REVOKED');

  /* 16) حد المحاولات */
  const DEV3 = 'dev-9999-8888-7777';
  r = await callReq('/api/activation/passcode', { method: 'POST', body: {}, cookie: ADMIN_COOKIE });
  const pass3 = r.data.passcode;
  await callReq('/api/activation/request', { method: 'POST', body: { device: DEV3, passcode: pass3, name: 'تابلت' } });
  await callReq('/api/activation/issue', { method: 'POST', body: { device: DEV3 }, cookie: ADMIN_COOKIE });
  let last = null;
  for (let i = 0; i < 9; i++) {
    last = await callReq('/api/activation/verify', { method: 'POST', body: { device: DEV3, passcode: pass3, code: '00000000' } });
  }
  ok('بعد 8 محاولات فاشلة → حد محاولات', last.data.ok === false && last.data.code === 'TOO_MANY', JSON.stringify(last.data));

  /* 17) جهاز غير مسجّل */
  r = await callReq('/api/activation/verify', { method: 'POST', body: { device: 'dev-0000-0000-0000', passcode: pass3, code: '12345678' } });
  ok('جهاز غير مسجّل → مرفوض', r.data.ok === false && r.data.code === 'UNKNOWN_DEVICE');

  /* 18) إيقاف الطلب يرجّع التطبيق يفتح عادي */
  r = await callReq('/api/activation/enforce', { method: 'POST', body: { enabled: false }, cookie: ADMIN_COOKIE });
  s = await callReq('/api/activation/status?device=dev-new-0000-0000');
  ok('إيقاف الطلب → enforced=false', r.data.ok === true && s.data.enforced === false);

  /* 19) مسار غير معروف */
  r = await callReq('/api/activation/hack', { method: 'POST', body: {} });
  ok('مسار تفعيل غير معروف → 404', r.status === 404 && r.data.ok === false);

  /* 20) السجل فيه أحداث بدون أي أسرار */
  const events = JSON.stringify(env.DB.tables.activation_events || []);
  ok('سجل التدقيق موجود', env.DB.tables.activation_events.length > 0);
  ok('السجل مفيهوش كلمة المرور أو الكود', events.indexOf(String(passcode)) === -1 &&
    events.indexOf(String(code)) === -1 && events.indexOf(String(pass2)) === -1);

  console.log('\n' + pass + ' نجاح، ' + fail + ' فشل\n');
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
