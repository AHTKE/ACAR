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
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
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

  function sheetXml(rows, widths) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];

    if (widths && widths.length) {
      out.push('<cols>');
      widths.forEach(function (w, i) {
        out.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Number(w) + '" customWidth="1"/>');
      });
      out.push('</cols>');
    }

    out.push('<sheetData>');
    (rows || []).forEach(function (row, ri) {
      var r = ri + 1;
      out.push('<row r="' + r + '">');
      (row || []).forEach(function (cell, ci) {
        var ref = colName(ci + 1) + r;
        if (typeof cell === 'number' && isFinite(cell)) {
          out.push('<c r="' + ref + '"><v>' + cell + '</v></c>');
        } else {
          out.push('<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
            xmlEsc(cell == null ? '' : cell) + '</t></is></c>');
        }
      });
      out.push('</row>');
    });
    out.push('</sheetData></worksheet>');
    return out.join('');
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
        bytes: utf8(sheetXml(s.rows, s.widths))
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

  /* تقسيم النص لأسطر تناسب العرض المطلوب — بدون فقد أي حرف */
  function wrapText(ctx, text, maxW) {
    var s = String(text == null ? '' : text);
    if (!s) return [''];
    if (maxW <= 0) return [s];
    if (ctx.measureText(s).width <= maxW) return [s];
    var words = s.split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width <= maxW) {
        line = test;
      } else {
        if (line) lines.push(line);
        if (ctx.measureText(words[i]).width <= maxW) {
          line = words[i];
        } else {
          var chunk = '', w = words[i];
          for (var j = 0; j < w.length; j++) {
            if (ctx.measureText(chunk + w[j]).width <= maxW) chunk += w[j];
            else { if (chunk) lines.push(chunk); chunk = w[j]; }
          }
          line = chunk;
        }
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [s];
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

    var W = CANVAS_W, H = 1755, M = 64;
    var pages = [];
    var canvas = null, ctx = null, y = 0;
    var cols = report.columns || [];
    var grid = buildGrid(report);
    var headerH = 62, minRowH = 46, lineH = 28;

    /* مساحة القياس: عرض الأعمدة يتحسب بالبكسل الحقيقي */
    var probe = document.createElement('canvas');
    probe.width = 4; probe.height = 4;
    var pctx = probe.getContext('2d');
    var widths = columnWidths(report, grid, W - 2 * M, pctx);

    /* تقسيم كل خلية لأسطر تناسب عرض عمودها — بدون أي قص */
    pctx.font = BODY_FONT;
    var wrapped = grid.map(function (row) {
      return row.map(function (cell, i) {
        return wrapText(pctx, cell, widths[i] - 22);
      });
    });

    /* محاذاة الأعمدة من اليمين لليسار (عربي) */
    var rightEdges = [];
    (function () {
      var acc = W - M;
      for (var i = 0; i < widths.length; i++) { rightEdges.push(acc); acc -= widths[i]; }
    })();

    function newPage(isFirst) {
      canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      pages.push(canvas);
      y = M;

      ctx.textAlign = 'right';
      ctx.direction = 'rtl';

      ctx.fillStyle = '#111827';
      ctx.font = '800 40px ' + FONT;
      ctx.fillText(report.title || '', W - M, y + 40);
      y += 54;

      if (report.subtitle) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '400 22px ' + FONT;
        ctx.fillText(report.subtitle, W - M, y + 24);
        y += 40;
      }

      if (isFirst && report.summary && report.summary.length) {
        var boxW = Math.floor((W - 2 * M - (report.summary.length - 1) * 14) / report.summary.length);
        var boxX = W - M;
        report.summary.forEach(function (s) {
          var x0 = boxX - boxW;
          ctx.fillStyle = '#f3f4f6';
          ctx.fillRect(x0, y, boxW, 84);
          ctx.fillStyle = '#6b7280';
          ctx.font = '400 18px ' + FONT;
          ctx.fillText(String(s.label), boxX - 16, y + 30);
          ctx.fillStyle = '#111827';
          ctx.font = '800 26px ' + FONT;
          ctx.fillText(String(s.value), boxX - 16, y + 66);
          boxX = x0 - 14;
        });
        y += 100;
      }

      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(M, y, W - 2 * M, headerH);
      ctx.fillStyle = '#ffffff';
      ctx.font = HEADER_FONT;
      cols.forEach(function (label, i) {
        ctx.fillText(fitText(ctx, label, widths[i] - 22), rightEdges[i] - 11, y + headerH / 2 + 8);
      });
      y += headerH;
    }

    newPage(true);

    wrapped.forEach(function (cellLines, ri) {
      /* ارتفاع الصف حسب أكبر عدد أسطر — لا نقص أي محتوى */
      var maxLines = 1;
      cellLines.forEach(function (ls) { if (ls.length > maxLines) maxLines = ls.length; });
      var rowH = Math.max(minRowH, maxLines * lineH + 14);
      if (y + rowH > H - M) {
        newPage(false);
        if (y + rowH > H - M) rowH = Math.max(minRowH, H - M - y);
      }

      if (ri % 2 === 1) {
        ctx.fillStyle = '#f9fafb';
        ctx.fillRect(M, y, W - 2 * M, rowH);
      }

      ctx.font = BODY_FONT;
      cols.forEach(function (label, i) {
        var lines = cellLines[i];
        var blockH = lines.length * lineH;
        var startY = y + (rowH - blockH) / 2;
        ctx.fillStyle = '#111827';
        for (var li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], rightEdges[i] - 11, startY + li * lineH + lineH * 0.72);
        }
      });

      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(M, y + rowH + 0.5);
      ctx.lineTo(W - M, y + rowH + 0.5);
      ctx.stroke();

      y += rowH;
    });

    if (!grid.length) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '400 22px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('لا توجد بيانات', W / 2, y + 40);
    }

    /* تذييل: رقم الصفحة */
    pages.forEach(function (cv, i) {
      var c2 = cv.getContext('2d');
      c2.fillStyle = '#9ca3af';
      c2.font = '400 18px ' + FONT;
      c2.textAlign = 'left';
      c2.fillText('صفحة ' + (i + 1) + ' من ' + pages.length, M, cv.height - 34);
      c2.textAlign = 'right';
      c2.fillText(report.title || '', cv.width - M, cv.height - 34);
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
