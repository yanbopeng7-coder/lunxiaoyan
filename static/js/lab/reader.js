/**
 * M3：版式感知阅读 + 引用双向跳转 + 中英对照联动滚动
 */
import { esc, splitSentences, trimQuote } from './core.js';

/** 极简学术词典 + 句级对齐，公式/代码保留英文 */
const DICT = [
  [/attention/gi, '注意力'],
  [/transformer/gi, 'Transformer'],
  [/encoder/gi, '编码器'],
  [/decoder/gi, '解码器'],
  [/self-attention/gi, '自注意力'],
  [/multi-head/gi, '多头'],
  [/layer normalization/gi, '层归一化'],
  [/positional encoding/gi, '位置编码'],
  [/machine translation/gi, '机器翻译'],
  [/sequence/gi, '序列'],
  [/training/gi, '训练'],
  [/model/gi, '模型'],
  [/paper/gi, '论文'],
  [/propose/gi, '提出'],
  [/architecture/gi, '架构'],
  [/dataset/gi, '数据集'],
  [/results?/gi, '结果'],
  [/conclusion/gi, '结论'],
  [/future work/gi, '未来工作'],
  [/abstract/gi, '摘要'],
  [/introduction/gi, '引言'],
  [/references?/gi, '参考文献'],
];

export function translateAcademic(text) {
  let s = String(text || '');
  // 保护公式与标识符
  const holds = [];
  s = s.replace(/(`[^`]+`|\$[^$]+\$|Attention\([^)]+\)|[A-Za-z_]+\([^)]*\)|\bBLEU\b|\bGPU\b|\bP100\b|\bWMT\b|\bAdam\b|\bbeta_\d\b|\bN\s*=\s*\d+)/g, (m) => {
    holds.push(m);
    return `⟦${holds.length - 1}⟧`;
  });
  for (const [re, zh] of DICT) s = s.replace(re, zh);
  s = s.replace(/⟦(\d+)⟧/g, (_, i) => holds[Number(i)] || '');
  return s;
}

export function buildAlignedParagraphs(paper) {
  const raw = String(paper.text || '');
  const blocks = raw.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((en, i) => ({
    id: 'para-' + i,
    en,
    zh: translateAcademic(en),
  }));
}

export function renderReader(paper) {
  const paras = buildAlignedParagraphs(paper);
  const tree = (paper.headings || []).map((h) =>
    `<a class="toc-item lv${h.level}" href="#sec-${esc(encodeURIComponent(h.title))}" data-toc="${esc(h.title)}">${esc(h.title)}</a>`
  ).join('') || '<span class="muted">无标题树</span>';

  const body = paras.map((p) => {
    const withCites = linkCitations(p.en);
    return `<div class="rd-para" data-para="${p.id}" id="${/^\d/.test(p.en) ? 'sec-' + encodeURIComponent(p.en.split('\n')[0].slice(0, 80)) : ''}">
      <div class="rd-en">${withCites}</div>
    </div>`;
  }).join('');

  const zhBody = paras.map((p) =>
    `<div class="rd-para" data-para="${p.id}"><div class="rd-zh">${esc(p.zh).replace(/\n/g, '<br>')}</div></div>`
  ).join('');

  const refs = (paper.refs || []).map((r) =>
    `<div class="ref-item" id="ref-${r.id}" data-ref="${r.id}"><b>[${r.id}]</b> ${esc(r.text)}</div>`
  ).join('') || '<div class="muted">无参考文献条目</div>';

  return {
    paras,
    html: `
      <div class="reader-layout">
        <aside class="reader-toc"><h4>标题树</h4>${tree}</aside>
        <div class="reader-panes">
          <div class="reader-col" id="readerEn"><h4>原文</h4><div class="reader-scroll" id="scrollEn">${body}</div></div>
          <div class="reader-col" id="readerZh"><h4>中文对照</h4><div class="reader-scroll" id="scrollZh">${zhBody}</div></div>
        </div>
        <aside class="reader-refs"><h4>References</h4><div id="refList">${refs}</div></aside>
      </div>`,
  };
}

function linkCitations(text) {
  return esc(text)
    .replace(/\[(\d+)\]/g, '<a class="cite-ref" href="#ref-$1" data-ref="$1">[$1]</a>')
    .replace(/\n/g, '<br>');
}

export function bindReaderInteractions(root) {
  if (!root) return;
  const en = root.querySelector('#scrollEn');
  const zh = root.querySelector('#scrollZh');
  let lock = false;
  function sync(from, to) {
    if (!from || !to || lock) return;
    lock = true;
    const ratio = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
    to.scrollTop = ratio * Math.max(1, to.scrollHeight - to.clientHeight);
    lock = false;
  }
  if (en && zh) {
    en.addEventListener('scroll', () => sync(en, zh));
    zh.addEventListener('scroll', () => sync(zh, en));
  }

  root.querySelectorAll('.cite-ref').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('data-ref');
      const el = root.querySelector('#ref-' + id);
      if (!el) return;
      root.querySelectorAll('.ref-item').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  root.querySelectorAll('.ref-item').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-ref');
      root.querySelectorAll('.ref-item').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      const cites = root.querySelectorAll(`.cite-ref[data-ref="${id}"]`);
      if (cites[0]) {
        cites[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        cites.forEach((c) => {
          c.classList.add('flash');
          setTimeout(() => c.classList.remove('flash'), 1200);
        });
      }
    });
  });

  root.querySelectorAll('.toc-item').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const title = a.getAttribute('data-toc');
      const target = [...root.querySelectorAll('.rd-en')].find((n) => n.textContent.includes(title.slice(0, 24)));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

export function jumpToCite(root, paperId, page) {
  if (!root) return;
  const en = root.querySelector('#scrollEn');
  if (!en) return;
  const paras = en.querySelectorAll('.rd-para');
  const idx = Math.min(paras.length - 1, Math.max(0, (Number(page) || 1) - 1));
  if (paras[idx]) paras[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function hoverTranslateSnippet(text) {
  return translateAcademic(trimQuote(text, 280));
}
