/* ডেটা স্টোর: Firebase Firestore অথবা (কনফিগ না থাকলে) ব্রাউজারের ডেমো স্টোর
   দুটোর ইন্টারফেস একই, তাই বাকি কোড কোনটা চলছে তা জানে না। */
(function () {
  'use strict';
  var CFG = window.SITE_CONFIG || {};
  var FB = CFG.firebase || {};
  var TS_FIELDS = ['startAt', 'endAt', 'startedAt', 'submittedAt', 'createdAt', 'computedAt', 't'];
  function Marker() {}
  var SERVER_TS = new Marker();

  function scrub(v) {
    if (v === SERVER_TS) return v;
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { if (v[k] !== undefined) o[k] = scrub(v[k]); }); return o; }
    return v;
  }
  function mkErr(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function parts(path) { var i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; }

  /* ---------------- ডেমো স্টোর (localStorage) ---------------- */
  function memoryStore() {
    var KEY = 'ilm_demo_db';
    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* ঠিক আছে */ } }
    function resolve(data) {
      var o = {}; Object.keys(data).forEach(function (k) { o[k] = data[k] === SERVER_TS ? new Date().toISOString() : data[k]; });
      return JSON.parse(JSON.stringify(o));
    }
    function match(doc, wheres) { return (wheres || []).every(function (w) { return doc[w[0]] === w[2]; }); }
    var s = {
      demo: true,
      SERVER_TS: SERVER_TS,
      get: function (path) { var d = load(); return Promise.resolve(d[path] ? JSON.parse(JSON.stringify(d[path])) : null); },
      set: function (path, data) { var d = load(); d[path] = resolve(scrub(data)); save(d); return Promise.resolve(); },
      update: function (path, data) { var d = load(); if (!d[path]) return Promise.reject(mkErr('not-found')); Object.assign(d[path], resolve(scrub(data))); save(d); return Promise.resolve(); },
      del: function (path) { var d = load(); delete d[path]; save(d); return Promise.resolve(); },
      list: function (coll, wheres) {
        var d = load(), out = [];
        Object.keys(d).forEach(function (p) { var pp = parts(p); if (pp[0] === coll && match(d[p], wheres)) { var x = JSON.parse(JSON.stringify(d[p])); if (x.id == null) x.id = pp[1]; out.push(x); } });
        return Promise.resolve(out);
      },
      batch: function (ops) {
        var d = load();
        for (var i = 0; i < ops.length; i++) if (ops[i].type === 'create' && d[ops[i].path]) return Promise.reject(mkErr('permission-denied', 'আগে থেকেই আছে'));
        ops.forEach(function (o) {
          if (o.type === 'delete') delete d[o.path];
          else if (o.type === 'update') { if (d[o.path]) Object.assign(d[o.path], resolve(scrub(o.data))); }
          else d[o.path] = resolve(scrub(o.data));
        });
        save(d); return Promise.resolve();
      },
      ping: function () { return Promise.resolve(Date.now()); },
      auth: {
        ready: Promise.resolve(),
        isAdmin: function () { try { return sessionStorage.getItem('ilm_demo_admin') === '1'; } catch (e) { return false; } },
        login: function (pw) { if (pw === 'demo1234') { try { sessionStorage.setItem('ilm_demo_admin', '1'); } catch (e) { /* ঠিক আছে */ } return Promise.resolve(); } return Promise.reject(mkErr('auth/wrong-password')); },
        logout: function () { try { sessionStorage.removeItem('ilm_demo_admin'); } catch (e) { /* ঠিক আছে */ } return Promise.resolve(); },
      },
    };
    return s;
  }

  /* ---------------- Firebase স্টোর ---------------- */
  function firebaseStore() {
    var V = '10.12.2', base = 'https://www.gstatic.com/firebasejs/' + V + '/';
    var F, fdb, auth, A, ready;
    var boot = Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js')]).then(function (m) {
      var app = m[0].initializeApp(FB);
      F = m[1]; A = m[2]; fdb = F.getFirestore(app); auth = A.getAuth(app);
      ready = new Promise(function (res) { var un = A.onAuthStateChanged(auth, function () { un(); res(); }); });
    });
    function toDb(data) {
      var o = {};
      Object.keys(data).forEach(function (k) {
        var v = data[k];
        if (v === SERVER_TS) o[k] = F.serverTimestamp();
        else if (TS_FIELDS.indexOf(k) >= 0 && typeof v === 'string') o[k] = F.Timestamp.fromDate(new Date(v));
        else o[k] = v;
      });
      return o;
    }
    function fromDb(data, id) {
      var o = {};
      Object.keys(data).forEach(function (k) { var v = data[k]; o[k] = v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v; });
      if (o.id == null && id) o.id = id;
      return o;
    }
    function ref(path) { var p = parts(path); return F.doc(fdb, p[0], p[1]); }
    var s = {
      demo: false,
      SERVER_TS: SERVER_TS,
      get: function (path) { return boot.then(function () { return F.getDoc(ref(path)); }).then(function (snap) { return snap.exists() ? fromDb(snap.data(), snap.id) : null; }); },
      set: function (path, data) { return boot.then(function () { return F.setDoc(ref(path), toDb(scrub(data))); }); },
      update: function (path, data) { return boot.then(function () { return F.updateDoc(ref(path), toDb(scrub(data))); }); },
      del: function (path) { return boot.then(function () { return F.deleteDoc(ref(path)); }); },
      list: function (coll, wheres) {
        return boot.then(function () {
          var q = F.collection(fdb, coll);
          var cs = (wheres || []).map(function (w) { return F.where(w[0], w[1], w[2]); });
          return F.getDocs(cs.length ? F.query.apply(null, [q].concat(cs)) : q);
        }).then(function (snap) { return snap.docs.map(function (d) { return fromDb(d.data(), d.id); }); });
      },
      batch: function (ops) {
        return boot.then(function () {
          var b = F.writeBatch(fdb);
          ops.forEach(function (o) {
            if (o.type === 'delete') b.delete(ref(o.path));
            else if (o.type === 'update') b.update(ref(o.path), toDb(scrub(o.data)));
            else b.set(ref(o.path), toDb(scrub(o.data)));
          });
          return b.commit();
        });
      },
      ping: function () {
        return boot.then(function () {
          var id = Math.random().toString(16).slice(2) + Date.now().toString(16);
          var r = F.doc(fdb, 'pings', id);
          return F.setDoc(r, { t: F.serverTimestamp() }).then(function () { return F.getDoc(r); });
        }).then(function (snap) { return snap.data().t.toMillis(); });
      },
      auth: {
        get ready() { return boot.then(function () { return ready; }); },
        isAdmin: function () { return !!(auth && auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === String(CFG.adminEmail || '').toLowerCase()); },
        login: function (pw) { return boot.then(function () { return A.signInWithEmailAndPassword(auth, CFG.adminEmail, pw); }); },
        logout: function () { return boot.then(function () { return A.signOut(auth); }); },
      },
    };
    return s;
  }

  window.Store = FB.apiKey ? firebaseStore() : memoryStore();
})();
