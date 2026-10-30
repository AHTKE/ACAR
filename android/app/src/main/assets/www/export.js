/* ============================================================
   export.js — مولّد الملفات (بدون أي مكتبة خارجية)
   • .xlsx  : OOXML/ZIP مكتوب يدوياً (store, بدون ضغط)
   • .pdf   : صفحة/صفحات بصورة JPEG مرسومة على canvas
   • الرسم : canvas — المتصفح هو اللي بيعمل تشكيل الحروف العربية
   يُصدَّر كـ global  ExportKit  وكمodule  للاختبارات.
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) module.exports = factory();
  else root.ExportKit = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PAGE_W = 595;           /* A4 بالنقاط */
  var CANVAS_W = 1240;        /* دقة الرسم */
  var JPEG_QUALITY = 0.86;

  /* ---------------------------------------------------------- نص وبايتات */
  var TEXT_ENC = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;

  function utf8(str) {
    if (TEXT_ENC) return TEXT_ENC.encode(String(str == null ? '' : str));
    var s = unescape(encodeURIComponent(String(str == null ? '' : str)));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function concat(list) {
    var len = 0, i;
    for (i = 0; i < list.length; i++) len += list[i].length;
    var out = new Uint8Array(len), off = 0;
    for (i = 0; i < list.length; i++) { out.set(list[i], off); off += list[i].length; }
    return out;
  }

  function u16(v) { var b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xFFFF, true); return b; }
  function u32(v) { var b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; }

  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  /* ---------------------------------------------------------- CRC32 */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------------------------------------------------------- ZIP (store) */
  var DOS_TIME = 0x6000;                                   /* 12:00:00 — ثابت عشان الناتج متحدّد */
  var DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;      /* 2026-01-01 */

  function zipStore(files) {
    var locals = [], centrals = [], offset = 0;

    files.forEach(function (f) {
      var nameBytes = utf8(f.name);
      var data = f.bytes;
      var crc = crc32(data);

      var local = concat([
        u32(0x04034b50), u16(20), u16(0), u16(0),
        u16(DOS_TIME), u16(DOS_DATE),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0),
        nameBytes, data
      ]);
      locals.push(local);

      centrals.push(concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0),
        u16(DOS_TIME), u16(DOS_DATE),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), u16(0),
        u16(0), u16(0), u32(0),
        u32(offset),
        nameBytes
      ]));

      offset += local.length;
    });

    var central = concat(centrals);
    var end = concat([
      u32(0x06054b50), u16(0), u16(0),
      u16(files.length), u16(files.length),
      u32(central.length), u32(offset), u16(0)
    ]);

    return concat(locals.concat([central, end]));
  }

  /* ---------------------------------------------------------- XLSX */
  var STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="6">' +
      '<font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><i/><sz val="10"/><color rgb="FF475569"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="17"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF312E81"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="6">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2FF"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="3">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right>' +
        '<top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFC7D2FE"/></left><right style="thin"><color rgb="FFC7D2FE"/></right>' +
        '<top style="medium"><color rgb="FF4F46E5"/></top><bottom style="thin"><color rgb="FFC7D2FE"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="14">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">' +
        '<alignment horizontal="center" vertical="center" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
        '<alignment horizontal="center" vertical="center" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>' +
      '<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>' +
      '<xf numFmtId="4" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="5" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
      '<xf numFmtId="4" fontId="5" fillId="5" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="right" vertical="center" readingOrder="2"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function colName(n) {
    var s = '';
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function safeSheetName(name, used) {
    var s = String(name == null ? '' : name)
      .replace(/[\\\/\?\*\[\]\:]/g, ' ')
      .replace(/[\r\n\t]/g, ' ')
      .slice(0, 31).trim() || 'Sheet';
    var base = s, i = 2;
    while (used[s]) { s = base.slice(0, 27) + ' ' + i; i++; }
    used[s] = true;
    return s;
  }

  /**
   * ورقة Excel منسّقة بالكامل:
   *   { name, title?, subtitle?, columns?, rows, widths?, moneyCols?, summary?, totalRow? }
   *   • columns موجودة  → صف رأس ملوّن + صفوف متبادلة + إجمالي + ملخص
   *   • columns غير موجودة → أول صف في rows يُعتبر رأساً (توافق النسخ القديمة)
   */
  function sheetXml(sheet) {
    var all = sheet.rows || [];
    var hasCols = !!(sheet.columns && sheet.columns.length);
    var header = hasCols ? sheet.columns.slice() : (all[0] ? all[0].slice() : []);
    var data = hasCols ? all.slice() : all.slice(1);
    var money = (sheet.moneyCols || []).slice();
    var totalCols = (sheet.totalCols || money).slice();

    var colCount = header.length;
    data.forEach(function (r) { if (r && r.length > colCount) colCount = r.length; });
    (sheet.summary || []).forEach(function () { if (colCount < 2) colCount = 2; });
    if (!colCount) colCount = 1;
    var lastCol = colName(colCount);

    var out = [];
    var merges = [];
    var r = 0;

    function cellXml(ref, value, style) {
      if (typeof value === 'number' && isFinite(value)) {
        return '<c r="' + ref + '" s="' + style + '"><v>' + value + '</v></c>';
      }
      var str = value == null ? '' : String(value);
      if (!str) return '<c r="' + ref + '" s="' + style + '"/>';
      return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
        xmlEsc(str) + '</t></is></c>';
    }

    function pushRow(cellsArr, height) {
      r++;
      out.push('<row r="' + r + '"' + (height ? ' ht="' + height + '" customHeight="1"' : '') + '>' +
        cellsArr.join('') + '</row>');
      return r;
    }

    function blankRow(height) { pushRow([], height || 6); }

    function mergedRow(text, style, height) {
      var rr = r + 1;
      pushRow([cellXml('A' + rr, text, style)], height);
      if (colCount > 1) merges.push('A' + rr + ':' + lastCol + rr);
      return rr;
    }

    /* ---------- رأس الورقة ---------- */
    if (sheet.title) mergedRow(sheet.title, 1, 42);
    if (sheet.subtitle) mergedRow(sheet.subtitle, 2, 24);
    mergedRow('نظام الإدارة المتكامل — تاريخ الإصدار: ' + new Date().toLocaleString('ar-EG'), 2, 22);
    blankRow(8);

    /* ---------- رأس الجدول ---------- */
    var headerRow = 0, firstDataRow = 0, lastDataRow = 0;
    if (header.length) {
      var hCells = [];
      for (var i = 0; i < colCount; i++) {
        hCells.push(cellXml(colName(i + 1) + (r + 1), header[i] == null ? '' : header[i], 3));
      }
      headerRow = pushRow(hCells, 30);
      firstDataRow = headerRow + 1;
    }

    /* ---------- الصفوف ---------- */
    data.forEach(function (row, ri) {
      var alt = ri % 2 === 1;
      var cells = [];
      for (var ci = 0; ci < colCount; ci++) {
        var v = row ? row[ci] : '';
        var numeric = typeof v === 'number' && isFinite(v);
        var isMoney = money.indexOf(ci) !== -1;
        var style = numeric
          ? (isMoney ? (alt ? 7 : 5) : (alt ? 13 : 12))
          : (alt ? 6 : 4);
        cells.push(cellXml(colName(ci + 1) + (r + 1), v, style));
      }
      lastDataRow = pushRow(cells, 24);
    });

    /* ---------- صف الإجمالي ---------- */
    if (sheet.totalRow !== false && data.length && totalCols.length) {
      var sums = {};
      totalCols.forEach(function (ci) {
        var s = 0, any = false;
        data.forEach(function (row) {
          var v = row ? row[ci] : null;
          if (typeof v === 'number' && isFinite(v)) { s += v; any = true; }
        });
        if (any) sums[ci] = Math.round(s * 100) / 100;
      });
      if (Object.keys(sums).length) {
        blankRow(6);
        var tRow = r + 1;
        var tCells = [];
        var labelDone = false;
        for (var cj = 0; cj < colCount; cj++) {
          var isSum = sums.hasOwnProperty(cj);
          var val = isSum ? sums[cj] : '';
          var st = isSum ? 9 : 8;
          if (!labelDone) { val = 'الإجمالي'; st = 8; labelDone = true; }
          tCells.push(cellXml(colName(cj + 1) + tRow, val, st));
        }
        pushRow(tCells, 28);
      }
    }

    /* ---------- بطاقات الملخص ---------- */
    if (sheet.summary && sheet.summary.length) {
      blankRow(10);
      var sumRow = r + 1;
      pushRow([cellXml('A' + sumRow, 'ملخّص التقرير', 10), cellXml('B' + sumRow, '', 10)], 24);
      if (colCount > 1) merges.push('A' + sumRow + ':B' + sumRow);
      (sheet.summary || []).forEach(function (s) {
        var rr = r + 1;
        pushRow([
          cellXml('A' + rr, s.label || '', 10),
          cellXml('B' + rr, s.value == null ? '' : s.value, 11)
        ], 22);
      });
    }

    /* ---------- تجميع ورقة العمل ---------- */
    var sheetPr = '<sheetPr><tabColor rgb="FF4F46E5"/></sheetPr>';
    var sheetViews = '<sheetViews><sheetView rightToLeft="1" workbookViewId="0" showGridLines="0">' +
      (headerRow ? '<pane ySplit="' + headerRow + '" topLeftCell="A' + (headerRow + 1) +
        '" activePane="bottomLeft" state="frozen"/>' : '') +
      '</sheetView></sheetViews>';
    var formatPr = '<sheetFormatPr defaultRowHeight="22" baseColWidth="12"/>';
    var colsXml = '';
    if (sheet.widths && sheet.widths.length) {
      colsXml = '<cols>' + sheet.widths.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Number(w) +
          '" customWidth="1"/>';
      }).join('') + '</cols>';
    }
    var autoFilter = (headerRow && lastDataRow >= firstDataRow)
      ? '<autoFilter ref="A' + headerRow + ':' + lastCol + lastDataRow + '"/>' : '';
    var mergesXml = merges.length
      ? '<mergeCells count="' + merges.length + '">' +
        merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') +
        '</mergeCells>'
      : '';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      sheetPr + sheetViews + formatPr + colsXml +
      '<sheetData>' + out.join('') + '</sheetData>' +
      autoFilter + mergesXml +
      '</worksheet>';
  }

  /**
   * sheets: [{ name, rows: Array<Array<string|number>>, widths?: number[] }]
   * يرجع Uint8Array لملف .xlsx فعلي
   */
  function buildXlsx(sheets) {
    var list = (sheets || []).filter(function (s) { return s && s.rows; });
    if (!list.length) list = [{ name: 'Sheet1', rows: [] }];

    var used = {};
    var names = list.map(function (s) { return safeSheetName(s.name, used); });

    var ct = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'];
    for (var i = 0; i < names.length; i++) {
      ct.push('<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
    }
    ct.push('</Types>');

    var files = [
      { name: '[Content_Types].xml', bytes: utf8(ct.join('')) },
      { name: '_rels/.rels', bytes: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>') },
      { name: 'xl/workbook.xml', bytes: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' + names.map(function (n, k) {
          return '<sheet name="' + xmlEsc(n) + '" sheetId="' + (k + 1) + '" r:id="rId' + (k + 1) + '"/>';
        }).join('') + '</sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', bytes: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names.map(function (n, k) {
          return '<Relationship Id="rId' + (k + 1) + '" ' +
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
            'Target="worksheets/sheet' + (k + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>') },
      { name: 'xl/styles.xml', bytes: utf8(STYLES_XML) }
    ];

    list.forEach(function (s, k) {
      files.push({
        name: 'xl/worksheets/sheet' + (k + 1) + '.xml',
        bytes: utf8(sheetXml(s))
      });
    });

    return zipStore(files);
  }

  /* ---------------------------------------------------------- PDF */
  function contentStream(pageW, pageH) {
    return 'q ' + pageW + ' 0 0 ' + pageH + ' 0 0 cm /Im0 Do Q';
  }

  /**
   * pages: [{ jpeg: Uint8Array, width, height }]   — نسب A4
   * يرجع Uint8Array لملف .pdf فعلي (DCTDecode = JPEG)
   */
  function buildPdf(pages) {
    if (!pages || !pages.length) return null;
    for (var c = 0; c < pages.length; c++) {
      if (!pages[c] || !pages[c].jpeg || !pages[c].jpeg.length) return null;
    }

    var n = pages.length;
    var total = 2 + 3 * n;
    var parts = new Array(total + 1);

    var kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + 3 * i) + ' 0 R');

    parts[1] = { text: '<< /Type /Catalog /Pages 2 0 R >>' };
    parts[2] = { text: '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>' };

    for (i = 0; i < n; i++) {
      var p = pages[i];
      var pageH = Math.round((PAGE_W * p.height / p.width) * 100) / 100;
      var pg = 3 + 3 * i, im = 4 + 3 * i, ct = 5 + 3 * i;
      var stream = contentStream(PAGE_W, pageH);

      parts[pg] = { text: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + pageH + '] ' +
        '/Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>' };
      parts[im] = {
        text: '<< /Type /XObject /Subtype /Image /Width ' + p.width + ' /Height ' + p.height +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>',
        stream: p.jpeg
      };
      parts[ct] = { text: '<< /Length ' + stream.length + ' >>', stream: utf8(stream) };
    }

    var chunks = [], pos = 0, offsets = new Array(total + 1);
    function pushBytes(b) { chunks.push(b); pos += b.length; }
    function pushStr(s) { var b = utf8(s); pushBytes(b); }

    pushStr('%PDF-1.4\n');

    for (var num = 1; num <= total; num++) {
      offsets[num] = pos;
      pushStr(num + ' 0 obj\n');
      pushStr(parts[num].text);
      if (parts[num].stream) { pushStr('\nstream\n'); pushBytes(parts[num].stream); pushStr('\nendstream'); }
      pushStr('\nendobj\n');
    }

    var xrefPos = pos;
    var xref = ['xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n'];
    for (num = 1; num <= total; num++) {
      xref.push(String(offsets[num]).padStart(10, '0') + ' 00000 n \n');
    }
    xref.push('trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');
    pushStr(xref.join(''));

    return concat(chunks);
  }

  /* ---------------------------------------------------------- رسم التقرير */
  function hasCanvas() {
    if (typeof document === 'undefined') return false;
    try {
      var c = document.createElement('canvas');
      return !!(c && typeof c.getContext === 'function' && c.getContext('2d'));
    } catch (e) { return false; }
  }

  function fitText(ctx, text, maxW) {
    var s = String(text == null ? '' : text);
    if (ctx.measureText(s).width <= maxW) return s;
    var suffix = '...';
    while (s.length > 1 && ctx.measureText(s + suffix).width > maxW) s = s.slice(0, -1);
    return s + suffix;
  }

  /* تحويل خلايا التقرير إلى نصوص للعرض (الأعمدة المالية تأخذ فواصل الآلاف) */
  function buildGrid(report) {
    var cols = report.columns || [];
    var money = report.moneyCols || [];
    return (report.rows || []).map(function (row) {
      var out = [];
      for (var i = 0; i < cols.length; i++) {
        var v = row[i];
        if (money.indexOf(i) !== -1 && typeof v === 'number' && isFinite(v)) {
          out.push(v.toLocaleString('en-US', { maximumFractionDigits: 2 }));
        } else {
          out.push(v == null ? '' : String(v));
        }
      }
      return out;
    });
  }

  /* عرض الأعمدة بدل التوزيع بالتساوي — بناءً على العرض الحقيقي بالبكسل */
  function columnWidths(report, grid, available, ctx) {
    var cols = report.columns || [];
    if (!cols.length || !ctx) return [];

    ctx.font = HEADER_FONT;
    var need = cols.map(function (label, i) {
      var max = ctx.measureText(String(label == null ? '' : label)).width;
      ctx.font = BODY_FONT;
      for (var r = 0; r < grid.length; r++) {
        var w = ctx.measureText(String(grid[r][i] == null ? '' : grid[r][i])).width;
        if (w > max) max = w;
      }
      ctx.font = HEADER_FONT;
      return max + 20; /* هامش داخلي من الجهتين */
    });

    /* الحد الأدنى: ما يقلّش عن عمود ضيّق */
    var minW = cols.length > 1 ? Math.min(56, available / 2) : available;
    need = need.map(function (w) { return Math.max(minW, w); });

    var sum = 0;
    need.forEach(function (w) { sum += w; });
    if (sum <= 0) return cols.map(function () { return available / cols.length; });

    /* لو المحتوى أوسع من الصفحة نصغّر بالتساوي النسبي (يسبّب قصّ محدود) */
    var k = available / sum;
    return need.map(function (w) { return w * k; });
  }

  var FONT = '"Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif';
  /* خطا القياس لازم يطابق خطا الرسم بالظبط */
  var HEADER_FONT = '700 21px ' + FONT;
  var BODY_FONT = '400 20px ' + FONT;

  /**
   * report: {
   *   title, subtitle,
   *   columns: [label, ...],
   *   rows: [[cell, ...], ...],
   *   summary?: [{label, value}]
   * }
   * يرجع مصفوفة canvases (صفحة لكل جزء) أو null لو مفيش canvas
   */
  function drawReportPages(report) {
    if (!report || !hasCanvas()) return null;

    var W = CANVAS_W, H = 1755, M = 56;
    var pages = [];
    var canvas = null, ctx = null, y = 0;
    var cols = report.columns || [];
    var grid = buildGrid(report);
    var moneyIdx = report.moneyCols || [];
    var totalIdx = report.totalCols || moneyIdx;
    var showTotals = report.totalRow !== false;
    var headerH = 58, rowH = 44;

    var C = {
      ink: '#0f172a', body: '#1f2937', soft: '#475569', muted: '#94a3b8',
      line: '#e2e8f0', brand: '#4f46e5', brand2: '#312e81', brandSoft: '#eef2ff',
      zebra: '#f8fafc', white: '#ffffff', green: '#047857', red: '#b91c1c',
      cardBg: '#f8faff', cardLine: '#dfe5ff'
    };

    /* ---------- قياس الأعمدة ---------- */
    var probe = document.createElement('canvas');
    probe.width = 4; probe.height = 4;
    var pctx = probe.getContext('2d');

    function measureWidths(fHead, fBody) {
      pctx.font = fHead;
      return cols.map(function (label, i) {
        var max = pctx.measureText(String(label == null ? '' : label)).width;
        pctx.font = fBody;
        for (var r = 0; r < grid.length; r++) {
          var w = pctx.measureText(String(grid[r][i] == null ? '' : grid[r][i])).width;
          if (w > max) max = w;
        }
        pctx.font = fHead;
        return max + 26;
      });
    }

    var MAX_W = 4600;
    var fHeader = HEADER_FONT, fBody = BODY_FONT;
    var widths = measureWidths(fHeader, fBody);
    var sum = 0;
    widths.forEach(function (w) { sum += w; });

    if (sum + 2 * M > MAX_W) {
      var sc = Math.max(0.5, (MAX_W - 2 * M) / sum);
      fHeader = '700 ' + Math.max(12, Math.round(21 * sc)) + 'px ' + FONT;
      fBody = '400 ' + Math.max(12, Math.round(20 * sc)) + 'px ' + FONT;
      widths = measureWidths(fHeader, fBody);
      sum = 0;
      widths.forEach(function (w) { sum += w; });
    }
    if (sum + 2 * M > W) W = Math.ceil(sum + 2 * M);

    var rightEdges = [];
    (function () {
      var acc = W - M;
      for (var i = 0; i < widths.length; i++) { rightEdges.push(acc); acc -= widths[i]; }
    })();
    var tableW = W - 2 * M;

    var stamp = new Date().toLocaleString('ar-EG');
    var totals = (function () {
      var sums = {}, has = false;
      totalIdx.forEach(function (ci) {
        var s = 0, any = false;
        (report.rows || []).forEach(function (row) {
          var v = row ? row[ci] : null;
          if (typeof v === 'number' && isFinite(v)) { s += v; any = true; }
        });
        if (any) { sums[ci] = s; has = true; }
      });
      return has ? sums : null;
    })();

    function roundRect(c, x0, y0, w0, h0, rr) {
      c.beginPath();
      c.moveTo(x0 + rr, y0);
      c.lineTo(x0 + w0 - rr, y0);
      c.quadraticCurveTo(x0 + w0, y0, x0 + w0, y0 + rr);
      c.lineTo(x0 + w0, y0 + h0 - rr);
      c.quadraticCurveTo(x0 + w0, y0 + h0, x0 + w0 - rr, y0 + h0);
      c.lineTo(x0 + rr, y0 + h0);
      c.quadraticCurveTo(x0, y0 + h0, x0, y0 + h0 - rr);
      c.lineTo(x0, y0 + rr);
      c.quadraticCurveTo(x0, y0, x0 + rr, y0);
      c.closePath();
    }

    /* ---------- رأس الصفحة (هوية التطبيق) ---------- */
    function drawBand(isFirst) {
      var bh = isFirst ? 134 : 88;
      var g = ctx.createLinearGradient(0, 0, W, bh);
      g.addColorStop(0, C.brand2);
      g.addColorStop(1, C.brand);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, bh);

      /* شريط تمييز سفلي */
      ctx.fillStyle = '#a5b4fc';
      ctx.fillRect(0, bh - 5, W, 5);

      ctx.textAlign = 'right';
      ctx.direction = 'rtl';
      if (isFirst) {
        ctx.fillStyle = 'rgba(255,255,255,.78)';
        ctx.font = '600 20px ' + FONT;
        ctx.fillText('نظام الإدارة المتكامل', W - M, 38);

        ctx.fillStyle = C.white;
        ctx.font = '800 40px ' + FONT;
        ctx.fillText(report.title || '', W - M, 88);

        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,.82)';
        ctx.font = '400 18px ' + FONT;
        ctx.fillText(stamp, M, 40);
        if (report.subtitle) {
          ctx.fillStyle = 'rgba(255,255,255,.92)';
          ctx.font = '400 19px ' + FONT;
          ctx.fillText(report.subtitle, M, 76);
        }
      } else {
        ctx.fillStyle = C.white;
        ctx.font = '800 28px ' + FONT;
        ctx.fillText((report.title || '') + ' — تكملة', W - M, 56);

        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.font = '400 16px ' + FONT;
        ctx.fillText(stamp, M, 56);
      }
      ctx.textAlign = 'right';
      y = bh + 30;
    }

    /* ---------- بطاقات الملخص ---------- */
    function drawCards() {
      var list = report.summary || [];
      if (!list.length) return;
      var gap = 14;
      var gapW = tableW - gap * (list.length - 1);
      var cw = Math.floor(gapW / list.length);
      var ch = 96;
      var xRight = W - M;
      var accents = [C.brand, C.green, C.red, C.brand2, C.soft, C.green];
      list.forEach(function (s, i) {
        var x0 = xRight - cw;
        roundRect(ctx, x0, y, cw, ch, 14);
        ctx.fillStyle = C.cardBg;
        ctx.fill();
        ctx.strokeStyle = C.cardLine;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        /* شريط لوني أعلى البطاقة */
        ctx.fillStyle = accents[i % accents.length];
        roundRect(ctx, x0 + 1.5, y + 1.5, cw - 3, 5, 3);
        ctx.fill();

        ctx.textAlign = 'right';
        ctx.fillStyle = C.soft;
        ctx.font = '400 17px ' + FONT;
        ctx.fillText(String(s.label || ''), x0 + cw - 14, y + 34);

        ctx.fillStyle = (i === 1 ? C.green : i === 2 ? C.red : C.ink);
        ctx.font = '800 25px ' + FONT;
        ctx.fillText(String(s.value == null ? '' : s.value), x0 + cw - 14, y + 72);

        xRight = x0 - gap;
      });
      y += ch + 26;
    }

    /* ---------- رأس جدول البيانات ---------- */
    function drawTableHead() {
      roundRect(ctx, M, y, tableW, headerH, 12);
      ctx.fillStyle = C.brand;
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(M + 12, y + headerH - 6, tableW - 24, 3);

      ctx.fillStyle = C.white;
      ctx.font = fHeader;
      ctx.textAlign = 'right';
      cols.forEach(function (label, i) {
        ctx.fillText(String(label == null ? '' : label), rightEdges[i] - 12, y + headerH / 2 + 7);
      });
      y += headerH;
    }

    /* ---------- صف الإجمالي ---------- */
    function drawTotals() {
      if (!totals || !showTotals) return;
      if (y + 52 > H - 84) newPage(false);
      ctx.fillStyle = C.brandSoft;
      ctx.fillRect(M, y, tableW, 46);
      ctx.fillStyle = C.brand;
      ctx.fillRect(M, y, tableW, 3);

      ctx.font = '700 19px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillStyle = C.brand2;
      ctx.fillText('الإجمالي', rightEdges[0] - 12, y + 31);

      cols.forEach(function (label, i) {
        if (!totals.hasOwnProperty(i)) return;
        ctx.fillStyle = C.brand2;
        ctx.font = '700 19px ' + FONT;
        ctx.fillText(totals[i].toLocaleString('en-US', { maximumFractionDigits: 2 }),
          rightEdges[i] - 12, y + 31);
      });
      y += 46;
    }

    /* ---------- صفحة جديدة ---------- */
    function newPage(isFirst) {
      canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = C.white;
      ctx.fillRect(0, 0, W, H);
      pages.push(canvas);

      ctx.textAlign = 'right';
      ctx.direction = 'rtl';
      drawBand(isFirst);
      if (isFirst) drawCards();
      drawTableHead();
    }

    newPage(true);

    /* ---------- الصفوف ---------- */
    grid.forEach(function (row, ri) {
      if (y + rowH > H - 96) newPage(false);
      if (ri % 2 === 1) {
        ctx.fillStyle = C.zebra;
        ctx.fillRect(M, y, tableW, rowH);
      }
      ctx.font = fBody;
      ctx.fillStyle = C.body;
      ctx.textAlign = 'right';
      cols.forEach(function (label, i) {
        ctx.fillText(row[i], rightEdges[i] - 12, y + rowH / 2 + 7);
      });

      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(M, y + rowH + 0.5);
      ctx.lineTo(W - M, y + rowH + 0.5);
      ctx.stroke();

      y += rowH;
    });

    if (!grid.length) {
      ctx.fillStyle = C.muted;
      ctx.font = '400 22px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('لا توجد بيانات مسجّلة في هذا القسم', W / 2, y + 46);
      y += 70;
    } else {
      drawTotals();
    }

    /* ---------- تذييل كل صفحة ---------- */
    pages.forEach(function (cv, i) {
      var c2 = cv.getContext('2d');
      var fy = cv.height - 52;
      c2.strokeStyle = C.line;
      c2.lineWidth = 1;
      c2.beginPath();
      c2.moveTo(M, fy - 18.5);
      c2.lineTo(cv.width - M, fy - 18.5);
      c2.stroke();

      c2.fillStyle = C.muted;
      c2.font = '400 16px ' + FONT;
      c2.textAlign = 'right';
      c2.fillText('نظام الإدارة المتكامل — ' + (report.title || ''), cv.width - M, fy);

      c2.textAlign = 'center';
      c2.fillStyle = C.soft;
      c2.fillText(stamp, cv.width / 2, fy);

      /* شارة رقم الصفحة */
      var lbl = 'صفحة ' + (i + 1) + ' من ' + pages.length;
      c2.font = '700 15px ' + FONT;
      var lw = c2.measureText(lbl).width + 24;
      roundRect(c2, M, fy - 20, lw, 26, 8);
      c2.fillStyle = C.brandSoft;
      c2.fill();
      c2.fillStyle = C.brand2;
      c2.textAlign = 'center';
      c2.fillText(lbl, M + lw / 2, fy - 1);
    });

    return pages;
  }

  /* canvas → bytes JPEG */
  function canvasJpeg(canvas) {
    try {
      var dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      var i = dataUrl.indexOf(',');
      if (i < 0) return null;
      var b64 = dataUrl.slice(i + 1);
      if (typeof atob === 'function') {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
        return out;
      }
      if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
      return null;
    } catch (e) { return null; }
  }

  /** canvases → PDF bytes */
  function canvasesToPdf(canvases) {
    if (!canvases || !canvases.length) return null;
    var pages = [];
    for (var i = 0; i < canvases.length; i++) {
      var jpeg = canvasJpeg(canvases[i]);
      if (!jpeg) return null;
      pages.push({ jpeg: jpeg, width: canvases[i].width, height: canvases[i].height });
    }
    return buildPdf(pages);
  }

  /** تقرير → PDF bytes (رسم + ترميز) */
  function reportToPdf(report) {
    var pages = drawReportPages(report);
    if (!pages) return null;
    return canvasesToPdf(pages);
  }

  /* ---------------------------------------------------------- التحميل */
  function downloadBytes(bytes, filename, mime) {
    try {
      if (typeof document === 'undefined' || !bytes) return false;
      if (typeof Blob === 'undefined' || typeof URL === 'undefined' ||
          typeof URL.createObjectURL !== 'function') return false;
      var blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) { return false; }
  }

  /** Uint8Array → base64 (لرفعه على السيرفر) */
  function bytesToBase64(bytes) {
    if (!bytes) return '';
    try {
      if (typeof Buffer !== 'undefined' && !hasCanvas()) return Buffer.from(bytes).toString('base64');
    } catch (e) {}
    var s = '';
    var CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return (typeof btoa === 'function') ? btoa(s) : '';
  }

  return {
    PAGE_W: PAGE_W,
    CANVAS_W: CANVAS_W,
    crc32: crc32,
    zipStore: zipStore,
    utf8: utf8,
    buildXlsx: buildXlsx,
    buildPdf: buildPdf,
    colName: colName,
    hasCanvas: hasCanvas,
    drawReportPages: drawReportPages,
    canvasesToPdf: canvasesToPdf,
    reportToPdf: reportToPdf,
    downloadBytes: downloadBytes,
    bytesToBase64: bytesToBase64
  };
}));
