// Scans the X timeline, asks the background worker for Jev verdicts and
// collapses (or hides) posts that read as AI slop.
(() => {
  'use strict';
  if (window.__slopFilter) return;
  window.__slopFilter = true;

  const SEL = {
    article: 'article[data-testid="tweet"]',
    text: '[data-testid="tweetText"]',
    user: '[data-testid="User-Name"]',
    cell: '[data-testid="cellInnerDiv"]',
    media: '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"]',
    verified: '[data-testid="icon-verified"]',
    account: '[data-testid="SideNav_AccountSwitcher_Button"]',
  };
  const REPLY_HINT = /^(?:Replying to|回复|回覆|返信先|En respuesta a|En réponse à|Antwort an|In risposta a|Em resposta a|Ответ)/;
  const RECORDS_MAX = 5000;

  const DEFAULT_STATE = () => ({
    settings: { ...SF.DEFAULT_SETTINGS },
    stats: { total: 0, today: 0, day: '' },
    recent: [],
    jevStatus: { state: 'none' },
    keyHint: '',
    usage: { tokens: 0, calls: 0 },
  });
  const state = DEFAULT_STATE();
  const KEYS = Object.keys(state);

  const records = new Map(); // tweet id -> what we know about it
  const counted = new Set(); // blocked in this tab
  const revealed = new Set(); // opened by the user
  let scanned = 0;
  let ownHandle = '';
  let theme = '';
  let alive = true;

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const pct = (x) => `${Math.round(x * 100)}%`;

  async function send(msg) {
    if (!alive) return null;
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch {
      if (!chrome.runtime?.id) teardown(); // extension was reloaded or removed
      return null;
    }
  }

  // ---------- UI ----------

  const ui = SlopUI.mount({
    onSettings: (patch) => send({ type: 'sf:settings', patch }),
    onKey: (key) => send({ type: 'sf:key', key }),
    onUnblock: (item) => {
      const who = String(item.handle || '').toLowerCase();
      if (who && !state.settings.trusted.includes(who)) state.settings.trusted = [...state.settings.trusted, who];
      for (const [id, rec] of records) if (id === item.id || rec.handle.toLowerCase() === who) counted.delete(id);
      repaintAll();
      send({ type: 'sf:badge', count: counted.size });
      render();
      return send({ type: 'sf:unblock', item });
    },
    onLocate: locate,
    onReset: () => send({ type: 'sf:reset' }),
    onResetTrusted: () => send({ type: 'sf:settings', patch: { trusted: [] } }),
  });

  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!alive) return;
      const day = todayKey();
      ui.update({
        ...state,
        total: state.stats?.total || 0,
        today: state.stats?.day === day ? state.stats.today || 0 : 0,
        session: counted.size,
        scanned,
      });
    });
  }

  // ---------- reading posts from X's DOM ----------

  // innerText drops emoji, which X renders as <img alt="🚀">.
  function readText(el) {
    let out = '';
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue;
        else if (n.nodeType === Node.ELEMENT_NODE) {
          if (n.tagName === 'IMG') out += n.getAttribute('alt') || '';
          else if (n.tagName === 'BR') out += '\n';
          else walk(n);
        }
      }
    };
    walk(el);
    return out.replace(/ /g, ' ').trim();
  }

  function tweetId(article) {
    const link = article.querySelector(`${SEL.user} a[href*="/status/"]`) || article.querySelector('a[href*="/status/"] time')?.closest('a');
    return link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1] || null;
  }

  // Blue = paid Premium, gold = organization, gray = government.
  function badgeOf(user) {
    const svg = user?.querySelector(SEL.verified);
    if (!svg) return '';
    if (svg.querySelector('linearGradient')) return 'gold';
    const [r, , b] = (getComputedStyle(svg).color.match(/\d+/g) || []).map(Number);
    if (!(r >= 0)) return 'blue';
    return b > r + 60 ? 'blue' : 'gray';
  }

  // Reply farms paste the same sentence under many posts.
  const seenTexts = new Map(); // normalized text -> ids of posts that used it
  function dupesOf(id, text) {
    const key = text.toLowerCase().replace(/https?:\/\/\S+|@\w+|[\s\p{P}\p{S}]/gu, '');
    if ([...key].length < 10) return 0;
    const ids = seenTexts.get(key) || new Set();
    ids.add(id);
    seenTexts.set(key, ids);
    if (seenTexts.size > RECORDS_MAX) seenTexts.delete(seenTexts.keys().next().value);
    return ids.size - 1;
  }

  function readOwnHandle() {
    const t = document.querySelector(SEL.account)?.textContent || '';
    return t.match(/@([A-Za-z0-9_]{1,15})/)?.[1]?.toLowerCase() || '';
  }

  // On a /status/ page, the post in the URL is what the replies below it answer.
  function readFocal() {
    const id = location.pathname.match(/\/status\/(\d+)/)?.[1];
    if (!id) return null;
    const article = [...document.querySelectorAll(SEL.article)].find((a) => tweetId(a) === id);
    if (!article) return null;
    const text = article.querySelector(SEL.text);
    return { id, article, text: text ? readText(text) : '' };
  }

  function extract(article, id, focal) {
    const texts = [...article.querySelectorAll(SEL.text)];
    const quoteCard = texts.map((el) => el.closest('div[role="link"]')).find((c) => c && article.contains(c)) || null;
    const main = texts.find((el) => !quoteCard || !quoteCard.contains(el));
    const quote = quoteCard ? texts.find((el) => quoteCard.contains(el)) : null;

    const user = article.querySelector(SEL.user);
    const handle = (user?.textContent || '').match(/@([A-Za-z0-9_]{1,15})/)?.[1] || '';
    const name = user ? readText(user.querySelector('a') || user).split('@')[0].trim() : '';

    let isReply = [...article.querySelectorAll('div')].some(
      (el) => !el.closest(SEL.text) && el.childElementCount <= 3 && el.textContent.length < 120 && el.textContent.includes('@') && REPLY_HINT.test(el.textContent.trim()),
    );
    let parentText = '';
    if (focal && focal.id !== id && focal.article.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING) {
      isReply = true;
      parentText = focal.text;
    }

    return {
      id,
      text: main ? readText(main) : '',
      lang: main?.getAttribute('lang') || '',
      isReply,
      parentText,
      quoteText: quote ? readText(quote) : '',
      handle,
      name,
      verified: !!user?.querySelector(SEL.verified),
      badge: badgeOf(user),
      hasMedia: !!article.querySelector(SEL.media),
    };
  }

  // ---------- deciding ----------

  const isTrusted = (handle) => !!handle && state.settings.trusted.includes(handle.toLowerCase());

  function barFor(rec) {
    const base = SF.THRESHOLDS[state.settings.sensitivity] ?? SF.THRESHOLDS.balanced;
    const bar = rec.remote ? base : Math.max(base, SF.LOCAL_ONLY_MIN);
    return state.settings.blueStrict && rec.badge === 'blue' ? bar - SF.BLUE_STRICT : bar;
  }

  function analyze(article, id, focal) {
    const t = extract(article, id, focal);
    const rec = { id, handle: t.handle, name: t.name, badge: t.badge, text: t.text, local: null, remote: null, final: 0, pending: false, skip: false };
    if (!t.text || (ownHandle && t.handle.toLowerCase() === ownHandle)) {
      rec.skip = true;
      return rec;
    }
    scanned++;
    rec.local = SlopHeuristics.analyze(t.text, { isReply: t.isReply, parentText: t.parentText, badge: t.badge, name: t.name, dupes: dupesOf(id, t.text) });
    rec.final = rec.local.score;
    rec.payload = { ...t, tells: rec.local.tells.map((x) => x.en), humanTells: rec.local.human.map((x) => x.en) };
    if (rec.local.query) ask(rec);
    return rec;
  }

  function ask(rec) {
    if (!state.settings.enabled || !state.keyHint || isTrusted(rec.handle)) return;
    rec.pending = true;
    send({ type: 'sf:classify', tweet: rec.payload }).then((verdict) => {
      rec.pending = false;
      if (verdict?.source === 'jev') {
        rec.remote = verdict;
        rec.final = SF.blend(rec.local, verdict);
      }
      repaintId(rec.id);
    });
  }

  // Posts seen while there was no key (or Jev was down) get a second look.
  function askAgain() {
    for (const article of document.querySelectorAll('article[data-sf-id]')) {
      const rec = records.get(article.dataset.sfId);
      if (rec && !rec.skip && !rec.remote && !rec.pending && rec.local?.query) ask(rec);
    }
  }

  function shouldBlock(rec) {
    if (!state.settings.enabled || rec.skip || !rec.local || revealed.has(rec.id) || isTrusted(rec.handle)) return false;
    if (rec.pending && !rec.local.hard) return false; // wait for Jev rather than flicker
    return rec.final >= barFor(rec);
  }

  function labelOf(rec) {
    const strongest = rec.local?.tells.reduce((a, b) => (b.w > (a?.w ?? 0) ? b : a), null);
    return SF.KIND_LABELS[rec.remote?.kind] || strongest?.zh || 'AI 生成';
  }

  // ---------- painting ----------

  function setData(el, key, value) {
    if (value == null) {
      if (key in el.dataset) delete el.dataset[key];
    } else if (el.dataset[key] !== value) {
      el.dataset[key] = value;
    }
  }

  function paint(article, rec) {
    const blocked = shouldBlock(rec);
    const cell = article.closest(SEL.cell) || article;
    setData(cell, 'sfHide', blocked && state.settings.action === 'hide' ? '1' : null);
    if (blocked) {
      setData(article, 'sfState', 'blocked');
      setData(article, 'sfLabel', `${labelOf(rec)} · @${rec.handle}`);
      setData(article, 'sfPct', pct(rec.final));
      if (!counted.has(rec.id)) {
        counted.add(rec.id);
        report(rec);
      }
    } else if (revealed.has(rec.id) && counted.has(rec.id)) {
      setData(article, 'sfState', 'revealed');
      setData(article, 'sfPct', pct(rec.final));
    } else {
      setData(article, 'sfState', null);
      setData(article, 'sfLabel', null);
      setData(article, 'sfPct', null);
    }
  }

  function clearPaint(article) {
    for (const key of ['sfState', 'sfLabel', 'sfPct']) setData(article, key, null);
    setData(article.closest(SEL.cell) || article, 'sfHide', null);
  }

  function repaintId(id) {
    const rec = records.get(id);
    if (!rec) return;
    for (const article of document.querySelectorAll(`article[data-sf-id="${id}"]`)) paint(article, rec);
  }

  function repaintAll() {
    for (const article of document.querySelectorAll('article[data-sf-id]')) {
      const rec = records.get(article.dataset.sfId);
      if (rec) paint(article, rec);
    }
  }

  function report(rec) {
    send({
      type: 'sf:blocked',
      item: {
        id: rec.id,
        handle: rec.handle,
        name: rec.name,
        text: rec.text.replace(/\s+/g, ' ').slice(0, 140),
        score: Math.round(rec.final * 100) / 100,
        kind: rec.remote?.kind || null,
        label: labelOf(rec),
      },
    });
    send({ type: 'sf:badge', count: counted.size });
    render();
  }

  // ---------- scanning ----------

  function syncTheme() {
    const [r, g, b, a = 1] = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
    const next = a < 0.5 ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? 'dark' : 'light';
    if (next === theme) return;
    theme = next;
    document.documentElement.dataset.sfTheme = next;
    ui.setTheme(next);
  }

  function scan() {
    if (!alive) return;
    if (!chrome.runtime?.id) return teardown();
    syncTheme();
    ownHandle ||= readOwnHandle();
    const focal = readFocal();
    const before = scanned;
    for (const article of document.querySelectorAll(SEL.article)) {
      const id = tweetId(article);
      if (!id) continue;
      if (article.dataset.sfId !== id) {
        clearPaint(article); // X can reuse an element for a different post
        article.dataset.sfId = id;
      }
      let rec = records.get(id);
      if (!rec) {
        rec = analyze(article, id, focal);
        records.set(id, rec);
        if (records.size > RECORDS_MAX) records.delete(records.keys().next().value);
      }
      paint(article, rec);
    }
    if (scanned !== before) render();
  }

  let scanTimer = 0;
  let lastScan = 0;
  function scheduleScan() {
    if (scanTimer || !alive) return;
    const wait = Math.max(0, 120 - (performance.now() - lastScan));
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      lastScan = performance.now();
      scan();
    }, wait);
  }
  const observer = new MutationObserver(scheduleScan);
  // X switches themes by restyling <html>/<body>, not by inserting nodes.
  const themeObserver = new MutationObserver(() => alive && syncTheme());

  // ---------- user actions on the page ----------

  function reveal(id) {
    revealed.add(id);
    repaintId(id);
  }

  // A collapsed post opens on click or Enter instead of navigating.
  function onActivate(e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    const article = e.target instanceof Element ? e.target.closest('article[data-sf-state="blocked"]') : null;
    if (!article) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    reveal(article.dataset.sfId);
  }
  document.addEventListener('click', onActivate, true);
  document.addEventListener('keydown', onActivate, true);

  function locate(item) {
    if (!/^\d+$/.test(String(item.id))) return;
    const article = document.querySelector(`article[data-sf-id="${item.id}"]`);
    if (article) {
      reveal(item.id);
      ui.close();
      article.scrollIntoView({ behavior: 'smooth', block: 'center' });
      article.animate([{ boxShadow: 'inset 0 0 0 2px rgba(10, 132, 255, 0.55)' }, { boxShadow: 'inset 0 0 0 2px rgba(10, 132, 255, 0)' }], { duration: 1800, easing: 'ease-out' });
      return;
    }
    const handle = /^\w{1,15}$/.test(item.handle) ? item.handle : 'i';
    window.open(`https://x.com/${handle}/status/${item.id}`, '_blank', 'noopener');
  }

  // ---------- storage sync ----------

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !alive) return;
    const fresh = DEFAULT_STATE();
    for (const k of KEYS) {
      if (!(k in changes)) continue;
      const v = changes[k].newValue;
      state[k] = k === 'settings' ? { ...SF.DEFAULT_SETTINGS, ...v } : v ?? fresh[k];
    }
    if ((changes.stats?.newValue?.total ?? 0) > (changes.stats?.oldValue?.total ?? 0)) ui.pulse();
    const nowOk = changes.jevStatus?.newValue?.state === 'ok' && changes.jevStatus?.oldValue?.state !== 'ok';
    const nowOn = changes.settings?.newValue?.enabled && !changes.settings?.oldValue?.enabled;
    if (nowOk || nowOn) askAgain();
    if (changes.settings) repaintAll();
    render();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== 'sf:toggle') return false;
    ui.toggle();
    reply({ ok: true });
    return false;
  });

  function teardown() {
    if (!alive) return;
    alive = false;
    observer.disconnect();
    themeObserver.disconnect();
    clearTimeout(scanTimer);
    document.removeEventListener('click', onActivate, true);
    document.removeEventListener('keydown', onActivate, true);
    for (const el of document.querySelectorAll('[data-sf-state], [data-sf-hide], [data-sf-id]')) {
      for (const key of ['sfState', 'sfHide', 'sfLabel', 'sfPct', 'sfId']) delete el.dataset[key];
    }
    ui.destroy();
  }

  chrome.storage.local.get(KEYS).then((data) => {
    for (const k of KEYS) if (data[k] !== undefined) state[k] = data[k];
    state.settings = { ...SF.DEFAULT_SETTINGS, ...data.settings };
    render();
    observer.observe(document.body, { childList: true, subtree: true });
    for (const el of [document.documentElement, document.body]) themeObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    scan();
  });
})();
