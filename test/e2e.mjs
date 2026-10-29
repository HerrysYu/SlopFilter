// End-to-end test of the real, unpacked extension.
// Starts headless Chrome over a DevTools pipe, maps x.com and api.typesafe.ai
// to a local HTTPS mock (test/mock-x.html + test/fake-jev.mjs), loads the
// extension, and drives the capsule, the panel and the timeline.
//
// Run: node test/e2e.mjs [screenshot-dir]
// Needs Google Chrome and openssl. Set CHROME=/path/to/chrome to override.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeJev } from './fake-jev.mjs';
import { SAMPLES } from './samples.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(process.argv[2] || join(ROOT, 'test', 'out'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8443;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'slopfilter-e2e-'));

// ---------- local HTTPS mock for x.com and api.typesafe.ai ----------

const keyFile = join(work, 'key.pem');
const certFile = join(work, 'cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=x.com'], { stdio: 'ignore' });

const jev = fakeJev(SAMPLES);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, async (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  const url = new URL(req.url, `https://${host}`);
  if (host === 'api.typesafe.ai') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    await sleep(120 + Math.random() * 280);
    const out = jev.handle({ method: req.method, path: url.pathname, key: (req.headers.authorization || '').replace(/^Bearer\s+/i, ''), body: raw ? JSON.parse(raw) : null });
    res.writeHead(out.status, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(out.json));
  }
  let file = url.pathname;
  if (file === '/' || file === '/home' || /\/status\/\d+/.test(file)) file = '/test/mock-x.html';
  const path = join(ROOT, file);
  let ok = false;
  try {
    ok = path.startsWith(ROOT + sep) && statSync(path).isFile();
  } catch {}
  if (!ok) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// ---------- Chrome over a DevTools pipe ----------

const chrome = spawn(
  CHROME,
  [
    '--headless',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${join(work, 'profile')}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--host-resolver-rules=MAP x.com 127.0.0.1:${PORT}, MAP api.typesafe.ai 127.0.0.1:${PORT}, MAP mock.test 127.0.0.1:${PORT}`,
    '--ignore-certificate-errors',
    '--no-proxy-server', // a system proxy would bypass the host mapping above
    '--window-size=1280,860',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
);
let stderr = '';
chrome.stderr.on('data', (d) => (stderr += d));

const pipeIn = chrome.stdio[3];
const pipeOut = chrome.stdio[4];
let nextId = 1;
const pending = new Map();
const listeners = [];
let buf = Buffer.alloc(0);
pipeOut.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  let end;
  while ((end = buf.indexOf(0)) >= 0) {
    const msg = JSON.parse(buf.subarray(0, end).toString('utf8'));
    buf = buf.subarray(end + 1);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(`${p.method}: ${msg.error.message}`)) : p.resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  }
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  pipeIn.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}

const problems = [];
listeners.push((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    const text = d.exception?.description || d.text;
    if (!/stop: real extension mode/.test(text)) problems.push(`exception: ${text.split('\n')[0]}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    problems.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
});

// ---------- helpers ----------

let page;
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, page);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expression, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await evaluate(expression)) return true;
    await sleep(100);
  }
  const where = await evaluate(`({ url: location.href, title: document.title, articles: document.querySelectorAll('article').length, tagged: document.querySelectorAll('[data-sf-id]').length, ui: !!document.getElementById('slopfilter-root') })`).catch((e) => e.message);
  throw new Error(`timed out waiting for: ${expression}\n  page: ${JSON.stringify(where)}`);
}
async function shot(name, clip) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }, page);
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
}
async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, page);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, page);
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, page);
}
const KEYS = { Enter: 13, Tab: 9, Escape: 27, ArrowRight: 39, ArrowLeft: 37 };
async function press(key) {
  const base = { key, code: key, windowsVirtualKeyCode: KEYS[key] };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, page);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, page);
  await sleep(80);
}
// The UI lives in a closed shadow root, so find the capsule by hit-testing.
const findCapsule = () =>
  evaluate(`(() => {
    const host = document.getElementById('slopfilter-root');
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    let xs = [], ys = [];
    for (let y = vh - 1; y > vh - 200; y -= 2) if (document.elementFromPoint(vw - 40, y) === host) ys.push(y);
    const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : vh - 104;
    for (let x = vw - 1; x > vw - 400; x -= 2) if (document.elementFromPoint(x, cy) === host) xs.push(x);
    return xs.length ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: cy, w: Math.max(...xs) - Math.min(...xs) } : null;
  })()`);
const panelOpen = () => evaluate(`document.elementFromPoint(document.documentElement.clientWidth - 200, document.documentElement.clientHeight - 300) === document.getElementById('slopfilter-root')`);
const states = () => evaluate(`[...document.querySelectorAll('article[data-sf-id]')].map(a => ({ id: a.dataset.sfId.slice(-2), state: a.dataset.sfState || '', pct: a.dataset.sfPct || '', hidden: !!a.closest('[data-sf-hide="1"]') }))`);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`);
}

// ---------- scenario ----------

try {
  await send('Target.setDiscoverTargets', { discover: true });
  const { id: extId } = await send('Extensions.loadUnpacked', { path: ROOT });
  check('extension loads unpacked', !!extId, extId);

  let sw = null;
  for (let i = 0; i < 30 && !sw; i++) {
    const { targetInfos } = await send('Target.getTargets');
    sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(extId));
    if (!sw) await sleep(100);
  }
  check('service worker is running', !!sw, sw?.url.replace(/^chrome-extension:\/\/[^/]+/, ''));
  if (sw) {
    const { sessionId } = await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: page } = await send('Target.attachToTarget', { targetId, flatten: true }));
  await send('Page.enable', {}, page);
  await send('Runtime.enable', {}, page);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 2, mobile: false }, page);
  await send('Page.navigate', { url: 'https://x.com/home' }, page);

  await waitFor(`document.querySelectorAll('article[data-sf-id]').length === ${SAMPLES.length}`);
  check('content script tags every post', true, `${SAMPLES.length} posts`);
  await sleep(600);

  let s = await states();
  const localBlocked = s.filter((x) => x.state === 'blocked').map((x) => x.id);
  const slopIds = SAMPLES.filter((x) => x.slop).map((x) => x.id.slice(-2));
  check('no key: local rules catch the obvious posts and no human one', localBlocked.includes('05') && localBlocked.every((id) => slopIds.includes(id)), localBlocked.join() || 'none');
  await shot('01-local.png');

  const capsule = await findCapsule();
  check('capsule is on the page', !!capsule, capsule && `${Math.round(capsule.w)}px wide`);
  await click(capsule.x, capsule.y);
  await sleep(900);
  check('clicking the capsule opens the panel', await panelOpen());
  await shot('02-panel-local.png');

  // The key field has focus when no key is saved yet.
  await send('Input.insertText', { text: 'ts_e2e_demo_key_9f2c' }, page);
  await press('Enter');
  const expected = SAMPLES.filter((x) => x.slop).map((x) => x.id.slice(-2));
  await waitFor(`[...document.querySelectorAll('article[data-sf-state="blocked"]')].length === ${expected.length}`, 15000);
  s = await states();
  const blocked = s.filter((x) => x.state === 'blocked').map((x) => x.id);
  check('with Jev: every slop sample blocked, every human sample kept', blocked.join() === expected.join(), `${blocked.length}/${SAMPLES.length} blocked`);
  check('Jev received well-formed requests', jev.calls > 0 && !!jev.lastRequest?.questions?.is_ai_slop, `${jev.calls} calls`);
  await sleep(700);
  await shot('03-panel-jev.png');

  // Keyboard: key field → key button → 判定尺度 → 处理方式, then arrow to 隐藏.
  await press('Tab');
  await press('Tab');
  await press('Tab');
  await press('ArrowRight');
  await waitFor(`document.querySelectorAll('[data-sf-hide="1"]').length === ${expected.length}`, 3000).then(
    () => check('hide mode removes blocked posts (keyboard)', true),
    () => check('hide mode removes blocked posts (keyboard)', false),
  );
  await press('ArrowLeft');
  await waitFor(`document.querySelectorAll('[data-sf-hide="1"]').length === 0`, 3000).catch(() => {});

  await press('Escape');
  await sleep(800);
  check('Escape closes the panel', !(await panelOpen()));
  await shot('04-timeline.png');

  // Clicking a collapsed row reveals it instead of navigating.
  const rect = await evaluate(`(() => { const r = document.querySelector('article[data-sf-state="blocked"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await click(rect.x, rect.y);
  await sleep(300);
  const revealed = await evaluate(`document.querySelectorAll('article[data-sf-state="revealed"]').length`);
  const navigated = await evaluate(`document.getElementById('toast').classList.contains('show')`);
  check('clicking a collapsed post reveals it without navigating', revealed === 1 && !navigated);

  // Dark theme, then the panel again.
  await evaluate(`document.querySelector('[data-theme="black"]').click()`);
  await sleep(300);
  check('theme follows X (lights out)', await evaluate(`document.documentElement.dataset.sfTheme === 'dark'`));
  await click(capsule.x, capsule.y);
  await sleep(900);
  await shot('05-panel-dark.png');
  await press('Escape');
  await sleep(700);
  await shot('06-timeline-dark.png');

  // ---------- the morph itself, measured frame by frame ----------
  // mock.test runs the same scripts through the chrome.* shim, with an open
  // shadow root so the shell's size can be read on every animation frame.
  await send('Page.navigate', { url: 'https://mock.test/test/mock-x.html' }, page);
  await waitFor(`!!document.getElementById('slopfilter-root')?.shadowRoot?.querySelector('.shell')`);
  await sleep(600);
  const trace = await evaluate(`(async () => {
    const root = document.getElementById('slopfilter-root').shadowRoot;
    const shell = root.querySelector('.shell'), cap = root.querySelector('.cap');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let frames = [], run = true;
    const tick = (t) => { frames.push([t, parseFloat(shell.style.width), parseFloat(shell.style.height)]); if (run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const start = { w: parseFloat(shell.style.width), h: parseFloat(shell.style.height) };
    cap.click();
    await wait(1600);
    const open = frames; frames = [];
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    await wait(140);
    cap.click(); // grab it again halfway through closing
    await wait(1600);
    run = false;
    return { start, open, again: frames };
  })()`);
  const lastOf = (f) => f[f.length - 1];
  const [, endW, endH] = lastOf(trace.open);
  const overW = Math.max(...trace.open.map((f) => f[1])) / endW - 1;
  const overH = Math.max(...trace.open.map((f) => f[2])) / endH - 1;
  check('open morph reaches the panel size with high damping', overW < 0.02 && overH < 0.02, `${Math.round(trace.start.w)}×${trace.start.h} → ${Math.round(endW)}×${Math.round(endH)}, overshoot w ${(overW * 100).toFixed(2)}% h ${(overH * 100).toFixed(2)}%`);
  const ws = trace.again.map((f) => f[1]);
  const turn = ws.indexOf(Math.min(...ws));
  const steps = ws.slice(1).map((w, i) => Math.abs(w - ws[i]));
  check(
    'interrupted close reverses smoothly without a jump',
    turn > 2 && turn < ws.length - 3 && Math.max(...steps) < 60 && Math.abs(lastOf(ws) - endW) < 1,
    `turned at ${Math.round(ws[turn])}px, largest step ${Math.max(...steps).toFixed(1)}px`,
  );

  // Replies on a /status/ page are sent with the post they answer.
  await send('Page.navigate', { url: 'https://mock.test/test/mock-x.html?view=thread' }, page);
  await waitFor(`!!document.getElementById('slopfilter-root')?.shadowRoot?.querySelector('.key input')`);
  await evaluate(`(() => {
    const r = document.getElementById('slopfilter-root').shadowRoot;
    const input = r.querySelector('.key input');
    input.value = 'ts_thread_test';
    input.dispatchEvent(new Event('input'));
    r.querySelector('.key button').click();
  })()`);
  await waitFor(`window.__shim.requests.some((b) => b.state.post_kind === 'reply' && b.state.replying_to)`, 10000).then(
    async () => {
      const req = await evaluate(`window.__shim.requests.find((b) => b.state.replying_to)`);
      check('replies carry the parent post as context', req.state.replying_to === SAMPLES[0].parent, req.state.post_text.slice(0, 32));
    },
    () => check('replies carry the parent post as context', false),
  );

  // Drag the capsule and fling it towards the top-left corner.
  await send('Page.navigate', { url: 'https://mock.test/test/mock-x.html' }, page);
  await waitFor(`document.querySelectorAll('article[data-sf-state="blocked"]').length === ${expected.length}`, 15000);
  const shellInfo = `(() => { const s = document.getElementById('slopfilter-root').shadowRoot.querySelector('.shell'); const r = s.getBoundingClientRect(); return { corner: s.dataset.corner, x: r.x, y: r.y, w: r.width, h: r.height }; })()`;
  const before = await evaluate(shellInfo);
  let x = before.x + before.w / 2;
  let y = before.y + before.h / 2;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, page);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, page);
  for (let i = 0; i < 12; i++) {
    x -= 40;
    y -= 32;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }, page);
    await sleep(16);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, page);
  await sleep(1400);
  const after = await evaluate(shellInfo);
  const saved = await evaluate(`JSON.parse(localStorage.getItem('sf-mock-storage')).settings.corner`);
  check('a flung capsule settles in the top-left corner', after.corner === 'tl' && Math.abs(after.x - 20) < 2 && Math.abs(after.y - 72) < 2 && saved === 'tl', `${before.corner} → ${after.corner} at ${Math.round(after.x)},${Math.round(after.y)}`);

  // "误判" un-blocks the post, trusts its author and takes it out of the count.
  const undo = await evaluate(`(async () => {
    const r = document.getElementById('slopfilter-root').shadowRoot;
    r.querySelector('.cap').click();
    await new Promise((res) => setTimeout(res, 900));
    const handle = r.querySelector('.item-handle').textContent.slice(1);
    const total = JSON.parse(localStorage.getItem('sf-mock-storage')).stats.total;
    r.querySelector('.undo').click();
    await new Promise((res) => setTimeout(res, 600));
    const store = JSON.parse(localStorage.getItem('sf-mock-storage'));
    const article = [...document.querySelectorAll('article')].find((a) => a.querySelector('[data-testid="User-Name"]').textContent.includes('@' + handle));
    return { handle, trusted: store.settings.trusted.includes(handle.toLowerCase()), before: total, after: store.stats.total, state: article.dataset.sfState || '' };
  })()`);
  check('误判 restores the post, trusts the author and fixes the count', undo.trusted && undo.after === undo.before - 1 && undo.state === '', `@${undo.handle}, ${undo.before} → ${undo.after}`);

  // Optional: E2E_FRAMES=1 records the morph in slow motion for a preview.
  if (process.env.E2E_FRAMES) {
    const dir = join(OUT, 'morph');
    mkdirSync(dir, { recursive: true });
    await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('sf-mock-storage')); s.settings.corner = 'br'; localStorage.setItem('sf-mock-storage', JSON.stringify(s)); })()`);
    await send('Page.navigate', { url: 'https://mock.test/test/mock-x.html?slowmo=6&demo' }, page);
    await waitFor(`!!document.getElementById('slopfilter-root')?.shadowRoot?.querySelector('.cap')`);
    await sleep(800);
    let n = 0;
    const frames = [];
    listeners.push(async (msg) => {
      if (msg.method !== 'Page.screencastFrame' || msg.sessionId !== page) return;
      const file = join(dir, `f${String(n++).padStart(4, '0')}.jpg`);
      writeFileSync(file, Buffer.from(msg.params.data, 'base64'));
      frames.push({ file, t: msg.params.metadata.timestamp });
      send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }, page);
    });
    await send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 }, page);
    await sleep(500);
    await evaluate(`document.getElementById('slopfilter-root').shadowRoot.querySelector('.cap').click()`);
    await sleep(5200);
    await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))`);
    await sleep(4800);
    await send('Page.stopScreencast', {}, page);
    writeFileSync(join(dir, 'frames.json'), JSON.stringify(frames));
    console.log(`  recorded ${frames.length} morph frames → ${dir}`);
  }

  const ok = results.every((r) => r.ok) && !problems.length;
  for (const p of problems) console.log(`! ${p}`);
  console.log(ok ? '\nall e2e checks passed' : '\nsome e2e checks failed');
  console.log(`screenshots: ${OUT}`);
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error(err);
  for (const p of problems) console.log(`! ${p}`);
  await shot('fail.png').catch(() => {});
  if (process.env.E2E_DEBUG && stderr) console.error(stderr.split('\n').slice(-30).join('\n'));
  process.exitCode = 1;
} finally {
  chrome.kill();
  server.close();
}
