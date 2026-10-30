/* تعديلات: شغلانة العميل في توريد المورد + ظهورها في ملف العميل */
const fs = require('fs');
const F = 'app.js';
let src = fs.readFileSync(F, 'utf8');
let done = 0;

function rep(oldStr, newStr) {
  const i = src.indexOf(oldStr);
  if (i === -1) throw new Error('pattern not found: ' + oldStr.slice(0, 90));
  if (src.indexOf(oldStr, i + 1) !== -1) throw new Error('pattern not unique: ' + oldStr.slice(0, 90));
  src = src.slice(0, i) + newStr + src.slice(i + oldStr.length);
  done++;
}
function insertBefore(anchor, text) {
  const i = src.indexOf(anchor);
  if (i === -1) throw new Error('anchor not found: ' + anchor.slice(0, 90));
  if (src.indexOf(anchor, i + 1) !== -1) throw new Error('anchor not unique: ' + anchor.slice(0, 90));
  src = src.slice(0, i) + text + src.slice(i);
  done++;
}

/* 1) قراءة الشغلانة + التحقق الإجباري مع العميل + حفظها في الحركة */
rep(
  `      var f = supTxForm.elements;
      var date = f.date.value;
      var desc = String(f.desc.value || '').trim();
      var inc = parseFloat(f.incoming.value) || 0;
      var pd = parseFloat(f.paid.value) || 0;

      if (!date) fail('الرجاء إدخال التاريخ');
      else if (!desc) fail('الرجاء إدخال البيان');
      else if (!(inc > 0) && !(pd > 0)) fail('أدخل مبلغاً في الوارد أو المدفوع');
      else {`,
  `      var f = supTxForm.elements;
      var date = f.date.value;
      var desc = String(f.desc.value || '').trim();
      var inc = parseFloat(f.incoming.value) || 0;
      var pd = parseFloat(f.paid.value) || 0;
      var toName = String((f.to && f.to.value) || '').trim();
      var workName = String((f.work && f.work.value) || '').trim();

      if (!date) fail('الرجاء إدخال التاريخ');
      else if (!desc) fail('الرجاء إدخال البيان');
      else if (!(inc > 0) && !(pd > 0)) fail('أدخل مبلغاً في الوارد أو المدفوع');
      else if (toName && !workName) fail('الشغلانة إجبارية مع العميل — اخترها من شغلاناته أو اكتبها');
      else {`
);

rep(
  `          to: String((f.to && f.to.value) || '').trim(),`,
  `          to: toName,
          work: workName,`
);

/* 2) اقتراح شغلانات العميل المحدّد (أثناء الكتابة أو بتركيز الخانة) */
insertBefore(
  `  /* إضافة مورد */`,
  `  /* ---------- شغلانات العميل المحدّد في توريد المورد ---------- */
  function customerWorksNamed(name) {
    name = String(name || '').trim();
    if (!name) return [];
    var c = getCustomers().filter(function (x) { return String(x.name || '').trim() === name; })[0];
    if (!c) return [];
    return uniqueWorks(c.sends || []).concat(WORK_SUGGESTIONS)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  var supToEl = $('#supToInput'), supWorkEl = $('#supWorkInput'), supWorkPop = $('#supWorkSuggest');
  if (supWorkEl && supWorkPop) {
    var showSupWorkSuggest = function () {
      var to = supToEl ? supToEl.value : '';
      var q = String(supWorkEl.value || '').trim();
      var pool = customerWorksNamed(to);
      if (!pool.length) pool = WORK_SUGGESTIONS.slice();
      var items = worksMatching(q, pool);
      renderSuggest(supWorkPop, items, function (v) {
        supWorkEl.value = v;
        supWorkPop.hidden = true;
      }, q);
      if (q && !items.some(function (v) { return v === q; })) {
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'suggest-add';
        add.innerHTML = '＋ إضافة «' + esc(q) + '» كشغلانة جديدة';
        add.addEventListener('mousedown', function (e) { e.preventDefault(); });
        add.addEventListener('click', function () { supWorkPop.hidden = true; if (supWorkEl.focus) supWorkEl.focus(); });
        supWorkPop.appendChild(add);
      }
      supWorkPop.hidden = false;
    };
    supWorkEl.addEventListener('input', showSupWorkSuggest);
    supWorkEl.addEventListener('focus', showSupWorkSuggest);
    supWorkEl.addEventListener('blur', function () { setTimeout(function () { supWorkPop.hidden = true; }, 160); });
    if (supToEl) supToEl.addEventListener('change', function () {
      if (document.activeElement === supWorkEl) showSupWorkSuggest();
    });
  }

`
);

/* 3) التوريد المرتبط يعرض الشغلانة والبيان الأصلي في ملف العميل */
rep(
  `          out.push({
            work: String(t.desc || '').trim() || 'توريد مورد',
            date: t.date || '',
            desc: 'من المورد: ' + (s.name || ''),`,
  `          out.push({
            work: String(t.work || '').trim() || String(t.desc || '').trim() || 'توريد مورد',
            date: t.date || '',
            desc: String(t.desc || '').trim() || ('توريد من المورد: ' + (s.name || '')),`
);

/* 4) كشف حساب المورد في Excel يعرض الشغلانة */
rep(
  `    var tx = [['التاريخ', 'رقم الإيصال', 'البيان', 'ورّد إلى', 'الوارد', 'المدفوع', 'الباقي', 'ملاحظات']];
    var running = 0;
    d.tx.forEach(function (t) {
      running += Number(t.incoming || 0) - Number(t.paid || 0);
      tx.push([formatDate(t.date), t.no || '', t.desc || '', t.to || '',
        Number(t.incoming || 0), Number(t.paid || 0), running, t.note || '']);
    });`,
  `    var tx = [['التاريخ', 'رقم الإيصال', 'البيان', 'الشغلانة', 'ورّد إلى', 'الوارد', 'المدفوع', 'الباقي', 'ملاحظات']];
    var running = 0;
    d.tx.forEach(function (t) {
      running += Number(t.incoming || 0) - Number(t.paid || 0);
      tx.push([formatDate(t.date), t.no || '', t.desc || '', t.work || '', t.to || '',
        Number(t.incoming || 0), Number(t.paid || 0), running, t.note || '']);
    });`
);

rep(
  `      { name: 'الحركات', rows: tx, widths: [16, 12, 36, 24, 16, 16, 16, 30] }`,
  `      { name: 'الحركات', rows: tx, widths: [16, 12, 34, 22, 24, 16, 16, 16, 30] }`
);

fs.writeFileSync(F, src);
console.log('OK — طُبّق ' + done + ' تعديل على ' + F);
