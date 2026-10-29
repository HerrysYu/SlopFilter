// The floating capsule and the panel it turns into.
// One glass "shell" changes width, height and corner radius on three
// independent high-damping springs; the capsule face and the panel face
// cross-fade on top of it as pure functions of the shell's current size, so
// the morph can be reversed at any moment without a seam.
const SlopUI = (() => {
  'use strict';

  const { Spring, loop, easing } = SlopSpring;

  const CAP_H = 40;
  const PANEL_W = 360;
  const PANEL_R = 30;
  const SHAPE = 1.6; // superellipse k at full size: 1 is a circular arc, 2 a squircle
  const INSET = { side: 20, top: 72, bottom: 84 }; // clears X's search bar and DM drawer
  const EDGE = 12;

  // Open: width leads, height follows. Close: height leads, so the panel
  // folds down into a pill instead of thinning into a tall bar.
  const OPEN = { w: { response: 0.42, damping: 0.86 }, h: { response: 0.5, damping: 0.88 }, r: { response: 0.36, damping: 1 } };
  const CLOSE = { w: { response: 0.42, damping: 0.94 }, h: { response: 0.34, damping: 0.96 }, r: { response: 0.3, damping: 1 } };
  const PRESS = { response: 0.18, damping: 1 };
  const RELEASE = { response: 0.4, damping: 0.72 };
  const THROW = { response: 0.48, damping: 0.8 }; // momentum-driven, so a little give is allowed

  const supportsShape = typeof CSS !== 'undefined' && CSS.supports('corner-shape', 'superellipse(1.5)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = easing({ response: 0.42, damping: 0.86 });

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const smooth = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n || 0));

  // ---------- markup helpers ----------

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  // Static, trusted SVG only.
  function svg(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstElementChild;
  }

  // A four-point sparkle (the usual "AI" mark) with a slash through it.
  const glyph = (id) =>
    svg(`<svg viewBox="0 0 20 20" aria-hidden="true">
      <defs><mask id="${id}"><rect width="20" height="20" fill="#fff"/><path d="M3.4 16.6 16.6 3.4" stroke="#000" stroke-width="4.4" stroke-linecap="round"/></mask></defs>
      <path mask="url(#${id})" fill="currentColor" d="M10 1.6c1.2 4 4.4 7.2 8.4 8.4-4 1.2-7.2 4.4-8.4 8.4-1.2-4-4.4-7.2-8.4-8.4 4-1.2 7.2-4.4 8.4-8.4Z"/>
      <path class="slash" d="M3.4 16.6 16.6 3.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" pathLength="1"/>
    </svg>`);

  const ICON_CLOSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5 9 9M9 4v5H4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const CSS_TEXT = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.shell {
  --side: ${INSET.side}px; --top: ${INSET.top}px; --bottom: ${INSET.bottom}px;
  --text: #111113;
  --text-2: rgba(60, 60, 67, 0.74);
  --text-3: rgba(60, 60, 67, 0.5);
  --surface: rgba(255, 255, 255, 0.78);
  --solid: #ffffff;
  --fill: rgba(118, 118, 128, 0.13);
  --fill-2: rgba(118, 118, 128, 0.08);
  --edge: rgba(0, 0, 0, 0.08);
  --shine: rgba(255, 255, 255, 0.7);
  --shadow: rgba(16, 16, 24, 0.18);
  --shadow-near: rgba(16, 16, 24, 0.08);
  --thumb: #ffffff;
  --focus: #0a84ff;
  --ok: #2fb553; --warn: #f2a20c; --bad: #ef4444; --off: #a1a1aa;
  --dot: var(--warn);
  --p: 0;
  position: fixed;
  z-index: 2147483000;
  width: 132px; height: ${CAP_H}px; border-radius: ${CAP_H / 2}px;
  overflow: hidden;
  isolation: isolate;
  pointer-events: none;
  color: var(--text);
  background: var(--surface);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  backdrop-filter: blur(22px) saturate(180%);
  box-shadow:
    inset 0 0.5px 0 var(--shine),
    inset 0 0 0 0.5px var(--edge),
    0 calc(6px + var(--p) * 18px) calc(18px + var(--p) * 44px) calc(var(--p) * -12px) var(--shadow),
    0 1px 2px var(--shadow-near);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  will-change: transform;
}
.shell[data-theme="dark"] {
  --text: #f4f4f5;
  --text-2: rgba(235, 235, 245, 0.68);
  --text-3: rgba(235, 235, 245, 0.42);
  --surface: rgba(30, 30, 33, 0.74);
  --solid: #1c1c1f;
  --fill: rgba(118, 118, 128, 0.28);
  --fill-2: rgba(118, 118, 128, 0.17);
  --edge: rgba(255, 255, 255, 0.1);
  --shine: rgba(255, 255, 255, 0.09);
  --shadow: rgba(0, 0, 0, 0.55);
  --shadow-near: rgba(0, 0, 0, 0.3);
  --thumb: #636366;
  --ok: #32d74b;
}
.shell[data-status="ok"] { --dot: var(--ok); }
.shell[data-status="bad"] { --dot: var(--bad); }
.shell[data-status="paused"] { --dot: var(--off); }
.shell:has(.cap:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }

.shell[data-corner="br"] { right: var(--side); bottom: var(--bottom); }
.shell[data-corner="bl"] { left: var(--side); bottom: var(--bottom); }
.shell[data-corner="tr"] { right: var(--side); top: var(--top); }
.shell[data-corner="tl"] { left: var(--side); top: var(--top); }

/* Both faces are pinned to the corner the shell grows out of. */
.face { position: absolute; }
.shell[data-corner$="r"] .face { right: 0; }
.shell[data-corner$="l"] .face { left: 0; }
.shell[data-corner^="b"] .face { bottom: 0; }
.shell[data-corner^="t"] .face { top: 0; }
.shell[data-corner="br"] .face { transform-origin: 100% 100%; }
.shell[data-corner="bl"] .face { transform-origin: 0 100%; }
.shell[data-corner="tr"] .face { transform-origin: 100% 0; }
.shell[data-corner="tl"] .face { transform-origin: 0 0; }

button { font: inherit; color: inherit; }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

/* ---------- capsule ---------- */
.cap {
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 8px;
  height: ${CAP_H}px; margin: 0; padding: 0 15px 0 6px;
  border: 0; background: none;
  white-space: nowrap; cursor: pointer;
  touch-action: none; user-select: none; -webkit-user-select: none;
}
.cap:focus-visible { outline: none; }
.shell[data-open] .cap { pointer-events: none; }
.shell[data-dragging] .cap { cursor: grabbing; }
.glyph {
  position: relative; flex: none;
  display: grid; place-items: center;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--fill);
}
.glyph svg { width: 16px; height: 16px; }
.glyph .dot {
  position: absolute; top: 0; right: 0;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--dot);
  box-shadow: 0 0 0 2px var(--solid);
  transition: background-color 0.3s;
}
.shell[data-status="checking"] .dot { animation: sf-blink 1.1s ease-in-out infinite; }
@keyframes sf-blink { 50% { opacity: 0.35; } }
.cap-label { font-size: 13px; color: var(--text-2); }
.cap-count { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }

/* rolling digits */
.num { display: inline-flex; font-variant-numeric: tabular-nums; }
.dg { position: relative; display: inline-block; }
.dg > span { display: inline-block; }
.dg > .ghost { position: absolute; left: 0; top: 0; }

/* ---------- panel ---------- */
.panel {
  display: flex; flex-direction: column; gap: 14px;
  width: ${PANEL_W}px;
  padding: 16px;
  overflow: hidden auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  pointer-events: none;
  outline: none;
}
.shell[data-open] .panel { pointer-events: auto; }

.head { display: flex; align-items: center; gap: 10px; }
.mark {
  flex: none; display: grid; place-items: center;
  width: 34px; height: 34px; border-radius: 12px;
  background: var(--text); color: var(--solid);
}
.mark svg { width: 18px; height: 18px; }
.titles { flex: 1; min-width: 0; }
.title { font-size: 15px; line-height: 1.25; font-weight: 600; letter-spacing: -0.01em; }
.sub { font-size: 12px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.close {
  flex: none; display: grid; place-items: center;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%;
  background: var(--fill-2); color: var(--text-2); cursor: pointer;
}
.close:hover { color: var(--text); background: var(--fill); }
.close svg { width: 12px; height: 12px; }
.shell[data-corner="bl"] .close svg { transform: scaleX(-1); }
.shell[data-corner="tr"] .close svg { transform: scaleY(-1); }
.shell[data-corner="tl"] .close svg { transform: scale(-1, -1); }

.hero { display: flex; align-items: baseline; gap: 8px; padding: 2px 2px 0; }
.hero .num { font-size: 46px; line-height: 1; font-weight: 650; letter-spacing: -0.04em; }
.hero-label { font-size: 13px; color: var(--text-2); }

.chips { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.chip { padding: 8px 10px 7px; border-radius: 14px; background: var(--fill-2); }
.chip b { display: block; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.chip span { display: block; margin-top: 1px; font-size: 11px; color: var(--text-3); }

.group { display: flex; flex-direction: column; gap: 8px; }
.ghead { display: flex; align-items: baseline; justify-content: space-between; padding: 0 2px; }
.glabel { font-size: 12px; font-weight: 600; color: var(--text-2); }
.link {
  padding: 0; border: 0; background: none; cursor: pointer;
  font-size: 12px; color: var(--text-2); text-decoration: none;
}
.link:hover { color: var(--text); }

.key {
  display: flex; align-items: center; gap: 6px;
  height: 42px; padding: 4px 4px 4px 12px; border-radius: 14px;
  background: var(--fill-2);
  box-shadow: inset 0 0 0 0.5px var(--edge);
  transition: box-shadow 0.2s;
}
.key:focus-within { box-shadow: inset 0 0 0 1.5px var(--focus); }
.key input {
  flex: 1; min-width: 0; height: 100%;
  border: 0; outline: 0; background: transparent; color: var(--text);
  font: 12.5px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
.key input::placeholder { color: var(--text-3); font: 12.5px/1 -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif; }
.key input:focus-visible { outline: none; }
.key button {
  flex: none; height: 34px; padding: 0 14px; border: 0; border-radius: 10px;
  background: var(--text); color: var(--solid);
  font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: opacity 0.2s;
}
.key button:disabled { opacity: 0.35; cursor: default; }
.status { display: flex; align-items: center; gap: 7px; min-height: 16px; padding: 0 2px; font-size: 12px; color: var(--text-2); }
.status i { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dot); }

.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-left: 2px; }
.row > span { font-size: 13px; }
.row small { display: block; margin-top: 1px; font-size: 11px; color: var(--text-3); }

.seg {
  --i: 0; --n: 2;
  position: relative; flex: none;
  display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr));
  width: 186px; height: 32px; padding: 2px; border-radius: 11px;
  background: var(--fill);
}
.seg-thumb {
  position: absolute; top: 2px; bottom: 2px; left: 2px;
  width: calc((100% - 4px) / var(--n));
  border-radius: 9px;
  background: var(--thumb);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
  transform: translateX(calc(100% * var(--i)));
  transition: transform var(--dur) var(--ease);
}
.seg button {
  position: relative; z-index: 1;
  border: 0; border-radius: 9px; background: none; cursor: pointer;
  font-size: 12.5px; font-weight: 500; color: var(--text-2);
}
.seg button[aria-checked="true"] { color: var(--text); font-weight: 600; }

.switch {
  position: relative; flex: none;
  width: 44px; height: 26px; padding: 0; border: 0; border-radius: 13px;
  background: var(--fill); cursor: pointer;
  transition: background-color 0.25s;
}
.switch[aria-checked="true"] { background: var(--ok); }
.switch::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 22px; height: 22px; border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
  transition: transform var(--dur) var(--ease);
}
.switch[aria-checked="true"]::after { transform: translateX(18px); }

.recent {
  list-style: none; margin: 0 -6px; padding: 4px 0;
  max-height: 212px; overflow: auto; overscroll-behavior: contain; scrollbar-width: none;
  -webkit-mask-image: linear-gradient(transparent, #000 8px, #000 calc(100% - 8px), transparent);
  mask-image: linear-gradient(transparent, #000 8px, #000 calc(100% - 8px), transparent);
}
.item { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 10px; border-radius: 14px; }
.item:hover { background: var(--fill-2); }
.item-main { flex: 1; min-width: 0; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
.item-top { display: flex; align-items: baseline; gap: 6px; font-size: 12px; }
.item-handle { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.item-kind { color: var(--text-2); white-space: nowrap; }
.item-score { margin-left: auto; color: var(--text-3); font-variant-numeric: tabular-nums; }
.item-text {
  margin-top: 2px; font-size: 12.5px; line-height: 1.35; color: var(--text-2);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;
}
.undo {
  flex: none; height: 26px; padding: 0 9px; border: 0; border-radius: 8px;
  background: var(--fill-2); color: var(--text-2);
  font-size: 11.5px; font-weight: 500; cursor: pointer;
}
.undo:hover { color: var(--text); background: var(--fill); }
.empty { padding: 14px 8px; font-size: 12.5px; color: var(--text-3); text-align: center; }

.foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 2px; font-size: 11.5px; color: var(--text-3); }
.foot .link { font-size: 11.5px; color: var(--text-3); }
.foot .link:hover { color: var(--text-2); }

/* Continuous (G2) corners where the browser has them. The radii grow a
   little because a superellipse reads tighter than a circular arc. */
@supports (corner-shape: superellipse(1.5)) {
  .mark { border-radius: 14px; corner-shape: superellipse(${SHAPE}); }
  .chip, .key, .item { border-radius: 16px; corner-shape: superellipse(${SHAPE}); }
  .key button { border-radius: 12px; corner-shape: superellipse(${SHAPE}); }
  .seg { border-radius: 13px; corner-shape: superellipse(${SHAPE}); }
  .seg-thumb, .seg button { border-radius: 11px; corner-shape: superellipse(${SHAPE}); }
  .undo { border-radius: 9px; corner-shape: superellipse(${SHAPE}); }
}

@media (prefers-reduced-motion: reduce) {
  .face { transition: opacity 0.18s ease; }
  .seg-thumb, .switch::after { transition-duration: 0.01s; }
}
@media (prefers-reduced-transparency: reduce) {
  .shell { background: var(--solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
@media (prefers-contrast: more) {
  .shell { --edge: rgba(127, 127, 127, 0.7); --text-2: var(--text); }
}
`;

  // ---------- small components ----------

  // Digits that roll up (or down) when the number changes.
  function roller(el) {
    let shown = null;
    return (n) => {
      const next = fmt(n);
      if (next === shown) return;
      const prev = shown;
      shown = next;
      const animate = prev !== null && !reduceMotion.matches;
      const dir = prev !== null && Number(n) < Number(prev.replace(/,/g, '')) ? -1 : 1;
      const before = prev ? [...prev] : [];
      const chars = [...next];
      el.replaceChildren();
      chars.forEach((ch, i) => {
        const inner = h('span', null, ch);
        const slot = h('span', { class: 'dg' }, inner);
        el.append(slot);
        const old = before[before.length - (chars.length - i)] ?? '';
        if (!animate || old === ch) return;
        inner.animate(
          [
            { transform: `translateY(${0.6 * dir}em)`, opacity: 0, filter: 'blur(2px)' },
            { transform: 'none', opacity: 1, filter: 'blur(0)' },
          ],
          { duration: ease.duration, easing: ease.easing },
        );
        if (!old) return;
        const ghost = h('span', { class: 'ghost', 'aria-hidden': 'true' }, old);
        slot.append(ghost);
        ghost
          .animate(
            [
              { transform: 'none', opacity: 1, filter: 'blur(0)' },
              { transform: `translateY(${-0.6 * dir}em)`, opacity: 0, filter: 'blur(2px)' },
            ],
            { duration: ease.duration * 0.8, easing: ease.easing, fill: 'forwards' },
          )
          .finished.then(() => ghost.remove(), () => ghost.remove());
      });
    };
  }

  function segmented(label, options, onPick) {
    const thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
    const buttons = options.map(([value, text]) => h('button', { type: 'button', role: 'radio', 'data-value': value, onclick: () => onPick(value) }, text));
    const root = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label, style: `--n: ${options.length}` }, thumb, buttons);
    root.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      const at = buttons.indexOf(e.target);
      if (!step || at < 0) return;
      e.preventDefault();
      const next = buttons[(at + step + buttons.length) % buttons.length];
      next.focus();
      onPick(next.dataset.value);
    });
    return {
      root,
      set(value) {
        buttons.forEach((b, i) => {
          const on = b.dataset.value === value;
          b.setAttribute('aria-checked', String(on));
          b.tabIndex = on ? 0 : -1;
          if (on) root.style.setProperty('--i', i);
        });
      },
    };
  }

  // ---------- mount ----------

  function mount(handlers = {}) {
    const host = document.createElement('div');
    host.id = 'slopfilter-root';
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;';
    const root = host.attachShadow({ mode: 'closed' });

    // --- capsule face
    const capGlyph = glyph('sf-cut-cap');
    const capCount = h('span', { class: 'num cap-count' });
    const cap = h(
      'button',
      { class: 'cap face', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'dialog' },
      h('span', { class: 'glyph' }, capGlyph, h('span', { class: 'dot' })),
      h('span', { class: 'cap-label' }, '已拦截'),
      capCount,
    );

    // --- panel face
    const sub = h('div', { class: 'sub' });
    const heroNum = h('span', { class: 'num' });
    const chipToday = h('b');
    const chipSession = h('b');
    const chipScanned = h('b');
    const chipRate = h('b');
    const keyInput = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Jev API Key' });
    const keyButton = h('button', { type: 'button' }, '保存');
    const statusText = h('span');
    const enabledSwitch = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': '启用过滤' });
    const sensitivity = segmented('判定尺度', [['relaxed', '宽松'], ['balanced', '均衡'], ['strict', '严格']], (v) => handlers.onSettings?.({ sensitivity: v }));
    const action = segmented('处理方式', [['collapse', '折叠'], ['hide', '隐藏']], (v) => handlers.onSettings?.({ action: v }));
    const blueSwitch = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': '蓝勾从严' });
    const list = h('ul', { class: 'recent' });
    const footModel = h('span');
    const footTrust = h('button', { class: 'link', type: 'button', onclick: () => handlers.onResetTrusted?.() });

    const panel = h(
      'section',
      { class: 'panel face', role: 'dialog', 'aria-label': 'SlopFilter 设置', tabindex: '-1' },
      h(
        'header',
        { class: 'head' },
        h('div', { class: 'mark' }, glyph('sf-cut-mark')),
        h('div', { class: 'titles' }, h('div', { class: 'title' }, 'SlopFilter'), sub),
        enabledSwitch,
        h('button', { class: 'close', type: 'button', 'aria-label': '收起', onclick: () => setOpen(false, true) }, svg(ICON_CLOSE)),
      ),
      h('div', { class: 'hero' }, heroNum, h('span', { class: 'hero-label' }, '条 AI 生成推文已拦截')),
      h(
        'div',
        { class: 'chips' },
        h('div', { class: 'chip' }, chipToday, h('span', null, '今日')),
        h('div', { class: 'chip' }, chipSession, h('span', null, '本页')),
        h('div', { class: 'chip' }, chipScanned, h('span', null, '已扫描')),
        h('div', { class: 'chip' }, chipRate, h('span', null, '拦截率')),
      ),
      h(
        'div',
        { class: 'group' },
        h(
          'div',
          { class: 'ghead' },
          h('span', { class: 'glabel' }, 'Jev API Key'),
          h('a', { class: 'link', href: 'https://console.typesafe.ai', target: '_blank', rel: 'noopener noreferrer' }, '获取 Key ↗'),
        ),
        h('div', { class: 'key' }, keyInput, keyButton),
        h('div', { class: 'status' }, h('i'), statusText),
      ),
      h('div', { class: 'row' }, h('span', null, '判定尺度'), sensitivity.root),
      h('div', { class: 'row' }, h('span', null, '处理方式'), action.root),
      h('div', { class: 'row' }, h('span', null, '蓝勾从严', h('small', null, '付费蓝勾作者的拦截线低 8 个百分点')), blueSwitch),
      h(
        'div',
        { class: 'group' },
        h(
          'div',
          { class: 'ghead' },
          h('span', { class: 'glabel' }, '最近拦截'),
          h('button', { class: 'link', type: 'button', onclick: () => handlers.onReset?.() }, '清空记录'),
        ),
        list,
      ),
      h('div', { class: 'foot' }, footModel, footTrust),
    );
    panel.inert = true;

    const shell = h('div', { class: 'shell', 'data-corner': 'br', 'data-theme': 'light', 'data-status': 'local' }, cap, panel);
    shell.style.setProperty('--dur', `${ease.duration}ms`);
    shell.style.setProperty('--ease', ease.easing);
    root.append(h('style', null, CSS_TEXT), shell);
    document.documentElement.append(host);

    const rollCap = roller(capCount);
    const rollHero = roller(heroNum);

    // ---------- springs ----------

    let capW = 132;
    let panelW = PANEL_W;
    let panelH = 520;
    let isOpen = false;
    let view = null;

    const sw = new Spring(capW, { precision: 0.05 });
    const sh = new Spring(CAP_H, { precision: 0.05 });
    const sr = new Spring(CAP_H / 2, { precision: 0.02 });
    const tx = new Spring(0, { precision: 0.05 });
    const ty = new Spring(0, { precision: 0.05 });
    const sc = new Spring(1, { precision: 0.0004 });
    const springs = [sw, sh, sr, tx, ty, sc];

    const ticker = loop((dt) => {
      let moving = false;
      for (const s of springs) moving = s.step(dt) || moving;
      render();
      return moving;
    });

    function render() {
      const w = sw.value;
      const ht = sh.value;
      const pw = clamp01((w - capW) / Math.max(1, panelW - capW));
      const ph = clamp01((ht - CAP_H) / Math.max(1, panelH - CAP_H));
      const formed = Math.min(pw, ph); // how much of the panel exists
      const left = Math.max(pw, ph); // how far the capsule has been left behind
      const still = reduceMotion.matches;

      const st = shell.style;
      st.width = `${w.toFixed(2)}px`;
      st.height = `${ht.toFixed(2)}px`;
      st.borderRadius = `${Math.max(0, Math.min(sr.value, ht / 2, w / 2)).toFixed(2)}px`;
      // Circular ends while it is a pill, continuous curvature as it becomes a card.
      if (supportsShape) st.setProperty('corner-shape', `superellipse(${(1 + (SHAPE - 1) * ph).toFixed(3)})`);
      st.setProperty('--p', formed.toFixed(3));
      st.transform = `translate3d(${tx.value.toFixed(2)}px, ${ty.value.toFixed(2)}px, 0) scale(${sc.value.toFixed(4)})`;

      const out = still ? (isOpen ? 1 : 0) : smooth(0, 0.3, left);
      cap.style.opacity = (1 - out).toFixed(3);
      cap.style.filter = !still && out > 0.002 && out < 0.998 ? `blur(${(out * 5).toFixed(2)}px)` : '';
      cap.style.transform = still ? '' : `scale(${(1 - 0.12 * out).toFixed(4)})`;

      const into = still ? (isOpen ? 1 : 0) : smooth(0.2, 0.8, formed);
      panel.style.opacity = into.toFixed(3);
      panel.style.filter = !still && into > 0.002 && into < 0.998 ? `blur(${((1 - into) * 8).toFixed(2)}px)` : '';
      panel.style.transform = still ? '' : `scale(${(0.94 + 0.06 * into).toFixed(4)})`;
    }

    const viewport = () => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });

    function anchor(corner, w, ht) {
      const vp = viewport();
      return {
        left: corner[1] === 'l' ? INSET.side : vp.w - INSET.side - w,
        top: corner[0] === 't' ? INSET.top : vp.h - INSET.bottom - ht,
      };
    }

    function measureCapsule() {
      const w = cap.offsetWidth;
      if (w && Math.abs(w - capW) > 0.5) {
        capW = w;
        if (!isOpen) {
          sw.to(capW, CLOSE.w);
          ticker.kick();
        }
      }
    }

    function measurePanel() {
      const vp = viewport();
      panelW = Math.min(PANEL_W, vp.w - 2 * INSET.side);
      panel.style.width = `${panelW}px`;
      panel.style.height = 'auto';
      const natural = panel.offsetHeight;
      const room = vp.h - (shell.dataset.corner[0] === 't' ? INSET.top : INSET.bottom) - EDGE;
      panelH = Math.max(CAP_H + 1, Math.min(natural, room));
      panel.style.height = `${panelH}px`;
    }

    // ---------- open / close ----------

    const onOutside = (e) => {
      if (!e.composedPath().includes(host)) setOpen(false);
    };
    const onResize = () => {
      if (!isOpen) return;
      measurePanel();
      sw.to(panelW);
      sh.to(panelH);
      ticker.kick();
    };

    function setOpen(next, refocus = false) {
      if (next === isOpen) return;
      isOpen = next;
      shell.toggleAttribute('data-open', next);
      cap.setAttribute('aria-expanded', String(next));
      cap.tabIndex = next ? -1 : 0;
      panel.inert = !next; // also keeps the faded-out panel out of the tab order

      if (next) {
        measurePanel();
        document.addEventListener('pointerdown', onOutside, true);
        addEventListener('resize', onResize);
      } else {
        document.removeEventListener('pointerdown', onOutside, true);
        removeEventListener('resize', onResize);
      }

      const p = next ? OPEN : CLOSE;
      sw.to(next ? panelW : capW, p.w);
      sh.to(next ? panelH : CAP_H, p.h);
      sr.to(next ? PANEL_R : CAP_H / 2, p.r);
      if (reduceMotion.matches) for (const s of [sw, sh, sr]) s.snap();
      ticker.kick();

      if (next) {
        (view && !view.keyHint ? keyInput : panel).focus({ preventScroll: true });
      } else if (refocus) {
        cap.focus({ preventScroll: true });
      }
    }

    // Keys typed in the panel must not reach X's keyboard shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress']) {
      root.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'keydown' && e.key === 'Escape' && isOpen) setOpen(false, true);
      });
    }

    // ---------- press, drag, throw ----------

    let press = null;
    let swallowClick = false;

    cap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || isOpen) return;
      swallowClick = false;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, bx: tx.value, by: ty.value, moved: false, trail: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
      cap.setPointerCapture(e.pointerId);
      sc.to(0.96, PRESS); // feedback on press, not on release
      ticker.kick();
    });

    cap.addEventListener('pointermove', (e) => {
      if (!press || e.pointerId !== press.id) return;
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (!press.moved) {
        if (Math.hypot(dx, dy) < 6) return;
        press.moved = true;
        shell.toggleAttribute('data-dragging', true);
      }
      // 1:1 with the pointer, offset preserved from where it was grabbed.
      tx.snap(press.bx + dx);
      ty.snap(press.by + dy);
      press.trail.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (press.trail.length > 10) press.trail.shift();
      ticker.kick();
    });

    const endPress = (e) => {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      press = null;
      sc.to(1, RELEASE);
      if (p.moved) {
        swallowClick = true;
        shell.toggleAttribute('data-dragging', false);
        throwToCorner(p);
      }
      ticker.kick();
    };
    cap.addEventListener('pointerup', endPress);
    cap.addEventListener('pointercancel', endPress);
    cap.addEventListener('click', () => {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      setOpen(true);
    });

    function releaseVelocity(trail) {
      const last = trail[trail.length - 1];
      const first = trail.find((pt) => last.t - pt.t <= 100) || trail[0];
      const dt = (last.t - first.t) / 1000;
      return dt > 0.008 ? { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt } : { vx: 0, vy: 0 };
    }

    // Where a flick would come to rest (Apple's deceleration projection).
    const project = (v, rate = 0.998) => ((v / 1000) * rate) / (1 - rate);

    function throwToCorner(p) {
      const { vx, vy } = releaseVelocity(p.trail);
      const vp = viewport();
      const from = shell.dataset.corner;
      const base = anchor(from, capW, CAP_H);
      const x = base.left + tx.value;
      const y = base.top + ty.value;
      const cx = x + capW / 2 + project(vx);
      const cy = y + CAP_H / 2 + project(vy);
      const corner = (cy < vp.h / 2 ? 't' : 'b') + (cx < vp.w / 2 ? 'l' : 'r');

      // Re-anchor without a visible jump, then let the spring carry the
      // release velocity home.
      const next = anchor(corner, capW, CAP_H);
      shell.dataset.corner = corner;
      tx.snap(x - next.left);
      ty.snap(y - next.top);
      tx.velocity = vx;
      ty.velocity = vy;
      tx.to(0, THROW);
      ty.to(0, THROW);
      if (corner !== from) handlers.onSettings?.({ corner });
    }

    // ---------- panel controls ----------

    enabledSwitch.addEventListener('click', () => handlers.onSettings?.({ enabled: !(view?.settings.enabled ?? true) }));
    blueSwitch.addEventListener('click', () => handlers.onSettings?.({ blueStrict: !(view?.settings.blueStrict ?? true) }));

    let saving = false;
    const syncKeyButton = () => {
      const typed = keyInput.value.trim();
      keyButton.textContent = saving ? '验证中' : typed ? '保存' : view?.keyHint ? '移除' : '保存';
      keyButton.disabled = saving || (!typed && !view?.keyHint);
    };
    keyInput.addEventListener('input', syncKeyButton);
    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') keyButton.click();
    });
    keyButton.addEventListener('click', async () => {
      if (saving) return;
      saving = true;
      syncKeyButton();
      try {
        await handlers.onKey?.(keyInput.value.trim());
        keyInput.value = '';
      } finally {
        saving = false;
        syncKeyButton();
      }
    });

    const STATUS = {
      paused: () => ['已暂停', '已暂停：不会拦截任何推文'],
      local: () => ['本地规则模式', '未填写 Key：只用本地规则拦截特征特别明显的推文'],
      checking: () => ['正在验证 Key', '正在验证 Key…'],
      ok: (v) => ['由 Jev 判定', `已连接 · ${v.jevStatus?.model || v.settings.model}`],
      bad: (v) => ['连接出错', v.jevStatus?.message || '连接出错'],
    };

    function statusOf(v) {
      if (!v.settings.enabled) return 'paused';
      if (!v.keyHint) return 'local';
      const s = v.jevStatus?.state;
      if (s === 'checking') return 'checking';
      if (s === 'invalid' || s === 'error') return 'bad';
      return 'ok';
    }

    let recentSig = '';
    function renderRecent(items) {
      const sig = items.map((it) => it.id).join(',');
      if (sig === recentSig) return false;
      recentSig = sig;
      list.replaceChildren(
        ...(items.length
          ? items.slice(0, 30).map((it) =>
              h(
                'li',
                { class: 'item' },
                h(
                  'button',
                  { class: 'item-main', type: 'button', title: '在页面上找到这条推文', onclick: () => handlers.onLocate?.(it) },
                  h('div', { class: 'item-top' }, h('span', { class: 'item-handle' }, `@${it.handle}`), h('span', { class: 'item-kind' }, it.label || 'AI 生成'), h('span', { class: 'item-score' }, pct(it.score))),
                  h('div', { class: 'item-text' }, it.text || ''),
                ),
                h('button', { class: 'undo', type: 'button', title: '不是 AI：恢复显示，并信任这位作者', onclick: () => handlers.onUnblock?.(it) }, '误判'),
              ),
            )
          : [h('li', { class: 'empty' }, '还没有拦截记录。刷一会儿时间线再回来看看。')]),
      );
      return true;
    }

    let lastStatusLine = '';

    function update(v) {
      view = v;
      const status = statusOf(v);
      shell.dataset.status = status;
      const [short, long] = STATUS[status](v);
      sub.textContent = short;
      statusText.textContent = long;

      rollCap(v.total);
      rollHero(v.total);
      cap.setAttribute('aria-label', `SlopFilter：已拦截 ${v.total} 条 AI 生成推文，${short}`);
      chipToday.textContent = fmt(v.today);
      chipSession.textContent = fmt(v.session);
      chipScanned.textContent = fmt(v.scanned);
      chipRate.textContent = v.scanned ? `${((v.session / v.scanned) * 100).toFixed(1)}%` : '–';

      keyInput.placeholder = v.keyHint ? `已保存 ${v.keyHint}，粘贴新 Key 可替换` : '粘贴 TypeSafe 控制台里的 API Key';
      syncKeyButton();
      enabledSwitch.setAttribute('aria-checked', String(!!v.settings.enabled));
      sensitivity.set(v.settings.sensitivity);
      action.set(v.settings.action);
      blueSwitch.setAttribute('aria-checked', String(!!v.settings.blueStrict));

      const tokens = v.usage?.tokens || 0;
      footModel.textContent = `${v.settings.model} · 已用 ${compact(tokens)} tokens`;
      const trusted = v.settings.trusted?.length || 0;
      footTrust.textContent = trusted ? `信任 ${trusted} 位作者 · 重置` : '';
      footTrust.hidden = !trusted;

      if (v.settings.corner && v.settings.corner !== shell.dataset.corner && !press && tx.resting && ty.resting) {
        shell.dataset.corner = v.settings.corner;
      }

      const listChanged = renderRecent(v.recent || []);
      measureCapsule();
      if (isOpen && (listChanged || long !== lastStatusLine)) {
        measurePanel();
        sh.to(panelH);
        ticker.kick();
      }
      lastStatusLine = long;
    }

    // A small "caught one" cue on the capsule.
    function pulse() {
      if (isOpen || reduceMotion.matches || press) return;
      sc.configure({ response: 0.42, damping: 0.55 });
      sc.velocity += 0.9;
      ticker.kick();
      capGlyph.querySelector('.slash')?.animate([{ strokeDasharray: '1', strokeDashoffset: '1' }, { strokeDasharray: '1', strokeDashoffset: '0' }], { duration: 480, easing: ease.easing });
    }

    rollCap(0);
    rollHero(0);
    measureCapsule();
    sw.snap(capW);
    render();

    return {
      update,
      pulse,
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen(!isOpen),
      setTheme: (t) => {
        shell.dataset.theme = t;
      },
      destroy: () => {
        setOpen(false);
        host.remove();
      },
    };
  }

  return { mount };
})();
