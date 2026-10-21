/**
 * M2：抗幻觉 RAG + 多文对比（稀疏检索 + 出处锚点）
 */
import { contentTokens, citeToken, mdToHtml, normalizeText, trimQuote, esc } from './core.js';

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

function extractFactAnswer(question, evidence) {
  const q = normalizeText(question);
  const blob = evidence.map((e) => e.text).join('\n');

  if (/beta_?1|β_?1|adam|optimizer|优化器/.test(q)) {
    const m = blob.match(/beta_?\s*1\s*=\s*([0-9.]+)/i) || blob.match(/β_?\s*1\s*=\s*([0-9.]+)/i);
    const m2 = blob.match(/beta_?\s*2\s*=\s*([0-9.]+)/i);
    if (m) {
      return `Adam 优化器设置：β₁=${m[1]}${m2 ? `，β₂=${m2[1]}` : ''}（见证据锚点）。`;
    }
  }
  if (/gpu|p100|hardware|硬件|显卡/.test(q)) {
    const m = blob.match(/(\d+)\s*NVIDIA\s*P100/i) || blob.match(/(\d+)\s*P100/i);
    if (m) return `训练硬件：${m[1]} 块 NVIDIA P100 GPU（见证据锚点）。`;
  }
  if (/bleu|分数|score/.test(q)) {
    const ms = [...blob.matchAll(/BLEU[^0-9]{0,20}([0-9.]+)/gi)].map((x) => x[1]);
    if (ms.length) return `文中报告的 BLEU 包括：${[...new Set(ms)].slice(0, 4).join('、')}（见证据锚点）。`;
  }
  if (/author|作者|机构/.test(q)) {
    const titles = evidence.map((e) => e.paperTitle).filter(Boolean);
    return `相关论文：${[...new Set(titles)].join('；')}。作者信息请见文献库卡片（证据见锚点）。`;
  }
  if (/layer|层数|n\s*=\s*6|encoder/.test(q)) {
    const m = blob.match(/N\s*=\s*(\d+)/);
    if (m) return `Encoder/Decoder 堆叠层数 N=${m[1]}（见证据锚点）。`;
  }

  // 默认：用最高分证据句作答，严禁编造
  const top = evidence[0];
  if (!top) return null;
  return `根据检索到的原文证据：${trimQuote(top.text, 220)}`;
}

export function answerQuestion(papers, question, opts = {}) {
  const evidence = retrieve(papers, question, opts);
  if (!evidence.length) {
    return {
      ok: false,
      answer: '证据不足：本地文献库中未检索到与问题匹配的原文片段，拒绝编造答案。请先入库相关 PDF/TXT，或换更具体的问题（如 β₁、P100、BLEU）。',
      evidence: [],
      markdown: '**证据不足** — 未返回答案。',
      html: '<p><b>证据不足</b> — 未返回答案，避免幻觉。</p>',
    };
  }
  const fact = extractFactAnswer(question, evidence);
  const lines = [fact || '见下列证据。', '', '### 原文出处'];
  evidence.forEach((e, i) => {
    const tok = citeToken(e.paperId, e.page, e.section);
    lines.push(`${i + 1}. ${tok} 《${e.paperTitle}》 p.${e.page} — ${trimQuote(e.text, 160)}`);
  });
  const markdown = lines.join('\n');
  return {
    ok: true,
    answer: fact,
    evidence,
    markdown,
    html: mdToHtml(markdown),
  };
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

  // 演进叙事（基于标题关键词，挂锚点）
  const narrative = [];
  const hasTransformer = selected.filter((p) => /attention is all you need|transformer/i.test(p.title + p.text.slice(0, 200)));
  const hasBert = selected.filter((p) => /\bbert\b/i.test(p.title + p.abstract));
  if (hasTransformer.length && hasBert.length) {
    const t = hasTransformer[0];
    const b = hasBert[0];
    narrative.push(
      `BERT 承袭 Transformer Encoder 的双向自注意力，但抛弃 Decoder 与生成式目标；对比见 ${citeToken(t.id, 1, 'Model')} 与 ${citeToken(b.id, 1, 'Abstract')}。`
    );
  }
  if (selected.length >= 2) {
    narrative.push(
      `参数量/指标对比以各篇原文为准，下表只汇总可检索到的字段，未出现的字段标为 —，不编造。`
    );
  }

  let md = `## 多文对比（${selected.length} 篇）\n\n`;
  narrative.forEach((n) => { md += `- ${n}\n`; });
  md += '\n| 论文 | BLEU/指标线索 | 硬件线索 | Optimizer | 层数 |\n|---|---|---|---|---|\n';
  rows.forEach((r) => {
    md += `| ${r.title.slice(0, 40)} ${citeToken(r.id, 1, 'Abstract')} | ${r.bleu} | ${r.gpu} | ${r.beta} | ${r.layers} |\n`;
  });
  md += '\n### 各篇摘要锚点\n';
  rows.forEach((r) => {
    md += `- ${citeToken(r.id, 1, 'Abstract')} ${r.abstract}\n`;
  });

  return { ok: true, markdown: md, html: mdToHtml(md), rows };
}

export function evidenceListHtml(evidence) {
  if (!evidence || !evidence.length) return '';
  return '<ol class="evidence-list">' + evidence.map((e) =>
    `<li><a class="cite" data-cite-paper="${esc(e.paperId)}" data-cite-page="${esc(e.page)}" href="#reader">p.${esc(e.page)}</a>
      <b>${esc(e.paperTitle)}</b> · score ${e.score.toFixed(2)}
      <div class="muted">${esc(trimQuote(e.text, 200))}</div></li>`
  ).join('') + '</ol>';
}
