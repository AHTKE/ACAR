/* ============================================================
   patch-partner.js — بروفايل الشريك (تعديل/حذف/تصدير) + النسبة
                    غير الإجبارية + إثراء تقرير الجمعيات
   يشغّل: node patch-partner.js
   ============================================================ */
'use strict';
const fs = require('fs');
const FILE = 'app.js';
let src = fs.readFileSync(FILE, 'utf8');
let count = 0;

function rep(oldStr, newStr, label) {
  const i = src.indexOf(oldStr);
  if (i < 0) throw new Error('✗ لم يُعثر على المرساة: ' + (label || oldStr.slice(0, 60)));
  if (src.indexOf(oldStr, i + 1) >= 0) throw new Error('✗ المرساة مكررة: ' + (label || oldStr.slice(0, 60)));
  src = src.slice(0, i) + newStr + src.slice(i + oldStr.length);
  count++;
}

/* 1) النسبة غير إجبارية: ما تلوّش تحذير دائمة عندما يكون فيها شركاء بلا نسبة */
rep(`      var sharesOk = Math.abs(t.share - 100) < 0.001;
      pill.textContent = sharesOk ? 'مجموع الحصص 100%' : ('مجموع الحصص ' + money(t.share) + '% — لازم 100%');
      pill.className = 'count-pill ' + (sharesOk ? 'count-pill--ok' : 'count-pill--warn');`,
`      var withShare = getPartners().filter(function (p) { return Number(p.share) > 0; }).length;
      var noShare = getPartners().length - withShare;
      var over = t.share > 100.0001;
      var incomplete = noShare === 0 && Math.abs(t.share - 100) >= 0.001;
      var sharesOk = !over && !incomplete;
      pill.textContent = over ? ('مجموع الحصص ' + money(t.share) + '% — تجاوز 100%')
        : (incomplete ? ('مجموع الحصص ' + money(t.share) + '% — لازم 100%')
        : (noShare ? ('مجموع الحصص المحدَّدة ' + money(t.share) + '% — الحصة اختيارية') : 'مجموع الحصص 100%'));
      pill.className = 'count-pill ' + (sharesOk ? 'count-pill--ok' : 'count-pill--warn');`, 'sharePill');

/* 2) بروفايل الشريك: تصدير + تعديل + حذف */
rep(`  var pfpForm = $('#pfpForm');`,
`  function partnerProfileReport(p) {
    var d = derivePartner(p);
    var profits = p.profits || [];
    var profitSum = 0;
    profits.forEach(function (f) { profitSum += Number(f.amount || 0); });
    var base = [
      ['اسم الشريك', p.name || ''],
      ['الصفة', p.role || ''],
      ['الحصة %', d.share],
      ['رأس المال (المستثمر)', d.capital],
      ['نصيبه من أرباح السنة', d.cut],
      ['المسحوبات', d.withdrawals],
      ['الصافي المستحق', d.net],
      ['أرباح مسجّلة يدوياً', profitSum],
      ['ملاحظات', p.note || '']
    ];
    base.push(['', '']);
    base.push(['سجل الأرباح (التاريخ — المبلغ)', '']);
    profits.forEach(function (f) { base.push([formatDate(f.date), Number(f.amount || 0)]); });
    return {
      title: 'بروفايل شريك: ' + (p.name || ''),
      subtitle: (p.role || 'شريك') + ' — صافي أرباح السنة ' + money(getPartnerProfit()),
      columns: ['البند', 'القيمة'],
      moneyCols: [1],
      totalRow: false,
      rows: base,
      summary: [
        { label: 'رأس المال', value: money(d.capital) },
        { label: 'الحصة', value: money(d.share) + '%' },
        { label: 'المسحوبات', value: money(d.withdrawals) },
        { label: 'الصافي المستحق', value: money(d.net) }
      ]
    };
  }

  function partnerProfileSheets(p) {
    var d = derivePartner(p);
    var profits = p.profits || [];
    var profitSum = 0;
    profits.forEach(function (f) { profitSum += Number(f.amount || 0); });
    var info = [
      ['البيان', 'القيمة'],
      ['اسم الشريك', p.name || ''],
      ['الصفة', p.role || ''],
      ['الحصة %', d.share],
      ['ملاحظات', p.note || '']
    ];
    var moneyRows = [
      ['البند', 'المبلغ'],
      ['رأس المال (المستثمر)', d.capital],
      ['صافي أرباح السنة (الشركة)', getPartnerProfit()],
      ['نصيبه من الأرباح', d.cut],
      ['أرباح مسجّلة يدوياً', profitSum],
      ['المسحوبات', d.withdrawals],
      ['الصافي المستحق', d.net]
    ];
    var prof = [['التاريخ', 'الربح', 'ملاحظة']];
    profits.forEach(function (f) {
      prof.push([formatDate(f.date), Number(f.amount || 0), f.note || '']);
    });
    return [
      { name: 'البيانات', title: 'بيانات الشريك', subtitle: p.name || '', rows: info, widths: [34, 46] },
      { name: 'الملخص المالي', title: 'الملخص المالي', subtitle: p.name || '', rows: moneyRows, widths: [44, 24], moneyCols: [1], totalRow: false },
      { name: 'الأرباح', title: 'سجل الأرباح', subtitle: p.name || '', rows: prof, widths: [22, 22, 40], moneyCols: [1], totalRow: false }
    ];
  }

  var pfpExcelBtn = $('#pfpExcelBtn');
  if (pfpExcelBtn) pfpExcelBtn.addEventListener('click', function () {
    var p = getPartners()[currentPartnerIdx];
    if (!p) { toast('الشريك غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    try {
      var bytes = ExportKit.buildXlsx(partnerProfileSheets(p));
      openExportModal('partner-' + safeFileName(p.name) + '-' + exportStamp() + '.xlsx', MIME_XLSX, bytes);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  var pfpPdfBtn = $('#pfpPdfBtn');
  if (pfpPdfBtn) pfpPdfBtn.addEventListener('click', function () {
    var p = getPartners()[currentPartnerIdx];
    if (!p) { toast('الشريك غير موجود', true); return; }
    if (typeof ExportKit === 'undefined') { toast('محرك التصدير غير محمّل', true); return; }
    if (!ExportKit.hasCanvas()) { toast('تصدير PDF يحتاج متصفحاً حقيقياً', true); return; }
    try {
      var pdf = ExportKit.reportToPdf(partnerProfileReport(p));
      if (!pdf) { toast('تعذّر إنشاء ملف PDF', true); return; }
      openExportModal('partner-' + safeFileName(p.name) + '-' + exportStamp() + '.pdf', MIME_PDF, pdf);
    } catch (e) { toast('خطأ في التصدير: ' + (e && e.message ? e.message : e), true); }
  });

  var pfpEditBtn = $('#pfpEditBtn');
  if (pfpEditBtn) pfpEditBtn.addEventListener('click', function () {
    var p = getPartners()[currentPartnerIdx];
    if (!p) return;
    openConfirm({
      title: 'تعديل بيانات الشريك',
      message: 'هل أنت متأكد من أنك تريد تعديل بيانات الشريك «' + (p.name || '') + '»؟',
      yes: 'نعم، تعديل', no: 'تراجع',
      onYes: function () {
        startEditPartner(currentPartnerIdx);
        showView('partners');
      }
    });
  });

  var pfpDeleteBtn = $('#pfpDeleteBtn');
  if (pfpDeleteBtn) pfpDeleteBtn.addEventListener('click', function () {
    var p = getPartners()[currentPartnerIdx];
    if (!p) return;
    openConfirm({
      title: 'حذف الشريك',
      message: 'هل تريد حذف الشريك «' + (p.name || '') + '»؟ الحذف نهائي — سيُطلب كلمة المرور.',
      yes: 'نعم، حذف نهائي', no: 'تراجع', password: true,
      onYes: function () {
        var list = getPartners();
        var target = list[currentPartnerIdx];
        if (!target) { toast('الشريك غير موجود', true); return; }
        var name = target.name || '';
        list.splice(currentPartnerIdx, 1);
        savePartners(list);
        renderPartners();
        showView('partners');
        toast('تم حذف الشريك «' + name + '»');
      }
    });
  });

  var pfpForm = $('#pfpForm');`, 'partnerProfile');

/* 3) تقرير الجمعيات: موعد القبض + الحصيلة + يوم القبض */
rep(`      rows.push([i + 1, m.assoc || '', m.name || '', m.type || '', d.fee, d.paid, d.rest, d.status, m.note || '']);
    });
    return {
      title: 'الجمعيات',
      subtitle: 'عدد الجمعيات: ' + getAssociations().length + ' — عدد الأعضاء: ' + members.length,
      columns: ['#', 'الجمعية', 'العضو', 'نوع الاشتراك', 'المستحق', 'المدفوع', 'المتبقي', 'الحالة', 'ملاحظة'],
      moneyCols: [4, 5, 6],`,
`      var turn = memberTurnMonth(i);
      var asc = assocByName(m.assoc);
      rows.push([i + 1, m.assoc || '', m.name || '', m.type || '', d.fee, d.paid, d.rest, d.status,
        turn ? monthLabel(turn) : '—',
        asc ? assocPot(asc) : 0,
        asc ? ('يوم ' + assocPayoutDay(asc) + ' من كل شهر') : '—',
        m.note || '']);
    });
    return {
      title: 'الجمعيات',
      subtitle: 'عدد الجمعيات: ' + getAssociations().length + ' — عدد الأعضاء: ' + members.length,
      columns: ['#', 'الجمعية', 'العضو', 'نوع الاشتراك', 'المستحق', 'المدفوع', 'المتبقي', 'الحالة',
        'موعد قبضه', 'الحصيلة الشهرية', 'يوم القبض', 'ملاحظة'],
      moneyCols: [4, 5, 6, 9],`, 'reportAssociations');

fs.writeFileSync(FILE, src);
console.log('✓ ' + FILE + ' — ' + count + ' تعديل');
