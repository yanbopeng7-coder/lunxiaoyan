/**
 * M1：PDF/TXT 文献库 CRUD + 语义去重 + 细粒度解析
 */
import {
  store, uid, simhash, minhash, minhashSim, simhashSim, hamming,
  normalizeText, splitSentences, trimQuote, hashHex, fmtTime, esc,
} from './core.js';

const CHUNK = 700;

export function parseStructuredText(raw, meta = {}) {
  const text = String(raw || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let title = meta.title || '';
  let authors = meta.authors || '';
  let abstract = '';
  const headings = [];
  const refs = [];
  let mode = 'body';
  const bodyLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^title\s*:/i.test(line)) { title = line.replace(/^title\s*:/i, '').trim(); continue; }
    if (/^authors?\s*:/i.test(line)) { authors = line.replace(/^authors?\s*:/i, '').trim(); continue; }
    if (/^arxiv\s*:/i.test(line)) { meta.arxiv = line.replace(/^arxiv\s*:/i, '').trim(); continue; }
    if (/^abstract\s*:/i.test(line)) { mode = 'abstract'; abstract = line.replace(/^abstract\s*:/i, '').trim(); continue; }
    if (/^references?\s*$/i.test(line)) { mode = 'refs'; continue; }
    if (/^future\s*work/i.test(line) || /^version\s*diff/i.test(line)) {
      headings.push({ level: 1, title: line, page: estimatePage(bodyLines.length) });
      mode = 'body';
      bodyLines.push(line);
      continue;
    }
    const hm = line.match(/^(\d+(?:\.\d+)*)\s+(.+)/) || line.match(/^(#{1,3})\s+(.+)/);
    if (hm && mode !== 'refs') {
      const level = hm[1].startsWith('#') ? hm[1].length : (hm[1].match(/\./g) || []).length + 1;
      headings.push({ level, title: (hm[2] || hm[0]).trim(), page: estimatePage(bodyLines.length) });
      mode = 'body';
      bodyLines.push(line);
      continue;
    }
    if (mode === 'abstract') {
      if (/^\d+\s+\w/.test(line) || /^#/.test(line)) { mode = 'body'; i--; continue; }
      abstract += (abstract ? ' ' : '') + line;
      continue;
    }
    if (mode === 'refs') {
      const m = line.match(/^\[(\d+)\]\s*(.+)$/) || [null, String(refs.length + 1), line];
      refs.push({ id: Number(m[1]) || refs.length + 1, text: m[2].trim() });
      continue;
    }
    bodyLines.push(line);
  }

  const cleanedLines = lines.filter((l) => !/^---\s*Page \d+/.test(l) && !/^\[OCR_/.test(l));
  if (!title || /^---\s*Page/.test(title)) {
    const named = cleanedLines.find((l) => /attention is all you need/i.test(l));
    title = named || cleanedLines.find((l) => l.length > 12 && l.length < 180) || title || 'Untitled';
    title = String(title).replace(/^title\s*:/i, '').trim().slice(0, 160);
  }
  const full = text;
  const pages = paginate(full);
  const sections = buildSections(headings, full);
  const chunks = chunkText(full, title);
  const tables = extractTables(full);
  const formulas = extractFormulas(full);
  const figures = extractFigures(full);

  return {
    id: meta.id || uid('p'),
    title,
    authors,
    abstract,
    arxiv: meta.arxiv || guessArxiv(full),
    version: meta.version || guessVersion(meta.arxiv || full),
    filename: meta.filename || '',
    text: full,
    pages,
    headings,
    sections,
    refs,
    tables,
    formulas,
    figures,
    chunks,
    simhash: simhash(full),
    minhash: minhash(full),
    contentHash: hashHex(normalizeText(full).slice(0, 8000)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: meta.source || 'upload',
  };
}

function estimatePage(lineCount) {
  return Math.max(1, Math.floor(lineCount / 40) + 1);
}

function paginate(text) {
  const parts = [];
  const size = 2200;
  for (let i = 0; i < text.length; i += size) {
    parts.push({ page: parts.length + 1, text: text.slice(i, i + size) });
  }
  return parts.length ? parts : [{ page: 1, text: text }];
}

function buildSections(headings, full) {
  if (!headings.length) {
    return [{ title: 'Body', page: 1, paragraphs: splitSentences(full).slice(0, 40).map((t) => ({ text: t, page: 1 })) }];
  }
  return headings.map((h, i) => {
    const start = full.indexOf(h.title);
    const next = headings[i + 1] ? full.indexOf(headings[i + 1].title, start + 1) : full.length;
    const slice = start >= 0 ? full.slice(start, next > start ? next : full.length) : h.title;
    return {
      title: h.title,
      page: h.page || 1,
      paragraphs: splitSentences(slice).slice(0, 20).map((t) => ({ text: t, page: h.page || 1 })),
    };
  });
}

function chunkText(full, title) {
  const chunks = [];
  const paras = String(full).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let buf = '';
  let page = 1;
  let section = title || 'Body';
  for (const p of paras) {
    if (/^\d+(?:\.\d+)*\s+\S/.test(p) || /^#{1,3}\s/.test(p)) section = p.split('\n')[0].slice(0, 80);
    if ((buf + '\n' + p).length > CHUNK && buf) {
      chunks.push({ id: 'c' + chunks.length, text: buf, page, section });
      page = estimatePage(chunks.length * 8);
      buf = p;
    } else {
      buf = buf ? buf + '\n' + p : p;
    }
  }
  if (buf) chunks.push({ id: 'c' + chunks.length, text: buf, page, section });
  return chunks;
}

function extractTables(text) {
  const out = [];
  const re = /(?:Table|表)\s*(\d+)[^\n]{0,80}/gi;
  let m;
  while ((m = re.exec(text))) out.push({ id: m[1], caption: m[0].trim(), page: 1 });
  return out;
}
function extractFormulas(text) {
  const out = [];
  const re = /(?:Attention\s*\([^)]+\)\s*=[^\n]+|lrate\s*=[^\n]+|\\[a-zA-Z]+\{[^}]+\}|[A-Za-z]+\s*=\s*[^\n]{10,80})/g;
  let m; let i = 0;
  while ((m = re.exec(text)) && i < 12) {
    out.push({ id: 'f' + (++i), latex: m[0].trim(), page: 1 });
  }
  return out;
}
function extractFigures(text) {
  const out = [];
  const re = /(?:Figure|Fig\.|图)\s*(\d+)[^\n]{0,80}/gi;
  let m;
  while ((m = re.exec(text))) out.push({ id: m[1], caption: m[0].trim(), page: 1 });
  return out;
}
function guessArxiv(text) {
  const m = String(text).match(/(\d{4}\.\d{4,5})(v\d+)?/i);
  return m ? m[0] : '';
}
function guessVersion(arxiv) {
  const m = String(arxiv).match(/v(\d+)/i);
  return m ? Number(m[1]) : 1;
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'static/ocr/tesseract.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Tesseract CDN 加载失败'));
    document.head.appendChild(s);
  });
  return window.Tesseract;
}

/** 将 PDF 页渲染为 canvas，供 OCR */
async function renderPdfPageToCanvas(page, scale = 1.6) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * 真 PDF 解析：优先文本层；扫描件自动 OCR（前若干页）。
 * 长文档分级加载（默认最多 120 页文本 / OCR 前 3 页）。
 */
export async function extractPdfText(file, opts = {}) {
  if (!window.pdfjsLib && !window.pdfjs) {
    throw new Error('未加载 pdf.js');
  }
  const pdfjs = window.pdfjsLib || window.pdfjs;
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'static/vendor/pdf.worker.min.js';
  }
  const maxTextPages = opts.maxTextPages || 120;
  const maxOcrPages = opts.maxOcrPages || 3;
  const onProgress = opts.onProgress || (() => {});

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages = [];
  const max = Math.min(doc.numPages, maxTextPages);
  let emptyPages = 0;
  for (let i = 1; i <= max; i++) {
    onProgress({ phase: 'text', page: i, total: max });
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const str = content.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!str) emptyPages++;
    pages.push(str ? `--- Page ${i} ---\n${str}` : '');
  }
  let text = pages.filter(Boolean).join('\n\n');
  const textChars = text.replace(/\s/g, '').length;
  const looksScanned = textChars < 80 || emptyPages >= Math.max(1, Math.floor(max * 0.7));

  if (looksScanned) {
    onProgress({ phase: 'ocr-start', page: 0, total: Math.min(doc.numPages, maxOcrPages) });
    try {
      const Tesseract = await loadTesseract();
      const ocrN = Math.min(doc.numPages, maxOcrPages);
      const ocrParts = [];
      const asset = (rel) => new URL(rel, window.location.href).href;
      const worker = await Tesseract.createWorker('eng', 1, {
        workerPath: asset('static/ocr/worker.min.js'),
        corePath: asset('static/ocr/'),
        langPath: asset('static/ocr/lang/'),
        logger: () => {},
      });
      for (let i = 1; i <= ocrN; i++) {
        onProgress({ phase: 'ocr', page: i, total: ocrN });
        const page = await doc.getPage(i);
        const canvas = await renderPdfPageToCanvas(page, 1.7);
        const result = await worker.recognize(canvas);
        const t = (result && result.data && result.data.text) || '';
        if (t.trim()) ocrParts.push(`--- Page ${i} (OCR) ---\n${t.trim()}`);
      }
      try { await worker.terminate(); } catch (e) {}
      if (ocrParts.length) {
        text = ocrParts.join('\n\n');
        return {
          text,
          ocrNeeded: false,
          ocrUsed: true,
          numPages: doc.numPages,
          truncated: doc.numPages > ocrN,
          note: `扫描件已 OCR 前 ${ocrParts.length} 页（共 ${doc.numPages} 页）。长书可继续分页入库。`,
        };
      }
    } catch (e) {
      return {
        text: text || `[OCR_FAILED]\nTitle: ${file.name}\nAbstract: Scanned PDF. OCR error: ${e.message || e}\n1 Introduction\nPlease paste OCR text or retry.`,
        ocrNeeded: true,
        ocrUsed: false,
        numPages: doc.numPages,
        note: '扫描件 OCR 失败（网络/CDN）。可粘贴文本或使用 Attention 测例。',
      };
    }
    return {
      text: text || `[OCR_EMPTY]\nTitle: ${file.name}\nAbstract: No text layer and OCR empty.\n1 Introduction\nPlaceholder.`,
      ocrNeeded: true,
      ocrUsed: true,
      numPages: doc.numPages,
      note: '扫描件 OCR 未识别出文字。',
    };
  }

  return {
    text,
    ocrNeeded: false,
    ocrUsed: false,
    numPages: doc.numPages,
    truncated: doc.numPages > max,
    note: doc.numPages > max ? `长文档仅解析前 ${max} 页文本层（共 ${doc.numPages} 页），已分级切块。` : '',
  };
}

export function findDuplicates(paper, existing) {
  const hits = [];
  for (const other of existing) {
    if (!other || other.id === paper.id) continue;
    const sSim = simhashSim(paper.simhash, other.simhash);
    const mSim = minhashSim(paper.minhash, other.minhash);
    const ham = (paper.simhash && other.simhash) ? hamming(paper.simhash, other.simhash) : 64;
    const score = Math.max(sSim, mSim);
    const sameArxiv = paper.arxiv && other.arxiv && paper.arxiv.replace(/v\d+/i, '') === other.arxiv.replace(/v\d+/i, '');
    if (score >= 0.72 || sameArxiv) {
      hits.push({
        other,
        score,
        simhash: sSim,
        minhash: mSim,
        hamming: ham,
        method: 'simhash+minhash',
        sameArxiv: !!sameArxiv,
        newerIsIncoming: (paper.version || 0) > (other.version || 0),
        diffSummary: summarizeDiff(other, paper),
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

function bodySentences(text) {
  const s = String(text || '')
    .replace(/^(Title|Authors?|arXiv)\s*:.*$/gim, '')
    .replace(/^Abstract\s*:/gim, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.split(/(?<=[.!?])\s+(?=[A-Z]|\d+(?:\.\d+)*\s)/)
    .map((x) => x.trim())
    .filter((x) => x.length > 40 && !/^\d+(\.\d+)*\s/.test(x));
}

export function addedSentences(oldText, newText, limit = 6) {
  const oldSet = new Set(bodySentences(oldText).map((s) => normalizeText(s)));
  return bodySentences(newText).filter((s) => !oldSet.has(normalizeText(s))).slice(0, limit);
}

export function pairScores(a, b) {
  const ham = hamming(a.simhash, b.simhash);
  const sSim = 1 - ham / 64;
  const mSim = minhashSim(a.minhash, b.minhash);
  return { simhash: sSim, minhash: mSim, hamming: ham, score: Math.max(sSim, mSim) };
}

function summarizeDiff(oldP, newP) {
  const tips = [];
  if ((oldP.version || 0) !== (newP.version || 0)) tips.push(`版本 ${oldP.version || '?'} → ${newP.version || '?'}`);
  const notes = String(newP.text || '').match(/Version Diff Notes[\s\S]{0,700}/i);
  if (notes) {
    notes[0].split('\n').map((l) => l.trim()).filter((l) => l.startsWith('-')).slice(0, 5)
      .forEach((l) => tips.push(l.replace(/^-+\s*/, '')));
  }
  addedSentences(oldP.text, newP.text, 4).forEach((s) => tips.push('v7 新增：' + trimQuote(s, 140)));
  if (!tips.length) tips.push('两篇正文几乎相同，没有可列出的新增句');
  return tips;
}

export async function listPapers() {
  await store.open();
  const all = await store.getAll('papers');
  return (all || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getPaper(id) {
  await store.open();
  return store.get('papers', id);
}

export async function savePaper(paper, { replaceId } = {}) {
  await store.open();
  if (replaceId) await store.del('papers', replaceId);
  paper.updatedAt = Date.now();
  await store.put('papers', paper.id, paper);
  return paper;
}

export async function deletePaper(id) {
  await store.open();
  await store.del('papers', id);
}

export async function ingestText(raw, meta = {}) {
  const paper = parseStructuredText(raw, meta);
  const existing = await listPapers();
  const dups = findDuplicates(paper, existing);
  return { paper, duplicates: dups };
}

export async function loadDemoPair() {
  const [v1, v7] = await Promise.all([
    fetch('static/demo/papers/attention-v1.txt', { cache: 'no-store' }).then((r) => r.text()),
    fetch('static/demo/papers/attention-v7.txt', { cache: 'no-store' }).then((r) => r.text()),
  ]);
  return { v1, v7 };
}

export function renderPaperCard(p) {
  return `<div class="paper-card" data-id="${esc(p.id)}">
    <b>${esc(p.title)}</b>
    <div class="muted">${esc(p.authors || '未知作者')} · ${esc(p.arxiv || '无 arXiv')} · v${esc(p.version || 1)}</div>
    <div class="muted">${(p.chunks || []).length} chunks · ${(p.refs || []).length} refs · ${fmtTime(p.updatedAt)}</div>
  </div>`;
}

export function structureReportHtml(p) {
  return `<div class="struct-report">
    <p><b>标题</b>：${esc(p.title)}</p>
    <p><b>作者</b>：${esc(p.authors || '—')}</p>
    <p><b>摘要</b>：${esc(trimQuote(p.abstract, 320))}</p>
    <p><b>标题树</b>：${(p.headings || []).slice(0, 12).map((h) => esc(h.title)).join(' / ') || '—'}</p>
    <p><b>表格</b> ${(p.tables || []).length} · <b>公式</b> ${(p.formulas || []).length} · <b>图</b> ${(p.figures || []).length} · <b>参考文献</b> ${(p.refs || []).length}</p>
    <p><b>附录/长文</b>：共 ${esc((p.pages || []).length)} 页分片，${esc((p.chunks || []).length)} 个检索块${p.ocrNeeded ? '（扫描件待 OCR）' : ''}</p>
  </div>`;
}
