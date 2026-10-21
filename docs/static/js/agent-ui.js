/**
 * 科研 Agent UI：M1–M5 页面接线
 */
import { store, toast as coreToast, esc } from './lab/core.js';
import {
  ingestText, extractPdfText, listPapers, savePaper, deletePaper,
  loadDemoPair, renderPaperCard, structureReportHtml, getPaper, findDuplicates,
} from './lab/library.js';
import { answerQuestion, comparePapers, evidenceListHtml } from './lab/rag.js';
import {
  renderReader, bindReaderInteractions, jumpToCite,
  fillPendingWithModel, renderZhColumn,
} from './lab/reader.js';
import {
  searchArxiv, filterQuality, drillDownRefs, recommendFromLibrary,
  itemToPaperDraft, renderSearchResults, refLineToQuery,
} from './lab/retrieve.js';
import { corpusToPapers, buildCitationGraph, generateSurvey, renderGraphSvg, DEMO_CORPUS } from './lab/graph.js';

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
        <p>新文献与库中《${esc(other.title)}》高度重合（相似度 ${(top.score * 100).toFixed(1)}%）
          ${top.sameArxiv ? '，且 arXiv 编号相同（版本演进）' : ''}。</p>
        <p><b>建议：</b>${top.newerIsIncoming ? '库中已有较旧版本，建议保留/覆盖为较新版本。' : '库中版本可能更新，建议保留现有版本。'}</p>
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
      toast('已覆盖旧版');
      return paper;
    }
  }
  await savePaper(paper);
  toast('已入库：' + paper.title.slice(0, 40));
  return paper;
}

window.refreshLibraryList = refreshLibraryList;

window.loadAttentionDemo = async function () {
  try {
    const { v1, v7 } = await loadDemoPair();
    const r1 = await ingestText(v1, { filename: '1706.03762v1.txt', source: 'demo' });
    await savePaper(r1.paper);
    const r7 = await ingestText(v7, { filename: '1706.03762v7.txt', source: 'demo' });
    // 故意触发去重
    const papers = await listPapers();
    const dups2 = findDuplicates(r7.paper, papers);
    await commitPaper(r7.paper, dups2.length ? dups2 : r7.duplicates);
    setHtml('libDetail', structureReportHtml(r7.paper));
    await refreshLibraryList();
    toast('已载入 Attention v1，并尝试入库 v7（应出现去重预警）');
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
      const r = await extractPdfText(f);
      if (r.ocrNeeded) {
        toast(r.note || '扫描件需 OCR');
        text = `[OCR_PENDING]\nTitle: ${f.name}\nAbstract: Scanned PDF without text layer. Pages=${r.numPages}.\n1 Introduction\nPlaceholder for OCR text.`;
        extra.ocrNeeded = true;
      } else {
        text = r.text;
        if (r.truncated) toast('长 PDF 仅解析前 80 页（分级加载）');
      }
    } catch (e) {
      toast('PDF 解析失败：' + e.message);
      return;
    }
  } else {
    text = await f.text();
  }
  const { paper, duplicates } = await ingestText(text, { filename: f.name, ...extra });
  paper.ocrNeeded = !!extra.ocrNeeded;
  await commitPaper(paper, duplicates);
  setHtml('libDetail', structureReportHtml(paper));
  await refreshLibraryList();
};

window.ingestLibPaste = async function () {
  const raw = ($('libPaste') && $('libPaste').value) || '';
  if (!raw.trim()) { toast('请粘贴文本'); return; }
  const { paper, duplicates } = await ingestText(raw, { filename: 'paste.txt' });
  await commitPaper(paper, duplicates);
  setHtml('libDetail', structureReportHtml(paper));
  await refreshLibraryList();
};

window.runRagAsk = async function () {
  const q = (($('ragQuestion') && $('ragQuestion').value) || '').trim();
  if (!q) { toast('请输入问题'); return; }
  const papers = await listPapers();
  const ids = [...document.querySelectorAll('.rag-pick:checked')].map((x) => x.value);
  const res = answerQuestion(papers, q, { paperIds: ids.length ? ids : null, topK: 6 });
  setHtml('ragOut', res.html + evidenceListHtml(res.evidence));
  bindCiteClicks($('ragOut'));
  toast(res.ok ? '已生成带出处回答' : '证据不足，已拒答');
};

window.runRagCompare = async function () {
  const papers = await listPapers();
  const ids = [...document.querySelectorAll('.rag-pick:checked, .cmp-pick:checked')].map((x) => x.value);
  const picked = ids.length ? ids : [...document.querySelectorAll('.rag-pick:checked')].map((x) => x.value);
  const res = comparePapers(papers, picked);
  setHtml('ragOut', res.html);
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
  const papers = await listPapers();
  const pid = id || ($('readerSelect') && $('readerSelect').value) || window.LX_CURRENT_PAPER;
  const paper = papers.find((p) => p.id === pid) || papers[0];
  if (!paper) { setHtml('readerRoot', '<p class="muted">请先入库文献</p>'); return; }
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
    await fillPendingWithModel(window._readerParas, apiRun);
    const zh = document.querySelector('#scrollZh');
    if (zh) zh.innerHTML = renderZhColumn(window._readerParas);
    bindReaderInteractions($('readerRoot'));
    toast('中文对照已更新');
  } catch (e) {
    toast('模型翻译暂不可用，已保留离线整句译文：' + (e.message || e));
  }
};

window.runArxivSearch = async function () {
  const q = (($('arxivQ') && $('arxivQ').value) || '').trim();
  const res = await searchArxiv(q, { max: 8 });
  const items = filterQuality(res.items);
  setHtml('arxivOut', (res.offline ? '<p class="muted">离线演示结果（Flask /api/arxiv 不可用时回退）</p>' : '') + renderSearchResults(items));
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
  setHtml('graphOut', renderGraphSvg(graph) + '<div class="report">' + survey.html + '</div>');
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await store.open();
    await refreshLibraryList();
  } catch (e) {
    console.warn(e);
  }
  const libFile = $('libFile');
  if (libFile) libFile.addEventListener('change', () => toast('已选择 ' + (libFile.files[0] && libFile.files[0].name)));
});
