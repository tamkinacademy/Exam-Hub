/* পেজ লোডের আগেই থিম ও অ্যাকসেন্ট রং বসায়, যাতে ঝিলিক না দেয় */
(function () {
  try {
    var t = localStorage.getItem('ilm_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    var a = localStorage.getItem('ilm_accent');
    if (a && /^#[0-9a-fA-F]{6}$/.test(a)) document.documentElement.style.setProperty('--accent', a);
  } catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
})();
