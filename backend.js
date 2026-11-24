/* সার্ভার ছাড়া ব্যাকএন্ড: পুরনো "api(...)" ডাকগুলোকে সরাসরি Firestore (বা ডেমো স্টোর) কাজে বদলে দেয়।
   নম্বর হিসাব অ্যাডমিন প্যানেল থেকে হয় — সঠিক উত্তর কখনো সাধারণ ব্যবহারকারীর ব্রাউজারে যায় না। */
(function () {
  'use strict';
  var S = window.Store;
  var GRACE = 30000;
  var BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  var offset = 0, offsetKnown = false;
  var memo = {};

  function HttpError(status, msg, extra) { var e = new Error(msg); e.status = status; e.extra = extra || null; return e; }
  function now() { return Date.now() + offset; }
  function rid() { var a = new Uint8Array(8); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function randInt(min, max) { var a = new Uint32Array(1); crypto.getRandomValues(a); return min + (a[0] % (max - min + 1)); }
  var clean = function (v, max) { return String(v == null ? '' : v).replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 300); };
  var cleanMulti = function (v, max) { return String(v == null ? '' : v).replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max || 5000); };
  var num = function (v, min, max, def) { v = Number(v); return isFinite(v) && v === v ? Math.min(max, Math.max(min, v)) : def; };
  var bool = function (v) { return v === true || v === 'true' || v === 1 || v === '1' || v === 'on'; };
  var round2 = function (n) { return Math.round(n * 100) / 100; };
  var safeUrl = function (u) { u = clean(u, 500); return /^(https?:\/\/|\/)[^\s<>"']*$/i.test(u) ? u : ''; };
  var isoOrNull = function (v) { var t = Date.parse(v); return isFinite(t) ? new Date(t).toISOString() : null; };
  var toAscii = function (s) { return String(s == null ? '' : s).replace(/[০-৯]/g, function (d) { return BN_DIGITS.indexOf(d); }); };
  function shuffle(arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = randInt(0, i); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function normPhone(v) {
    var d = toAscii(v).replace(/[^\d+]/g, '').replace(/^\+/, '');
    if (d.indexOf('880') === 0) d = '0' + d.slice(3);
    if (/^1[3-9]\d{8}$/.test(d)) d = '0' + d;
    if (/^01[3-9]\d{8}$/.test(d)) return d;
    return /^\d{8,15}$/.test(d) ? d : '';
  }
  function cached(key, ttl, fn) {
    var m = memo[key];
    if (m && m.exp > Date.now()) return Promise.resolve(m.v);
    return fn().then(function (v) { memo[key] = { v: v, exp: Date.now() + ttl }; return v; });
  }
  function chunk(arr, n) { var o = []; for (var i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }
  function runBatches(ops) { return chunk(ops, 400).reduce(function (p, c) { return p.then(function () { return S.batch(c); }); }, Promise.resolve()); }

  /* ---------- ডিফল্ট ---------- */
  function defaultSettings() {
    return {
      siteName: 'ইলম পরীক্ষা কেন্দ্র', tagline: 'বই পড়ুন, পরীক্ষা দিন, মেধা যাচাই করুন', heroTitle: 'জ্ঞানের পথে এগিয়ে চলুন',
      heroText: 'নিয়মিত অনলাইন পরীক্ষা, বইভিত্তিক প্রতিযোগিতা ও মেধাতালিকা — সবকিছু এক জায়গায়।',
      about: 'এটি একটি অনলাইন পরীক্ষা কেন্দ্র। এখানে নিয়মিত বইভিত্তিক ও বিষয়ভিত্তিক পরীক্ষার আয়োজন করা হয়।\n\nউদ্দেশ্য হলো পাঠকদের মধ্যে বই পড়ার অভ্যাস তৈরি করা এবং সবার জন্য সহজ, স্বচ্ছ ও নিরপেক্ষ একটি প্ল্যাটফর্ম দেওয়া।',
      contactEmail: '', contactPhone: '', whatsapp: '', facebook: '', youtube: '', telegram: '', footerText: 'সর্বস্বত্ব সংরক্ষিত', announcement: '',
      accent: '#d9a441', logoUrl: '', certSigner: 'আয়োজক কমিটি', certSignerTitle: 'কর্তৃপক্ষ',
      terms: 'প্রতিটি পরীক্ষায় একজন অংশগ্রহণকারী একবারই অংশ নিতে পারবেন।\nপরীক্ষা চলাকালে অন্য ট্যাব বা অ্যাপে যাওয়া থেকে বিরত থাকুন।\nআয়োজকের সিদ্ধান্তই চূড়ান্ত।',
    };
  }
  function getSite() {
    return S.get('site/main').then(function (d) {
      d = d || {};
      return { settings: Object.assign(defaultSettings(), d.settings || {}), notices: d.notices || [], sponsors: d.sponsors || [] };
    });
  }
  function saveSite(site) { return S.set('site/main', { settings: site.settings, notices: site.notices, sponsors: site.sponsors }).then(function () { memo = {}; }); }

  function seedDemo() {
    var t = Date.now(), id = rid();
    var qs = [
      ['রাসূলুল্লাহ ﷺ কোন শহরে জন্মগ্রহণ করেন?', ['মক্কা', 'মদিনা', 'তায়েফ', 'জেদ্দা'], 0, 'তিনি মক্কায় জন্মগ্রহণ করেন।'],
      ['রাসূলুল্লাহ ﷺ-এর পিতার নাম কী?', ['আবু তালিব', 'আব্দুল্লাহ', 'আব্দুল মুত্তালিব', 'আবু লাহাব'], 1, 'তাঁর পিতা আব্দুল্লাহ, মাতা আমিনা।'],
      ['প্রথম ওহী কোন গুহায় নাজিল হয়?', ['সাওর গুহা', 'হেরা গুহা', 'আসহাবে কাহফ', 'উহুদ গুহা'], 1, 'হেরা গুহায় সূরা আলাক্বের প্রথম আয়াতগুলো নাজিল হয়।'],
      ['রাসূলুল্লাহ ﷺ মক্কা থেকে মদিনায় হিজরত করেন কত খ্রিষ্টাব্দে?', ['৫৭০', '৬১০', '৬২২', '৬৩২'], 2, 'হিজরত হয় ৬২২ খ্রিষ্টাব্দে।'],
      ['বদরের যুদ্ধ কত হিজরিতে সংঘটিত হয়?', ['১ম হিজরি', '২য় হিজরি', '৩য় হিজরি', '৫ম হিজরি'], 1, 'বদরের যুদ্ধ ২য় হিজরিতে সংঘটিত হয়।'],
    ].map(function (x) { return { id: rid(), text: x[0], options: x[1], correct: x[2], explanation: x[3] }; });
    var ex = Object.assign({ id: id, createdAt: new Date(t).toISOString(), questionCount: qs.length }, sanitizeExam({
      title: 'নমুনা পরীক্ষা — সীরাতুন্নবী ﷺ (ডেমো)', category: 'সীরাত', description: 'এটি একটি ডেমো পরীক্ষা, যাতে আপনি পুরো সিস্টেমটি চালিয়ে দেখতে পারেন।',
      syllabus: 'রাসূলুল্লাহ ﷺ-এর জন্ম, ওহী, হিজরত ও প্রাথমিক যুদ্ধসমূহ', rules: 'প্রতিটি প্রশ্নের জন্য ১ নম্বর।\nভুল উত্তরের জন্য নম্বর কাটা যাবে না।\nসময় শেষ হলে উত্তর স্বয়ংক্রিয়ভাবে জমা হবে।',
      startAt: new Date(t - 3600e3).toISOString(), endAt: new Date(t + 30 * 864e5).toISOString(), durationMin: 10, fee: 0,
      prizes: ['১ম স্থান — পুরস্কার', '২য় স্থান — পুরস্কার', '৩য় স্থান — পুরস্কার'], marksPerQuestion: 1, negativeMarking: 0, questionLimit: 0,
      shuffleQuestions: true, shuffleOptions: true, showAnswers: true, certificate: true, status: 'published', resultsPublished: false,
    }));
    var site = { settings: defaultSettings(), notices: [{ id: rid(), title: 'স্বাগতম!', body: 'পরীক্ষা কেন্দ্রে আপনাকে স্বাগতম। নতুন পরীক্ষার ঘোষণা এখানেই দেওয়া হবে।', pinned: true, createdAt: new Date(t).toISOString() }], sponsors: [] };
    return S.batch([{ type: 'set', path: 'exams/' + id, data: ex }, { type: 'set', path: 'qbank/' + id, data: bankOf(qs) }, { type: 'set', path: 'keys/' + id, data: keysOf(qs) }, { type: 'set', path: 'site/main', data: site }]);
  }

  /* ---------- প্রশ্নভাণ্ডার ---------- */
  function bankOf(qs) { return { questions: qs.map(function (q) { return { id: q.id, text: q.text, options: q.options }; }) }; }
  function keysOf(qs) {
    var a = {}, e = {};
    qs.forEach(function (q) { a[q.id] = q.correct; if (q.explanation) e[q.id] = q.explanation; });
    return { answers: a, expl: e };
  }
  function loadQuestions(examId) {
    return Promise.all([S.get('qbank/' + examId), S.get('keys/' + examId)]).then(function (r) {
      var bank = r[0] || { questions: [] }, keys = r[1] || { answers: {}, expl: {} };
      return bank.questions.map(function (q) { return { id: q.id, examId: examId, text: q.text, options: q.options, correct: keys.answers[q.id], explanation: (keys.expl || {})[q.id] || '' }; });
    });
  }
  function saveQuestions(examId, qs) {
    return S.batch([
      { type: 'set', path: 'qbank/' + examId, data: bankOf(qs) },
      { type: 'set', path: 'keys/' + examId, data: keysOf(qs) },
      { type: 'update', path: 'exams/' + examId, data: { questionCount: qs.length } },
    ]).then(function () { memo = {}; });
  }

  /* ---------- পরীক্ষা ---------- */
  function examStatus(ex, t) {
    t = t || now();
    if (t < Date.parse(ex.startAt)) return 'upcoming';
    if (t <= Date.parse(ex.endAt)) return 'live';
    return 'ended';
  }
  function publicExam(ex, full) {
    var o = {
      id: ex.id, title: ex.title, category: ex.category, description: ex.description, bookName: ex.bookName, coverUrl: ex.coverUrl, startAt: ex.startAt, endAt: ex.endAt,
      durationMin: ex.durationMin, fee: ex.fee, prizes: ex.prizes || [], marksPerQuestion: ex.marksPerQuestion, negativeMarking: ex.negativeMarking,
      questionCount: ex.questionLimit > 0 ? Math.min(ex.questionLimit, ex.questionCount || 0) : (ex.questionCount || 0), status: examStatus(ex),
      resultsPublished: !!ex.resultsPublished, certificate: !!ex.certificate,
    };
    if (full) Object.assign(o, { syllabus: ex.syllabus, rules: ex.rules, paymentInfo: ex.paymentInfo, showAnswers: ex.showAnswers });
    return o;
  }
  function sanitizeExam(b) {
    var title = clean(b.title, 150);
    if (title.length < 3) throw HttpError(400, 'পরীক্ষার নাম দিন (কমপক্ষে ৩ অক্ষর)।');
    var startAt = isoOrNull(b.startAt), endAt = isoOrNull(b.endAt);
    if (!startAt || !endAt) throw HttpError(400, 'শুরু ও শেষের সময় সঠিকভাবে দিন।');
    if (Date.parse(endAt) <= Date.parse(startAt)) throw HttpError(400, 'শেষের সময় অবশ্যই শুরুর পরে হতে হবে।');
    var prizes = (Array.isArray(b.prizes) ? b.prizes : String(b.prizes || '').split('\n')).map(function (p) { return clean(p, 200); }).filter(Boolean).slice(0, 20);
    return {
      title: title, category: clean(b.category, 60) || 'সাধারণ', description: cleanMulti(b.description, 4000), bookName: clean(b.bookName, 200), syllabus: cleanMulti(b.syllabus, 3000),
      rules: cleanMulti(b.rules, 3000), coverUrl: safeUrl(b.coverUrl), startAt: startAt, endAt: endAt, durationMin: Math.round(num(b.durationMin, 1, 600, 20)), fee: Math.round(num(b.fee, 0, 1000000, 0)),
      paymentInfo: cleanMulti(b.paymentInfo, 1500), prizes: prizes, marksPerQuestion: num(b.marksPerQuestion, 0.25, 100, 1), negativeMarking: num(b.negativeMarking, 0, 100, 0),
      questionLimit: Math.round(num(b.questionLimit, 0, 1000, 0)), shuffleQuestions: bool(b.shuffleQuestions), shuffleOptions: bool(b.shuffleOptions), showAnswers: bool(b.showAnswers),
      certificate: bool(b.certificate), status: b.status === 'published' ? 'published' : 'draft', resultsPublished: bool(b.resultsPublished),
    };
  }
  function getExam(id) { return S.get('exams/' + id).then(function (e) { if (!e) throw HttpError(404, 'পরীক্ষা পাওয়া যায়নি।'); return e; }); }
  function getPubExam(id) { return getExam(id).then(function (e) { if (e.status !== 'published') throw HttpError(404, 'পরীক্ষা পাওয়া যায়নি।'); return e; }); }
  function listPublished() { return cached('pub', 20000, function () { return S.list('exams', [['status', '==', 'published']]); }); }

  /* ---------- প্রশ্ন ইমপোর্ট (টেক্সট থেকে) ---------- */
  function parseQuestionsText(input) {
    var lines = String(input || '').replace(/\r\n?/g, '\n').split('\n');
    var LABELS = { 'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3, 'ঙ': 4, a: 0, b: 1, c: 2, d: 3, e: 4, '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
    var optRe = /^\(?([কখগঘঙ]|[A-Ea-e]|[১-৫1-5])[)\.:।]\s*(.+)$/;
    var ansRe = /^(?:সঠিক\s*উত্তর|উত্তর|answer|ans)\s*[:：\-–]\s*(.+)$/i;
    var expRe = /^(?:ব্যাখ্যা|explanation|exp)\s*[:：\-–]\s*(.*)$/i;
    var numRe = /^\(?[0-9০-৯]+[)\.।:]\s*/;
    var out = [], errors = [], cur = null, mode = 'q', count = 0;
    function fresh() { return { text: '', options: [], correct: null, answerRaw: '', explanation: '', afterAnswer: false }; }
    function finish() {
      if (!cur) return;
      count++;
      var q = cur; cur = null; mode = 'q';
      var label = 'প্রশ্ন ' + count;
      if (!q.text) { errors.push(label + ': প্রশ্নের লেখা নেই'); return; }
      if (q.options.length < 2) { errors.push(label + ': কমপক্ষে ২টি অপশন লাগবে (“' + q.text.slice(0, 30) + '…”)'); return; }
      var correct = q.correct;
      if (correct == null && q.answerRaw) {
        var a = toAscii(q.answerRaw).trim().replace(/[)\.।:]+$/, '').replace(/^\(/, ''), key = a.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(LABELS, key)) correct = LABELS[key];
        else { var i = q.options.findIndex(function (o) { return o.trim() === q.answerRaw.trim(); }); if (i >= 0) correct = i; }
      }
      if (correct == null || correct < 0 || correct >= q.options.length) { errors.push(label + ': সঠিক উত্তর বোঝা যায়নি (“' + q.text.slice(0, 30) + '…”)'); return; }
      out.push({ text: q.text, options: q.options, correct: correct, explanation: q.explanation });
    }
    lines.forEach(function (raw) {
      var line = raw.trim(), m;
      if (!line) { if (cur && (cur.options.length || cur.afterAnswer)) finish(); return; }
      if ((m = line.match(ansRe)) && cur) { cur.answerRaw = m[1]; cur.afterAnswer = true; mode = 'a'; return; }
      if ((m = line.match(expRe)) && cur) { cur.explanation = m[1]; mode = 'e'; return; }
      if (cur && cur.afterAnswer && (mode !== 'e' || numRe.test(line))) finish();
      if (!cur) cur = fresh();
      m = line.match(optRe);
      if (m && cur.text) {
        var t = m[2].trim(), mark = /\s*(\*|✓|✔)\s*$/.test(t);
        if (mark) { t = t.replace(/\s*(\*|✓|✔)\s*$/, ''); cur.correct = cur.options.length; }
        cur.options.push(t); mode = 'o'; return;
      }
      if (mode === 'e') { cur.explanation += (cur.explanation ? ' ' : '') + line; return; }
      if (mode === 'o' && cur.options.length) { cur.options[cur.options.length - 1] += ' ' + line; return; }
      cur.text += (cur.text ? ' ' : '') + (cur.text ? line : line.replace(numRe, ''));
    });
    finish();
    return { questions: out, errors: errors };
  }
  function sanitizeQuestion(b) {
    var text = cleanMulti(b.text, 1200);
    if (!text) throw HttpError(400, 'প্রশ্নের লেখা দিন।');
    var raw = Array.isArray(b.options) ? b.options.slice(0, 5) : [], options = [], correct = -1;
    raw.forEach(function (o, i) { var t = clean(o, 300); if (t) { if (i === Number(b.correct)) correct = options.length; options.push(t); } });
    if (options.length < 2) throw HttpError(400, 'কমপক্ষে ২টি অপশন দিন।');
    if (correct < 0) throw HttpError(400, 'সঠিক উত্তর বেছে নিন।');
    return { text: text, options: options, correct: correct, explanation: cleanMulti(b.explanation, 1500) };
  }

  /* ---------- নম্বর হিসাব (অ্যাডমিনের ব্রাউজারে) ---------- */
  function scoreOf(att, ex, keys) {
    var correct = 0, wrong = 0, un = 0, total = 0;
    (att.qids || []).forEach(function (qid) {
      var k = keys.answers[qid]; if (k == null) return;
      total++; var a = att.answers ? att.answers[qid] : null;
      if (a == null) un++; else if (a === k) correct++; else wrong++;
    });
    return { correct: correct, wrong: wrong, unanswered: un, total: total, score: Math.max(0, round2(correct * ex.marksPerQuestion - wrong * ex.negativeMarking)), totalMarks: round2(total * ex.marksPerQuestion) };
  }
  function attDeadline(att, ex) { return Date.parse(att.startedAt) + ex.durationMin * 60000; }
  function buildRanked(ex) {
    return Promise.all([S.list('attempts', [['examId', '==', ex.id]]), S.list('regs', [['examId', '==', ex.id]]), S.get('keys/' + ex.id)]).then(function (r) {
      var atts = r[0], regs = r[1], keys = r[2] || { answers: {}, expl: {} }, regMap = {};
      regs.forEach(function (x) { regMap[x.id] = x; });
      var list = [], running = [];
      atts.forEach(function (a) {
        var reg = regMap[a.regId || a.id]; if (!reg) return;
        var over = now() > attDeadline(a, ex) + GRACE;
        if (!a.submitted && !over) { running.push({ attemptId: a.id, name: reg.name, roll: reg.roll, startedAt: a.startedAt, deadline: new Date(attDeadline(a, ex)).toISOString() }); return; }
        var sc = scoreOf(a, ex, keys);
        var endMs = a.submitted && a.submittedAt ? Math.min(Date.parse(a.submittedAt), attDeadline(a, ex)) : attDeadline(a, ex);
        list.push({ a: a, r: reg, sc: sc, timeTaken: Math.max(0, Math.round((endMs - Date.parse(a.startedAt)) / 1000)), at: endMs });
      });
      list.sort(function (x, y) { return y.sc.score - x.sc.score || x.timeTaken - y.timeTaken || x.at - y.at; });
      var rank = 0, prev = null;
      list.forEach(function (it, i) { var k = it.sc.score + '|' + it.timeTaken; if (k !== prev) { rank = i + 1; prev = k; } it.rank = rank; });
      return { list: list, running: running, keys: keys, regs: regs, atts: atts };
    });
  }
  function writeResults(ex, published) {
    return buildRanked(ex).then(function (b) {
      var rows = b.list.slice(0, 5000).map(function (it) {
        return { rank: it.rank, roll: it.r.roll, name: it.r.name, district: it.r.district || '', institution: it.r.institution || '', score: it.sc.score, totalMarks: it.sc.totalMarks, correct: it.sc.correct, wrong: it.sc.wrong, unanswered: it.sc.unanswered, timeTaken: it.timeTaken };
      });
      return S.set('results/' + ex.id, { published: !!published, rows: rows, total: rows.length, key: published ? b.keys.answers : {}, expl: published ? (b.keys.expl || {}) : {}, computedAt: new Date().toISOString() });
    });
  }

  /* ---------- রাউটার ---------- */
  var routes = [];
  function route(method, pattern, opts, handler) {
    if (typeof opts === 'function') { handler = opts; opts = {}; }
    var keys = [];
    var src = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:([a-z]+)/gi, function (_, k) { keys.push(k); return '([^/]+)'; });
    routes.push({ method: method, re: new RegExp('^' + src + '$'), keys: keys, opts: opts, handler: handler });
  }
  var A = { admin: true };

  var authFails = [];
  function throttle() { var t = Date.now(); authFails = authFails.filter(function (x) { return t - x < 600000; }); if (authFails.length >= 12) throw HttpError(429, 'অনেকবার ভুল তথ্য দেওয়া হয়েছে। ১০ মিনিট পরে আবার চেষ্টা করুন।'); }
  function regIdOf(exId, rollIn, passIn) {
    var roll = parseInt(toAscii(rollIn), 10), pass = toAscii(passIn).replace(/\D/g, '');
    return { roll: roll, id: exId + '_' + roll + '_' + pass };
  }
  function authReg(ex, rollIn, passIn) {
    throttle();
    var k = regIdOf(ex.id, rollIn, passIn);
    if (!isFinite(k.roll)) { authFails.push(Date.now()); return Promise.reject(HttpError(401, 'রোল নম্বর বা পাসকোড সঠিক নয়।')); }
    return S.get('regs/' + k.id).then(function (reg) {
      if (!reg) { authFails.push(Date.now()); throw HttpError(401, 'রোল নম্বর বা পাসকোড সঠিক নয়।'); }
      return reg;
    });
  }
  function syncClock() {
    if (offsetKnown) return Promise.resolve();
    return S.ping().then(function (ms) { offset = ms - Date.now(); offsetKnown = true; }, function () { offsetKnown = true; });
  }

  /* ---------- পাবলিক ---------- */
  route('GET', '/api/public/config', function () {
    return Promise.all([getSite(), listPublished()]).then(function (r) {
      var site = r[0], exams = r[1], pub = ['siteName', 'tagline', 'heroTitle', 'heroText', 'about', 'contactEmail', 'contactPhone', 'whatsapp', 'facebook', 'youtube', 'telegram', 'footerText', 'announcement', 'accent', 'logoUrl', 'certSigner', 'certSignerTitle', 'terms'], settings = {};
      pub.forEach(function (k) { settings[k] = site.settings[k]; });
      var notices = site.notices.slice().sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt); }).slice(0, 20);
      var st = { exams: exams.length, live: 0, upcoming: 0, ended: 0 };
      exams.forEach(function (e) { st[examStatus(e)]++; });
      var cats = []; exams.forEach(function (e) { if (cats.indexOf(e.category) < 0) cats.push(e.category); });
      return { settings: settings, notices: notices, sponsors: site.sponsors, categories: cats, stats: st, serverNow: now(), demo: !!S.demo };
    });
  });
  route('GET', '/api/public/exams', function () {
    return listPublished().then(function (list) {
      var order = { live: 0, upcoming: 1, ended: 2 };
      var out = list.map(function (e) { return publicExam(e); });
      out.sort(function (a, b) { return order[a.status] - order[b.status] || (a.status === 'ended' ? Date.parse(b.endAt) - Date.parse(a.endAt) : Date.parse(a.startAt) - Date.parse(b.startAt)); });
      return { exams: out, serverNow: now() };
    });
  });
  route('GET', '/api/public/exams/:id', function (c) { return getPubExam(c.params.id).then(function (e) { return { exam: publicExam(e, true), serverNow: now() }; }); });

  function createReg(ex, b, admin) {
    var name = clean(b.name, 80);
    if (name.length < 3) throw HttpError(400, 'পূর্ণ নাম লিখুন।');
    var phone = normPhone(b.phone);
    if (!phone) throw HttpError(400, 'সঠিক মোবাইল নম্বর দিন (যেমন 01XXXXXXXXX)।');
    var email = clean(b.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw HttpError(400, 'ইমেইল ঠিকানা সঠিক নয়।');
    var trxId = '', sender = '';
    if (ex.fee > 0 && !admin) {
      trxId = clean(b.trxId, 40); sender = normPhone(b.senderNumber);
      if (trxId.length < 6) throw HttpError(400, 'পেমেন্টের ট্রানজেকশন আইডি (TrxID) দিন।');
    }
    var status = admin ? 'approved' : (ex.fee > 0 ? 'pending' : 'approved');
    function attempt(n) {
      var roll = randInt(10000, 99999), pass = String(randInt(100000, 999999)), id = ex.id + '_' + roll + '_' + pass;
      var reg = { id: id, examId: ex.id, roll: roll, passcode: pass, name: name, phone: phone, email: email, district: clean(b.district, 60), institution: clean(b.institution, 120), trxId: trxId, senderNumber: sender, status: status, note: admin ? 'অ্যাডমিন যোগ করেছেন' : '', createdAt: S.SERVER_TS, rollKey: ex.id + '_' + roll, phoneKey: ex.id + '_' + phone };
      return S.batch([
        { type: 'create', path: 'rolls/' + reg.rollKey, data: { examId: ex.id, regId: id } },
        { type: 'create', path: 'phones/' + reg.phoneKey, data: { examId: ex.id, regId: id } },
        { type: 'create', path: 'regs/' + id, data: reg },
      ]).then(function () { memo = {}; return reg; }, function (e) {
        if (n < 3 && e && e.code === 'permission-denied') return attempt(n + 1);
        if (e && e.code === 'permission-denied') throw HttpError(409, 'নিবন্ধন করা যায়নি। এই মোবাইল নম্বর দিয়ে আগে নিবন্ধন করা থাকতে পারে। রোল বা পাসকোড হারিয়ে গেলে আয়োজকের সাথে যোগাযোগ করুন।');
        throw e;
      });
    }
    return attempt(0);
  }
  route('POST', '/api/public/exams/:id/register', function (c) {
    return getPubExam(c.params.id).then(function (ex) {
      if (now() > Date.parse(ex.endAt)) throw HttpError(400, 'এই পরীক্ষার নিবন্ধনের সময় শেষ হয়ে গেছে।');
      return createReg(ex, c.body, false).then(function (reg) { return { roll: reg.roll, passcode: reg.passcode, status: reg.status, name: reg.name }; });
    });
  });

  route('POST', '/api/public/exams/:id/start', function (c) {
    return getPubExam(c.params.id).then(function (ex) {
      return authReg(ex, c.body.roll, c.body.passcode).then(function (reg) {
        if (reg.status === 'pending') throw HttpError(403, 'আপনার পেমেন্ট যাচাই চলছে। অনুমোদন হলে পরীক্ষা দিতে পারবেন।');
        if (reg.status === 'rejected') throw HttpError(403, 'আপনার নিবন্ধন বাতিল করা হয়েছে। আয়োজকের সাথে যোগাযোগ করুন।');
        return syncClock().then(function () { return Promise.all([S.get('attempts/' + reg.id), S.get('qbank/' + ex.id).catch(function () { return null; })]); }).then(function (r) {
          var att = r[0], bank = r[1];
          if (att) {
            if (att.submitted || now() > attDeadline(att, ex) + GRACE) return { submitted: true };
          } else {
            if (now() < Date.parse(ex.startAt)) throw HttpError(400, 'পরীক্ষা এখনও শুরু হয়নি।');
            if (now() > Date.parse(ex.endAt)) throw HttpError(400, 'পরীক্ষা শুরু করার সময় শেষ হয়ে গেছে।');
          }
          if (!bank || !bank.questions || !bank.questions.length) throw HttpError(400, 'এই পরীক্ষায় এখনও প্রশ্ন যোগ করা হয়নি।');
          var make;
          if (att) make = Promise.resolve(att);
          else {
            var pick = bank.questions.slice();
            if (ex.questionLimit > 0 && ex.questionLimit < pick.length) { var orig = pick.slice(); pick = shuffle(pick).slice(0, ex.questionLimit); if (!ex.shuffleQuestions) pick.sort(function (a, b) { return orig.indexOf(a) - orig.indexOf(b); }); }
            if (ex.shuffleQuestions) pick = shuffle(pick);
            var optOrder = {};
            pick.forEach(function (q) { var idx = q.options.map(function (_, i) { return i; }); optOrder[q.id] = ex.shuffleOptions ? shuffle(idx) : idx; });
            var doc = { id: reg.id, examId: ex.id, regId: reg.id, roll: reg.roll, name: reg.name, qids: pick.map(function (q) { return q.id; }), optOrder: optOrder, answers: {}, submitted: false, tabSwitches: 0, startedAt: S.SERVER_TS };
            make = S.set('attempts/' + reg.id, doc).then(function () { return S.get('attempts/' + reg.id); });
          }
          return make.then(function (a) {
            var map = {}; bank.questions.forEach(function (q) { map[q.id] = q; });
            var questions = a.qids.filter(function (id) { return map[id]; }).map(function (id) { var q = map[id]; return { id: id, text: q.text, opts: a.optOrder[id].map(function (k) { return { k: k, t: q.options[k] }; }) }; });
            return { attemptId: reg.id, token: reg.id, exam: { id: ex.id, title: ex.title, durationMin: ex.durationMin }, questions: questions, answers: a.answers || {}, deadline: new Date(attDeadline(a, ex)).toISOString(), serverNow: now(), name: reg.name, roll: reg.roll };
          });
        });
      });
    });
  });

  function writeAttempt(id, data) {
    return S.update('attempts/' + id, data).then(function () { return { ok: true }; }, function (e) {
      if (e && (e.code === 'permission-denied' || e.code === 'not-found')) return { submitted: true };
      throw e;
    });
  }
  route('POST', '/api/public/attempts/:id/save', function (c) {
    return writeAttempt(c.params.id, { answers: c.body.answers || {}, tabSwitches: Math.min(999, parseInt(c.body.tabSwitches, 10) || 0) });
  });
  route('POST', '/api/public/attempts/:id/submit', function (c) {
    return writeAttempt(c.params.id, { answers: c.body.answers || {}, tabSwitches: Math.min(999, parseInt(c.body.tabSwitches, 10) || 0), submitted: true, submittedAt: S.SERVER_TS }).then(function () { return { submitted: true }; });
  });

  route('POST', '/api/public/exams/:id/result', function (c) {
    return getPubExam(c.params.id).then(function (ex) {
      return authReg(ex, c.body.roll, c.body.passcode).then(function (reg) {
        var base = { name: reg.name, roll: reg.roll, exam: publicExam(ex, true) };
        return S.get('attempts/' + reg.id).then(function (att) {
          if (!att) return Object.assign(base, { state: 'none' });
          if (!att.submitted && now() <= attDeadline(att, ex) + GRACE) return Object.assign(base, { state: 'in_progress' });
          if (!ex.resultsPublished) return Object.assign(base, { state: 'submitted_hidden' });
          return Promise.all([S.get('results/' + ex.id), S.get('qbank/' + ex.id)]).then(function (r) {
            var res = r[0], bank = r[1];
            var row = res && res.published ? (res.rows || []).filter(function (x) { return x.roll === reg.roll; })[0] : null;
            if (!row) return Object.assign(base, { state: 'submitted_hidden' });
            var o = Object.assign(base, { state: 'ready', score: row.score, totalMarks: row.totalMarks, correct: row.correct, wrong: row.wrong, unanswered: row.unanswered, total: row.correct + row.wrong + row.unanswered, timeTaken: row.timeTaken, submittedAt: att.submittedAt || null, district: reg.district, institution: reg.institution, rank: row.rank, participants: res.total });
            if (ex.showAnswers && examStatus(ex) === 'ended' && bank) {
              var map = {}; bank.questions.forEach(function (q) { map[q.id] = q; });
              o.review = att.qids.filter(function (id) { return map[id] && res.key[id] != null; }).map(function (id) {
                var q = map[id];
                return { text: q.text, opts: att.optOrder[id].map(function (k) { return { k: k, t: q.options[k] }; }), correct: res.key[id], chosen: att.answers && att.answers[id] != null ? att.answers[id] : null, explanation: (res.expl || {})[id] || '' };
              });
            }
            return o;
          });
        });
      });
    });
  });

  route('GET', '/api/public/exams/:id/leaderboard', function (c) {
    return getPubExam(c.params.id).then(function (ex) {
      if (!ex.resultsPublished) return { published: false, exam: publicExam(ex) };
      return S.get('results/' + ex.id).then(function (res) {
        if (!res || !res.published) return { published: false, exam: publicExam(ex) };
        return { published: true, exam: publicExam(ex), total: res.total, rows: (res.rows || []).slice(0, 200) };
      });
    });
  });

  /* ---------- অ্যাডমিন ---------- */
  route('POST', '/api/admin/login', function (c) {
    return S.auth.login(c.body.password || '').then(function () { return { ok: true }; }, function () { throw HttpError(401, S.demo ? 'পাসওয়ার্ড সঠিক নয়।' : 'পাসওয়ার্ড সঠিক নয়, অথবা config.js-এ adminEmail ঠিক নেই।'); });
  });
  route('POST', '/api/admin/logout', function () { return S.auth.logout().then(function () { return { ok: true }; }); });
  route('GET', '/api/admin/me', A, function () { return { ok: true, passwordFile: false, demo: !!S.demo }; });

  function allRegs() { return cached('allRegs', 30000, function () { return S.list('regs'); }); }
  function allAttempts() { return cached('allAtts', 30000, function () { return S.list('attempts'); }); }
  function allExams() { return cached('allExams', 30000, function () { return S.list('exams'); }); }

  route('GET', '/api/admin/dashboard', A, function () {
    return Promise.all([allExams(), allRegs(), allAttempts()]).then(function (r) {
      var exams = r[0], regs = r[1], atts = r[2], byEx = {}, name = {};
      exams.forEach(function (e) { name[e.id] = e.title; });
      function submittedOrOver(a) { var ex = exams.filter(function (e) { return e.id === a.examId; })[0]; return a.submitted || (ex && now() > attDeadline(a, ex) + GRACE); }
      var rows = exams.map(function (e) {
        var rg = regs.filter(function (x) { return x.examId === e.id; }), at = atts.filter(function (x) { return x.examId === e.id; });
        var sub = at.filter(submittedOrOver).length;
        return { id: e.id, title: e.title, category: e.category, status: e.status, phase: examStatus(e), startAt: e.startAt, endAt: e.endAt, registered: rg.length, pending: rg.filter(function (x) { return x.status === 'pending'; }).length, submitted: sub, inProgress: at.length - sub, questions: e.questionCount || 0, resultsPublished: !!e.resultsPublished };
      });
      var recent = regs.slice().sort(function (a, b) { return Date.parse(b.createdAt) - Date.parse(a.createdAt); }).slice(0, 8).map(function (x) { return { name: x.name, roll: x.roll, status: x.status, exam: name[x.examId] || '', createdAt: x.createdAt }; });
      var sub = rows.reduce(function (s, x) { return s + x.submitted; }, 0), inp = rows.reduce(function (s, x) { return s + x.inProgress; }, 0);
      return { totals: { exams: exams.length, published: exams.filter(function (e) { return e.status === 'published'; }).length, live: exams.filter(function (e) { return e.status === 'published' && examStatus(e) === 'live'; }).length, registrations: regs.length, pending: regs.filter(function (x) { return x.status === 'pending'; }).length, submitted: sub, inProgress: inp }, exams: rows, recent: recent };
    });
  });

  route('GET', '/api/admin/exams', A, function () {
    return Promise.all([allExams(), allRegs()]).then(function (r) {
      var out = r[0].map(function (e) { return Object.assign({}, e, { phase: examStatus(e), questionsCount: e.questionCount || 0, registered: r[1].filter(function (x) { return x.examId === e.id; }).length }); });
      out.sort(function (a, b) { return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0); });
      return { exams: out };
    });
  });
  route('GET', '/api/admin/exams/:id', A, function (c) { return getExam(c.params.id).then(function (e) { return { exam: e }; }); });
  route('POST', '/api/admin/exams', A, function (c) {
    var ex = Object.assign({ id: rid(), createdAt: new Date().toISOString(), questionCount: 0 }, sanitizeExam(c.body));
    return S.set('exams/' + ex.id, ex).then(function () { return ex.resultsPublished ? writeResults(ex, true) : null; }).then(function () { return { exam: ex }; });
  });
  route('PUT', '/api/admin/exams/:id', A, function (c) {
    return getExam(c.params.id).then(function (old) {
      var ex = Object.assign({}, old, sanitizeExam(c.body), { id: old.id, createdAt: old.createdAt, questionCount: old.questionCount || 0 });
      return S.set('exams/' + ex.id, ex).then(function () {
        if (ex.resultsPublished) return writeResults(ex, true);
        if (old.resultsPublished) return S.get('results/' + ex.id).then(function (r) { return r ? S.update('results/' + ex.id, { published: false, key: {}, expl: {} }) : null; });
      }).then(function () { return { exam: ex }; });
    });
  });
  route('DELETE', '/api/admin/exams/:id', A, function (c) {
    var id = c.params.id;
    return Promise.all([S.list('regs', [['examId', '==', id]]), S.list('attempts', [['examId', '==', id]])]).then(function (r) {
      var ops = [{ type: 'delete', path: 'exams/' + id }, { type: 'delete', path: 'qbank/' + id }, { type: 'delete', path: 'keys/' + id }, { type: 'delete', path: 'results/' + id }];
      r[0].forEach(function (x) { ops.push({ type: 'delete', path: 'regs/' + x.id }, { type: 'delete', path: 'rolls/' + x.rollKey }, { type: 'delete', path: 'phones/' + x.phoneKey }); });
      r[1].forEach(function (x) { ops.push({ type: 'delete', path: 'attempts/' + x.id }); });
      return runBatches(ops);
    }).then(function () { return { ok: true }; });
  });
  route('POST', '/api/admin/exams/:id/duplicate', A, function (c) {
    return Promise.all([getExam(c.params.id), loadQuestions(c.params.id)]).then(function (r) {
      var copy = Object.assign({}, r[0], { id: rid(), title: r[0].title + ' (কপি)', status: 'draft', resultsPublished: false, createdAt: new Date().toISOString() });
      var qs = r[1].map(function (q) { return Object.assign({}, q, { id: rid() }); });
      return S.set('exams/' + copy.id, copy).then(function () { return qs.length ? saveQuestions(copy.id, qs) : null; }).then(function () { return { exam: copy }; });
    });
  });

  /* প্রশ্ন */
  route('GET', '/api/admin/exams/:id/questions', A, function (c) { return loadQuestions(c.params.id).then(function (q) { return { questions: q }; }); });
  route('POST', '/api/admin/exams/:id/questions', A, function (c) {
    var q = Object.assign({ id: rid() }, sanitizeQuestion(c.body));
    return loadQuestions(c.params.id).then(function (qs) { qs.push(q); return saveQuestions(c.params.id, qs); }).then(function () { return { question: q }; });
  });
  route('PUT', '/api/admin/exams/:id/questions/:qid', A, function (c) {
    var data = sanitizeQuestion(c.body);
    return loadQuestions(c.params.id).then(function (qs) {
      var q = qs.filter(function (x) { return x.id === c.params.qid; })[0];
      if (!q) throw HttpError(404, 'প্রশ্ন পাওয়া যায়নি।');
      Object.assign(q, data); return saveQuestions(c.params.id, qs);
    }).then(function () { return { ok: true }; });
  });
  route('DELETE', '/api/admin/exams/:id/questions/:qid', A, function (c) {
    return loadQuestions(c.params.id).then(function (qs) { return saveQuestions(c.params.id, qs.filter(function (x) { return x.id !== c.params.qid; })); }).then(function () { return { ok: true }; });
  });
  route('DELETE', '/api/admin/exams/:id/questions', A, function (c) { return saveQuestions(c.params.id, []).then(function () { return { ok: true }; }); });
  route('POST', '/api/admin/exams/:id/questions/bulk', A, function (c) {
    var p = parseQuestionsText(c.body.text);
    if (c.body.dryRun) return { count: p.questions.length, errors: p.errors, preview: p.questions.slice(0, 3) };
    if (!p.questions.length) throw HttpError(400, 'কোনো প্রশ্ন পাওয়া যায়নি। ফরম্যাট দেখে আবার চেষ্টা করুন।', { errors: p.errors });
    var add = p.questions.map(function (q) { return Object.assign({ id: rid() }, q); });
    return (c.body.replace ? Promise.resolve([]) : loadQuestions(c.params.id)).then(function (qs) {
      if (qs.length + add.length > 400) throw HttpError(400, 'একটি পরীক্ষায় সর্বোচ্চ ৪০০টি প্রশ্ন রাখা যাবে।');
      return saveQuestions(c.params.id, qs.concat(add));
    }).then(function () { return { count: add.length, errors: p.errors }; });
  });

  /* নিবন্ধন */
  route('GET', '/api/admin/exams/:id/registrations', A, function (c) {
    return Promise.all([getExam(c.params.id), S.list('regs', [['examId', '==', c.params.id]]), S.list('attempts', [['examId', '==', c.params.id]]), S.get('keys/' + c.params.id)]).then(function (r) {
      var ex = r[0], keys = r[3] || { answers: {}, expl: {} }, am = {};
      r[2].forEach(function (a) { am[a.regId || a.id] = a; });
      var rows = r[1].map(function (x) {
        var a = am[x.id], att = null;
        if (a) { var done = a.submitted || now() > attDeadline(a, ex) + GRACE, sc = scoreOf(a, ex, keys); att = { id: a.id, state: done ? 'submitted' : 'in_progress', score: sc.score, totalMarks: sc.totalMarks }; }
        return Object.assign({}, x, { attempt: att });
      });
      rows.sort(function (a, b) { return Date.parse(b.createdAt) - Date.parse(a.createdAt); });
      return { registrations: rows };
    });
  });
  route('POST', '/api/admin/exams/:id/registrations', A, function (c) {
    return getExam(c.params.id).then(function (ex) { return createReg(ex, c.body, true); }).then(function (reg) { return { registration: reg }; });
  });
  route('PUT', '/api/admin/registrations/:id', A, function (c) {
    return S.get('regs/' + c.params.id).then(function (r) {
      if (!r) throw HttpError(404, 'নিবন্ধন পাওয়া যায়নি।');
      var b = c.body, d = {};
      if (b.status && ['pending', 'approved', 'rejected'].indexOf(b.status) >= 0) d.status = b.status;
      if (b.note != null) d.note = clean(b.note, 300);
      if (b.resetPasscode) {
        // পাসকোড আইডির অংশ, তাই নতুন আইডিতে সরিয়ে নিতে হয়
        var pass = String(randInt(100000, 999999)), nid = r.examId + '_' + r.roll + '_' + pass;
        var nr = Object.assign({}, r, d, { id: nid, passcode: pass });
        return S.get('attempts/' + r.id).then(function (att) {
          var ops = [{ type: 'set', path: 'regs/' + nid, data: nr }, { type: 'delete', path: 'regs/' + r.id }];
          if (att) ops.push({ type: 'set', path: 'attempts/' + nid, data: Object.assign({}, att, { id: nid, regId: nid }) }, { type: 'delete', path: 'attempts/' + r.id });
          ops.push({ type: 'set', path: 'rolls/' + r.rollKey, data: { examId: r.examId, regId: nid } }, { type: 'set', path: 'phones/' + r.phoneKey, data: { examId: r.examId, regId: nid } });
          return S.batch(ops).then(function () { return { registration: nr }; });
        });
      }
      return S.update('regs/' + r.id, d).then(function () { return { registration: Object.assign(r, d) }; });
    });
  });
  route('DELETE', '/api/admin/registrations/:id', A, function (c) {
    return S.get('regs/' + c.params.id).then(function (r) {
      if (!r) return { ok: true };
      var ops = [{ type: 'delete', path: 'regs/' + r.id }, { type: 'delete', path: 'attempts/' + r.id }];
      if (r.rollKey) ops.push({ type: 'delete', path: 'rolls/' + r.rollKey });
      if (r.phoneKey) ops.push({ type: 'delete', path: 'phones/' + r.phoneKey });
      return S.batch(ops).then(function () { return { ok: true }; });
    });
  });
  route('POST', '/api/admin/exams/:id/registrations/approve-all', A, function (c) {
    return S.list('regs', [['examId', '==', c.params.id]]).then(function (rs) {
      var p = rs.filter(function (x) { return x.status === 'pending'; });
      return runBatches(p.map(function (x) { return { type: 'update', path: 'regs/' + x.id, data: { status: 'approved' } }; })).then(function () { return { count: p.length }; });
    });
  });

  /* ফলাফল */
  route('GET', '/api/admin/exams/:id/results', A, function (c) {
    return getExam(c.params.id).then(function (ex) {
      return buildRanked(ex).then(function (b) {
        var scores = b.list.map(function (it) { return it.sc.score; });
        return {
          exam: ex,
          stats: { submitted: b.list.length, inProgress: b.running.length, avg: scores.length ? round2(scores.reduce(function (s, v) { return s + v; }, 0) / scores.length) : 0, max: scores.length ? Math.max.apply(null, scores) : 0, min: scores.length ? Math.min.apply(null, scores) : 0 },
          rows: b.list.map(function (it) { return { attemptId: it.a.id, rank: it.rank, name: it.r.name, roll: it.r.roll, phone: it.r.phone, district: it.r.district, institution: it.r.institution, score: it.sc.score, totalMarks: it.sc.totalMarks, correct: it.sc.correct, wrong: it.sc.wrong, unanswered: it.sc.unanswered, timeTaken: it.timeTaken, tabSwitches: it.a.tabSwitches || 0, submittedAt: it.a.submittedAt || null }; }),
          running: b.running,
        };
      });
    });
  });
  route('POST', '/api/admin/exams/:id/rescore', A, function (c) {
    return getExam(c.params.id).then(function (ex) { return writeResults(ex, ex.resultsPublished).then(function () { return S.get('results/' + ex.id); }); }).then(function (r) { return { count: r ? r.total : 0 }; });
  });
  route('DELETE', '/api/admin/attempts/:id', A, function (c) { return S.del('attempts/' + c.params.id).then(function () { return { ok: true }; }); });
  route('POST', '/api/admin/attempts/:id/finalize', A, function (c) { return S.update('attempts/' + c.params.id, { submitted: true, submittedAt: S.SERVER_TS }).then(function () { return { ok: true }; }); });

  /* নোটিশ ও স্পনসর */
  function listOps(key, make, label) {
    route('GET', '/api/admin/' + key, A, function () { return getSite().then(function (s) { var o = {}; o[key] = key === 'notices' ? s.notices.slice().sort(function (a, b) { return Date.parse(b.createdAt) - Date.parse(a.createdAt); }) : s.sponsors; return o; }); });
    route('POST', '/api/admin/' + key, A, function (c) {
      var item = Object.assign({ id: rid() }, make(c.body));
      return getSite().then(function (s) { s[key].push(item); return saveSite(s); }).then(function () { var o = {}; o[label] = item; return o; });
    });
    route('PUT', '/api/admin/' + key + '/:id', A, function (c) {
      return getSite().then(function (s) {
        var it = s[key].filter(function (x) { return x.id === c.params.id; })[0];
        if (!it) throw HttpError(404, 'পাওয়া যায়নি।');
        Object.assign(it, make(c.body, it)); return saveSite(s).then(function () { var o = {}; o[label] = it; return o; });
      });
    });
    route('DELETE', '/api/admin/' + key + '/:id', A, function (c) { return getSite().then(function (s) { s[key] = s[key].filter(function (x) { return x.id !== c.params.id; }); return saveSite(s); }).then(function () { return { ok: true }; }); });
  }
  listOps('notices', function (b, old) {
    var title = clean(b.title, 150); if (!title) throw HttpError(400, 'নোটিশের শিরোনাম দিন।');
    return { title: title, body: cleanMulti(b.body, 3000), pinned: bool(b.pinned), createdAt: old ? old.createdAt : new Date().toISOString() };
  }, 'notice');
  listOps('sponsors', function (b) {
    var name = clean(b.name, 100); if (!name) throw HttpError(400, 'স্পনসরের নাম দিন।');
    return { name: name, tier: clean(b.tier, 60), logoUrl: safeUrl(b.logoUrl), url: safeUrl(b.url) };
  }, 'sponsor');

  /* সেটিংস ও ব্যাকআপ */
  route('GET', '/api/admin/settings', A, function () { return getSite().then(function (s) { return { settings: s.settings }; }); });
  route('PUT', '/api/admin/settings', A, function (c) {
    return getSite().then(function (site) {
      var s = site.settings, d = defaultSettings(), b = c.body;
      ['siteName', 'tagline', 'heroTitle', 'contactEmail', 'contactPhone', 'whatsapp', 'footerText', 'announcement', 'certSigner', 'certSignerTitle'].forEach(function (k) { if (b[k] != null) s[k] = clean(b[k], 200); });
      ['heroText', 'about', 'terms'].forEach(function (k) { if (b[k] != null) s[k] = cleanMulti(b[k], 4000); });
      ['facebook', 'youtube', 'telegram', 'logoUrl'].forEach(function (k) { if (b[k] != null) s[k] = safeUrl(b[k]); });
      if (!s.siteName) s.siteName = d.siteName;
      if (b.accent != null) s.accent = /^#[0-9a-fA-F]{6}$/.test(b.accent) ? b.accent : d.accent;
      return saveSite(site).then(function () { return { settings: s }; });
    });
  });
  var BACKUP_COLLS = ['exams', 'qbank', 'keys', 'regs', 'attempts', 'rolls', 'phones', 'results'];
  route('GET', '/api/admin/backup', A, function () {
    return Promise.all([S.get('site/main')].concat(BACKUP_COLLS.map(function (n) { return S.list(n); }))).then(function (r) {
      var docs = {}; if (r[0]) docs['site/main'] = r[0];
      BACKUP_COLLS.forEach(function (n, i) { r[i + 1].forEach(function (d) { docs[n + '/' + d.id] = d; }); });
      return { data: { app: 'exam-hub', version: 2, docs: docs } };
    });
  });
  route('POST', '/api/admin/restore', A, function (c) {
    var d = c.body.data;
    if (!d || d.app !== 'exam-hub' || !d.docs || typeof d.docs !== 'object') throw HttpError(400, 'ব্যাকআপ ফাইলটি সঠিক নয়।');
    var ops = Object.keys(d.docs).map(function (p) { return { type: 'set', path: p, data: d.docs[p] }; });
    return runBatches(ops).then(function () { memo = {}; return { ok: true, count: ops.length }; });
  });

  /* ---------- api() প্রতিস্থাপন ---------- */
  window.api = function (path, opt) {
    opt = opt || {};
    var method = opt.method || 'GET', p = path.split('?')[0], hit = null, params = {}, pathMatched = false;
    for (var i = 0; i < routes.length && !hit; i++) {
      var r = routes[i], m = p.match(r.re);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      hit = r; r.keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
    }
    if (!hit) return Promise.reject(HttpError(pathMatched ? 405 : 404, 'পাওয়া যায়নি।'));
    var run = function () {
      if (hit.opts.admin && !S.auth.isAdmin()) throw HttpError(401, 'লগইন করুন।');
      return hit.handler({ params: params, body: opt.body || {} });
    };
    var pr = (hit.opts.admin || p === '/api/admin/login' ? S.auth.ready : Promise.resolve()).then(run);
    return pr.then(function (out) { if (method !== 'GET' && p.indexOf('/api/admin') === 0 && p !== '/api/admin/login') memo = {}; return out == null ? { ok: true } : JSON.parse(JSON.stringify(out)); }, function (e) {
      if (!e.status) {
        if (e.code === 'permission-denied') e = HttpError(403, 'অনুমতি নেই। অ্যাডমিন হিসেবে লগইন আছে কি না এবং Firestore নিয়ম (rules) বসানো আছে কি না দেখুন।');
        else if (e.code === 'unavailable' || /network|offline/i.test(e.message || '')) e = HttpError(0, 'ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।');
        else { console.error(e); e = HttpError(500, 'কিছু একটা সমস্যা হয়েছে: ' + (e.message || e.code || '')); }
      }
      throw e;
    });
  };

  /* ডেমো মোডে প্রথমবার নমুনা পরীক্ষা বসানো */
  window.backendReady = S.demo ? S.get('site/main').then(function (d) { return d ? null : seedDemo(); }) : Promise.resolve();
})();
