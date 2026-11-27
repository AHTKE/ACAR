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
    'startDate', 'status', 'paid', 'rest', 'amount', 'date', 'note'
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
    rest: 'المتبقي / الباقي',
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
    { field: 'startDate', words: ['تاريخ البدء', 'تاريخ البدايه', 'تاريخ التعاقد', 'تاريخ العقد', 'تاريخ الاضافه', 'تاريخ التسجيل', 'تاريخ اول قسط', 'بدايه التعاقد', 'start date', 'startdate', 'contract date', 'date of contract'] },
    { field: 'dueDay', words: ['يوم التحصيل', 'يوم الدفع', 'يوم السداد', 'يوم القسط', 'يوم الاستحقاق', 'due day', 'dueday', 'payment day'] },
    { field: 'monthly', words: ['المبلغ الشهري', 'القيمه الشهريه', 'الشهري', 'القسط الشهري', 'قيمه القسط الشهري', 'قيمه القسط', 'المبلغ المستحق شهريا', 'القسط', 'قسط', 'monthly', 'installment amount', 'installment'] },
    { field: 'duration', words: ['المده', 'مده السداد', 'مده التقسيط', 'عدد الشهور', 'عدد الاشهر', 'عدد الاقساط', 'الاقساط', 'الشهور', 'duration', 'no of months', 'months'] },
    { field: 'down', words: ['المقدم المدفوع', 'المقدم', 'مقدم', 'الدفعه المقدمه', 'دفعه مقدمه', 'اول دفعه', 'دفعه اولي', 'down payment', 'downpayment', 'initial payment', 'advance'] },
    /* «paid» و«rest» لازم ياخدوا الأولوية قبل «amount» و«total»؛
       وإلا «إجمالي المدفوع» يتفسّر كدفعة، و«المبلغ المتبقي» كإجمالي. */
    { field: 'paid', words: ['اجمالي المدفوع', 'اجمالي التحصيل', 'اجمالي المسدد', 'المدفوع من العميل', 'المسدد', 'paid total', 'total paid'] },
    { field: 'rest', words: ['المتبقي للتحصيل', 'المتبقي عليه', 'المتبقي', 'الباقي للتحصيل', 'الباقي', 'الرصيد المتبقي', 'المديونيه', 'remaining', 'balance', 'outstanding', 'rest'] },
    { field: 'amount', words: ['مبلغ الدفعه', 'قيمه الدفعه', 'المبلغ المدفوع', 'المدفوع', 'الدفعه', 'دفعه', 'الواصل', 'المحصل', 'المستلم', 'amount', 'paid amount', 'payment', 'collected', 'received'] },
    { field: 'total', words: ['المبلغ الاجمالي', 'القيمه الاجماليه', 'اجمالي المبلغ', 'المبلغ الكلي', 'الكلي', 'قيمه التعاقد', 'قيمه العقد', 'المبلغ', 'total amount', 'grand total', 'amount due', 'contract value', 'total'] },
    { field: 'date', words: ['تاريخ الدفعه', 'تاريخ التحصيل', 'تاريخ السداد', 'تاريخ الدفع', 'تاريخ العمليه', 'التاريخ', 'payment date', 'date'] },
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

  /* ملفات Excel/CSV المحفوظة على ويندوز العربي بتكون غالباً Windows-1256؛
     لو فك الترميز UTF-8 طلع حروف تالفة (؟) نجرب الترميز العربي. */
  function decodeText(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var txt = '';
    try { txt = new TextDecoder('utf-8').decode(bytes); } catch (e) { txt = ''; }
    if (txt.indexOf('\uFFFD') === -1) return txt;
    var encs = ['windows-1256', 'iso-8859-6'];
    for (var i = 0; i < encs.length; i++) {
      try {
        var alt = new TextDecoder(encs[i]).decode(bytes);
        if (alt && alt.indexOf('\uFFFD') === -1) return alt;
      } catch (e2) {}
    }
    return txt;
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

  /* ---------- فك ضغط DEFLATE خالص بـ JS (بديل لأجهزة ما فيهاش DecompressionStream) ---------- */
  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

  function bitReader(bytes) {
    var pos = 0, buf = 0, cnt = 0;
    return {
      need: function (n) {
        while (cnt < n) {
          if (pos >= bytes.length) throw new Error('بيانات Excel المضغوطة غير مكتملة');
          buf |= (bytes[pos++] & 0xff) << cnt;
          cnt += 8;
        }
      },
      bits: function (n) {
        if (!n) return 0;
        this.need(n);
        var v = buf & ((1 << n) - 1);
        buf >>>= n; cnt -= n;
        return v;
      },
      align: function () { pos -= (cnt >> 3); buf = 0; cnt = 0; },
      byte: function () {
        if (pos >= bytes.length) throw new Error('بيانات Excel المضغوطة غير مكتملة');
        return bytes[pos++] & 0xff;
      }
    };
  }

  function buildHuffman(lengths) {
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var maxBits = 0, i;
    for (i = 0; i < lengths.length; i++) {
      if (!lengths[i]) continue;
      counts[lengths[i]]++;
      if (lengths[i] > maxBits) maxBits = lengths[i];
    }
    var offsets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var total = 0;
    for (i = 1; i <= 15; i++) { offsets[i] = total; total += counts[i]; }
    var symbols = new Array(total);
    for (i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offsets[lengths[i]]++] = i;
    return { counts: counts, symbols: symbols, maxBits: maxBits };
  }

  function decodeSymbol(br, h) {
    var code = 0, first = 0, index = 0;
    for (var len = 1; len <= h.maxBits; len++) {
      code |= br.bits(1);
      var count = h.counts[len];
      if (code - first < count) return h.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('كود غير صالح داخل ملف Excel');
  }

  var FIXED_LIT = null, FIXED_DIST = null;
  function fixedTables() {
    if (FIXED_LIT) return;
    var lit = [], i;
    for (i = 0; i < 144; i++) lit.push(8);
    for (; i < 256; i++) lit.push(9);
    for (; i < 280; i++) lit.push(7);
    for (; i < 288; i++) lit.push(8);
    var dist = [];
    for (i = 0; i < 30; i++) dist.push(5);
    FIXED_LIT = buildHuffman(lit);
    FIXED_DIST = buildHuffman(dist);
  }

  function inflateRawJS(bytes) {
    var br = bitReader(bytes);
    var out = [];
    var last = 0;
    while (!last) {
      last = br.bits(1);
      var type = br.bits(2);
      if (type === 0) {
        br.align();
        var len = br.byte() | (br.byte() << 8);
        var nlen = br.byte() | (br.byte() << 8);
        if ((len ^ 0xffff) !== nlen) throw new Error('بيانات Excel المضغوطة تالفة');
        for (var s = 0; s < len; s++) out.push(br.byte());
        continue;
      }
      if (type === 3) throw new Error('بيانات Excel المضغوطة تالفة');
      var litH, distH;
      if (type === 1) {
        fixedTables();
        litH = FIXED_LIT; distH = FIXED_DIST;
      } else {
        var hlit = br.bits(5) + 257;
        var hdist = br.bits(5) + 1;
        var hclen = br.bits(4) + 4;
        var order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        var clen = [];
        for (var i = 0; i < 19; i++) clen.push(0);
        for (var c = 0; c < hclen; c++) clen[order[c]] = br.bits(3);
        var clH = buildHuffman(clen);
        var lengths = [];
        while (lengths.length < hlit + hdist) {
          var sym = decodeSymbol(br, clH);
          if (sym < 16) { lengths.push(sym); continue; }
          var rep = 0, val = 0;
          if (sym === 16) {
            if (!lengths.length) throw new Error('بيانات Excel المضغوطة تالفة');
            val = lengths[lengths.length - 1]; rep = 3 + br.bits(2);
          } else if (sym === 17) { rep = 3 + br.bits(3); }
          else { rep = 11 + br.bits(7); }
          for (var r = 0; r < rep; r++) lengths.push(val);
        }
        litH = buildHuffman(lengths.slice(0, hlit));
        distH = buildHuffman(lengths.slice(hlit));
      }
      while (true) {
        var code = decodeSymbol(br, litH);
        if (code === 256) break;
        if (code < 256) { out.push(code); continue; }
        var li = code - 257;
        if (li >= LEN_BASE.length) throw new Error('بيانات Excel المضغوطة تالفة');
        var length = LEN_BASE[li] + br.bits(LEN_EXTRA[li]);
        var ds = decodeSymbol(br, distH);
        if (ds >= DIST_BASE.length) throw new Error('بيانات Excel المضغوطة تالفة');
        var dist = DIST_BASE[ds] + br.bits(DIST_EXTRA[ds]);
        if (dist > out.length) throw new Error('بيانات Excel المضغوطة تالفة');
        for (var k = 0; k < length; k++) out.push(out[out.length - dist]);
      }
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(out));
  }

  function inflateRaw(bytes, method) {
    if (!bytes) return Promise.resolve('');
    if (method === 0) return Promise.resolve(new TextDecoder('utf-8').decode(bytes));
    if (method !== 8) return Promise.reject(new Error('طريقة ضغط غير مدعومة داخل ملف Excel'));
    var fallback = function () {
      try { return inflateRawJS(bytes); }
      catch (e) { throw new Error('تعذّر فك ضغط ملف Excel (' + (e && e.message ? e.message : e) + ') — افتح الملف واحفظه بصيغة CSV'); }
    };
    if (typeof DecompressionStream === 'undefined') {
      try { return Promise.resolve(fallback()); }
      catch (e2) { return Promise.reject(e2); }
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (out) {
      return new TextDecoder('utf-8').decode(new Uint8Array(out));
    }).catch(function () { return fallback(); });
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
      /* عتبة فصل الأعمدة بتتظبط على السطر نفسه: المسافات العادية بين
         الكلمات صغيرة، والفرق بين عمودين أكبر بكتير. */
      var gaps = [];
      for (var gi = 1; gi < line.items.length; gi++) {
        var gPrev = line.items[gi - 1];
        var gEnd = gPrev.x + (Number(gPrev.width) || 0);
        var g = line.items[gi].x - gEnd;
        if (g > 0) gaps.push(g);
      }
      gaps.sort(function (a, b) { return a - b; });
      var medGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 4;
      var splitGap = Math.min(22, Math.max(10, medGap * 2.3));
      line.items.forEach(function (it) {
        var chars = it.str.replace(/\s/g, '');
        total += chars.length;
        if (AR_RE.test(chars)) arabic += chars.length;
        if (prevEnd != null && (it.x - prevEnd) > splitGap) {
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
    var headerKey = '';
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var content = await page.getTextContent();
      var pageRows = groupPdfLines(content.items || []);
      pageRows.forEach(function (r, ri) {
        var key = r.map(norm).join('|');
        /* رأس الجدول بيتكرر في أول كل صفحة — ما نضيفهوش كصف عميل */
        if (ri === 0 && headerKey && key === headerKey && r.length) return;
        rows.push(r);
      });
      if (!headerKey && rows.length > 1) headerKey = rows[0].map(norm).join('|');
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
        var txt = decodeText(buffer);
        if (txt.indexOf(',') > -1 || txt.indexOf('\t') > -1) {
          return { name: name, kind: 'csv', tables: [{ name: 'البيانات', rows: parseDelimited(txt) }] };
        }
        throw e;
      }
    }
    var text = decodeText(buffer);
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
    var headerKey = headers.map(norm).join('|');
    for (var i = headerRow + 1; i < table.length; i++) {
      var row = table[i] || [];
      /* صف عناوين متكرر جوه نفس الملف (بيحصل كتير في PDF وملفات الويندوز) */
      if (headerKey && row.map(norm).join('|') === headerKey) { skipped++; continue; }
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
          rest: toNumber(cell(row, mapping.rest)),
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

    var mappedFields = Object.keys(mapping).filter(function (k) {
      return mapping[k] != null && mapping[k] >= 0;
    });

    return {
      headerRow: headerRow,
      headers: headers,
      mapping: mapping,
      mode: mode,
      records: records,
      skipped: skipped,
      mappedFields: mappedFields
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
    decodeText: decodeText,
    inflateRawJS: inflateRawJS,
    toNumber: toNumber,
    toISODate: toISODate
  };
})(typeof window !== 'undefined' ? window : globalThis);
