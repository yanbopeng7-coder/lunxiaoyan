/**
 * M2：抗幻觉 RAG + 多文对比（稀疏检索 + 出处锚点）
 */
import { contentTokens, citeToken, mdToHtml, trimQuote, esc, sourceBadge } from './core.js';

function buildDf(papers) {
  const df = new Map();
  let nDocs = 0;
  for (const p of papers) {
    for (const c of p.chunks || []) {
      nDocs++;
      const seen = new Set(contentTokens(c.text));
      for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
    }
  }
  return { df, nDocs: Math.max(1, nDocs) };
}

function scoreChunk(queryToks, chunk, df, nDocs) {
  const tf = new Map();
  for (const t of contentTokens(chunk.text)) tf.set(t, (tf.get(t) || 0) + 1);
  let score = 0;
  const hits = [];
  for (const q of queryToks) {
    const f = tf.get(q) || 0;
    if (!f) continue;
    const idf = Math.log(1 + nDocs / (1 + (df.get(q) || 0)));
    const bm = (f * 2.2) / (f + 1.2) * idf;
    score += bm;
    hits.push(q);
  }
  return { score, hits };
}

export function retrieve(papers, question, { topK = 6, paperIds = null } = {}) {
  const pool = paperIds
    ? papers.filter((p) => paperIds.includes(p.id))
    : papers;
  const { df, nDocs } = buildDf(pool);
  const qToks = contentTokens(question);
  const scored = [];
  for (const p of pool) {
    for (const c of p.chunks || []) {
      const { score, hits } = scoreChunk(qToks, c, df, nDocs);
      if (score <= 0) continue;
      scored.push({
        paperId: p.id,
        paperTitle: p.title,
        page: c.page || 1,
        section: c.section || '',
        text: c.text,
        score,
        hits,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function sentencesOf(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 36);
}

/** 只摘原文里已经写明的句子，不另写结论，也不当成模型回答。 */
function quotedAnswer(question, evidence) {
  const q = contentTokens(question);
  const picked = [];
  for (const e of evidence) {
    for (const s of sentencesOf(e.text)) {
      const toks = contentTokens(s);
      const n = q.filter((t) => toks.includes(t)).length;
      if (!n) continue;
      picked.push({ s, e, n });
    }
  }
  picked.sort((a, b) => b.n - a.n);
  const out = [];
  const seen = new Set();
  for (const p of picked) {
    const key = p.s.slice(0, 72);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 8) break;
  }
  return out;
}

/** 离线回答只复述检索命中的原句，不把拼出来的话标成模型结果。 */
export function answerQuestion(papers, question, opts = {}) {
  const evidence = retrieve(papers, question, opts);
  if (!evidence.length) {
    return {
      ok: false,
      mode: 'offline',
      answer: '',
      evidence: [],
      markdown: '证据不足',
      html: sourceBadge('offline') + '<p><b>证据不足</b> — 本地文献库没有匹配片段，拒绝编造答案。</p>',
    };
  }
  const quotes = quotedAnswer(question, evidence);
  const lines = [
    '离线摘录回答：下面每句都从命中原文原样抽出，不是模型生成。',
    '',
    '### 原文原句',
  ];
  if (!quotes.length) {
    lines.push('检索有命中，但没有一整句同时盖住问句里的词。请看下方出处。');
  }
  quotes.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.s} ${citeToken(p.e.paperId, p.e.page, p.e.section)}`);
  });
  lines.push('', '### 原文出处');
  evidence.forEach((e, i) => {
    const tok = citeToken(e.paperId, e.page, e.section);
    lines.push(`${i + 1}. ${tok} 《${e.paperTitle}》 p.${e.page} ${e.section || ''}\n   ${trimQuote(e.text, 480)}`);
  });
  const markdown = lines.join('\n');
  const answer = quotes.map((p) => p.s).join(' ');
  return {
    ok: true,
    mode: 'offline',
    answer,
    evidence,
    markdown,
    html: sourceBadge('offline') + mdToHtml(markdown),
  };
}

export function ragModelPrompt(question, evidence) {
  const bits = (evidence || []).slice(0, 5).map((e, i) =>
    `[${i + 1}] 《${e.paperTitle}》 p.${e.page} ${e.section || ''}\n${trimQuote(e.text, 500)}`
  ).join('\n\n');
  return `只根据下面原文回答，写成可直接演示的短文，不要一句话敷衍。
结构：
1. 直接回答：把原文里已经写明的数字、型号、结论逐条列出，每条后面标 [编号]。
2. 原文依据：用 3 到 6 句转述对应片段，保留专有名词。
3. 证据不足：原文没写的部分单独列出，不要补造。
全文使用中文，不少于 180 字。原文里没有的数字、作者、指标一律写「证据不足」。
问题：${question}

原文：
${bits}`;
}

export function comparePapers(papers, paperIds) {
  const selected = papers.filter((p) => paperIds.includes(p.id));
  if (selected.length < 2) {
    return { ok: false, html: '<p>请至少勾选 2 篇文献做跨文对比。</p>', markdown: '' };
  }
  const rows = [];
  for (const p of selected) {
    const bleu = (p.text.match(/BLEU[^0-9]{0,12}([0-9.]+)/i) || [])[1] || '—';
    const gpu = (p.text.match(/(\d+)\s*NVIDIA\s*\w+/i) || [])[0] || '—';
    const beta = (p.text.match(/beta_1\s*=\s*[0-9.]+/i) || [])[0] || '—';
    const layers = (p.text.match(/N\s*=\s*\d+/i) || [])[0] || '—';
    rows.push({
      id: p.id,
      title: p.title,
      year: (p.arxiv || '').slice(0, 4) || '—',
      bleu,
      gpu,
      beta,
      layers,
      abstract: trimQuote(p.abstract, 140),
    });
  }

  let md = `## 多文对比（${selected.length} 篇）\n\n`;
  md += `下表是从原文用字段匹配摘出的线索，空项为 —。这不是模型写的对比结论。\n\n`;
  md += '\n| 论文 | BLEU/指标线索 | 硬件线索 | Optimizer | 层数 |\n|---|---|---|---|---|\n';
  rows.forEach((r) => {
    md += `| ${r.title.slice(0, 40)} ${citeToken(r.id, 1, 'Abstract')} | ${r.bleu} | ${r.gpu} | ${r.beta} | ${r.layers} |\n`;
  });
  md += '\n### 各篇摘要锚点\n';
  rows.forEach((r) => {
    md += `- ${citeToken(r.id, 1, 'Abstract')} ${r.abstract}\n`;
  });
  md += '\n### 可核对的正文\n';
  selected.forEach((p) => {
    const bits = String(p.text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter((s) => s.length > 40).slice(0, 3);
    md += `\n**${p.title}** ${citeToken(p.id, 1, 'Introduction')}\n`;
    bits.forEach((s) => { md += `- ${s}\n`; });
  });

  return { ok: true, mode: 'offline', markdown: md, html: sourceBadge('offline') + mdToHtml(md), rows };
}

export function evidenceListHtml(evidence) {
  if (!evidence || !evidence.length) return '';
  return '<ol class="evidence-list">' + evidence.map((e) =>
    `<li><a class="cite" data-cite-paper="${esc(e.paperId)}" data-cite-page="${esc(e.page)}" href="#reader">p.${esc(e.page)}</a>
      <b>${esc(e.paperTitle)}</b> · ${esc(e.section || '')} · BM25 ${e.score.toFixed(2)}
      <div class="muted">${esc(trimQuote(e.text, 460))}</div></li>`
  ).join('') + '</ol>';
}
