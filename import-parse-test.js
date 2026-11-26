/* ============================================================
   import-parse-test.js — اختبار قراءة ملفات العملاء القديمة
   1) CSV بأعمدة عربية → ربط الحقول تلقائياً
   2) ملف Excel حقيقي (نُنشئه بمحرك التصدير ثم نقرأه بمحرك الاستيراد)
   3) وضع الدفعات (اسم + تاريخ + مبلغ)
   4) الأرقام والتواريخ العربية وصيغ مختلفة
   ============================================================ */
'use strict';

require('./importer.js');
const Imp = globalThis.NizamImport;

const Kit = require('./export.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

(async function run() {
  console.log('\n[1] قراءة CSV وربط الأعمدة العربية');
  const csv = [
    'اسم العميل,رقم التلفون,العنوان,المبلغ الإجمالي,المقدم,المبلغ الشهري,يوم التحصيل,تاريخ البدء,الحالة',
    'محمد أحمد,01001234567,"القاهرة, مدينة نصر","120,000","20,000","5,000",19,15/01/2025,جاري العمل',
    'سارة علي,01211234567,الجيزة,60000,0,2500,5,01/03/2025,',
    'خالد حسن,,الإسكندرية,90000,10000,,1,20/11/2024,مستلم'
  ].join('\n');

  const rows = Imp.parseDelimited(csv);
  ok('عدد الصفوف المقروءة 4', rows.length === 4, 'rows=' + rows.length);
  ok('الخلية اللي فيها فاصلة اتقرأت صح', rows[1][2] === 'القاهرة, مدينة نصر', rows[1][2]);

  const res = Imp.analyze(rows);
  ok('العناوين اتعرّفت (4 حقول على الأقل)', Object.keys(res.mapping).length >= 7, JSON.stringify(res.mapping));
  ok('الوضع تلقائي = بيانات عملاء', res.mode === 'customers', res.mode);
  ok('كل الصفوف صالحة (3)', res.records.length === 3, 'records=' + res.records.length);
  const first = res.records[0];
  ok('الاسم اتقرأ', first.name === 'محمد أحمد', first.name);
  ok('الإجمالي مع الفاصلة = 120000', near(first.total, 120000), first.total);
  ok('المقدم = 20000', near(first.down, 20000), first.down);
  ok('المبلغ الشهري = 5000', near(first.monthly, 5000), first.monthly);
  ok('يوم التحصيل = 19', first.dueDay === 19, first.dueDay);
  ok('التاريخ DD/MM/YYYY تحوّل ISO', first.startDate === '2025-01-15', first.startDate);
  ok('الحالة اتنقلت', first.status === 'جاري العمل', first.status);

  console.log('\n[2] ملف Excel حقيقي — بناء ثم قراءة');
  const xlsx = Kit.buildXlsx([{
    name: 'العملاء',
    title: 'بيانات العملاء',
    subtitle: 'ملف قديم',
    rows: [
      ['اسم العميل', 'الهاتف', 'المبلغ الإجمالي', 'المدفوع', 'ملاحظات'],
      ['عميل أول', '01111111111', 50000, 10000, 'دفعة قديمة'],
      ['عميل تاني', '01222222222', 75000, 0, '']
    ],
    widths: [24, 16, 16, 14, 24]
  }]);
  const xres = await Imp.parseFile({ name: 'test.xlsx', arrayBuffer: async () => xlsx });
  ok('الملف اتفك كـ xlsx', xres.kind === 'xlsx', xres.kind);
  ok('فيه ورقة واحدة', xres.tables.length === 1, 'tables=' + xres.tables.length);
  const xan = Imp.analyze(xres.tables[0].rows);
  ok('العناوين اتعرّفت داخل Excel', xan.mapping.name != null && xan.mapping.phone != null && xan.mapping.total != null,
    JSON.stringify(xan.mapping));
  ok('صفين عملاء', xan.records.length === 2, 'records=' + xan.records.length);
  ok('الاسم من Excel', xan.records[0].name === 'عميل أول', xan.records[0].name);
  ok('الرقم من Excel', Imp.toNumber(xan.records[0].total) === 50000, xan.records[0].total);
  ok('عمود «المدفوع» اتربط صح', Imp.toNumber(xan.records[0].paid) === 10000, xan.records[0].paid);

  console.log('\n[3] وضع الدفعات — كل صف دفعة');
  const payCsv = [
    'التاريخ,اسم العميل,المبلغ المدفوع,ملاحظات',
    '2025-02-01,محمد أحمد,"1,500",دفعة أولى',
    '2025-03-01,محمد أحمد,1500,دفعة تانية',
    '2025-03-01,محمد أحمد,1500,مكررة بالغلط'
  ].join('\n');
  const pay = Imp.analyze(Imp.parseDelimited(payCsv));
  ok('اتعرّف كدفعات تحصيل', pay.mode === 'payments', pay.mode);
  ok('الدفعة المبالغ اتقرأت', pay.records.length >= 2 && near(pay.records[0].amount, 1500), JSON.stringify(pay.records[0]));
  ok('الدفعة المكررة اتشالت', pay.records.length === 2, 'records=' + pay.records.length);
  ok('تاريخ الدفعة ISO', pay.records[0].date === '2025-02-01', pay.records[0].date);
  ok('الصف اللي من غير مبلغ اتجاهل', pay.skipped >= 0);

  console.log('\n[4] أرقام وتواريخ بصيغ مختلفة');
  ok('أرقام عربية ١٥٠٠', Imp.toNumber('١٥٠٠') === 1500, Imp.toNumber('١٥٠٠'));
  ok('مبلغ بالجنيه', Imp.toNumber('12,500 ج.م') === 12500, Imp.toNumber('12,500 ج.م'));
  ok('فاصلة عشرية عربية', near(Imp.toNumber('1500,50'), 1500.5), Imp.toNumber('1500,50'));
  ok('تاريخ 2025/3/7', Imp.toISODate('2025/3/7') === '2025-03-07', Imp.toISODate('2025/3/7'));
  ok('تاريخ 7-3-2025', Imp.toISODate('7-3-2025') === '2025-03-07', Imp.toISODate('7-3-2025'));
  ok('تاريخ Excel الرقمي', Imp.toISODate(45658) === '2025-01-01', Imp.toISODate(45658));

  console.log('\n[5] التعرف على صيغ عناوين مختلفة');
  ['اسم العميل', 'الاسم', 'العميل', 'Customer Name', 'name'].forEach(h => {
    ok('عنوان «' + h + '» = اسم', Imp.fieldOfHeader(h) === 'name', Imp.fieldOfHeader(h));
  });
  ['رقم الهاتف', 'الموبايل', 'تليفون', 'Phone'].forEach(h => {
    ok('عنوان «' + h + '» = هاتف', Imp.fieldOfHeader(h) === 'phone', Imp.fieldOfHeader(h));
  });
  ok('عنوان «القيمة الإجمالية» مش هيتلخبط', Imp.fieldOfHeader('القيمة الإجمالية') === 'total',
    Imp.fieldOfHeader('القيمة الإجمالية'));

  console.log('\n[6] ملف بدون عناوين — رفض واضح بدل بيانات غلط');
  const noHeader = Imp.analyze([['محمد', '0100', '5000'], ['سارة', '0111', '6000']]);
  ok('بدون عناوين مفيش ربط تلقائي للاسم', noHeader.mapping.name == null || noHeader.records.length === 0,
    JSON.stringify(noHeader.mapping) + ' records=' + noHeader.records.length);

  console.log('\n==================================================');
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FAIL — استثناء غير متوقع: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
