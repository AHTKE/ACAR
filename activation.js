/* ============================================================
   activation.js — خدمة تفعيل الأجهزة (/api/activation/*)
   ------------------------------------------------------------
   الفكرة (زي ما المستخدم وصفها بالظبط):
     1) أول ما التطبيق يفتح بيظهر قفل «تفعيل الجهاز» — قبل أي حاجة،
        وقبل ربط حساب Google.
     2) المستخدم بيكتب كلمة مرور تشغيلية بتتغيّر كل 5 دقائق،
        المالك بيولّدها من أداة التوليد اللي معاه (activation-generator.html).
     3) بعد كلمة المرور، الجهاز بيعرض كود من 6 أرقام خاص بيه هو بس.
     4) المالك بيدخّل الكود ده في أداة التوليد، فبتطلّع كود تفعيل
        من 6 أرقام صالح 3 دقائق ومربوط بكود الجهاز ده — مش أي جهاز تاني.
     5) المستخدم بيكتب كود التفعيل → الخادم بيتحقق → التطبيق بيفتح
        ويتفضل مفتوح (الجهاز اتسجّل مرة واحدة).

   الأمان:
     • كل التحقق على الخادم بـ HMAC-SHA256 بمفتاح ACTIVATION_SECRET.
     • مفيش أي سر أو مفتاح في المتصفح — الجهاز بياخد «توكن تفعيل»
       ناتج HMAC فقط، وده إشارة واجهة بيتم التحقق منها على الخادم.
     • محدودية المحاولات، وسجل تدقيق (لو D1 موجود) بدون كلمات مرور أو أكواد.
     • مفيش D1؟ التفعيل بيشتغل عادي (stateless). فيه D1؟ بنسجّل
       الأجهزة ونقدر نلغي تفعيل أي جهاز من مسار الأدمن.

   متغيّرات البيئة:
     ACTIVATION_SECRET   سر التوليد (16 حرف على الأقل) — نفس القيمة
                         اللي في أداة التوليد. من غيره الخدمة «غير متاحة»
                         والتطبيق بيفتح عادي بدون قفل (ما نكسرش حاجة).
     ACTIVATION_ENFORCE  اختياري: حطّ 0 عشان توقف القفل مؤقتًا.
   ============================================================ */

const PASS_WINDOW_MS = 5 * 60 * 1000;    /* كلمة المرور التشغيلية: 5 دقائق */
const CODE_WINDOW_MS = 3 * 60 * 1000;    /* كود التفعيل: 3 دقائق */
const MAX_FAILS = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const DEVICE_RE = /^\d{6}$/;             /* كود الجهاز */
const PASS_RE = /^\d{6}$/;
const CODE_RE = /^\d{6}$/;

const NO_SECRET_MSG = 'خدمة تفعيل الأجهزة مش متفعّلة على الخادم: ' +
  'محتاج تضيف المتغيّر ACTIVATION_SECRET (نفس السر اللي في أداة التوليد). ' +
  'لحد ما تضيفه، التطبيق بيفتح عادي بدون قفل.';

const schemaDone = new WeakSet();
const failMemo = new Map();   /* حد المحاولات في الذاكرة (لكل نسخة تشغيل) */

/* ---------- أدوات ---------- */

function str(v) { return String(v == null ? '' : v); }

function enc(s) { return new TextEncoder().encode(str(s)); }

function hex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
  return out;
}

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacBytes(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc(msg));
  return new Uint8Array(sig);
}

/* 6 أرقام من أول 4 بايت — بدون انحياز ملفت */
function sixDigits(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  return String(v % 1000000).padStart(6, '0');
}

function safeEqual(a, b) {
  const x = str(a), y = str(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

async function secretOf(env) {
  const s = str(env && env.ACTIVATION_SECRET).trim();
  return s.length >= 16 ? s : '';
}

async function passcodeFor(secret, win) {
  return sixDigits(await hmacBytes(secret, 'pass:' + win));
}

async function actCodeFor(secret, device, win) {
  return sixDigits(await hmacBytes(secret, 'act:' + device + ':' + win));
}

/* توكن التفعيل: إثبات موقّع بالسر إن الجهاز ده اتفعّل */
async function tokenFor(secret, device) {
  return b64url(await hmacBytes(secret, 'ok:' + device));
}

function iso(ms) { return new Date(ms).toISOString(); }

function out(dev) {
  return {
    code: dev ? dev.device_id : '',
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

/* ---------- حد المحاولات ---------- */

function tooMany(device) {
  const rec = failMemo.get(device);
  if (!rec) return 0;
  if (Date.now() - rec.first > FAIL_WINDOW_MS) { failMemo.delete(device); return 0; }
  if (rec.fails < MAX_FAILS) return 0;
  return Math.max(1, Math.ceil((FAIL_WINDOW_MS - (Date.now() - rec.first)) / 60000));
}

function noteFail(device) {
  const now = Date.now();
  const rec = failMemo.get(device);
  if (!rec || now - rec.first > FAIL_WINDOW_MS) failMemo.set(device, { fails: 1, first: now });
  else rec.fails++;
  if (failMemo.size > 5000) failMemo.clear();
}

/* ---------- D1 (اختياري) ---------- */

function dbOf(env) {
  return (env && env.DB && !env.COOKIE_STORE) ? env.DB : null;
}

async function ensureSchema(db) {
  if (schemaDone.has(db)) return;
  await db.exec(
    'CREATE TABLE IF NOT EXISTS activation_devices (' +
    'device_id TEXT PRIMARY KEY, ' +
    "name TEXT DEFAULT '', " +
    "status TEXT DEFAULT 'pending', " +
    "activated_at TEXT DEFAULT '', " +
    "revoked_at TEXT DEFAULT '', " +
    "last_seen TEXT DEFAULT '', " +
    "created_at TEXT DEFAULT ''" +
    ')'
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

function deviceGet(db, id) {
  return db.prepare('SELECT * FROM activation_devices WHERE device_id = ?').bind(id).first();
}

async function eventLog(db, deviceId, kind, note) {
  try {
    await db.prepare('INSERT INTO activation_events (device_id, kind, note, at) VALUES (?, ?, ?, ?)')
      .bind(str(deviceId), str(kind), str(note).slice(0, 200), iso(Date.now())).run();
  } catch (e) { /* السجل تكميلي — ما يوقفش التفعيل */ }
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
  const secret = await secretOf(env);
  const enforceOff = str(env && env.ACTIVATION_ENFORCE) === '0';
  const isAdminRoute = pathname === '/api/activation/devices' || pathname === '/api/activation/revoke';

  /* بدون سر: مفيش خدمة، ومفيش قفل — ما نكسرش التطبيق */
  if (!secret) {
    if (pathname === '/api/activation/status') {
      return json({
        ok: true, available: false, enforced: false, activated: false,
        reason: 'NO_SECRET', message: NO_SECRET_MSG, device: out(null)
      });
    }
    return json({ ok: false, available: false, code: 'NO_SECRET', error: NO_SECRET_MSG },
      isAdminRoute ? 503 : 200);
  }

  let db = null;
  try {
    db = dbOf(env);
    if (db) await ensureSchema(db);
  } catch (e) { db = null; }

  /* ---- الحالة (عام) ---- */
  if (pathname === '/api/activation/status') {
    if (method !== 'GET') return bad(json, 'METHOD', 'الطريقة غير مسموحة', 405);
    const q = new URL(request.url).searchParams;
    const id = str(q.get('device')).trim();
    const token = str(q.get('token')).trim();
    let activated = false;
    let dev = null;

    if (DEVICE_RE.test(id)) {
      const expected = await tokenFor(secret, id);
      activated = safeEqual(token, expected);
      if (db) {
        try {
          dev = await deviceGet(db, id);
          if (dev && dev.status === 'revoked') activated = false;
          if (dev) {
            await db.prepare('UPDATE activation_devices SET last_seen = ? WHERE device_id = ?')
              .bind(iso(now), id).run();
          }
        } catch (e) { /* القراءة تكميلية */ }
      }
      if (!dev) dev = { device_id: id, status: activated ? 'active' : 'pending' };
    }

    return json({
      ok: true, available: true,
      enforced: !enforceOff,
      activated: activated,
      serverNow: now,
      device: out(dev)
    });
  }

  /* ---- كلمة المرور التشغيلية (عام) ---- */
  if (pathname === '/api/activation/passcode') {
    if (method !== 'POST') return bad(json, 'METHOD', 'الطريقة غير مسموحة', 405);
    const b = await bodyOf(request);
    const id = str(b && b.device).trim();
    const pass = str(b && b.passcode).trim();
    const name = str(b && b.name).trim().slice(0, 60);
    if (!DEVICE_RE.test(id)) return bad(json, 'BAD_DEVICE', 'كود الجهاز لازم يكون 6 أرقام');
    if (!PASS_RE.test(pass)) return bad(json, 'BAD_PASSCODE', 'كلمة المرور التشغيلية 6 أرقام');

    const wait = tooMany(id);
    if (wait) return bad(json, 'TOO_MANY', 'محاولات كثيرة — حاول بعد ' + wait + ' دقيقة', 429);

    const win = Math.floor(now / PASS_WINDOW_MS);
    let okPass = false;
    for (let k = 0; k < 2 && !okPass; k++) {
      okPass = safeEqual(pass, await passcodeFor(secret, win - k));
    }
    if (!okPass) {
      noteFail(id);
      if (db) await eventLog(db, id, 'bad_passcode', 'كلمة مرور خاطئة');
      return bad(json, 'BAD_PASSCODE',
        'كلمة المرور غير صحيحة أو انتهت صلاحيتها — اطلب واحدة جديدة من المسؤول', 403);
    }
    failMemo.delete(id);

    if (db) {
      try {
        let dev = await deviceGet(db, id);
        if (dev && dev.status === 'revoked') {
          return bad(json, 'REVOKED', 'تم إلغاء تفعيل هذا الجهاز — كلّم المسؤول', 403);
        }
        if (!dev) {
          await db.prepare('INSERT INTO activation_devices (device_id, name, status, created_at, last_seen) ' +
            "VALUES (?, ?, 'pending', ?, ?)").bind(id, name, iso(now), iso(now)).run();
          await eventLog(db, id, 'registered', name || 'جهاز جديد');
          dev = await deviceGet(db, id);
        } else {
          await db.prepare('UPDATE activation_devices SET name = ?, last_seen = ? WHERE device_id = ?')
            .bind(name || dev.name, iso(now), id).run();
        }
        return json({
          ok: true, passcodeValid: true, deviceCode: id,
          secondsLeft: Math.ceil((PASS_WINDOW_MS - (now % PASS_WINDOW_MS)) / 1000),
          device: out(dev)
        });
      } catch (e) { /* لو D1 وقع نكمل stateless */ }
    }

    return json({
      ok: true, passcodeValid: true, deviceCode: id,
      secondsLeft: Math.ceil((PASS_WINDOW_MS - (now % PASS_WINDOW_MS)) / 1000),
      device: out({ device_id: id, status: 'pending' })
    });
  }

  /* ---- كود التفعيل المخصّص للجهاز (عام) ---- */
  if (pathname === '/api/activation/verify') {
    if (method !== 'POST') return bad(json, 'METHOD', 'الطريقة غير مسموحة', 405);
    const b = await bodyOf(request);
    const id = str(b && b.device).trim();
    const code = str(b && b.code).trim();
    if (!DEVICE_RE.test(id)) return bad(json, 'BAD_DEVICE', 'كود الجهاز لازم يكون 6 أرقام');
    if (!CODE_RE.test(code)) return bad(json, 'BAD_CODE', 'كود التفعيل 6 أرقام');

    const wait = tooMany(id);
    if (wait) return bad(json, 'TOO_MANY', 'محاولات كثيرة — حاول بعد ' + wait + ' دقيقة', 429);

    if (db) {
      try {
        const dev = await deviceGet(db, id);
        if (dev && dev.status === 'revoked') {
          return bad(json, 'REVOKED', 'تم إلغاء تفعيل هذا الجهاز — كلّم المسؤول', 403);
        }
        if (dev && dev.status === 'active') {
          return json({ ok: true, activated: true, token: await tokenFor(secret, id), device: out(dev) });
        }
      } catch (e) { /* نكمل */ }
    }

    const win = Math.floor(now / CODE_WINDOW_MS);
    let codeOk = false;
    for (let k = 0; k < 2 && !codeOk; k++) {
      codeOk = safeEqual(code, await actCodeFor(secret, id, win - k));
    }
    if (!codeOk) {
      noteFail(id);
      if (db) await eventLog(db, id, 'bad_code', 'كود تفعيل غير مطابق');
      return bad(json, 'BAD_CODE',
        'كود التفعيل غلط أو انتهت صلاحيته (3 دقائق) أو مش مخصّص للجهاز ده', 403);
    }
    failMemo.delete(id);

    if (db) {
      try {
        const at = iso(now);
        const dev = await deviceGet(db, id);
        if (dev) {
          await db.prepare('UPDATE activation_devices SET status = ?, activated_at = ?, ' +
            "revoked_at = '', last_seen = ? WHERE device_id = ?")
            .bind('active', at, at, id).run();
        } else {
          await db.prepare('INSERT INTO activation_devices (device_id, name, status, activated_at, last_seen, created_at) ' +
            "VALUES (?, '', 'active', ?, ?, ?)").bind(id, at, at, at).run();
        }
        await eventLog(db, id, 'activated', 'تم التفعيل');
        const done = await deviceGet(db, id);
        return json({ ok: true, activated: true, token: await tokenFor(secret, id), device: out(done) });
      } catch (e) { /* نكمل stateless */ }
    }

    return json({
      ok: true, activated: true, token: await tokenFor(secret, id),
      device: out({ device_id: id, status: 'active', activated_at: iso(now) })
    });
  }

  /* ===== مسارات الأدمن (اختيارية) ===== */

  if (pathname === '/api/activation/devices' && method === 'GET') {
    const a = await adminOnly(request, env, deps, json);
    if (a.error) return a.error;
    if (!db) {
      return json({ ok: true, enforced: !enforceOff, devices: [], count: 0,
        note: 'مفيش سجل أجهزة مركزي على النشر ده — التفعيل شغّال بدون سجل.' });
    }
    const rows = await db.prepare('SELECT * FROM activation_devices ORDER BY last_seen DESC LIMIT 200').all();
    const list = ((rows && rows.results) || []).map(function (d) {
      return {
        device: d.device_id, name: d.name || '', status: d.status || 'pending',
        activatedAt: d.activated_at || '', revokedAt: d.revoked_at || '', lastSeen: d.last_seen || ''
      };
    });
    return json({ ok: true, enforced: !enforceOff, devices: list, count: list.length });
  }

  if (pathname === '/api/activation/revoke' && method === 'POST') {
    const a = await adminOnly(request, env, deps, json);
    if (a.error) return a.error;
    if (!db) return bad(json, 'NO_STORE', 'إلغاء التفعيل محتاج سجل أجهزة مركزي (D1)', 503);
    const b = await bodyOf(request);
    const id = str(b && b.device).trim();
    if (!DEVICE_RE.test(id)) return bad(json, 'BAD_DEVICE', 'كود الجهاز لازم يكون 6 أرقام');
    const dev = await deviceGet(db, id);
    if (!dev) return bad(json, 'UNKNOWN_DEVICE', 'الجهاز غير مسجّل', 404);
    const at = iso(now);
    await db.prepare('UPDATE activation_devices SET status = ?, activated_at = ?, revoked_at = ?, ' +
      'last_seen = ? WHERE device_id = ?').bind('revoked', '', at, at, id).run();
    await eventLog(db, id, 'revoked', str(a.conn && a.conn.email));
    const done = await deviceGet(db, id);
    return json({ ok: true, device: out(done) });
  }

  return json({ ok: false, code: 'NOT_FOUND', error: 'مسار تفعيل غير معروف' }, 404);
}
