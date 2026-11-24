/* ইলম পরীক্ষা কেন্দ্র — ইউজার সাইট (হ্যাশ-রাউটিং, কোনো লাইব্রেরি ছাড়া) */
(function () {
  'use strict';
  var S = { cfg: null, offset: 0, cleanup: [] };
  var view = $('#app');
  var LETTERS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ'];
  var STATUS = { live: 'চলছে', upcoming: 'আসন্ন', ended: 'শেষ হয়েছে' };

  function now() { return Date.now() + S.offset; }
  function creds(id) { try { return JSON.parse(localStorage.getItem('ilm_c_' + id)) || null; } catch (e) { return null; } }
  function saveCreds(id, c) { try { localStorage.setItem('ilm_c_' + id, JSON.stringify(c)); } catch (e) { /* ঠিক আছে */ } }
  function onCleanup(fn) { S.cleanup.push(fn); }
  function setTitle(t) { document.title = (t ? t + ' | ' : '') + (S.cfg ? S.cfg.settings.siteName : 'পরীক্ষা কেন্দ্র'); }
  function loading() { view.innerHTML = '<div class="loading"><span class="spinner"></span></div>'; }
  function badge(st) { return '<span class="badge ' + st + '">' + STATUS[st] + '</span>'; }
  function go(h) { location.hash = h; }
  function errorView(msg, back) {
    view.innerHTML = '<div class="wrap section"><div class="empty"><span class="big">⚠</span><p>' + esc(msg) + '</p><a class="btn" href="' + (back || '#/') + '">ফিরে যান</a></div></div>';
  }
  function setSync(ms) { S.offset = ms - Date.now(); }

  /* ---------- কাউন্টডাউন ---------- */
  function countBlock(iso) {
    var u = ['দিন', 'ঘণ্টা', 'মিনিট', 'সেকেন্ড'].map(function (l) { return '<div class="u"><b>০</b><span>' + l + '</span></div>'; }).join('');
    return '<div class="count" data-count="' + esc(iso) + '" role="timer">' + u + '</div>';
  }
  function tickCounts() {
    $$('[data-count]').forEach(function (el) {
      var diff = Date.parse(el.dataset.count) - now();
      var d = Math.max(0, diff);
      var v = [Math.floor(d / 864e5), Math.floor(d / 36e5) % 24, Math.floor(d / 6e4) % 60, Math.floor(d / 1000) % 60];
      var bs = el.querySelectorAll('b');
      v.forEach(function (x, i) { var t = bn(x < 10 && i ? '0' + x : x); if (bs[i].textContent !== t) bs[i].textContent = t; });
      if (diff <= 0 && !el.dataset.done) { el.dataset.done = '1'; setTimeout(route, 1200); }
    });
  }
  setInterval(tickCounts, 1000);

  /* ---------- কার্ড ---------- */
  function examCard(e) {
    var cover = e.coverUrl ? '<div class="exam-cover" style="background-image:url(\'' + esc(e.coverUrl) + '\')">' : '<div class="exam-cover ph"><span class="cat-letter">' + esc((e.category || 'প').charAt(0)) + '</span>';
    cover += '<span class="badge-slot">' + badge(e.status) + '</span></div>';
    cover = cover.replace('<span class="badge-slot">', '<span class="badge-slot" style="position:absolute;top:12px;left:12px">');
    var when = e.status === 'upcoming' ? 'শুরু: ' + fmtDateTime(e.startAt) : e.status === 'live' ? 'শেষ: ' + fmtDateTime(e.endAt) : 'শেষ: ' + fmtDate(e.endAt);
    var action = e.status === 'ended' ? (e.resultsPublished ? 'ফলাফল দেখুন' : 'বিস্তারিত') : e.status === 'live' ? 'অংশ নিন' : 'বিস্তারিত';
    return '<a class="exam-card" href="#/exam/' + esc(e.id) + '">' + cover +
      '<div class="exam-body"><span class="muted small">' + esc(e.category) + (e.bookName ? ' · ' + esc(e.bookName) : '') + '</span>' +
      '<h3>' + esc(e.title) + '</h3>' +
      '<div class="meta"><span>⏱ ' + bn(e.durationMin) + ' মিনিট</span><span>❓ ' + bn(e.questionCount) + 'টি প্রশ্ন</span><span>' + (e.fee > 0 ? '৳ ' + fmtNum(e.fee) : 'বিনামূল্যে') + '</span></div>' +
      '<div class="exam-foot"><span class="muted">' + esc(when) + '</span><b style="color:var(--accent)">' + action + '</b></div></div></a>';
  }

  /* ---------- হোম ---------- */
  function Home() {
    return Promise.all([api('/api/public/exams')]).then(function (r) {
      setSync(r[0].serverNow);
      var exams = r[0].exams, c = S.cfg, s = c.settings;
      var feat = exams.filter(function (e) { return e.status === 'live'; })[0] || exams.filter(function (e) { return e.status === 'upcoming'; })[0] || exams[0];
      var ticket;
      if (feat) {
        var tgt = feat.status === 'upcoming' ? feat.startAt : feat.endAt;
        ticket = '<div class="ticket"><div class="tk-top">' + badge(feat.status) + '<h3>' + esc(feat.title) + '</h3>' +
          '<div class="meta"><span>' + esc(feat.category) + '</span><span>⏱ ' + bn(feat.durationMin) + ' মিনিট</span><span>❓ ' + bn(feat.questionCount) + 'টি প্রশ্ন</span></div></div>' +
          '<div class="tk-bot">' + (feat.status === 'ended' ? '<p class="muted">এই পরীক্ষা শেষ হয়েছে।</p>' : '<p class="muted small" style="margin-bottom:8px">' + (feat.status === 'upcoming' ? 'পরীক্ষা শুরু হতে বাকি' : 'নিবন্ধন ও পরীক্ষা শুরুর সময় বাকি') + '</p>' + countBlock(tgt)) +
          '<a class="btn btn-primary btn-block mt" href="#/exam/' + esc(feat.id) + '">' + (feat.status === 'ended' ? 'ফলাফল ও বিস্তারিত' : 'বিস্তারিত দেখুন ও নিবন্ধন করুন') + '</a></div></div>';
      } else {
        ticket = '<div class="ticket"><div class="tk-top"><span class="badge upcoming">শীঘ্রই</span><h3>নতুন পরীক্ষা আসছে</h3><p class="muted">নতুন পরীক্ষার ঘোষণা এখানেই দেওয়া হবে। নোটিশ পাতাটি দেখে রাখুন।</p></div><div class="tk-bot"><a class="btn btn-block" href="#/notices">নোটিশ দেখুন</a></div></div>';
      }
      var st = c.stats;
      var list = exams.slice(0, 6).map(examCard).join('');
      var notices = c.notices.slice(0, 3).map(noticeHtml).join('');
      var sp = c.sponsors.length ? '<section class="section alt"><div class="wrap"><div class="sec-head"><h2>আমাদের স্পনসর</h2></div><div class="sponsors">' + c.sponsors.map(sponsorHtml).join('') + '</div></div></section>' : '';
      view.innerHTML =
        '<section class="hero"><div class="wrap hero-grid"><div><h1>' + esc(s.heroTitle) + '</h1><p class="lead">' + esc(s.heroText) + '</p>' +
        '<div class="hero-cta"><a class="btn btn-primary btn-lg" href="#/exams">পরীক্ষাসমূহ দেখুন</a><a class="btn btn-lg btn-ghost" href="#/about">আমাদের সম্পর্কে</a></div></div>' + ticket + '</div></section>' +
        '<section class="wrap" style="margin-top:-1px;padding-top:36px"><div class="stats"><div><b>' + fmtNum(st.exams) + '</b><span>মোট পরীক্ষা</span></div><div><b>' + fmtNum(st.live + st.upcoming) + '</b><span>চলমান ও আসন্ন</span></div><div><b>' + fmtNum(st.ended) + '</b><span>সম্পন্ন পরীক্ষা</span></div></div></section>' +
        '<section class="section"><div class="wrap"><div class="sec-head"><h2>সাম্প্রতিক পরীক্ষা</h2><a href="#/exams">সবগুলো দেখুন</a></div>' +
        (list ? '<div class="grid">' + list + '</div>' : '<div class="empty"><span class="big">📚</span>এখনও কোনো পরীক্ষা প্রকাশ করা হয়নি।</div>') + '</div></section>' +
        '<section class="section alt"><div class="wrap"><div class="sec-head"><h2>অংশগ্রহণ করবেন যেভাবে</h2></div><div class="steps">' +
        '<div class="step"><h3>নিবন্ধন করুন</h3><p class="muted">পরীক্ষা বেছে নিয়ে নাম ও মোবাইল নম্বর দিন। আপনি একটি রোল নম্বর ও পাসকোড পাবেন।</p></div>' +
        '<div class="step"><h3>পরীক্ষা দিন</h3><p class="muted">নির্ধারিত সময়ে রোল ও পাসকোড দিয়ে প্রবেশ করুন। উত্তর নিজে নিজেই সংরক্ষিত হবে।</p></div>' +
        '<div class="step"><h3>ফলাফল ও সনদ</h3><p class="muted">ফলাফল প্রকাশের পর মেধাতালিকা দেখুন এবং নিজের সার্টিফিকেট ডাউনলোড করুন।</p></div></div></div></section>' +
        (notices ? '<section class="section"><div class="wrap narrow" style="width:min(860px,100% - 32px)"><div class="sec-head"><h2>সর্বশেষ নোটিশ</h2><a href="#/notices">সব নোটিশ</a></div>' + notices + '</div></section>' : '') + sp;
      setTitle('');
      tickCounts();
    });
  }
  function noticeHtml(n) {
    return '<div class="notice ' + (n.pinned ? 'pinned' : '') + '"><h4>' + (n.pinned ? '📌 ' : '') + esc(n.title) + '</h4><div class="muted small" style="margin-bottom:6px">' + fmtDate(n.createdAt) + '</div>' + rich(n.body) + '</div>';
  }
  function sponsorHtml(sp) {
    var inner = (sp.logoUrl ? '<img src="' + esc(sp.logoUrl) + '" alt="" loading="lazy">' : '') + '<span><b>' + esc(sp.name) + '</b>' + (sp.tier ? '<small>' + esc(sp.tier) + '</small>' : '') + '</span>';
    return sp.url ? '<a class="sponsor" href="' + esc(sp.url) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : '<div class="sponsor">' + inner + '</div>';
  }

  /* ---------- পরীক্ষার তালিকা ---------- */
  function Exams() {
    return api('/api/public/exams').then(function (r) {
      setSync(r.serverNow);
      var all = r.exams, f = { cat: '', st: '' };
      var cats = S.cfg.categories;
      view.innerHTML = '<div class="page-head"><div class="wrap"><h1>পরীক্ষাসমূহ</h1><p class="muted" style="margin:0">সব বিষয়ের পরীক্ষা এক জায়গায়</p></div></div><div class="wrap" style="padding-bottom:60px">' +
        '<div class="row mb" style="gap:20px"><div class="chips" id="stChips"><button class="chip on" data-st="">সব</button><button class="chip" data-st="live">চলছে</button><button class="chip" data-st="upcoming">আসন্ন</button><button class="chip" data-st="ended">শেষ হয়েছে</button></div>' +
        (cats.length > 1 ? '<select id="catSel" style="width:auto;min-width:160px"><option value="">সব বিষয়</option>' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>' : '') + '</div><div id="exList"></div></div>';
      function draw() {
        var l = all.filter(function (e) { return (!f.st || e.status === f.st) && (!f.cat || e.category === f.cat); });
        $('#exList').innerHTML = l.length ? '<div class="grid">' + l.map(examCard).join('') + '</div>' : '<div class="empty"><span class="big">🔎</span>এই ফিল্টারে কোনো পরীক্ষা নেই।</div>';
      }
      $('#stChips').addEventListener('click', function (e) {
        var b = e.target.closest('.chip'); if (!b) return;
        $$('#stChips .chip').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); f.st = b.dataset.st; draw();
      });
      var cs = $('#catSel'); if (cs) cs.addEventListener('change', function () { f.cat = cs.value; draw(); });
      draw(); setTitle('পরীক্ষাসমূহ');
    });
  }

  /* ---------- পরীক্ষার বিস্তারিত ---------- */
  function ExamPage(id) {
    return api('/api/public/exams/' + id).then(function (r) {
      setSync(r.serverNow);
      var e = r.exam, side = '', medals = ['🥇', '🥈', '🥉'];
      var link = location.href.split('#')[0] + '#/exam/' + e.id;
      var cta = '';
      if (e.status !== 'ended') cta += '<a class="btn btn-primary btn-block btn-lg" href="#/register/' + esc(e.id) + '">নিবন্ধন করুন</a>';
      if (e.status === 'live') cta += '<a class="btn btn-block mt" href="#/take/' + esc(e.id) + '" style="margin-top:12px">পরীক্ষা শুরু করুন</a>';
      if (e.status === 'upcoming') cta += '<p class="muted small center" style="margin:12px 0 0">রোল ও পাসকোড নিয়ে নির্ধারিত সময়ে প্রবেশ করুন</p>';
      if (e.status !== 'upcoming') cta += '<a class="btn btn-ghost btn-block" style="margin-top:12px" href="#/result/' + esc(e.id) + '">আমার ফলাফল</a>';
      if (e.status === 'ended' || e.resultsPublished) cta += e.resultsPublished ? '<a class="btn btn-ghost btn-block" style="margin-top:12px" href="#/leaderboard/' + esc(e.id) + '">মেধাতালিকা</a>' : '<p class="muted small center" style="margin:12px 0 0">ফলাফল শীঘ্রই প্রকাশিত হবে</p>';
      var count = e.status === 'ended' ? '' : '<p class="muted small" style="margin-bottom:8px">' + (e.status === 'upcoming' ? 'পরীক্ষা শুরু হতে বাকি' : 'শুরু করার শেষ সময় পর্যন্ত বাকি') + '</p>' + countBlock(e.status === 'upcoming' ? e.startAt : e.endAt) + '<div style="height:18px"></div>';
      side = '<aside class="side-sticky"><div class="card">' + badge(e.status) + '<div style="height:14px"></div>' + count +
        '<dl class="kv"><dt>শুরু</dt><dd>' + fmtDateTime(e.startAt) + '</dd><dt>শেষ</dt><dd>' + fmtDateTime(e.endAt) + '</dd><dt>সময়</dt><dd>' + bn(e.durationMin) + ' মিনিট</dd><dt>প্রশ্ন</dt><dd>' + bn(e.questionCount) + 'টি</dd><dt>পূর্ণমান</dt><dd>' + fmtScore(e.questionCount * e.marksPerQuestion) + '</dd>' +
        (e.negativeMarking > 0 ? '<dt>ভুল উত্তরে</dt><dd>−' + fmtScore(e.negativeMarking) + '</dd>' : '') + '<dt>ফি</dt><dd>' + (e.fee > 0 ? '৳ ' + fmtNum(e.fee) : 'বিনামূল্যে') + '</dd>' + '</dl>' + cta +
        '<div class="row" style="margin-top:18px;justify-content:center"><button class="btn btn-sm btn-ghost" id="cpLink">লিংক কপি</button><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=' + encodeURIComponent(e.title + ' ' + link) + '">হোয়াটসঅ্যাপ</a><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link) + '">ফেসবুক</a></div></div></aside>';
      var prizes = e.prizes && e.prizes.length ? '<h3>পুরস্কার</h3>' + e.prizes.map(function (p, i) { return '<div class="prize"><span class="medal">' + (medals[i] || '🏅') + '</span><span>' + esc(p) + '</span></div>'; }).join('') : '';
      var pay = e.fee > 0 && e.paymentInfo ? '<h3>ফি ও পেমেন্ট নির্দেশনা</h3><div class="info-box">' + rich(e.paymentInfo) + '</div>' : '';
      view.innerHTML = '<div class="page-head"><div class="wrap"><span class="muted">' + esc(e.category) + (e.bookName ? ' · ' + esc(e.bookName) : '') + '</span><h1 style="margin-top:6px">' + esc(e.title) + '</h1></div></div>' +
        '<div class="wrap" style="padding-bottom:70px"><div class="exam-layout"><div class="prose">' + (e.coverUrl ? '<div class="cover-banner" style="background-image:url(\'' + esc(e.coverUrl) + '\')"></div>' : '') +
        (e.description ? '<h3 style="margin-top:0">পরীক্ষা সম্পর্কে</h3>' + rich(e.description) : '') +
        (e.syllabus ? '<h3>সিলেবাস</h3>' + rich(e.syllabus) : '') + (e.rules ? '<h3>নিয়মাবলি</h3>' + lines(e.rules) : '') + prizes + pay + '</div>' + side + '</div></div>';
      $('#cpLink').addEventListener('click', function () { copyText(link); });
      setTitle(e.title); tickCounts();
    });
  }

  /* ---------- নিবন্ধন ---------- */
  function Register(id) {
    return api('/api/public/exams/' + id).then(function (r) {
      var e = r.exam;
      if (e.status === 'ended') return errorView('এই পরীক্ষার নিবন্ধনের সময় শেষ হয়ে গেছে।', '#/exam/' + id);
      var payHtml = e.fee > 0 ? '<div class="info-box"><p><b>ফি: ৳ ' + fmtNum(e.fee) + '</b></p>' + rich(e.paymentInfo) + '<p class="small muted">পেমেন্ট করার পর নিচে ট্রানজেকশন আইডি দিন। যাচাই শেষে আপনার নিবন্ধন অনুমোদিত হবে।</p></div>' +
        '<div class="form-grid"><div class="field"><label for="f_trx">ট্রানজেকশন আইডি (TrxID) *</label><input id="f_trx" type="text" autocomplete="off"></div><div class="field"><label for="f_snd">যে নম্বর থেকে পাঠিয়েছেন</label><input id="f_snd" type="tel" inputmode="tel" placeholder="01XXXXXXXXX"></div></div>' : '';
      view.innerHTML = '<div class="wrap" style="padding:44px 0 70px"><div class="form-card"><a href="#/exam/' + esc(id) + '" class="small">← পরীক্ষায় ফিরে যান</a><h2 style="margin-top:10px">নিবন্ধন করুন</h2><p class="muted">' + esc(e.title) + '</p><div id="regErr"></div>' +
        '<form id="regForm" novalidate><div class="field"><label for="f_name">পূর্ণ নাম *</label><input id="f_name" type="text" autocomplete="name" required></div>' +
        '<div class="field"><label for="f_phone">মোবাইল নম্বর *</label><input id="f_phone" type="tel" inputmode="tel" placeholder="01XXXXXXXXX" autocomplete="tel" required><div class="hint">বাংলা বা ইংরেজি, যেকোনো অঙ্কে লিখতে পারেন</div></div>' +
        '<div class="form-grid"><div class="field"><label for="f_dist">জেলা</label><input id="f_dist" list="distList" type="text" autocomplete="off"><datalist id="distList">' + DISTRICTS.map(function (d) { return '<option value="' + d + '">'; }).join('') + '</datalist></div>' +
        '<div class="field"><label for="f_mail">ইমেইল (ঐচ্ছিক)</label><input id="f_mail" type="email" autocomplete="email"></div></div>' +
        '<div class="field"><label for="f_inst">প্রতিষ্ঠান / পেশা (ঐচ্ছিক)</label><input id="f_inst" type="text"></div>' + payHtml +
        '<label class="check"><input type="checkbox" id="f_ok"><span>আমি <a href="#/about" target="_blank">নিয়মাবলি</a> পড়েছি এবং মেনে নিচ্ছি</span></label>' +
        '<button class="btn btn-primary btn-block btn-lg" id="regBtn" type="submit">নিবন্ধন সম্পন্ন করুন</button></form></div></div>';
      $('#regForm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var box = $('#regErr'), btn = $('#regBtn'); box.innerHTML = '';
        if (!$('#f_ok').checked) { box.innerHTML = '<div class="err-box">নিয়মাবলি মেনে নেওয়ার ঘরে টিক দিন।</div>'; return; }
        var body = { name: $('#f_name').value, phone: $('#f_phone').value, district: $('#f_dist').value, email: $('#f_mail').value, institution: $('#f_inst').value };
        if (e.fee > 0) { body.trxId = $('#f_trx').value; body.senderNumber = $('#f_snd').value; }
        btn.disabled = true; btn.textContent = 'অপেক্ষা করুন…';
        api('/api/public/exams/' + id + '/register', { method: 'POST', body: body }).then(function (res) {
          saveCreds(id, { roll: res.roll, passcode: res.passcode });
          view.innerHTML = '<div class="wrap" style="padding:44px 0 70px"><div class="form-card center"><div style="font-size:2.6rem">✅</div><h2>নিবন্ধন সম্পন্ন হয়েছে</h2><p class="muted">' + esc(res.name) + ', আপনার রোল ও পাসকোড নিচে দেওয়া হলো।</p>' +
            '<div class="cred"><div><span>রোল নম্বর</span><div class="big-code">' + bn(res.roll) + '</div></div><div><span>পাসকোড</span><div class="big-code">' + bn(res.passcode) + '</div></div></div>' +
            '<div class="info-box" style="text-align:left"><p><b>এখনই স্ক্রিনশট নিন বা লিখে রাখুন।</b> পরীক্ষায় প্রবেশ ও ফলাফল দেখতে এই দুটি লাগবে।</p>' +
            (res.status === 'pending' ? '<p>আপনার পেমেন্ট যাচাই চলছে। অনুমোদন হলে পরীক্ষা দিতে পারবেন।</p>' : '') + '</div>' +
            '<div class="row" style="justify-content:center"><button class="btn" id="cpCred">কপি করুন</button><a class="btn btn-primary" href="#/exam/' + esc(id) + '">পরীক্ষার পাতায় যান</a></div></div></div>';
          $('#cpCred').addEventListener('click', function () { copyText('রোল: ' + res.roll + ' | পাসকোড: ' + res.passcode); });
          window.scrollTo(0, 0);
        }).catch(function (err) { box.innerHTML = '<div class="err-box">' + esc(err.message) + '</div>'; btn.disabled = false; btn.textContent = 'নিবন্ধন সম্পন্ন করুন'; });
      });
      setTitle('নিবন্ধন — ' + e.title);
    });
  }

  /* ---------- পরীক্ষা দেওয়া ---------- */
  function Take(id) {
    return api('/api/public/exams/' + id).then(function (r) {
      setSync(r.serverNow);
      var e = r.exam, c = creds(id) || {};
      view.innerHTML = '<div class="wrap" style="padding:44px 0 70px"><div class="form-card"><a href="#/exam/' + esc(id) + '" class="small">← পরীক্ষায় ফিরে যান</a><h2 style="margin-top:10px">পরীক্ষায় প্রবেশ</h2><p class="muted">' + esc(e.title) + '</p>' +
        '<div class="info-box"><p>⏱ সময়: <b>' + bn(e.durationMin) + ' মিনিট</b> · ❓ প্রশ্ন: <b>' + bn(e.questionCount) + 'টি</b>' + (e.negativeMarking > 0 ? ' · ভুল উত্তরে −' + fmtScore(e.negativeMarking) : '') + '</p><p class="small muted">শুরু করার পর টাইমার থামবে না। ব্রাউজার বন্ধ করলেও সময় চলতে থাকবে, তবে একই রোল ও পাসকোড দিয়ে আবার ঢুকে বাকি সময়ে চালিয়ে যেতে পারবেন।</p></div>' +
        (e.status === 'upcoming' ? '<div class="err-box">পরীক্ষা শুরু হবে ' + fmtDateTime(e.startAt) + ' সময়ে।</div>' : '') + (e.status === 'ended' ? '<div class="err-box">পরীক্ষা শুরু করার সময় শেষ হয়ে গেছে। আগে শুরু করে থাকলে প্রবেশ করুন।</div>' : '') +
        '<div id="tkErr"></div><form id="tkForm"><div class="form-grid"><div class="field"><label for="t_roll">রোল নম্বর</label><input id="t_roll" type="text" inputmode="numeric" autocomplete="off" value="' + esc(c.roll || '') + '" required></div>' +
        '<div class="field"><label for="t_pass">পাসকোড</label><input id="t_pass" type="password" inputmode="numeric" autocomplete="off" value="' + esc(c.passcode || '') + '" required></div></div>' +
        '<button class="btn btn-primary btn-block btn-lg" id="tkBtn" type="submit">পরীক্ষা শুরু করুন</button></form><p class="small muted center" style="margin-top:16px">নিবন্ধন করেননি? <a href="#/register/' + esc(id) + '">এখানে নিবন্ধন করুন</a></p></div></div>';
      $('#tkForm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var roll = $('#t_roll').value, pass = $('#t_pass').value, btn = $('#tkBtn');
        btn.disabled = true; btn.textContent = 'যাচাই হচ্ছে…'; $('#tkErr').innerHTML = '';
        api('/api/public/exams/' + id + '/start', { method: 'POST', body: { roll: roll, passcode: pass } }).then(function (res) {
          saveCreds(id, { roll: roll, passcode: pass });
          if (res.submitted) { toast('আপনি ইতিমধ্যে পরীক্ষা দিয়েছেন', 'ok'); return go('#/result/' + id); }
          runExam(id, res);
        }).catch(function (err) { $('#tkErr').innerHTML = '<div class="err-box">' + esc(err.message) + '</div>'; btn.disabled = false; btn.textContent = 'পরীক্ষা শুরু করুন'; });
      });
      setTitle('পরীক্ষায় প্রবেশ');
    });
  }

  function runExam(id, res) {
    var qs = res.questions, ans = res.answers || {}, flags = {}, idx = 0, tabs = 0, finished = false, dirty = false, saving = false;
    var dl = Date.now() + (Date.parse(res.deadline) - res.serverNow);
    var total = qs.length;
    var tickT, saveT, periodic;
    view.innerHTML = '<div class="exam-top"><div class="wrap"><div class="row between" style="gap:10px"><div style="min-width:0"><b style="font-family:var(--serif)" class="grow">' + esc(res.exam.title) + '</b><div class="muted small">রোল ' + bn(res.roll) + ' · ' + esc(res.name) + '</div></div>' +
      '<div class="row" style="gap:10px"><span class="muted small" id="svState">সংরক্ষিত ✓</span><span class="timer" id="timer">--:--</span><button class="btn btn-primary btn-sm" data-act="submit">জমা দিন</button></div></div><div class="progress" style="margin-top:10px"><i id="prog" style="width:0"></i></div></div></div>' +
      '<div class="wrap" style="padding:26px 0 60px"><div class="exam-shell"><div id="qpane"></div><aside class="qnav"><b>প্রশ্নসূচি</b><div class="qgrid" id="qgrid"></div><div class="legend"><span><i style="background:color-mix(in srgb,var(--ok) 30%,transparent)"></i>উত্তর দেওয়া</span><span><i style="box-shadow:inset 0 0 0 2px var(--warn)"></i>চিহ্নিত</span></div><p class="small muted" id="cnt" style="margin:12px 0 0"></p></aside></div></div>';
    document.body.classList.add('in-exam');

    function answered() { return qs.filter(function (q) { return ans[q.id] != null; }).length; }
    function drawQ() {
      var q = qs[idx];
      $('#qpane').innerHTML = '<div class="qcard"><div class="qnum">প্রশ্ন ' + bn(idx + 1) + ' / ' + bn(total) + '</div><div class="qtext">' + esc(q.text).replace(/\n/g, '<br>') + '</div>' +
        q.opts.map(function (o, i) { return '<button class="opt ' + (ans[q.id] === o.k ? 'sel' : '') + '" data-k="' + o.k + '"><span class="lt">' + LETTERS[i] + '</span><span>' + esc(o.t) + '</span></button>'; }).join('') +
        '<div class="row between" style="margin-top:22px"><div class="row"><button class="btn btn-ghost btn-sm" data-act="clear"' + (ans[q.id] == null ? ' disabled' : '') + '>উত্তর মুছুন</button><button class="btn btn-ghost btn-sm" data-act="flag">' + (flags[q.id] ? '⚑ চিহ্ন সরান' : '⚐ পরে দেখব') + '</button></div>' +
        '<div class="row"><button class="btn" data-act="prev"' + (idx === 0 ? ' disabled' : '') + '>← আগের</button>' + (idx < total - 1 ? '<button class="btn btn-primary" data-act="next">পরের →</button>' : '<button class="btn btn-primary" data-act="submit">জমা দিন</button>') + '</div></div></div>';
      drawNav();
    }
    function drawNav() {
      $('#qgrid').innerHTML = qs.map(function (q, i) { return '<button data-go="' + i + '" class="' + (ans[q.id] != null ? 'done ' : '') + (flags[q.id] ? 'flag ' : '') + (i === idx ? 'cur' : '') + '" aria-label="প্রশ্ন ' + bn(i + 1) + '">' + bn(i + 1) + '</button>'; }).join('');
      var a = answered(); $('#prog').style.width = (a / total * 100) + '%'; $('#cnt').textContent = 'উত্তর দেওয়া হয়েছে ' + bn(a) + '/' + bn(total);
    }
    function mark() { dirty = true; $('#svState').textContent = 'সংরক্ষণ হচ্ছে…'; clearTimeout(saveT); saveT = setTimeout(save, 6000); }
    function save() {
      if (finished || saving || !dirty) return;
      saving = true; dirty = false;
      api('/api/public/attempts/' + res.attemptId + '/save', { method: 'POST', body: { token: res.token, answers: ans, tabSwitches: tabs } }).then(function (r) {
        saving = false;
        if (r.submitted) { finished = true; cleanupExam(); toast('সময় শেষ — উত্তর জমা হয়েছে', 'ok'); go('#/result/' + id); return; }
        $('#svState').textContent = dirty ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষিত ✓';
      }).catch(function () { saving = false; dirty = true; $('#svState').textContent = '⚠ সংরক্ষণ হয়নি, আবার চেষ্টা চলছে'; });
    }
    function select(k) { var q = qs[idx]; ans[q.id] = k; mark(); drawQ(); }
    function submit(auto) {
      if (finished) return;
      var un = total - answered();
      function doSubmit() {
        finished = true; cleanupExam();
        view.innerHTML = '<div class="loading" style="flex-direction:column;gap:14px"><span class="spinner"></span><p>উত্তর জমা হচ্ছে…</p></div>';
        (function attempt(n) {
          api('/api/public/attempts/' + res.attemptId + '/submit', { method: 'POST', body: { token: res.token, answers: ans, tabSwitches: tabs } }).then(function () {
            toast('উত্তর জমা হয়েছে', 'ok'); go('#/result/' + id);
          }).catch(function (err) {
            if (err.status === 403 || err.status === 404) { go('#/result/' + id); return; }
            view.innerHTML = '<div class="loading" style="flex-direction:column;gap:14px"><span class="spinner"></span><p>জমা দিতে সমস্যা হচ্ছে। ইন্টারনেট সংযোগ ঠিক রাখুন, আবার চেষ্টা চলছে…</p></div>';
            setTimeout(function () { attempt(n + 1); }, 3000);
          });
        })(0);
      }
      if (auto) return doSubmit();
      var fl = Object.keys(flags).filter(function (k) { return flags[k]; }).length;
      var m = modal({ title: 'উত্তর জমা দেবেন?', body: '<p>উত্তর দেওয়া হয়েছে: <b>' + bn(answered()) + '</b>টি<br>বাকি আছে: <b>' + bn(un) + '</b>টি' + (fl ? '<br>চিহ্নিত: <b>' + bn(fl) + '</b>টি' : '') + '</p><p class="muted small">জমা দেওয়ার পর আর বদলানো যাবে না।</p>', actions: '<button class="btn btn-ghost" data-close>ফিরে যাই</button><button class="btn btn-primary" data-ok>হ্যাঁ, জমা দিন</button>' });
      $('[data-ok]', m).addEventListener('click', function () { m.close(); doSubmit(); });
    }
    function tick() {
      var rem = dl - Date.now(), t = $('#timer');
      if (!t) return;
      t.textContent = clock(rem);
      t.className = 'timer' + (rem < 60e3 ? ' crit' : rem < 300e3 ? ' warn' : '');
      if (rem <= 0 && !finished) submit(true);
    }
    function onClick(ev) {
      var b = ev.target.closest('button'); if (!b || finished) return;
      if (b.dataset.k != null) return select(parseInt(b.dataset.k, 10));
      if (b.dataset.go != null) { idx = parseInt(b.dataset.go, 10); drawQ(); window.scrollTo({ top: 0 }); return; }
      var a = b.dataset.act, q = qs[idx];
      if (a === 'next' && idx < total - 1) { idx++; drawQ(); window.scrollTo({ top: 0 }); }
      else if (a === 'prev' && idx > 0) { idx--; drawQ(); window.scrollTo({ top: 0 }); }
      else if (a === 'clear') { delete ans[q.id]; mark(); drawQ(); }
      else if (a === 'flag') { flags[q.id] = !flags[q.id]; drawQ(); }
      else if (a === 'submit') submit(false);
    }
    function onKey(ev) {
      if (finished || document.querySelector('.modal-wrap')) return;
      var n = parseInt(ev.key, 10), q = qs[idx];
      if (n >= 1 && n <= q.opts.length) select(q.opts[n - 1].k);
      else if (ev.key === 'ArrowRight' && idx < total - 1) { idx++; drawQ(); }
      else if (ev.key === 'ArrowLeft' && idx > 0) { idx--; drawQ(); }
    }
    function onVis() { if (document.hidden && !finished) { tabs++; dirty = true; save(); } else if (!document.hidden && !finished && tabs) toast('পরীক্ষা চলাকালে অন্য ট্যাবে যাবেন না। এটি রেকর্ড হচ্ছে।', 'err'); }
    function onLeave(ev) { if (!finished) { ev.preventDefault(); ev.returnValue = ''; } }
    function cleanupExam() {
      clearInterval(tickT); clearInterval(periodic); clearTimeout(saveT);
      document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', onLeave); view.removeEventListener('click', onClick);
      document.body.classList.remove('in-exam');
    }
    view.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVis); window.addEventListener('beforeunload', onLeave);
    tickT = setInterval(tick, 500); periodic = setInterval(function () { dirty = true; save(); }, 30000);
    onCleanup(function () { if (!finished) { finished = true; cleanupExam(); } });
    drawQ(); tick(); setTitle('পরীক্ষা চলছে');
  }

  /* ---------- ফলাফল ---------- */
  function Result(id) {
    return api('/api/public/exams/' + id).then(function (r) {
      var e = r.exam, c = creds(id) || {};
      function form(msg) {
        view.innerHTML = '<div class="wrap" style="padding:44px 0 70px"><div class="form-card"><a href="#/exam/' + esc(id) + '" class="small">← পরীক্ষায় ফিরে যান</a><h2 style="margin-top:10px">আমার ফলাফল</h2><p class="muted">' + esc(e.title) + '</p>' + (msg ? '<div class="err-box">' + esc(msg) + '</div>' : '') +
          '<form id="rsForm"><div class="form-grid"><div class="field"><label for="r_roll">রোল নম্বর</label><input id="r_roll" type="text" inputmode="numeric" value="' + esc(c.roll || '') + '" required></div><div class="field"><label for="r_pass">পাসকোড</label><input id="r_pass" type="password" inputmode="numeric" value="' + esc(c.passcode || '') + '" required></div></div><button class="btn btn-primary btn-block btn-lg" type="submit">ফলাফল দেখুন</button></form></div></div>';
        $('#rsForm').addEventListener('submit', function (ev) { ev.preventDefault(); c = { roll: $('#r_roll').value, passcode: $('#r_pass').value }; load(); });
        setTitle('আমার ফলাফল');
      }
      function load() {
        loading();
        api('/api/public/exams/' + id + '/result', { method: 'POST', body: c }).then(function (d) { saveCreds(id, c); show(d); }).catch(function (err) { form(err.message); });
      }
      function msgView(icon, title, text, extra) {
        view.innerHTML = '<div class="wrap" style="padding:60px 0"><div class="form-card center"><div style="font-size:2.6rem">' + icon + '</div><h2>' + esc(title) + '</h2><p class="muted">' + esc(text) + '</p>' + (extra || '') + '</div></div>';
      }
      function show(d) {
        if (d.state === 'none') return msgView('📝', 'আপনি এই পরীক্ষায় অংশ নেননি', d.name + ', রোল ' + bn(d.roll), '<a class="btn btn-primary" href="#/exam/' + esc(id) + '">পরীক্ষার পাতায় যান</a>');
        if (d.state === 'in_progress') return msgView('⏳', 'আপনার পরীক্ষা চলছে', 'পরীক্ষায় ফিরে গিয়ে উত্তর জমা দিন।', '<a class="btn btn-primary" href="#/take/' + esc(id) + '">পরীক্ষায় ফিরুন</a>');
        if (d.state === 'submitted_hidden') return msgView('✅', 'আপনার উত্তর জমা হয়েছে', 'ফলাফল প্রকাশিত হলে এখান থেকে দেখতে পারবেন। ধন্যবাদ, ' + d.name + '।', '<a class="btn" href="#/exam/' + esc(id) + '">পরীক্ষার পাতায় যান</a>');
        var pct = d.totalMarks > 0 ? Math.min(1, d.score / d.totalMarks) : 0, C = 2 * Math.PI * 70;
        var rankHtml = d.rank ? '<div class="rank-badge">' + (d.rank <= 3 ? ['🥇', '🥈', '🥉'][d.rank - 1] : '🏅') + ' মেধাক্রম: ' + bn(d.rank) + ' (মোট ' + bn(d.participants) + ' জনের মধ্যে)</div>' : '<p class="muted small">মেধাক্রম ফলাফল প্রকাশের পর দেখা যাবে।</p>';
        var review = '';
        if (d.review) {
          review = '<div class="mt"><h3>উত্তর পর্যালোচনা</h3>' + d.review.map(function (q, n) {
            return '<div class="card" style="margin-bottom:14px"><div class="qnum">প্রশ্ন ' + bn(n + 1) + '</div><div class="qtext" style="font-size:1.12rem;margin-bottom:14px">' + esc(q.text) + '</div>' +
              q.opts.map(function (o, i) { var cls = o.k === q.correct ? 'right' : (o.k === q.chosen ? 'wrong' : ''); return '<div class="opt static ' + cls + '"><span class="lt">' + LETTERS[i] + '</span><span>' + esc(o.t) + (o.k === q.chosen ? ' <small>(আপনার উত্তর)</small>' : '') + '</span></div>'; }).join('') +
              (q.chosen == null ? '<p class="small muted">আপনি এই প্রশ্নের উত্তর দেননি।</p>' : '') + (q.explanation ? '<p class="small info-box" style="margin:8px 0 0">' + esc(q.explanation) + '</p>' : '') + '</div>';
          }).join('') + '</div>';
        }
        var cert = d.exam.certificate && d.exam.resultsPublished ? '<a class="btn btn-primary" href="#/certificate/' + esc(id) + '">সার্টিফিকেট</a>' : '';
        view.innerHTML = '<div class="wrap" style="padding:40px 0 70px;max-width:820px"><div class="card" style="padding:32px"><div class="row" style="gap:32px;justify-content:center"><div class="ring"><svg width="170" height="170" viewBox="0 0 170 170"><circle cx="85" cy="85" r="70" fill="none" stroke="var(--card3)" stroke-width="12"/><circle cx="85" cy="85" r="70" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pct)) + '"/></svg><div class="c"><b>' + fmtScore(d.score) + '</b><span>/ ' + fmtScore(d.totalMarks) + '</span></div></div>' +
          '<div style="min-width:220px"><span class="muted">' + esc(d.exam.title) + '</span><h2 style="margin:4px 0 8px">' + esc(d.name) + '</h2><div class="muted small" style="margin-bottom:12px">রোল ' + bn(d.roll) + (d.district ? ' · ' + esc(d.district) : '') + '</div>' + rankHtml + '</div></div>' +
          '<div class="result-grid"><div class="rstat"><b style="color:var(--ok)">' + bn(d.correct) + '</b><span>সঠিক</span></div><div class="rstat"><b style="color:var(--danger)">' + bn(d.wrong) + '</b><span>ভুল</span></div><div class="rstat"><b>' + bn(d.unanswered) + '</b><span>উত্তর নেই</span></div><div class="rstat"><b style="font-size:1.1rem;line-height:2.1rem">' + fmtDur(d.timeTaken) + '</b><span>সময় লেগেছে</span></div></div>' +
          '<div class="row mt" style="justify-content:center">' + cert + (d.exam.resultsPublished ? '<a class="btn" href="#/leaderboard/' + esc(id) + '">মেধাতালিকা</a>' : '') + '<a class="btn btn-ghost" href="#/exams">আরও পরীক্ষা</a></div></div>' + review + '</div>';
        setTitle('আমার ফলাফল'); window.scrollTo(0, 0);
      }
      if (c.roll && c.passcode) load(); else form('');
    });
  }

  /* ---------- মেধাতালিকা ---------- */
  function Leaderboard(id) {
    return api('/api/public/exams/' + id + '/leaderboard').then(function (d) {
      var e = d.exam;
      if (!d.published) return view.innerHTML = '<div class="wrap" style="padding:60px 0"><div class="form-card center"><div style="font-size:2.6rem">⏳</div><h2>ফলাফল এখনও প্রকাশ হয়নি</h2><p class="muted">' + esc(e.title) + '</p><a class="btn" href="#/exam/' + esc(id) + '">পরীক্ষার পাতায় যান</a></div></div>', setTitle('মেধাতালিকা');
      view.innerHTML = '<div class="page-head"><div class="wrap"><h1>মেধাতালিকা</h1><p class="muted" style="margin:0">' + esc(e.title) + ' · মোট ' + fmtNum(d.total) + ' জন অংশগ্রহণকারী</p></div></div><div class="wrap" style="padding-bottom:70px"><div class="row between mb"><input id="lbSearch" type="search" placeholder="নাম বা জেলা দিয়ে খুঁজুন" style="max-width:340px"><a class="btn btn-ghost btn-sm" href="#/exam/' + esc(id) + '">পরীক্ষার পাতা</a></div><div id="lbBox"></div></div>';
      function draw(q) {
        q = (q || '').trim().toLowerCase();
        var rows = d.rows.filter(function (r) { return !q || (r.name + ' ' + r.district + ' ' + r.institution).toLowerCase().indexOf(q) >= 0; });
        $('#lbBox').innerHTML = rows.length ? '<div class="tbl-wrap"><table><thead><tr><th>ক্রম</th><th>নাম</th><th>জেলা</th><th>নম্বর</th><th>সঠিক</th><th>সময়</th></tr></thead><tbody>' + rows.map(function (r) {
          return '<tr><td><span class="rk ' + (r.rank <= 3 ? 'r' + r.rank : '') + '">' + (r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] + ' ' : '') + bn(r.rank) + '</span></td><td class="wrap-t"><b>' + esc(r.name) + '</b>' + (r.institution ? '<div class="muted small">' + esc(r.institution) + '</div>' : '') + '</td><td>' + esc(r.district) + '</td><td><b>' + fmtScore(r.score) + '</b> / ' + fmtScore(r.totalMarks) + '</td><td>' + bn(r.correct) + '</td><td>' + fmtDur(r.timeTaken) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty"><span class="big">🔎</span>কাউকে খুঁজে পাওয়া যায়নি।</div>';
      }
      $('#lbSearch').addEventListener('input', function (ev) { draw(ev.target.value); });
      draw(''); setTitle('মেধাতালিকা — ' + e.title);
    });
  }

  /* ---------- সার্টিফিকেট ---------- */
  function Certificate(id) {
    return api('/api/public/exams/' + id).then(function (r) {
      var c = creds(id);
      if (!c) return go('#/result/' + id);
      return api('/api/public/exams/' + id + '/result', { method: 'POST', body: c }).then(function (d) {
        if (d.state !== 'ready' || !d.exam.certificate || !d.exam.resultsPublished) return errorView('সার্টিফিকেট এখনও পাওয়া যাচ্ছে না। ফলাফল প্রকাশের পর আবার চেষ্টা করুন।', '#/result/' + id);
        var s = S.cfg.settings, top = d.rank && d.rank <= 3, ord = ['১ম', '২য়', '৩য়'];
        var line = top ? 'মেধাতালিকায় <b>' + ord[d.rank - 1] + ' স্থান</b> অধিকার করে <b>' + fmtScore(d.score) + '</b> নম্বর (পূর্ণমান ' + fmtScore(d.totalMarks) + ') অর্জন করেছেন।' : 'সফলভাবে অংশগ্রহণ করে <b>' + fmtScore(d.score) + '</b> নম্বর (পূর্ণমান ' + fmtScore(d.totalMarks) + ') অর্জন করেছেন।';
        view.innerHTML = '<div class="wrap" style="padding:30px 0 60px"><div class="row between mb no-print"><a href="#/result/' + esc(id) + '">← ফলাফলে ফিরুন</a><button class="btn btn-primary" id="prBtn">প্রিন্ট / PDF সংরক্ষণ</button></div><div class="cert-stage"><div class="cert"><div class="cert-in">' +
          '<div><div class="org">' + esc(s.siteName) + '</div><h1>' + (top ? 'মেধা সনদ' : 'অংশগ্রহণ সনদ') + '</h1><div class="sub">এই মর্মে সনদ প্রদান করা হচ্ছে যে</div></div>' +
          '<div><div class="nm">' + esc(d.name) + '</div></div>' +
          '<div class="body">“' + esc(d.exam.title) + '” পরীক্ষায় ' + line + '</div>' +
          '<div class="sign"><div>' + esc(s.certSigner) + '<br><small>' + esc(s.certSignerTitle) + '</small></div><div class="seal">' + (top ? bn(d.rank) + '<br>স্থান' : 'সফল<br>অংশ') + '</div><div>তারিখ: ' + fmtDate(d.exam.endAt) + '<br><small>সনদ নং: ' + esc(id.slice(0, 4).toUpperCase()) + '-' + bn(d.roll) + '</small></div></div></div></div></div></div>';
        $('#prBtn').addEventListener('click', function () { window.print(); });
        setTitle('সার্টিফিকেট');
      });
    });
  }

  /* ---------- নোটিশ ও পরিচিতি ---------- */
  function Notices() {
    var n = S.cfg.notices;
    view.innerHTML = '<div class="page-head"><div class="wrap"><h1>নোটিশ</h1></div></div><div class="wrap" style="padding-bottom:70px;max-width:860px">' + (n.length ? n.map(noticeHtml).join('') : '<div class="empty"><span class="big">📭</span>এখনও কোনো নোটিশ নেই।</div>') + '</div>';
    setTitle('নোটিশ');
    return Promise.resolve();
  }
  function About() {
    var s = S.cfg.settings;
    var contact = [s.contactPhone && '📞 ' + esc(s.contactPhone), s.contactEmail && '✉ <a href="mailto:' + esc(s.contactEmail) + '">' + esc(s.contactEmail) + '</a>', s.whatsapp && '💬 হোয়াটসঅ্যাপ: ' + esc(s.whatsapp)].filter(Boolean);
    view.innerHTML = '<div class="page-head"><div class="wrap"><h1>আমাদের সম্পর্কে</h1></div></div><div class="wrap prose" style="padding-bottom:70px;max-width:760px">' + rich(s.about) + '<h3>নিয়মাবলি</h3>' + lines(s.terms) + (contact.length ? '<h3>যোগাযোগ</h3><p>' + contact.join('<br>') + '</p>' : '') + sponsorBlock() + '</div>';
    setTitle('আমাদের সম্পর্কে');
    return Promise.resolve();
  }
  function sponsorBlock() { return S.cfg.sponsors.length ? '<h3>স্পনসর</h3><div class="sponsors" style="justify-content:flex-start">' + S.cfg.sponsors.map(sponsorHtml).join('') + '</div>' : ''; }

  /* ---------- রাউটার ---------- */
  var ROUTES = [
    [/^\/?$/, Home, 'home'], [/^\/exams$/, Exams, 'exams'], [/^\/exam\/([\w-]+)$/, ExamPage, 'exams'], [/^\/register\/([\w-]+)$/, Register, 'exams'],
    [/^\/take\/([\w-]+)$/, Take, 'exams'], [/^\/result\/([\w-]+)$/, Result, 'exams'], [/^\/leaderboard\/([\w-]+)$/, Leaderboard, 'exams'],
    [/^\/certificate\/([\w-]+)$/, Certificate, 'exams'], [/^\/notices$/, Notices, 'notices'], [/^\/about$/, About, 'about'],
  ];
  function route() {
    S.cleanup.splice(0).forEach(function (f) { try { f(); } catch (e) { /* ঠিক আছে */ } });
    var path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
    var hit = null, args = [];
    ROUTES.forEach(function (r) { if (!hit) { var m = path.match(r[0]); if (m) { hit = r; args = m.slice(1); } } });
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', !!hit && a.dataset.nav === hit[2]); });
    $('#navLinks').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
    if (!hit) { errorView('পেজটি পাওয়া যায়নি।'); return; }
    loading(); window.scrollTo(0, 0);
    var p; try { p = hit[1].apply(null, args); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(function () { view.focus({ preventScroll: true }); }).catch(function (err) { errorView(err.message || 'কিছু একটা সমস্যা হয়েছে।', '#/'); });
  }

  function buildChrome() {
    var s = S.cfg.settings;
    applyAccent(s.accent);
    $('#brand').innerHTML = '<span class="brand-mark">' + (s.logoUrl ? '<img src="' + esc(s.logoUrl) + '" alt="">' : '✦') + '</span><span>' + esc(s.siteName) + '</span>';
    $('#topbar').innerHTML = s.announcement ? '<div class="topbar">' + esc(s.announcement) + '</div>' : '';
    var social = [['ফেসবুক', s.facebook], ['ইউটিউব', s.youtube], ['টেলিগ্রাম', s.telegram]].filter(function (x) { return x[1]; })
      .map(function (x) { return '<a href="' + esc(x[1]) + '" target="_blank" rel="noopener noreferrer">' + x[0] + '</a>'; }).join('');
    var contact = [s.contactPhone && '<a href="tel:' + esc(s.contactPhone) + '">' + esc(s.contactPhone) + '</a>', s.contactEmail && '<a href="mailto:' + esc(s.contactEmail) + '">' + esc(s.contactEmail) + '</a>'].filter(Boolean).join('');
    $('#footer').innerHTML = '<div class="wrap"><div class="foot-grid"><div><div class="brand" style="margin-bottom:10px"><span class="brand-mark">✦</span><span>' + esc(s.siteName) + '</span></div><p class="muted small" style="max-width:30em">' + esc(s.tagline) + '</p></div>' +
      '<div><h4>পাতাসমূহ</h4><a href="#/exams">পরীক্ষাসমূহ</a><a href="#/notices">নোটিশ</a><a href="#/about">আমাদের সম্পর্কে</a></div><div><h4>যোগাযোগ</h4>' + (contact || '<span class="muted small">—</span>') + social + '</div></div><div class="copy"><span>© ' + bn(new Date().getFullYear()) + ' ' + esc(s.siteName) + ' · ' + esc(s.footerText) + '</span></div></div>';
  }

  $('#menuBtn').addEventListener('click', function () { var o = $('#navLinks').classList.toggle('open'); this.setAttribute('aria-expanded', o); });
  $('#themeBtn').addEventListener('click', toggleTheme);
  window.addEventListener('hashchange', route);

  (window.backendReady || Promise.resolve()).then(function () { return api('/api/public/config'); }).then(function (c) {
    S.cfg = c; setSync(c.serverNow); buildChrome();
    if (c.demo) $('#topbar').innerHTML += '<div class="topbar" style="background:var(--danger);color:#fff">ডেমো মোড: ডেটা শুধু এই ব্রাউজারে থাকছে। সত্যিকারের পরীক্ষার আগে Firebase যুক্ত করুন (README দেখুন)।</div>';
    route();
  }).catch(function (e) { errorView(e.message || 'সাইট লোড করা যায়নি।'); });
})();
