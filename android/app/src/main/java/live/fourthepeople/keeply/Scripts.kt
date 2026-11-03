package live.fourthepeople.keeply

import org.json.JSONObject

/**
 * Small scripts run inside the Keeply page. They only use the web app's CSS class
 * names (.modal-backdrop, .fab-main, .rich-body …), which survive the minified build.
 */
object Scripts {

    /** Runs once per page load: reports the bar colours and when a recording starts/stops. */
    const val SETUP = """
(function () {
  if (window.__keeplyApp || !window.KeeplyApp) return;
  window.__keeplyApp = true;
  var A = window.KeeplyApp;

  if (window.MediaRecorder) {
    var P = MediaRecorder.prototype, start = P.start, live = 0;
    P.start = function () {
      var result = start.apply(this, arguments);
      live++; A.recording(true);
      this.addEventListener('stop', function () {
        live = Math.max(0, live - 1);
        if (!live) A.recording(false);
      }, { once: true });
      return result;
    };
  }

  function hex(p) {
    return '#' + p.slice(0, 3).map(function (v) {
      return ('0' + Math.round(v).toString(16)).slice(-2);
    }).join('');
  }
  function solid(el) {
    for (; el && el.nodeType === 1; el = el.parentElement) {
      var m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
      if (p.length < 4 || p[3] >= 0.98) return hex(p);
    }
    return null;
  }
  function at(y) {
    return solid(document.elementFromPoint(innerWidth / 2, y)) ||
      solid(document.body) || solid(document.documentElement) || '';
  }
  var last = '';
  function tick() {
    if (document.hidden) return;
    var top = at(1), bottom = at(innerHeight - 2);
    if (top + bottom !== last) { last = top + bottom; A.barColors(top, bottom); }
  }
  tick();
  setInterval(tick, 600);
})();
"""

    /** Back button: close whatever is open. Returns '' when there is nothing left to close. */
    const val BACK = """
(function () {
  function q(s) { return document.querySelector(s); }
  var b = document.querySelectorAll('.modal-backdrop');
  if (b.length) { b[b.length - 1].click(); return 'modal'; }
  var m = q('.menu-overlay'); if (m) { m.click(); return 'menu'; }
  var s = q('.sidebar.open'); if (s) { s.click(); return 'sidebar'; }
  var h = q('.help-close'); if (h) { h.click(); return 'help'; }
  var backs = document.querySelectorAll('.auth-back');
  for (var i = 0; i < backs.length; i++) {
    if (/^\u2190/.test(backs[i].textContent.trim())) { backs[i].click(); return 'auth'; }
  }
  var first = q('.sidebar .nav-item'), active = q('.sidebar .nav-item.active');
  if (first && active && active !== first) {
    var logo = q('.topbar .logo'); if (logo) { logo.click(); return 'home'; }
  }
  return '';
})();
"""

    /** The recording notification's Stop button. */
    const val STOP = """
(function () {
  var bs = document.querySelectorAll('.modal button');
  for (var i = 0; i < bs.length; i++) {
    if (/Stop/.test(bs[i].textContent)) { bs[i].click(); return 'stopped'; }
  }
  return '';
})();
"""

    /** Text shared from another app becomes a new note (the user can still edit or discard it). */
    fun share(subject: String, text: String): String = """
(function (subject, text) {
  var A = window.KeeplyApp, tries = 0, closed = false;
  function q(s) { return document.querySelector(s); }
  function find(sel, re) {
    var all = document.querySelectorAll(sel);
    for (var i = 0; i < all.length; i++) if (re.test(all[i].textContent)) return all[i];
    return null;
  }
  function open() {
    if (q('.modal-backdrop')) {
      if (closed) { A.toast('Finish what is open in Keeply, then share again.'); return; }
      closed = true; q('.modal-backdrop').click(); return setTimeout(open, 500);
    }
    var fab = q('.fab-main');
    if (!fab) {
      if (q('.auth, .notice-backdrop')) { A.toast('Finish signing in and unlocking Keeply, then share again.'); return; }
      if (++tries < 60) return setTimeout(open, 250);
      A.toast('Sign in to Keeply (or continue as a guest), then share again.');
      return;
    }
    fab.click();
    setTimeout(function () {
      var item = find('.fab-item', /Text/);
      if (!item) { A.toast('Could not open a new note.'); return; }
      item.click();
      fill(0);
    }, 200);
  }
  function fill(n) {
    var body = q('.modal .rich-body'), title = q('.modal .title-input');
    if (!body) { if (n < 40) setTimeout(function () { fill(n + 1); }, 100); return; }
    if (subject && title) {
      var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(title, subject);
      title.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (text) {
      body.focus();
      if (!document.execCommand('insertText', false, text)) body.innerText = text;
    }
  }
  open();
})(${JSONObject.quote(subject.take(300))}, ${JSONObject.quote(text.take(100_000))});
"""
}
