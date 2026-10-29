/* توليد ملفات تصدير حقيقية (Excel/PDF) للتحقق من التنسيق + صور معاينة */
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

global.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(1, 1);
    return {};
  }
};

const Kit = require('./export.js');

const report = {
  title: 'العملاء',
  subtitle: 'عدد العملاء: 5 — تقرير مفصّل',
  columns: ['#', 'اسم العميل', 'الهاتف', 'العنوان', 'الحالة', 'الإجمالي', 'المقدم', 'المطلوب', 'المدفوع', 'المتبقي'],
  moneyCols: [5, 6, 7, 8, 9],
  rows: [
    [1, 'أحمد محمد علي', '0770123456', 'بغداد / الكرادة', 'جاري العمل', 300000, 50000, 250000, 100000, 150000],
    [2, 'شركة النور التجارية', '0781234567', 'بغداد / المنصور', 'مستلم', 1200000, 200000, 1000000, 800000, 200000],
    [3, 'سالم عبدالله جاسم', '0750987654', 'البصرة / العشار', 'جاري العمل', 900000, 0, 900000, 300000, 600000],
    [4, 'فاطمة حسن مهدي', '0771456789', 'النجف / الحويش', 'مستلم', 450000, 100000, 350000, 350000, 0],
    [5, 'مؤسسة الأمل', '0782345678', 'كربلاء / المركز', 'جاري العمل', 2100000, 100000, 2000000, 500000, 1500000]
  ],
  summary: [
    { label: 'عدد العملاء', value: '5' },
    { label: 'الإجمالي', value: '4,950,000' },
    { label: 'المدفوع', value: '2,050,000' },
    { label: 'المتبقي', value: '2,450,000' }
  ]
};

function widths(rep) {
  return rep.columns.map((label, i) => {
    let max = String(label).length;
    rep.rows.forEach((r) => {
      const v = r[i];
      const s = typeof v === 'number' ? v.toLocaleString('en-US') : String(v == null ? '' : v);
      if (s.length > max) max = s.length;
    });
    return Math.max(14, Math.round(max * 2) + 6);
  });
}

const sheet = {
  name: report.title,
  title: report.title,
  subtitle: report.subtitle,
  columns: report.columns,
  rows: report.rows,
  widths: widths(report),
  moneyCols: report.moneyCols,
  summary: report.summary,
  totalRow: true
};

const ledgerSheet = {
  name: 'الدواخل والخوارج',
  title: 'الدواخل والخوارج',
  subtitle: 'عدد الحركات: 3',
  columns: ['#', 'التاريخ', 'البيان', 'النوع', 'المبلغ', 'ملاحظة'],
  moneyCols: [4],
  rows: [
    [1, '29/10/2026', 'تحصيل من العميل: أحمد محمد علي', 'دخل', 250000, ''],
    [2, '29/10/2026', 'دفعة للمورد: مخازن الفرات', 'خرج', 120000, 'دفعة أولى'],
    [3, '28/10/2026', 'إيجار المخزن', 'خرج', 300000, 'شهري']
  ],
  widths: [8, 16, 44, 12, 16, 24],
  summary: [
    { label: 'الداخلات', value: '250,000' },
    { label: 'الخوارج', value: '420,000' },
    { label: 'الرصيد الصافي', value: '-170,000' }
  ],
  totalRow: true
};

const legacySheet = {
  name: 'بيانات المورد',
  title: 'بيانات المورد',
  subtitle: 'مؤسسة النور للتوريد',
  rows: [
    ['البيان', 'القيمة'],
    ['اسم المورد', 'مؤسسة النور للتوريد'],
    ['المهنة', 'مواد بناء'],
    ['رقم التلفون', '07701112233'],
    ['عدد الحركات', 3]
  ],
  widths: [30, 46]
};

const xlsx = Kit.buildXlsx([sheet, ledgerSheet, legacySheet]);
fs.writeFileSync('/tmp/export-verify.xlsx', Buffer.from(xlsx));
console.log('xlsx bytes:', xlsx.length);

const pdf = Kit.reportToPdf(report);
if (!pdf) { console.error('PDF FAILED'); process.exit(1); }
fs.writeFileSync('/tmp/export-verify.pdf', Buffer.from(pdf));
console.log('pdf bytes:', pdf.length, 'header:', Buffer.from(pdf.slice(0, 5)).toString());

const pages = Kit.drawReportPages(report);
fs.mkdirSync('artifacts', { recursive: true });
pages.forEach((cv, i) => {
  const p = path.join('artifacts', 'pdf-page-' + (i + 1) + '.png');
  fs.writeFileSync(p, cv.toBuffer('image/png'));
  console.log('page', i + 1, cv.width + 'x' + cv.height, '→', p);
});

/* تقرير كبير لاختبار تعدد الصفحات */
const big = {
  title: 'الدواخل والخوارج',
  subtitle: 'عدد الحركات: 120',
  columns: ['#', 'التاريخ', 'البيان', 'النوع', 'المبلغ', 'ملاحظة'],
  moneyCols: [4],
  rows: Array.from({ length: 120 }, (_, i) => [
    i + 1, '2' + (i % 9) + '/10/2026', 'حركة مالية رقم ' + (i + 1) + ' — بيان تفصيلي',
    i % 2 ? 'خرج' : 'دخل', 1000 * (i + 1), i % 3 ? '' : 'ملاحظة'
  ]),
  summary: [
    { label: 'الداخلات', value: '3,600,000' },
    { label: 'الخوارج', value: '3,660,000' },
    { label: 'الصافي', value: '-60,000' }
  ]
};
const bigPages = Kit.drawReportPages(big);
console.log('big pdf pages:', bigPages.length);
bigPages.forEach((cv, i) => {
  fs.writeFileSync(path.join('artifacts', 'pdf-big-' + (i + 1) + '.png'), cv.toBuffer('image/png'));
});
