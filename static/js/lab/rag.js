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

/** 离线只展示检索摘录，不把正则抽出来的句子写成「回答」 */
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
  const lines = ['离线检索摘录（BM25），不是模型回答。', '', '### 原文出处'];
  evidence.forEach((e, i) => {
    const tok = citeToken(e.paperId, e.page, e.section);
    lines.push(`${i + 1}. ${tok} 《${e.paperTitle}》 p.${e.page} — ${trimQuote(e.text, 180)}`);
  });
  const markdown = lines.join('\n');
  return {
    ok: true,
    mode: 'offline',
    answer: '',
    evidence,
    markdown,
    html: sourceBadge('offline') + mdToHtml(markdown),
  };
}

export function ragModelPrompt(question, evidence) {
  const bits = (evidence || []).slice(0, 5).map((e, i) =>
    `[${i + 1}] 《${e.paperTitle}》 p.${e.page} ${e.section || ''}\n${trimQuote(e.text, 500)}`
  ).join('\n\n');
  return `只根据下面原文回答问题。原文里没有的数字、作者、指标一律写「证据不足」，不要编造。\n问题：${question}\n\n原文：\n${bits}`;
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

  return { ok: true, mode: 'offline', markdown: md, html: sourceBadge('offline') + mdToHtml(md), rows };
}

export function evidenceListHtml(evidence) {
  if (!evidence || !evidence.length) return '';
  return '<ol class="evidence-list">' + evidence.map((e) =>
    `<li><a class="cite" data-cite-paper="${esc(e.paperId)}" data-cite-page="${esc(e.page)}" href="#reader">p.${esc(e.page)}</a>
      <b>${esc(e.paperTitle)}</b> · score ${e.score.toFixed(2)}
      <div class="muted">${esc(trimQuote(e.text, 200))}</div></li>`
  ).join('') + '</ol>';
}
