// Talks to the Apps Script data service. The private key comes from the link (#k=...) and is remembered on this device.
(function () {
  function readKey(slot) {
    var m = (location.hash || '').match(/k=([A-Za-z0-9]+)/);
    if (m) { try { localStorage.setItem('palplays.k.' + slot, m[1]); } catch (e) {} return m[1]; }
    try { return localStorage.getItem('palplays.k.' + slot) || ''; } catch (e) { return ''; }
  }
  var cfg = window.PAL_CONFIG || {};
  window.PAL = {
    configured: !!cfg.apiUrl && cfg.apiUrl.indexOf('http') === 0 || cfg.apiUrl === '/api',
    key: function (slot) { return readKey(slot); },
    call: function (key, fn, arg) {
      return fetch(cfg.apiUrl, { method: 'POST', body: JSON.stringify({ k: key, fn: fn, arg: arg }), redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('offline'); return r.json(); })
        .then(function (j) { if (j.error) { var e = new Error(j.error); e.server = true; throw e; } return j.result; });
    },
    registerWorker: function () {
      if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('../sw.js', { scope: '../' }); } catch (e) {} }
    }
  };
})();
