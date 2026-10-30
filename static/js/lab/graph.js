/**
 * M5：局域引用图谱 + 基石节点 + 自动综述 + Future Work 挖掘
 */
import { normalizeText, contentTokens, jaccard, esc, trimQuote, mdToHtml, uid } from './core.js';
import { parseStructuredText } from './library.js';

/** 预置 ~16 篇相关文献元数据，用于一键演示图谱 */
export const DEMO_CORPUS = [
  { title: 'Attention Is All You Need', year: 2017, arxiv: '1706.03762', refs: ['Neural machine translation by jointly learning to align and translate', 'Effective approaches to attention-based neural machine translation'], future: 'Apply attention to other modalities; investigate restricted attention for long inputs.', abstract: 'Transformer based solely on attention.' },
  { title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', year: 2019, arxiv: '1810.04805', refs: ['Attention Is All You Need', 'Improving Language Understanding by Generative Pre-Training'], future: 'Explore larger models and multi-task fine-tuning.', abstract: 'Bidirectional Transformer encoder pretraining.' },
  { title: 'Improving Language Understanding by Generative Pre-Training', year: 2018, arxiv: 'gpt1', refs: ['Attention Is All You Need'], future: 'Scale unsupervised pre-training.', abstract: 'GPT-1 generative pretraining.' },
  { title: 'Language Models are Unsupervised Multitask Learners', year: 2019, arxiv: 'gpt2', refs: ['Improving Language Understanding by Generative Pre-Training', 'Attention Is All You Need'], future: 'Further scale and zero-shot transfer.', abstract: 'GPT-2.' },
  { title: 'Language Models are Few-Shot Learners', year: 2020, arxiv: '2005.14165', refs: ['Language Models are Unsupervised Multitask Learners', 'Attention Is All You Need'], future: 'Improve sample efficiency and alignment.', abstract: 'GPT-3 175B few-shot.' },
  { title: 'Neural machine translation by jointly learning to align and translate', year: 2015, arxiv: '1409.0473', refs: [], future: 'Better alignment models.', abstract: 'Bahdanau attention NMT.' },
  { title: 'Effective approaches to attention-based neural machine translation', year: 2015, arxiv: '1508.04025', refs: ['Neural machine translation by jointly learning to align and translate'], future: 'Local attention variants.', abstract: 'Luong attention.' },
  { title: 'Deep Residual Learning for Image Recognition', year: 2016, arxiv: '1512.03385', refs: [], future: 'Deeper residual architectures.', abstract: 'ResNet.' },
  { title: 'Layer Normalization', year: 2016, arxiv: '1607.06450', refs: [], future: 'Normalization for diverse architectures.', abstract: 'LayerNorm.' },
  { title: 'Convolutional Sequence to Sequence Learning', year: 2017, arxiv: '1705.03122', refs: ['Neural machine translation by jointly learning to align and translate'], future: 'Combine conv and attention.', abstract: 'ConvS2S.' },
  { title: 'Universal Transformers', year: 2019, arxiv: '1807.03819', refs: ['Attention Is All You Need'], future: 'Adaptive computation time.', abstract: 'Recurrent Transformer depth.' },
  { title: 'Transformer-XL: Attentive Language Models Beyond a Fixed-Length Context', year: 2019, arxiv: '1901.02860', refs: ['Attention Is All You Need'], future: 'Longer context with segment recurrence.', abstract: 'Transformer-XL.' },
  { title: 'Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer', year: 2020, arxiv: '1910.10683', refs: ['Attention Is All You Need', 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding'], future: 'Scale T5 and tasks.', abstract: 'T5.' },
  { title: 'RoBERTa: A Robustly Optimized BERT Pretraining Approach', year: 2019, arxiv: '1907.11692', refs: ['BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', 'Attention Is All You Need'], future: 'Better pretraining recipes.', abstract: 'RoBERTa.' },
  { title: 'XLNet: Generalized Autoregressive Pretraining for Language Understanding', year: 2019, arxiv: '1906.08237', refs: ['BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', 'Attention Is All You Need'], future: 'Permutation LM scaling.', abstract: 'XLNet.' },
  { title: 'Electra: Pre-training Text Encoders as Discriminators Rather Than Generators', year: 2020, arxiv: '2003.10555', refs: ['BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding'], future: 'Efficient discriminative pretraining.', abstract: 'ELECTRA.' },
];

export function corpusToPapers(list = DEMO_CORPUS) {
  return list.map((item, i) => {
    const refLines = (item.refs || []).map((t, j) => `[${j + 1}] ${t}.`).join('\n');
    const raw = `Title: ${item.title}
Authors: Demo Corpus
arXiv: ${item.arxiv || ''}
Abstract: ${item.abstract || ''}

1 Introduction
${item.abstract || item.title}

7 Conclusion
See references.

Future Work
${item.future || ''}

References
${refLines}
`;
    const p = parseStructuredText(raw, {
      id: 'demo' + i + '_' + (item.arxiv || i),
      source: 'demo-corpus',
      arxiv: item.arxiv,
      version: 1,
    });
    p.year = item.year;
    p.futureWork = item.future || '';
    return p;
  });
}

function titleKey(t) {
  return normalizeText(t).replace(/[^a-z0-9\u4e00-\u9fff]+/g, '').slice(0, 48);
}

export function buildCitationGraph(papers) {
  const nodes = papers.map((p) => ({
    id: p.id,
    title: p.title,
    year: p.year || Number(String(p.arxiv || '').slice(0, 4)) || null,
    arxiv: p.arxiv || '',
    futureWork: p.futureWork || extractFuture(p.text || ''),
  }));
  const byTitle = new Map();
  nodes.forEach((n) => byTitle.set(titleKey(n.title), n.id));

  const edges = [];
  for (const p of papers) {
    for (const r of p.refs || []) {
      const key = titleKey(r.text);
      let target = null;
      for (const [tk, id] of byTitle) {
        if (!tk || !key) continue;
        if (key.includes(tk) || tk.includes(key) || key.slice(0, 20) === tk.slice(0, 20)) {
          target = id;
          break;
        }
      }
      if (target && target !== p.id) edges.push({ source: p.id, target, label: '[' + r.id + ']' });
    }
  }
  // 去重边
  const seen = new Set();
  const uniq = [];
  for (const e of edges) {
    const k = e.source + '->' + e.target;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(e);
  }
  const scores = pageRank(nodes, uniq);
  nodes.forEach((n) => {
    n.score = scores[n.id] || 0;
    n.inDeg = uniq.filter((e) => e.target === n.id).length;
    n.outDeg = uniq.filter((e) => e.source === n.id).length;
  });
  const ranked = [...nodes].sort((a, b) => b.score - a.score);
  const cornerstone = ranked.slice(0, Math.min(3, ranked.length)).map((n) => n.id);
  const peripheral = ranked.slice(-Math.min(3, ranked.length)).map((n) => n.id);
  return { nodes, edges: uniq, cornerstone, peripheral, ranked };
}

function pageRank(nodes, edges, { iter = 30, d = 0.85 } = {}) {
  const ids = nodes.map((n) => n.id);
  const n = ids.length || 1;
  let rank = Object.fromEntries(ids.map((id) => [id, 1 / n]));
  const out = Object.fromEntries(ids.map((id) => [id, []]));
  edges.forEach((e) => { if (out[e.source]) out[e.source].push(e.target); });
  for (let t = 0; t < iter; t++) {
    const next = Object.fromEntries(ids.map((id) => [id, (1 - d) / n]));
    for (const id of ids) {
      const targets = out[id];
      const share = targets.length ? (d * rank[id]) / targets.length : 0;
      if (!targets.length) {
        ids.forEach((j) => { next[j] += (d * rank[id]) / n; });
      } else {
        targets.forEach((j) => { next[j] += share; });
      }
    }
    rank = next;
  }
  return rank;
}

function extractFuture(text) {
  const m = String(text).match(/Future Work[\s\S]{0,500}/i);
  return m ? trimQuote(m[0].replace(/^Future Work\s*/i, ''), 280) : '';
}

export function mineFutureWork(graph, papers) {
  const byId = Object.fromEntries(papers.map((p) => [p.id, p]));
  const ideas = [];
  for (const n of graph.nodes) {
    const fw = n.futureWork || extractFuture((byId[n.id] || {}).text || '');
    if (!fw) continue;
    ideas.push({
      paperId: n.id,
      title: n.title,
      year: n.year || 0,
      text: fw,
      resolved: false,
    });
  }
  // 若较新年份论文标题/摘要命中旧 idea 关键词，则标记已解决
  for (const idea of ideas) {
    const keys = contentTokens(idea.text).filter((t) => t.length > 3).slice(0, 8);
    for (const other of graph.nodes) {
      if ((other.year || 0) <= (idea.year || 0)) continue;
      const bag = new Set(contentTokens(other.title + ' ' + ((byId[other.id] || {}).abstract || '')));
      let hit = 0;
      keys.forEach((k) => { if (bag.has(k)) hit++; });
      if (hit >= 2) {
        idea.resolved = true;
        idea.resolvedBy = other.title;
        break;
      }
    }
  }
  const open = ideas.filter((i) => !i.resolved);
  const closed = ideas.filter((i) => i.resolved);
  return { open, closed };
}

export function generateSurvey(graph, papers) {
  const top = graph.ranked.slice(0, 5);
  const { open, closed } = mineFutureWork(graph, papers);
  let md = `## 领域短综述（基于 ${papers.length} 篇局域引用图）\n\n`;
  md += `本图谱共 **${graph.nodes.length}** 个节点、**${graph.edges.length}** 条引用边。`;
  md += `按 PageRank，基石论文为：${graph.cornerstone.map((id) => {
    const n = graph.nodes.find((x) => x.id === id);
    return n ? `《${n.title}》` : id;
  }).join('、')}。\n\n`;
  md += `### 演进脉络\n`;
  top.forEach((n, i) => {
    md += `${i + 1}. (${n.year || '?'}) ${n.title} — PR=${n.score.toFixed(4)}，入度 ${n.inDeg}\n`;
  });
  md += `\n### Future Work 挖掘\n`;
  md += `- 仍具探索价值（未被后续节点明显覆盖）：**${open.length}** 条\n`;
  open.slice(0, 5).forEach((i) => {
    md += `  - 《${i.title}》(${i.year})：${i.text}\n`;
  });
  md += `- 可能已被后续工作推进：**${closed.length}** 条\n`;
  closed.slice(0, 4).forEach((i) => {
    md += `  - 《${i.title}》→ 疑似由《${i.resolvedBy}》推进\n`;
  });
  return { markdown: md, html: mdToHtml(md), open, closed };
}

export function renderGraphSvg(graph, { width = 720, height = 420 } = {}) {
  const nodes = graph.nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, graph.nodes.length);
    const r = 140 + (n.score || 0) * 80;
    return {
      ...n,
      x: width / 2 + Math.cos(angle) * r,
      y: height / 2 + Math.sin(angle) * r,
      radius: 10 + Math.min(18, (n.inDeg || 0) * 3 + (n.score || 0) * 40),
      kind: graph.cornerstone.includes(n.id) ? 'corner' : graph.peripheral.includes(n.id) ? 'edge' : 'mid',
    };
  });
  const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const lines = graph.edges.map((e) => {
    const a = pos[e.source]; const b = pos[e.target];
    if (!a || !b) return '';
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="g-edge" />`;
  }).join('');
  const circles = nodes.map((n) => `
    <g class="g-node g-${n.kind}" data-id="${esc(n.id)}">
      <circle cx="${n.x}" cy="${n.y}" r="${n.radius}" />
      <text x="${n.x}" y="${n.y + n.radius + 12}" text-anchor="middle">${esc((n.title || '').slice(0, 18))}</text>
    </g>`).join('');
  return `<svg class="graph-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
    ${lines}${circles}
  </svg>
  <p class="muted">金色=基石节点（PageRank 高），灰色=边缘衍生；边=参考文献匹配。</p>`;
}
