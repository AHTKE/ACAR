/* ============================================================
   importer.js — قراءة ملفات العملاء القديمة (Excel / CSV / PDF)
   ------------------------------------------------------------
   الوحدة دي مسؤولة عن «القراءة والفهم» فقط:
     • فك ملف Excel (.xlsx) من غير أي مكتبة خارجية (ZIP + XML).
     • قراءة CSV / TSV بالنص.
     • استخراج نص PDF وتحويله لصفوف/أعمدة (بمحرك PDF محلي).
     • التعرف على العناوين العربية والإنجليزية وربطها بحقول العميل.
   التحويل لقاعدة البيانات نفسه بيحصل في app.js بعد تأكيد المستخدم،
   عشان ما يتكتبش أي حاجة من غير مراجعة.

   الواجهة العامة: window.NizamImport
     parseFile(fileLike)  → Promise<{name, kind, tables:[{name, rows}]}>
     analyze(rows, opts)  → {headerRow, mapping, mode, records, skipped, headers}
     FIELD_LABELS, FIELDS
   ============================================================ */
(function (global) {
  'use strict';

  var FIELDS = [
    'name', 'phone', 'phone2', 'nationalId', 'address',
    'total', 'down', 'monthly', 'duration', 'dueDay',
    'startDate', 'status', 'paid', 'amount', 'date', 'note'
  ];

  var FIELD_LABELS = {
    name: 'اسم العميل',
    phone: 'رقم التلفون',
    phone2: 'الرقم الاحتياطي',
    nationalId: 'الرقم القومي',
    address: 'العنوان',
    total: 'المبلغ الإجمالي',
    down: 'المقدم',
    monthly: 'المبلغ الشهري / القسط',
    duration: 'مدة السداد (شهور)',
    dueDay: 'يوم التحصيل',
    startDate: 'تاريخ البدء',
    status: 'الحالة',
    paid: 'المدفوع / إجمالي التحصيل',
    amount: 'مبلغ الدفعة',
    date: 'تاريخ الدفعة',
    note: 'ملاحظات'
  };

  /* كلمات العناوين — كل ما يتطابق مع أي واحدة منها يعتبر الحقل ده.
     الترتيب مهم: الأخص قبل الأعم (المبلغ المدفوع مقدم ≠ المدفوع الكلي). */
  var HEADER_WORDS = [
    { field: 'nationalId', words: ['الرقم القومي', 'رقم قومي', 'الهويه', 'هويه', 'national id', 'nationalid', 'id number'] },
    { field: 'phone2', words: ['رقم احتياطي', 'الاحتياطي', 'تلفون احتياطي', 'هاتف احتياطي', 'phone2', 'alt phone', 'second phone'] },
    { field: 'phone', words: ['رقم التلفون', 'التلفون', 'الهاتف', 'الموبايل', 'المحمول', 'رقم الهاتف', 'رقم الموبايل', 'تليفون', 'phone', 'mobile', 'tel', 'whatsapp'] },
    { field: 'address', words: ['العنوان', 'عنوان', 'address', 'location'] },
    { field: 'startDate', words: ['تاريخ البدء', 'تاريخ البدايه', 'تاريخ التعاقد', 'تاريخ الاضافه', 'تاريخ التسجيل', 'start date', 'startdate', 'date of contract'] },
    { field: 'dueDay', words: ['يوم التحصيل', 'يوم الدفع', 'يوم السداد', 'يوم القسط', 'due day', 'dueday', 'payment day'] },
    { field: 'monthly', words: ['المبلغ الشهري', 'الشهري', 'القسط', 'قيمه القسط', 'قسط', 'monthly', 'installment'] },
    { field: 'duration', words: ['المده', 'عدد الشهور', 'عدد الاشهر', 'الشهور', 'مده السداد', 'duration', 'months'] },
    { field: 'down', words: ['المقدم', 'مقدم', 'الدفعه المقدمه', 'دفعه مقدمه', 'down payment', 'downpayment', 'advance'] },
    /* «amount» قبل «total» عشان «المبلغ المدفوع» ما يتفسّرش كإجمالي */
    { field: 'amount', words: ['مبلغ الدفعه', 'قيمه الدفعه', 'المبلغ المدفوع', 'المدفوع', 'الدفعه', 'دفعه', 'amount', 'paid amount', 'payment'] },
    { field: 'total', words: ['المبلغ الاجمالي', 'الاجمالي', 'المبلغ الكلي', 'الكلي', 'قيمه التعاقد', 'المبلغ', 'total', 'amount due', 'contract value'] },
    { field: 'date', words: ['تاريخ الدفعه', 'تاريخ التحصيل', 'تاريخ السداد', 'التاريخ', 'date'] },
    { field: 'paid', words: ['اجمالي التحصيل', 'المدفوع من العميل', 'اجمالي المدفوع', 'المسدد', 'paid total', 'total paid'] },
    { field: 'status', words: ['الحاله', 'الوضع', 'status'] },
    { field: 'note', words: ['ملاحظات', 'ملاحظه', 'البيان', 'الوصف', 'note', 'notes', 'description', 'remark'] },
    { field: 'name', words: ['اسم العميل', 'اسم', 'العميل', 'الاسم', 'اسم المستفيد', 'name', 'customer', 'client'] }
  ];

  /* تطبيع النص العربي للمقارنة: توحيد الألف/الياء/التاء، وشيل التشكيل
     والعلامات، عشان «الأسم» و«الاسم» و«اسم» يتطابقوا. */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\w\u0600-\u06FF]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function fieldOfHeader(raw) {
    var n = norm(raw);
    if (!n) return '';
    var padded = ' ' + n + ' ';
    for (var i = 0; i < HEADER_WORDS.length; i++) {
      var def = HEADER_WORDS[i];
      for (var k = 0; k < def.words.length; k++) {
        var w = norm(def.words[k]);
        if (!w) continue;
        if (padded.indexOf(' ' + w + ' ') > -1 || n === w) return def.field;
      }
    }
    /* مطابقة جزئية لاحتمالات زي «اسم العميل / رقم الهاتف» بعد التطبيع */
    for (var j = 0; j < HEADER_WORDS.length; j++) {
      var d2 = HEADER_WORDS[j];
      for (var m = 0; m < d2.words.length; m++) {
        var w2 = norm(d2.words[m]);
        if (w2.length >= 4 && n.indexOf(w2) > -1) return d2.field;
      }
    }
    return '';
  }

  /* ---------- أدوات أرقام وتواريخ ---------- */
  var AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

  function latinDigits(s) {
    return String(s == null ? '' : s).replace(/[٠-٩۰-۹]/g, function (d) { return AR_DIGITS[d] || d; });
  }

  function toNumber(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = latinDigits(v).replace(/[^\d.,\-]/g, '');
    if (!s) return 0;
    /* 1,234.56 → 1234.56 — و1.234,56 (أوروبي) → 1234.56 */
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.indexOf(',') > -1) {
      var parts = s.split(',');
      s = parts.length === 2 && parts[1].length <= 2 ? parts.join('.') : parts.join('');
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dateFromSerial(n) {
    /* تاريخ Excel: رقم من 1 (1900) — نعتبره بعد 1990 فقط عشان ما نحوّلش أرقام عادية */
    if (!(n > 32000 && n < 80000)) return '';
    var ms = Math.round((n - 25569) * 86400000);
    var d = new Date(ms);
    if (!isFinite(d.getTime())) return '';
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function toISODate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return dateFromSerial(v);
    var raw = latinDigits(String(v)).trim();
    if (!raw) return '';
    if (/^\d+(\.\d+)?$/.test(raw)) {
      var ser = dateFromSerial(parseFloat(raw));
      if (ser) return ser;
    }
    var m = raw.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
    m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) {
      var y = +m[3];
      if (y < 100) y += y > 70 ? 1900 : 2000;
      var d1 = +m[1], d2 = +m[2];
      /* لو الأول أكبر من 12 يبقى يوم/شهر، وإلا نفترض يوم/شهر كمان (العرف المصري) */
      if (d1 > 31) return '';
      return y + '-' + pad2(d2) + '-' + pad2(d1);
    }
    var parsed = new Date(raw);
    if (isFinite(parsed.getTime())) {
      return parsed.getFullYear() + '-' + pad2(parsed.getMonth() + 1) + '-' + pad2(parsed.getDate());
    }
    return '';
  }

  /* ---------- CSV / TSV ---------- */
  function detectDelimiter(lines) {
    var cands = [',', ';', '\t', '|'];
    var best = ',', bestScore = -1;
    cands.forEach(function (d) {
      var counts = [];
      for (var i = 0; i < Math.min(lines.length, 12); i++) {
        if (!lines[i]) continue;
        var c = 0, inQ = false;
        for (var j = 0; j < lines[i].length; j++) {
          var ch = lines[i].charAt(j);
          if (ch === '"') inQ = !inQ;
          else if (ch === d && !inQ) c++;
        }
        counts.push(c);
      }
      if (!counts.length) return;
      var max = Math.max.apply(null, counts);
      var same = counts.filter(function (c) { return c === max; }).length;
      var score = max > 0 ? (same * 100 + max) : 0;
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }

  function parseDelimited(text) {
    var clean = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var lines = clean.split('\n');
    var delim = detectDelimiter(lines);
    var rows = [];
    var row = [];
    var cell = '';
    var inQuotes = false;
    for (var i = 0; i < clean.length; i++) {
      var ch = clean.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (clean.charAt(i + 1) === '"') { cell += '"'; i++; }
          else inQuotes = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === delim) { row.push(cell); cell = ''; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
      cell += ch;
    }
    row.push(cell);
    rows.push(row);
    return rows.map(function (r) {
      return r.map(function (c) { return String(c == null ? '' : c).trim(); });
    }).filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  }

  /* ---------- فك ZIP (بدون مكتبات) ---------- */
  function readZip(buffer) {
    var buf = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
    var dv = new DataView(buf);
    var eocd = -1;
    var min = Math.max(0, buf.byteLength - 66000);
    for (var i = buf.byteLength - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('الملف ليس ملف Excel صالح (تعذّر قراءة الحاوية)');
    var count = dv.getUint16(eocd + 10, true);
    var off = dv.getUint32(eocd + 16, true);
    var entries = {};
    for (var n = 0; n < count; n++) {
      if (off + 46 > buf.byteLength || dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true);
      var compSize = dv.getUint32(off + 20, true);
      var nameLen = dv.getUint16(off + 28, true);
      var extraLen = dv.getUint16(off + 30, true);
      var commentLen = dv.getUint16(off + 32, true);
      var localOff = dv.getUint32(off + 42, true);
      var name = new TextDecoder('utf-8').decode(new Uint8Array(buf, off + 46, nameLen));
      if (dv.getUint32(localOff, true) === 0x04034b50) {
        var lNameLen = dv.getUint16(localOff + 26, true);
        var lExtraLen = dv.getUint16(localOff + 28, true);
        var dataStart = localOff + 30 + lNameLen + lExtraLen;
        if (dataStart + compSize <= buf.byteLength) {
          entries[name] = { method: method, data: new Uint8Array(buf, dataStart, compSize) };
        }
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  function inflateRaw(bytes, method) {
    if (!bytes) return Promise.resolve('');
    if (method === 0) return Promise.resolve(new TextDecoder('utf-8').decode(bytes));
    if (method !== 8) return Promise.reject(new Error('طريقة ضغط غير مدعومة داخل ملف Excel'));
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('هذا المتصفح لا يدعم فك ضغط ملفات Excel — حدّث المتصفح أو استخدم ملف CSV'));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (out) {
      return new TextDecoder('utf-8').decode(new Uint8Array(out));
    });
  }

  function xmlText(s) {
    return String(s || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
      .replace(/&amp;/g, '&');
  }

  function attr(tag, name) {
    var m = String(tag).match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'));
    return m ? m[1] : '';
  }

  function colFromRef(ref) {
    var letters = String(ref || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n > 0 ? n - 1 : -1;
  }

  async function parseXlsx(buffer) {
    var files = readZip(buffer);
    if (!files['xl/workbook.xml']) throw new Error('الملف ليس بصيغة xlsx — لو قديم جداً احفظه بصيغة xlsx أو CSV');

    var shared = [];
    if (files['xl/sharedStrings.xml']) {
      var ssXml = await inflateRaw(files['xl/sharedStrings.xml'].data, files['xl/sharedStrings.xml'].method);
      var reSi = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
      var mSi;
      while ((mSi = reSi.exec(ssXml))) {
        var inner = mSi[1];
        var reT = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        var mT, txt = '';
        while ((mT = reT.exec(inner))) txt += xmlText(mT[1]);
        if (!txt) {
          var plain = inner.match(/<t\b[^>]*\/>/);
          if (plain) txt = '';
        }
        shared.push(txt);
      }
    }

    var wbXml = await inflateRaw(files['xl/workbook.xml'].data, files['xl/workbook.xml'].method);
    var sheetTags = [];
    var reSheet = /<sheet\b([^>]*)\/?>/g, mSheet;
    while ((mSheet = reSheet.exec(wbXml))) {
      sheetTags.push({
        name: xmlText(attr(mSheet[1], 'name')) || ('ورقة ' + (sheetTags.length + 1)),
        relId: attr(mSheet[1], 'r:id') || attr(mSheet[1], 'id')
      });
    }

    var rels = {};
    if (files['xl/_rels/workbook.xml.rels']) {
      var relXml = await inflateRaw(files['xl/_rels/workbook.xml.rels'].data, files['xl/_rels/workbook.xml.rels'].method);
      var reRel = /<Relationship\b([^>]*)\/?>/g, mRel;
      while ((mRel = reRel.exec(relXml))) {
        rels[attr(mRel[1], 'Id')] = attr(mRel[1], 'Target');
      }
    }

    var sheetPaths = [];
    sheetTags.forEach(function (s, i) {
      var target = rels[s.relId] || '';
      var path = target ? (target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')) : '';
      if (!path || !files[path]) path = 'xl/worksheets/sheet' + (i + 1) + '.xml';
      if (files[path]) sheetPaths.push({ name: s.name, path: path });
    });
    if (!sheetPaths.length) {
      Object.keys(files).filter(function (k) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(k); })
        .sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); })
        .forEach(function (k, i) { sheetPaths.push({ name: 'ورقة ' + (i + 1), path: k }); });
    }

    var tables = [];
    for (var si = 0; si < sheetPaths.length; si++) {
      var sp = sheetPaths[si];
      var sheetXml = await inflateRaw(files[sp.path].data, files[sp.path].method);
      var rows = [];
      var reRow = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, mRow;
      while ((mRow = reRow.exec(sheetXml))) {
        var rowInner = mRow[2] || '';
        var rowIdx = parseInt(attr(mRow[1], 'r'), 10);
        var cells = [];
        var reCell = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, mCell;
        var autoCol = 0;
        while ((mCell = reCell.exec(rowInner))) {
          var cAttrs = mCell[1] || '';
          var cBody = mCell[2] || '';
          var ref = attr(cAttrs, 'r');
          var col = ref ? colFromRef(ref) : autoCol;
          if (col < 0) col = autoCol;
          autoCol = col + 1;
          var type = attr(cAttrs, 't');
          var val = '';
          if (type === 'inlineStr') {
            var reIt = /<t\b[^>]*>([\s\S]*?)<\/t>/g, mIt;
            while ((mIt = reIt.exec(cBody))) val += xmlText(mIt[1]);
          } else {
            var mVal = cBody.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
            if (mVal) {
              val = xmlText(mVal[1]);
              if (type === 's') val = shared[parseInt(val, 10)] || '';
              else if (type === 'b') val = val === '1' ? 'نعم' : 'لا';
            } else if (type === 'str') {
              var mStr = cBody.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
              if (mStr) val = xmlText(mStr[1]);
            }
          }
          cells[col] = String(val).trim();
        }
        var arr = [];
        for (var ci = 0; ci < cells.length; ci++) arr.push(cells[ci] == null ? '' : cells[ci]);
        if (arr.some(function (v) { return v !== ''; })) rows.push(arr);
        else if (rowIdx > 0 && rows.length) rows.push([]);
      }
      /* نشيل الصفوف الفاضية الزيادة في الآخر */
      while (rows.length && !rows[rows.length - 1].length) rows.pop();
      if (rows.length) tables.push({ name: sp.name, rows: rows });
    }
    if (!tables.length) throw new Error('الملف لا يحتوي على بيانات في أي ورقة');
    return tables;
  }

  /* ---------- PDF (محرك محلي بدون إنترنت) ---------- */
  var pdfEnginePromise = null;
  function loadPdfEngine() {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    if (pdfEnginePromise) return pdfEnginePromise;
    var base = '';
    try { base = new URL('./vendor/pdfjs/', document.baseURI).href; } catch (e) { base = './vendor/pdfjs/'; }
    pdfEnginePromise = import(base + 'pdf.min.mjs').then(function (mod) {
      var lib = mod && mod.getDocument ? mod : (mod.default || mod);
      try { lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs'; } catch (e) {}
      global.pdfjsLib = lib;
      return lib;
    }).catch(function (e) {
      pdfEnginePromise = null;
      throw new Error('محرك قراءة PDF غير متاح على هذا الجهاز — استخدم ملف Excel أو CSV (' + (e && e.message ? e.message : e) + ')');
    });
    return pdfEnginePromise;
  }

  var AR_RE = /[\u0600-\u06FF]/;

  function groupPdfLines(items) {
    var lines = [];
    items.forEach(function (it) {
      if (!it || typeof it.str !== 'string') return;
      var str = it.str;
      if (!str.trim()) return;
      var x = it.transform ? it.transform[4] : 0;
      var y = it.transform ? it.transform[5] : 0;
      var w = Number(it.width || 0);
      var line = null;
      for (var i = 0; i < lines.length; i++) {
        if (Math.abs(lines[i].y - y) <= 4) { line = lines[i]; break; }
      }
      if (!line) { line = { y: y, items: [] }; lines.push(line); }
      line.items.push({ x: x, w: w, str: str });
    });
    lines.sort(function (a, b) { return b.y - a.y; });
    var rows = [];
    lines.forEach(function (line) {
      line.items.sort(function (a, b) { return a.x - b.x; });
      var arabic = 0, total = 0;
      var cells = [];
      var cur = '';
      var prevEnd = null;
      line.items.forEach(function (it) {
        var chars = it.str.replace(/\s/g, '');
        total += chars.length;
        if (AR_RE.test(chars)) arabic += chars.length;
        if (prevEnd != null && (it.x - prevEnd) > 14) {
          if (cur.trim()) cells.push(cur.trim());
          cur = it.str;
        } else {
          var needSpace = cur && !/\s$/.test(cur) && !/^\s/.test(it.str);
          cur += (needSpace ? ' ' : '') + it.str;
        }
        prevEnd = it.x + (it.w || 0);
      });
      if (cur.trim()) cells.push(cur.trim());
      if (cells.length && total && arabic / total > 0.5) cells.reverse();
      if (cells.length) rows.push(cells);
    });
    return rows;
  }

  async function parsePdf(buffer) {
    var lib = await loadPdfEngine();
    var data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var doc = await lib.getDocument({ data: data, isEvalSupported: false, useSystemFonts: true }).promise;
    var rows = [];
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var content = await page.getTextContent();
      var pageRows = groupPdfLines(content.items || []);
      pageRows.forEach(function (r) { rows.push(r); });
    }
    try { if (doc.destroy) await doc.destroy(); } catch (e) {}
    if (!rows.length) throw new Error('الـPDF لا يحتوي على نص قابل للقراءة (غالباً صورة ممسوحة) — حوّله إلى Excel أو CSV');
    return [{ name: 'صفحات PDF', rows: rows }];
  }

  /* ---------- الواجهة: قراءة أي ملف ---------- */
  function fileExt(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  async function parseFile(file) {
    var name = (file && file.name) || '';
    var ext = fileExt(name);
    var buffer = null;
    if (file && typeof file.arrayBuffer === 'function') buffer = await file.arrayBuffer();
    else if (file && file.buffer) buffer = file.buffer;
    else throw new Error('تعذّر قراءة الملف');
    if (!buffer || !buffer.byteLength) throw new Error('الملف فاضي');

    var kind = ext === 'xlsx' || ext === 'xlsm' ? 'xlsx'
      : ext === 'pdf' ? 'pdf'
      : (ext === 'csv' || ext === 'txt' || ext === 'tsv' || ext === '') ? 'csv'
      : ext === 'xls' ? 'xls' : 'csv';

    if (kind === 'xls') {
      throw new Error('صيغة xls القديمة غير مدعومة — افتح الملف في Excel واحفظه بصيغة xlsx أو CSV');
    }
    if (kind === 'pdf') {
      return { name: name, kind: 'pdf', tables: await parsePdf(buffer) };
    }
    if (kind === 'xlsx') {
      /* بعض الملفات بتبدأ بحروف PK — نفكها، ولو فشلت نجربها كنص CSV */
      try {
        return { name: name, kind: 'xlsx', tables: await parseXlsx(buffer) };
      } catch (e) {
        var txt = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
        if (txt.indexOf(',') > -1) {
          return { name: name, kind: 'csv', tables: [{ name: 'البيانات', rows: parseDelimited(txt) }] };
        }
        throw e;
      }
    }
    var text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    return { name: name, kind: 'csv', tables: [{ name: 'البيانات', rows: parseDelimited(text) }] };
  }

  /* ---------- تحليل الأعمدة والربط ---------- */
  function detectHeaderRow(rows) {
    var limit = Math.min(rows.length, 14);
    var best = { index: 0, score: -1 };
    for (var i = 0; i < limit; i++) {
      var r = rows[i] || [];
      var score = 0;
      for (var c = 0; c < r.length; c++) if (fieldOfHeader(r[c])) score++;
      if (score > best.score) best = { index: i, score: score };
      if (score >= 3 && r.length <= 14) break;
    }
    return best.score >= 2 ? best.index : 0;
  }

  function autoMapping(headers) {
    var map = {};
    headers.forEach(function (h, i) {
      var f = fieldOfHeader(h);
      if (f && map[f] == null) map[f] = i;
    });
    return map;
  }

  function cell(row, idx) {
    if (idx == null || idx < 0) return '';
    var v = row[idx];
    return v == null ? '' : String(v).trim();
  }

  function analyze(rows, opts) {
    opts = opts || {};
    var table = Array.isArray(rows) ? rows : [];
    var headerRow = opts.headerRow != null ? opts.headerRow : detectHeaderRow(table);
    if (headerRow < 0) headerRow = 0;
    var headers = (table[headerRow] || []).map(function (h) { return String(h == null ? '' : h).trim(); });
    var width = headers.length;
    table.forEach(function (r) { if (r && r.length > width) width = r.length; });
    while (headers.length < width) headers.push('');

    var mapping = opts.mapping ? Object.assign({}, opts.mapping) : autoMapping(headers);
    if (opts.mapping) {
      /* الفهارس اللي جاية من الواجهة نصوص */
      Object.keys(mapping).forEach(function (k) {
        var v = mapping[k];
        mapping[k] = (v === '' || v == null) ? null : Number(v);
      });
    }

    var hasDate = mapping.date != null && mapping.date >= 0;
    var hasAmount = (mapping.amount != null && mapping.amount >= 0) || (mapping.paid != null && mapping.paid >= 0);
    var hasProfile = (mapping.total != null && mapping.total >= 0) ||
      (mapping.monthly != null && mapping.monthly >= 0) ||
      (mapping.down != null && mapping.down >= 0);
    var mode = opts.mode || ((hasDate && hasAmount && !hasProfile) ? 'payments' : 'customers');
    /* في ملف بيانات العملاء عمود «المدفوع» معناه إجمالي المدفوع من العميل،
       وفي ملف الدفعات معناه مبلغ الدفعة. نطبّع الربط حسب الوضع. */
    if (mode === 'customers' && mapping.amount != null && mapping.amount >= 0) {
      if (mapping.paid == null || mapping.paid < 0) mapping.paid = mapping.amount;
      mapping.amount = null;
    }

    var records = [];
    var skipped = 0;
    var done = {};
    for (var i = headerRow + 1; i < table.length; i++) {
      var row = table[i] || [];
      var name = cell(row, mapping.name);
      if (!name) { skipped++; continue; }
      /* صفوف إجماليات/عناوين مكررة */
      var low = norm(name);
      if (low === 'الاجمالي' || low === 'total' || low === 'المجموع' || low === 'sum') { skipped++; continue; }
      var rec;
      if (mode === 'payments') {
        var amt = toNumber(cell(row, mapping.amount != null ? mapping.amount : mapping.paid));
        var dt = toISODate(cell(row, mapping.date));
        if (!(amt > 0)) { skipped++; continue; }
        rec = {
          name: name,
          phone: cell(row, mapping.phone),
          date: dt || '',
          amount: amt,
          note: cell(row, mapping.note)
        };
      } else {
        rec = {
          name: name,
          phone: cell(row, mapping.phone),
          phone2: cell(row, mapping.phone2),
          nationalId: cell(row, mapping.nationalId),
          address: cell(row, mapping.address),
          total: toNumber(cell(row, mapping.total)),
          down: toNumber(cell(row, mapping.down)),
          monthly: toNumber(cell(row, mapping.monthly)),
          duration: toNumber(cell(row, mapping.duration)),
          dueDay: Math.min(31, Math.max(0, Math.round(toNumber(cell(row, mapping.dueDay))))),
          startDate: toISODate(cell(row, mapping.startDate)),
          status: cell(row, mapping.status),
          paid: toNumber(cell(row, mapping.paid)),
          note: cell(row, mapping.note)
        };
        if (!rec.total && !rec.monthly && !rec.down && !rec.paid && !rec.duration) {
          /* صف فيه اسم بس — نستورده كعميل بدون مبالغ بدل ما نرميه */
          rec.total = 0;
        }
      }
      var dedupe = mode + '|' + norm(name) + '|' + (rec.date || '') + '|' + (rec.amount || rec.total || 0);
      if (done[dedupe]) { skipped++; continue; }
      done[dedupe] = true;
      records.push(rec);
    }

    return {
      headerRow: headerRow,
      headers: headers,
      mapping: mapping,
      mode: mode,
      records: records,
      skipped: skipped
    };
  }

  global.NizamImport = {
    FIELDS: FIELDS,
    FIELD_LABELS: FIELD_LABELS,
    norm: norm,
    fieldOfHeader: fieldOfHeader,
    parseFile: parseFile,
    parseDelimited: parseDelimited,
    parseXlsx: parseXlsx,
    analyze: analyze,
    toNumber: toNumber,
    toISODate: toISODate
  };
})(typeof window !== 'undefined' ? window : globalThis);
