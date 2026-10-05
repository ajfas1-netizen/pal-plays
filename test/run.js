// End-to-end check: node test/run.js  (needs playwright). Uses mocked Google services only.
const assert = require('assert');
const { chromium } = require('playwright');
const { boot, serve } = require('./harness');

const env = boot();
const { ctx, props } = env;
const L = props.LOG_KEY, D = props.DASH_KEY;
const api = (k, fn, arg) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ k, fn, arg }) } }).content);
let n = 0; const id = () => 'seed' + (n++);
const at = (day, hh) => new Date(day + 'T' + String(hh).padStart(2, '0') + ':00:00-04:00').getTime();
const results = [];
const check = (name, cond) => { results.push((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };

// security
check('bad key refused', /isn't valid/.test(api('nope', 'getState').error || ''));
check('logger key cannot change targets', /isn't valid/.test(api(L, 'saveTargets', { weekly_touches: 1 }).error || ''));
check('dashboard key cannot log', /isn't valid/.test(api(D, 'batch', []).error || ''));
const V = props.VIEW_KEY;
check('view-only key reads the dashboard', !!(api(V, 'getDashboard', '').result || {}).days);
check('view-only key cannot change targets', /isn't valid/.test(api(V, 'saveTargets', { weekly_touches: 1 }).error || ''));
check('view-only key cannot log', /isn't valid/.test(api(V, 'batch', []).error || ''));
check('only Noel\'s key can edit', api(V, 'getDashboard', '').result.canEdit === false && api(L, 'getDashboard', '').result.canEdit === false && api(D, 'getDashboard', '').result.canEdit === true);
check('unknown request refused', /Unknown/.test(api(L, 'deleteEverything').error || ''));

// seed two weeks of history
function playOn(day, play, h, minutes, taps) {
  const pid = id(); const s = at(day, h);
  const jobs = [{ fn: 'startPlay', arg: { id: pid, play, ts: s } }];
  Object.entries(taps || {}).forEach(([type, q]) => { for (let i = 0; i < q; i++) jobs.push({ fn: 'tap', arg: { id: id(), playId: pid, play, type, qty: 1, ts: s + 60000 * (i + 1) } }); });
  jobs.push({ fn: 'endPlay', arg: { playId: pid, ts: s + minutes * 60000, note: '' } });
  const r = api(L, 'batch', jobs); assert(!r.error, r.error);
}
['2026-09-14', '2026-09-21'].forEach((mon, w) => {
  for (let d = 0; d < 5; d++) {
    const day = ctx.addDays_(mon, d);
    if (!(w === 0 && d === 2)) playOn(day, 'Power Hour', 9, d === 3 ? 20 : 60, { touch: 14 + w * 3, conversation: 3 + w, new_name: 4, tour_booked: d % 2, ask: 1 });
    if (d === 1) playOn(day, 'Door Knock', 13, 80, { touch: 10, conversation: 4, new_name: 3, referral: 2 });
    if (d === 3) playOn(day, 'Tour', 14, 30, { ask: 1 });
  }
});
['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].forEach((day, d) => {
  if (d !== 2) playOn(day, 'Power Hour', 9, 55, { touch: 18, conversation: 5, new_name: 6, tour_booked: 1, ask: 2 });
  if (d === 1) playOn(day, 'Tour', 14, 35, { ask: 1 });
});
api(L, 'batch', [{ fn: 'tap', arg: { id: 'p1', type: 'pledge', qty: 1, amount: 1000, note: 'All Area Roofing, Leadership Circle', ts: at('2026-09-29', 15) } }]);

// batch duplicates are ignored
const before = env.sheets.Events.data.length;
api(L, 'batch', [{ fn: 'tap', arg: { id: 'dup', type: 'referral', ts: Date.now() } }, { fn: 'tap', arg: { id: 'dup', type: 'referral', ts: Date.now() } }]);
check('duplicate tap saved once', env.sheets.Events.data.length === before + 1);
api(L, 'batch', [{ fn: 'undo', arg: { id: 'dup' } }]);
check('a play not on the list is refused', /isn't on the list/.test(api(L, 'batch', [{ fn: 'startPlay', arg: { id: 'x', play: 'Golf', ts: Date.now() } }]).result.results[0].error || ''));

const dw = api(D, 'getDashboard', '2026-09-21').result;
check('Power Hour 4 of 5 in week of 9/21 (one short)', dw.phDone === 4);
check('touches week of 9/21 = 95', dw.totals.touch === 95);

(async () => {
  const server = await serve(env, 8766);
  const base = 'http://localhost:8766/pal-plays/';
  const b = await chromium.launch();
  const errs = [];
  const watch = (p, tag) => { p.on('pageerror', e => errs.push(tag + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL|ERR_CONNECTION|ERR_EMPTY_RESPONSE/.test(m.text())) errs.push(tag + ': ' + m.text()); }); };

  const phone = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await phone.newPage(); watch(p, 'log');
  await p.goto(base + 'log/#k=' + L); await p.waitForTimeout(800);
  check('logger opens with key', await p.isVisible('#startPH'));
  check('logger shows the Playbook link', await p.isVisible('#bookLink'));
  await p.click('#startPH'); await p.waitForTimeout(400);
  const dial = p.locator('.tb.main');
  for (let i = 0; i < 4; i++) await dial.click();
  // lose signal mid play
  env.offline = true;
  for (let i = 0; i < 3; i++) await dial.click();
  await p.locator('.tb').nth(1).click();
  await p.waitForTimeout(700);
  const offTxt = await p.textContent('#syncText');
  check('shows waiting taps while offline (' + offTxt + ')', /waiting/.test(offTxt));
  // close and reopen the app while offline: taps must survive
  await p.close();
  const p2 = await phone.newPage(); watch(p2, 'log2');
  await p2.goto(base + 'log/'); await p2.waitForTimeout(900);
  check('reopens from home screen without the key in the link', await p2.isVisible('#inplay') || await p2.isVisible('#home'));
  env.offline = false;
  await p2.waitForTimeout(7000);
  if (!(api(L,'getState').result.open||{}).counts) console.log('state', JSON.stringify(api(L,'getState').result.open));
  const st = api(L, 'getState').result;
  check('offline taps saved after reconnect (touch=7, conversation=1)', st.open && st.open.counts.touch === 7 && st.open.counts.conversation === 1);
  await p2.screenshot({ path: __dirname + '/shot-log-play.png' });
  await p2.click('#endBtn'); await p2.waitForTimeout(1500);
  await p2.screenshot({ path: __dirname + '/shot-log-home.png' });
  const st2 = api(L, 'getState').result;
  check('play ended and saved', !st2.open && st2.todayPlays.length === 1);

  // Meghan taps See my week, then goes back
  await p2.click('#weekLink'); await p2.waitForTimeout(1200);
  check('My week opens the dashboard with her numbers', /of/.test(await p2.textContent('#headline')));
  check('Meghan does not see the targets editor', await p2.isHidden('#targetsCard'));
  check('Meghan does not see the coaching guide link', await p2.isHidden('#guide'));
  check('Back to plays button shows', await p2.isVisible('#back'));
  await p2.click('#back'); await p2.waitForTimeout(900);
  check('Back returns to her logger', await p2.isVisible('#startPH'));

  // no key at all
  const fresh = await b.newContext(); const p3 = await fresh.newPage();
  await p3.goto(base + 'log/'); await p3.waitForTimeout(500);
  check('no key shows the private link message', await p3.isVisible('#blocked'));
  const p4 = await fresh.newPage(); await p4.goto(base + 'log/#k=wrongkey123'); await p4.waitForTimeout(800);
  check('wrong key shows an error, not the app', await p4.isVisible('#blocked'));

  // Noel
  const lap = await b.newContext({ viewport: { width: 1180, height: 900 } });
  const q = await lap.newPage(); watch(q, 'dash');
  await q.goto(base + 'dashboard/#k=' + D); await q.waitForTimeout(1000);
  check('dashboard renders the week', /of \d|Starts soon/.test(await q.textContent('#headline')));
  await q.click('.seg button[data-r="month"]'); await q.waitForTimeout(900);
  check('Month view shows the month and a calendar', /2026/.test(await q.textContent('#wk')) && (await q.locator('.mcell').count()) >= 20);
  await q.screenshot({ path: __dirname + '/shot-dash-month.png', fullPage: true });
  await q.click('#prev'); await q.waitForTimeout(900);
  check('Prev month moves back a month', /September 2026/.test(await q.textContent('#wk')));
  await q.click('.seg button[data-r="all"]'); await q.waitForTimeout(900);
  check('Since start view hides the day grid and shows the start', /Since/.test(await q.textContent('#wk')) && await q.isHidden('#daysCard'));
  await q.click('.seg button[data-r="week"]'); await q.waitForTimeout(900);
  await q.fill('#tT', '120'); await q.click('#saveT'); await q.waitForTimeout(800);
  check('Noel sees the coaching guide link', await q.isVisible('#guide'));
  check('Noel can save targets', api(D, 'getDashboard', '').result.settings.weekly_touches === 120);
  await q.screenshot({ path: __dirname + '/shot-dash.png', fullPage: true });
  check('dashboard has no sideways scroll', !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  const qp = await (await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })).newPage();
  await qp.goto(base + 'dashboard/#k=' + D); await qp.waitForTimeout(1000);
  check('dashboard on a phone has no sideways scroll', !(await qp.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  check('no page errors (' + errs.join(' | ') + ')', errs.length === 0);
  console.log(results.join('\n'));
  await b.close(); server.close();
})();
