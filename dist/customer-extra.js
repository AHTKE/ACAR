/* ============================================================
   customer-extra.js — المصنعية وأجور العمال داخل بروفايل العميل
   ------------------------------------------------------------
   • كل بند: تاريخ + نوع البند + اسم العامل/المصنعية + المبلغ + ملاحظة.
   • نوع البند:
       – «شغلانة»: تختار شغلانة من شغلانات العميل، فتتسجّل الأجرة
         عند الشغلانة دي (وتظهر في توزيع الأجور على الشغلانات).
       – «تشوين»: بند عادي بدون شغلانة.
   • تُخصم من «المبلغ المدفوع منا نحن للعميل» وتُعرض في ملخص
     «المرسل من موارد» بعد التعديل في app.js.
   • لا تُضاف إلى الدواخل والخوارج تلقائيًا؛ لأنها ليست نقدًا
     خرج من الخزنة، لكنها تستهلك رصيد المدفوع منا للعميل.
   ============================================================ */
(function (root) {
  'use strict';

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    n = Number(n || 0);
    if (!isFinite(n)) n = 0;
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function uid() { return 'manu' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function app() { return root.NizamApp || null; }

  /* نوع البند: شغلانة (kind=work) أو تشوين (kind=store) */
  function kindOf(m) {
    return (m && m.kind === 'work' && String(m.work || '').trim()) ? 'work' : 'store';
  }

  /* شغلانات العميل: من عمليات «المرسل» + الشغلانات المسجّلة هنا */
  function customerWorks(c) {
    var out = [];
    function push(v) {
      v = String(v == null ? '' : v).trim();
      if (v && out.indexOf(v) < 0) out.push(v);
    }
    ((c && c.sends) || []).forEach(function (s) { push(s && s.work); });
    ((c && c.manufacturing) || []).forEach(function (m) { if (kindOf(m) === 'work') push(m.work); });
    return out;
  }

  function inject() {
    if (document.getElementById('manufacturingPanel')) return;
    var sendPanel = document.getElementById('sendPanel');
    if (!sendPanel || !sendPanel.parentNode) return;
    var html = '' +
      '<div class="panel" id="manufacturingPanel" hidden>' +
        '<h3 class="panel__title"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-users"/></svg> المصنعية وأجور العمال</h3>' +
        '<p class="panel__hint">سجّل المصنعية وأجرة اليد العاملة اللي اشتغلت عند العميل. <b>بتتخصم من «المبلغ المدفوع منا نحن للعميل»</b> — وبتقلّل المتبقي في «المرسل من موارد». مش بتتسجل في الدواخل والخوارج لأنها مش فلوس نقدية خرجت من الخزنة.</p>' +
        '<div class="summary summary--4" id="manuSummary"></div>' +
        '<form id="manuForm" class="form" novalidate>' +
          '<div class="form__row form__row--3">' +
            '<label class="field"><span>التاريخ *</span><input type="date" name="date" required /></label>' +
            '<label class="field"><span>نوع البند *</span><select name="kind" id="manuKind">' +
              '<option value="store">تشوين (بدون شغلانة)</option>' +
              '<option value="work">شغلانة</option>' +
            '</select></label>' +
            '<label class="field"><span>العامل / بيان المصنعية *</span><input type="text" name="worker" required placeholder="مثال: عمال نجارة — محمد" /></label>' +
          '</div>' +
          '<div class="form__row form__row--3">' +
            '<label class="field" id="manuWorkWrap" hidden><span>الشغلانة *</span><select name="work" id="manuWork"></select></label>' +
            '<label class="field"><span>المبلغ *</span><input type="number" name="amount" min="0" step="any" required placeholder="0" /></label>' +
            '<label class="field"><span>ملاحظة (اختياري)</span><input type="text" name="note" placeholder="تفاصيل العمل أو عدد العمال…" /></label>' +
          '</div>' +
          '<p class="form__error" id="manuError" hidden></p>' +
          '<p class="field__hint" id="manuWorksHint" hidden></p>' +
          '<div class="form__actions"><button type="submit" class="btn btn--primary btn--sm"><svg viewBox="0 0 24 24" class="ico"><use href="#ic-plus"/></svg> إضافة مصنعية</button></div>' +
        '</form>' +
        '<div class="manu-works" id="manuWorks" hidden></div>' +
        '<div class="table-wrap" style="margin-top:16px"><table class="table" id="manuTable">' +
          '<thead><tr><th>#</th><th>التاريخ</th><th>النوع / الشغلانة</th><th>العامل / البيان</th><th>المبلغ</th><th>ملاحظة</th><th style="width:64px"><span class="sr-only">حذف</span></th></tr></thead>' +
          '<tbody></tbody>' +
        '</table></div>' +
      '</div>';
    sendPanel.insertAdjacentHTML('afterend', html);
  }

  function getCustomer() {
    var a = app();
    if (!a || !a.getCurrentCustomer) return null;
    try { return a.getCurrentCustomer(); } catch (e) { return null; }
  }

  /* تعبئة قائمة الشغلانات بشغلانات العميل الحالي */
  function fillWorkSelect(c) {
    var sel = document.getElementById('manuWork');
    var hint = document.getElementById('manuWorksHint');
    if (!sel) return;
    var prev = sel.value;
    var works = customerWorks(c);
    sel.innerHTML = '<option value="">— اختر الشغلانة —</option>' + works.map(function (w) {
      return '<option value="' + esc(w) + '">' + esc(w) + '</option>';
    }).join('');
    if (works.indexOf(prev) >= 0) sel.value = prev;
    if (hint) {
      hint.hidden = works.length > 0;
      hint.textContent = works.length ? '' :
        'مفيش شغلانات مسجّلة للعميل ده — سجّل شغلانة في «المرسل» الأول، أو اختار «تشوين».';
    }
  }

  function syncKind() {
    var kindEl = document.getElementById('manuKind');
    var wrap = document.getElementById('manuWorkWrap');
    if (!kindEl || !wrap) return;
    wrap.hidden = kindEl.value !== 'work';
  }

  function render() {
    var box = document.getElementById('manufacturingPanel');
    var c = getCustomer();
    if (!box) return;
    if (!c) { box.hidden = true; return; }
    box.hidden = false;
    var a = app() || {};
    var fmtMoney = a.money || money;
    var fmtDate = function (v) { return v ? String(v).split('-').reverse().join('/') : '—'; };
    var d = { paidByUs: Number(c.paidByUs || 0), manuTotal: 0, sendBal: Number(c.paidByUs || 0) };
    if (a.deriveCustomer) {
      try { d = a.deriveCustomer(c) || d; } catch (e) {}
    }
    var bal = d.sendBal;
    if (a.profileSendBal) {
      try { bal = a.profileSendBal(c); } catch (e) {}
    }
    var manu = Array.isArray(c.manufacturing) ? c.manufacturing.slice() : [];
    var total = 0;
    manu.forEach(function (m) { total += Number(m.amount || 0); });
    var workers = {};
    manu.forEach(function (m) { var k = String(m.worker || '').trim(); if (k) workers[k] = 1; });

    var sum = document.getElementById('manuSummary');
    if (sum) {
      sum.innerHTML =
        '<div class="summary__box"><small>المبلغ المدفوع منا للعميل</small><b>' + fmtMoney(d.paidByUs) + '</b><span>الرصيد الأصلي</span></div>' +
        '<div class="summary__box summary__box--out"><small>إجمالي المصنعية والعمال</small><b>' + fmtMoney(total) + '</b><span>' + manu.length + ' بند</span></div>' +
        '<div class="summary__box summary__box--in"><small>المتبقي بعد المرسل والمصنعية</small><b>' + fmtMoney(bal) + '</b><span>قابل للاستهلاك</span></div>' +
        '<div class="summary__box summary__box--net"><small>عمال مسجّلون</small><b>' + Object.keys(workers).length + '</b><span>أسماء مختلفة</span></div>';
    }

    /* توزيع الأجور على الشغلانات + إجمالي التشوين */
    var workBox = document.getElementById('manuWorks');
    if (workBox) {
      var groups = {}, order = [], storeSum = 0, storeN = 0;
      manu.forEach(function (m) {
        var amt = Number(m.amount || 0);
        if (kindOf(m) === 'work') {
          var w = String(m.work).trim();
          if (!groups[w]) { groups[w] = { total: 0, count: 0 }; order.push(w); }
          groups[w].total += amt;
          groups[w].count++;
        } else {
          storeSum += amt;
          storeN++;
        }
      });
      var chips = order.map(function (w) {
        return '<div class="manu-works__chip"><b>' + esc(w) + '</b><span>' +
          esc(fmtMoney(groups[w].total)) + ' — ' + groups[w].count + ' بند</span></div>';
      });
      if (storeN) {
        chips.push('<div class="manu-works__chip manu-works__chip--store"><b>تشوين (بدون شغلانة)</b><span>' +
          esc(fmtMoney(storeSum)) + ' — ' + storeN + ' بند</span></div>');
      }
      workBox.innerHTML = chips.length
        ? '<small class="manu-works__head">توزيع الأجور على الشغلانات</small><div class="manu-works__list">' + chips.join('') + '</div>'
        : '';
      workBox.hidden = !chips.length;
    }

    var tbody = $('#manuTable tbody');
    if (tbody) {
      var rows = manu.slice().sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || ''));
      }).map(function (m, i) {
        var kind = kindOf(m);
        var kindCell = kind === 'work'
          ? '<span class="manu-tag manu-tag--work">شغلانة: ' + esc(m.work) + '</span>'
          : '<span class="manu-tag manu-tag--store">تشوين</span>';
        return '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + esc(fmtDate(m.date)) + '</td>' +
          '<td>' + kindCell + '</td>' +
          '<td>' + esc(m.worker || '—') + '</td>' +
          '<td class="amount neg">' + esc(fmtMoney(m.amount)) + '</td>' +
          '<td>' + esc(m.note || '—') + '</td>' +
          '<td class="col-cell"><button type="button" class="btn btn--ghost btn--sm btn--danger" data-manu-del="' + esc(m.id) + '">حذف</button></td>' +
        '</tr>';
      }).join('');
      tbody.innerHTML = rows || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:22px">لا توجد مصنعية مسجّلة لهذا العميل بعد.</td></tr>';
    }
    var form = document.getElementById('manuForm');
    if (form && !form.elements.date.value) form.elements.date.value = todayISO();
    fillWorkSelect(c);
    syncKind();
  }

  function saveCustomer(c) {
    var a = app();
    if (!a || !a.getCustomers || !a.saveCustomers) return false;
    var list = a.getCustomers();
    var idx = a.getCurrentIdx ? a.getCurrentIdx() : -1;
    if (idx < 0 || idx >= list.length) return false;
    list[idx] = c;
    a.saveCustomers(list);
    return true;
  }

  function bind() {
    var box = document.getElementById('manufacturingPanel');
    if (!box) return;

    box.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'manuKind') syncKind();
    });

    box.addEventListener('submit', function (ev) {
      if (!ev.target || ev.target.id !== 'manuForm') return;
      ev.preventDefault();
      var c = getCustomer();
      if (!c) return;
      var f = ev.target.elements;
      var date = String(f.date.value || '');
      var kind = String((f.kind && f.kind.value) || 'store') === 'work' ? 'work' : 'store';
      var work = kind === 'work' ? String((f.work && f.work.value) || '').trim() : '';
      var worker = String(f.worker.value || '').trim();
      var amount = parseFloat(f.amount.value) || 0;
      var err = document.getElementById('manuError');
      var fail = function (m) { if (err) { err.textContent = m; err.hidden = false; } };
      if (!date) return fail('التاريخ مطلوب');
      if (!worker) return fail('اسم العامل أو بيان المصنعية مطلوب');
      if (kind === 'work' && !work) return fail('اختر الشغلانة اللي هتتسجّل عندها الأجرة، أو حوّل النوع لـ«تشوين»');
      if (!(amount > 0)) return fail('المبلغ يجب أن يكون أكبر من صفر');
      if (!Array.isArray(c.manufacturing)) c.manufacturing = [];
      c.manufacturing.push({
        id: uid(),
        date: date,
        kind: kind,
        work: work,
        worker: worker,
        amount: amount,
        note: String(f.note.value || '').trim()
      });
      if (err) err.hidden = true;
      if (!saveCustomer(c)) return fail('تعذّر حفظ البيانات — أعد فتح ملف العميل');
      f.worker.value = '';
      f.amount.value = '';
      f.note.value = '';
      f.date.value = todayISO();
      var a = app();
      if (a && a.refreshProfile) a.refreshProfile();
      if (a && a.toast) a.toast(work
        ? 'تمت إضافة المصنعية على شغلانة «' + work + '» ✓'
        : 'تمت إضافة المصنعية (تشوين) — اتخصمت من المبلغ المدفوع منا للعميل ✓');
    });

    box.addEventListener('click', function (ev) {
      var del = ev.target && ev.target.closest ? ev.target.closest('[data-manu-del]') : null;
      if (!del) return;
      var c = getCustomer();
      if (!c) return;
      var id = del.getAttribute('data-manu-del');
      var item = (c.manufacturing || []).filter(function (m) { return m.id === id; })[0];
      if (!item) return;
      if (!root.confirm('حذف بند المصنعية «' + (item.worker || '') + '» وإرجاع المبلغ للرصيد؟')) return;
      c.manufacturing = (c.manufacturing || []).filter(function (m) { return m.id !== id; });
      if (!saveCustomer(c)) return;
      var a = app();
      if (a && a.refreshProfile) a.refreshProfile();
      if (a && a.toast) a.toast('تم حذف المصنعية وإرجاع المبلغ للرصيد');
    });
  }

  function start() {
    inject();
    bind();
    render();
  }

  document.addEventListener('nizam:profile-rendered', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  root.CustomerExtra = { render: render, customerWorks: customerWorks };
})(typeof window !== 'undefined' ? window : this);
