/* auth gate addon */
(function(){
  'use strict';
  var authGate = document.getElementById('authGate');
  var authGateConnectBtn = document.getElementById('authGateConnectBtn');
  var authGateFolderUrl = document.getElementById('authGateFolderUrl');
  var authGateStatus = document.getElementById('authGateStatus');
  var userEmail = '';
  var userRole = 'viewer';
  function setGateStatus(msg, cls){
    if(!authGateStatus)return;
    authGateStatus.textContent = msg||'';
    authGateStatus.className = 'auth-gate__status' + (cls?' '+cls:'');
  }
  function initAuthGate(){
    if(!authGate)return;
    try { var saved = localStorage.getItem('app_user_email'); var srole = localStorage.getItem('app_user_role'); if(saved) userEmail=saved; if(srole) userRole=srole; } catch(e){}
    if(typeof fetch!=='function'){ setGateStatus('المتصفح غير مدعوم','is-error'); return; }
    fetch('/api/google/status',{credentials:'same-origin'}).then(function(r){return r.json().catch(function(){return{};});}).then(function(s){
      if(s && s.connected){
        userEmail = s.email||userEmail||'';
        userRole = (userEmail==='gstsyusudg@gmail.com')?'viewer':'admin';
        try{localStorage.setItem('app_user_email',userEmail);localStorage.setItem('app_user_role',userRole);}catch(e){}
        authGate.classList.add('is-hidden');
        try{var f = document.getElementById('authGateFolderUrl'); if(f){ var sv = localStorage.getItem('app_shared_folder_url'); if(sv) f.value = sv; }}catch(e){}
        loadShared();
        if(userRole==='viewer'){ setTimeout(function(){ try{document.querySelectorAll('button[type=submit]').forEach(function(b){ if(b.id && (b.id.indexOf('add')>=0||b.id.indexOf('save')>=0||b.id.indexOf('create')>=0)){ b.disabled=true; }}); document.querySelectorAll('[data-add],[data-del],[data-edit],[data-delete]').forEach(function(el){ el.style.display='none'; }); }catch(e){} },800); }
      }else{
        authGate.classList.remove('is-hidden');
        setGateStatus('يجب ربط حساب Google Drive للمتابعة','');
      }
    }).catch(function(){ authGate.classList.remove('is-hidden'); setGateStatus('خطأ في الاتصال','is-error'); });
  }
  function loadShared(){
    try{
      var fu = localStorage.getItem('app_shared_folder_url')||'';
      if(authGateFolderUrl && !authGateFolderUrl.value && fu) authGateFolderUrl.value = fu;
      if(typeof window.syncApi==='function'){
        window.syncApi('/api/sync/pull').then(function(pull){
          if(pull && pull.ok && pull.snapshot && typeof window.syncApply==='function'){
            window.syncApply(pull.snapshot).then(function(){
              try{ if(typeof renderCustomers==='function') renderCustomers(); if(typeof renderHomeStats==='function') renderHomeStats(); }catch(e){}
              try{ var t=document.getElementById('toast'); if(t){ t.querySelector('span').textContent='تم تحميل البيانات من المجلد العام'; t.classList.add('show'); setTimeout(function(){t.classList.remove('show');},2200); } }catch(e){}
            });
          }
        }).catch(function(){});
      }
    }catch(e){}
  }
  if(authGateConnectBtn){
    authGateConnectBtn.addEventListener('click', function(){
      try{
        var url = authGateFolderUrl ? authGateFolderUrl.value : '';
        if(url){ localStorage.setItem('app_shared_folder_url', url); if(typeof fetch==='function'){ fetch('/api/sync/folder',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({folderId:url})}).catch(function(){}); } }
      }catch(e){}
      window.location.href = '/api/google/login';
    });
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initAuthGate); } else { initAuthGate(); }
})();