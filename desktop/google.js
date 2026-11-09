/* ============================================================
   desktop/google.js — ربط Google Drive من داخل التطبيق المكتبي
   ------------------------------------------------------------
   التطبيق المكتبي بيعمل OAuth بنفسه (عميل Desktop + رابط إرجاع
   على 127.0.0.1) ويخزّن refresh_token في ملف محلي، بدل ما يعتمد
   على كوكي في المتصفح أو على قاعدة بيانات الموقع.

   ليه؟ لأن الـOAuth في الديسكتوب بيبدأ من نافذة التطبيق ويكمّل
   في المتصفح الخارجي، فأي كوكي أو ربط بيتحفظ في المتصفح مش
   بيوصل للتطبيق — وده كان سبب فشل الربط (خطأ 500/جلسة مش موجودة).

   فيه وضعين:
     • «محلي» (الافتراضي لما مفاتيح عميل Desktop موجودة): التطبيق بيعمل
       OAuth بنفسه على loopback ويحفظ رمز التجديد على الجهاز.
     • «عبر الموقع»: اختياري بـ NIZAM_LINK_MODE=site، وبيبدأ من الموقع
       الرسمي ويرجّع رمز التجديد للتطبيق على loopback.

   المسارات: status / check / login / callback / site-link /
             disconnect / ping / upload / notify
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send openid email';
const MAX_MAIL_BYTES = 24 * 1024 * 1024;
const EXPORT_FOLDER_NAME = 'ملفات ال PDF و EXCEL تابع تطبيق نظام الاداره';

function clean(v) {
  return String(v == null ? '' : v)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[\s"'\u0060]+/, '')
    .replace(/[\s"'\u0060]+$/, '')
    .replace(/[\r\n\t]/g, '')
    .trim();
}

module.exports = function createGoogle(deps) {
  const json = deps.json;
  const readBody = deps.readBody;
  const getPort = deps.getPort;
  const clientOf = typeof deps.client === 'function' ? deps.client : function () { return deps.client || {}; };
  const AUTH_FILE = path.join(deps.dataDir, 'google-auth.json');
  /* الموقع الرسمي اللي بيتم الربط من خلاله في وضع site فقط */
  const SITE_BASE = String(deps.siteBase || process.env.NIZAM_SITE_BASE ||
    deps.apiBase || 'https://workflow-amw-code.vercel.app').replace(/\/+$/, '');
  /* auto = محلي لو مفاتيح Desktop موجودة، وإلا موقع. أي قيمة صريحة
     (local/site) بتتغلّب على الاختيار التلقائي. */
  const LINK_MODE = String(process.env.NIZAM_LINK_MODE || '').toLowerCase();
  let tokenCache = { tok: '', exp: 0 };
  let siteCache = { ok: false, base: '', at: 0 };
  /* مدة تخزين نتيجة فحص الموقع (صفر = فحص في كل مرة — للاختبارات) */
  const CAP_TTL = Number(process.env.NIZAM_SITE_CAP_TTL || 5 * 60 * 1000);

  /* الوضع التلقائي: محلي لو مفاتيح Desktop متوفرة، وإلا الربط عبر الموقع.
     وضع site الصريح بيتحقق من دعم الموقع قبل التحويل، ولو مش متاح
     بيرجع للوضع المحلي لو المفاتيح موجودة. */
  async function resolveSite() {
    if (LINK_MODE === 'local') return { ok: false, base: '' };
    if (LINK_MODE !== 'site' && creds().configured) return { ok: false, base: '' };
    if (CAP_TTL > 0 && siteCache.at && Date.now() - siteCache.at < CAP_TTL) return siteCache;
    let found = { ok: false, base: '', origin: '', redirectUri: '', at: Date.now() };
    try {
      const ctl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
      const r = await fetch(SITE_BASE + '/api/google/capabilities', ctl ? { signal: ctl } : undefined);
      const j = await r.json().catch(function () { return {}; });
      if (r.ok && j && j.desktopLink) {
        /* origin/redirectUri ممكن يختلفوا عن base لو الموقع مثبّت
           APP_BASE_URL على دومين ثابت. */
        const origin = /^https?:\/\//i.test(j.origin || '')
          ? String(j.origin).replace(/\/+$/, '') : SITE_BASE;
        found = {
          ok: true,
          base: SITE_BASE,
          origin: origin,
          redirectUri: /^https?:\/\//i.test(j.redirectUri || '')
            ? String(j.redirectUri) : (origin + '/api/google/callback'),
          at: Date.now()
        };
      }
    } catch (e) { /* الموقع مش متاح — نكمل بالوضع المحلي */ }
    siteCache = found;
    return found;
  }


  /* ---------- المفاتيح ---------- */
  function creds() {
    const c = clientOf() || {};
    const id = clean(c.client_id);
    const secret = clean(c.client_secret);
    return {
      id: id,
      secret: secret,
      configured: !!(id && secret),
      idValid: /^\d{6,}-[a-z0-9_-]{10,}\.apps\.googleusercontent\.com$/i.test(id),
      secretValid: /^GOCSPX-[A-Za-z0-9_-]{8,}$/.test(secret) || secret.length >= 24
    };
  }

  /* ---------- تخزين الربط محليًا ---------- */
  function readAuth() {
    try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) || {}; } catch (e) { return {}; }
  }
  function writeAuth(a) {
    try {
      fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
      const tmp = AUTH_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(a || {}));
      try { fs.renameSync(tmp, AUTH_FILE); }
      catch (e) { try { fs.unlinkSync(tmp); } catch (e2) {} throw e; }
      return true;
    } catch (e) { return false; }
  }
  function patchAuth(patch) {
    const a = Object.assign({}, readAuth(), patch || {});
    writeAuth(a);
    return a;
  }
  function clearAuth() {
    tokenCache = { tok: '', exp: 0 };
    try { fs.unlinkSync(AUTH_FILE); } catch (e) {}
  }

  /* ---------- روابط محلية ---------- */
  function originLocal() {
    return 'http://127.0.0.1:' + (getPort() || 47820);
  }
  function redirectUri() {
    return originLocal() + '/api/google/callback';
  }
  function localRedirect(qs) {
    return originLocal() + '/' + qs;
  }
  function redirect(res, location, headers) {
    const h = Object.assign({ Location: location, 'Cache-Control': 'no-store' }, headers || {});
    res.writeHead(302, h);
    res.end();
  }

  /* ---------- رموز الوصول ---------- */
  function tokenDead(msg) {
    return /invalid_grant|invalid_client|unauthorized_client|expired or revoked/i.test(String(msg || ''));
  }

  async function accessToken(force) {
    const a = readAuth();
    if (!a.refresh_token && !a.site_refresh_token) {
      const err = new Error('لم يتم ربط حساب Google');
      err.needsConnect = true;
      throw err;
    }
    if (!force && tokenCache.tok && tokenCache.exp > Date.now() + 60000) return tokenCache.tok;
    if (!force && a.access_token && Number(a.expires_at || 0) > Date.now() + 60000) {
      tokenCache = { tok: a.access_token, exp: Number(a.expires_at) };
      return a.access_token;
    }
    /* ربط تم من الموقع: التجديد بيتعمل بسر عميل الموقع، فنسأله هو */
    if (a.site_refresh_token) {
      const base = String(a.site_base || SITE_BASE).replace(/\/+$/, '');
      const ctl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
      let r, j;
      try {
        r = await fetch(base + '/api/google/access-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: a.site_refresh_token }),
          signal: ctl
        });
        j = await r.json().catch(function () { return {}; });
      } catch (e) {
        throw new Error('تعذّر الوصول للموقع (' + base + ') لتجديد ربط Google — اتأكد من الإنترنت');
      }
      if (r.status === 404 || r.status === 405) {
        /* الموقع منشور من نسخة قديمة — مالوش ذنب المستخدم، الرسالة توضّح الحل */
        const err = new Error('الموقع المنشور مش بيدعم تجديد الربط بعد — لازم يتعمل Redeploy لآخر نسخة من الكود');
        err.redeploy = true;
        throw err;
      }
      if (!r.ok || !j.access_token) {
        const msg = j.error_description || j.error || 'فشل تجديد رمز الوصول من الموقع';
        const dead = tokenDead(msg) || !!j.reauth;
        if (dead) clearAuth();
        const err = new Error(msg);
        err.reauth = dead;
        throw err;
      }
      const sexp = Date.now() + Number(j.expires_in || 3500) * 1000;
      patchAuth({ access_token: j.access_token, expires_at: sexp });
      tokenCache = { tok: j.access_token, exp: sexp };
      return j.access_token;
    }
    const c = creds();
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.id,
        client_secret: c.secret,
        refresh_token: a.refresh_token,
        grant_type: 'refresh_token'
      }).toString()
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.access_token) {
      const msg = j.error_description || j.error || 'فشل تجديد رمز الوصول';
      if (tokenDead(msg)) clearAuth();
      const err = new Error(msg);
      err.reauth = tokenDead(msg);
      throw err;
    }
    const exp = Date.now() + Number(j.expires_in || 3500) * 1000;
    patchAuth({ access_token: j.access_token, expires_at: exp });
    tokenCache = { tok: j.access_token, exp: exp };
    return j.access_token;
  }

  async function exchangeCode(code) {
    const c = creds();
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.id,
        client_secret: c.secret,
        code: code,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code'
      }).toString()
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || 'فشل استبدال رمز التفويض');
    return j;
  }

  async function fetchEmail(at) {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + at }
      });
      const j = await r.json().catch(function () { return {}; });
      return j.email || '';
    } catch (e) { return ''; }
  }

  /* ---------- Drive ---------- */
  async function ensureExportFolder(at) {
    const a = readAuth();
    if (a.export_folder_id) return a.export_folder_id;
    try {
      const q = "mimeType='application/vnd.google-apps.folder' and name='" +
        EXPORT_FOLDER_NAME.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' and trashed=false";
      const lr = await fetch(DRIVE_FILES + '?q=' + encodeURIComponent(q) +
        '&fields=files(id)&pageSize=1&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + at } });
      const lj = await lr.json().catch(function () { return {}; });
      const found = lj && lj.files && lj.files[0] && lj.files[0].id;
      if (found) { patchAuth({ export_folder_id: found }); return found; }
      const cr = await fetch(DRIVE_FILES + '?fields=id&supportsAllDrives=true', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ name: EXPORT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
      });
      const cj = await cr.json().catch(function () { return {}; });
      if (cr.ok && cj.id) { patchAuth({ export_folder_id: cj.id }); return cj.id; }
    } catch (e) { /* نرفع بدون مجلد */ }
    return '';
  }

  const MIME_BY_EXT = {
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.json': 'application/json'
  };

  async function uploadFile(at, name, mime, bytes, dest) {
    const boundary = '-------nizam' + crypto.randomUUID().replace(/-/g, '');
    const parentId = String(dest || '') === 'folder' ? await ensureExportFolder(at) : '';
    const meta = JSON.stringify(parentId
      ? { name: String(name), mimeType: mime, parents: [parentId] }
      : { name: String(name), mimeType: mime });
    const head = Buffer.from('--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: ' + mime + '\r\n\r\n', 'utf8');
    const tail = Buffer.from('\r\n--' + boundary + '--', 'utf8');
    const r = await fetch(DRIVE_UPLOAD + '?uploadType=multipart&fields=id,name&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + at,
        'Content-Type': 'multipart/related; boundary=' + boundary
      },
      body: Buffer.concat([head, bytes, tail])
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.id) throw new Error((j.error && j.error.message) || 'فشل الرفع إلى Google Drive');
    let link = '';
    try {
      const lr = await fetch(DRIVE_FILES + '/' + j.id + '?fields=webViewLink&supportsAllDrives=true', {
        headers: { Authorization: 'Bearer ' + at }
      });
      const lj = await lr.json().catch(function () { return {}; });
      link = lj.webViewLink || '';
    } catch (e) { /* الرابط اختياري */ }
    return { id: j.id, name: j.name || name, link: link, inFolder: !!parentId };
  }

  /* ---------- Gmail ---------- */
  function b64utf8(s) { return Buffer.from(String(s == null ? '' : s), 'utf8').toString('base64'); }
  function rfc2047(s) { return '=?UTF-8?B?' + b64utf8(s) + '?='; }
  function fold76(s) { return String(s || '').replace(/(.{76})/g, '$1\r\n'); }

  function buildMail(o) {
    const boundary = '-----amwnizam' + crypto.randomUUID().replace(/-/g, '');
    const parts = [
      'To: ' + o.to,
      'Subject: ' + rfc2047(o.subject),
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + boundary + '"',
      '',
      '--' + boundary,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      fold76(b64utf8(o.text)),
      ''
    ];
    if (o.b64) {
      parts.push(
        '--' + boundary,
        'Content-Type: ' + o.mime + '; name="' + rfc2047(o.fileName) + '"',
        'Content-Transfer-Encoding: base64',
        'Content-Disposition: attachment; filename="' + rfc2047(o.fileName) + '"',
        '',
        fold76(o.b64),
        ''
      );
    }
    parts.push('--' + boundary + '--', '');
    return parts.join('\r\n');
  }

  /* ---------- ردود موحّدة ---------- */
  function authFailed(res, err) {
    const dead = !!(err && (err.reauth || tokenDead(err.message)));
    const body = {
      ok: false,
      reauth: dead,
      needsConnect: !dead,
      loginUrl: '/api/google/login',
      error: dead
        ? 'انتهت صلاحية ربط Google — اضغط «ربط Google Drive» من الإعدادات عشان تجدّد الربط، وبعدها أعد التصدير.'
        : ('تعذّر تجديد ربط Google: ' + ((err && err.message) || 'خطأ غير معروف'))
    };
    json(res, 401, body);
  }

  /* ---------- المسارات ---------- */
  async function handle(req, res, pathname) {
    const method = String(req.method || 'GET').toUpperCase();
    const c = creds();

    if (pathname === '/api/google/status') {
      const a = readAuth();
      const rid = redirectUri();
      const viaSite = !!a.site_refresh_token;
      const site = await resolveSite();
      const capable = site.ok;
      const siteBase = String(a.site_base || site.origin || site.base || SITE_BASE).replace(/\/+$/, '');
      const siteRedirect = String(site.redirectUri || (siteBase + '/api/google/callback'));
      const useSite = viaSite || capable;
      const shownRedirect = useSite ? siteRedirect : rid;
      json(res, 200, {
        configured: c.configured || capable || viaSite,
        connected: !!(viaSite || a.refresh_token),
        email: a.email || '',
        mode: viaSite ? 'site' : 'local',
        siteBase: siteBase,
        siteLink: capable,
        clientIdTail: c.id ? c.id.slice(-10) : '',
        clientIdLength: c.id.length,
        clientIdValid: c.idValid,
        secretPresent: !!c.secret,
        secretValid: c.secretValid,
        redirectUri: shownRedirect,
        origin: shownRedirect.replace(/\/api\/google\/callback$/, ''),
        verdict: viaSite ? 'site_linked'
          : capable ? 'site_ready'
            : !c.configured ? 'missing_keys'
              : !c.idValid ? 'bad_client_id_format'
                : !c.secretValid ? 'bad_client_secret_format'
                  : 'keys_ready',
        desktop: true
      });
      return true;
    }

    /* الموقع رجّع الربط للتطبيق (بعد ما المستخدم سمح من Google) */
    if (pathname === '/api/google/site-link') {
      const u = new URL(req.url, 'http://127.0.0.1');
      const refresh = String(u.searchParams.get('refresh') || '').trim();
      const email = String(u.searchParams.get('email') || '').trim();
      if (!refresh) {
        redirect(res, localRedirect('?g=err&m=' + encodeURIComponent(
          'الموقع ما رجّعش رمز ربط صالح — اضغط «ربط Google Drive» وجرّب تاني')));
        return true;
      }
      const auth = readAuth();
      const pendingSite = String(auth.pending_site || '').replace(/\/+$/, '');
      const siteBase = /^https?:\/\//i.test(pendingSite)
        ? pendingSite : (siteCache.origin || siteCache.base || SITE_BASE);
      patchAuth({
        site_refresh_token: refresh,
        site_base: siteBase,
        email: email,
        refresh_token: '',
        access_token: '',
        expires_at: 0,
        connected_at: new Date().toISOString(),
        pending_state: '',
        pending_at: 0,
        pending_site: ''
      });
      tokenCache = { tok: '', exp: 0 };
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
        '<title>تم الربط</title></head><body style="font-family:Segoe UI,Tahoma,sans-serif;' +
        'background:#0a0e15;color:#e9eef7;display:flex;align-items:center;justify-content:center;' +
        'height:100vh;margin:0"><div style="text-align:center"><div style="font-size:46px">✓</div>' +
        '<h1 style="font-size:20px;margin:10px 0 6px">تم ربط حساب Google</h1>' +
        '<p style="opacity:.75;font-size:14px;margin:0">ارجع لنسخة الديسكتوب — الحساب متصل دلوقتي.</p>' +
        '</div></body></html>');
      return true;
    }

    if (pathname === '/api/google/check') {
      /* في وضع الموقع: الفحص لازم يتم على مفاتيح الموقع نفسها، وإلا
         هيظهر للمستخدم رابط loopback ومفاتيح ديسكتوب غير مستخدمة. */
      const site = await resolveSite();
      if (site.ok) {
        try {
          const siteOrigin = String(site.origin || site.base).replace(/\/+$/, '');
          const ctl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined;
          const sr = await fetch(siteOrigin + '/api/google/check', ctl ? { signal: ctl } : undefined);
          const sj = sr.ok ? await sr.json().catch(function () { return null; }) : null;
          if (sj && typeof sj === 'object') {
            sj.mode = 'site';
            sj.siteLink = true;
            sj.siteBase = siteOrigin;
            if (!sj.redirectUri) sj.redirectUri = site.redirectUri;
            json(res, 200, sj);
            return true;
          }
        } catch (e) { /* لو فشل فحص الموقع نكمل بالفحص المحلي */ }
      }
      const out = {
        mode: 'local',
        ok: true, verdict: '', clientId: c.id, clientIdValid: c.idValid,
        secretPresent: !!c.secret, secretValid: c.secretValid,
        redirectUri: redirectUri(), idProbe: null, secretProbe: null, advice: ''
      };
      if (!c.configured) {
        out.verdict = 'missing_keys';
        out.advice = 'ملف desktop/google-client.json غير موجود أو ناقص في نسخة الديسكتوب.';
        json(res, 200, out);
        return true;
      }
      if (!c.idValid) {
        out.verdict = 'bad_client_id_format';
        out.advice = 'الـClient ID لازم ينتهي بـ .apps.googleusercontent.com — انسخه كامل من Google Cloud ← Clients.';
        json(res, 200, out);
        return true;
      }
      try {
        const u = new URL(AUTH_URL);
        u.searchParams.set('client_id', c.id);
        u.searchParams.set('redirect_uri', redirectUri());
        u.searchParams.set('response_type', 'code');
        u.searchParams.set('scope', 'openid email');
        u.searchParams.set('prompt', 'none');
        const r = await fetch(u.toString(), { redirect: 'manual' });
        const loc = r.headers.get('location') || '';
        let text = '';
        if (loc) {
          try {
            const lj = new URL(loc);
            text = (lj.searchParams.get('error') || '') + ' ' + (lj.searchParams.get('error_description') || '');
          } catch (e) { text = loc; }
        }
        out.idProbe = {
          status: r.status,
          redirected: /^https?:/i.test(loc) && loc.indexOf('accounts.google.com') === -1,
          redirectUriMismatch: /redirect_uri_mismatch/i.test(text) || /redirect_uri_mismatch/i.test(loc),
          clientNotFound: /invalid_client|OAuth client was not found|deleted_client/i.test(text)
        };
      } catch (e) {
        out.idProbe = { status: 0, network: true, error: String((e && e.message) || e).slice(0, 200) };
      }
      try {
        const r = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: c.id, client_secret: c.secret, code: 'diagnostic-probe',
            grant_type: 'authorization_code', redirect_uri: redirectUri()
          }).toString()
        });
        const j = await r.json().catch(function () { return {}; });
        out.secretProbe = { status: r.status, error: j.error || '', description: j.error_description || '' };
      } catch (e) {
        out.secretProbe = { status: 0, network: true, error: String((e && e.message) || e).slice(0, 200) };
      }
      const ip = out.idProbe || {};
      const sp = out.secretProbe || {};
      if (ip.clientNotFound) {
        out.verdict = 'client_id_not_found';
        out.advice = 'Google لا يعرف هذا الـClient ID — راجع Google Cloud ← Clients.';
      } else if (ip.redirectUriMismatch) {
        out.verdict = 'redirect_uri_mismatch';
        out.advice = 'أضف في Google Cloud ← Clients ← Authorized redirect URIs: ' + redirectUri();
      } else if (sp.error === 'invalid_client') {
        out.verdict = 'bad_client_secret';
        out.advice = 'الـClient Secret لا يطابق الـClient ID — خد السر الحالي من نفس العميل.';
      } else {
        out.verdict = 'keys_ok';
        out.advice = 'المفاتيح سليمة ومطابقة لـ Google — الربط جاهز.';
      }
      json(res, 200, out);
      return true;
    }

    if (pathname === '/api/google/login') {
      /* الربط عبر الموقع اختياري (NIZAM_LINK_MODE=site)، وإلا محلي */
      const site = await resolveSite();
      if (site.ok) {
        const siteOrigin = String(site.origin || site.base).replace(/\/+$/, '');
        patchAuth({ pending_at: Date.now(), pending_site: siteOrigin });
        redirect(res, siteOrigin + '/api/google/login?desktop=' + (getPort() || 47820));
        return true;
      }
      if (!c.configured) {
        redirect(res, localRedirect('?g=err&m=' + encodeURIComponent(
          'مفاتيح Google غير موجودة في نسخة الديسكتوب — أعد تثبيت النسخة اللي فيها ملف desktop/google-client.json.')));
        return true;
      }
      if (!c.idValid) {
        redirect(res, localRedirect('?g=err&m=' + encodeURIComponent(
          'الـClient ID غير صالح الصيغة — لازم ينتهي بـ .apps.googleusercontent.com')));
        return true;
      }
      const state = crypto.randomUUID();
      /* الحالة بتتحفظ محليًا (مش كوكي) — لأن الرجوع ممكن يحصل في
         متصفح خارجي مختلف عن نافذة التطبيق. */
      patchAuth({ pending_state: state, pending_at: Date.now(), pending_site: '' });
      const u = new URL(AUTH_URL);
      u.searchParams.set('client_id', c.id);
      u.searchParams.set('redirect_uri', redirectUri());
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', SCOPES);
      u.searchParams.set('access_type', 'offline');
      u.searchParams.set('prompt', 'consent');
      u.searchParams.set('include_granted_scopes', 'true');
      u.searchParams.set('state', state);
      redirect(res, u.toString());
      return true;
    }

    if (pathname === '/api/google/callback') {
      const u = new URL(req.url, 'http://127.0.0.1');
      const err = u.searchParams.get('error');
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      const a = readAuth();
      const age = Date.now() - Number(a.pending_at || 0);
      const stateOk = !!state && state === a.pending_state && age < 30 * 60 * 1000;

      if (err) {
        const desc = u.searchParams.get('error_description') || '';
        const msg = err === 'access_denied'
          ? 'تم إلغاء منح الإذن من حساب Google — جرّب تختار حسابك وتضغط «السماح».'
          : 'Google رد بخطأ: ' + err + (desc ? ' — ' + desc : '');
        redirect(res, localRedirect('?g=err&m=' + encodeURIComponent(msg)));
        return true;
      }
      if (!code) { redirect(res, localRedirect('?g=err&m=' + encodeURIComponent('لم يصل رمز التفويض'))); return true; }
      if (!stateOk) {
        redirect(res, localRedirect('?g=err&m=' + encodeURIComponent(
          'انتهت صلاحية محاولة الربط — اضغط «ربط Google Drive» من جديد.')));
        return true;
      }

      try {
        const tok = await exchangeCode(code);
        const email = await fetchEmail(tok.access_token);
        const prev = readAuth();
        patchAuth({
          refresh_token: tok.refresh_token || prev.refresh_token || '',
          access_token: tok.access_token,
          expires_at: Date.now() + Number(tok.expires_in || 3500) * 1000,
          email: email || prev.email || '',
          connected_at: new Date().toISOString(),
          pending_state: '',
          pending_at: 0
        });
        tokenCache = { tok: tok.access_token, exp: Date.now() + Number(tok.expires_in || 3500) * 1000 };
        if (!tok.refresh_token && !prev.refresh_token) {
          redirect(res, localRedirect('?g=err&m=' + encodeURIComponent(
            'Google لم يرجّع رمز تجديد دائم — افتح Google Cloud ← Clients وشيل أي قيود، أو أزل التطبيق من صلاحيات الحساب وجرّب تاني.')));
          return true;
        }
        redirect(res, localRedirect('?g=ok'));
      } catch (e) {
        redirect(res, localRedirect('?g=err&m=' + encodeURIComponent(e.message || 'فشل الربط')));
      }
      return true;
    }

    if (pathname === '/api/google/disconnect') {
      clearAuth();
      json(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/google/ping') {
      try {
        const at = await accessToken(true);
        void at;
        const a = readAuth();
        json(res, 200, { ok: true, connected: true, email: a.email || '' });
      } catch (e) {
        const dead = !!(e && (e.reauth || tokenDead(e.message)));
        json(res, 200, {
          ok: false, connected: false, reauth: dead, needsConnect: !dead,
          redeploy: !!(e && e.redeploy),
          loginUrl: '/api/google/login',
          error: dead ? 'الربط غير صالح — أعد الربط من جديد' : ((e && e.message) || 'تعذّر التحقق من الربط')
        });
      }
      return true;
    }

    if (pathname === '/api/google/upload' && method === 'POST') {
      const raw = await readBody(req, 48 * 1024 * 1024);
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = null; }
      const name = body && body.name;
      const mime = (body && body.mime) || MIME_BY_EXT[path.extname(String(name || '')).toLowerCase()] || 'application/octet-stream';
      const b64 = body && body.b64;
      if (!name || !b64) { json(res, 400, { ok: false, error: 'بيانات الملف ناقصة' }); return true; }
      let at;
      try { at = await accessToken(false); }
      catch (e) { authFailed(res, e); return true; }
      try {
        const bytes = Buffer.from(String(b64), 'base64');
        if (!bytes.length) { json(res, 400, { ok: false, error: 'الملف فاضي' }); return true; }
        const out = await uploadFile(at, name, mime, bytes, body && body.dest);
        json(res, 200, Object.assign({ ok: true }, out));
      } catch (e) {
        json(res, 502, { ok: false, error: (e && e.message) || 'فشل الرفع إلى Drive' });
      }
      return true;
    }

    if (pathname === '/api/google/notify' && method === 'POST') {
      const raw = await readBody(req, 48 * 1024 * 1024);
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = null; }
      const name = body && body.name;
      if (!name) { json(res, 400, { ok: false, error: 'بيانات الملف ناقصة' }); return true; }
      const a = readAuth();
      const to = String((body && body.to) || '').trim() || String(a.email || '').trim();
      if (!to) { json(res, 400, { ok: false, error: 'حدّد بريد المستلم' }); return true; }
      const b64 = String((body && body.b64) || '');
      if (b64 && Math.floor(b64.length * 3 / 4) > MAX_MAIL_BYTES) {
        json(res, 413, { ok: false, error: 'المرفق أكبر من حد Gmail (24 ميجابايت) — افتحه من Google Drive بالرابط' });
        return true;
      }
      let at;
      try { at = await accessToken(false); }
      catch (e) { authFailed(res, e); return true; }
      try {
        const mime = (body && body.mime) || 'application/octet-stream';
        const mail = buildMail({
          to: to,
          subject: 'تم رفع ملف: ' + name,
          text: 'تم رفع الملف «' + name + '» بنجاح إلى Google Drive من تطبيق نظام الإدارة.\n\n' +
            (body && body.link ? 'رابط الملف على Drive: ' + body.link + '\n\n' : '') +
            'الوقت: ' + new Date().toISOString() + '\nمرفق لك نسخة من الملف مباشرة.',
          fileName: name,
          mime: mime,
          b64: b64
        });
        const r = await fetch(GMAIL_SEND_URL, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ raw: Buffer.from(mail, 'utf8').toString('base64url') })
        });
        const j = await r.json().catch(function () { return {}; });
        if (!r.ok) {
          json(res, r.status >= 400 && r.status < 600 ? r.status : 502,
            { ok: false, error: (j.error && j.error.message) || 'فشل إرسال البريد' });
          return true;
        }
        json(res, 200, { ok: true, to: to, id: j.id || '' });
      } catch (e) {
        json(res, 502, { ok: false, error: (e && e.message) || 'فشل إرسال البريد' });
      }
      return true;
    }

    return false;
  }

  return { handle: handle, readAuth: readAuth, clearAuth: clearAuth };
};
