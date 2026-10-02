// Local test harness. Mocks the Google services Code.gs uses, serves the site at /pal-plays/,
// and answers /api the same way the deployed doPost would. Nothing here touches Google.
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const root = path.join(__dirname, '..');

function makeSheet(name) {
  const data = [];
  function range(r, c, nr, nc) {
    return {
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = data[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) { const v = row[c - 1 + j]; o.push(v === undefined ? '' : v); } out.push(o); } return out; },
      setValues(v) { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
      setValue(v) { data[r - 1] = data[r - 1] || []; data[r - 1][c - 1] = v; return this; },
      setNumberFormat() { return this; }, setFontWeight() { return this; },
    };
  }
  return {
    name, data, getName: () => name, getLastRow: () => data.length, getMaxRows: () => Math.max(1000, data.length), setFrozenRows() {},
    appendRow(r) { data.push(r.slice()); },
    getDataRange() { return range(1, 1, Math.max(data.length, 1), Math.max(1, ...data.map(r => r.length))); },
    getRange(r, c, nr = 1, nc = 1) { return range(r, c, nr, nc); },
  };
}

function boot() {
  const sheets = { Sheet1: makeSheet('Sheet1') };
  const ss = {
    getId: () => 'SHEET1', getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET1',
    getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(sheets), deleteSheet: s => { delete sheets[s.name]; },
  };
  const props = {};
  const ctx = {
    SpreadsheetApp: { create: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: {
      getUuid: () => require('crypto').randomUUID(),
      formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log: m => console.log('[Logger]', m) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/EXAMPLE/exec' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) },
    Date, Math, JSON, Number, String, Array, Object, isNaN, Error, console,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8'), ctx);
  ctx.setup();
  return { ctx, props, sheets };
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve(env, port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api') {
      if (env.offline) { req.destroy(); return; }
      let body = ''; req.on('data', c => body += c); req.on('end', () => {
        const out = env.ctx.doPost({ postData: { contents: body } });
        res.setHeader('content-type', 'application/json'); res.end(out.content);
      }); return;
    }
    let p = url.pathname.replace(/^\/pal-plays/, '');
    if (p.endsWith('/')) p += 'index.html';
    if (p === '/shared/config.js') { res.setHeader('content-type', 'text/javascript'); res.end("window.PAL_CONFIG={apiUrl:'/api'};"); return; }
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream');
    res.end(fs.readFileSync(f));
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

module.exports = { boot, serve };
