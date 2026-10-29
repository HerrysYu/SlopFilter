// SlopFilter service worker: calls Jev, caches verdicts, keeps the stats.
if (typeof importScripts === 'function') importScripts('shared.js', 'prompt.js');

(() => {
  'use strict';

  const API = 'https://api.typesafe.ai';
  const MAX_IN_FLIGHT = 6;
  const CACHE_MAX = 4000;
  const RECENT_MAX = 40;
  const COUNTED_MAX = 3000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = chrome.storage.local;

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  // Storage writes that read-modify-write go through one queue,
  // so several tabs reporting at once can't lose updates.
  let lock = Promise.resolve();
  const serial = (fn) => {
    const run = lock.then(fn);
    lock = run.catch(() => {});
    return run;
  };

  async function getSettings() {
    const { settings } = await store.get('settings');
    return { ...SF.DEFAULT_SETTINGS, ...settings };
  }

  // ---------- Jev HTTP ----------

  class JevError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  async function jevFetch(path, key, init = {}) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(API + path, {
          ...init,
          headers: {
            Authorization: `Bearer ${key}`,
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          },
          signal: AbortSignal.timeout(20000),
        });
      } catch (err) {
        if (attempt < 2) {
          await sleep(600 * 2 ** attempt);
          continue;
        }
        throw new JevError(0, err?.name === 'TimeoutError' ? '请求超时' : '网络错误，连不上 api.typesafe.ai');
      }
      if (res.ok) return res.json();

      // 429 rate limit, 529 overloaded, other 5xx: back off and retry twice.
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        const after = Number(res.headers.get('retry-after'));
        await sleep(after > 0 ? Math.min(after * 1000, 8000) : Math.min(500 * 2 ** attempt, 5000));
        continue;
      }
      let detail = '';
      try {
        const body = await res.json();
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body);
      } catch {}
      throw new JevError(res.status, detail.slice(0, 160) || res.statusText);
    }
  }

  function describe(err) {
    const s = err?.status;
    if (s === 401 || s === 403) return { state: 'invalid', message: `Key 无效（${s}），请检查后重新填写` };
    if (s === 429) return { state: 'error', message: '请求太频繁（429），稍后会自动恢复' };
    if (s === 529) return { state: 'error', message: 'Jev 服务繁忙（529），稍后会自动恢复' };
    if (s === 400 || s === 422) return { state: 'error', message: `请求被拒绝（${s}）：${err.message}` };
    if (s) return { state: 'error', message: `Jev 返回错误（${s}）` };
    return { state: 'error', message: err?.message || '未知错误' };
  }

  let lastStatus = '';
  async function setStatus(status) {
    const sig = JSON.stringify(status);
    if (sig === lastStatus) return;
    lastStatus = sig;
    await store.set({ jevStatus: { ...status, at: Date.now() } });
  }

  // ---------- verdict cache (survives worker restarts, not browser restarts) ----------

  const cache = new Map();
  let cacheReady = null;
  let flushTimer = 0;

  const loadCache = () =>
    (cacheReady ??= chrome.storage.session
      .get('verdicts')
      .then(({ verdicts }) => {
        for (const [k, v] of Object.entries(verdicts || {})) cache.set(k, v);
      })
      .catch(() => {}));

  function remember(key, verdict) {
    cache.set(key, verdict);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => chrome.storage.session.set({ verdicts: Object.fromEntries(cache) }).catch(() => {}), 2000);
  }

  // ---------- classification ----------

  const inflight = new Map();
  const waiting = [];
  let active = 0;

  function limited(task) {
    return new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject });
      pump();
    });
  }

  function pump() {
    while (active < MAX_IN_FLIGHT && waiting.length) {
      const { task, resolve, reject } = waiting.shift();
      active++;
      task()
        .then(resolve, reject)
        .finally(() => {
          active--;
          pump();
        });
    }
  }

  let usagePending = { tokens: 0, calls: 0 };
  let usageTimer = 0;
  function addUsage(usage) {
    usagePending.tokens += Number(usage?.input_tokens) || 0;
    usagePending.calls += 1;
    clearTimeout(usageTimer);
    usageTimer = setTimeout(() => {
      const add = usagePending;
      usagePending = { tokens: 0, calls: 0 };
      serial(async () => {
        const { usage = { tokens: 0, calls: 0 } } = await store.get('usage');
        await store.set({ usage: { tokens: usage.tokens + add.tokens, calls: usage.calls + add.calls } });
      });
    }, 3000);
  }

  async function classify(tweet) {
    const [{ jevKey, jevStatus }, settings] = await Promise.all([store.get(['jevKey', 'jevStatus']), getSettings()]);
    if (!jevKey) return { source: 'local' };
    if (jevStatus?.state === 'invalid') return { source: 'local' };

    await loadCache();
    const key = `${SlopPrompt.VERSION}|${settings.model}|${tweet.id}`;
    if (cache.has(key)) return cache.get(key);
    if (inflight.has(key)) return inflight.get(key);

    const job = limited(() =>
      jevFetch('/v1/systemone', jevKey, {
        method: 'POST',
        body: JSON.stringify(SlopPrompt.build(tweet, settings.model)),
      }),
    )
      .then((json) => {
        const verdict = { source: 'jev', ...SlopPrompt.read(json) };
        remember(key, verdict);
        addUsage(json.usage);
        setStatus({ state: 'ok', model: verdict.model || settings.model });
        return verdict;
      })
      .catch((err) => {
        setStatus(describe(err));
        return { source: 'local', error: true };
      })
      .finally(() => inflight.delete(key));

    inflight.set(key, job);
    return job;
  }

  // ---------- key ----------

  async function saveKey(raw) {
    const key = String(raw || '').trim();
    if (!key) {
      await store.remove('jevKey');
      await store.set({ keyHint: '' });
      await setStatus({ state: 'none' });
      return { state: 'none' };
    }
    await store.set({ jevKey: key, keyHint: `${key.slice(0, 3)}••••${key.slice(-4)}` });
    await setStatus({ state: 'checking' });
    try {
      // Lists models without sending any post text: a cheap way to test the key.
      const json = await jevFetch('/v1/models', key);
      const settings = await getSettings();
      const names = (json.models || []).map((m) => m.name);
      const status = { state: 'ok', model: settings.model, models: names.slice(0, 12) };
      await setStatus(status);
      return status;
    } catch (err) {
      const status = describe(err);
      await setStatus(status);
      return status;
    }
  }

  // ---------- stats ----------

  function recordBlocked(item) {
    return serial(async () => {
      const { stats = {}, recent = [], counted = [] } = await store.get(['stats', 'recent', 'counted']);
      if (counted.includes(item.id)) return;
      const day = todayKey();
      counted.push(item.id);
      if (counted.length > COUNTED_MAX) counted.splice(0, counted.length - COUNTED_MAX);
      recent.unshift({ ...item, ts: Date.now() });
      if (recent.length > RECENT_MAX) recent.length = RECENT_MAX;
      await store.set({
        stats: { total: (stats.total || 0) + 1, day, today: (stats.day === day ? stats.today || 0 : 0) + 1 },
        recent,
        counted,
      });
    });
  }

  // "误判": trust the author, take their posts out of the list and the count.
  function unblock({ id, handle }) {
    return serial(async () => {
      const data = await store.get(['stats', 'recent', 'counted', 'settings']);
      const settings = { ...SF.DEFAULT_SETTINGS, ...data.settings };
      const who = String(handle || '').toLowerCase();
      if (who && !settings.trusted.includes(who)) settings.trusted = [...settings.trusted, who];

      const recent = data.recent || [];
      const removed = recent.filter((r) => r.id === id || (who && String(r.handle).toLowerCase() === who));
      const counted = (data.counted || []).filter((c) => !removed.some((r) => r.id === c) && c !== id);
      const dropped = (data.counted || []).length - counted.length;

      const stats = { ...data.stats };
      const day = todayKey();
      stats.total = Math.max(0, (stats.total || 0) - dropped);
      stats.today = stats.day === day ? Math.max(0, (stats.today || 0) - dropped) : 0;
      stats.day = day;

      await store.set({ settings, stats, counted, recent: recent.filter((r) => !removed.includes(r)) });
    });
  }

  function patchSettings(patch) {
    return serial(async () => {
      const settings = { ...(await getSettings()), ...patch };
      await store.set({ settings });
      return settings;
    });
  }

  function resetStats() {
    return serial(() => store.set({ stats: { total: 0, today: 0, day: todayKey() }, recent: [], counted: [], usage: { tokens: 0, calls: 0 } }));
  }

  async function setBadge(tabId, count) {
    if (tabId == null) return;
    const text = count > 999 ? '999+' : count > 0 ? String(count) : '';
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#1C1C1E' });
    await chrome.action.setBadgeTextColor?.({ tabId, color: '#FFFFFF' });
    await chrome.action.setBadgeText({ tabId, text });
  }

  // ---------- wiring ----------

  chrome.runtime.onInstalled.addListener(async () => {
    const { settings, jevStatus } = await store.get(['settings', 'jevStatus']);
    await store.set({ settings: { ...SF.DEFAULT_SETTINGS, ...settings } });
    if (!jevStatus) await store.set({ jevStatus: { state: 'none' } });
  });

  const handlers = {
    'sf:classify': (msg) => classify(msg.tweet),
    'sf:blocked': (msg) => recordBlocked(msg.item),
    'sf:unblock': (msg) => unblock(msg.item),
    'sf:key': (msg) => saveKey(msg.key),
    'sf:settings': (msg) => patchSettings(msg.patch),
    'sf:reset': () => resetStats(),
    'sf:badge': (msg, sender) => setBadge(sender.tab?.id, msg.count),
  };

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    const handler = handlers[msg?.type];
    if (!handler) return false;
    Promise.resolve()
      .then(() => handler(msg, sender))
      .then((result) => reply(result ?? null), (err) => reply({ error: String(err?.message || err) }));
    return true;
  });

  // Toolbar icon: open or close the panel on X, otherwise go to X.
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'sf:toggle' });
    } catch {
      await chrome.tabs.create({ url: 'https://x.com/home' });
    }
  });
})();
