/* ইউজার সাইট ও অ্যাডমিন — দুই জায়গার সাধারণ সহায়ক ফাংশন */
(function () {
  var BN = '০১২৩৪৫৬৭৮৯';
  var TZ = 'Asia/Dhaka';
  window.$ = function (s, r) { return (r || document).querySelector(s); };
  window.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  window.bn = function (n) { return String(n).replace(/\d/g, function (d) { return BN[d]; }); };
  window.fmtNum = function (n) { return bn(Number(n || 0).toLocaleString('en-US')); };
  window.fmtScore = function (n) { return bn(Math.round(Number(n || 0) * 100) / 100); };
  window.fmtDate = function (iso) {
    return new Intl.DateTimeFormat('bn-BD', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  };
  window.fmtDateTime = function (iso) {
    return new Intl.DateTimeFormat('bn-BD', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  };
  window.fmtDur = function (sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return bn(m) + ' মি ' + bn(s) + ' সে';
  };
  window.clock = function (ms) {
    ms = Math.max(0, ms);
    var t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return bn((h ? p(h) + ':' : '') + p(m) + ':' + p(s));
  };
  /* বাংলাদেশ সময় (UTC+6) অনুযায়ী datetime-local মান */
  window.toDhakaInput = function (iso) { return new Date(Date.parse(iso) + 6 * 3600e3).toISOString().slice(0, 16); };
  window.fromDhakaInput = function (v) { return new Date(v + ':00+06:00').toISOString(); };
  /* সাধারণ টেক্সটকে নিরাপদ অনুচ্ছেদে বদলায় */
  window.rich = function (s) {
    s = String(s || '').trim();
    if (!s) return '';
    return s.split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  };
  window.lines = function (s) {
    var a = String(s || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    return a.length ? '<ul class="list">' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '';
  };
  window.api = function (path, opt) {
    opt = opt || {};
    var init = { method: opt.method || 'GET', headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
    if (opt.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opt.body); }
    return fetch(path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'কিছু একটা সমস্যা হয়েছে।'); e.status = r.status; e.extra = j.extra; throw e; }
        return j;
      });
    }, function () { throw new Error('ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'); });
  };
  window.toast = function (msg, type) {
    var box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, type === 'err' ? 5000 : 2800);
  };
  /* মডাল */
  window.modal = function (o) {
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal ' + (o.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title || '') + '">' +
      '<div class="modal-head"><h3>' + esc(o.title || '') + '</h3><button class="icon-btn" data-close aria-label="বন্ধ করুন">✕</button></div>' +
      '<div class="modal-body">' + (o.body || '') + '</div>' +
      (o.actions ? '<div class="modal-foot">' + o.actions + '</div>' : '') + '</div>';
    var prevFocus = document.activeElement;
    function close() { wrap.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) prevFocus.focus(); if (o.onClose) o.onClose(); }
    function onKey(e) { if (e.key === 'Escape' && !o.locked) close(); }
    wrap.addEventListener('click', function (e) { if ((e.target === wrap && !o.locked) || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    var f = $('input,textarea,select,button.btn-primary', wrap); if (f && !o.noFocus) f.focus();
    wrap.close = close;
    return wrap;
  };
  window.confirmBox = function (msg, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      var m = modal({
        title: 'নিশ্চিত করুন', body: '<p>' + esc(msg) + '</p>',
        actions: '<button class="btn btn-ghost" data-close>বাতিল</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + esc(okLabel || 'হ্যাঁ, নিশ্চিত') + '</button>',
        onClose: function () { if (!done) resolve(false); },
      });
      $('[data-ok]', m).addEventListener('click', function () { done = true; m.close(); resolve(true); });
    });
  };
  window.copyText = function (text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { toast('কপি হয়েছে', 'ok'); }, fallback);
    return fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('কপি হয়েছে', 'ok'); } catch (e) { toast('কপি করা যায়নি', 'err'); }
      ta.remove();
    }
  };
  window.applyAccent = function (hex) {
    if (/^#[0-9a-fA-F]{6}$/.test(hex || '')) {
      document.documentElement.style.setProperty('--accent', hex);
      try { localStorage.setItem('ilm_accent', hex); } catch (e) { /* ঠিক আছে */ }
    }
  };
  window.toggleTheme = function () {
    var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('ilm_theme', t); } catch (e) { /* ঠিক আছে */ }
  };
  window.DISTRICTS = ['ঢাকা', 'গাজীপুর', 'নারায়ণগঞ্জ', 'নরসিংদী', 'মানিকগঞ্জ', 'মুন্সীগঞ্জ', 'কিশোরগঞ্জ', 'টাঙ্গাইল', 'ফরিদপুর', 'গোপালগঞ্জ', 'মাদারীপুর', 'রাজবাড়ী', 'শরীয়তপুর', 'চট্টগ্রাম', 'কক্সবাজার', 'কুমিল্লা', 'ফেনী', 'নোয়াখালী', 'লক্ষ্মীপুর', 'চাঁদপুর', 'ব্রাহ্মণবাড়িয়া', 'রাঙ্গামাটি', 'খাগড়াছড়ি', 'বান্দরবান', 'সিলেট', 'মৌলভীবাজার', 'হবিগঞ্জ', 'সুনামগঞ্জ', 'রাজশাহী', 'নাটোর', 'নওগাঁ', 'চাঁপাইনবাবগঞ্জ', 'পাবনা', 'সিরাজগঞ্জ', 'বগুড়া', 'জয়পুরহাট', 'খুলনা', 'বাগেরহাট', 'সাতক্ষীরা', 'যশোর', 'ঝিনাইদহ', 'মাগুরা', 'নড়াইল', 'কুষ্টিয়া', 'চুয়াডাঙ্গা', 'মেহেরপুর', 'বরিশাল', 'পটুয়াখালী', 'ভোলা', 'পিরোজপুর', 'ঝালকাঠি', 'বরগুনা', 'রংপুর', 'দিনাজপুর', 'গাইবান্ধা', 'কুড়িগ্রাম', 'লালমনিরহাট', 'নীলফামারী', 'ঠাকুরগাঁও', 'পঞ্চগড়', 'ময়মনসিংহ', 'জামালপুর', 'শেরপুর', 'নেত্রকোণা', 'প্রবাসী'];
})();

/* ফাইল নামানো ও CSV (অ্যাডমিন প্যানেলে ব্যবহার হয়) */
(function () {
  window.download = function (name, text, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  window.csvText = function (rows) {
    return '﻿' + rows.map(function (r) {
      return r.map(function (c) {
        if (c && typeof c === 'object' && 't' in c) return '="' + String(c.t).replace(/"/g, '""') + '"';
        if (typeof c === 'number') return String(c);
        var v = String(c == null ? '' : c);
        if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
        return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');
  };
})();
