/* ============================================================
   splash.js — شاشة الترحيب المتحركة (AMW Code)
   ------------------------------------------------------------
   • تظهر أول ما يفتح التطبيق وقبل شاشة الدخول.
   • صوت مسجّل من assets/audio/welcome.mp3 (مش TTS).
   • لو الملف ناقص أو الأوتوبلاي ممنوع: الحركة تكمل والتطبيق ما يتعلقش.
   • تتقدم تلقائيًا بعد 4.2 ثانية، أو فورًا بزر «تخطّي» / Enter / Space / Esc.
   ============================================================ */
(function () {
  'use strict';

  var AUDIO_SRC = 'assets/audio/welcome.mp3';
  var AUTO_MS = 4200;
  var START_MS = 450;
  var SESSION = 'app_splash_shown';

  /* مرة واحدة لكل جلسة تابات — إعادة التحميل لا تعيد العرض */
  try { if (sessionStorage.getItem(SESSION) === '1') return; } catch (e) {}

  var CSS =
    '.awm-splash{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(circle at 50% 34%,#1a1449 0%,#0b1035 46%,#05070f 100%);color:#fff;overflow:hidden}' +
    '.awm-splash__fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}' +
    '.awm-splash__stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:24px}' +
    '.awm-splash__stone{position:relative;width:240px;height:240px;display:grid;place-items:center;perspective:800px;' +
      'animation:awmRise 1.6s cubic-bezier(.16,.84,.28,1) both}' +
    '.awm-splash__tile{position:relative;width:200px;height:200px;border-radius:36px;overflow:hidden;z-index:2;' +
      'background:linear-gradient(160deg,#141a3f,#080b1e 62%,#05070f);display:grid;place-items:center;' +
      'box-shadow:0 0 0 1px rgba(255,255,255,.09),0 26px 60px rgba(0,0,0,.62),inset 0 0 46px rgba(139,92,246,.32)}' +
    '.awm-splash__mark-img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.awm-splash__mark{font-size:3.1rem;font-weight:800;letter-spacing:4px;' +
      'background:linear-gradient(90deg,#e879f9,#8b5cf6,#38bdf8,#22d3ee);-webkit-background-clip:text;background-clip:text;' +
      '-webkit-text-fill-color:transparent;color:transparent}' +
    '.awm-splash__shine{position:absolute;inset:-40%;z-index:3;pointer-events:none;' +
      'background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.30) 50%,transparent 62%);animation:awmSweep 2.8s linear infinite}' +
    '.awm-splash__halo{position:absolute;width:250px;height:250px;border-radius:50%;z-index:1;filter:blur(26px);opacity:.62;' +
      'background:conic-gradient(#e879f9,#8b5cf6,#38bdf8,#22d3ee,#e879f9);animation:awmSpin 8s linear infinite}' +
    '.awm-splash__ring{position:absolute;border-radius:50%;border:1px dashed rgba(196,181,253,.30);z-index:1}' +
    '.awm-splash__ring--a{width:320px;height:320px;animation:awmSpin 14s linear infinite}' +
    '.awm-splash__ring--b{width:400px;height:400px;animation:awmSpin 20s linear infinite reverse}' +
    '.awm-splash__title{margin:0;font-size:2.3rem;font-weight:900;letter-spacing:2px;background-size:250% auto;' +
      'background-image:linear-gradient(90deg,#e879f9,#8b5cf6,#38bdf8,#22d3ee,#e879f9);-webkit-background-clip:text;' +
      'background-clip:text;-webkit-text-fill-color:transparent;color:transparent;' +
      'animation:awmUp .7s ease-out 1.1s both,awmShimmer 5.2s linear infinite}' +
    '.awm-splash__sub{margin:0;font-size:1.05rem;color:#c4b5fd;letter-spacing:3px;font-weight:700;' +
      'text-transform:uppercase;animation:awmUp .7s ease-out 1.5s both}' +
    '.awm-splash__tag{margin:0;font-size:.85rem;color:#94a3b8;animation:awmUp .7s ease-out 1.8s both}' +
    '.awm-splash__dots{display:flex;gap:10px;margin-top:3px;animation:awmUp .6s ease-out 2s both}' +
    '.awm-splash__dots i{width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,#e879f9,#38bdf8);' +
      'animation:awmBounce 1s ease-in-out infinite}' +
    '.awm-splash__dots i:nth-child(2){animation-delay:.15s}.awm-splash__dots i:nth-child(3){animation-delay:.3s}' +
    '.awm-splash__act{position:fixed;bottom:18px;right:18px;display:flex;gap:8px;z-index:5}' +
    '.awm-splash__act button{font:inherit;font-size:.82rem;color:#e2e8f0;cursor:pointer;padding:8px 14px;border-radius:999px;' +
      'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16)}' +
    '.awm-splash__foot{position:fixed;bottom:20px;left:18px;font-size:.72rem;color:#64748b;z-index:5}' +
    '@keyframes awmRise{from{opacity:0;transform:translateY(70px) scale(.82) rotateX(22deg)}to{opacity:1;transform:none}}' +
    '@keyframes awmSpin{to{transform:rotate(360deg)}}' +
    '@keyframes awmSweep{from{transform:translateX(-62%)}to{transform:translateX(62%)}}' +
    '@keyframes awmUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}' +
    '@keyframes awmShimmer{to{background-position:250% center}}' +
    '@keyframes awmBounce{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(-10px);opacity:1}}' +
    '@media (max-width:420px){.awm-splash__title{font-size:1.75rem}.awm-splash__stone{width:200px;height:200px}' +
      '.awm-splash__tile{width:168px;height:168px;border-radius:30px}' +
      '.awm-splash__ring--a{width:270px;height:270px}.awm-splash__ring--b{width:330px;height:330px}}' +
    '@media (prefers-reduced-motion:reduce){.awm-splash *{animation-duration:.001s!important;animation-iteration-count:1!important}}';

  var audio = null, pending = false, done = false, timer = null;

  function stopAudio() {
    if (!audio) return;
    try { audio.pause(); audio.currentTime = 0; } catch (e) {}
  }

  function playAudio() {
    try {
      if (!audio) {
        audio = new Audio(AUDIO_SRC);
        audio.preload = 'auto';
        audio.addEventListener('error', function () { audio = null; }, { once: true });
      }
      audio.volume = 1;
      var p = audio.play();
      if (p && p.catch) p.catch(function () { pending = true; });
    } catch (e) { pending = true; }
  }

  function unlockAudio() { if (pending) { pending = false; playAudio(); } }

  function finish() {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    stopAudio();
    try { sessionStorage.setItem(SESSION, '1'); } catch (e) {}
    var el = document.getElementById('awmSplash');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    try {
      if (window.__appLock && typeof window.__appLock.boot === 'function') window.__appLock.boot();
    } catch (e) {}
  }

  function particles(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return;
    var palette = ['#e879f9', '#8b5cf6', '#38bdf8', '#22d3ee'];
    var dots = [], W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function size() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function seed() {
      dots = [];
      var n = reduce ? 0 : 90;
      for (var i = 0; i < n; i++) {
        dots.push({
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 1.8 + 0.6, vy: Math.random() * 0.38 + 0.12,
          a: Math.random() * 0.5 + 0.22, c: palette[(Math.random() * palette.length) | 0]
        });
      }
    }
    function frame() {
      if (done) return;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.y -= d.vy;
        if (d.y < -6) { d.y = H + 6; d.x = Math.random() * W; }
        ctx.globalAlpha = d.a; ctx.fillStyle = d.c;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    size(); seed(); frame();
    window.addEventListener('resize', function () { size(); seed(); });
  }

  function render() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var el = document.createElement('div');
    el.id = 'awmSplash';
    el.className = 'awm-splash';
    el.innerHTML =
      '<canvas class="awm-splash__fx"></canvas>' +
      '<div class="awm-splash__stage">' +
        '<div class="awm-splash__stone">' +
          '<div class="awm-splash__halo"></div>' +
          '<div class="awm-splash__ring awm-splash__ring--a"></div>' +
          '<div class="awm-splash__ring awm-splash__ring--b"></div>' +
          '<div class="awm-splash__tile">' +
            '<img class="awm-splash__mark-img" src="icons/icon-512.png" alt="WorkFlow" width="200" height="200" />' +
            '<span class="awm-splash__shine"></span></div>' +
        '</div>' +
        '<h1 class="awm-splash__title">WorkFlow</h1>' +
        '<p class="awm-splash__sub">Welcome</p>' +
        '<p class="awm-splash__tag">نظام الإدارة المتكامل</p>' +
        '<div class="awm-splash__dots"><i></i><i></i><i></i></div>' +
      '</div>' +
      '<div class="awm-splash__act">' +
        '<button type="button" id="awmSound">🔊 الصوت</button>' +
        '<button type="button" id="awmSkip">تخطّي ›</button>' +
      '</div>' +
      '<div class="awm-splash__foot">© AW</div>';
    document.body.appendChild(el);

    particles(el.querySelector('.awm-splash__fx'));

    var sound = el.querySelector('#awmSound');
    if (sound) sound.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      pending = false; stopAudio(); playAudio();
    });
    var skip = el.querySelector('#awmSkip');
    if (skip) skip.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation(); finish();
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') finish();
    });
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    timer = setTimeout(finish, AUTO_MS);
    setTimeout(playAudio, START_MS);
  }

  function start() {
    try {
      if (!document.body) return;
      render();
    } catch (e) {
      finish();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
