'use strict';
const fs = require('fs');
const F = 'app.js';
let s = fs.readFileSync(F, 'utf8');

const OLD = `  function installOpsHook() {
    if (opHooked) return false;
    var ls = null;
    try { ls = window.localStorage; } catch (e) {}
    if (!ls || typeof ls.setItem !== 'function') return false;
    try {
      rawSetItem = ls.setItem.bind(ls);
      ls.setItem = function (k, v) {
        var before = null;
        try { before = ls.getItem(k); } catch (e) {}
        rawSetItem(k, v);
        if (opBusy || !opsWatched(k)) return;
        var after = String(v);
        if (before === after) return;
        try { pushOp(k, before, after); } catch (e) {}
      };
      opHooked = true;
      return true;
    } catch (e) { return false; }
  }`;

const NEW = `  function installOpsHook() {
    if (opHooked) return false;
    var proto = null;
    try { proto = window.Storage && window.Storage.prototype; } catch (e) {}
    if (!proto || typeof proto.setItem !== 'function') return false;
    var orig = proto.setItem;
    try {
      proto.setItem = function (k, v) {
        var isLS = false;
        try { isLS = (this === window.localStorage); } catch (e) {}
        var before = null;
        if (isLS) { try { before = this.getItem(k); } catch (e) {} }
        orig.call(this, k, v);
        if (!isLS || opBusy || !opsWatched(k)) return;
        var after = String(v);
        if (before === after) return;
        try { pushOp(k, before, after); } catch (e) {}
      };
      rawSetItem = function (k, v) { orig.call(window.localStorage, k, v); };
      opHooked = true;
      return true;
    } catch (e) { return false; }
  }`;

if (s.indexOf(OLD) < 0) throw new Error('✗ لم يُعثر على installOpsHook الحالية');
s = s.replace(OLD, NEW);
fs.writeFileSync(F, s);
console.log('✓ ' + F + ' — تم استبدال خطّاف التخزين بـ Storage.prototype');
