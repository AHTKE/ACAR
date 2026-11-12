/* بيانات اختبار فقط — التطبيق يبدأ بدون أي بيانات افتراضية.
   الاختبارات كانت تعتمد على البيانات الافتراضية القديمة داخل app.js،
   فبنحقن نفس البيانات هنا محليًا حتى تظل التغطية كما هي. */
'use strict';

const DEMO = {
  customers: [
    { name: 'أحمد محمد علي', phone: '0770123456', address: 'بغداد / الكرادة', balance: 300000 },
    { name: 'شركة النور التجارية', phone: '0781234567', address: 'بغداد / المنصور', balance: 0 },
    { name: 'سالم عبدالله جاسم', phone: '0750987654', address: 'البصرة / العشار', balance: 300000 },
    { name: 'فاطمة حسن مهدي', phone: '0771456789', address: 'النجف / الحويش', balance: 75000 },
    { name: 'مؤسسة الأمل', phone: '0782345678', address: 'كربلاء / المركز', balance: 2100000 }
  ],
  suppliers: [
    {
      name: 'مؤسسة النور للتوريد', job: 'مواد بناء', phone: '0770111222', address: 'بغداد / الكرادة',
      tx: [
        { date: '2026-10-11', no: '1', desc: 'توريد 50 طن إسمنت', incoming: 5000000, paid: 4000000, note: 'دفعة أولى' },
        { date: '2026-10-19', no: '2', desc: 'جرد 1 — كرتونات رخصات', incoming: 250000, paid: 0, note: '' }
      ]
    },
    {
      name: 'شركة الأمل التجارية', job: 'أغذية', phone: '0781333444', address: 'بغداد / المنصور',
      tx: [
        { date: '2026-10-05', no: '1', desc: 'توريد مواد غذائية', incoming: 980000, paid: 800000, note: '' },
        { date: '2026-10-22', no: '2', desc: 'إضافة أصناف', incoming: 500000, paid: 200000, note: '' }
      ]
    },
    {
      name: 'مكتب الرافدين', job: 'قرطاسية', phone: '0750555666', address: 'البصرة / العشار',
      tx: [
        { date: '2026-10-08', no: '1', desc: 'قرطاسية ومستلزمات مكتبية', incoming: 295000, paid: 200000, note: '' }
      ]
    },
    {
      name: 'مخازن الفرات', job: 'مواد متنوعة', phone: '0770999888', address: 'كربلاء / المركز',
      tx: [
        { date: '2026-09-28', no: '1', desc: 'توريد مواد متنوعة', incoming: 4100000, paid: 3000000, note: '' },
        { date: '2026-10-15', no: '2', desc: 'جرد 1', incoming: 2000000, paid: 1000000, note: '' }
      ]
    }
  ],
  ledger: [
    { date: '2026-10-24', type: 'in',  desc: 'دفعة من عميل: أحمد محمد',     amount: 750000,  note: '' },
    { date: '2026-10-23', type: 'out', desc: 'إيجار المخزن',                amount: 300000,  note: '' },
    { date: '2026-10-22', type: 'in',  desc: 'بيع بضاعة – مؤسسة الأمل',     amount: 1250000, note: '' },
    { date: '2026-10-21', type: 'out', desc: 'رواتب الموظفين',              amount: 900000,  note: '' },
    { date: '2026-10-20', type: 'in',  desc: 'تحصيل من عميل: سالم عبدالله', amount: 420000,  note: '' }
  ],
  partners: [
    { name: 'محمد علي',    role: 'شريك مؤسس', share: 40, capital: 4000000, withdrawals: 600000, note: '' },
    { name: 'عبدالله حسن', role: 'شريك',       share: 35, capital: 3500000, withdrawals: 400000, note: '' },
    { name: 'سالم كريم',   role: 'شريك',       share: 25, capital: 2500000, withdrawals: 160000, note: '' }
  ],
  partnerProfit: 4640000,
  associations: [
    { name: 'جمعية الإعمار', fee: 12000 },
    { name: 'جمعية البر',    fee: 10000 },
    { name: 'جمعية الأمل',   fee: 10000 }
  ],
  members: [
    { assoc: 'جمعية الإعمار', name: 'خالد ناصر', type: 'سنوي', fee: 12000, paid: 12000, note: '' },
    { assoc: 'جمعية الإعمار', name: 'وليد صلاح', type: 'شهري', fee: 12000, paid: 6000,  note: '' },
    { assoc: 'جمعية البر',    name: 'عمر ياسين', type: 'سنوي', fee: 10000, paid: 10000, note: '' },
    { assoc: 'جمعية الأمل',   name: 'زياد فؤاد', type: 'شهري', fee: 10000, paid: 0,     note: '' }
  ]
};

function seedDemo(win) {
  if (!win || !win.localStorage) return;
  const put = (k, v) => win.localStorage.setItem(k, JSON.stringify(v));
  put('app_customers', DEMO.customers);
  put('app_suppliers', DEMO.suppliers);
  put('app_ledger', DEMO.ledger);
  put('app_partners', DEMO.partners);
  put('app_associations', DEMO.associations);
  put('app_members', DEMO.members);
  win.localStorage.setItem('app_partner_profit', String(DEMO.partnerProfit));
}

module.exports = { DEMO, seedDemo };
