// A tiny stand-in for the chrome.* APIs plus a fake Jev endpoint, so the real
// background and content scripts can run together on a plain web page.
import { fakeJev } from './fake-jev.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export function installChrome({ samples, onLog = () => {}, onBadge = () => {} }) {
  const jev = fakeJev(samples);
  const shim = {
    context: 'content',
    get calls() {
      return jev.calls;
    },
    get lastRequest() {
      return jev.lastRequest;
    },
    get requests() {
      return jev.requests;
    },
  };
  const listeners = { background: [], content: [] };
  const changeListeners = [];
  const clicked = [];

  function area(name, data, persistKey) {
    const emit = (changes) => setTimeout(() => changeListeners.forEach((fn) => fn(changes, name)), 0);
    const save = () => persistKey && localStorage.setItem(persistKey, JSON.stringify(data));
    return {
      async get(keys) {
        if (keys == null) return clone(data);
        const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const out = {};
        for (const k of list) {
          if (k in data) out[k] = clone(data[k]);
          else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[k] = keys[k];
        }
        return out;
      },
      async set(items) {
        const changes = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: clone(data[k]), newValue: clone(v) };
          data[k] = clone(v);
        }
        save();
        emit(changes);
      },
      async remove(keys) {
        const changes = {};
        for (const k of [].concat(keys)) {
          if (!(k in data)) continue;
          changes[k] = { oldValue: clone(data[k]) };
          delete data[k];
        }
        save();
        emit(changes);
      },
    };
  }

  const persisted = JSON.parse(localStorage.getItem('sf-mock-storage') || '{}');

  function dispatch(target, msg, sender) {
    return new Promise((resolve, reject) => {
      const fns = listeners[target];
      if (!fns.length) return reject(new Error('Could not establish connection. Receiving end does not exist.'));
      let waiting = false;
      let done = false;
      const reply = (v) => {
        if (!done) {
          done = true;
          resolve(clone(v));
        }
      };
      for (const fn of fns) if (fn(clone(msg), sender, reply) === true) waiting = true;
      if (!waiting && !done) resolve(undefined);
    });
  }

  window.chrome = {
    runtime: {
      id: 'mock-extension',
      sendMessage: (msg) => dispatch('background', msg, { tab: { id: 1 } }),
      onMessage: { addListener: (fn) => listeners[shim.context].push(fn) },
      onInstalled: { addListener: (fn) => setTimeout(() => fn({ reason: 'install' }), 0) },
    },
    storage: {
      local: area('local', persisted, 'sf-mock-storage'),
      session: area('session', {}, null),
      onChanged: { addListener: (fn) => changeListeners.push(fn) },
    },
    tabs: {
      sendMessage: (_tabId, msg) => dispatch('content', msg, {}),
      create: async ({ url }) => onLog(`tabs.create → ${url}`),
    },
    action: {
      setBadgeText: async ({ text }) => onBadge(text),
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {},
      onClicked: { addListener: (fn) => clicked.push(fn) },
    },
  };
  shim.clickAction = () => clicked.forEach((fn) => fn({ id: 1, url: location.href }));

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('https://api.typesafe.ai/')) return realFetch(input, init);
    await sleep(250 + Math.random() * 650);
    const res = jev.handle({
      method: init.method || 'GET',
      path: new URL(url).pathname,
      key: (new Headers(init.headers).get('authorization') || '').replace(/^Bearer\s+/i, ''),
      body: init.body ? JSON.parse(init.body) : null,
    });
    if (res.sample || res.status === 200) onLog(`${res.status} ${new URL(url).pathname}${res.sample ? ` · ${res.sample.jev}` : ''}`);
    return new Response(JSON.stringify(res.json), { status: res.status, headers: { 'content-type': 'application/json' } });
  };

  return shim;
}
