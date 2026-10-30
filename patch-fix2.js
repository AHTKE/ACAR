/* تعديلات ما بعد patch-fix: كود الدولة لرسائل واتساب + حقل الإعدادات */
const fs = require('fs');

let app = fs.readFileSync('app.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');
let n = 0;

function rep(file, what, oldStr, newStr) {
  const key = file === 'html' ? 'html' : 'app';
  const hay = key === 'html' ? html : app;
  const c = hay.split(oldStr).length - 1;
  if (c !== 1) throw new Error(`[${file}] count=${c} :: ${what}`);
  if (key === 'html') html = html.replace(oldStr, newStr);
  else app = app.replace(oldStr, newStr);
  n++;
  console.log('  OK  ' + what);
}

/* 1) كود الدولة داخل الإعدادات */
rep('app', 'settings country getter',
  `      phonePref: (s.phonePref === 'backup' || s.phonePref === 'both') ? s.phonePref : 'primary'
    };`,
  `      phonePref: (s.phonePref === 'backup' || s.phonePref === 'both') ? s.phonePref : 'primary',
      country: /^\\d{1,4}$/.test(String(s.country || '')) ? String(s.country) : '20'
    };`);

rep('app', 'settings country saver',
  `        phonePref: s.phonePref === 'backup' || s.phonePref === 'both' ? s.phonePref : 'primary'
      }));`,
  `        phonePref: s.phonePref === 'backup' || s.phonePref === 'both' ? s.phonePref : 'primary',
        country: /^\\d{1,4}$/.test(String(s.country || '')) ? String(s.country) : '20'
      }));`);

/* 2) صيغة الرقم: كود الدولة + بدون صفر */
rep('app', 'waDigits country aware',
  `  function waDigits(n) {
    var d = String(n || '').replace(/\\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.charAt(0) === '0') d = '2' + d;
    else if (d.length === 10 && d.charAt(0) !== '2') d = '20' + d;
    return d;
  }`,
  `  /* الرقم بصيغة واتساب الدولية: كود الدولة + الرقم بدون صفر أو علامات */
  function waDigits(n) {
    var cc = waSettings().country;
    var d = String(n || '').replace(/\\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (cc) {
      if (d.indexOf(cc) === 0 && d.length > cc.length + 6) return d;
      if (d.charAt(0) === '0') d = d.slice(1);
      if (d.indexOf(cc) !== 0) d = cc + d;
    } else if (d.charAt(0) === '0') {
      d = d.slice(1);
    }
    return d;
  }`);

/* 3) تعبئة حقل كود الدولة عند الرسم */
rep('app', 'render wa country',
  `    if (prefEl.value !== s.phonePref) prefEl.value = s.phonePref;`,
  `    if (prefEl.value !== s.phonePref) prefEl.value = s.phonePref;
    var ccEl = $('#waCountry');
    if (ccEl && document.activeElement !== ccEl) ccEl.value = s.country;`);

/* 4) الحفظ عند الضغط يقرأ كود الدولة */
rep('app', 'save reads country',
  `      var tpl = $('#waTemplate'), pref = $('#waPhonePref');
      saveWaSettings({
        template: tpl ? tpl.value : waSettings().template,
        phonePref: pref ? pref.value : waSettings().phonePref
      });`,
  `      var tpl = $('#waTemplate'), pref = $('#waPhonePref'), ccEl = $('#waCountry');
      saveWaSettings({
        template: tpl ? tpl.value : waSettings().template,
        phonePref: pref ? pref.value : waSettings().phonePref,
        country: ccEl ? ccEl.value : waSettings().country
      });`);

/* 5) تغيير كود الدولة يُحفظ تلقائياً */
rep('app', 'change saves country',
  `    if (e.target.id === 'waPhonePref') {
      var s = waSettings();
      s.phonePref = e.target.value;
      saveWaSettings(s);
      renderWaPanel();
    }`,
  `    if (e.target.id === 'waPhonePref' || e.target.id === 'waCountry') {
      var s = waSettings();
      if (e.target.id === 'waPhonePref') s.phonePref = e.target.value;
      else s.country = e.target.value;
      saveWaSettings(s);
      renderWaPanel();
    }`);

/* 6) حقل كود الدولة في الشاشة */
rep('html', 'country input',
  `            <label class="field"><span>الرقم المستخدم في الإرسال</span>
              <select id="waPhonePref">
                <option value="primary">الرقم الأساسي فقط</option>
                <option value="backup">الرقم الاحتياطي فقط</option>
                <option value="both">الأساسي ثم الاحتياطي (احتياطي)</option>
              </select>
            </label>`,
  `            <label class="field"><span>الرقم المستخدم في الإرسال</span>
              <select id="waPhonePref">
                <option value="primary">الرقم الأساسي فقط</option>
                <option value="backup">الرقم الاحتياطي فقط</option>
                <option value="both">الأساسي ثم الاحتياطي (احتياطي)</option>
              </select>
            </label>
            <label class="field"><span>كود الدولة (واتساب)</span>
              <input type="text" id="waCountry" inputmode="numeric" maxlength="4" placeholder="20" />
            </label>`);

fs.writeFileSync('app.js', app);
fs.writeFileSync('index.html', html);
console.log(`\nتم تطبيق ${n} تعديل بنجاح`);
