/* اختبار تنسيق التصدير: يتحقق أن Excel/PDF منسّقان فعلاً (ألوان، رأس، إجمالي، ملخص، ترقيم صفحات) */
const fs = require('fs');
const { createCanvas } = require('canvas');

global.document = {
  createElement(tag) {
    return tag === 'canvas' ? createCanvas(1, 1) : {};
  }
};

const Kit = require('./export.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};

const report = {
  title: 'العملاء',
  subtitle: 'عدد العملاء: 5',
  columns: ['#', 'اسم العميل', 'الهاتف', 'الإجمالي', 'المدفوع', 'المتبقي'],
  moneyCols: [3, 4, 5],
  rows: [
    [1, 'أحمد محمد علي', '0770123456', 300000, 100000, 200000],
    [2, 'شركة النور', '0781234567', 1200000, 800000, 400000]
  ],
  summary: [
    { label: 'عدد العملاء', value: '5' },
    { label: 'الإجمالي', value: '1,500,000' }
  ]
};

const sheet = {
  name: 'العملاء', title: 'العملاء', subtitle: 'عدد العملاء: 5',
  columns: report.columns, rows: report.rows, moneyCols: report.moneyCols,
  summary: report.summary, totalRow: true, widths: [6, 24, 18, 16, 16, 16]
};

const legacy = {
  name: 'بيانات المورد',
  title: 'بيانات المورد',
  rows: [['البيان', 'القيمة'], ['اسم المورد', 'مؤسسة النور'], ['عدد الحركات', 3]],
  widths: [28, 40]
};

console.log('\n[1] بناء Excel');
const bytes = Kit.buildXlsx([sheet, legacy]);
const raw = Buffer.from(bytes).toString('utf8');
ok('ملف xlsx بتوقيع ZIP', bytes[0] === 0x50 && bytes[1] === 0x4B);
ok('فيه ورقتان', (raw.match(/xl\/worksheets\/sheet\d+\.xml/g) || []).length >= 2);
ok('رأس ملوّن (تعبئة صلبة)', raw.indexOf('patternFill patternType="solid"') > -1);
ok('لون الهوية في التنسيق', raw.indexOf('FF4F46E5') > -1);
ok('تنسيق أرقام مالي', raw.indexOf('numFmtId="4"') > -1);
ok('اتجاه الورقة RTL', raw.indexOf('rightToLeft="1"') > -1);
ok('تثبيت صف الرأس (freeze)', raw.indexOf('state="frozen"') > -1);
ok('فلتر تلقائي على الرأس', raw.indexOf('<autoFilter ref=') > -1);
ok('عناوين مدمجة (merge)', raw.indexOf('<mergeCell ref="A1:') > -1);
ok('صف الإجمالي موجود', raw.indexOf('>الإجمالي</t>') > -1);
ok('قيم الإجمالي محسوبة', raw.indexOf('<v>1500000</v>') > -1, 'sum=1500000');
ok('بطاقات الملخص في الورقة', raw.indexOf('ملخّص التقرير') > -1);
ok('ألوان صفوف متبادلة', raw.indexOf('FFF8FAFC') > -1);
ok('حجم معقول', bytes.length > 3000, 'len=' + bytes.length);

console.log('\n[2] توافق الأوراق القديمة (بدون columns)');
ok('أول صف اعتُبر رأساً ملوّناً', (raw.match(/s="3"/g) || []).length >= 2);
ok('الأرقام غير المالية بتنسيق عادي', raw.indexOf('numFmtId="0"') > -1);

console.log('\n[3] بناء PDF منسّق');
const pages = Kit.drawReportPages(report);
ok('توليد صفحات', Array.isArray(pages) && pages.length === 1, pages && pages.length);
ok('أبعاد الصفحة منطقية', pages[0].width >= 1240 && pages[0].height === 1755,
   pages[0].width + 'x' + pages[0].height);

const png = pages[0].toBuffer('image/png');
ok('صفحة PDF مرسومة فعلياً', png.length > 20000, 'png=' + png.length);

const pdf = Kit.reportToPdf(report);
const praw = Buffer.from(pdf).toString('latin1');
ok('ملف PDF صحيح', praw.slice(0, 5) === '%PDF-');
ok('الصفحة صورة JPEG (DCTDecode)', praw.indexOf('/DCTDecode') > -1);
ok('يحتوي فهرس xref', praw.indexOf('xref') > -1 && praw.indexOf('%%EOF') > -1);

console.log('\n[4] تقرير كبير → صفحات متعددة بترقيم');
const big = {
  title: 'الدواخل والخوارج',
  subtitle: 'عدد الحركات: 90',
  columns: ['#', 'التاريخ', 'البيان', 'النوع', 'المبلغ'],
  moneyCols: [4],
  rows: Array.from({ length: 90 }, (_, i) => [i + 1, '2' + (i % 9) + '/10/2026', 'حركة رقم ' + (i + 1), i % 2 ? 'خرج' : 'دخل', 1000 * (i + 1)]),
  summary: [{ label: 'الصافي', value: '100,000' }]
};
const bigPages = Kit.drawReportPages(big);
ok('أكثر من صفحة واحدة', bigPages.length >= 3, 'pages=' + bigPages.length);
const bigPdf = Kit.reportToPdf(big);
ok('PDF متعدد الصفحات', Buffer.from(bigPdf).toString('latin1').indexOf('/Count ' + bigPages.length) > -1);

console.log('\n[5] تقرير فارغ لا ينهار');
const empty = Kit.drawReportPages({ title: 'فارغ', columns: ['أ', 'ب'], rows: [] });
ok('صفحة واحدة للفارغ', Array.isArray(empty) && empty.length === 1);
ok('PDF للفارغ', !!Kit.reportToPdf({ title: 'فارغ', columns: ['أ'], rows: [] }));

console.log('\n========================================');
console.log('  PASS: ' + pass + '   FAIL: ' + fail);
console.log('========================================');
process.exit(fail ? 1 : 0);
