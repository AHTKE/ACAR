/* ============================================================
   activation.js — خدمة تفعيل الأجهزة المشتركة (/api/activation/*)
   ------------------------------------------------------------
   الفكرة: التطبيقان (ده وأي تطبيق تاني) بيقروا من نفس السجلات
   المركزية هنا — مفيش مولّد أكواد محلي في أي تطبيق.

   المسارات:
     GET  /api/activation/status    ?device=...      عام
     POST /api/activation/request   {device,name,passcode}  عام
     POST /api/activation/verify    {device,passcode,code}  عام
     POST /api/activation/passcode  (أدمن)  كلمة مرور تشغيلية 5 دقائق
     POST /api/activation/issue     (أدمن)  {device} → كود تفعيل للجهاز
     GET  /api/activation/devices   (أدمن)  كل الأجهزة وحالتها
     POST /api/activation/revoke    (أدمن)  {device}
     POST /api/activation/enforce   (أدمن)  {enabled}

   قواعد الأمان:
   • كلمة المرور المؤقتة وأكواد التفعيل تُخزَّن كـ SHA-256 فقط — لا نص صريح.
   • الكود مربوط بمعرّف الجهاز نفسه، ومحدود الصلاحية، ويُستهلك بعد النجاح.
   • التحقق كله على الخادم، وأي فشل اتصال أو خطأ لا يمنح تفعيلاً.
   • التخزين المركزي = D1. على Vercel (تخزين كوكي للجهاز نفسه) الخدمة
     بترجّع available:false بدل ما تدّعي تفعيلاً مشترك غير حقيقي.
   ============================================================ */

const PASS_TTL_MS = 5 * 60 * 1000;            /* كلمة المرور التشغيلية: 5 دقائق */
const CODE_TTL_MS = 24 * 60 * 60 * 1000;      /* كود التفعيل: 24 ساعة */
const MAX_FAILS = 8;                           /* حد المحاولات داخل النافذة */
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PASS_RE = /^\d{6}$/;
const CODE_RE = /^\d{8}$/;

const NO_STORE_MSG = 'خدمة التفعيل المشتركة تحتاج قاعدة بيانات مركزية (D1). ' +
  'النسخة الحالية بتخزّن الحالة في المتصفح نفسه، فمفيش سجل أجهزة مشترك — ' +
  'شغّل التطبيق على Cloudflare/Sites بقاعدة D1 عشان التفعيل يشتغل بين الأجهزة.';

const schemaDone = new WeakSet();

/* ---------- أدوات ---------- */

function str(v) { return String(v == null ? '' : v); }

async function sha256Hex(s) {
  const data = new TextEncoder().encode(str(s));
  const buf = await crypto.subtle.digest('SHA-256', data);
  const b = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < b.length; i++) out += ('0' + b[i].toString(16)).slice(-2);
  return out;
}

/* أرقام عشوائية آمنة (بدون Math.random) */
function randomDigits(n) {
  let out = '';
  while (out.length < n) {
    const buf = new Uint8Array(n * 2);
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < n; i++) {
      if (buf[i] < 250) out += String(buf[i] % 10);   /* 250 = 25×10 → بدون انحياز */
    }
  }
  return out;
}

function iso(ms) { return new Date(ms).toISOString(); }

function passHash(p) { return sha256Hex('pass:' + p); }
function codeHash(device, c) { return sha256Hex('dev:' + device + ':' + c); }

function storeReady(env) {
  return !!(env && env.DB) && !env.COOKIE_STORE;
}

async function ensureSchema(db) {
  if (schemaDone.has(db)) return;
  await db.exec(
    'CREATE TABLE IF NOT EXISTS activation_settings (' +
    'k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT \'\')'
  );
  await db.exec(
    'CREATE TABLE IF NOT EXISTS activation_devices (' +
    'device_id TEXT PRIMARY KEY, ' +
    "name TEXT DEFAULT '', " +
    "status TEXT DEFAULT 'pending', " +
    "code_hash TEXT DEFAULT '', " +
    'code_exp INTEGER DEFAULT 0, ' +
    "activated_at TEXT DEFAULT '', " +
    "revoked_at TEXT DEFAULT '', " +
    'fails INTEGER DEFAULT 0, ' +
    'first_fail INTEGER DEFAULT 0, ' +
    "last_seen TEXT DEFAULT '', " +
    "created_at TEXT DEFAULT ''" +
    ')'
  );
  await db.exec(
    'CREATE TABLE IF NOT EXISTS activation_passes (' +
    'pass_hash TEXT PRIMARY KEY, ' +
    'expires_at INTEGER NOT NULL, ' +
    'created_at INTEGER NOT NULL)'
  );
  await db.exec(
    'CREATE TABLE IF NOT EXISTS activation_events (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    "device_id TEXT DEFAULT '', " +
    "kind TEXT DEFAULT '', " +
    "note TEXT DEFAULT '', " +
    "at TEXT DEFAULT ''" +
    ')'
  );
  schemaDone.add(db);
}

async function settingGet(db, k) {
  const r = await db.prepare('SELECT v FROM activation_settings WHERE k = ?').bind(k).first();
  return r ? r.v : null;
}

async function settingSet(db, k, v) {
  await db.prepare('INSERT INTO activation_settings (k, v) VALUES (?, ?) ' +
    'ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, str(v)).run();
}

function deviceGet(db, id) {
  return db.prepare('SELECT * FROM activation_devices WHERE device_id = ?').bind(id).first();
}

async function eventLog(db, deviceId, kind, note) {
  try {
    await db.prepare('INSERT INTO activation_events (device_id, kind, note, at) VALUES (?, ?, ?, ?)')
      .bind(str(deviceId), str(kind), str(note).slice(0, 200), iso(Date.now())).run();
  } catch (e) { /* السجل تكميلي — ما يوقفش التفعيل */ }
}

function out(dev) {
  return {
    status: dev ? dev.status : 'none',
    name: dev ? dev.name : '',
    activatedAt: dev ? (dev.activated_at || '') : '',
    revokedAt: dev ? (dev.revoked_at || '') : ''
  };
}

async function bodyOf(request) {
  try { return await request.json(); } catch (e) { return null; }
}

function bad(json, code, message, status) {
  return json({ ok: false, code: code, error: message }, status || 400);
}

async function adminOnly(request, env, deps, json) {
  try {
    const conn = await deps.requireAdmin(request, env);
    return { conn: conn };
  } catch (e) {
    return { error: json({ ok: false, code: 'NOT_ADMIN', error: e.message }, e.status || 401) };
  }
}

/* ---------- المعالج ---------- */

export async function handleActivation(request, env, pathname, deps) {
  const json = deps.json;
  const now = Date.now();
  const method = str(request.method || 'GET').toUpperCase();
  const isAdminRoute = pathname === '/api/activation/passcode' ||
    pathname === '/api/activation/issue' ||
    pathname === '/api/activation/devices' ||
    pathname === '/api/activation/revoke' ||
    pathname === '/api/activation/enforce';

  /* بدون سجل مركزي: نعلنها بوضوح بدل تفعيل وهمي */
  if (!storeReady(env)) {
    if (pathname === '/api/activation/status' && method === 'GET') {
      return json({
        ok: true, available: false, enforced: false, activated: false,
        reason: 'NO_STORE', message: NO_STORE_MSG, device: out(null)
      });
    }
    return json({ ok: false, available: false, code: 'NO_STORE', error: NO_STORE_MSG },
      isAdminRoute ? 503 : 200);
  }

  let db;
  try {
    db = env.DB;
    await ensureSchema(db);
  } catch (e) {
    return json({ ok: false, code: 'DB_ERROR', error: 'تعذّر تجهيز سجل الأجهزة: ' + (e.message || '') }, 503);
  }

  /* ---- حالة الخدمة (عام) ---- */
  if (pathname === '/api/activation/status') {
    if (method !== 'GET') return bad(json, 'METHOD', 'الطريقة غير مسموحة', 405);
    let enforced = false;
    try { enforced = (await settingGet(db, 'enforce')) === '1'; } catch (e) { enforced = false; }
    const id = str(new URL(request.url).searchParams.get('device')).trim();
    let dev = null;
    if (DEVICE_RE.test(id)) {
      dev = await deviceGet(db, id);
      if (dev) {
        try { await db.prepare('UPDATE activation_devices SET last_seen = ? WHERE device_id = ?').bind(iso(now), id).run(); }
        catch (e) { /* تحديث آخر ظهور تكميلي */ }
      }
    }
    return json({
      ok: true, available: true, enforced: enforced,
      activated: !!(dev && dev.status === 'active'),
      device: out(dev)
    });
  }

  /* ---- تسجيل الجهاز بكلمة المرور المؤقتة (عام) ---- */
  if (pathname === '/api/activation/request') {
    if (method !== 'POST') return bad(json, 'METHOD', 'الطريقة غير مسموحة', 405);
    const b = await bodyOf(request);
    const id = str(b && b.device).trim();
    const pass = str(b && b.passcode).trim();
    const name = str(b && b.name).trim().slice(0, 60);
    if (!DEVICE_RE.test(id)) return bad(json, 'BAD_DEVICE', 'معرّف الجهاز غير صالح');
    if (!PASS_RE.test(pass)) return bad(json, 'BAD_PASSCODE', 'كلمة المرور المؤقتة 6 أرقام');

    await db.prepare('DELETE FROM activation_passes WHERE expires_at < ?').bind(now).run();
    const row = await db.prepare('SELECT * FROM activation_passes WHERE pass_hash = ?')
      .bind(await passHash(pass)).first();
    if (!row || Number(row.expires_at) <= now) {
      return bad(json, 'BAD_PASSCODE', 'كلمة المرور المؤقتة غير صحيحة أو انتهت صلاحيتها — اطلب واحدة جديدة', 403);
    }

    let dev = await deviceGet(db, id);
    if (dev && dev.status === 'revoked') {
      return bad(json, 'REVOKED', 'تم إلغاء تفعيل هذا الجهاز — كلّم المسؤول عشان يعيد تفعيله', 403);
    }
    if (!dev) {
      await db.prepare('INSERT INTO activation_devices (device_id, name, status, created_at, last_seen) ' +
        "VALUES (?, ?, 'pending', ?, ?)")
        .bind(id, name, iso(now), iso(now)).run();
      await eventLog(db, id, 'requested', name || 'جهاز جديد');
    } else {
      await db.prepare('UPDATE activation_devices SET name = ?, last_seen = ?, fails = 0, first_fail = 0 ' +
        'WHERE device_id = ?').bind(name || dev.name, iso(now), id).run();
      if (dev.status !== 'active') await eventLog(db, id, 'requested', 'إعادة طلب');
    }
    const fresh = await deviceGet(db, id);
    return json({ ok: true, passcodeValid: true, device: out(fresh) });
  }

  /* ---- التحقق النهائي (عام) ---- */
  if (pathname === '/api/activation/verify') {
    if (method !== 'POST') return bad(json, 'METHOD', 'الطريقة غير مسموحة', 405);
    const b = await bodyOf(request);
    const id = str(b && b.device).trim();
    const pass = str(b && b.passcode).trim();
    const code = str(b && b.code).trim();
    if (!DEVICE_RE.test(id)) return bad(json, 'BAD_DEVICE', 'معرّف الجهاز غير صالح');
    if (!PASS_RE.test(pass)) return bad(json, 'BAD_PASSCODE', 'كلمة المرور المؤقتة 6 أرقام');
    if (!CODE_RE.test(code)) return bad(json, 'BAD_CODE', 'كود التفعيل 8 أرقام');

    const dev = await deviceGet(db, id);
    if (!dev) return bad(json, 'UNKNOWN_DEVICE', 'الجهاز غير مسجّل — ابدأ بكلمة المرور المؤقتة من المسؤول', 404);
    if (dev.status === 'revoked') {
      return bad(json, 'REVOKED', 'تم إلغاء تفعيل هذا الجهاز — كلّم المسؤول عشان يعيد تفعيله', 403);
    }
    if (dev.status === 'active') {
      return json({ ok: true, activated: true, device: out(dev) });   /* مفعّل بالفعل */
    }

    const fails = Number(dev.fails || 0);
    const firstFail = Number(dev.first_fail || 0);
    if (fails >= MAX_FAILS && now - firstFail < FAIL_WINDOW_MS) {
      const mins = Math.max(1, Math.ceil((FAIL_WINDOW_MS - (now - firstFail)) / 60000));
      return bad(json, 'TOO_MANY', 'محاولات كثيرة — حاول بعد ' + mins + ' دقيقة', 429);
    }

    async function fail(reason, msg, status) {
      const nextFails = (now - firstFail < FAIL_WINDOW_MS) ? fails + 1 : 1;
      try {
        await db.prepare('UPDATE activation_devices SET fails = ?, first_fail = ? WHERE device_id = ?')
          .bind(nextFails, (now - firstFail < FAIL_WINDOW_MS) ? firstFail : now, id).run();
      } catch (e) { /* العدّ تكميلي */ }
      await eventLog(db, id, 'failed', reason);
      return bad(json, reason, msg, status || 403);
    }

    const prow = await db.prepare('SELECT * FROM activation_passes WHERE pass_hash = ?')
      .bind(await passHash(pass)).first();
    if (!prow) return fail('BAD_PASSCODE', 'كلمة المرور المؤقتة غير صحيحة');
    if (Number(prow.expires_at) <= now) {
      return fail('PASS_EXPIRED', 'انتهت صلاحية كلمة المرور المؤقتة — اطلب واحدة جديدة من المسؤول');
    }

    if (!dev.code_hash) return fail('NO_CODE', 'مفيش كود تفعيل صادر لهذا الجهاز — المسؤول يصدره من الإعدادات');
    if (Number(dev.code_exp || 0) <= now) {
      return fail('CODE_EXPIRED', 'انتهت صلاحية كود التفعيل — اطلب كوداً جديداً');
    }
    if (str(dev.code_hash) !== await codeHash(id, code)) {
      return fail('BAD_CODE', 'كود التفعيل غير صحيح أو ليس مخصصاً لهذا الجهاز');
    }

    const at = iso(now);
    await db.prepare('UPDATE activation_devices SET status = ?, code_hash = ?, code_exp = ?, ' +
      'activated_at = ?, revoked_at = ?, fails = 0, first_fail = 0, last_seen = ? WHERE device_id = ?')
      .bind('active', '', 0, at, '', at, id).run();
    await eventLog(db, id, 'activated', 'تم التفعيل');
    const done = await deviceGet(db, id);
    return json({ ok: true, activated: true, device: out(done) });
  }

  /* ===== من هنا: مسارات الأدمن ===== */

  if (pathname === '/api/activation/devices' && method === 'GET') {
    const a = await adminOnly(request, env, deps, json);
    if (a.error) return a.error;
    let enforced = false;
    try { enforced = (await settingGet(db, 'enforce')) === '1'; } catch (e) { enforced = false; }
    const rows = await db.prepare('SELECT * FROM activation_devices ORDER BY last_seen DESC LIMIT 200').all();
    const list = ((rows && rows.results) || []).map(function (d) {
      return {
        device: d.device_id, name: d.name || '',
        status: d.status || 'pending',
        activatedAt: d.activated_at || '',
        revokedAt: d.revoked_at || '',
        lastSeen: d.last_seen || '',
        codePending: !!(d.code_hash && Number(d.code_exp || 0) > now)
      };
    });
    return json({ ok: true, enforced: enforced, devices: list, count: list.length });
  }

  if (pathname === '/api/activation/enforce' && method === 'POST') {
    const a = await adminOnly(request, env, deps, json);
    if (a.error) return a.error;
    const b = await bodyOf(request);
    const enabled = !!(b && b.enabled);
    await settingSet(db, 'enforce', enabled ? '1' : '0');
    const saved = (await settingGet(db, 'enforce')) === '1';
    if (saved !== enabled) return bad(json, 'SAVE_FAILED', 'تعذّر حفظ إعداد التفعيل', 500);
    await eventLog(db, 'admin', enabled ? 'enforce_on' : 'enforce_off', str(a.conn && a.conn.email));
    return json({ ok: true, enforced: saved });
  }

  if (pathname === '/api/activation/passcode' && method === 'POST') {
    const a = await adminOnly(request, env, deps, json);
    if (a.error) return a.error;
    const pass = randomDigits(6);
    await db.prepare('DELETE FROM activation_passes WHERE expires_at < ?').bind(now).run();
    await db.prepare('INSERT INTO activation_passes (pass_hash, expires_at, created_at) VALUES (?, ?, ?)')
      .bind(await passHash(pass), now + PASS_TTL_MS, now).run();
    await eventLog(db, 'admin', 'passcode_issued', str(a.conn && a.conn.email));
    return json({
      ok: true, passcode: pass, expiresIn: Math.floor(PASS_TTL_MS / 1000),
      expiresAt: iso(now + PASS_TTL_MS)
    });
  }

  if (pathname === '/api/activation/issue' && method === 'POST') {
    const a = await adminOnly(request, env, deps, json);
    if (a.error) return a.error;
    const b = await bodyOf(request);
    const id = str(b && b.device).trim();
    if (!DEVICE_RE.test(id)) return bad(json, 'BAD_DEVICE', 'معرّف الجهاز غير صالح');
    const dev = await deviceGet(db, id);
    if (!dev) return bad(json, 'UNKNOWN_DEVICE', 'الجهاز غير مسجّل — لازم يطلب التفعيل الأول بكلمة المرور المؤقتة', 404);
    const code = randomDigits(8);
    const exp = now + CODE_TTL_MS;
    await db.prepare('UPDATE activation_devices SET status = ?, code_hash = ?, code_exp = ?, ' +
      "revoked_at = '', last_seen = ? WHERE device_id = ?")
      .bind('pending', await codeHash(id, code), exp, iso(now), id).run();
    await eventLog(db, id, 'code_issued', str(a.conn && a.conn.email));
    return json({ ok: true, device: id, code: code, expiresAt: iso(exp), expiresIn: Math.floor(CODE_TTL_MS / 1000) });
  }

  if (pathname === '/api/activation/revoke' && method === 'POST') {
    const a = await adminOnly(request, env, deps, json);
    if (a.error) return a.error;
    const b = await bodyOf(request);
    const id = str(b && b.device).trim();
    if (!DEVICE_RE.test(id)) return bad(json, 'BAD_DEVICE', 'معرّف الجهاز غير صالح');
    const dev = await deviceGet(db, id);
    if (!dev) return bad(json, 'UNKNOWN_DEVICE', 'الجهاز غير مسجّل', 404);
    const at = iso(now);
    await db.prepare('UPDATE activation_devices SET status = ?, code_hash = ?, code_exp = ?, ' +
      'revoked_at = ?, last_seen = ? WHERE device_id = ?')
      .bind('revoked', '', 0, at, at, id).run();
    await eventLog(db, id, 'revoked', str(a.conn && a.conn.email));
    const done = await deviceGet(db, id);
    return json({ ok: true, device: out(done) });
  }

  return json({ ok: false, code: 'NOT_FOUND', error: 'مسار تفعيل غير معروف' }, 404);
}
