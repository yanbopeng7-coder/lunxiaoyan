/**
 * 科研 Agent UI：M1–M5 页面接线
 */
import { store, toast as coreToast, esc, sourceBadge } from './lab/core.js';
import {
  ingestText, extractPdfText, listPapers, savePaper, deletePaper,
  loadDemoPair, renderPaperCard, structureReportHtml, getPaper, findDuplicates, addedSentences, pairScores,
} from './lab/library.js';
import { answerQuestion, comparePapers, evidenceListHtml, ragModelPrompt } from './lab/rag.js';
import {
  renderReader, bindReaderInteractions, jumpToCite,
  fillPendingWithModel, renderPairedRows,
} from './lab/reader.js';
import {
  searchArxiv, filterQuality, drillDownRefs, recommendFromLibrary,
  itemToPaperDraft, renderSearchResults,
} from './lab/retrieve.js';
import { corpusToPapers, buildCitationGraph, generateSurvey, renderGraphSvg, DEMO_CORPUS } from './lab/graph.js';
import { runAgent, renderPlanHtml, renderThoughtsHtml, planTasks } from './lab/agent.js';

function $(id) { return document.getElementById(id); }
function toast(msg) {
  if (typeof window.toast === 'function') return window.toast(msg);
  coreToast(msg);
}
function setHtml(id, html) { const el = $(id); if (el) el.innerHTML = html; }

let feedback = { likes: {}, dislikes: {} };

async function refreshLibraryList() {
  const papers = await listPapers();
  const box = $('libList');
  if (!box) return papers;
  if (!papers.length) {
    box.innerHTML = '<p class="muted">文献库为空。可上传 PDF/TXT，或一键载入 Attention v1/v7 测例。</p>';
    return papers;
  }
  box.innerHTML = papers.map(renderPaperCard).join('');
  box.querySelectorAll('.paper-card').forEach((card) => {
    card.addEventListener('click', async () => {
      const p = await getPaper(card.getAttribute('data-id'));
      if (!p) return;
      setHtml('libDetail', structureReportHtml(p) +
        `<div class="row" style="margin-top:8px">
          <button type="button" class="btn ghost" data-act="read">打开阅读器</button>
          <button type="button" class="btn ghost" data-act="del">删除</button>
        </div>`);
      const root = $('libDetail');
      root.querySelector('[data-act="read"]')?.addEventListener('click', () => {
        window.LX_CURRENT_PAPER = p.id;
        if (typeof go === 'function') go('reader');
        window.openReader && window.openReader(p.id);
      });
      root.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
        await deletePaper(p.id);
        toast('已删除');
        refreshLibraryList();
        setHtml('libDetail', '');
      });
    });
  });
  fillPaperSelectors(papers);
  return papers;
}

function fillPaperSelectors(papers) {
  const html = papers.map((p) =>
    `<label class="check"><input type="checkbox" class="rag-pick" value="${esc(p.id)}" checked /> ${esc(p.title.slice(0, 48))}</label>`
  ).join('') || '<span class="muted">请先在文献库入库</span>';
  ['ragPickList', 'cmpPickList'].forEach((id) => { if ($(id)) $(id).innerHTML = html; });
  const sel = $('readerSelect');
  if (sel) {
    sel.innerHTML = papers.map((p) => `<option value="${esc(p.id)}">${esc(p.title.slice(0, 60))}</option>`).join('');
  }
}

async function confirmDedup(paper, duplicates) {
  return new Promise((resolve) => {
    const top = duplicates[0];
    const other = top.other;
    const wrap = document.createElement('div');
    wrap.className = 'dedup-modal';
    wrap.innerHTML = `
      <div class="dedup-box">
        <h3>语义去重预警</h3>
        <p>${sourceBadge('offline')} 指纹去重（不是模型打分）。与库中《${esc(other.title)}》重合
          ${top.sameArxiv ? '，且 arXiv 编号相同（版本演进）' : ''}。</p>
        <ul>
          <li>SimHash 相似度 ${((top.simhash || 0) * 100).toFixed(1)}%（汉明距离 ${top.hamming ?? '—'} / 64）</li>
          <li>MinHash Jaccard ${((top.minhash || 0) * 100).toFixed(1)}%</li>
          <li>判定分取二者较高值 ${((top.score || 0) * 100).toFixed(1)}%，阈值 72%</li>
        </ul>
        <p><b>建议：</b>${top.newerIsIncoming ? '库中已有较旧版本，建议保留/覆盖为较新版本。' : '库中版本可能更新，建议保留现有版本。'}</p>
        <p class="muted">下面是两篇正文里对得上的具体差异，不是只报一个百分比。</p>
        <ul>${(top.diffSummary || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
        <div class="row">
          <button type="button" class="btn" data-a="replace">覆盖旧版</button>
          <button type="button" class="btn ghost" data-a="keep">保留两者</button>
          <button type="button" class="btn ghost" data-a="cancel">取消入库</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      const a = e.target.getAttribute('data-a');
      if (!a) return;
      wrap.remove();
      resolve(a);
    });
  });
}

async function commitPaper(paper, duplicates) {
  if (duplicates && duplicates.length) {
    const act = await confirmDedup(paper, duplicates);
    if (act === 'cancel') { toast('已取消入库'); return null; }
    if (act === 'replace') {
      await savePaper(paper, { replaceId: duplicates[0].other.id });
      toast('已覆盖旧版：' + paper.title.slice(0, 40));
      return paper;
    }
    toast('两版都保留：' + paper.title.slice(0, 40));
  }
  await savePaper(paper);
  if (!(duplicates && duplicates.length)) toast('已入库：' + paper.title.slice(0, 40));
  return paper;
}

window.refreshLibraryList = refreshLibraryList;

function summarizeFromPair(oldP, newP) {
  const tips = [];
  if ((oldP.version || 0) !== (newP.version || 0)) tips.push(`版本 ${oldP.version || '?'} → ${newP.version || '?'}`);
  addedSentences(oldP.text, newP.text, 5).forEach((s) => tips.push(s.slice(0, 140)));
  if (!tips.length) tips.push('两篇正文几乎相同，没有可列出的新增句');
  return tips;
}

function showLibResult(html) {
  setHtml('libDetail', html);
  const el = $('libDetail');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.loadScanOcrDemo = async function () {
  try {
    toast('下载扫描件 PDF 并 OCR…');
    const r = await fetch('static/demo/papers/attention-scan-ocr-demo.pdf', { cache: 'no-store' });
    const blob = await r.blob();
    const file = new File([blob], 'attention-scan-ocr-demo.pdf', { type: 'application/pdf' });
    const parsed = await extractPdfText(file, {
      maxOcrPages: 1,
      onProgress: (p) => {
        if (p.phase === 'ocr') toast('OCR ' + p.page + '/' + p.total);
      },
    });
    let body = String(parsed.text || '').replace(/--- Page \d+[^\n]*---/g, '').trim();
    const thin = body.replace(/\s/g, '').length < 80 || /OCR_FAILED|OCR error|importScripts|No text layer/i.test(body);
    if (thin) {
      body = await fetch('static/demo/papers/attention-v1.txt', { cache: 'no-store' }).then((x) => x.text());
      body = body.trim();
      parsed.note = '这一页没有认出可用正文，下面改用测例文本，避免只剩页码或报错。';
    }
    const { paper, duplicates } = await ingestText(body, {
      filename: file.name,
      source: 'scan-ocr-demo',
      ocrUsed: !!parsed.ocrUsed,
      ocrNeeded: !!parsed.ocrNeeded,
    });
    paper.ocrUsed = !!parsed.ocrUsed;
    paper.ocrNeeded = !!parsed.ocrNeeded;
    showLibResult(structureReportHtml(paper) +
      `<h4>识别出的正文</h4><p class="muted">${esc(parsed.note || '')}</p><div class="pre" style="max-height:280px;overflow:auto;white-space:pre-wrap">${esc(body.slice(0, 1600))}</div>`);
    await commitPaper(paper, duplicates);
    await refreshLibraryList();
    toast(parsed.ocrUsed ? '扫描件 OCR 入库完成' : (parsed.note || '已入库'));
  } catch (e) {
    toast('扫描 OCR 测例失败：' + (e.message || e));
  }
};

window.loadLongBookDemo = async function () {
  try {
    toast('载入长文档节选（模拟 541 页分级切块）…');
    const t = await fetch('static/demo/papers/understanding-dl-excerpt-long.txt', { cache: 'no-store' }).then((r) => r.text());
    const { paper, duplicates } = await ingestText(t, {
      filename: 'understanding-dl-excerpt-long.txt',
      source: 'long-book-demo',
    });
    const heads = (paper.headings || []).slice(0, 8).map((h) => `<li>${esc(h.title)}</li>`).join('');
    const sample = (paper.chunks || []).slice(0, 2).map((c) => esc(String(c.text || '').slice(0, 280))).join('<hr>');
    showLibResult(structureReportHtml(paper) +
      `<h4>长文分级结果</h4><p>约 ${t.length} 字，切成 ${(paper.pages || []).length} 个页片、${(paper.chunks || []).length} 个检索块。下面是章节和前两块正文。</p><ul>${heads || '<li>未切出章节</li>'}</ul><div class="pre" style="max-height:240px;overflow:auto;white-space:pre-wrap">${sample}</div>`);
    await commitPaper(paper, duplicates);
    await refreshLibraryList();
    toast('长文档测例已入库');
  } catch (e) {
    toast('长文档测例失败：' + (e.message || e));
  }
};

window.loadAttentionDemo = async function () {
  try {
    const { v1, v7 } = await loadDemoPair();
    const r1 = await ingestText(v1, { filename: '1706.03762v1.txt', source: 'demo' });
    await savePaper(r1.paper);
    const r7 = await ingestText(v7, { filename: '1706.03762v7.txt', source: 'demo' });
    // 故意触发去重
    const papers = await listPapers();
    const dups2 = findDuplicates(r7.paper, papers);
    const added = addedSentences(r1.paper.text, r7.paper.text, 6);
    if (dups2[0]) {
      Object.assign(dups2[0], pairScores(r1.paper, r7.paper), {
        diffSummary: summarizeFromPair(r1.paper, r7.paper),
        newerIsIncoming: true,
        sameArxiv: true,
      });
    }
    showLibResult(
      `<h4>Attention v1 → v7 正文差异</h4>` +
      `<p>v1 摘要不含具体 BLEU；v7 摘要补上 28.4 BLEU，并新增公式、3.5 节和 Future Work。相似度按 SimHash / MinHash 现算。</p>` +
      `<ul>${added.map((s) => `<li>${esc(s.slice(0, 220))}</li>`).join('') || '<li>没有新增句</li>'}</ul>` +
      structureReportHtml(r7.paper)
    );
    await commitPaper(r7.paper, dups2.length ? dups2 : r7.duplicates);
    await refreshLibraryList();
    toast('已对比 v1 与 v7，差异列在上方');
  } catch (e) {
    toast('测例加载失败：' + e.message);
  }
};

window.ingestLibFile = async function () {
  const inp = $('libFile');
  const f = inp && inp.files && inp.files[0];
  if (!f) { toast('请选择文件'); return; }
  let text = '';
  let extra = {};
  if (/\.pdf$/i.test(f.name)) {
    try {
      toast('正在解析 PDF…');
      const r = await extractPdfText(f, {
        onProgress: (p) => {
          if (p.phase === 'ocr') toast(`OCR 识别中 ${p.page}/${p.total}…`);
          else if (p.phase === 'text' && p.page % 10 === 0) toast(`抽取文本层 ${p.page}/${p.total}…`);
        },
      });
      text = r.text;
      extra.ocrNeeded = !!r.ocrNeeded;
      extra.ocrUsed = !!r.ocrUsed;
      if (r.note) toast(r.note);
      else if (r.ocrUsed) toast('扫描件 OCR 完成');
      else if (r.truncated) toast('长 PDF 已分级加载');
    } catch (e) {
      toast('PDF 解析失败：' + e.message);
      return;
    }
  } else {
    text = await f.text();
  }
  const { paper, duplicates } = await ingestText(text, { filename: f.name, ...extra });
  paper.ocrNeeded = !!extra.ocrNeeded;
  paper.ocrUsed = !!extra.ocrUsed;
  await commitPaper(paper, duplicates);
  setHtml('libDetail', structureReportHtml(paper));
  await refreshLibraryList();
};

function agentAuto() {
  const box = $('agentAutoPlan');
  return !box || box.checked;
}

window.previewAgentPlan = function () {
  const goal = (($('agentGoal') && $('agentGoal').value) || '全流程科研演示').trim();
  const steps = planTasks(goal, { auto: agentAuto() });
  setHtml('agentPlan', renderPlanHtml(steps));
  setHtml('agentThoughts', '<p class="muted">点击「执行编排」开始；思考过程将流式显示。</p>');
  setHtml('agentResult', '');
};

window.runResearchAgent = async function () {
  const goal = (($('agentGoal') && $('agentGoal').value) || '全流程科研演示').trim();
  setHtml('agentPlan', renderPlanHtml(planTasks(goal, { auto: agentAuto() })));
  setHtml('agentThoughts', '');
  setHtml('agentResult', '<p class="muted">Agent 执行中…</p>');
  toast('Agent 开始编排');
  const out = await runAgent(goal, {
    autoPlan: agentAuto(),
    question: ($('agentQuestion') && $('agentQuestion').value) || '',
    retrieveQuery: ($('agentRetrieve') && $('agentRetrieve').value) || 'transformer',
    idea: ($('agentIdea') && $('agentIdea').value) || '',
    onPlan: (steps) => setHtml('agentPlan', renderPlanHtml(steps)),
    onThink: (_t, all) => setHtml('agentThoughts', renderThoughtsHtml(all)),
    onStep: (step, steps) => setHtml('agentPlan', renderPlanHtml(steps)),
  });
  let html = `<p><b>编排${out.ok ? '成功' : '部分失败'}</b> · run ${esc(out.runId)}</p>`;
  out.results.forEach((r) => {
    if (r.html) html += `<div class="report">${r.html}</div>`;
    else if (r.data && r.data.mermaid) {
      html += `<h4>Mermaid</h4><div class="pre">${esc(r.data.mermaid)}</div>`;
    }
  });
  setHtml('agentResult', html);
  await refreshLibraryList();
  toast(out.ok ? '科研 Agent 闭环完成（可纯前端演示）' : '部分步骤失败，见思考日志');
};

window.ingestLibPaste = async function () {
  const raw = ($('libPaste') && $('libPaste').value) || '';
  if (!raw.trim()) { toast('请粘贴文本'); return; }
  const { paper, duplicates } = await ingestText(raw, { filename: 'paste.txt' });
  await commitPaper(paper, duplicates);
  setHtml('libDetail', structureReportHtml(paper));
  await refreshLibraryList();
};

async function modelText(prompt) {
  if (typeof window.api !== 'function') return '';
  try {
    const d = await window.api('chat', { question: prompt, scene: 'lit' }, prompt, 'rag.txt');
    const offline = !d || d.demo || d.mode === 'demo' || d.mode === 'offline' || d.mode === 'pages';
    if (offline) return '';
    return String(d.reply || d.llm_text || '').trim();
  } catch (e) {
    return '';
  }
}

window.runRagAsk = async function () {
  const q = (($('ragQuestion') && $('ragQuestion').value) || '').trim();
  if (!q) { toast('请输入问题'); return; }
  const papers = await listPapers();
  const ids = [...document.querySelectorAll('.rag-pick:checked')].map((x) => x.value);
  const res = answerQuestion(papers, q, { paperIds: ids.length ? ids : null, topK: 6 });
  if (!res.ok) {
    setHtml('ragOut', res.html);
    toast('证据不足，已拒答');
    return;
  }
  toast('正在请求模型（失败则只保留检索摘录）…');
  const gen = await modelText(ragModelPrompt(q, res.evidence));
  const head = gen
    ? sourceBadge('model') + `<div class="report"><p>${esc(gen).replace(/\n/g, '<br>')}</p></div>` + res.html
    : res.html;
  setHtml('ragOut', head + evidenceListHtml(res.evidence));
  bindCiteClicks($('ragOut'));
  toast(gen ? '模型已根据原文作答' : '模型不可用，仅显示离线检索摘录');
};

window.runRagCompare = async function () {
  const papers = await listPapers();
  const ids = [...document.querySelectorAll('.rag-pick:checked, .cmp-pick:checked')].map((x) => x.value);
  const picked = ids.length ? ids : [...document.querySelectorAll('.rag-pick:checked')].map((x) => x.value);
  const res = comparePapers(papers, picked);
  let html = res.html;
  if (res.ok && res.markdown) {
    const gen = await modelText('只根据下面摘录表写一段对比，表里是 — 的项不要编造数字。\n\n' + res.markdown);
    if (gen) html = sourceBadge('model') + `<div class="report"><p>${esc(gen).replace(/\n/g, '<br>')}</p></div>` + res.html;
  }
  setHtml('ragOut', html);
  bindCiteClicks($('ragOut'));
};

function bindCiteClicks(root) {
  if (!root) return;
  root.querySelectorAll('a.cite').forEach((a) => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const pid = a.getAttribute('data-cite-paper');
      const page = a.getAttribute('data-cite-page');
      window.LX_CURRENT_PAPER = pid;
      if (typeof go === 'function') go('reader');
      await window.openReader(pid);
      jumpToCite($('readerRoot'), pid, page);
    });
  });
}

window._readerParas = null;

window.openReader = async function (id) {
  let papers = await listPapers();
  if (!papers.length) papers = await ensureDemoLibrary();
  await refreshLibraryList();
  const pid = id || ($('readerSelect') && $('readerSelect').value) || window.LX_CURRENT_PAPER;
  const paper = papers.find((p) => p.id === pid) || papers[0];
  if (!paper) { setHtml('readerRoot', '<p class="muted">请先到「文献库」点一键测例或上传 PDF</p>'); return; }
  if ($('readerSelect')) $('readerSelect').value = paper.id;
  const view = renderReader(paper);
  window._readerParas = view.paras;
  setHtml('readerRoot', view.html);
  bindReaderInteractions($('readerRoot'));
  toast('阅读器已打开：' + paper.title.slice(0, 40));
};

window.polishReaderZh = async function () {
  if (!window._readerParas || !window._readerParas.length) {
    toast('请先打开阅读器');
    return;
  }
  toast('正在补全中文对照…');
  const apiRun = async (body) => {
    if (typeof window.api === 'function') {
      return window.api(body.action, body.extra || {}, body.text, body.filename);
    }
    const base = (window.LX_API_BASE || '').replace(/\/$/, '');
    const r = await fetch((base || '') + '/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ model: 'glm-4-flash' }, body)),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };
  try {
    const filled = await fillPendingWithModel(window._readerParas, apiRun);
    const pair = document.querySelector('#scrollPair');
    if (pair) pair.innerHTML = renderPairedRows(window._readerParas);
    bindReaderInteractions($('readerRoot'));
    const hint = document.querySelector('.reader-hint');
    if (filled && filled.usedModel) {
      if (hint) hint.innerHTML = sourceBadge('model') + ' 已用模型补全待译段落；没改到的句子仍是离线译文。';
      toast('中文对照已用模型更新');
    } else {
      if (hint) hint.innerHTML = sourceBadge('offline') + ' 模型没连上，下面仍是本地译文，可以继续读。';
      toast('模型没连上，已保留本地译文');
    }
  } catch (e) {
    toast('模型翻译暂不可用，已保留离线整句译文：' + (e.message || e));
  }
};

window.runArxivSearch = async function () {
  const q = (($('arxivQ') && $('arxivQ').value) || '').trim();
  const year = (($('arxivYear') && $('arxivYear').value) || '').trim();
  const cat = (($('arxivCat') && $('arxivCat').value) || '').trim();
  const res = await searchArxiv(q, { max: 8, year, cat });
  const items = filterQuality(res.items);
  setHtml('arxivOut', (res.offline ? sourceBadge('offline') + '<p class="muted">arXiv 接口不可用，下列为本地样例，不是实时检索。</p>' : sourceBadge('model') + '<p class="muted">来自 arXiv 接口的检索结果。</p>') + renderSearchResults(items));
  bindIngestButtons($('arxivOut'));
};

window.runRefDrill = async function () {
  const raw = ($('refDrill') && $('refDrill').value) || '';
  const rows = await drillDownRefs(raw);
  setHtml('arxivOut', rows.map((r) =>
    `<div class="hit-card"><div class="muted">查询：${esc(r.query)}</div>${
      r.hit ? renderSearchResults([Object.assign({ reason: '参考文献下钻' }, r.hit)]) : '<p>未命中</p>'
    }</div>`
  ).join(''));
  bindIngestButtons($('arxivOut'));
};

function bindIngestButtons(root) {
  if (!root) return;
  root.querySelectorAll('.btn-ingest').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.hit-card');
      const title = card.querySelector('b')?.textContent || '';
      const summary = card.querySelector('p')?.textContent || '';
      const id = btn.getAttribute('data-id');
      const draft = itemToPaperDraft({ id, title, summary, authors: '' });
      await savePaper(draft);
      await refreshLibraryList();
      toast('已入库元数据');
    });
  });
  root.querySelectorAll('.btn-like').forEach((btn) => {
    btn.addEventListener('click', () => { feedback.likes[btn.getAttribute('data-id')] = 1; toast('已点赞'); });
  });
  root.querySelectorAll('.btn-dislike').forEach((btn) => {
    btn.addEventListener('click', () => { feedback.dislikes[btn.getAttribute('data-id')] = 1; toast('已踩'); });
  });
}

window.verifyFrameworkRefs = async function () {
  const raw = (($('fwPapers') && $('fwPapers').value) || '').trim();
  const lines = raw.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) { toast('请先粘贴参考文献，每行一条'); return; }
  const papers = await listPapers();
  const rows = lines.map((line) => {
    const arxiv = (line.match(/\d{4}\.\d{4,5}/) || [])[0] || '';
    const low = line.toLowerCase();
    const hit = papers.find((p) => {
      const t = String(p.title || '').trim();
      return t.length > 8 && low.includes(t.slice(0, 24).toLowerCase());
    });
    let status = '本地库未命中，不能当成已核实文献';
    if (hit) status = '本地库可核验：《' + hit.title + '》';
    else if (arxiv) status = '含 arXiv 号 ' + arxiv + '，尚未入库核对全文';
    return `<li>${esc(line.slice(0, 120))}<br><span class="muted">${esc(status)}</span></li>`;
  });
  const box = $('fwOut');
  const html = sourceBadge('offline') + '<h4>参考文献真实性</h4><p class="muted">对照本地文献库标题，不是模型判断。</p><ul>' + rows.join('') + '</ul>';
  if (box) box.innerHTML = html;
  toast('已完成文献校验');
};

window.runRecommend = async function () {
  const papers = await listPapers();
  const recs = recommendFromLibrary(papers, feedback);
  setHtml('arxivOut', recs.map((r) => {
    if (r.external) return renderSearchResults([Object.assign({ reason: r.reason }, r.external)]);
    return `<div class="hit-card"><b>${esc(r.a.title)}</b> ↔ <b>${esc(r.b.title)}</b><p class="muted">${esc(r.reason)}</p></div>`;
  }).join('') || '<p class="muted">暂无推荐</p>');
  bindIngestButtons($('arxivOut'));
};

window.loadGraphDemo = async function () {
  const papers = corpusToPapers(DEMO_CORPUS);
  for (const p of papers) await savePaper(p);
  await refreshLibraryList();
  toast('已载入 ' + papers.length + ' 篇图谱演示语料');
  window.runGraph();
};

window.runGraph = async function () {
  let papers = await listPapers();
  if (papers.length < 3) {
    toast('文献不足，自动载入演示语料');
    await window.loadGraphDemo();
    papers = await listPapers();
  }
  const graph = buildCitationGraph(papers);
  const survey = generateSurvey(graph, papers);
  setHtml('graphOut', sourceBadge('offline') + renderGraphSvg(graph) + '<div class="report">' + survey.html + '</div><p class="muted">PageRank 与综述提纲由本地图算法生成，不是大模型写的。</p>');
};

/** 保证库里至少有四篇可演示文献：Attention 两版、BERT、Bahdanau。已有的不重复塞。 */
async function ensureDemoLibrary() {
  let papers = await listPapers();
  const hasArxiv = (id) => papers.some((p) => String(p.arxiv || '').includes(id));
  const hasVersion = (n) => papers.some((p) => String(p.arxiv || '').includes('1706.03762') && Number(p.version) === n);
  let added = 0;
  try {
    if (!hasVersion(1) || !hasVersion(7)) {
      const { v1, v7 } = await loadDemoPair();
      if (!hasVersion(1)) {
        const r1 = await ingestText(v1, { filename: '1706.03762v1.txt', source: 'demo' });
        await savePaper(r1.paper);
        added++;
      }
      if (!hasVersion(7)) {
        const r7 = await ingestText(v7, { filename: '1706.03762v7.txt', source: 'demo' });
        await savePaper(r7.paper);
        added++;
      }
    }
    papers = await listPapers();
    const extras = corpusToPapers(DEMO_CORPUS.filter((x) => ['1810.04805', '1409.0473', 'gpt1', '1512.03385', '1607.06450', '1705.03122'].includes(x.arxiv)));
    for (const p of extras) {
      const old = papers.find((x) => String(x.arxiv || '').includes(p.arxiv) || x.title === p.title);
      if (old && String(old.text || '').length > 700) continue;
      if (old) p.id = old.id;
      await savePaper(p);
      added++;
    }
    if (added) toast('已补齐 ' + added + ' 篇离线演示文献');
  } catch (e) {
    console.warn(e);
  }
  return listPapers();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await store.open();
    await ensureDemoLibrary();
    await refreshLibraryList();
  } catch (e) {
    console.warn(e);
  }
  const libFile = $('libFile');
  if (libFile) libFile.addEventListener('change', () => toast('已选择 ' + (libFile.files[0] && libFile.files[0].name)));
});
