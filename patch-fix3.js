/* إصلاح جذري: derive() يتعامل مع قيم مكسورة + حماية الاستدعاءات العليا */
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

/* 1) derive(): المدفوعات والمرسل لازم يكونوا مصفوفات فعلًا */
rep('derive pays array',
  `    var pays = c.payments || [];`,
  `    var pays = Array.isArray(c.payments) ? c.payments : [];`);

rep('derive sends array',
  `    var sends = c.sends || [];`,
  `    var sends = Array.isArray(c.sends) ? c.sends : [];`);

/* 2) دالة تنفيذ آمن للاستدعاءات اللي بتحصل وقت تحميل السكربت */
rep('safeRun helper',
  `  function safeList(v, fallback) {`,
  `  /* تنفيذ آمن لأي استدعاء رسم أثناء تحميل السكربت:
     لو أي رسم فشل برمجياً يتسجّل الخطأ بدل ما يقطع بقية السكربت
     (قطع السكربت كان بيمنع الإقلاع فتظهر الشاشة فاضية). */
  function safeRun(run, label) {
    try { run(); } catch (e) {
      try { console.error('فشل «' + label + '»: ' + (e && e.message ? e.message : e)); } catch (e2) {}
    }
  }

  function safeList(v, fallback) {`);

/* 3) تغليف الاستدعاءات العليا */
rep('top renderCollection',
  `  renderCollection('');
  renderCollectionSummary();`,
  `  safeRun(function () { renderCollection(''); renderCollectionSummary(); }, 'التحصيل');`);

rep('top renderPartners',
  `  if (profitForm) profitForm.elements.profit.value = getPartnerProfit();
  renderPartners();`,
  `  if (profitForm) profitForm.elements.profit.value = getPartnerProfit();
  safeRun(renderPartners, 'الشركاء');`);

rep('top renderAssociations',
  `    if (em) startEditMember(Number(em.getAttribute('data-edit-member')));
  });

  renderAssociations();`,
  `    if (em) startEditMember(Number(em.getAttribute('data-edit-member')));
  });

  safeRun(renderAssociations, 'الجمعيات');`);

rep('top export grid',
  `  } catch (e) {}

  renderExportGrid();
  refreshDriveStatus();`,
  `  } catch (e) {}

  safeRun(function () { renderExportGrid(); refreshDriveStatus(); }, 'التصدير والربط');`);

rep('top loadSyncFolder',
  `  }
  loadSyncFolder();`,
  `  }
  safeRun(loadSyncFolder, 'مجلد المزامنة');`);

fs.writeFileSync('app.js', app);
console.log(`\nتم تطبيق ${n} تعديل بنجاح`);
