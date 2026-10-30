/**
 * M4：论文检索 / arXiv 追踪 / 智能推荐
 */
import { contentTokens, jaccard, esc, trimQuote, uid } from './core.js';
import { parseStructuredText } from './library.js';

function apiBase() {
  if (typeof window !== 'undefined' && window.PUBLIC_API_BASE) return String(window.PUBLIC_API_BASE).replace(/\/$/, '');
  return '';
}

export async function searchArxiv(query, { max = 8 } = {}) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: '请输入检索词', items: [] };
  const url = `${apiBase()}/api/arxiv?q=${encodeURIComponent(q)}&max=${max}`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    return { ok: true, items: data.items || [], source: data.source || 'arxiv' };
  } catch (e) {
    // 离线回退：本地演示结果
    return { ok: true, offline: true, items: offlineDemo(q), source: 'offline-demo' };
  }
}

function offlineDemo(q) {
  const all = [
    {
      id: '1706.03762',
      title: 'Attention Is All You Need',
      authors: 'Vaswani et al.',
      summary: 'Transformer architecture based solely on attention mechanisms.',
      published: '2017-06-12',
      pdf: 'https://arxiv.org/pdf/1706.03762',
      github: 'https://github.com/tensorflow/tensor2tensor',
      scoreHint: 0.95,
    },
    {
      id: '1810.04805',
      title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
      authors: 'Devlin et al.',
      summary: 'Bidirectional Encoder Representations from Transformers.',
      published: '2018-10-11',
      pdf: 'https://arxiv.org/pdf/1810.04805',
      github: 'https://github.com/google-research/bert',
      scoreHint: 0.9,
    },
    {
      id: '2005.14165',
      title: 'Language Models are Few-Shot Learners (GPT-3)',
      authors: 'Brown et al.',
      summary: '175B parameter autoregressive language model.',
      published: '2020-05-28',
      pdf: 'https://arxiv.org/pdf/2005.14165',
      github: '',
      scoreHint: 0.88,
    },
  ];
  const toks = new Set(contentTokens(q));
  return all
    .map((it) => {
      const bag = new Set(contentTokens(it.title + ' ' + it.summary));
      let inter = 0;
      for (const t of toks) if (bag.has(t)) inter++;
      return { ...it, scoreHint: inter / Math.max(1, toks.size) };
    })
    .filter((it) => it.scoreHint > 0 || /attention|bert|gpt|transformer/i.test(q))
    .sort((a, b) => b.scoreHint - a.scoreHint);
}

export function filterQuality(items) {
  return (items || []).filter((it) => {
    const s = String(it.summary || '');
    if (s.length < 40) return false;
    if (/workshop poster abstract only/i.test(s)) return false;
    return true;
  }).map((it) => ({
    ...it,
    gold: !!it.github,
    reason: it.github
      ? '附带 GitHub 开源，易复现，优先推荐'
      : '相关性匹配；暂未检测到官方代码链接',
  }));
}

export function refLineToQuery(line) {
  return String(line || '')
    .replace(/^\[\d+\]\s*/, '')
    .replace(/https?:\/\/\S+/g, '')
    .slice(0, 120)
    .trim();
}

export async function drillDownRefs(refText) {
  const lines = String(refText || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines.slice(0, 5)) {
    const q = refLineToQuery(line);
    const res = await searchArxiv(q, { max: 3 });
    const best = filterQuality(res.items)[0];
    out.push({ query: q, hit: best || null, offline: !!res.offline });
  }
  return out;
}

export function recommendFromLibrary(papers, { likes = {}, dislikes = {} } = {}) {
  if (!papers.length) return [];
  const corpus = papers.map((p) => ({
    p,
    bag: new Set(contentTokens((p.title || '') + ' ' + (p.abstract || '') + ' ' + (p.text || '').slice(0, 2000))),
  }));
  const recs = [];
  for (let i = 0; i < corpus.length; i++) {
    for (let j = i + 1; j < corpus.length; j++) {
      const sim = jaccard(corpus[i].bag, corpus[j].bag);
      if (sim < 0.05) continue;
      recs.push({
        a: corpus[i].p,
        b: corpus[j].p,
        score: sim,
        reason: `与库内文献词袋相关度 ${(sim * 100).toFixed(1)}%`,
      });
    }
  }
  // 也生成“外部种子推荐”
  const seeds = offlineDemo(papers[0].title || 'transformer');
  seeds.forEach((s) => {
    const already = papers.some((p) => (p.arxiv || '').includes(s.id) || normalizeLoose(p.title) === normalizeLoose(s.title));
    if (already) return;
    let score = s.scoreHint || 0.5;
    if (s.github) score += 0.15;
    if (likes[s.id]) score += 0.2;
    if (dislikes[s.id]) score -= 0.4;
    recs.push({
      external: s,
      score,
      reason: s.github ? '领域相关且含 GitHub 代码' : '与本地库主题相近',
    });
  });
  recs.sort((a, b) => b.score - a.score);
  return recs.slice(0, 12);
}

function normalizeLoose(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

export function itemToPaperDraft(item) {
  const raw = `Title: ${item.title}
Authors: ${item.authors || ''}
arXiv: ${item.id}
Abstract: ${item.summary || ''}

1 Introduction
Auto-imported metadata from arXiv search. Full PDF can be uploaded later for fine-grained parse.

References
[1] ${item.title}. arXiv:${item.id}.
`;
  return parseStructuredText(raw, {
    id: uid('arx'),
    filename: (item.id || 'arxiv') + '.txt',
    source: 'arxiv',
    arxiv: item.id,
  });
}

export function renderSearchResults(items) {
  if (!items.length) return '<p class="muted">无结果</p>';
  return items.map((it) => `
    <div class="hit-card" data-arxiv="${esc(it.id)}">
      <b>${esc(it.title)}</b>
      <div class="muted">${esc(it.authors || '')} · ${esc(it.published || '')} ${it.github ? '· <span class="tag-gold">GitHub</span>' : ''}</div>
      <p>${esc(trimQuote(it.summary, 180))}</p>
      <p class="muted">${esc(it.reason || '')}</p>
      <button type="button" class="btn ghost btn-ingest" data-id="${esc(it.id)}">入库</button>
      ${it.pdf ? `<a class="btn ghost" href="${esc(it.pdf)}" target="_blank" rel="noopener">PDF</a>` : ''}
      <button type="button" class="btn ghost btn-like" data-id="${esc(it.id)}">赞</button>
      <button type="button" class="btn ghost btn-dislike" data-id="${esc(it.id)}">踩</button>
    </div>`).join('');
}
