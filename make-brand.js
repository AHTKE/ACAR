/* ============================================================
   make-brand.js — توليد أصول الهوية
   ------------------------------------------------------------
   • أيقونة/غلاف التطبيق: WorkFlow (أزرق/ذهبي)
   • شعار الشركة: AW (بنفسجي/سماوي)
   التشغيل: node make-brand.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas, registerFont } = require('canvas');

const ROOT = __dirname;
const FONT_PATH = path.join(ROOT, '.fonts/Poppins-Bold.ttf');
const BRAND_FONT = fs.existsSync(FONT_PATH) ? 'WorkflowSans' : 'Arial';
if (fs.existsSync(FONT_PATH)) registerFont(FONT_PATH, { family: 'WorkflowSans', weight: 'bold' });
const NAVY = '#071f57';
const GOLD = ['#fff0b0', '#ffd34d', '#dc9b0b'];

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function goldGrad(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD[0]);
  g.addColorStop(0.48, GOLD[1]);
  g.addColorStop(1, GOLD[2]);
  return g;
}

/* ====================== أيقونة WorkFlow ====================== */
function drawWorkflow(size, opts) {
  const o = opts || {};
  const S = size;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  const u = S / 1024;

  ctx.save();
  ctx.scale(u, u);

  /* الخلفية اللامعة */
  function paintBackground() {
    const bg = ctx.createRadialGradient(380, 260, 40, 520, 560, 930);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.22, '#f4faff');
    bg.addColorStop(0.48, '#d8eafa');
    bg.addColorStop(0.70, '#94bde8');
    bg.addColorStop(0.87, '#3f79c8');
    bg.addColorStop(1, '#0b2c6c');
    ctx.fillStyle = bg;
    if (o.maskable) ctx.fillRect(0, 0, 1024, 1024);
    else { roundRect(ctx, 0, 0, 1024, 1024, 222); ctx.fill(); }

    /* لمعة زجاجية أعلى اليسار */
    const gloss = ctx.createRadialGradient(300, 180, 20, 300, 180, 560);
    gloss.addColorStop(0, 'rgba(255,255,255,0.82)');
    gloss.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, 1024, 1024);

    /* إطار أزرق داخلي */
    ctx.strokeStyle = 'rgba(10,54,140,0.45)';
    ctx.lineWidth = 26;
    roundRect(ctx, 16, 16, 992, 992, 210);
    ctx.stroke();

    /* إطار ذهبي */
    ctx.save();
    ctx.shadowColor = 'rgba(190,120,0,0.35)';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = goldGrad(ctx, 0, 0, 1024, 1024);
    ctx.lineWidth = 15;
    roundRect(ctx, 40, 40, 944, 944, 190);
    ctx.stroke();
    ctx.restore();

    /* خط أبيض رفيع داخل الإطار */
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    roundRect(ctx, 58, 58, 908, 908, 174);
    ctx.stroke();
  }

  paintBackground();

  if (o.maskable) {
    ctx.translate(92, 92);
    ctx.scale(0.82, 0.82);
  }

  /* مسار ذهبي دائري حول العناصر */
  ctx.save();
  ctx.strokeStyle = goldGrad(ctx, 90, 120, 920, 820);
  ctx.lineWidth = 11;
  ctx.shadowColor = 'rgba(202,142,10,0.35)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.ellipse(512, 500, 402, 320, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  /* ظل أرضي */
  const floor = ctx.createRadialGradient(510, 780, 20, 510, 780, 360);
  floor.addColorStop(0, 'rgba(8,28,70,0.28)');
  floor.addColorStop(1, 'rgba(8,28,70,0)');
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.ellipse(510, 790, 340, 72, 0, 0, Math.PI * 2);
  ctx.fill();

  /* الأعمدة البيانية ثلاثية الأبعاد */
  function bar(x, y, w, h, topColor, frontTop, frontBottom) {
    const side = 20;
    const cap = 22;

    /* الوجه الأيمن */
    const sideGrad = ctx.createLinearGradient(x + w, y, x + w + side, y + h);
    sideGrad.addColorStop(0, '#0a3c9e');
    sideGrad.addColorStop(1, '#06225d');
    ctx.fillStyle = sideGrad;
    ctx.beginPath();
    ctx.moveTo(x + w, y + cap);
    ctx.lineTo(x + w + side, y + cap - 8);
    ctx.lineTo(x + w + side, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();

    /* الوجه الأمامي */
    const front = ctx.createLinearGradient(x, y, x, y + h);
    front.addColorStop(0, frontTop);
    front.addColorStop(1, frontBottom);
    ctx.fillStyle = front;
    roundRect(ctx, x, y, w, h, cap);
    ctx.fill();

    /* الوجه العلوي */
    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + cap);
    ctx.lineTo(x + cap, y + 2);
    ctx.lineTo(x + w + 10, y - 6);
    ctx.lineTo(x + w - 12, y + cap);
    ctx.closePath();
    ctx.fill();

    /* لمعة رأسية */
    const shine = ctx.createLinearGradient(x + w * 0.2, y, x + w * 0.2, y + h);
    shine.addColorStop(0, 'rgba(255,255,255,0.52)');
    shine.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    roundRect(ctx, x + 9, y + 8, w * 0.22, h - 16, 12);
    ctx.fill();
  }

  bar(334, 515, 98, 244, '#8bd6ff', '#3aa9ff', '#0b3a9a');
  bar(468, 402, 110, 357, '#9fe1ff', '#4db8ff', '#0a338c');
  bar(614, 465, 104, 294, '#84d1ff', '#36a3ff', '#0a3288');

  /* سهم ذهبي صاعد */
  function arrowPath() {
    ctx.beginPath();
    ctx.moveTo(252, 772);
    ctx.bezierCurveTo(430, 834, 718, 796, 762, 590);
    ctx.bezierCurveTo(790, 460, 786, 382, 818, 332);
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#9b6200';
  ctx.lineWidth = 90;
  arrowPath();
  ctx.stroke();
  ctx.strokeStyle = goldGrad(ctx, 250, 760, 825, 320);
  ctx.lineWidth = 70;
  arrowPath();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 11;
  arrowPath();
  ctx.stroke();
  ctx.restore();

  /* رأس السهم */
  ctx.save();
  ctx.translate(824, 320);
  ctx.rotate(-0.92);
  ctx.fillStyle = goldGrad(ctx, -80, -60, 20, 60);
  ctx.strokeStyle = '#9b6200';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-84, -62);
  ctx.lineTo(-58, 0);
  ctx.lineTo(-84, 62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  /* أيقونات داخل دوائر */
  function chip(cx, cy, r, painter) {
    ctx.save();
    ctx.shadowColor = 'rgba(9,30,70,0.28)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 9;
    const fill = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.42, 4, cx, cy, r);
    fill.addColorStop(0, '#ffffff');
    fill.addColorStop(0.68, '#f7fbff');
    fill.addColorStop(1, '#d7e5f4');
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = goldGrad(ctx, cx - r, cy - r, cx + r, cy + r);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    painter(ctx, r);
    ctx.restore();
  }

  function handshake(ctx, r) {
    const k = r / 95;
    ctx.scale(k, k);
    ctx.strokeStyle = '#0b2b66';
    ctx.fillStyle = '#0b2b66';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* الذراعان */
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(-66, 24); ctx.lineTo(-28, 2);
    ctx.moveTo(66, 24); ctx.lineTo(28, 2);
    ctx.stroke();

    /* الأساور */
    ctx.save();
    ctx.translate(-60, 18); ctx.rotate(-0.36);
    roundRect(ctx, -9, -9, 18, 18, 5); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(60, 18); ctx.rotate(0.36);
    roundRect(ctx, -9, -9, 18, 18, 5); ctx.fill();
    ctx.restore();

    /* الكفان المتشابكان بميل واضح */
    ctx.save();
    ctx.translate(-8, 1); ctx.rotate(-0.62);
    roundRect(ctx, -25, -11, 40, 23, 11); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(8, 1); ctx.rotate(0.62);
    roundRect(ctx, -15, -11, 40, 23, 11); ctx.fill();
    ctx.restore();

    /* فواصل الأصابع */
    ctx.strokeStyle = '#f7fbff';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-14 + i * 9, -13);
      ctx.lineTo(-8 + i * 9, 13);
      ctx.stroke();
    }
  }

  function person(ctx, r) {
    const k = r / 88;
    ctx.scale(k, k);
    ctx.fillStyle = '#0b2b66';
    ctx.beginPath(); ctx.arc(0, -28, 21, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 30, 33, 27, 0, Math.PI, 0); ctx.fill();
    /* قميص أبيض وربطة عنق */
    ctx.fillStyle = '#f7fbff';
    ctx.beginPath();
    ctx.moveTo(-15, 8); ctx.lineTo(0, 36); ctx.lineTo(15, 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0b2b66';
    ctx.beginPath();
    ctx.moveTo(-4, 12); ctx.lineTo(0, 8); ctx.lineTo(4, 12);
    ctx.lineTo(2, 31); ctx.lineTo(-2, 31);
    ctx.closePath(); ctx.fill();
  }

  function people(ctx, r) {
    const k = r / 90;
    ctx.scale(k, k);
    ctx.fillStyle = '#0b2b66';
    ctx.beginPath(); ctx.arc(0, -22, 22, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-38, -8, 16, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(38, -8, 16, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 34, 35, 28, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-44, 34, 26, 21, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(44, 34, 26, 21, 0, Math.PI, 0); ctx.fill();
  }

  function invoice(ctx, r) {
    const k = r / 95;
    ctx.scale(k, k);
    ctx.strokeStyle = '#0b2b66';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    roundRect(ctx, -32, -48, 66, 92, 9);
    ctx.stroke();
    ctx.fillStyle = '#0b2b66';
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, -16, -26 + i * 19, 34, 7, 3);
      ctx.fill();
    }
    ctx.fillStyle = '#f6c62e';
    ctx.beginPath(); ctx.arc(39, 34, 24, 0, 7); ctx.fill();
    ctx.fillStyle = '#0b2b66';
    ctx.font = 'bold 30px ' + BRAND_FONT + ', Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 39, 35);
  }

  function box(ctx, r) {
    const k = r / 88;
    ctx.scale(k, k);
    ctx.strokeStyle = '#0b2b66';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -45); ctx.lineTo(44, -20); ctx.lineTo(44, 38);
    ctx.lineTo(0, 62); ctx.lineTo(-44, 38); ctx.lineTo(-44, -20);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-44, -20); ctx.lineTo(0, 4); ctx.lineTo(44, -20);
    ctx.moveTo(0, 4); ctx.lineTo(0, 62);
    ctx.stroke();
    ctx.fillStyle = '#f6c62e';
    ctx.beginPath();
    ctx.moveTo(-24, -34); ctx.lineTo(0, -48); ctx.lineTo(24, -34);
    ctx.lineTo(0, -20);
    ctx.closePath();
    ctx.fill();
  }

  function calendar(ctx, r) {
    const k = r / 90;
    ctx.scale(k, k);
    ctx.strokeStyle = '#0b2b66';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    roundRect(ctx, -44, -38, 82, 76, 10);
    ctx.stroke();
    ctx.fillStyle = '#0b2b66';
    ctx.fillRect(-30, -52, 10, 22);
    ctx.fillRect(28, -52, 10, 22);
    ctx.fillRect(-44, -20, 82, 8);
    ctx.fillStyle = '#f6c62e';
    ctx.beginPath(); ctx.arc(32, 34, 24, 0, 7); ctx.fill();
    ctx.strokeStyle = '#0b2b66';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(32, 34, 16, 0, 7);
    ctx.moveTo(32, 34); ctx.lineTo(32, 23);
    ctx.moveTo(32, 34); ctx.lineTo(41, 39);
    ctx.stroke();
  }

  function chart(ctx, r) {
    const k = r / 90;
    ctx.scale(k, k);
    ctx.fillStyle = '#0b2b66';
    roundRect(ctx, -44, 8, 24, 38, 5); ctx.fill();
    roundRect(ctx, -12, -14, 24, 60, 5); ctx.fill();
    roundRect(ctx, 20, -32, 24, 78, 5); ctx.fill();
    ctx.strokeStyle = '#f6c62e';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-40, 2); ctx.lineTo(-8, -24); ctx.lineTo(18, -36);
    ctx.stroke();
    ctx.fillStyle = '#f6c62e';
    ctx.beginPath();
    ctx.moveTo(32, -48); ctx.lineTo(16, -42); ctx.lineTo(28, -30);
    ctx.closePath(); ctx.fill();
  }

  chip(250, 272, 96, handshake);
  chip(166, 500, 86, person);
  chip(512, 174, 90, people);
  chip(774, 272, 96, invoice);
  chip(856, 500, 88, box);
  chip(762, 704, 88, calendar);
  chip(260, 704, 88, chart);

  /* شريط الاسم */
  ctx.save();
  ctx.shadowColor = 'rgba(4,20,55,0.45)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  const pill = ctx.createLinearGradient(180, 800, 844, 950);
  pill.addColorStop(0, '#08265f');
  pill.addColorStop(0.50, '#0b3b8e');
  pill.addColorStop(1, '#061b48');
  ctx.fillStyle = pill;
  roundRect(ctx, 178, 798, 668, 156, 78);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = goldGrad(ctx, 178, 798, 846, 954);
  ctx.lineWidth = 9;
  roundRect(ctx, 178, 798, 668, 156, 78);
  ctx.stroke();

  ctx.save();
  ctx.font = 'bold 94px ' + BRAND_FONT + ', Arial, sans-serif';
  ctx.textBaseline = 'middle';
  const work = 'Work';
  const flow = 'Flow';
  const ww = ctx.measureText(work).width;
  const fw = ctx.measureText(flow).width;
  const total = ww + fw;
  const x0 = 512 - total / 2;
  const y0 = 878;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 12;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(work, x0, y0);
  ctx.fillStyle = goldGrad(ctx, x0 + ww, 830, x0 + total, 930);
  ctx.fillText(flow, x0 + ww, y0);
  ctx.restore();

  /* خط ذهبي تحت الاسم */
  ctx.strokeStyle = goldGrad(ctx, 260, 0, 760, 0);
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(360, 934);
  ctx.bezierCurveTo(450, 946, 570, 946, 666, 932);
  ctx.stroke();

  ctx.restore();
  return c;
}

/* ======================== شعار AW ======================== */
function paintAWMark(ctx, cx, cy, scale) {
  ctx.save();
  ctx.translate(cx - 256 * scale, cy - 256 * scale);
  ctx.scale(scale, scale);

  const aGrad = ctx.createLinearGradient(155, 180, 275, 330);
  aGrad.addColorStop(0, '#ff39df');
  aGrad.addColorStop(0.55, '#d34cf0');
  aGrad.addColorStop(1, '#9b4dff');
  const wGrad = ctx.createLinearGradient(285, 210, 415, 330);
  wGrad.addColorStop(0, '#7be3f7');
  wGrad.addColorStop(0.55, '#55c8f6');
  wGrad.addColorStop(1, '#4f9cff');

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(190,70,255,0.45)';
  ctx.shadowBlur = 22;

  /* A */
  ctx.strokeStyle = aGrad;
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(145, 333);
  ctx.bezierCurveTo(158, 278, 190, 206, 222, 184);
  ctx.bezierCurveTo(246, 168, 260, 188, 255, 221);
  ctx.bezierCurveTo(250, 255, 235, 300, 235, 333);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(185, 333);
  ctx.bezierCurveTo(202, 292, 224, 250, 250, 225);
  ctx.stroke();

  /* W */
  ctx.shadowColor = 'rgba(60,190,255,0.45)';
  ctx.strokeStyle = wGrad;
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(285, 208);
  ctx.lineTo(305, 320);
  ctx.quadraticCurveTo(315, 337, 325, 313);
  ctx.lineTo(345, 208);
  ctx.lineTo(365, 313);
  ctx.quadraticCurveTo(375, 337, 385, 320);
  ctx.lineTo(405, 208);
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

function drawAW(size, opts) {
  const o = opts || {};
  const S = size;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  const u = S / 512;
  ctx.save();
  ctx.scale(u, u);

  /* خلفية كحلية بنفس لون الشعار */
  const bg = ctx.createRadialGradient(256, 230, 20, 256, 256, 390);
  bg.addColorStop(0, '#131247');
  bg.addColorStop(0.52, '#0b0a32');
  bg.addColorStop(1, '#050519');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  /* شبكة خفيفة */
  ctx.strokeStyle = 'rgba(110,135,255,0.075)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 512; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }
  for (let y = 0; y <= 512; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
  }

  /* هالة خلف العلامة */
  const halo = ctx.createRadialGradient(256, 260, 10, 256, 260, 190);
  halo.addColorStop(0, 'rgba(150,70,255,0.20)');
  halo.addColorStop(0.55, 'rgba(50,170,255,0.08)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 512, 512);

  paintAWMark(ctx, 256, 256, 1);
  ctx.restore();
  return c;
}

function makeAWWide() {
  const c = createCanvas(720, 240);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 720, 240);
  paintAWMark(ctx, 360, 120, 1.15);
  return c;
}

/* ======================== حفظ الملفات ======================== */
function save(canvas, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  console.log('  ✔ ' + path.relative(ROOT, file) + '  (' + canvas.width + '×' + canvas.height + ')');
}

function buildIco(pngs) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const dir = Buffer.alloc(pngs.length * 16);
  pngs.forEach(function (p, i) {
    const b = i * 16;
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, b);
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, b + 1);
    dir.writeUInt8(0, b + 2);
    dir.writeUInt8(0, b + 3);
    dir.writeUInt16LE(1, b + 4);
    dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(p.buf.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += p.buf.length;
  });
  return Buffer.concat([head, dir].concat(pngs.map(function (p) { return p.buf; })));
}

/* الويب */
save(drawWorkflow(1024), path.join(ROOT, 'icons/icon-source-1024.png'));
save(drawWorkflow(512), path.join(ROOT, 'icons/icon-512.png'));
save(drawWorkflow(192), path.join(ROOT, 'icons/icon-192.png'));
save(drawWorkflow(512, { maskable: true }), path.join(ROOT, 'icons/icon-maskable-512.png'));
save(drawWorkflow(64), path.join(ROOT, 'icons/favicon.png'));
save(drawAW(512), path.join(ROOT, 'icons/logo-amw.png'));
save(drawAW(1024), path.join(ROOT, 'icons/logo-amw@2x.png'));
save(makeAWWide(), path.join(ROOT, 'icons/logo-amw-word.png'));

/* أيقونة ويندوز */
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoPngs = icoSizes.map(function (s) { return { size: s, buf: drawWorkflow(s).toBuffer('image/png') }; });
const icoPath = path.join(ROOT, 'release/.icon-ico/icon.ico');
fs.mkdirSync(path.dirname(icoPath), { recursive: true });
fs.writeFileSync(icoPath, buildIco(icoPngs));
console.log('  ✔ ' + path.relative(ROOT, icoPath) + '  (' + icoSizes.join('/') + ')');

/* نسخ الويب للأندرويد */
const androidIcons = path.join(ROOT, 'android/app/src/main/assets/www/icons');
fs.mkdirSync(androidIcons, { recursive: true });
['icon-source-1024.png', 'icon-512.png', 'icon-192.png', 'icon-maskable-512.png', 'favicon.png', 'logo-amw.png', 'logo-amw@2x.png', 'logo-amw-word.png'].forEach(function (f) {
  fs.copyFileSync(path.join(ROOT, 'icons', f), path.join(androidIcons, f));
});

/* أيقونات أندرويد (mipmap) */
const mipmaps = [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]];
mipmaps.forEach(function (m) {
  const dir = path.join(ROOT, 'android/app/src/main/res/mipmap-' + m[0]);
  save(drawWorkflow(m[1], { maskable: true }), path.join(dir, 'ic_launcher.png'));
  save(drawWorkflow(m[1], { maskable: true }), path.join(dir, 'ic_launcher_round.png'));
});

console.log('تم توليد أصول الهوية الجديدة.');
