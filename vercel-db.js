/* ============================================================
   vercel-db.js — طبقة تخزين متوافقة مع D1 لتشغيل الـWorker على Vercel
   ------------------------------------------------------------
   Vercel مفيهوش D1، فبنخزّن حالة الربط والإعدادات في كوكي آمن
   (HttpOnly + Secure + SameSite=Lax) على نفس الجهاز، من غير أي
   خدمة خارجية ولا مفاتيح إضافية. نفس أوامر SQL اللي الـWorker
   بيستخدمها على Cloudflare بتشتغل هنا من غير أي تعديل عليه.

   المحفوظ: سطر اتصال Google (refresh_token + email) + إعدادات
   (فولدر المزامنة / فولدر التصدير) — الحجم بضع مئات البايت فقط.
   ============================================================ */

const COOKIE_NAME = 'vcdb';
/* حد أقصى لحجم قيمة الكوكي: المتصفحات بترفض الـ4KB */
const MAX_BYTES = 3500;

function decodeState(cookieHeader) {
  const state = { c: [], s: {} };
  if (!cookieHeader) return state;
  const parts = String(cookieHeader).split(';');
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq < 0) continue;
    if (parts[i].slice(0, eq).trim() !== COOKIE_NAME) continue;
    try {
      const parsed = JSON.parse(decodeURIComponent(parts[i].slice(eq + 1).trim()));
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.c)) state.c = parsed.c;
        if (parsed.s && typeof parsed.s === 'object') state.s = parsed.s;
      }
    } catch (e) { /* كوكي تالف — نبدأ من جديد */ }
  }
  return state;
}

function norm(sql) {
  return String(sql == null ? '' : sql).replace(/\s+/g, ' ').trim();
}

function rowOut(r) {
  return {
    client_token: r.t,
    refresh_token: r.r,
    email: r.e || '',
    created_at: r.ca || '',
    updated_at: r.u || 0
  };
}

/**
 * يرجّع كائن بنفس واجهة D1 (exec / prepare().bind().first()|.run())
 * مبني فوق كوكي. الكوكي الجديد بيتسجّل في pendingCookie() والـAPI
 * بيضيفه على الرد بنفسه.
 */
export function createCookieDB(cookieHeader) {
  const state = decodeState(cookieHeader);
  let dirty = false;

  const findByToken = (token) => state.c.find((r) => r && r.t === token) || null;

  const write = () => { dirty = true; };

  function apply(q, args) {
    let m;

    /* ---------- google_settings ---------- */
    if (/^select v from google_settings where k = \?$/i.test(q)) {
      const v = Object.prototype.hasOwnProperty.call(state.s, args[0]) ? state.s[args[0]] : null;
      return v == null ? null : { v: v };
    }
    if (/^insert into google_settings \(k, v\) values \(\?, \?\) on conflict\(k\) do update set v = excluded\.v$/i.test(q)) {
      state.s[String(args[0])] = String(args[1]);
      write();
      return null;
    }

    /* ---------- google_connections ---------- */
    if (/^select \* from google_connections where client_token = \?$/i.test(q)) {
      const row = findByToken(args[0]);
      return row ? rowOut(row) : null;
    }
    if (/^select client_token from google_connections limit 1$/i.test(q)) {
      return state.c.length ? { client_token: state.c[0].t } : null;
    }
    if ((m = q.match(/^insert into google_connections \(client_token, refresh_token, email\) values \(\?, \?, \?\)$/i))) {
      const i = state.c.findIndex((r) => r && r.t === args[0]);
      const row = { t: args[0], r: args[1], e: args[2] || '', u: Date.now() };
      if (i >= 0) state.c[i] = Object.assign({}, state.c[i], row);
      else state.c.push(row);
      write();
      return null;
    }
    if ((m = q.match(/^update google_connections set email = \?, updated_at = \? where client_token = \?$/i))) {
      const row = findByToken(args[2]);
      if (row) { row.e = args[0] || ''; row.u = args[1] || Date.now(); write(); }
      return null;
    }
    if ((m = q.match(/^delete from google_connections where refresh_token = \?$/i))) {
      const before = state.c.length;
      state.c = state.c.filter((r) => !r || r.r !== args[0]);
      if (state.c.length !== before) write();
      return null;
    }
    if ((m = q.match(/^delete from google_connections where client_token = \?$/i))) {
      const before = state.c.length;
      state.c = state.c.filter((r) => !r || r.t !== args[0]);
      if (state.c.length !== before) write();
      return null;
    }

    /* ---------- أوامر معلنة أو جديدة ---------- */
    if (/^(create table|drop table|alter table)/i.test(q)) return null;
    if (/^select /i.test(q)) return null;

    const e = new Error('أمر قاعدة بيانات غير مدعوم على Vercel: ' + q.slice(0, 80));
    e.code = 'VC_SQL_UNSUPPORTED';
    throw e;
  }

  const db = {
    async exec() { return { success: true }; },
    prepare(sql) {
      const q = norm(sql);
      const stmt = {
        _args: [],
        bind(...args) { stmt._args = args; return stmt; },
        async first() { return apply(q, stmt._args); },
        async all() {
          const r = apply(q, stmt._args);
          return { results: r ? [r] : [], success: true };
        },
        async run() { apply(q, stmt._args); return { success: true, meta: {} }; }
      };
      return stmt;
    }
  };

  /* قيمة الكوكي اللي لازم تترسم على المتصفح بعد الرد — null لو مفيش تغيير */
  function pendingCookie() {
    if (!dirty) return null;
    let value = encodeURIComponent(JSON.stringify({ c: state.c, s: state.s }));
    if (value.length > MAX_BYTES) {
      /* الإعدادات قابلة للتجاهل — نفضّها قبل ما الكوكي يترفض */
      state.s = {};
      value = encodeURIComponent(JSON.stringify({ c: state.c, s: {} }));
    }
    if (value.length > MAX_BYTES) return null;
    return COOKIE_NAME + '=' + value +
      '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000';
  }

  return { db, pendingCookie };
}