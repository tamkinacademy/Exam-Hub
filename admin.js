/* ইলম পরীক্ষা কেন্দ্র — অ্যাডমিন প্যানেল */
(function () {
  'use strict';
  var root = $('#root');
  var H = {};            // বর্তমান পাতার ক্লিক হ্যান্ডলার
  var cleanup = [];
  var LETTERS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ'];
  var NAV = [
    ['dash', '#/', '📊', 'ড্যাশবোর্ড'], ['exams', '#/exams', '📝', 'পরীক্ষা'], ['regs', '#/registrations', '👥', 'নিবন্ধন'],
    ['results', '#/results', '🏆', 'ফলাফল'], ['notices', '#/notices', '📢', 'নোটিশ'], ['sponsors', '#/sponsors', '🤝', 'স্পনসর'], ['settings', '#/settings', '⚙', 'সেটিংস'],
  ];

  function fail(e) {
    if (e && e.status === 401) { showLogin(); return; }
    toast((e && e.message) || 'কিছু একটা সমস্যা হয়েছে।', 'err');
  }
  function busy(btn, on, label) { if (!btn) return; btn.disabled = on; if (label) btn.textContent = label; }
  function badge(cls, t) { return '<span class="badge ' + cls + '">' + esc(t) + '</span>'; }
  function phaseBadge(e) { return e.status === 'draft' ? badge('draft', 'খসড়া') : e.phase === 'live' ? badge('live', 'চলছে') : e.phase === 'upcoming' ? badge('upcoming', 'আসন্ন') : badge('ended', 'শেষ'); }
  function empty(icon, msg) { return '<div class="empty"><span class="big">' + icon + '</span>' + msg + '</div>'; }
  function toggle(id, label, sub, on) {
    return '<div class="toggle-line"><div class="t"><label for="' + id + '">' + label + '</label>' + (sub ? '<small>' + sub + '</small>' : '') + '</div><span class="sw"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><i></i></span></div>';
  }
  function fld(id, label, input, hint, cls) { return '<div class="field ' + (cls || '') + '"><label for="' + id + '">' + label + '</label>' + input + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>'; }

  /* ---------- লগইন ---------- */
  function showLogin(msg) {
    cleanup.splice(0).forEach(function (f) { f(); });
    root.innerHTML = '<div class="login-box"><div class="form-card" style="width:min(420px,100%)"><div class="brand" style="margin-bottom:18px"><span class="brand-mark">✦</span><span>অ্যাডমিন প্যানেল</span></div>' + (msg ? '<div class="err-box">' + esc(msg) + '</div>' : '') +
      '<form id="lgForm"><div class="field"><label for="lg_pw">পাসওয়ার্ড</label><input id="lg_pw" type="password" autocomplete="current-password" required autofocus></div><button class="btn btn-primary btn-block btn-lg" type="submit">প্রবেশ করুন</button></form>' +
      (window.Store.demo ? '<div class="info-box small" style="margin:16px 0 0"><p><b>ডেমো মোড।</b> পাসওয়ার্ড: <code>demo1234</code></p></div>' : '<p class="small muted" style="margin:16px 0 0">Firebase-এ অ্যাডমিন ইউজার বানানোর সময় যে পাসওয়ার্ড দিয়েছিলেন সেটি দিন।</p>') +'</div></div>';
    $('#lgForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var b = $('#lgForm button'); busy(b, true);
      api('/api/admin/login', { method: 'POST', body: { password: $('#lg_pw').value } }).then(function () { start(); }).catch(function (e) { busy(b, false); showLogin(e.message); });
    });
  }

  /* ---------- কাঠামো ---------- */
  function shell(active, title, actions, body) {
    root.innerHTML = '<div class="adm-mbar"><button class="icon-btn" data-act="menu" aria-label="মেনু">☰</button><b>অ্যাডমিন প্যানেল</b></div><div class="adm"><aside class="adm-side" id="side"><div class="brand"><span class="brand-mark">✦</span><span>অ্যাডমিন</span></div>' +
      NAV.map(function (n) { return '<a class="nl ' + (n[0] === active ? 'on' : '') + '" href="' + n[1] + '"><span>' + n[2] + '</span>' + n[3] + '</a>'; }).join('') +
      '<div class="sp"></div><a class="nl" href="index.html" target="_blank"><span>🌐</span>সাইট দেখুন</a><a class="nl" href="#" data-act="theme"><span>◐</span>থিম বদলান</a><a class="nl" href="#" data-act="logout"><span>⎋</span>লগআউট</a></aside>' +
      '<main class="adm-main"><div class="adm-head"><h1>' + title + '</h1><div class="row">' + (actions || '') + '</div></div>' + body + '</main></div>';
  }
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (el) {
      var a = el.dataset.act;
      if (a === 'menu') { $('#side').classList.toggle('open'); return; }
      if (a === 'theme') { ev.preventDefault(); toggleTheme(); return; }
      if (a === 'logout') { ev.preventDefault(); api('/api/admin/logout', { method: 'POST', body: {} }).then(function () { showLogin(); }); return; }
      if (H[a]) { ev.preventDefault(); H[a](el, ev); return; }
    }
    if (ev.target.closest('.adm-side a.nl') && $('#side')) $('#side').classList.remove('open');
  });
  function examSelect(exams, cur, base) {
    return '<select id="exSel" style="width:auto;min-width:240px" aria-label="পরীক্ষা বেছে নিন">' + exams.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === cur ? ' selected' : '') + '>' + esc(e.title) + '</option>'; }).join('') + '</select>';
  }
  function bindExamSelect(base) { var s = $('#exSel'); if (s) s.addEventListener('change', function () { location.hash = base + '/' + s.value; }); }

  /* ---------- ড্যাশবোর্ড ---------- */
  function Dash() {
    return api('/api/admin/dashboard').then(function (d) {
      var t = d.totals;
      var rows = d.exams.slice().reverse().map(function (e) {
        var ph = e.status === 'draft' ? badge('draft', 'খসড়া') : e.phase === 'live' ? badge('live', 'চলছে') : e.phase === 'upcoming' ? badge('upcoming', 'আসন্ন') : badge('ended', 'শেষ');
        return '<tr><td class="wrap-t"><a href="#/exam/' + e.id + '"><b>' + esc(e.title) + '</b></a><div class="muted small">' + esc(e.category) + '</div></td><td>' + ph + '</td><td>' + fmtNum(e.registered) + (e.pending ? ' <span class="badge draft">' + bn(e.pending) + ' অপেক্ষমাণ</span>' : '') + '</td><td>' + fmtNum(e.submitted) + (e.inProgress ? ' <span class="badge live">' + bn(e.inProgress) + ' দিচ্ছে</span>' : '') + '</td><td>' + fmtNum(e.questions) + '</td><td class="actions"><a class="btn btn-sm" href="#/registrations/' + e.id + '">নিবন্ধন</a><a class="btn btn-sm" href="#/results/' + e.id + '">ফলাফল</a></td></tr>';
      }).join('');
      var rec = d.recent.map(function (r) { return '<tr><td>' + bn(r.roll) + '</td><td class="wrap-t"><b>' + esc(r.name) + '</b><div class="muted small">' + esc(r.exam) + '</div></td><td>' + badge(r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'draft' : 'bad', r.status === 'approved' ? 'অনুমোদিত' : r.status === 'pending' ? 'অপেক্ষমাণ' : 'বাতিল') + '</td><td class="muted small">' + fmtDateTime(r.createdAt) + '</td></tr>'; }).join('');
      shell('dash', 'ড্যাশবোর্ড', '<a class="btn btn-primary" href="#/exam/new">+ নতুন পরীক্ষা</a>',
        '<div class="kpis"><div class="kpi hot"><b>' + fmtNum(t.live) + '</b><span>এখন চলছে</span></div><div class="kpi"><b>' + fmtNum(t.published) + ' / ' + fmtNum(t.exams) + '</b><span>প্রকাশিত / মোট পরীক্ষা</span></div><div class="kpi"><b>' + fmtNum(t.registrations) + '</b><span>মোট নিবন্ধন</span></div><div class="kpi ' + (t.pending ? 'hot' : '') + '"><b>' + fmtNum(t.pending) + '</b><span>পেমেন্ট যাচাই বাকি</span></div><div class="kpi"><b>' + fmtNum(t.submitted) + '</b><span>জমা হওয়া উত্তরপত্র</span></div><div class="kpi"><b>' + fmtNum(t.inProgress) + '</b><span>এই মুহূর্তে পরীক্ষা দিচ্ছে</span></div></div>' +
        '<div class="panel"><h3>পরীক্ষার সারসংক্ষেপ</h3>' + (rows ? '<div class="tbl-wrap"><table><thead><tr><th>পরীক্ষা</th><th>অবস্থা</th><th>নিবন্ধন</th><th>জমা</th><th>প্রশ্ন</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : empty('📝', 'এখনও কোনো পরীক্ষা নেই। উপরের বাটনে চাপ দিয়ে প্রথম পরীক্ষা তৈরি করুন।')) + '</div>' +
        '<div class="panel"><h3>সাম্প্রতিক নিবন্ধন</h3>' + (rec ? '<div class="tbl-wrap"><table><thead><tr><th>রোল</th><th>নাম</th><th>অবস্থা</th><th>সময়</th></tr></thead><tbody>' + rec + '</tbody></table></div>' : empty('👥', 'এখনও কেউ নিবন্ধন করেননি।')) + '</div>');
      if (t.live || t.inProgress) { var tm = setInterval(function () { if (!$('.kpis')) return; Dash().catch(function () {}); }, 30000); cleanup.push(function () { clearInterval(tm); }); }
    });
  }

  /* ---------- পরীক্ষার তালিকা ---------- */
  function Exams() {
    return api('/api/admin/exams').then(function (r) {
      var exams = r.exams;
      var rows = exams.map(function (e) {
        return '<tr><td class="wrap-t"><a href="#/exam/' + e.id + '"><b>' + esc(e.title) + '</b></a><div class="muted small">' + esc(e.category) + ' · ' + fmtDateTime(e.startAt) + '</div></td><td>' + phaseBadge(e) + (e.resultsPublished ? ' ' + badge('ok', 'ফলাফল প্রকাশিত') : '') + '</td><td>' + fmtNum(e.questionsCount) + '</td><td>' + fmtNum(e.registered) + '</td>' +
          '<td class="actions"><a class="btn btn-sm" href="#/questions/' + e.id + '">প্রশ্ন</a><a class="btn btn-sm" href="#/exam/' + e.id + '">সম্পাদনা</a><button class="btn btn-sm btn-ghost" data-act="pub" data-id="' + e.id + '">' + (e.status === 'published' ? 'লুকান' : 'প্রকাশ করুন') + '</button><button class="btn btn-sm btn-ghost" data-act="dup" data-id="' + e.id + '">কপি</button><button class="btn btn-sm btn-danger" data-act="del" data-id="' + e.id + '">মুছুন</button></td></tr>';
      }).join('');
      shell('exams', 'পরীক্ষা', '<a class="btn btn-primary" href="#/exam/new">+ নতুন পরীক্ষা</a>',
        rows ? '<div class="tbl-wrap"><table><thead><tr><th>পরীক্ষা</th><th>অবস্থা</th><th>প্রশ্ন</th><th>নিবন্ধন</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : empty('📝', 'এখনও কোনো পরীক্ষা নেই।'));
      H = {
        pub: function (el) {
          var e = exams.find(function (x) { return x.id === el.dataset.id; });
          api('/api/admin/exams/' + e.id, { method: 'PUT', body: Object.assign({}, e, { status: e.status === 'published' ? 'draft' : 'published' }) }).then(function () { toast(e.status === 'published' ? 'পরীক্ষা লুকানো হয়েছে' : 'পরীক্ষা প্রকাশিত হয়েছে', 'ok'); Exams(); }).catch(fail);
        },
        dup: function (el) { api('/api/admin/exams/' + el.dataset.id + '/duplicate', { method: 'POST', body: {} }).then(function () { toast('কপি তৈরি হয়েছে (খসড়া হিসেবে)', 'ok'); Exams(); }).catch(fail); },
        del: function (el) {
          var e = exams.find(function (x) { return x.id === el.dataset.id; });
          confirmBox('“' + e.title + '” মুছে ফেললে এর সব প্রশ্ন, নিবন্ধন ও ফলাফলও মুছে যাবে। এটি ফেরানো যাবে না।', 'মুছে ফেলুন', true).then(function (ok) {
            if (ok) api('/api/admin/exams/' + e.id, { method: 'DELETE' }).then(function () { toast('মুছে ফেলা হয়েছে', 'ok'); Exams(); }).catch(fail);
          });
        },
      };
    });
  }

  /* ---------- পরীক্ষা তৈরি / সম্পাদনা ---------- */
  function ExamForm(id) {
    var isNew = id === 'new';
    var p = isNew ? Promise.resolve({ exam: null }) : api('/api/admin/exams/' + id);
    return Promise.all([p, api('/api/admin/exams')]).then(function (rs) {
      var e = rs[0].exam, cats = [];
      rs[1].exams.forEach(function (x) { if (cats.indexOf(x.category) < 0) cats.push(x.category); });
      if (!e) {
        var st = new Date(Math.ceil(Date.now() / 36e5) * 36e5 + 36e5);
        e = { title: '', category: '', description: '', bookName: '', syllabus: '', rules: 'প্রতিটি প্রশ্নের জন্য ১ নম্বর।\nসময় শেষ হলে উত্তর স্বয়ংক্রিয়ভাবে জমা হবে।\nপরীক্ষা চলাকালে অন্য ট্যাবে যাবেন না।', coverUrl: '', startAt: st.toISOString(), endAt: new Date(st.getTime() + 7 * 864e5).toISOString(), durationMin: 20, fee: 0, paymentInfo: '', prizes: [], marksPerQuestion: 1, negativeMarking: 0, questionLimit: 0, shuffleQuestions: true, shuffleOptions: true, showAnswers: true, certificate: true, status: 'draft', resultsPublished: false };
      }
      var body = '<form id="exForm" novalidate>' +
        '<div class="panel"><h3>মূল তথ্য</h3>' + fld('x_title', 'পরীক্ষার নাম *', '<input id="x_title" type="text" value="' + esc(e.title) + '" placeholder="যেমন: সীরাত প্রতিযোগিতা ২০২৬">') +
        '<div class="form-grid">' + fld('x_cat', 'বিষয় / ক্যাটাগরি', '<input id="x_cat" list="catList" type="text" value="' + esc(e.category) + '" placeholder="যেমন: সীরাত"><datalist id="catList">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>') +
        fld('x_book', 'বইয়ের নাম', '<input id="x_book" type="text" value="' + esc(e.bookName) + '" placeholder="বইভিত্তিক পরীক্ষা হলে">') + '</div>' +
        fld('x_desc', 'বিবরণ', '<textarea id="x_desc">' + esc(e.description) + '</textarea>', 'খালি লাইন দিয়ে অনুচ্ছেদ আলাদা করুন') +
        fld('x_syl', 'সিলেবাস', '<textarea id="x_syl" style="min-height:80px">' + esc(e.syllabus) + '</textarea>', 'কোন অধ্যায়/পৃষ্ঠা থেকে প্রশ্ন আসবে') +
        fld('x_rules', 'নিয়মাবলি', '<textarea id="x_rules">' + esc(e.rules) + '</textarea>', 'প্রতিটি নিয়ম আলাদা লাইনে লিখুন') +
        fld('x_cover', 'কভার ছবির লিংক (ঐচ্ছিক)', '<input id="x_cover" type="url" value="' + esc(e.coverUrl) + '" placeholder="https://...">') + '</div>' +
        '<div class="panel"><h3>সময়সূচি (বাংলাদেশ সময়)</h3><div class="form-grid">' +
        fld('x_start', 'শুরুর সময় *', '<input id="x_start" type="datetime-local" value="' + toDhakaInput(e.startAt) + '">', 'এই সময় থেকে পরীক্ষা শুরু করা যাবে') +
        fld('x_end', 'শেষের সময় *', '<input id="x_end" type="datetime-local" value="' + toDhakaInput(e.endAt) + '">', 'এই সময়ের পর নতুন করে শুরু বা নিবন্ধন করা যাবে না') +
        fld('x_dur', 'পরীক্ষার সময় (মিনিট) *', '<input id="x_dur" type="number" min="1" max="600" value="' + e.durationMin + '">', 'শুরু করার পর প্রত্যেকে এতটা সময় পাবেন') +
        '</div></div>' +
        '<div class="panel"><h3>নম্বর ও প্রশ্ন</h3><div class="form-grid">' +
        fld('x_marks', 'প্রতি প্রশ্নের নম্বর', '<input id="x_marks" type="number" step="0.25" min="0.25" value="' + e.marksPerQuestion + '">') +
        fld('x_neg', 'ভুল উত্তরে নম্বর কাটা', '<input id="x_neg" type="number" step="0.05" min="0" value="' + e.negativeMarking + '">', '০ মানে নম্বর কাটা হবে না') +
        fld('x_lim', 'প্রতিজনকে কতটি প্রশ্ন দেখাবেন', '<input id="x_lim" type="number" min="0" value="' + e.questionLimit + '">', '০ মানে সব প্রশ্ন। প্রশ্নভাণ্ডার থেকে এলোমেলো কিছু প্রশ্ন দিতে চাইলে সংখ্যা দিন।', 'full') + '</div>' +
        toggle('x_sq', 'প্রশ্ন এলোমেলো করুন', 'প্রত্যেকে আলাদা ক্রমে প্রশ্ন পাবেন', e.shuffleQuestions) + toggle('x_so', 'অপশন এলোমেলো করুন', 'নকল ঠেকাতে সাহায্য করে', e.shuffleOptions) + '</div>' +
        '<div class="panel"><h3>ফি ও পুরস্কার</h3><div class="form-grid">' +
        fld('x_fee', 'নিবন্ধন ফি (টাকা)', '<input id="x_fee" type="number" min="0" value="' + e.fee + '">', '০ মানে বিনামূল্যে। ফি থাকলে অংশগ্রহণকারী TrxID দেবেন এবং আপনি অনুমোদন করবেন।') +
        fld('x_pay', 'পেমেন্ট নির্দেশনা', '<textarea id="x_pay" style="min-height:80px" placeholder="যেমন: বিকাশ (পার্সোনাল) 01XXXXXXXXX নম্বরে সেন্ড মানি করুন">' + esc(e.paymentInfo) + '</textarea>') + '</div>' +
        fld('x_prz', 'পুরস্কারের তালিকা', '<textarea id="x_prz" style="min-height:90px" placeholder="১ম স্থান — ৩,০০০ টাকা&#10;২য় স্থান — ২,০০০ টাকা">' + esc((e.prizes || []).join('\n')) + '</textarea>', 'প্রতিটি পুরস্কার আলাদা লাইনে') + '</div>' +
        '<div class="panel"><h3>ফলাফল ও প্রকাশ</h3>' +
        toggle('x_pub', 'পরীক্ষা সাইটে প্রকাশ করুন', 'বন্ধ থাকলে এটি খসড়া হিসেবে শুধু আপনি দেখবেন', e.status === 'published') +
        toggle('x_ans', 'পরীক্ষা শেষ হলে সঠিক উত্তর ও ব্যাখ্যা দেখাবেন', 'চলাকালে প্রশ্ন ফাঁস ঠেকাতে শেষ হওয়ার পর দেখানো হয়', e.showAnswers) +
        toggle('x_cert', 'সার্টিফিকেট চালু রাখুন', 'ফলাফল প্রকাশের পর অংশগ্রহণকারী ডাউনলোড করতে পারবেন', e.certificate) +
        toggle('x_res', 'ফলাফল ও মেধাতালিকা প্রকাশ করুন', 'পরীক্ষা শেষ হওয়ার পর চালু করুন। চালু করলে নম্বর হিসাব হয়ে মেধাতালিকা প্রকাশ পায়।', e.resultsPublished) + '</div>' +
        '<div class="sticky-save"><a class="btn btn-ghost" href="#/exams">বাতিল</a><button class="btn btn-primary btn-lg" type="submit">' + (isNew ? 'পরীক্ষা তৈরি করুন' : 'পরিবর্তন সংরক্ষণ করুন') + '</button></div></form>';
      shell('exams', isNew ? 'নতুন পরীক্ষা' : 'পরীক্ষা সম্পাদনা', isNew ? '' : '<a class="btn" href="#/questions/' + id + '">প্রশ্ন (' + '→)</a>', body);
      $('#exForm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var b = $('#exForm button[type=submit]'), v = function (i) { return $('#' + i).value; }, c = function (i) { return $('#' + i).checked; };
        if (!v('x_start') || !v('x_end')) return toast('শুরু ও শেষের সময় দিন', 'err');
        var data = { title: v('x_title'), category: v('x_cat'), bookName: v('x_book'), description: v('x_desc'), syllabus: v('x_syl'), rules: v('x_rules'), coverUrl: v('x_cover'),
          startAt: fromDhakaInput(v('x_start')), endAt: fromDhakaInput(v('x_end')), durationMin: v('x_dur'), marksPerQuestion: v('x_marks'), negativeMarking: v('x_neg'), questionLimit: v('x_lim'),
          shuffleQuestions: c('x_sq'), shuffleOptions: c('x_so'), fee: v('x_fee'), paymentInfo: v('x_pay'), prizes: v('x_prz'), status: c('x_pub') ? 'published' : 'draft',
          showAnswers: c('x_ans'), certificate: c('x_cert'), resultsPublished: c('x_res') };
        busy(b, true);
        api(isNew ? '/api/admin/exams' : '/api/admin/exams/' + id, { method: isNew ? 'POST' : 'PUT', body: data }).then(function (r) {
          toast(isNew ? 'পরীক্ষা তৈরি হয়েছে — এবার প্রশ্ন যোগ করুন' : 'সংরক্ষণ হয়েছে', 'ok');
          location.hash = isNew ? '#/questions/' + r.exam.id : '#/exams';
        }).catch(function (err) { busy(b, false); fail(err); });
      });
    });
  }

  /* ---------- প্রশ্ন ---------- */
  function Questions(id) {
    return Promise.all([api('/api/admin/exams/' + id), api('/api/admin/exams/' + id + '/questions')]).then(function (rs) {
      var e = rs[0].exam, Q = rs[1].questions, filter = '';
      shell('exams', 'প্রশ্নভাণ্ডার', '<a class="btn btn-ghost" href="#/exam/' + id + '">← পরীক্ষার সেটিংস</a><button class="btn" data-act="bulk">টেক্সট থেকে ইমপোর্ট</button><button class="btn btn-primary" data-act="add">+ নতুন প্রশ্ন</button>',
        '<p class="muted" style="margin-top:-12px">' + esc(e.title) + ' · মোট <b>' + fmtNum(Q.length) + '</b>টি প্রশ্ন</p><div class="row mb"><input id="qSearch" type="search" placeholder="প্রশ্ন খুঁজুন" style="max-width:320px">' + (Q.length ? '<button class="btn btn-danger btn-sm" data-act="delall">সব প্রশ্ন মুছুন</button>' : '') + '</div><div id="qList"></div>');
      function draw() {
        var f = filter.toLowerCase();
        var list = Q.map(function (q, i) { return { q: q, i: i }; }).filter(function (x) { return !f || x.q.text.toLowerCase().indexOf(f) >= 0; });
        $('#qList').innerHTML = list.length ? list.map(function (x) {
          var q = x.q;
          return '<div class="q-item"><div class="n">' + bn(x.i + 1) + '.</div><div class="grow"><div style="font-weight:600">' + esc(q.text) + '</div><ol>' + q.options.map(function (o, k) { return '<li class="' + (k === q.correct ? 'ok' : '') + '">' + LETTERS[k] + ') ' + esc(o) + (k === q.correct ? ' ✓' : '') + '</li>'; }).join('') + '</ol>' + (q.explanation ? '<div class="small muted" style="margin-top:6px">ব্যাখ্যা: ' + esc(q.explanation) + '</div>' : '') + '</div><div class="row" style="gap:6px"><button class="btn btn-sm" data-act="edit" data-id="' + q.id + '">সম্পাদনা</button><button class="btn btn-sm btn-danger" data-act="del" data-id="' + q.id + '">মুছুন</button></div></div>';
        }).join('') : empty('❓', Q.length ? 'কোনো প্রশ্ন মেলেনি।' : 'এখনও কোনো প্রশ্ন নেই। “নতুন প্রশ্ন” দিয়ে একটি একটি করে বা “টেক্সট থেকে ইমপোর্ট” দিয়ে একসাথে অনেক প্রশ্ন যোগ করুন।');
      }
      draw();
      $('#qSearch').addEventListener('input', function (ev) { filter = ev.target.value; draw(); });
      function reload() { Questions(id).catch(fail); }
      function qModal(q) {
        var opts = q ? q.options : ['', '', '', ''];
        while (opts.length < 5) opts.push('');
        var m = modal({
          title: q ? 'প্রশ্ন সম্পাদনা' : 'নতুন প্রশ্ন', wide: true,
          body: fld('q_text', 'প্রশ্ন *', '<textarea id="q_text" style="min-height:90px">' + esc(q ? q.text : '') + '</textarea>') + '<label style="font-weight:600;display:block;margin-bottom:8px">অপশন (সঠিকটির পাশে টিক দিন)</label>' +
            opts.map(function (o, k) { return '<div class="opt-edit"><input type="radio" name="q_ok" value="' + k + '"' + (q && q.correct === k ? ' checked' : (!q && k === 0 ? ' checked' : '')) + ' aria-label="সঠিক উত্তর ' + LETTERS[k] + '"><span class="muted" style="width:20px">' + LETTERS[k] + '</span><input type="text" class="q_opt" value="' + esc(o) + '" placeholder="অপশন ' + LETTERS[k] + (k > 1 ? ' (ঐচ্ছিক)' : '') + '"></div>'; }).join('') +
            fld('q_exp', 'ব্যাখ্যা / বইয়ের রেফারেন্স (ঐচ্ছিক)', '<textarea id="q_exp" style="min-height:70px">' + esc(q ? q.explanation : '') + '</textarea>', 'পরীক্ষা শেষে অংশগ্রহণকারী এটি দেখতে পাবেন'),
          actions: '<button class="btn btn-ghost" data-close>বাতিল</button><button class="btn btn-primary" data-save>সংরক্ষণ</button>',
        });
        $('[data-save]', m).addEventListener('click', function () {
          var chk = $('input[name=q_ok]:checked', m);
          var body = { text: $('#q_text').value, options: $$('.q_opt', m).map(function (i) { return i.value; }), correct: chk ? parseInt(chk.value, 10) : -1, explanation: $('#q_exp').value };
          var b = $('[data-save]', m); busy(b, true);
          api(q ? '/api/admin/exams/' + id + '/questions/' + q.id : '/api/admin/exams/' + id + '/questions', { method: q ? 'PUT' : 'POST', body: body }).then(function () { m.close(); toast('সংরক্ষিত', 'ok'); reload(); }).catch(function (er) { busy(b, false); fail(er); });
        });
      }
      H = {
        add: function () { qModal(null); },
        edit: function (el) { qModal(Q.find(function (x) { return x.id === el.dataset.id; })); },
        del: function (el) { confirmBox('এই প্রশ্নটি মুছবেন?', 'মুছুন', true).then(function (ok) { if (ok) api('/api/admin/exams/' + id + '/questions/' + el.dataset.id, { method: 'DELETE' }).then(function () { toast('মুছে ফেলা হয়েছে', 'ok'); reload(); }).catch(fail); }); },
        delall: function () { confirmBox('এই পরীক্ষার সব ' + bn(Q.length) + 'টি প্রশ্ন মুছে ফেলবেন?', 'সব মুছুন', true).then(function (ok) { if (ok) api('/api/admin/exams/' + id + '/questions', { method: 'DELETE' }).then(function () { toast('সব প্রশ্ন মুছে ফেলা হয়েছে', 'ok'); reload(); }).catch(fail); }); },
        bulk: function () {
          var m = modal({
            title: 'টেক্সট থেকে প্রশ্ন ইমপোর্ট', wide: true,
            body: '<div class="info-box small"><p><b>ফরম্যাট:</b> প্রতিটি প্রশ্নের পর অপশন ও উত্তর লিখুন। প্রশ্নগুলোর মাঝে ফাঁকা লাইন দিলে ভালো, না দিলেও চলবে। ক/খ/গ/ঘ বা A/B/C/D — দুটোই চলে।</p></div><pre style="background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:12px 16px;font-size:.9rem;white-space:pre-wrap;margin:0 0 14px">১. রাসূলুল্লাহ ﷺ কোথায় জন্মগ্রহণ করেন?\nক) মক্কা\nখ) মদিনা\nগ) তায়েফ\nঘ) জেদ্দা\nউত্তর: ক\nব্যাখ্যা: মক্কায় জন্ম। (ঐচ্ছিক)</pre>' +
              '<textarea id="b_text" style="min-height:220px" placeholder="এখানে সব প্রশ্ন পেস্ট করুন"></textarea><label class="check" style="margin-top:10px"><input type="checkbox" id="b_rep"><span>আগের সব প্রশ্ন মুছে এগুলো দিয়ে বদলে দিন</span></label><div id="b_res"></div>',
            actions: '<button class="btn btn-ghost" data-close>বাতিল</button><button class="btn" data-check>যাচাই করুন</button><button class="btn btn-primary" data-imp>ইমপোর্ট করুন</button>',
          });
          function show(r) { $('#b_res').innerHTML = '<div class="' + (r.errors && r.errors.length ? 'err-box' : 'info-box') + '" style="margin-top:12px"><b>' + bn(r.count) + 'টি প্রশ্ন পাওয়া গেছে।</b>' + (r.errors && r.errors.length ? '<ul class="list small" style="margin:8px 0 0">' + r.errors.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>'; }
          $('[data-check]', m).addEventListener('click', function () { api('/api/admin/exams/' + id + '/questions/bulk', { method: 'POST', body: { text: $('#b_text').value, dryRun: true } }).then(show).catch(fail); });
          $('[data-imp]', m).addEventListener('click', function () {
            var b = $('[data-imp]', m); busy(b, true);
            api('/api/admin/exams/' + id + '/questions/bulk', { method: 'POST', body: { text: $('#b_text').value, replace: $('#b_rep').checked } }).then(function (r) { m.close(); toast(bn(r.count) + 'টি প্রশ্ন যোগ হয়েছে' + (r.errors.length ? ' (' + bn(r.errors.length) + 'টি বাদ পড়েছে)' : ''), 'ok'); reload(); })
              .catch(function (er) { busy(b, false); if (er.extra && er.extra.errors) show({ count: 0, errors: er.extra.errors }); fail(er); });
          });
        },
      };
    });
  }

  /* ---------- নিবন্ধন ---------- */
  function pickExam(base, fn) {
    return function (id) {
      return api('/api/admin/exams').then(function (r) {
        if (!r.exams.length) { shell(base === 'regs' ? 'regs' : 'results', base === 'regs' ? 'নিবন্ধন' : 'ফলাফল', '', empty('📝', 'আগে একটি পরীক্ষা তৈরি করুন।')); return; }
        var cur = id && r.exams.find(function (e) { return e.id === id; }) ? id : r.exams[0].id;
        return fn(cur, r.exams);
      });
    };
  }
  var Regs = pickExam('regs', function (id, exams) {
    return api('/api/admin/exams/' + id + '/registrations').then(function (r) {
      var R = r.registrations, fs = '', fq = '';
      var ex = exams.find(function (e) { return e.id === id; });
      shell('regs', 'নিবন্ধন', examSelect(exams, id) + '<button class="btn" data-act="addreg">+ হাতে যোগ করুন</button><button class="btn" data-act="csvreg">CSV</button>',
        '<div class="kpis"><div class="kpi"><b>' + fmtNum(R.length) + '</b><span>মোট নিবন্ধন</span></div><div class="kpi ' + (R.filter(function (x) { return x.status === 'pending'; }).length ? 'hot' : '') + '"><b>' + fmtNum(R.filter(function (x) { return x.status === 'pending'; }).length) + '</b><span>অনুমোদন বাকি</span></div><div class="kpi"><b>' + fmtNum(R.filter(function (x) { return x.attempt && x.attempt.state === 'submitted'; }).length) + '</b><span>পরীক্ষা দিয়েছেন</span></div></div>' +
        '<div class="row mb"><input id="rSearch" type="search" placeholder="নাম, মোবাইল বা রোল" style="max-width:260px"><select id="rStatus" style="width:auto"><option value="">সব অবস্থা</option><option value="pending">অপেক্ষমাণ</option><option value="approved">অনুমোদিত</option><option value="rejected">বাতিল</option></select><span class="grow"></span><button class="btn btn-sm" data-act="apprall">সব অপেক্ষমাণ অনুমোদন করুন</button></div><div id="rList"></div>');
      bindExamSelect('#/registrations');
      function draw() {
        var q = fq.toLowerCase();
        var l = R.filter(function (x) { return (!fs || x.status === fs) && (!q || (x.name + ' ' + x.phone + ' ' + x.roll).toLowerCase().indexOf(q) >= 0); });
        $('#rList').innerHTML = l.length ? '<div class="tbl-wrap"><table><thead><tr><th>রোল</th><th>নাম</th><th>মোবাইল</th><th>জেলা</th><th>অবস্থা</th>' + (ex.fee > 0 ? '<th>TrxID</th>' : '') + '<th>পরীক্ষা</th><th>পাসকোড</th><th></th></tr></thead><tbody>' + l.map(function (x) {
          var at = x.attempt ? (x.attempt.state === 'submitted' ? badge('ok', fmtScore(x.attempt.score) + ' নম্বর') : badge('live', 'দিচ্ছে')) : '<span class="muted">—</span>';
          return '<tr><td>' + bn(x.roll) + '</td><td><a href="#" data-act="view" data-id="' + x.id + '"><b>' + esc(x.name) + '</b></a></td><td>' + esc(x.phone) + '</td><td>' + esc(x.district) + '</td><td>' + badge(x.status === 'approved' ? 'ok' : x.status === 'pending' ? 'draft' : 'bad', x.status === 'approved' ? 'অনুমোদিত' : x.status === 'pending' ? 'অপেক্ষমাণ' : 'বাতিল') + '</td>' + (ex.fee > 0 ? '<td>' + esc(x.trxId) + '</td>' : '') + '<td>' + at + '</td><td><span class="passcode">' + esc(x.passcode) + '</span></td>' +
            '<td class="actions">' + (x.status !== 'approved' ? '<button class="btn btn-sm btn-primary" data-act="st" data-st="approved" data-id="' + x.id + '">অনুমোদন</button>' : '') + (x.status !== 'rejected' ? '<button class="btn btn-sm btn-ghost" data-act="st" data-st="rejected" data-id="' + x.id + '">বাতিল</button>' : '') + '<button class="btn btn-sm btn-danger" data-act="rm" data-id="' + x.id + '">মুছুন</button></td></tr>';
        }).join('') + '</tbody></table></div>' : empty('👥', R.length ? 'কাউকে পাওয়া যায়নি।' : 'এখনও কেউ নিবন্ধন করেননি।');
      }
      draw();
      $('#rSearch').addEventListener('input', function (e) { fq = e.target.value; draw(); });
      $('#rStatus').addEventListener('change', function (e) { fs = e.target.value; draw(); });
      function reload() { Regs(id).catch(fail); }
      H = {
        csvreg: function () {
          var rows = [['রোল', 'পাসকোড', 'নাম', 'মোবাইল', 'ইমেইল', 'জেলা', 'প্রতিষ্ঠান', 'স্ট্যাটাস', 'TrxID', 'পেমেন্ট নম্বর', 'নিবন্ধনের সময়']];
          R.slice().reverse().forEach(function (x) { rows.push([x.roll, { t: x.passcode }, x.name, { t: x.phone }, x.email, x.district, x.institution, x.status, x.trxId, x.senderNumber ? { t: x.senderNumber } : '', x.createdAt]); });
          download('registrations.csv', csvText(rows), 'text/csv;charset=utf-8');
        },
        st: function (el) { api('/api/admin/registrations/' + el.dataset.id, { method: 'PUT', body: { status: el.dataset.st } }).then(function () { toast('হালনাগাদ হয়েছে', 'ok'); reload(); }).catch(fail); },
        rm: function (el) { confirmBox('এই নিবন্ধন (ও তার উত্তরপত্র) মুছে ফেলবেন?', 'মুছুন', true).then(function (ok) { if (ok) api('/api/admin/registrations/' + el.dataset.id, { method: 'DELETE' }).then(reload).catch(fail); }); },
        apprall: function () { api('/api/admin/exams/' + id + '/registrations/approve-all', { method: 'POST', body: {} }).then(function (r) { toast(bn(r.count) + ' জন অনুমোদিত হয়েছে', 'ok'); reload(); }).catch(fail); },
        view: function (el) {
          var x = R.find(function (y) { return y.id === el.dataset.id; });
          var msg = 'আসসালামু আলাইকুম ' + x.name + ', "' + ex.title + '" পরীক্ষার জন্য আপনার রোল: ' + x.roll + ', পাসকোড: ' + x.passcode;
          var m = modal({ title: x.name, body: '<dl class="kv"><dt>রোল</dt><dd>' + bn(x.roll) + '</dd><dt>পাসকোড</dt><dd><span class="passcode">' + esc(x.passcode) + '</span></dd><dt>মোবাইল</dt><dd>' + esc(x.phone) + '</dd><dt>ইমেইল</dt><dd>' + esc(x.email || '—') + '</dd><dt>জেলা</dt><dd>' + esc(x.district || '—') + '</dd><dt>প্রতিষ্ঠান</dt><dd>' + esc(x.institution || '—') + '</dd>' + (x.trxId ? '<dt>TrxID</dt><dd>' + esc(x.trxId) + '</dd><dt>পেমেন্ট নম্বর</dt><dd>' + esc(x.senderNumber || '—') + '</dd>' : '') + '<dt>নিবন্ধনের সময়</dt><dd>' + fmtDateTime(x.createdAt) + '</dd></dl><div class="info-box small"><p>পাসকোড হারিয়ে গেলে নতুন পাসকোড তৈরি করে ব্যবহারকারীকে পাঠান।</p></div>',
            actions: '<button class="btn btn-ghost" data-close>বন্ধ</button><button class="btn" data-cp>রোল-পাসকোড মেসেজ কপি</button><button class="btn btn-danger" data-rs>নতুন পাসকোড</button>' });
          $('[data-cp]', m).addEventListener('click', function () { copyText(msg); });
          $('[data-rs]', m).addEventListener('click', function () { confirmBox('নতুন পাসকোড তৈরি হলে আগেরটি আর কাজ করবে না।', 'নতুন পাসকোড তৈরি করুন', false).then(function (ok) { if (ok) api('/api/admin/registrations/' + x.id, { method: 'PUT', body: { resetPasscode: true } }).then(function () { m.close(); toast('নতুন পাসকোড তৈরি হয়েছে', 'ok'); reload(); }).catch(fail); }); });
        },
        addreg: function () {
          var m = modal({ title: 'হাতে নিবন্ধন যোগ', body: fld('a_name', 'নাম *', '<input id="a_name" type="text">') + fld('a_phone', 'মোবাইল *', '<input id="a_phone" type="tel">') + fld('a_dist', 'জেলা', '<input id="a_dist" type="text" list="dl"><datalist id="dl">' + DISTRICTS.map(function (d) { return '<option value="' + d + '">'; }).join('') + '</datalist>'), actions: '<button class="btn btn-ghost" data-close>বাতিল</button><button class="btn btn-primary" data-save>যোগ করুন</button>' });
          $('[data-save]', m).addEventListener('click', function () { api('/api/admin/exams/' + id + '/registrations', { method: 'POST', body: { name: $('#a_name').value, phone: $('#a_phone').value, district: $('#a_dist').value } }).then(function () { m.close(); toast('যোগ হয়েছে', 'ok'); reload(); }).catch(fail); });
        },
      };
    });
  });

  /* ---------- ফলাফল ---------- */
  var Results = pickExam('results', function (id, exams) {
    return api('/api/admin/exams/' + id + '/results').then(function (r) {
      var ex = r.exam, st = r.stats;
      shell('results', 'ফলাফল', examSelect(exams, id) + '<button class="btn" data-act="csvres">CSV</button>',
        '<div class="kpis"><div class="kpi"><b>' + fmtNum(st.submitted) + '</b><span>জমা দিয়েছেন</span></div><div class="kpi ' + (st.inProgress ? 'hot' : '') + '"><b>' + fmtNum(st.inProgress) + '</b><span>এখন দিচ্ছেন</span></div><div class="kpi"><b>' + fmtScore(st.avg) + '</b><span>গড় নম্বর</span></div><div class="kpi"><b>' + fmtScore(st.max) + '</b><span>সর্বোচ্চ নম্বর</span></div></div>' +
        '<div class="panel"><h3>ফলাফল প্রকাশ</h3><div class="row between"><div><b>' + (ex.resultsPublished ? badge('ok', 'প্রকাশিত') : badge('draft', 'অপ্রকাশিত')) + '</b><p class="muted small" style="margin:8px 0 0">' + (ex.resultsPublished ? 'মেধাতালিকা, সার্টিফিকেট ও মেধাক্রম এখন সবার জন্য খোলা।' : 'প্রকাশ না করা পর্যন্ত কেউ নিজের নম্বর, মেধাতালিকা বা সার্টিফিকেট দেখতে পাবে না। প্রকাশের সময় নম্বর হিসাব হয়ে যায়।') + '</p></div><div class="row"><button class="btn ' + (ex.resultsPublished ? '' : 'btn-primary') + '" data-act="pubres">' + (ex.resultsPublished ? 'প্রকাশ বন্ধ করুন' : 'ফলাফল প্রকাশ করুন') + '</button><button class="btn" data-act="rescore">নম্বর পুনরায় হিসাব</button></div></div></div>' +
        (r.running.length ? '<div class="panel"><h3>এখন পরীক্ষা দিচ্ছেন (' + bn(r.running.length) + ')</h3><div class="tbl-wrap"><table><thead><tr><th>রোল</th><th>নাম</th><th>শুরু</th><th>শেষ হবে</th><th></th></tr></thead><tbody>' + r.running.map(function (x) { return '<tr><td>' + bn(x.roll) + '</td><td>' + esc(x.name) + '</td><td>' + fmtDateTime(x.startedAt) + '</td><td>' + fmtDateTime(x.deadline) + '</td><td class="actions"><button class="btn btn-sm" data-act="fin" data-id="' + x.attemptId + '">এখনই জমা নিন</button></td></tr>'; }).join('') + '</tbody></table></div></div>' : '') +
        '<div class="panel"><h3>মেধাতালিকা</h3>' + (r.rows.length ? '<div class="tbl-wrap"><table><thead><tr><th>ক্রম</th><th>নাম</th><th>রোল</th><th>মোবাইল</th><th>নম্বর</th><th>সঠিক / ভুল / বাদ</th><th>সময়</th><th>ট্যাব বদল</th><th></th></tr></thead><tbody>' + r.rows.map(function (x) {
          return '<tr><td><span class="rk ' + (x.rank <= 3 ? 'r' + x.rank : '') + '">' + bn(x.rank) + '</span></td><td><b>' + esc(x.name) + '</b><div class="muted small">' + esc(x.district) + '</div></td><td>' + bn(x.roll) + '</td><td>' + esc(x.phone) + '</td><td><b>' + fmtScore(x.score) + '</b> / ' + fmtScore(x.totalMarks) + '</td><td>' + bn(x.correct) + ' / ' + bn(x.wrong) + ' / ' + bn(x.unanswered) + '</td><td>' + fmtDur(x.timeTaken) + '</td><td>' + (x.tabSwitches > 2 ? badge('bad', bn(x.tabSwitches) + ' বার') : bn(x.tabSwitches)) + '</td><td class="actions"><button class="btn btn-sm btn-danger" data-act="reset" data-id="' + x.attemptId + '">পুনরায় সুযোগ দিন</button></td></tr>';
        }).join('') + '</tbody></table></div><p class="small muted" style="margin:12px 0 0">“ট্যাব বদল” মানে পরীক্ষা চলাকালে কতবার অন্য ট্যাব বা অ্যাপে যাওয়া হয়েছে। এটি শুধু একটি ইঙ্গিত।</p>' : empty('🏆', 'এখনও কেউ উত্তর জমা দেননি।')) + '</div>');
      bindExamSelect('#/results');
      function reload() { Results(id).catch(fail); }
      H = {
        csvres: function () {
          var rows = [['র‍্যাংক', 'রোল', 'নাম', 'মোবাইল', 'জেলা', 'প্রতিষ্ঠান', 'নম্বর', 'পূর্ণমান', 'সঠিক', 'ভুল', 'উত্তর নেই', 'সময় (সেকেন্ড)', 'ট্যাব বদল']];
          r.rows.forEach(function (x) { rows.push([x.rank, x.roll, x.name, { t: x.phone }, x.district, x.institution, x.score, x.totalMarks, x.correct, x.wrong, x.unanswered, x.timeTaken, x.tabSwitches]); });
          download('results.csv', csvText(rows), 'text/csv;charset=utf-8');
        },
        pubres: function () { api('/api/admin/exams/' + id, { method: 'PUT', body: Object.assign({}, ex, { resultsPublished: !ex.resultsPublished }) }).then(function () { toast(ex.resultsPublished ? 'ফলাফল লুকানো হয়েছে' : 'ফলাফল প্রকাশিত হয়েছে', 'ok'); reload(); }).catch(fail); },
        rescore: function () { confirmBox('বর্তমান সঠিক উত্তর অনুযায়ী সবার নম্বর আবার হিসাব হবে। প্রশ্নের উত্তর সংশোধন করলে এটি করুন।', 'হিসাব করুন', false).then(function (ok) { if (ok) api('/api/admin/exams/' + id + '/rescore', { method: 'POST', body: {} }).then(function (x) { toast(bn(x.count) + 'টি উত্তরপত্র আবার হিসাব হয়েছে', 'ok'); reload(); }).catch(fail); }); },
        reset: function (el) { confirmBox('এই অংশগ্রহণকারীর উত্তরপত্র মুছে গেলে তিনি আবার পরীক্ষা দিতে পারবেন (যদি সময় থাকে)।', 'মুছে সুযোগ দিন', true).then(function (ok) { if (ok) api('/api/admin/attempts/' + el.dataset.id, { method: 'DELETE' }).then(reload).catch(fail); }); },
        fin: function (el) { api('/api/admin/attempts/' + el.dataset.id + '/finalize', { method: 'POST', body: {} }).then(function () { toast('জমা নেওয়া হয়েছে', 'ok'); reload(); }).catch(fail); },
      };
    });
  });

  /* ---------- নোটিশ ---------- */
  function Notices() {
    return api('/api/admin/notices').then(function (r) {
      var N = r.notices;
      shell('notices', 'নোটিশ', '<button class="btn btn-primary" data-act="add">+ নতুন নোটিশ</button>',
        N.length ? N.map(function (n) { return '<div class="q-item"><div class="grow"><b>' + (n.pinned ? '📌 ' : '') + esc(n.title) + '</b><div class="muted small">' + fmtDate(n.createdAt) + '</div><div style="margin-top:6px" class="muted">' + esc(n.body).slice(0, 220) + '</div></div><div class="row" style="gap:6px"><button class="btn btn-sm" data-act="edit" data-id="' + n.id + '">সম্পাদনা</button><button class="btn btn-sm btn-danger" data-act="del" data-id="' + n.id + '">মুছুন</button></div></div>'; }).join('') : empty('📢', 'এখনও কোনো নোটিশ নেই।'));
      function nModal(n) {
        var m = modal({ title: n ? 'নোটিশ সম্পাদনা' : 'নতুন নোটিশ', body: fld('n_t', 'শিরোনাম *', '<input id="n_t" type="text" value="' + esc(n ? n.title : '') + '">') + fld('n_b', 'বিস্তারিত', '<textarea id="n_b">' + esc(n ? n.body : '') + '</textarea>') + toggle('n_p', 'উপরে পিন করে রাখুন', '', n && n.pinned), actions: '<button class="btn btn-ghost" data-close>বাতিল</button><button class="btn btn-primary" data-save>সংরক্ষণ</button>' });
        $('[data-save]', m).addEventListener('click', function () { api(n ? '/api/admin/notices/' + n.id : '/api/admin/notices', { method: n ? 'PUT' : 'POST', body: { title: $('#n_t').value, body: $('#n_b').value, pinned: $('#n_p').checked } }).then(function () { m.close(); toast('সংরক্ষিত', 'ok'); Notices(); }).catch(fail); });
      }
      H = { add: function () { nModal(null); }, edit: function (el) { nModal(N.find(function (x) { return x.id === el.dataset.id; })); }, del: function (el) { confirmBox('নোটিশটি মুছবেন?', 'মুছুন', true).then(function (ok) { if (ok) api('/api/admin/notices/' + el.dataset.id, { method: 'DELETE' }).then(function () { Notices(); }).catch(fail); }); } };
    });
  }

  /* ---------- স্পনসর ---------- */
  function Sponsors() {
    return api('/api/admin/sponsors').then(function (r) {
      var L = r.sponsors;
      shell('sponsors', 'স্পনসর', '<button class="btn btn-primary" data-act="add">+ নতুন স্পনসর</button>',
        '<p class="muted" style="margin-top:-12px">এখানে যোগ করা স্পনসর সাইটের হোম ও পরিচিতি পাতায় দেখানো হবে।</p>' + (L.length ? L.map(function (s) { return '<div class="q-item"><div class="grow"><b>' + esc(s.name) + '</b>' + (s.tier ? ' <span class="badge">' + esc(s.tier) + '</span>' : '') + '<div class="muted small">' + esc(s.url || 'লিংক নেই') + '</div></div><div class="row" style="gap:6px"><button class="btn btn-sm" data-act="edit" data-id="' + s.id + '">সম্পাদনা</button><button class="btn btn-sm btn-danger" data-act="del" data-id="' + s.id + '">মুছুন</button></div></div>'; }).join('') : empty('🤝', 'এখনও কোনো স্পনসর যোগ করা হয়নি।')));
      function sModal(s) {
        var m = modal({ title: s ? 'স্পনসর সম্পাদনা' : 'নতুন স্পনসর', body: fld('s_n', 'নাম *', '<input id="s_n" type="text" value="' + esc(s ? s.name : '') + '">') + fld('s_t', 'ধরন', '<input id="s_t" type="text" value="' + esc(s ? s.tier : '') + '" placeholder="যেমন: প্রধান স্পনসর, পুরস্কার সহযোগী">') + fld('s_u', 'ওয়েবসাইট / পেজের লিংক', '<input id="s_u" type="url" value="' + esc(s ? s.url : '') + '" placeholder="https://...">') + fld('s_l', 'লোগোর লিংক (ঐচ্ছিক)', '<input id="s_l" type="url" value="' + esc(s ? s.logoUrl : '') + '" placeholder="https://...">'), actions: '<button class="btn btn-ghost" data-close>বাতিল</button><button class="btn btn-primary" data-save>সংরক্ষণ</button>' });
        $('[data-save]', m).addEventListener('click', function () { api(s ? '/api/admin/sponsors/' + s.id : '/api/admin/sponsors', { method: s ? 'PUT' : 'POST', body: { name: $('#s_n').value, tier: $('#s_t').value, url: $('#s_u').value, logoUrl: $('#s_l').value } }).then(function () { m.close(); toast('সংরক্ষিত', 'ok'); Sponsors(); }).catch(fail); });
      }
      H = { add: function () { sModal(null); }, edit: function (el) { sModal(L.find(function (x) { return x.id === el.dataset.id; })); }, del: function (el) { confirmBox('স্পনসরটি মুছবেন?', 'মুছুন', true).then(function (ok) { if (ok) api('/api/admin/sponsors/' + el.dataset.id, { method: 'DELETE' }).then(function () { Sponsors(); }).catch(fail); }); } };
    });
  }

  /* ---------- সেটিংস ---------- */
  function Settings() {
    return Promise.all([api('/api/admin/settings'), api('/api/admin/me')]).then(function (rs) {
      var s = rs[0].settings;
      var presets = ['#d9a441', '#3fc9a0', '#5aa9ff', '#c58bff', '#ff7a8a', '#f08a3c'];
      shell('settings', 'সেটিংস', '', '<form id="stForm" novalidate>' +
        '<div class="panel"><h3>সাইটের তথ্য</h3>' + fld('s_name', 'সাইটের নাম', '<input id="s_name" type="text" value="' + esc(s.siteName) + '">') + fld('s_tag', 'ট্যাগলাইন (ফুটারে দেখাবে)', '<input id="s_tag" type="text" value="' + esc(s.tagline) + '">') +
        fld('s_ht', 'হোম পাতার বড় শিরোনাম', '<input id="s_ht" type="text" value="' + esc(s.heroTitle) + '">') + fld('s_hx', 'হোম পাতার ছোট বিবরণ', '<textarea id="s_hx" style="min-height:80px">' + esc(s.heroText) + '</textarea>') +
        fld('s_ann', 'উপরের ঘোষণা বার (ঐচ্ছিক)', '<input id="s_ann" type="text" value="' + esc(s.announcement) + '">', 'খালি রাখলে কিছুই দেখাবে না') + fld('s_logo', 'লোগোর লিংক (ঐচ্ছিক)', '<input id="s_logo" type="url" value="' + esc(s.logoUrl) + '" placeholder="https://...">') + '</div>' +
        '<div class="panel"><h3>চেহারা</h3><div class="field"><label for="s_acc">মূল রং</label><div class="row"><input id="s_acc" type="color" value="' + esc(s.accent) + '" style="width:64px;height:44px;padding:3px">' + presets.map(function (c) { return '<button type="button" class="icon-btn" data-act="preset" data-c="' + c + '" style="background:' + c + ';border:2px solid var(--line2)" aria-label="রং ' + c + '"></button>'; }).join('') + '</div><div class="hint">বাটন, লিংক ও হাইলাইটের রং বদলাবে</div></div></div>' +
        '<div class="panel"><h3>পরিচিতি ও নিয়মাবলি</h3>' + fld('s_about', 'আমাদের সম্পর্কে', '<textarea id="s_about">' + esc(s.about) + '</textarea>') + fld('s_terms', 'সাধারণ নিয়মাবলি', '<textarea id="s_terms">' + esc(s.terms) + '</textarea>', 'প্রতিটি নিয়ম আলাদা লাইনে') + '</div>' +
        '<div class="panel"><h3>যোগাযোগ ও সোশ্যাল</h3><div class="form-grid">' + fld('s_ph', 'ফোন', '<input id="s_ph" type="text" value="' + esc(s.contactPhone) + '">') + fld('s_em', 'ইমেইল', '<input id="s_em" type="email" value="' + esc(s.contactEmail) + '">') + fld('s_wa', 'হোয়াটসঅ্যাপ নম্বর', '<input id="s_wa" type="text" value="' + esc(s.whatsapp) + '">') + fld('s_fb', 'ফেসবুক পেজের লিংক', '<input id="s_fb" type="url" value="' + esc(s.facebook) + '">') + fld('s_yt', 'ইউটিউব চ্যানেলের লিংক', '<input id="s_yt" type="url" value="' + esc(s.youtube) + '">') + fld('s_tg', 'টেলিগ্রামের লিংক', '<input id="s_tg" type="url" value="' + esc(s.telegram) + '">') + '</div>' + fld('s_foot', 'ফুটারের লেখা', '<input id="s_foot" type="text" value="' + esc(s.footerText) + '">') + '</div>' +
        '<div class="panel"><h3>সার্টিফিকেট</h3><div class="form-grid">' + fld('s_cs', 'স্বাক্ষরকারীর নাম', '<input id="s_cs" type="text" value="' + esc(s.certSigner) + '">') + fld('s_ct', 'স্বাক্ষরকারীর পদবি', '<input id="s_ct" type="text" value="' + esc(s.certSignerTitle) + '">') + '</div></div>' +
        '<div class="sticky-save"><button class="btn btn-primary btn-lg" type="submit">সেটিংস সংরক্ষণ করুন</button></div></form>' +
        '<div class="panel"><h3>অ্যাডমিন পাসওয়ার্ড</h3><p class="muted" style="margin:0">পাসওয়ার্ড বদলাতে Firebase Console → Authentication → Users-এ গিয়ে আপনার ইউজারের পাশের মেনু থেকে “Reset password” দিন।' + (rs[1].demo ? ' (ডেমো মোডে পাসওয়ার্ড demo1234)' : '') + '</p></div>' +
        '<div class="panel"><h3>ব্যাকআপ ও পুনরুদ্ধার</h3><p class="muted">সব পরীক্ষা, প্রশ্ন, নিবন্ধন ও ফলাফল একটি ফাইলে নামিয়ে রাখুন। পরীক্ষা চলার সময় ও পরে নিয়মিত ব্যাকআপ নামিয়ে নিজের কাছে রাখুন।</p><div class="row"><button class="btn" data-act="backup" type="button">ব্যাকআপ ডাউনলোড</button><label class="btn btn-danger" style="cursor:pointer">ব্যাকআপ থেকে পুনরুদ্ধার<input type="file" id="restoreFile" accept=".json,application/json" class="sr"></label></div></div>');
      $('#stForm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = function (i) { return $('#' + i).value; }, b = $('#stForm button[type=submit]'); busy(b, true);
        api('/api/admin/settings', { method: 'PUT', body: { siteName: v('s_name'), tagline: v('s_tag'), heroTitle: v('s_ht'), heroText: v('s_hx'), announcement: v('s_ann'), logoUrl: v('s_logo'), accent: v('s_acc'), about: v('s_about'), terms: v('s_terms'), contactPhone: v('s_ph'), contactEmail: v('s_em'), whatsapp: v('s_wa'), facebook: v('s_fb'), youtube: v('s_yt'), telegram: v('s_tg'), footerText: v('s_foot'), certSigner: v('s_cs'), certSignerTitle: v('s_ct') } })
          .then(function (r) { applyAccent(r.settings.accent); busy(b, false); toast('সেটিংস সংরক্ষিত হয়েছে', 'ok'); }).catch(function (e) { busy(b, false); fail(e); });
      });
      $('#restoreFile').addEventListener('change', function (ev) {
        var f = ev.target.files[0]; if (!f) return;
        confirmBox('বর্তমান সব ডেটা এই ব্যাকআপ ফাইলের ডেটা দিয়ে বদলে যাবে। আগে একটি ব্যাকআপ নামিয়ে রেখেছেন তো?', 'হ্যাঁ, পুনরুদ্ধার করুন', true).then(function (ok) {
          if (!ok) return;
          var rd = new FileReader();
          rd.onload = function () { var d; try { d = JSON.parse(rd.result); } catch (e) { return toast('ফাইলটি সঠিক নয়', 'err'); } api('/api/admin/restore', { method: 'POST', body: { data: d } }).then(function () { toast('পুনরুদ্ধার সম্পন্ন', 'ok'); Settings(); }).catch(fail); };
          rd.readAsText(f);
        });
      });
      H = {
        preset: function (el) { $('#s_acc').value = el.dataset.c; },
        backup: function () { api('/api/admin/backup').then(function (r) { download('backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(r.data), 'application/json'); toast('ব্যাকআপ নামানো হয়েছে', 'ok'); }).catch(fail); },
      };
    });
  }

  /* ---------- রাউটার ---------- */
  function route() {
    cleanup.splice(0).forEach(function (f) { f(); });
    H = {};
    var parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    var p = parts[0], id = parts[1], run;
    if (p === '' ) run = Dash();
    else if (p === 'exams') run = Exams();
    else if (p === 'exam') run = ExamForm(id || 'new');
    else if (p === 'questions' && id) run = Questions(id);
    else if (p === 'registrations') run = Regs(id);
    else if (p === 'results') run = Results(id);
    else if (p === 'notices') run = Notices();
    else if (p === 'sponsors') run = Sponsors();
    else if (p === 'settings') run = Settings();
    else run = Dash();
    window.scrollTo(0, 0);
    run.catch(fail);
  }
  function start() {
    api('/api/admin/me').then(function () { if (!start.bound) { start.bound = true; window.addEventListener('hashchange', route); } route(); }).catch(function (e) { if (e.status === 401) showLogin(); else showLogin(e.message); });
  }
  (window.backendReady || Promise.resolve()).then(start);
})();
