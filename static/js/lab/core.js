/* 论小研 Agent · 核心层：工具、事件、IndexedDB、模型网关、UI 原语 */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
export function debounce(fn, ms = 250) {
  let t; return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}
export function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
}
export function fmtTime(ts) {
  const d = new Date(ts || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function shortId(id) { return String(id || '').slice(0, 8); }

/* ---------- 文本算法 ---------- */
const STOP = new Set(('a an the of for and or to in on with by from as at is are was were be been this that these those we our their its it '
  + 'we can may will would should could not no than then than which who whom whose what when where how why all any both each few more most other some such '
  + 'using used use based paper results show propose proposed method approach model models').split(' '));

export function normalizeText(t) {
  return String(t || '').toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text) {
  const s = normalizeText(text);
  const out = [];
  // English words / numbers / math symbols
  const en = s.match(/[a-z][a-z0-9\-]{1,}|[0-9]+(?:\.[0-9]+)?%?/g) || [];
  for (const w of en) out.push(w);
  // Chinese bigrams (plus single chars for rare terms)
  const zh = s.match(/[\u4e00-\u9fff]+/g) || [];
  for (const seg of zh) {
    for (let i = 0; i < seg.length; i++) {
      out.push(seg[i]);
      if (i < seg.length - 1) out.push(seg.slice(i, i + 2));
    }
  }
  return out;
}
export function contentTokens(text) { return tokenize(text).filter(t => !STOP.has(t) && t.length > 0); }

export function charNgrams(text, n = 3) {
  const s = normalizeText(text).replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  const m = new Map();
  for (let i = 0; i <= s.length - n; i++) {
    const g = s.slice(i, i + n);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

export function hash32(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function hashHex(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0; h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** 64-bit SimHash over content tokens — 用于语义级近似去重 */
export function simhash(text) {
  const toks = contentTokens(text);
  const vec = new Array(64).fill(0);
  for (const t of toks) {
    const h = hash32(t);
    for (let b = 0; b < 32; b++) vec[b] += (h >>> b) & 1 ? 1 : -1;
    const h2 = hash32(t, 0x9e3779b1);
    for (let b = 0; b < 32; b++) vec[32 + b] += (h2 >>> b) & 1 ? 1 : -1;
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let v = 0;
    for (let b = 0; b < 4; b++) if (vec[i + b] > 0) v |= 1 << b;
    hex += v.toString(16);
  }
  return hex;
}
export function hamming(a, b) {
  let x = 0;
  for (let i = 0; i < a.length; i++) {
    let v = parseInt(a[i], 16) ^ parseInt(b[i] || '0', 16);
    while (v) { x += v & 1; v >>= 1; }
  }
  return x;
}
export function simhashSim(a, b) { return a && b ? 1 - hamming(a, b) / 64 : 0; }

/** MinHash 签名：估算 Jaccard，适合长文档 */
export function minhash(text, size = 128, shingle = 5) {
  const s = normalizeText(text).replace(/\s+/g, ' ');
  const set = new Set();
  for (let i = 0; i < s.length - shingle; i += 2) set.add(s.slice(i, i + shingle));
  const sig = new Array(size).fill(0xffffffff);
  let i = 0;
  for (const sh of set) {
    if (i++ > 40000) break;
    const h1 = hash32(sh), h2 = hash32(sh, 0x9e3779b1);
    for (let k = 0; k < size; k++) {
      const v = (h1 + Math.imul(k, h2)) >>> 0;
      if (v < sig[k]) sig[k] = v;
    }
  }
  return sig;
}
export function minhashSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
}
export function jaccard(a, b) {
  if (!a || !b) return 0;
  let inter = 0;
  const small = a.size <= b.size ? a : b, big = small === a ? b : a;
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

export function splitSentences(text) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const parts = s.match(/[^.!?;。！？；]+[.!?;。！？；]?/g) || [];
  return parts.map(x => x.trim()).filter(x => x.length > 1);
}
export function trimQuote(s, n = 260) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
}
export function safeJson(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  const c = t.indexOf('['), d = t.lastIndexOf(']');
  if (c >= 0 && d > c) { try { return JSON.parse(t.slice(c, d + 1)); } catch (e) {} }
  return null;
}

/* ---------- 事件总线 ---------- */
class Bus {
  constructor() { this.map = new Map(); }
  on(evt, fn) { if (!this.map.has(evt)) this.map.set(evt, new Set()); this.map.get(evt).add(fn); return () => this.map.get(evt).delete(fn); }
  emit(evt, data) { (this.map.get(evt) || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }
}
export const bus = new Bus();

/* ---------- IndexedDB ---------- */
const DB_NAME = 'lunxiaoyan-agent';
const DB_STORES = ['papers', 'files', 'translations', 'runs', 'meta'];
export class Store {
  constructor() { this.db = null; this.mem = new Map(); this.fallback = false; }
  async open() {
    if (this.db || this.fallback) return this;
    if (!('indexedDB' in window)) { this.fallback = true; return this; }
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of DB_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => { this.fallback = true; return null; });
    return this;
  }
  _tx(store, mode = 'readonly') {
    const db = this.db;
    const tx = db.transaction(store, mode);
    return tx.objectStore(store);
  }
  async put(store, key, value) {
    await this.open();
    if (this.fallback) { this.mem.set(store + ':' + key, value); return value; }
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').put(value, key);
      req.onsuccess = () => resolve(value); req.onerror = () => reject(req.error);
    });
  }
  async get(store, key) {
    await this.open();
    if (this.fallback) return this.mem.get(store + ':' + key);
    return new Promise((resolve, reject) => {
      const req = this._tx(store).get(key);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }
  async getAll(store) {
    await this.open();
    if (this.fallback) {
      return [...this.mem.entries()].filter(([k]) => k.startsWith(store + ':')).map(([, v]) => v);
    }
    return new Promise((resolve, reject) => {
      const req = this._tx(store).getAll();
      req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error);
    });
  }
  async del(store, key) {
    await this.open();
    if (this.fallback) { this.mem.delete(store + ':' + key); return; }
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').delete(key);
      req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
    });
  }
  async clear(store) {
    await this.open();
    if (this.fallback) { for (const k of [...this.mem.keys()]) if (k.startsWith(store + ':')) this.mem.delete(k); return; }
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').clear();
      req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
    });
  }
}
export const store = new Store();

/* ---------- 模型网关（可插拔；默认本地推演，不内置任何密钥） ---------- */
export const LLM_PRESETS = [
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  { id: 'openai', name: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
];
const LLM_KEY = 'lx.agent.llm';
export const llm = {
  config() {
    try { return Object.assign({ baseUrl: LLM_PRESETS[0].baseUrl, model: LLM_PRESETS[0].model, apiKey: '' }, JSON.parse(localStorage.getItem(LLM_KEY) || '{}')); }
    catch (e) { return { baseUrl: LLM_PRESETS[0].baseUrl, model: LLM_PRESETS[0].model, apiKey: '' }; }
  },
  save(cfg) { localStorage.setItem(LLM_KEY, JSON.stringify(cfg)); bus.emit('llm', cfg); },
  available() { const c = this.config(); return !!(c.apiKey && c.baseUrl); },
  label() { const c = this.config(); return this.available() ? (c.model || '在线模型') : '本地推理'; },
  async *stream(messages, opts = {}) {
    const cfg = this.config();
    if (!cfg.apiKey) throw new Error('未配置模型密钥');
    const ctrl = new AbortController();
    if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort());
    const resp = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({
        model: cfg.model, messages, stream: true, temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens || 1600,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error('模型请求失败：HTTP ' + resp.status);
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const data = s.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const d = j.choices?.[0]?.delta?.content;
          if (d) yield d;
        } catch (e) {}
      }
    }
  },
  async complete(messages, opts = {}) {
    let out = '';
    for await (const d of this.stream(messages, opts)) out += d;
    return out;
  },
  async json(system, user, opts = {}) {
    const text = await this.complete([
      { role: 'system', content: system + '\n只输出 JSON，不要 Markdown 代码块。' },
      { role: 'user', content: user },
    ], opts);
    return safeJson(text);
  },
};

/* ---------- Markdown → HTML（安全、支持引用标记） ---------- */
export function citeToken(paperId, page, section) {
  return `[[c:${paperId}:${page || 1}:${encodeURIComponent(section || '')}]]`;
}
export function mdToHtml(md) {
  let text = esc(md || '');
  text = text.replace(/\[\[c:([^:\]]+):(\d+):([^\]]*)\]\]/g, (m, pid, pg, sec) => {
    const secText = sec ? decodeURIComponent(sec) : '';
    const label = `p.${pg}${secText ? ' §' + secText.slice(0, 16) : ''}`;
    return `<a class="cite" data-cite-paper="${pid}" data-cite-page="${pg}" href="#reader">${label}</a>`;
  });
  const lines = text.split('\n');
  const out = [];
  let list = null, quote = [];
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push('<blockquote>' + quote.join('<br>') + '</blockquote>'); quote = []; } };
  for (let raw of lines) {
    let line = raw.trim();
    if (!line) { closeList(); flushQuote(); continue; }
    if (line.startsWith('&gt; ')) { closeList(); quote.push(line.slice(5)); continue; }
    flushQuote();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue; }
    const ul = line.match(/^[-*]\s+(.*)$/), ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (list !== tag) { closeList(); list = tag; out.push('<' + tag + '>'); }
      out.push('<li>' + inline((ul || ol)[1]) + '</li>'); continue;
    }
    closeList();
    out.push('<p>' + inline(line) + '</p>');
  }
  closeList(); flushQuote();
  return out.join('\n');
}
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/* ---------- UI 原语 ---------- */
export function toast(msg, kind = '') {
  const root = $('#toastRoot'); if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 3200);
}
export function modal({ title, body, footer, wide = false, onMount }) {
  const root = $('#modalRoot');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h2>${esc(title || '')}</h2><button class="icon-btn x" type="button" aria-label="关闭">${icon('close')}</button></div>
    <div class="modal-b"></div>${footer === false ? '' : '<div class="modal-f"></div>'}</div>`;
  const bodyEl = back.querySelector('.modal-b');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const footEl = back.querySelector('.modal-f');
  if (footEl && footer) {
    if (typeof footer === 'string') footEl.innerHTML = footer;
    else if (Array.isArray(footer)) footer.forEach(b => footEl.appendChild(b));
  }
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  back.querySelector('.x').onclick = close;
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  root.appendChild(back);
  if (onMount) onMount({ root: back, body: bodyEl, close });
  return { root: back, body: bodyEl, close };
}
export function drawer({ title, body, onMount }) {
  const root = $('#drawerRoot');
  root.innerHTML = '';
  const back = document.createElement('div'); back.className = 'drawer-back';
  const panel = document.createElement('div'); panel.className = 'drawer';
  panel.innerHTML = `<div class="drawer-h"><b style="font:600 14px var(--serif)">${esc(title || '')}</b><button class="icon-btn x" style="margin-left:auto" type="button">${icon('close')}</button></div><div class="drawer-b"></div>`;
  const bodyEl = panel.querySelector('.drawer-b');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  root.appendChild(back); root.appendChild(panel);
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  panel.querySelector('.x').onclick = close;
  back.onclick = close;
  document.addEventListener('keydown', onKey);
  if (onMount) onMount({ body: bodyEl, close });
  return { body: bodyEl, close };
}
export function copyText(text, okMsg = '已复制') {
  const done = () => toast(okMsg);
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback());
  else fallback();
  function fallback() {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败', 'bad'); }
    ta.remove();
  }
}
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 20000);
  try {
    const resp = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } finally { clearTimeout(timer); }
}
export function svgIconEl(name, size = 16) {
  const span = document.createElement('span');
  span.innerHTML = icon(name, size);
  return span.firstElementChild;
}

/* ---------- 图标（内联 SVG，无外部依赖） ---------- */
const ICON_PATH = {
  lib: '<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z"/><path d="M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  read: '<path d="M4 4h9v16H4z"/><path d="M13 4h7v16h-7z"/>',
  graph: '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="7" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M8 7l8 0M7 8l4 8M17 9l-4 7"/>',
  radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12l6-6"/>',
  pen: '<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M14 6l3 3"/>',
  trace: '<path d="M4 6h10M4 12h16M4 18h8"/><circle cx="18" cy="6" r="2"/><circle cx="14" cy="18" r="2"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.6h5l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 4v7h-7"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5H5V6h5"/>',
  quill: '<path d="M4 20c4-1 7-3 9-7l5-9-9 5c-4 2-6 5-7 9z"/><path d="M8 16l-3-3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  alert: '<path d="M12 3l9 17H3z"/><path d="M12 9v5M12 17.5v.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  diff: '<path d="M6 3v12a3 3 0 0 0 3 3h9"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="6" r="2"/><path d="M18 8v10"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16l4-6 3 3 5-8"/>',
};
export function icon(name, size = 16) {
  const p = ICON_PATH[name] || ICON_PATH.info;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
export function hydrateIcons(root = document) {
  $$('i[data-icon]', root).forEach(el => {
    const name = el.getAttribute('data-icon');
    el.innerHTML = icon(name, 17);
    el.classList.add('ico');
  });
}

/* ---------- 主题 ---------- */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('lx.agent.theme', theme);
}
export function initTheme() {
  const saved = localStorage.getItem('lx.agent.theme');
  applyTheme(saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
}
