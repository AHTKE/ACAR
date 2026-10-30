/* تطبيع حقول العملاء القابلة للمصفوفة عند القراءة */
const fs = require('fs');
let app = fs.readFileSync('app.js', 'utf8');
let n = 0;

function rep(what, oldStr, newStr) {
  const c = app.split(oldStr).length - 1;
  if (c !== 1) throw new Error(`count=${c} :: ${what}`);
  app = app.replace(oldStr, newStr);
  n++;
  console.log('  OK  ' + what);
}

rep('normClient helper',
  `  function getCustomers() {`,
  `  /* تطبيع حقول مصفوفة العميل: لو التخزين اتخزن فيه نص بدل مصفوفة
     نرجّعه مصفوفة فاضية بدل ما يقطع الرسم كله */
  function normClient(c) {
    if (c && typeof c === 'object') {
      if (c.payments != null && !Array.isArray(c.payments)) c.payments = [];
      if (c.sends != null && !Array.isArray(c.sends)) c.sends = [];
      if (c.notes != null && !Array.isArray(c.notes)) c.notes = [];
    }
    return c;
  }

  function getCustomers() {`);

rep('apply normClient on read',
  `      var raw = localStorage.getItem(KEY_CUSTOMERS);
      if (raw) return safeList(JSON.parse(raw), DEFAULT_CUSTOMERS);
    } catch (e) {}
    return DEFAULT_CUSTOMERS.slice();`,
  `      var raw = localStorage.getItem(KEY_CUSTOMERS);
      if (raw) return safeList(JSON.parse(raw), DEFAULT_CUSTOMERS).map(normClient);
    } catch (e) {}
    return DEFAULT_CUSTOMERS.slice().map(normClient);`);

fs.writeFileSync('app.js', app);
console.log(`\nتم تطبيق ${n} تعديل`);
