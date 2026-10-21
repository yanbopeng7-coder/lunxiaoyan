/**
 * M3：版式感知阅读 + 引用双向跳转 + 中英对照联动滚动
 * 翻译策略：整句/短语映射（禁止单词插替导致中英混杂）；未知段保留英文并标〔待译〕；可调模型补全。
 */
import { esc, trimQuote } from './core.js';

/** 先长后短：整句 / 固定短语 → 完整中文 */
const PHRASES = [
  [/^Title:\s*(.+)$/im, (_, t) => '标题：' + t.trim()],
  [/^Authors?:\s*(.+)$/im, (_, t) => '作者：' + t.trim()],
  [/^arXiv:\s*(.+)$/im, (_, t) => 'arXiv：' + t.trim()],
  [/^Abstract:\s*/im, '摘要：'],
  [/^References?\s*$/im, '参考文献'],
  [/^Future Work(?:\s*\([^)]*\))?\s*$/im, '未来工作'],
  [/^Version Diff Notes.*$/im, '相对 v1 的版本差异说明'],
  [/^1\s+Introduction\s*$/im, '1 引言'],
  [/^2\s+Background\s*$/im, '2 背景'],
  [/^3\s+Model Architecture\s*$/im, '3 模型架构'],
  [/^3\.1\s+Encoder and Decoder Stacks\s*$/im, '3.1 编码器与解码器堆叠'],
  [/^3\.2\s+Attention\s*$/im, '3.2 注意力机制'],
  [/^3\.3\s+Position-wise Feed-Forward Networks\s*$/im, '3.3 逐位置前馈网络'],
  [/^3\.4\s+Positional Encoding\s*$/im, '3.4 位置编码'],
  [/^3\.5\s+Applications of Attention.*$/im, '3.5 注意力在本模型中的应用'],
  [/^4\s+Why Self-Attention\s*$/im, '4 为何使用自注意力'],
  [/^5\s+Training\s*$/im, '5 训练'],
  [/^5\.1\s+Training Data and Batching\s*$/im, '5.1 训练数据与批处理'],
  [/^5\.2\s+Hardware and Schedule\s*$/im, '5.2 硬件与训练日程'],
  [/^5\.3\s+Optimizer\s*$/im, '5.3 优化器'],
  [/^6\s+Results\s*$/im, '6 实验结果'],
  [/^7\s+Conclusion\s*$/im, '7 结论'],

  [/The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder\./gi,
    '主流的序列转导模型基于包含编码器与解码器的复杂循环神经网络或卷积神经网络。'],
  [/The best performing models also connect the encoder and decoder through an attention mechanism\./gi,
    '表现最好的模型还会通过注意力机制连接编码器与解码器。'],
  [/We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely\./gi,
    '我们提出一种全新的简单网络架构——Transformer，完全基于注意力机制，彻底摒弃了循环与卷积结构。'],
  [/Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train\./gi,
    '在两项机器翻译任务上的实验表明，该模型在翻译质量上更优，同时更易并行，训练时间显著更短。'],
  [/Our model achieves 28\.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results by over 2 BLEU\./gi,
    '本模型在 WMT 2014 英→德翻译任务上达到 28.4 BLEU，较此前最佳结果提升超过 2 个 BLEU。'],

  [/Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation\./gi,
    '循环神经网络——尤其是长短期记忆网络与门控循环网络——已被确立为语言建模、机器翻译等序列建模与转导问题的主流方法。'],
  [/Attention mechanisms have become an integral part of compelling sequence modeling and transduction models in various tasks, allowing modeling of dependencies without regard to their distance in the input or output sequences\./gi,
    '注意力机制已成为诸多序列建模与转导模型的核心组件，能够建模输入/输出序列中任意距离的依赖关系。'],
  [/The Transformer is the first transduction model relying entirely on self-attention to compute representations of its input and output without using sequence-aligned RNNs or convolution\./gi,
    'Transformer 是首个完全依赖自注意力计算输入与输出表示、而不使用序列对齐 RNN 或卷积的转导模型。'],

  [/The encoder is composed of a stack of N = 6 identical layers\./gi,
    '编码器由 N = 6 个相同层堆叠而成。'],
  [/Each layer has two sub-layers\./gi, '每一层包含两个子层。'],
  [/The first is a multi-head self-attention mechanism, and the second is a simple, position-wise fully connected feed-forward network\./gi,
    '第一层是多头自注意力机制，第二层是简单的逐位置全连接前馈网络。'],
  [/We employ a residual connection around each of the two sub-layers, followed by layer normalization\./gi,
    '我们在每个子层周围使用残差连接，并随后进行层归一化。'],
  [/That is, the output of each sub-layer is LayerNorm\(x \+ Sublayer\(x\)\)\./gi,
    '即每个子层的输出为 LayerNorm(x + Sublayer(x))。'],

  [/An attention function can be described as mapping a query and a set of key-value pairs to an output\./gi,
    '注意力函数可描述为：将查询（query）与一组键值对映射为输出。'],
  [/We call our particular attention "Scaled Dot-Product Attention"\./gi,
    '我们将所采用的注意力称为「缩放点积注意力」（Scaled Dot-Product Attention）。'],
  [/The input consists of queries and keys of dimension d_k, and values of dimension d_v\./gi,
    '输入由维度为 d_k 的查询与键，以及维度为 d_v 的值组成。'],
  [/We compute the attention as Attention\(Q, K, V\) = softmax\(Q K\^T \/ sqrt\(d_k\)\) V\./gi,
    '注意力计算为 Attention(Q, K, V) = softmax(Q K^T / sqrt(d_k)) V。'],
  [/Multi-head attention allows the model to jointly attend to information from different representation subspaces(?: at different positions)?\./gi,
    '多头注意力使模型能够联合关注来自不同表示子空间的信息。'],
  [/With a single attention head, averaging inhibits this\./gi,
    '若仅使用单头注意力，平均操作会抑制这种能力。'],

  [/Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the sequence, we must inject some information about the relative or absolute position of the tokens in the sequence\./gi,
    '由于模型不含循环与卷积，为利用序列顺序信息，必须向词元注入相对或绝对位置信息。'],
  [/We use sine and cosine functions of different frequencies\./gi,
    '我们使用不同频率的正弦与余弦函数作为位置编码。'],

  [/Self-attention layers connect all positions with a constant number of sequentially executed operations, whereas a recurrent layer requires O\(n\) sequential operations\./gi,
    '自注意力层以常数次串行操作连接所有位置，而循环层需要 O(n) 次串行操作。'],
  [/In terms of computational complexity, self-attention layers are faster than recurrent layers when the sequence length n is smaller than the representation dimensionality d\./gi,
    '就计算复杂度而言，当序列长度 n 小于表示维度 d 时，自注意力层快于循环层。'],

  [/We trained on the standard WMT 2014 English-German dataset consisting of about 4\.5 million sentence pairs\./gi,
    '我们在约 450 万句对的标准 WMT 2014 英德数据集上训练。'],
  [/We trained our models on one machine with 8 NVIDIA P100 GPUs\./gi,
    '模型在一台配备 8 块 NVIDIA P100 GPU 的机器上训练。'],
  [/We used the Adam optimizer with beta_1 = 0\.9, beta_2 = 0\.98 and epsilon = 10\^-9\./gi,
    '优化器采用 Adam，其中 β₁ = 0.9，β₂ = 0.98，ε = 10⁻⁹。'],

  [/On the WMT 2014 English-to-German translation task, the big Transformer model(?: \(Transformer big\))? outperforms the best previously reported models(?: \(including ensembles\))? by more than 2\.0 BLEU, establishing a new state-of-the-art BLEU score of 28\.4\./gi,
    '在 WMT 2014 英→德翻译任务上，大号 Transformer 以超过 2.0 BLEU 的优势超越此前最佳结果，达到新的 SOTA：28.4 BLEU。'],
  [/On WMT 2014 English-to-French, our model achieves a BLEU score of 41\.0, outperforming all previously published single models(?:, at less than 1\/4 the training cost of the previous state-of-the-art model)?\./gi,
    '在 WMT 2014 英→法任务上，模型达到 41.0 BLEU，超越此前所有已发表的单模型结果。'],

  [/In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacing the recurrent layers most commonly used in encoder-decoder architectures with multi-headed self-attention\./gi,
    '本文提出 Transformer——首个完全基于注意力的序列转导模型，用多头自注意力取代编码器–解码器中常用的循环层。'],
  [/For translation tasks, the Transformer can be trained significantly faster than architectures based on recurrent or convolutional layers\./gi,
    '在翻译任务上，Transformer 的训练速度显著快于基于循环或卷积的架构。'],
];

function protectTokens(s) {
  const holds = [];
  const out = String(s || '').replace(
    /(`[^`]+`|\$[^$]+\$|Attention\s*\([^)]+\)|LayerNorm\([^)]+\)|softmax\([^)]+\)|\bBLEU\b|\bGPU\b|\bP100\b|\bWMT\b|\bAdam\b|\bbeta_[12]\b|\bd_[kv]\b|\bN\s*=\s*\d+|\bO\([^)]+\)|\d+\.\d+\s*BLEU)/g,
    (m) => {
      holds.push(m);
      return `⟦${holds.length - 1}⟧`;
    }
  );
  return { out, holds };
}

function restoreTokens(s, holds) {
  return String(s).replace(/⟦(\d+)⟧/g, (_, i) => holds[Number(i)] || '');
}

/** 统计拉丁字母占比，判断是否仍是「中英夹杂烂译」 */
function latinRatio(s) {
  const t = String(s || '');
  if (!t) return 0;
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  return latin / Math.max(1, latin + cjk);
}

/**
 * 离线学术翻译：只做整句/短语替换，绝不做单词插替。
 * 未命中的英文段落原样保留，前缀〔待译〕，避免「注意力 Is All You Need」这类混杂。
 */
function applyPhrases(text) {
  let { out, holds } = protectTokens(text);
  let hit = false;
  for (const [re, rep] of PHRASES) {
    const next = out.replace(re, rep);
    if (next !== out) {
      out = next;
      hit = true;
    }
  }
  out = restoreTokens(out, holds);
  return { out, hit };
}

/** 按句切开，便于整句命中（避免 Title+Abstract 粘在同一块时整块失败） */
function splitForTranslate(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  const lines = raw.split('\n');
  const parts = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // 标签行整行保留
    if (/^(Title|Authors?|arXiv|Abstract)\s*:/i.test(t) || /^[\d.]+\s+\S/.test(t) || /^Future Work/i.test(t) || /^References?/i.test(t)) {
      parts.push(t);
      continue;
    }
    // 英文句号切分
    const sents = t.match(/[^.!?。！？]+[.!?。！？]?/g) || [t];
    sents.map((s) => s.trim()).filter(Boolean).forEach((s) => parts.push(s));
  }
  return parts;
}

export function translateAcademic(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  // 参考文献行：保留英文题录
  if (/^\[\d+\]\s/.test(raw)) {
    return raw;
  }

  const parts = splitForTranslate(raw);
  const outParts = [];
  let anyHit = false;
  for (const part of parts) {
    const { out, hit } = applyPhrases(part);
    if (hit && latinRatio(out) < 0.5) {
      outParts.push(out);
      anyHit = true;
    } else if (hit && /^(标题|作者|arXiv|摘要)：/.test(out)) {
      // 标签已中文化；若后面仍有英文，继续对后缀译
      const m = out.match(/^(标题|作者|arXiv|摘要)：(.*)$/);
      if (m && m[2].trim()) {
        const rest = applyPhrases(m[2].trim());
        if (rest.hit && latinRatio(rest.out) < 0.5) {
          outParts.push(m[1] + '：' + rest.out);
          anyHit = true;
          continue;
        }
        // 标题/作者保留英文专名
        if (m[1] === '标题' || m[1] === '作者' || m[1] === 'arXiv') {
          outParts.push(out);
          anyHit = true;
          continue;
        }
        outParts.push('〔待译〕' + part);
      } else {
        outParts.push(out);
        anyHit = true;
      }
    } else {
      outParts.push('〔待译〕' + part);
    }
  }

  if (!anyHit) return '〔待译〕' + raw;
  return outParts.join('\n');
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
  const pending = paras.filter((p) => p.zh.startsWith('〔待译〕')).length;
  const tree = (paper.headings || []).map((h) =>
    `<a class="toc-item lv${h.level}" href="#sec-${esc(encodeURIComponent(h.title))}" data-toc="${esc(h.title)}">${esc(h.title)}</a>`
  ).join('') || '<span class="muted">无标题树</span>';

  const body = paras.map((p) => {
    const withCites = linkCitations(p.en);
    return `<div class="rd-para" data-para="${p.id}">
      <div class="rd-en">${withCites}</div>
    </div>`;
  }).join('');

  const zhBody = paras.map((p) => {
    const cls = p.zh.startsWith('〔待译〕') ? 'rd-zh pending' : 'rd-zh';
    const text = p.zh.startsWith('〔待译〕') ? p.zh.slice(4) : p.zh;
    const badge = p.zh.startsWith('〔待译〕') ? '<span class="zh-badge">待译</span>' : '';
    return `<div class="rd-para" data-para="${p.id}"><div class="${cls}">${badge}${esc(text).replace(/\n/g, '<br>')}</div></div>`;
  }).join('');

  const refs = (paper.refs || []).map((r) =>
    `<div class="ref-item" id="ref-${r.id}" data-ref="${r.id}"><b>[${r.id}]</b> ${esc(r.text)}</div>`
  ).join('') || '<div class="muted">无参考文献条目</div>';

  const hint = pending
    ? `<p class="muted reader-hint">已对齐 ${paras.length} 段；其中 ${pending} 段离线未覆盖，保留英文并标「待译」。可点「模型补全中文」生成通顺译文（公式/专名仍保留英文）。</p>`
    : `<p class="muted reader-hint">中文对照已按整句对齐；滚动左右栏自动同步；点击正文 [n] 可跳转参考文献。</p>`;

  return {
    paras,
    pending,
    html: `
      ${hint}
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

/** 按段落比例同步，比整页 scrollTop 比例更稳 */
function syncByParagraph(from, to) {
  const fromParas = [...from.querySelectorAll('.rd-para')];
  const toParas = [...to.querySelectorAll('.rd-para')];
  if (!fromParas.length || !toParas.length) return;
  const top = from.scrollTop + 8;
  let idx = 0;
  for (let i = 0; i < fromParas.length; i++) {
    if (fromParas[i].offsetTop <= top) idx = i;
    else break;
  }
  const target = toParas[Math.min(idx, toParas.length - 1)];
  if (target) {
    to.scrollTop = Math.max(0, target.offsetTop - 8);
  }
}

export function bindReaderInteractions(root) {
  if (!root) return;
  const en = root.querySelector('#scrollEn');
  const zh = root.querySelector('#scrollZh');
  let lock = false;
  function sync(from, to) {
    if (!from || !to || lock) return;
    lock = true;
    syncByParagraph(from, to);
    lock = false;
  }
  if (en && zh) {
    en.addEventListener('scroll', () => sync(en, zh), { passive: true });
    zh.addEventListener('scroll', () => sync(zh, en), { passive: true });
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
      const title = a.getAttribute('data-toc') || '';
      const key = title.slice(0, 24);
      const target = [...root.querySelectorAll('.rd-en')].find((n) => n.textContent.includes(key));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const para = target.closest('.rd-para');
        const id = para && para.getAttribute('data-para');
        if (id && zh) {
          const zhPara = zh.querySelector(`.rd-para[data-para="${id}"]`);
          if (zhPara) zhPara.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
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

/** 用后端/隧道模型把待译段落补成通顺中文；失败则保持现状 */
export async function fillPendingWithModel(paras, apiRun) {
  const pending = paras.filter((p) => String(p.zh || '').startsWith('〔待译〕') || latinRatio(p.zh) > 0.5);
  if (!pending.length) return paras;
  const batch = pending.slice(0, 8);
  const prompt = batch.map((p, i) => `[${i + 1}]\n${p.en}`).join('\n\n');
  try {
    const data = await apiRun({
      action: 'translate',
      text: prompt,
      filename: 'reader-align.txt',
      extra: {
        direction: 'en2zh',
        note: '学术中英对照：逐段翻译为通顺中文；保留 BLEU、GPU、Adam、公式与专有名词英文；不要中英混杂插词；按 [1][2]… 编号输出，每段只要译文。',
      },
    });
    const raw = String(data.llm_text || data.reply || data.text || '');
    const parts = raw.split(/\[\d+\]\s*/).map((s) => s.trim()).filter(Boolean);
    batch.forEach((p, i) => {
      if (parts[i]) p.zh = parts[i];
    });
  } catch (e) {
    /* keep offline */
  }
  return paras;
}

export function renderZhColumn(paras) {
  return paras.map((p) => {
    const pending = String(p.zh || '').startsWith('〔待译〕');
    const text = pending ? p.zh.slice(4) : p.zh;
    const badge = pending ? '<span class="zh-badge">待译</span>' : '';
    return `<div class="rd-para" data-para="${p.id}"><div class="rd-zh${pending ? ' pending' : ''}">${badge}${esc(text).replace(/\n/g, '<br>')}</div></div>`;
  }).join('');
}
