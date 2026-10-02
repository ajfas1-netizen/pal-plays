/**
 * PAL Plays: data service for the phone logger and Noel's dashboard.
 * The screens live on GitHub Pages. This script is the only thing that touches the Google Sheet.
 * Nobody needs access to the sheet. Each screen carries a private key in its link.
 *
 * One-time setup (see SETUP.md in the repo):
 *   1. Run setup() once and approve the permissions.
 *   2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *   3. Run showLinks() and copy the three lines from the execution log.
 *
 * Sends no email and runs no timers. It only does something when one of the two screens calls it.
 */

var TZ = 'America/New_York';
var T = { events: 'Events', plays: 'Plays', settings: 'Settings', list: 'Play List' };
var EVENT_HEAD = ['id', 'timestamp', 'date', 'playId', 'play', 'type', 'qty', 'amount', 'note', 'void'];
var PLAY_HEAD = ['id', 'date', 'play', 'start', 'end', 'minutes', 'status', 'note'];
var TYPES = ['touch', 'conversation', 'new_name', 'tour_booked', 'tour_held', 'ask', 'referral', 'pledge'];
var STALE_MS = 4 * 60 * 60 * 1000;

var DEFAULT_PLAYS = [
  ['Power Hour', true, true],
  ['Chamber Five', true, false],
  ['Door Knock', true, false],
  ['Lapsed Donor Call', true, false],
  ['Tour', true, false],
  ['Follow-Up Block', true, false],
  ['Mission Drop', true, false]
];
var DEFAULT_SETTINGS = [
  ['weekly_touches', 100, 'Weekly touches target'],
  ['weekly_new_names', 100, 'Weekly new names target'],
  ['weekly_tours_booked', 5, 'Weekly tours booked target'],
  ['power_hour_min_minutes', 45, 'A Power Hour shorter than this is flagged'],
  ['starting_balance', 0, 'Incremental dollars since May 1 before the app started (from GiveButter)'],
  ['year_target', 250000, 'Year one incremental target'],
  ['start_date', '2026-05-01', 'Megan\'s start date']
];

/* ---------------- setup ---------------- */

function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  var id = props.getProperty('SHEET_ID');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('PAL Strategic Growth Data');
    props.setProperty('SHEET_ID', ss.getId());
  }
  ensureSheet_(ss, T.events, EVENT_HEAD, [3]);
  ensureSheet_(ss, T.plays, PLAY_HEAD, [2]);
  var list = ensureSheet_(ss, T.list, ['Play', 'Active', 'Required every workday'], []);
  if (list.getLastRow() < 2) list.getRange(2, 1, DEFAULT_PLAYS.length, 3).setValues(DEFAULT_PLAYS);
  var st = ensureSheet_(ss, T.settings, ['Key', 'Value', 'What it means'], [2]);
  if (st.getLastRow() < 2) st.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
  var extra = ss.getSheetByName('Sheet1');
  if (extra && ss.getSheets().length > 1) ss.deleteSheet(extra);
  if (!props.getProperty('LOG_KEY')) props.setProperty('LOG_KEY', newKey_());
  if (!props.getProperty('DASH_KEY')) props.setProperty('DASH_KEY', newKey_());
  Logger.log('Setup done. Sheet: ' + ss.getUrl());
  Logger.log('Next: Deploy > New deployment > Web app (Execute as Me, Who has access Anyone), then run showLinks().');
}

function showLinks() {
  var props = PropertiesService.getScriptProperties();
  var url = ScriptApp.getService().getUrl();
  var pages = props.getProperty('PAGES_URL') || PAGES_DEFAULT;
  if (!url) { Logger.log('Deploy the web app first, then run showLinks() again.'); return; }
  Logger.log('Data service URL: use the Web app URL from Deploy > Manage deployments (it ends in /exec). If this one ends in /dev, ignore it: ' + url);
  Logger.log('Megan (logger): ' + pages + 'log/#k=' + props.getProperty('LOG_KEY'));
  Logger.log('Noel (dashboard): ' + pages + 'dashboard/#k=' + props.getProperty('DASH_KEY'));
}

/** Run this only if a link is ever shared by mistake. Old links stop working. */
function resetLinks() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('LOG_KEY', newKey_());
  props.setProperty('DASH_KEY', newKey_());
  showLinks();
}

function ensureSheet_(ss, name, head, textCols) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  textCols.forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
  return sh;
}

function newKey_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 24); }

/* ---------------- web ---------------- */

var PAGES_DEFAULT = 'https://ajfas1-netizen.github.io/pal-plays/';

function doGet() {
  return json_({ ok: true, service: 'pal-plays' });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { result: route_(req.k, req.fn, req.arg) };
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return json_(out);
}

var API = {
  getState: function (k) { return getState(k); },
  startPlay: function (k, a) { return startPlay(k, a); },
  tap: function (k, a) { return tap(k, a); },
  undo: function (k, a) { return undo(k, a); },
  endPlay: function (k, a) { return endPlay(k, a); },
  getDashboard: function (k, a) { return getDashboard(k, a); },
  saveTargets: function (k, a) { return saveTargets(k, a); }
};

function route_(k, fn, arg) {
  if (fn === 'batch') {
    auth_(k, 'log');
    var jobs = (arg || []).slice(0, 100);
    var results = jobs.map(function (j) {
      try { if (!API[j.fn] || j.fn === 'getDashboard' || j.fn === 'saveTargets') throw new Error('Unknown request.'); API[j.fn](k, j.arg); return { ok: true }; }
      catch (err) { return { error: String((err && err.message) || err) }; }
    });
    return { results: results, state: getState(k) };
  }
  if (!API[fn]) throw new Error('Unknown request.');
  return API[fn](k, arg);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function auth_(k, need) {
  var props = PropertiesService.getScriptProperties();
  var log = props.getProperty('LOG_KEY'), dash = props.getProperty('DASH_KEY');
  var ok = need === 'log' ? k === log : need === 'dash' ? k === dash : (k === log || k === dash);
  if (!k || !ok) throw new Error('This link isn\'t valid.');
}

/* ---------------- data helpers ---------------- */

function ss_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')); }

function rows_(name) {
  var sh = ss_().getSheetByName(name);
  var v = sh.getDataRange().getValues();
  var head = v.shift() || [];
  return v.map(function (r, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
}

function ms_(v) { return v instanceof Date ? v.getTime() : (v === '' || v == null ? null : Number(v)); }
function dstr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v || '');
}
function dayOf_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'yyyy-MM-dd'); }
function addDays_(s, n) { var d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dow_(s) { return new Date(s + 'T12:00:00Z').getUTCDay(); }
function monday_(s) { return addDays_(s, -((dow_(s) + 6) % 7)); }
function truthy_(v) { return v === true || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes'; }

function settings_() {
  var o = {};
  rows_(T.settings).forEach(function (r) { if (r.Key) o[r.Key] = r.Value; });
  var out = {
    weekly_touches: Number(o.weekly_touches) || 100,
    weekly_new_names: Number(o.weekly_new_names) || 100,
    weekly_tours_booked: Number(o.weekly_tours_booked) || 5,
    power_hour_min_minutes: Number(o.power_hour_min_minutes) || 45,
    starting_balance: Number(o.starting_balance) || 0,
    year_target: Number(o.year_target) || 250000,
    start_date: dstr_(o.start_date) || '2026-05-01'
  };
  return out;
}

function playList_() {
  return rows_(T.list).filter(function (r) { return r.Play && truthy_(r.Active); })
    .map(function (r) { return { name: String(r.Play), required: truthy_(r['Required every workday']) }; });
}

function events_() {
  return rows_(T.events).filter(function (r) { return r.id && !truthy_(r['void']); }).map(function (r) {
    return { id: String(r.id), ts: ms_(r.timestamp), date: dstr_(r.date), playId: String(r.playId || ''), play: String(r.play || ''),
      type: String(r.type), qty: Number(r.qty) || 0, amount: Number(r.amount) || 0, note: String(r.note || '') };
  });
}

function plays_() {
  var now = Date.now();
  return rows_(T.plays).filter(function (r) { return r.id; }).map(function (r) {
    var p = { _row: r._row, id: String(r.id), date: dstr_(r.date), play: String(r.play), start: ms_(r.start), end: ms_(r.end),
      minutes: r.minutes === '' ? null : Number(r.minutes), status: String(r.status || ''), note: String(r.note || '') };
    if (p.status === 'open' && now - p.start > STALE_MS) p.status = 'not ended';
    return p;
  });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------------- logger API (Megan) ---------------- */

function startPlay(k, a) {
  auth_(k, 'log');
  return withLock_(function () {
    var names = playList_().map(function (p) { return p.name; });
    if (names.indexOf(a.play) < 0) throw new Error('That play isn\'t on the list.');
    var sh = ss_().getSheetByName(T.plays);
    var ts = Number(a.ts) || Date.now();
    var existing = plays_();
    if (existing.some(function (p) { return p.id === a.id; })) return getState(k);
    existing.forEach(function (p) { if (p.status === 'open' || p.status === 'not ended') closeRow_(sh, p, p.status === 'open' ? ts : null, ''); });
    sh.appendRow([a.id, dayOf_(ts), a.play, new Date(ts), '', '', 'open', '']);
    return getState(k);
  });
}

function tap(k, a) {
  auth_(k, 'log');
  if (TYPES.indexOf(a.type) < 0) throw new Error('Unknown entry.');
  return withLock_(function () {
    var sh = ss_().getSheetByName(T.events);
    var last = sh.getLastRow();
    if (last > 1) {
      var from = Math.max(2, last - 300);
      var ids = sh.getRange(from, 1, last - from + 1, 1).getValues().map(function (r) { return String(r[0]); });
      if (ids.indexOf(String(a.id)) >= 0) return { ok: true, dup: true };
    }
    var ts = Number(a.ts) || Date.now();
    sh.appendRow([a.id, new Date(ts), dayOf_(ts), a.playId || '', a.play || '', a.type, Number(a.qty) || 1,
      Number(a.amount) || '', String(a.note || '').slice(0, 300), false]);
    return { ok: true };
  });
}

function undo(k, a) {
  auth_(k, 'log');
  return withLock_(function () {
    var sh = ss_().getSheetByName(T.events);
    var last = sh.getLastRow();
    if (last < 2) return { ok: true };
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(a.id)) { sh.getRange(i + 2, 10).setValue(true); break; }
    }
    return { ok: true };
  });
}

function endPlay(k, a) {
  auth_(k, 'log');
  return withLock_(function () {
    var sh = ss_().getSheetByName(T.plays);
    var p = plays_().filter(function (x) { return x.id === a.playId; })[0];
    if (p && (p.status === 'open' || p.status === 'not ended')) {
      closeRow_(sh, p, Number(a.ts) || Date.now(), a.note || '');
      if (p.play === 'Tour') {
        ss_().getSheetByName(T.events).appendRow([p.id + '-held', new Date(Number(a.ts) || Date.now()), p.date, p.id, p.play, 'tour_held', 1, '', '', false]);
      }
    }
    return getState(k);
  });
}

function closeRow_(sh, p, endTs, note) {
  var mins = endTs ? Math.max(0, Math.round((endTs - p.start) / 60000)) : '';
  var status = endTs ? 'ended' : 'not ended';
  sh.getRange(p._row, 5, 1, 4).setValues([[endTs ? new Date(endTs) : '', mins, status, String(note || p.note || '').slice(0, 300)]]);
}

function getState(k) {
  auth_(k, 'any');
  var today = dayOf_(Date.now());
  var plays = plays_();
  var ev = events_();
  var list = playList_();
  var open = plays.filter(function (p) { return p.status === 'open'; }).sort(function (a, b) { return b.start - a.start; })[0] || null;
  var counts = function (filter) {
    var c = {}; TYPES.forEach(function (t) { c[t] = 0; });
    ev.filter(filter).forEach(function (e) { c[e.type] += e.type === 'pledge' ? e.amount : e.qty; });
    return c;
  };
  var todays = plays.filter(function (p) { return p.date === today; }).sort(function (a, b) { return a.start - b.start; });
  var st = settings_();
  var reqNames = list.filter(function (p) { return p.required; }).map(function (p) { return p.name; });
  return {
    plays: list,
    today: today,
    open: open ? { id: open.id, play: open.play, start: open.start, counts: counts(function (e) { return e.playId === open.id; }) } : null,
    todayPlays: todays.map(function (p) { return { play: p.play, minutes: p.minutes, status: p.status }; }),
    todayCounts: counts(function (e) { return e.date === today; }),
    required: reqNames.map(function (n) { return { name: n, done: doneFor_(plays, today, n, st) }; }),
    streak: streak_(plays, st, reqNames),
    weekTouches: counts(function (e) { return e.date >= monday_(today) && e.date <= today; }).touch,
    weeklyTouchTarget: st.weekly_touches
  };
}

function doneFor_(plays, day, name, st) {
  var m = 0;
  plays.forEach(function (p) { if (p.date === day && p.play === name && p.status === 'ended') m += p.minutes || 0; });
  return m >= (name === 'Power Hour' ? st.power_hour_min_minutes : 1) ? m : (m > 0 ? -m : 0);
}

function streak_(plays, st, reqNames) {
  if (!reqNames.length) return 0;
  var day = dayOf_(Date.now()), n = 0;
  var ok = function (d) { return reqNames.every(function (r) { return doneFor_(plays, d, r, st) > 0; }); };
  if (!ok(day)) day = addDays_(day, -1);
  for (var i = 0; i < 400; i++) {
    var w = dow_(day);
    if (w === 0 || w === 6) { day = addDays_(day, -1); continue; }
    if (ok(day)) { n++; day = addDays_(day, -1); } else break;
  }
  return n;
}

/* ---------------- dashboard API (Noel) ---------------- */

function getDashboard(k, weekStart) {
  auth_(k, 'any');
  var st = settings_();
  var today = dayOf_(Date.now());
  var ws = monday_(weekStart || today);
  var we = addDays_(ws, 6);
  var plays = plays_();
  var ev = events_();
  var reqNames = playList_().filter(function (p) { return p.required; }).map(function (p) { return p.name; });
  var sumType = function (from, to, type) {
    return ev.filter(function (e) { return e.type === type && e.date >= from && e.date <= to; })
      .reduce(function (a, e) { return a + (type === 'pledge' ? e.amount : e.qty); }, 0);
  };

  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = addDays_(ws, i);
    var dp = plays.filter(function (p) { return p.date === d; }).sort(function (a, b) { return a.start - b.start; });
    var weekend = i >= 5;
    if (weekend && !dp.length) continue;
    var req = reqNames.map(function (n) {
      var v = doneFor_(plays, d, n, st);
      return { name: n, minutes: Math.abs(v), state: v > 0 ? 'done' : v < 0 ? 'short' : (d > today ? 'upcoming' : (d === today ? 'pending' : 'missed')) };
    });
    days.push({
      date: d, weekend: weekend, future: d > today,
      plays: dp.map(function (p) { return { play: p.play, minutes: p.minutes, status: p.status, start: p.start }; }),
      required: req,
      touches: sumType(d, d, 'touch'), tours: sumType(d, d, 'tour_booked'), asks: sumType(d, d, 'ask')
    });
  }

  var totals = {};
  TYPES.forEach(function (t) { totals[t] = sumType(ws, we, t); });
  var pledgeCount = function (from, to) { return ev.filter(function (e) { return e.type === 'pledge' && e.date >= from && e.date <= to; }).length; };

  var rs = addDays_(ws, -21);
  var R = {}; TYPES.forEach(function (t) { R[t] = sumType(rs, we, t); });
  var rates = [
    { name: 'Touches to conversations', num: R.conversation, den: R.touch, bench: 0.25 },
    { name: 'Conversations to tours booked', num: R.tour_booked, den: R.conversation, bench: 0.25 },
    { name: 'Tours booked to tours held', num: R.tour_held, den: R.tour_booked, bench: 0.8 },
    { name: 'Asks to pledges', num: pledgeCount(rs, we), den: R.ask, bench: 0.33 }
  ];

  var trend = [];
  for (var w = 7; w >= 0; w--) {
    var a = addDays_(ws, -7 * w), b = addDays_(a, 6);
    var phDays = 0;
    for (var j = 0; j < 5; j++) { if (doneFor_(plays, addDays_(a, j), 'Power Hour', st) > 0) phDays++; }
    trend.push({ week: a, touches: sumType(a, b, 'touch'), tours: sumType(a, b, 'tour_booked'), pledged: sumType(a, b, 'pledge'), phDays: phDays });
  }

  var ytd = st.starting_balance + sumType(st.start_date, '9999-12-31', 'pledge');
  var elapsed = Math.max(0, (new Date(today + 'T12:00:00Z') - new Date(st.start_date + 'T12:00:00Z')) / 864e5);
  var pace = st.year_target * Math.min(1, elapsed / 365);

  var notes = [];
  ev.filter(function (e) { return e.note && e.date >= ws && e.date <= we; }).forEach(function (e) { notes.push({ date: e.date, ts: e.ts, text: e.note, kind: e.type }); });
  plays.filter(function (p) { return p.note && p.date >= ws && p.date <= we; }).forEach(function (p) { notes.push({ date: p.date, ts: p.end || p.start, text: p.note, kind: p.play }); });
  notes.sort(function (a, b) { return b.ts - a.ts; });

  var workdaysSoFar = days.filter(function (d) { return !d.weekend && !d.future; }).length;
  var phDone = days.filter(function (d) { return !d.weekend && d.required.some(function (r) { return r.name === 'Power Hour' && r.state === 'done'; }); }).length;

  return {
    weekStart: ws, weekEnd: we, today: today, settings: st, days: days, totals: totals,
    pledgesThisWeek: pledgeCount(ws, we), rates: rates, trend: trend, ytd: ytd, pace: pace,
    notes: notes.slice(0, 25), phDone: phDone, workdaysSoFar: workdaysSoFar,
    playsRun: plays.filter(function (p) { return p.date >= ws && p.date <= we && p.status === 'ended'; }).length,
    canEdit: k === PropertiesService.getScriptProperties().getProperty('DASH_KEY')
  };
}

function saveTargets(k, t) {
  auth_(k, 'dash');
  return withLock_(function () {
    var sh = ss_().getSheetByName(T.settings);
    var rows = rows_(T.settings);
    ['weekly_touches', 'weekly_new_names', 'weekly_tours_booked', 'starting_balance'].forEach(function (key) {
      if (t[key] === undefined || t[key] === '' || isNaN(Number(t[key]))) return;
      var r = rows.filter(function (x) { return x.Key === key; })[0];
      if (r) sh.getRange(r._row, 2).setValue(Math.max(0, Math.round(Number(t[key]))));
    });
    return settings_();
  });
}
