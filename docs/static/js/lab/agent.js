/**
 * Agent 编排层：Task Planning + 多工具路由 + 思考过程可视化
 * 纯前端可跑完整演示闭环（不依赖公网 LLM）
 */
import { listPapers, ingestText, savePaper, loadDemoPair, findDuplicates } from './library.js';
import { answerQuestion, comparePapers } from './rag.js';
import { corpusToPapers, buildCitationGraph, generateSurvey, DEMO_CORPUS } from './graph.js';
import { searchArxiv, filterQuality, recommendFromLibrary } from './retrieve.js';
import { buildOutline, diagramFromIdea, toMermaid } from './writing.js';
import { esc, uid, sleep } from './core.js';

/** 意图 → 工具链规划 */
export function planTasks(goal) {
  const g = String(goal || '').toLowerCase();
  const steps = [];
  const push = (id, title, tool, why) => steps.push({ id, title, tool, why, status: 'pending' });

  if (/去重|v1|v7|attention|入库|解析|pdf|文献库/.test(g)) {
    push('dedup', '文献入库与语义去重', 'library.dedupDemo', '覆盖赛题 Attention v1/v7 测例');
  }
  if (/问答|rag|β|beta|bleu|gpu|幻觉|出处|锚点/.test(g)) {
    push('rag', '抗幻觉 RAG 问答', 'rag.ask', '细粒度事实必须带原文锚点');
  }
  if (/对比|bert|gpt|多文|演进/.test(g)) {
    push('cmp', '多文对比推理', 'rag.compare', '跨文献承袭/差异分析');
  }
  if (/检索|arxiv|推荐|下载|下钻/.test(g)) {
    push('ret', 'arXiv 检索与推荐', 'retrieve.search', '外部工具调用 / Function Calling');
  }
  if (/图谱|pagerank|综述|future|基石/.test(g)) {
    push('graph', '引用图谱与综述', 'graph.survey', 'PageRank 基石节点 + Future Work');
  }
  if (/写作|框架|大纲|mermaid|架构图|csv|可视化/.test(g)) {
    push('write', '学术写作 Copilot', 'writing.copilot', '无幻觉框架 + 拓扑脚本');
  }
  // 默认 / 全流程：补齐六大工具链（避免递归）
  if (/全流程|一键|端到端|闭环|演示|评委/.test(g) || !steps.length) {
    if (!steps.find((s) => s.tool === 'library.dedupDemo')) push('dedup', '文献入库与语义去重', 'library.dedupDemo', '覆盖赛题 Attention v1/v7 测例');
    if (!steps.find((s) => s.tool === 'rag.ask')) push('rag', '抗幻觉 RAG 问答', 'rag.ask', '细粒度事实必须带原文锚点');
    if (!steps.find((s) => s.tool === 'rag.compare')) push('cmp', '多文对比推理', 'rag.compare', '跨文献承袭/差异分析');
    if (!steps.find((s) => s.tool === 'retrieve.search')) push('ret', 'arXiv 检索与推荐', 'retrieve.search', '外部工具调用 / Function Calling');
    if (!steps.find((s) => s.tool === 'graph.survey')) push('graph', '引用图谱与综述', 'graph.survey', 'PageRank 基石节点 + Future Work');
    if (!steps.find((s) => s.tool === 'writing.copilot')) push('write', '学术写作 Copilot', 'writing.copilot', '无幻觉框架 + 拓扑脚本');
  }
  const seen = new Set();
  return steps.filter((s) => (seen.has(s.tool) ? false : (seen.add(s.tool), true)));
}

async function runTool(step, ctx, onThink) {
  const think = async (msg) => {
    onThink && onThink({ stepId: step.id, message: msg, ts: Date.now() });
    await sleep(120);
  };

  switch (step.tool) {
    case 'library.dedupDemo': {
      await think('加载 Attention v1 / v7 官方测例文本…');
      const { v1, v7 } = await loadDemoPair();
      const r1 = await ingestText(v1, { filename: '1706.03762v1.txt', source: 'agent' });
      await savePaper(r1.paper);
      await think(`v1 已入库：《${r1.paper.title}》`);
      const papers = await listPapers();
      const r7 = await ingestText(v7, { filename: '1706.03762v7.txt', source: 'agent' });
      const dups = findDuplicates(r7.paper, papers);
      await think(dups.length
        ? `检测到语义重复（相似度 ${(dups[0].score * 100).toFixed(1)}%），建议保留较新版本`
        : '未检出重复（将直接入库 v7）');
      if (dups.length) {
        await savePaper(r7.paper); // 演示：保留两者
        return {
          ok: true,
          summary: `去重预警已触发：v1↔v7 相似度 ${(dups[0].score * 100).toFixed(1)}%。差异：${(dups[0].diffSummary || []).slice(0, 2).join('；')}`,
          data: { dups, v7: r7.paper },
        };
      }
      await savePaper(r7.paper);
      return { ok: true, summary: 'v1/v7 已入库', data: { v7: r7.paper } };
    }
    case 'rag.ask': {
      await think('对本地文献块建立稀疏检索索引（BM25）…');
      let papers = await listPapers();
      if (papers.length < 1) {
        await think('文献库为空，先执行去重入库子任务…');
        await runTool({ id: 'dedup', tool: 'library.dedupDemo' }, ctx, onThink);
        papers = await listPapers();
      }
      const q = ctx.question || 'What is beta_1 and beta_2 for Adam? How many P100 GPUs?';
      await think(`检索问题：${q}`);
      const res = answerQuestion(papers, q, { topK: 5 });
      await think(res.ok ? `命中 ${res.evidence.length} 条证据，附出处锚点` : '证据不足，拒绝编造');
      return { ok: res.ok, summary: res.answer, html: res.html, data: res };
    }
    case 'rag.compare': {
      await think('选择库内论文做跨文对比…');
      let papers = await listPapers();
      if (papers.length < 2) {
        const demo = corpusToPapers(DEMO_CORPUS.slice(0, 4));
        for (const p of demo) await savePaper(p);
        papers = await listPapers();
      }
      const ids = papers.slice(0, 4).map((p) => p.id);
      const res = comparePapers(papers, ids);
      await think(`完成 ${ids.length} 篇对比表，结论均挂锚点`);
      return { ok: res.ok, summary: '多文对比完成', html: res.html, data: res };
    }
    case 'retrieve.search': {
      const q = ctx.retrieveQuery || 'transformer attention';
      await think(`调用 arXiv 工具：query=${q}`);
      const res = await searchArxiv(q, { max: 5 });
      const items = filterQuality(res.items);
      await think(res.offline
        ? `公网 API 不可用，已用离线演示结果 ${items.length} 条（Pages 静态可演示）`
        : `返回 ${items.length} 条，优先标记含 GitHub 的条目`);
      const recs = recommendFromLibrary(await listPapers());
      return {
        ok: true,
        summary: `检索 ${items.length} 篇；本地推荐 ${recs.length} 条`,
        data: { items, recs, offline: !!res.offline },
      };
    }
    case 'graph.survey': {
      await think('构建局域引用图并计算 PageRank…');
      let papers = await listPapers();
      if (papers.length < 5) {
        for (const p of corpusToPapers(DEMO_CORPUS)) await savePaper(p);
        papers = await listPapers();
      }
      const graph = buildCitationGraph(papers);
      const survey = generateSurvey(graph, papers);
      const top = graph.ranked[0];
      await think(`基石节点：${top ? top.title : '—'}（PR=${top ? top.score.toFixed(4) : 0}）`);
      return {
        ok: true,
        summary: `图谱 ${graph.nodes.length} 节点 / ${graph.edges.length} 边；综述与 Future Work 已生成`,
        html: survey.html,
        data: { graph, survey },
      };
    }
    case 'writing.copilot': {
      await think('生成无幻觉论文框架（仅引用用户/库内文献）…');
      const papers = await listPapers();
      const idea = ctx.idea || 'campus pedestrian detection with occlusion-aware tracking';
      const out = buildOutline(idea, papers.slice(0, 6), { maxPapers: 6 });
      const spec = diagramFromIdea(idea, {});
      const mermaid = toMermaid(spec);
      await think('同步导出 Mermaid 架构脚本');
      return {
        ok: true,
        summary: out.usedPapers && out.usedPapers.length
          ? `框架已生成，引用 ${out.usedPapers.length} 篇真实文献`
          : '框架已生成并标出证据缺口（未编造文献）',
        data: { outline: out, mermaid },
      };
    }
    default:
      return { ok: false, summary: '未知工具：' + step.tool };
  }
}

/**
 * 执行规划：逐步更新 status，回调 onThink / onStep
 */
export async function runAgent(goal, opts = {}) {
  const runId = uid('agent');
  const ctx = {
    question: opts.question,
    retrieveQuery: opts.retrieveQuery,
    idea: opts.idea,
  };
  const steps = planTasks(goal);
  const thoughts = [];
  const results = [];

  const onThink = (t) => {
    thoughts.push(t);
    opts.onThink && opts.onThink(t, thoughts.slice());
  };

  opts.onPlan && opts.onPlan(steps);

  for (const step of steps) {
    step.status = 'running';
    opts.onStep && opts.onStep(step, steps.slice());
    onThink({ stepId: step.id, message: `开始：${step.title} — ${step.why}`, ts: Date.now() });
    try {
      const res = await runTool(step, ctx, onThink);
      step.status = res.ok ? 'done' : 'warn';
      step.result = res;
      results.push({ stepId: step.id, ...res });
      onThink({ stepId: step.id, message: `完成：${res.summary || step.title}`, ts: Date.now() });
    } catch (e) {
      step.status = 'error';
      step.error = String(e.message || e);
      results.push({ stepId: step.id, ok: false, summary: step.error });
      onThink({ stepId: step.id, message: `失败：${step.error}`, ts: Date.now() });
    }
    opts.onStep && opts.onStep(step, steps.slice());
  }

  return {
    runId,
    goal,
    steps,
    thoughts,
    results,
    ok: results.every((r) => r.ok !== false),
  };
}

export function renderPlanHtml(steps) {
  return `<ol class="agent-plan">${(steps || []).map((s) =>
    `<li class="st-${esc(s.status)}" data-step="${esc(s.id)}">
      <b>${esc(s.title)}</b>
      <span class="muted"> · ${esc(s.tool)} · ${esc(s.status)}</span>
      <div class="muted">${esc(s.why || '')}</div>
      ${s.result && s.result.summary ? `<div class="agent-sum">${esc(s.result.summary)}</div>` : ''}
      ${s.error ? `<div class="agent-err">${esc(s.error)}</div>` : ''}
    </li>`
  ).join('')}</ol>`;
}

export function renderThoughtsHtml(thoughts) {
  return `<div class="agent-thoughts">${(thoughts || []).map((t) =>
    `<div class="thought"><span class="muted">${new Date(t.ts).toLocaleTimeString()}</span> ${esc(t.message)}</div>`
  ).join('')}</div>`;
}
