/* 论小研 Agent · 写作与可视化层
 * CSV 解析 / 学术图表 SVG / 中文图注 / matplotlib 导出 / booktabs 表格
 * 研究提纲（仅引用用户提供的论文） / 研究架构图与 Mermaid、DOT、TikZ、matplotlib 导出
 *
 * 约束：纯函数、无 DOM、无第三方依赖；图表与架构图均为 SVG 字符串。
 * 所有来自 CSV 或想法的用户文本在进入 SVG / LaTeX / 代码前都会转义；
 * 任何统计量在非有限值时回落为 0，输出中不出现 NaN / undefined。
 */

import { esc, citeToken, contentTokens } from './core.js';

const CHART_W = 720;
const CHART_H = 420;
const CHART_LEFT = 72;
const CHART_TOP = 68;
const CHART_RIGHT = 158;
const CHART_BOTTOM = 64;
const PLOT_W = CHART_W - CHART_LEFT - CHART_RIGHT;
const PLOT_H = CHART_H - CHART_TOP - CHART_BOTTOM;
const PLOT_RIGHT = CHART_LEFT + PLOT_W;
const PLOT_BOTTOM = CHART_TOP + PLOT_H;
const MAX_CSV_ROWS = 5000;
const MAX_LATEX_ROWS = 80;
const DAY_MS = 86400000;
const YEAR_MS = 365.25 * DAY_MS;
const PALETTE = Object.freeze(['#0f5b57', '#a9522c', '#b08324', '#4a6b8a', '#7a5c9e', '#5f7a52']);
const SERIF = "Georgia,'Times New Roman','Songti SC','Noto Serif CJK SC',serif";
const SANS = "'Helvetica Neue',Arial,'Microsoft YaHei','Noto Sans CJK SC',sans-serif";
const DIAGRAM_W = 900;
const DIAGRAM_H = 420;
const CHART_TYPE_LABEL = Object.freeze({ line: '折线图', bar: '柱状图', scatter: '散点图', radar: '雷达图' });
const GROUP_META = Object.freeze({
  pipeline: { label: '主流程', color: '#0f5b57', fill: '#edf4f2' },
  support: { label: '支撑模块', color: '#4a6b8a', fill: '#edf1f6' },
  safety: { label: '安全与质量', color: '#a9522c', fill: '#f8efea' },
});
const ROLE_PATTERNS = {
  abstract: /abstract|introduction|摘要|引言/i,
  related: /related|background|prior|survey|review|相关工作|背景|综述|文献/i,
  method: /method|approach|model|framework|algorithm|architecture|方法|模型|框架|算法|架构/i,
  experiment: /experiment|evaluation|result|benchmark|实验|评测|评估|结果|基准/i,
};
const CONCEPTS = [
  { key: 'retrieval', re: /(rag|retrieval[\s-]*augmented|retrieval|检索增强|检索|召回)/i },
  { key: 'graph', re: /(knowledge\s*graph|\bgraph(s)?\b|graph\s*(neural|reasoning|retrieval)|\bkg\b|\bgnn\b|知识图谱|图谱|图结构)/i },
  { key: 'writing', re: /(academic\s*writing|scientific\s*writing|paper\s*writing|\bwriting\b|论文写作|学术写作|写作|提纲|润色|投稿)/i },
  { key: 'multimodal', re: /(multimodal|multi-modal|vision[\s-]*language|image[\s-]*text|多模态|图文|跨模态|视觉语言|图像|视频)/i },
  { key: 'reasoning', re: /(reasoning|chain[\s-]*of[\s-]*thought|\bcot\b|推理|思维链)/i },
  { key: 'verification', re: /(factual|fact[\s-]*check|hallucinat|verification|grounded|幻觉|事实核查|事实性|校验|核验|抗幻觉)/i },
  { key: 'agent', re: /(multi[\s-]*agent|\bagent\b|智能体|多智能体)/i },
  { key: 'evaluation', re: /(benchmark|evaluation|evaluate|评测|基准|测试集|数据集)/i },
  { key: 'llm', re: /(large\s*language\s*model|\bllm\b|language\s*model|大模型|大语言模型|语言模型)/i },
  { key: 'translation', re: /(translation|translate|翻译|译文)/i },
  { key: 'lowresource', re: /(low[\s-]*resource|低资源|濒危语言)/i },
  { key: 'citation', re: /(citation|引用|参考文献)/i },
  { key: 'medical', re: /(medical|clinical|biomedical|医学|医疗|临床)/i },
];
const CONCEPT_LABELS = Object.freeze({
  retrieval: '检索增强', graph: '知识图谱', writing: '学术写作', multimodal: '多模态',
  reasoning: '推理', verification: '事实校验', agent: '智能体', evaluation: '评测基准',
  llm: '大语言模型', translation: '翻译', lowresource: '低资源语言', citation: '引用规范', medical: '医学应用',
});

/* ---------- 通用小工具 ---------- */

/** 压缩空白并去掉控制字符，用于展示型文本 */
function text(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 单元格清洗：保留行内换行，去掉首尾空白 */
function cleanCell(v) {
  return String(v == null ? '' : v).replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
}

/** SVG/XML 文本转义 */
function xml(v) { return esc(text(v)); }

/** 任意数值转 SVG 坐标，绝不输出 NaN */
function svgNum(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '0';
}

function numOrNull(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(v, digits = 4) {
  if (!Number.isFinite(v)) return 0;
  const p = Math.pow(10, digits);
  const out = Math.round((v + Number.EPSILON) * p) / p;
  return Object.is(out, -0) ? 0 : out;
}

function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** 稳定的数字显示，避免 NaN / Infinity / 科学计数法滥用 */
function fmtNumber(v, maxDecimals = 3) {
  if (!Number.isFinite(v)) return '0';
  const x = Object.is(v, -0) ? 0 : v;
  const abs = Math.abs(x);
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-4)) {
    return x.toExponential(2).replace(/\.?0+e/, 'e');
  }
  let s = x.toFixed(clampNum(maxDecimals, 0, 6));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

function truncateLabel(v, max = 10) {
  const chars = Array.from(text(v));
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, Math.max(1, max - 1)).join('') + '…';
}

function pad2(n) { return String(n).padStart(2, '0'); }

function emptyStats() {
  return { mean: 0, min: 0, max: 0, slope: 0, r2: 0, peak: 0, category: '' };
}

/* ---------- CSV 解析 ---------- */

/** 在引号外统计候选分隔符，取前 20 个物理行里出现最多者 */
function sniffDelimiter(raw) {
  const sample = raw.slice(0, 32768);
  const counts = new Map([[',', 0], [';', 0], ['\t', 0]]);
  let inQuotes = false;
  let lines = 0;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"') {
      if (inQuotes && sample[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (counts.has(ch)) counts.set(ch, counts.get(ch) + 1);
    if (ch === '\n') {
      lines++;
      if (lines >= 20) break;
    }
  }
  let best = ',';
  let bestCount = -1;
  for (const d of [',', ';', '\t']) {
    const c = counts.get(d);
    if (c > bestCount) { best = d; bestCount = c; }
  }
  return best;
}

function numericValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v == null ? '' : v).trim();
  if (!s) return null;
  if (/^(na|n\/a|null|none|nan|—|–|-|--)$/i.test(s)) return null;
  let percent = false;
  if (/%$/.test(s)) { percent = true; s = s.slice(0, -1).trim(); }
  s = s.replace(/^[¥$€£]\s*/, '').replace(/,/g, '').replace(/\s+/g, '');
  let negParen = false;
  if (/^\(.*\)$/.test(s)) { negParen = true; s = s.slice(1, -1); }
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negParen ? -n : n;
}

function isNumericColumn(rows, index) {
  let total = 0;
  let ok = 0;
  for (const row of rows) {
    const s = cleanCell(Array.isArray(row) ? row[index] : '');
    if (!s) continue;
    total++;
    if (numericValue(s) != null) ok++;
  }
  return total > 0 && ok / total >= 0.8;
}

/**
 * RFC4180 风格的 CSV 解析。
 * 支持引号、转义引号、CRLF、BOM，并自动嗅探 `,`、`;`、`\t` 分隔符。
 * 数据行最多保留 5000 行，超出时 truncated 为 true。
 * @param {string} input 原始 CSV 文本
 * @returns {{headers:string[],rows:string[][],numeric:boolean[],delimiter:string,truncated:boolean}}
 */
export function parseCsv(input) {
  let raw = String(input == null ? '' : input);
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const delimiter = sniffDelimiter(raw);
  const records = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let quoted = false;
  let truncated = false;
  let stopped = false;

  const finishRecord = () => {
    row.push(quoted ? field : field.trim());
    const nonEmpty = row.some(cell => String(cell).trim() !== '');
    if (nonEmpty) {
      if (records.length >= MAX_CSV_ROWS + 1) { truncated = true; stopped = true; return; }
      records.push(row);
    }
    row = [];
    field = '';
    quoted = false;
  };

  for (let i = 0; i < raw.length && !stopped; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i++; continue; }
        inQuotes = false;
        continue;
      }
      if (ch === '\r') {
        field += '\n';
        if (raw[i + 1] === '\n') i++;
        continue;
      }
      field += ch;
      continue;
    }
    if (ch === '"' && field === '' && !quoted) {
      inQuotes = true;
      quoted = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(quoted ? field : field.trim());
      field = '';
      quoted = false;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && raw[i + 1] === '\n') i++;
      finishRecord();
      continue;
    }
    field += ch;
  }
  if (!stopped && (field !== '' || row.length || quoted)) finishRecord();

  const headerRecord = records.length ? records[0] : [];
  let headers = headerRecord.map((h, i) => text(h) || `列${i + 1}`);
  const dataRecords = records.slice(1);
  let width = headers.length;
  for (const r of dataRecords) width = Math.max(width, r.length);
  if (width === 0) return { headers: [], rows: [], numeric: [], delimiter, truncated };
  for (let i = headers.length; i < width; i++) headers.push(`列${i + 1}`);

  const seenHeaders = new Map();
  headers = headers.map(h => {
    const n = (seenHeaders.get(h) || 0) + 1;
    seenHeaders.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });

  const rows = dataRecords.map(r => {
    const out = new Array(width).fill('');
    for (let i = 0; i < Math.min(width, r.length); i++) out[i] = String(r[i] == null ? '' : r[i]);
    return out;
  });
  const numeric = headers.map((_, i) => isNumericColumn(rows, i));
  return { headers, rows, numeric, delimiter, truncated };
}

/* ---------- 日期与列画像 ---------- */

function makeUtc(y, m, d) {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ts = Date.UTC(y, m - 1, d);
  const dt = new Date(ts);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return ts;
}

function parseDateCell(value, allowYear = false) {
  const s = text(value);
  if (!s) return null;
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s))) {
    const base = makeUtc(+m[1], +m[2], +m[3]);
    if (base == null) return null;
    let ts = base;
    if (m[4] != null) {
      const h = +m[4], mi = +m[5], se = +(m[6] || 0);
      if (h > 23 || mi > 59 || se > 59) return null;
      ts += ((h * 60 + mi) * 60 + se) * 1000;
    }
    return { ts, label: s };
  }
  if ((m = /^(\d{4})[-/.](\d{1,2})$/.exec(s))) {
    const ts = makeUtc(+m[1], +m[2], 1);
    return ts == null ? null : { ts, label: s };
  }
  if ((m = /^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/.exec(s))) {
    const ts = makeUtc(+m[1], +m[2], m[3] ? +m[3] : 1);
    return ts == null ? null : { ts, label: s };
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) {
    const ts = makeUtc(+m[3], +m[1], +m[2]);
    return ts == null ? null : { ts, label: s };
  }
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) {
    const ts = makeUtc(+m[1], +m[2], +m[3]);
    return ts == null ? null : { ts, label: s };
  }
  if (allowYear && /^\d{4}$/.test(s)) {
    const y = Number(s);
    if (y >= 1900 && y <= 2100) return { ts: Date.UTC(y, 0, 1), label: s };
  }
  return null;
}

const DATE_HINT = /date|time|year|month|day|quarter|日期|时间|年份|年度|月份|季度/i;

function detectDateColumn(values, header) {
  const hint = DATE_HINT.test(header);
  if (!values.length) return { isDate: false, count: 0, timestamps: [], yearOnly: false };
  let count = 0;
  let yearOnly = true;
  const timestamps = [];
  for (const v of values) {
    const d = parseDateCell(v, hint);
    if (!d) continue;
    count++;
    timestamps.push(d.ts);
    if (!/^\d{4}$/.test(text(v))) yearOnly = false;
  }
  const hasSeparator = values.some(v => /[-/年月.]/.test(v));
  return {
    isDate: count > 0 && count / values.length >= 0.8 && (hint || hasSeparator),
    count,
    timestamps,
    yearOnly: count > 0 && yearOnly,
  };
}

function isMonotonic(values) {
  if (!Array.isArray(values) || values.length < 2) return false;
  let dir = 0;
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const d = b - a;
    if (Math.abs(d) < 1e-12) continue;
    const s = Math.sign(d);
    if (dir === 0) dir = s;
    else if (s !== dir) return false;
  }
  return dir !== 0;
}

function isoDay(ts) {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

/**
 * 推断列类型、唯一值数量、数值列的 min/max/mean。
 * @param {ReturnType<typeof parseCsv>} parsed
 * @returns {{rows:number,cols:number,columns:Array<object>,delimiter:string,truncated:boolean}}
 */
export function profileCsv(parsed) {
  const src = parsed && typeof parsed === 'object' ? parsed : {};
  const headers = Array.isArray(src.headers) ? src.headers.map((h, i) => text(h) || `列${i + 1}`) : [];
  const rows = Array.isArray(src.rows) ? src.rows : [];
  let width = headers.length;
  for (const r of rows) width = Math.max(width, Array.isArray(r) ? r.length : 0);
  for (let i = headers.length; i < width; i++) headers.push(`列${i + 1}`);

  const columns = headers.map((name, index) => {
    const rawValues = rows.map(r => cleanCell(Array.isArray(r) ? r[index] : ''));
    const nonEmpty = rawValues.filter(v => v !== '');
    const unique = new Set(nonEmpty).size;
    const numbers = [];
    const orderedNumbers = [];
    let percentCount = 0;
    for (const v of nonEmpty) {
      const n = numericValue(v);
      if (n != null) {
        numbers.push(n);
        orderedNumbers.push(n);
        if (/%$/.test(v)) percentCount++;
      }
    }
    const dateInfo = detectDateColumn(nonEmpty, name);
    let type = 'category';
    if (numbers.length > 0 && numbers.length / Math.max(1, nonEmpty.length) >= 0.8) type = 'number';
    if (dateInfo.isDate) type = 'date';

    let min = null;
    let max = null;
    let mean = null;
    if (type === 'number' && numbers.length) {
      let sum = 0;
      min = Infinity;
      max = -Infinity;
      for (const n of numbers) { sum += n; if (n < min) min = n; if (n > max) max = n; }
      mean = round(sum / numbers.length, 4);
      min = round(min, 4);
      max = round(max, 4);
    }
    let dateMin = null;
    let dateMax = null;
    if (type === 'date' && dateInfo.timestamps.length) {
      let lo = Infinity, hi = -Infinity;
      for (const ts of dateInfo.timestamps) { if (ts < lo) lo = ts; if (ts > hi) hi = ts; }
      dateMin = isoDay(lo);
      dateMax = isoDay(hi);
    }

    const orderedValues = type === 'date' ? dateInfo.timestamps : (type === 'number' ? orderedNumbers : []);
    return {
      index,
      name,
      type,
      numeric: type === 'number',
      unique,
      missing: rows.length - nonEmpty.length,
      min,
      max,
      mean,
      ordered: isMonotonic(orderedValues),
      time: type === 'date',
      percent: nonEmpty.length > 0 && percentCount / nonEmpty.length >= 0.8,
      dateMin,
      dateMax,
    };
  });

  return {
    rows: rows.length,
    cols: width,
    columns,
    delimiter: src.delimiter || ',',
    truncated: !!src.truncated,
  };
}

/* ---------- 图表类型与数据模型 ---------- */

function ensureProfile(profile, parsed) {
  if (profile && Array.isArray(profile.columns) && profile.columns.length) return profile;
  return profileCsv(parsed || {});
}

function isNumericCol(c) { return !!c && (c.type === 'number' || (c.type !== 'date' && c.numeric === true)); }

/**
 * 选择最合适的图表类型。
 * 优先级：时间/有序第一列 → 多指标雷达 → 双数值散点 → 类别柱状。
 * @param {ReturnType<typeof profileCsv>} profile
 * @returns {'line'|'bar'|'scatter'|'radar'}
 */
export function chooseChart(profile) {
  const columns = profile && Array.isArray(profile.columns) ? profile.columns : [];
  const rowCount = profile && Number.isFinite(profile.rows) ? profile.rows : 0;
  if (!columns.length || rowCount < 1) return 'bar';
  const first = columns[0];
  const numericCols = columns.filter(isNumericCol);
  const hasNumeric = numericCols.length > 0;
  const timeFirst = first && (first.type === 'date' || (isNumericCol(first) && (first.ordered || first.time)));
  if (timeFirst && hasNumeric && rowCount >= 2) return 'line';
  if (numericCols.length >= 3 && rowCount >= 2 && rowCount <= 12) return 'radar';
  if (numericCols.length >= 2 && rowCount >= 15) return 'scatter';
  if (hasNumeric && first && !isNumericCol(first) && first.unique >= 1 && first.unique <= 12) return 'bar';
  if (hasNumeric && rowCount <= 12) return 'bar';
  if (hasNumeric && first && first.ordered) return 'line';
  return 'bar';
}

function dedupeLabels(labels) {
  const seen = new Map();
  return labels.map(l => {
    const base = text(l) || '未命名';
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

function categoryXAxis(labels) {
  const count = Math.max(1, labels.length);
  const maxTicks = count <= 12 ? count : 9;
  const step = Math.max(1, Math.ceil(count / Math.max(1, maxTicks)));
  const ticks = [];
  for (let i = 0; i < count; i += step) {
    ticks.push({ value: i, label: truncateLabel(labels[i] || `行 ${i + 1}`, 8) });
  }
  if (ticks.length && ticks[ticks.length - 1].value !== count - 1) {
    ticks.push({ value: count - 1, label: truncateLabel(labels[count - 1] || `行 ${count}`, 8) });
  }
  return {
    kind: 'category',
    domain: [-0.5, count - 0.5],
    ticks: ticks.slice(0, 10),
    rotate: count > 6 || labels.some(l => Array.from(text(l)).length > 5),
  };
}

function niceScale(min, max, count = 5) {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 1;
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  if (lo === hi) {
    const pad = Math.abs(lo) > 1 ? Math.abs(lo) * 0.1 : 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / Math.max(1, count);
  let mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  if (!Number.isFinite(mag) || mag <= 0) mag = 1;
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  let step = mult * mag;
  if (!Number.isFinite(step) || step <= 0) step = 1;
  let start = Math.floor(lo / step) * step;
  let end = Math.ceil(hi / step) * step;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { start = lo; end = hi; step = (hi - lo) / Math.max(1, count); }
  const ticks = [];
  for (let i = 0; i < 40; i++) {
    const v = start + i * step;
    if (v > end + step * 0.5) break;
    const r = round(v, 10);
    if (!Number.isFinite(r)) break;
    ticks.push(r);
  }
  if (!ticks.length) ticks.push(round(lo, 4));
  return { min: start, max: end, step, ticks };
}

function tickLabel(v, step) {
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) >= 1e7 || (v !== 0 && Math.abs(v) < 1e-3)) return fmtNumber(v, 2);
  const absStep = Math.abs(step) || 1;
  const decimals = clampNum(Math.ceil(-Math.log10(absStep)) + 1, 0, 4);
  let s = v.toFixed(decimals);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

function numericXAxis(min, max) {
  const s = niceScale(min, max, 5);
  return {
    kind: 'numeric',
    domain: [s.min, s.max],
    ticks: s.ticks.map(v => ({ value: v, label: tickLabel(v, s.step) })),
    rotate: false,
  };
}

function fmtDate(ts, span) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (span >= 2.5 * YEAR_MS) return String(y);
  if (span >= 75 * DAY_MS) return `${y}-${pad2(m)}`;
  return `${pad2(m)}-${pad2(day)}`;
}

function dateTicks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi <= lo) { const mid = (lo + hi) / 2; return [{ value: mid, label: fmtDate(mid, DAY_MS) }]; }
  const span = hi - lo;
  const out = [];
  if (span >= 2.5 * YEAR_MS) {
    const startY = new Date(lo).getUTCFullYear();
    const endY = new Date(hi).getUTCFullYear();
    const step = Math.max(1, Math.ceil((endY - startY) / Math.max(1, count - 1)));
    for (let y = startY; y <= endY; y += step) {
      const ts = Date.UTC(y, 0, 1);
      if (ts >= lo - 1 && ts <= hi + 1) out.push({ value: ts, label: String(y) });
    }
  } else if (span >= 55 * DAY_MS) {
    let y = new Date(lo).getUTCFullYear();
    let m = new Date(lo).getUTCMonth();
    const months = [];
    for (let k = 0; k < 40; k++) {
      const ts = Date.UTC(y, m, 1);
      if (ts > hi) break;
      if (ts >= lo) months.push(ts);
      m++;
      if (m > 11) { m = 0; y++; }
    }
    const step = Math.max(1, Math.ceil(months.length / Math.max(1, count)));
    for (let i = 0; i < months.length; i += step) {
      out.push({ value: months[i], label: fmtDate(months[i], span) });
    }
    if (!out.length && months.length) out.push({ value: months[0], label: fmtDate(months[0], span) });
  } else {
    const n = Math.max(2, count);
    for (let i = 0; i < n; i++) {
      const ts = lo + (hi - lo) * i / (n - 1);
      out.push({ value: ts, label: fmtDate(ts, span) });
    }
  }
  if (!out.length) out.push({ value: lo, label: fmtDate(lo, span) });
  return out.slice(0, 8);
}

function dateXAxis(min, max) {
  let lo = Number.isFinite(min) ? min : Date.UTC(2020, 0, 1);
  let hi = Number.isFinite(max) ? max : Date.UTC(2021, 0, 1);
  if (hi <= lo) { lo -= 15 * DAY_MS; hi += 15 * DAY_MS; }
  else {
    const pad = (hi - lo) * 0.03;
    lo -= pad;
    hi += pad;
  }
  return { kind: 'date', domain: [lo, hi], ticks: dateTicks(lo, hi, 5), rotate: false };
}

function linearFit(points, xMap) {
  const pairs = [];
  for (const p of points) {
    if (!p || !Number.isFinite(p.y)) continue;
    const x = xMap ? xMap(p) : p.x;
    if (Number.isFinite(x)) pairs.push([x, p.y]);
  }
  const n = pairs.length;
  if (n < 2) return { slope: 0, intercept: pairs.length ? pairs[0][1] : 0, r2: 0, n };
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pairs) {
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
  }
  const denomX = n * sxx - sx * sx;
  const denomY = n * syy - sy * sy;
  if (Math.abs(denomX) < 1e-12) return { slope: 0, intercept: sy / n, r2: 0, n };
  const slope = (n * sxy - sx * sy) / denomX;
  const intercept = (sy - slope * sx) / n;
  let r2 = denomY > 1e-12 ? ((n * sxy - sx * sy) * (n * sxy - sx * sy)) / (denomX * denomY) : 0;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept) || !Number.isFinite(r2)) {
    return { slope: 0, intercept: 0, r2: 0, n };
  }
  r2 = clampNum(r2, 0, 1);
  return { slope, intercept, r2, n };
}

function computeStats(points, xMode = 'index') {
  const valid = (points || []).filter(p => p && Number.isFinite(p.y));
  if (!valid.length) return emptyStats();
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let peakPoint = valid[0];
  for (const p of valid) {
    sum += p.y;
    if (p.y < min) min = p.y;
    if (p.y > max) { max = p.y; peakPoint = p; }
  }
  let origin = null;
  if (xMode === 'date') {
    let lo = Infinity;
    for (const p of valid) if (Number.isFinite(p.x) && p.x < lo) lo = p.x;
    origin = Number.isFinite(lo) ? lo : null;
  }
  const fit = linearFit(valid, p => {
    if (!Number.isFinite(p.x)) return null;
    return xMode === 'date' && origin != null ? (p.x - origin) / YEAR_MS : p.x;
  });
  return {
    mean: round(sum / valid.length, 4),
    min: round(min, 4),
    max: round(max, 4),
    slope: round(fit.slope, 4),
    r2: round(clampNum(fit.r2, 0, 1), 4),
    peak: round(max, 4),
    category: text(peakPoint.label) || fmtNumber(max, 4),
  };
}

function emptyChartModel(type, reason, rowCount = 0) {
  return {
    type,
    title: CHART_TYPE_LABEL[type] || '图表',
    xLabel: '',
    yLabel: '',
    xMode: 'category',
    xAxis: null,
    categories: [],
    series: [],
    seriesNames: [],
    stats: emptyStats(),
    n: 0,
    hasData: false,
    invalidReason: reason || '暂无可绘制的数值列',
    fit: null,
    radar: null,
    rowCount,
    slopeUnit: '',
  };
}

function numericAt(parsed, colIndex, rowIndex) {
  const rows = parsed && Array.isArray(parsed.rows) ? parsed.rows : [];
  const row = rows[rowIndex];
  return numericValue(Array.isArray(row) ? row[colIndex] : '');
}

function rawAt(parsed, colIndex, rowIndex) {
  const rows = parsed && Array.isArray(parsed.rows) ? parsed.rows : [];
  const row = rows[rowIndex];
  return cleanCell(Array.isArray(row) ? row[colIndex] : '');
}

function buildChartModel(parsed, profile, type) {
  const rows = parsed && Array.isArray(parsed.rows) ? parsed.rows : [];
  const columns = profile && Array.isArray(profile.columns) ? profile.columns : [];
  if (!rows.length || !columns.length) return emptyChartModel(type, '暂无可绘制的数值列', rows.length);
  const rowLabels = rows.map((r, i) => cleanCell(Array.isArray(r) ? r[0] : '') || `行 ${i + 1}`);
  const numericCols = columns.filter(isNumericCol);

  if (type === 'line') {
    const first = columns[0];
    let xMode = 'category';
    let xCol = first || null;
    let yCols = numericCols;
    if (first && first.type === 'date') {
      xMode = 'date';
    } else if (first && isNumericCol(first)) {
      const others = numericCols.filter(c => c.index !== first.index);
      if (others.length) { xMode = 'number'; yCols = others; }
      else { xMode = 'index'; yCols = [first]; xCol = null; }
    }
    if (!yCols.length) return emptyChartModel(type, '该 CSV 没有可用于绘图的数值列', rows.length);

    const series = [];
    for (const col of yCols) {
      const points = [];
      for (let i = 0; i < rows.length; i++) {
        const y = numericAt(parsed, col.index, i);
        if (y == null) continue;
        let x;
        let label;
        if (xMode === 'number') {
          x = numericAt(parsed, xCol.index, i);
          if (x == null) continue;
          label = rawAt(parsed, xCol.index, i);
        } else if (xMode === 'date') {
          const d = parseDateCell(rawAt(parsed, xCol.index, i), true);
          if (!d) continue;
          x = d.ts;
          label = d.label;
        } else if (xMode === 'index') {
          x = i;
          label = `行 ${i + 1}`;
        } else {
          x = i;
          label = rowLabels[i];
        }
        points.push({ x, y, label, row: i });
      }
      if (!points.length) continue;
      series.push({ name: text(col.name) || `列${col.index + 1}`, color: PALETTE[series.length % PALETTE.length], points });
    }
    if (!series.length) return emptyChartModel(type, '数值列全部为空，无法绘制', rows.length);

    let xAxis;
    const categories = (xMode === 'category' || xMode === 'index') ? rowLabels : [];
    if (xMode === 'number') {
      let lo = Infinity, hi = -Infinity;
      for (const s of series) for (const p of s.points) { if (p.x < lo) lo = p.x; if (p.x > hi) hi = p.x; }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return emptyChartModel(type, '横轴没有可用的数值', rows.length);
      xAxis = numericXAxis(lo, hi);
    } else if (xMode === 'date') {
      let lo = Infinity, hi = -Infinity;
      for (const s of series) for (const p of s.points) { if (p.x < lo) lo = p.x; if (p.x > hi) hi = p.x; }
      xAxis = dateXAxis(lo, hi);
    } else {
      xAxis = categoryXAxis(categories);
    }
    const primary = series[0];
    const yLabel = yCols.length === 1 ? text(yCols[0].name) : '数值';
    const xLabel = xCol ? text(xCol.name) : '序号';
    return {
      type,
      title: yCols.length === 1 ? `${yLabel}随${xLabel}的变化` : `${xLabel}上的多指标变化`,
      xLabel,
      yLabel,
      xMode,
      xAxis,
      categories,
      series,
      seriesNames: series.map(s => s.name),
      stats: computeStats(primary.points, xMode),
      n: primary.points.length,
      hasData: true,
      invalidReason: '',
      fit: null,
      radar: null,
      rowCount: rows.length,
      slopeUnit: xMode === 'date' ? '每年' : xMode === 'number' ? '' : '每行',
    };
  }

  if (type === 'bar') {
    if (!numericCols.length) return emptyChartModel(type, '该 CSV 没有可用于绘图的数值列', rows.length);
    const first = columns[0];
    let measureCols = numericCols;
    if (first && isNumericCol(first)) {
      const others = numericCols.filter(c => c.index !== first.index);
      if (others.length) measureCols = others;
    }
    const categories = rows.map((r, i) => cleanCell(Array.isArray(r) ? r[(first && first.index) || 0] : '') || `行 ${i + 1}`);
    const series = [];
    for (const col of measureCols) {
      const points = [];
      for (let i = 0; i < rows.length; i++) {
        const y = numericAt(parsed, col.index, i);
        if (y == null) continue;
        points.push({ x: i, y, label: categories[i], row: i });
      }
      if (!points.length) continue;
      series.push({ name: text(col.name) || `列${col.index + 1}`, color: PALETTE[series.length % PALETTE.length], points });
    }
    if (!series.length) return emptyChartModel(type, '数值列全部为空，无法绘制', rows.length);
    const yLabel = measureCols.length === 1 ? text(measureCols[0].name) : '数值';
    const xLabel = first ? text(first.name) : '类别';
    return {
      type,
      title: `${yLabel}按${xLabel}的类别对比`,
      xLabel,
      yLabel,
      xMode: 'category',
      xAxis: categoryXAxis(categories),
      categories,
      series,
      seriesNames: series.map(s => s.name),
      stats: computeStats(series[0].points, 'index'),
      n: series[0].points.length,
      hasData: true,
      invalidReason: '',
      fit: null,
      radar: null,
      rowCount: rows.length,
      slopeUnit: '每行',
    };
  }

  if (type === 'scatter') {
    if (!numericCols.length) return emptyChartModel(type, '散点图至少需要一个数值列', rows.length);
    const xCol = numericCols[0];
    const yCol = numericCols[1] || null;
    const points = [];
    if (yCol) {
      for (let i = 0; i < rows.length; i++) {
        const x = numericAt(parsed, xCol.index, i);
        const y = numericAt(parsed, yCol.index, i);
        if (x == null || y == null) continue;
        points.push({ x, y, label: rowLabels[i], row: i });
      }
    } else {
      for (let i = 0; i < rows.length; i++) {
        const y = numericAt(parsed, xCol.index, i);
        if (y == null) continue;
        points.push({ x: i, y, label: rowLabels[i], row: i });
      }
    }
    if (!points.length) return emptyChartModel(type, '没有同时有效的数值点', rows.length);
    let xAxis;
    if (yCol) {
      let lo = Infinity, hi = -Infinity;
      for (const p of points) { if (p.x < lo) lo = p.x; if (p.x > hi) hi = p.x; }
      xAxis = numericXAxis(lo, hi);
    } else {
      xAxis = categoryXAxis(rowLabels);
    }
    const fit = points.length >= 3 ? linearFit(points, p => p.x) : null;
    const xLabel = yCol ? text(xCol.name) : '序号';
    const yName = yCol ? text(yCol.name) : text(xCol.name);
    return {
      type,
      title: yCol ? `${yName} 与 ${xLabel} 的关系` : `${yName}的逐行分布`,
      xLabel,
      yLabel: yName,
      xMode: yCol ? 'number' : 'index',
      xAxis,
      categories: yCol ? [] : rowLabels,
      series: [{ name: yName, color: PALETTE[0], points }],
      seriesNames: [yName],
      stats: computeStats(points, yCol ? 'number' : 'index'),
      n: points.length,
      hasData: true,
      invalidReason: '',
      fit: fit && Number.isFinite(fit.slope) && Number.isFinite(fit.intercept) ? fit : null,
      radar: null,
      rowCount: rows.length,
      slopeUnit: yCol ? '' : '每行',
    };
  }

  if (type === 'radar') {
    if (numericCols.length < 3) return emptyChartModel(type, '雷达图至少需要 3 个数值指标', rows.length);
    const axes = numericCols;
    const entries = [];
    for (let i = 0; i < rows.length; i++) {
      const values = axes.map(c => numericAt(parsed, c.index, i));
      if (!values.every(v => v != null && Number.isFinite(v))) continue;
      entries.push({ label: rowLabels[i], raw: values, row: i });
    }
    if (!entries.length) return emptyChartModel(type, '没有在全部指标上都有数值的行', rows.length);
    const limited = entries.slice(0, 12);
    const labels = dedupeLabels(limited.map(e => e.label));
    const mins = axes.map((_, j) => Math.min(...limited.map(e => e.raw[j])));
    const maxs = axes.map((_, j) => Math.max(...limited.map(e => e.raw[j])));
    const radarRows = limited.map((e, i) => ({
      name: labels[i],
      color: PALETTE[i % PALETTE.length],
      values: e.raw.map((v, j) => {
        const span = maxs[j] - mins[j];
        return span > 1e-12 ? clampNum((v - mins[j]) / span, 0, 1) : 0.5;
      }),
      raw: e.raw,
    }));
    const points = limited.map((e, i) => ({ x: i, y: e.raw[0], label: labels[i], row: e.row }));
    return {
      type,
      title: `${axes.length} 项指标对比`,
      xLabel: '指标',
      yLabel: '归一化值',
      xMode: 'radar',
      xAxis: null,
      categories: labels,
      series: [],
      seriesNames: labels,
      stats: computeStats(points, 'index'),
      n: limited.length,
      hasData: true,
      invalidReason: '',
      fit: null,
      radar: { axes: axes.map(c => text(c.name) || `列${c.index + 1}`), rows: radarRows },
      rowCount: rows.length,
      slopeUnit: '每行',
    };
  }

  return emptyChartModel(type, '不支持的图表类型', rows.length);
}

function pickChartType(candidate, profile) {
  return ['line', 'bar', 'scatter', 'radar'].includes(candidate) ? candidate : chooseChart(profile);
}

/* ---------- SVG 图表绘制 ---------- */

function scaleLinear(d0, d1, r0, r1) {
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || Math.abs(d1 - d0) < 1e-12) {
    const mid = (r0 + r1) / 2;
    return () => mid;
  }
  return v => {
    if (!Number.isFinite(v)) return (r0 + r1) / 2;
    return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  };
}

function computeYScale(model) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of model.series) {
    for (const p of s.points) {
      if (!Number.isFinite(p.y)) continue;
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return niceScale(0, 1, 5);
  if (model.type === 'bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  return niceScale(lo, hi, 5);
}

function legendMarkup(entries) {
  if (!entries.length) return '';
  const tight = entries.length > 8;
  const rowH = tight ? 14.5 : 16.5;
  const font = tight ? 9 : 10;
  const parts = [
    `<g aria-label="图例">`,
    `<text x="584" y="92" font-family="${SANS}" font-size="10" letter-spacing="1.5" fill="#8a8177">图例</text>`,
  ];
  entries.forEach((entry, i) => {
    const y = 111 + i * rowH;
    parts.push(`<line x1="584" y1="${svgNum(y - 3.5)}" x2="599" y2="${svgNum(y - 3.5)}" stroke="${entry.color}" stroke-width="3" stroke-linecap="round"/>`);
    parts.push(`<text x="606" y="${svgNum(y)}" font-family="${SANS}" font-size="${font}" fill="#4a443c">${xml(truncateLabel(entry.name, tight ? 9 : 10))}</text>`);
  });
  parts.push('</g>');
  return parts.join('');
}

function chartFrame(xAxis, yScaleInfo, xScale, model, title, subtitle) {
  const yScale = scaleLinear(yScaleInfo.min, yScaleInfo.max, PLOT_BOTTOM, CHART_TOP);
  const clips = `<defs><clipPath id="lxyPlotClip"><rect x="${CHART_LEFT}" y="${CHART_TOP}" width="${PLOT_W}" height="${PLOT_H}"/></clipPath></defs>`;
  let grid = '';
  let axes = '';
  for (const t of yScaleInfo.ticks) {
    const y = yScale(t);
    grid += `<line x1="${CHART_LEFT}" y1="${svgNum(y)}" x2="${PLOT_RIGHT}" y2="${svgNum(y)}" stroke="#e8e3da" stroke-width="0.8"/>`;
    axes += `<line x1="${CHART_LEFT - 4}" y1="${svgNum(y)}" x2="${CHART_LEFT}" y2="${svgNum(y)}" stroke="#8a8177" stroke-width="0.8"/>`;
    axes += `<text x="${CHART_LEFT - 9}" y="${svgNum(y + 3.5)}" text-anchor="end" font-family="${SANS}" font-size="10" fill="#6b6259">${xml(tickLabel(t, yScaleInfo.step))}</text>`;
  }
  const rotate = xAxis && xAxis.rotate;
  if (xAxis) {
    for (const t of xAxis.ticks) {
      const x = xScale(t.value);
      grid += `<line x1="${svgNum(x)}" y1="${CHART_TOP}" x2="${svgNum(x)}" y2="${PLOT_BOTTOM}" stroke="#f1ede6" stroke-width="0.7"/>`;
      axes += `<line x1="${svgNum(x)}" y1="${PLOT_BOTTOM}" x2="${svgNum(x)}" y2="${PLOT_BOTTOM + 4}" stroke="#8a8177" stroke-width="0.8"/>`;
      if (rotate) {
        axes += `<text x="${svgNum(x)}" y="${PLOT_BOTTOM + 17}" text-anchor="end" transform="rotate(-24 ${svgNum(x)} ${PLOT_BOTTOM + 17})" font-family="${SANS}" font-size="10" fill="#6b6259">${xml(t.label)}</text>`;
      } else {
        axes += `<text x="${svgNum(x)}" y="${PLOT_BOTTOM + 18}" text-anchor="middle" font-family="${SANS}" font-size="10" fill="#6b6259">${xml(t.label)}</text>`;
      }
    }
  }
  const yTitle = model.yLabel || '数值';
  const xTitle = model.xLabel || '';
  const axisLabels =
    `<text x="20" y="${(CHART_TOP + PLOT_BOTTOM) / 2}" transform="rotate(-90 20 ${(CHART_TOP + PLOT_BOTTOM) / 2})" text-anchor="middle" font-family="${SANS}" font-size="11.5" fill="#4a443c">${xml(truncateLabel(yTitle, 29))}</text>` +
    (xTitle ? `<text x="${(CHART_LEFT + PLOT_RIGHT) / 2}" y="${CHART_H - 7}" text-anchor="middle" font-family="${SANS}" font-size="11.5" fill="#4a443c">${xml(truncateLabel(xTitle, 42))}</text>` : '');
  return {
    yScale,
    clips,
    pre: `${clips}<rect x="0" y="0" width="${CHART_W}" height="${CHART_H}" fill="#ffffff"/>` +
      `<text x="${CHART_W / 2}" y="34" text-anchor="middle" font-family="${SERIF}" font-size="17" font-weight="600" fill="#26221d">${xml(truncateLabel(title, 36))}</text>` +
      `<text x="${CHART_W / 2}" y="52" text-anchor="middle" font-family="${SANS}" font-size="10.5" letter-spacing="0.6" fill="#8a8177">${xml(subtitle)}</text>` +
      grid,
    axes: `<path d="M ${CHART_LEFT} ${CHART_TOP} L ${CHART_LEFT} ${PLOT_BOTTOM} L ${PLOT_RIGHT} ${PLOT_BOTTOM}" fill="none" stroke="#8a8177" stroke-width="1"/>` + axes + axisLabels,
  };
}

function placeholderMarkup(message) {
  return `<rect x="${CHART_LEFT}" y="${CHART_TOP}" width="${PLOT_W}" height="${PLOT_H}" fill="#fbfaf7" stroke="#e8e3da" stroke-dasharray="4 5"/>` +
    `<text x="${(CHART_LEFT + PLOT_RIGHT) / 2}" y="${(CHART_TOP + PLOT_BOTTOM) / 2}" text-anchor="middle" font-family="${SANS}" font-size="13" fill="#8a8177">${xml(message || '暂无可绘制的数值列')}</text>`;
}

function renderRadar(model) {
  const axes = model.radar.axes;
  const rows = model.radar.rows;
  const cx = 300;
  const cy = 214;
  const r = 118;
  const count = axes.length;
  const angle = i => -Math.PI / 2 + (i * 2 * Math.PI) / count;
  const point = (i, v) => [cx + Math.cos(angle(i)) * r * v, cy + Math.sin(angle(i)) * r * v];
  let out = '';
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    const pts = axes.map((_, i) => point(i, ring).map(svgNum).join(',')).join(' ');
    out += `<polygon points="${pts}" fill="none" stroke="${ring === 1 ? '#d8d2c8' : '#ece7df'}" stroke-width="0.9"/>`;
  }
  for (let i = 0; i < count; i++) {
    const [x, y] = point(i, 1);
    out += `<line x1="${cx}" y1="${cy}" x2="${svgNum(x)}" y2="${svgNum(y)}" stroke="#e8e3da" stroke-width="0.8"/>`;
    const lx = cx + Math.cos(angle(i)) * (r + 19);
    const ly = cy + Math.sin(angle(i)) * (r + 19);
    const cos = Math.cos(angle(i));
    const anchor = cos > 0.2 ? 'start' : cos < -0.2 ? 'end' : 'middle';
    out += `<text x="${svgNum(lx)}" y="${svgNum(ly + 3.5)}" text-anchor="${anchor}" font-family="${SANS}" font-size="10" fill="#4a443c">${xml(truncateLabel(axes[i], 8))}</text>`;
  }
  for (const row of rows) {
    const pts = row.values.map((v, i) => point(i, clampNum(v, 0, 1)).map(svgNum).join(',')).join(' ');
    out += `<polygon points="${pts}" fill="${row.color}" fill-opacity="0.10" stroke="${row.color}" stroke-width="1.6" stroke-linejoin="round"/>`;
    row.values.forEach((v, i) => {
      const [x, y] = point(i, clampNum(v, 0, 1));
      out += `<circle cx="${svgNum(x)}" cy="${svgNum(y)}" r="2.2" fill="#ffffff" stroke="${row.color}" stroke-width="1.2"/>`;
    });
  }
  out += `<text x="${cx + 4}" y="${cy - r + 14}" font-family="${SANS}" font-size="8" fill="#a39a8d">100%</text>`;
  out += `<text x="${cx + 4}" y="${cy - r * 0.5 + 14}" font-family="${SANS}" font-size="8" fill="#a39a8d">50%</text>`;
  return out;
}

/**
 * 生成学术风格、纯 SVG 的图表（折线 / 柱状 / 散点 / 雷达）。
 * @param {ReturnType<typeof parseCsv>} parsed
 * @param {ReturnType<typeof profileCsv>} profile
 * @param {{chartType?:string,type?:string,title?:string,xLabel?:string,yLabel?:string,subtitle?:string}} [opts]
 * @returns {{svg:string,chartType:string,series:string[],stats:{mean:number,min:number,max:number,slope:number,r2:number,peak:number,category:string}}}
 */
export function renderChart(parsed, profile, opts = {}) {
  const p = ensureProfile(profile, parsed);
  const type = pickChartType(opts.chartType || opts.type, p);
  const model = buildChartModel(parsed, p, type);
  const title = text(opts.title) || model.title || CHART_TYPE_LABEL[type];
  const subtitle = text(opts.subtitle) || `${CHART_TYPE_LABEL[type]}${model.hasData ? ` · 样本 n=${model.n}` : ''}`;
  const xTitle = text(opts.xLabel) || model.xLabel;
  const yTitle = text(opts.yLabel) || model.yLabel;
  const displayModel = Object.assign({}, model, { xLabel: xTitle, yLabel: yTitle });

  let body = '';
  let legend = '';

  if (!model.hasData) {
    body = placeholderMarkup(model.invalidReason);
  } else if (type === 'radar') {
    const frame = chartFrame(null, niceScale(0, 1, 5), () => 0, displayModel, title, subtitle);
    body = frame.pre + `<g aria-label="雷达图">${renderRadar(model)}</g>` + frame.axes;
    legend = legendMarkup(model.radar.rows.map(r => ({ name: r.name, color: r.color })));
  } else {
    const yScaleInfo = computeYScale(model);
    const xAxis = model.xAxis || categoryXAxis(model.categories);
    const xScale = scaleLinear(xAxis.domain[0], xAxis.domain[1], CHART_LEFT, PLOT_RIGHT);
    const frame = chartFrame(xAxis, yScaleInfo, xScale, displayModel, title, subtitle);
    const yScale = frame.yScale;
    let marks = '';

    if (type === 'line') {
      for (const s of model.series) {
        let d = '';
        let started = false;
        for (const pnt of s.points) {
          if (!Number.isFinite(pnt.x) || !Number.isFinite(pnt.y)) continue;
          const x = xScale(pnt.x);
          const y = yScale(pnt.y);
          d += `${started ? ' L' : 'M'} ${svgNum(x)} ${svgNum(y)}`;
          started = true;
        }
        if (!d) continue;
        marks += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`;
        if (s.points.length <= 80) {
          for (const pnt of s.points) {
            if (!Number.isFinite(pnt.x) || !Number.isFinite(pnt.y)) continue;
            marks += `<circle cx="${svgNum(xScale(pnt.x))}" cy="${svgNum(yScale(pnt.y))}" r="2.3" fill="#ffffff" stroke="${s.color}" stroke-width="1.2"/>`;
          }
        }
      }
    } else if (type === 'bar') {
      const count = Math.max(1, model.categories.length);
      const groupW = PLOT_W / count;
      const area = Math.max(2, Math.min(groupW * 0.72, 140));
      const barW = Math.max(1, area / Math.max(1, model.series.length));
      const zeroY = yScale(0);
      model.series.forEach((s, si) => {
        const byRow = new Map(s.points.map(pnt => [pnt.row, pnt.y]));
        for (let i = 0; i < count; i++) {
          const value = byRow.get(i);
          if (!Number.isFinite(value)) continue;
          const cx = xScale(i);
          const x = cx - area / 2 + si * barW;
          const y = yScale(value);
          const top = Math.min(y, zeroY);
          const h = Math.abs(zeroY - y);
          marks += `<rect x="${svgNum(x)}" y="${svgNum(top)}" width="${svgNum(Math.max(0.8, barW - 1))}" height="${svgNum(h)}" rx="2" fill="${s.color}" fill-opacity="0.9"><title>${xml(`${s.name}：${fmtNumber(value, 4)}`)}</title></rect>`;
        }
      });
    } else if (type === 'scatter') {
      const points = model.series[0] ? model.series[0].points : [];
      const color = model.series[0] ? model.series[0].color : PALETTE[0];
      if (model.fit && points.length >= 3 && Number.isFinite(model.fit.slope)) {
        const x0 = xAxis.domain[0];
        const x1 = xAxis.domain[1];
        const y0 = model.fit.intercept + model.fit.slope * x0;
        const y1 = model.fit.intercept + model.fit.slope * x1;
        if ([y0, y1].every(Number.isFinite)) {
          marks += `<line x1="${svgNum(xScale(x0))}" y1="${svgNum(yScale(y0))}" x2="${svgNum(xScale(x1))}" y2="${svgNum(yScale(y1))}" stroke="#6b6259" stroke-width="1" stroke-dasharray="5 4" opacity="0.65"/>`;
        }
      }
      for (const pnt of points) {
        if (!Number.isFinite(pnt.x) || !Number.isFinite(pnt.y)) continue;
        marks += `<circle cx="${svgNum(xScale(pnt.x))}" cy="${svgNum(yScale(pnt.y))}" r="3.2" fill="${color}" fill-opacity="0.78" stroke="#ffffff" stroke-width="0.8"/>`;
      }
    }

    body = frame.pre + `<g clip-path="url(#lxyPlotClip)" aria-label="数据图层">${marks}</g>` + frame.axes;
    legend = legendMarkup(model.series.map(s => ({ name: s.name, color: s.color })));
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_W} ${CHART_H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${xml(title)}" style="width:100%;height:auto;display:block;max-width:100%">` +
    body + legend + `</svg>`;

  return {
    svg,
    chartType: type,
    series: model.seriesNames.slice(),
    stats: {
      mean: Number.isFinite(model.stats.mean) ? model.stats.mean : 0,
      min: Number.isFinite(model.stats.min) ? model.stats.min : 0,
      max: Number.isFinite(model.stats.max) ? model.stats.max : 0,
      slope: Number.isFinite(model.stats.slope) ? model.stats.slope : 0,
      r2: Number.isFinite(model.stats.r2) ? model.stats.r2 : 0,
      peak: Number.isFinite(model.stats.peak) ? model.stats.peak : 0,
      category: text(model.stats.category),
    },
  };
}

function mergeStats(src, fallback) {
  const out = {
    mean: fallback.mean, min: fallback.min, max: fallback.max,
    slope: fallback.slope, r2: fallback.r2, peak: fallback.peak, category: fallback.category,
  };
  if (!src || typeof src !== 'object') return out;
  for (const k of ['mean', 'min', 'max', 'slope', 'r2', 'peak']) {
    if (Number.isFinite(Number(src[k]))) out[k] = Number(src[k]);
  }
  if (typeof src.category === 'string' && src.category) out.category = text(src.category);
  return out;
}

/**
 * 根据真实计算结果生成中文图注；R² 偏低时写明“波动明显”，不使用任何虚构数值。
 * @param {ReturnType<typeof parseCsv>} parsed
 * @param {ReturnType<typeof profileCsv>} profile
 * @param {{chartType?:string,stats?:object,figureNo?:number}|string} [chart]
 * @returns {string}
 */
export function captionFor(parsed, profile, chart) {
  const p = ensureProfile(profile, parsed);
  let type = null;
  if (typeof chart === 'string') type = chart;
  else if (chart && typeof chart === 'object' && typeof chart.chartType === 'string') type = chart.chartType;
  type = pickChartType(type, p);
  const model = buildChartModel(parsed, p, type);
  const stats = mergeStats(chart && typeof chart === 'object' ? chart.stats : null, model.stats);
  const figureNo = chart && typeof chart === 'object' && Number.isFinite(chart.figureNo) && chart.figureNo > 0
    ? Math.floor(chart.figureNo) : 1;
  const rows = parsed && Array.isArray(parsed.rows) ? parsed.rows.length : (Number.isFinite(p.rows) ? p.rows : 0);
  const cols = p && Number.isFinite(p.cols) ? p.cols : (Array.isArray(p.headers) ? p.headers.length : 0);

  if (!model.hasData) {
    return `图 ${figureNo}：数据表概览（${rows} 行 × ${cols} 列）。当前数据缺少可绘制的数值列，未生成定量图表与趋势结论。`;
  }

  const n = model.n;
  const mean = fmtNumber(stats.mean, 4);
  const min = fmtNumber(stats.min, 4);
  const max = fmtNumber(stats.max, 4);
  const slope = fmtNumber(stats.slope, 4);
  const r2 = fmtNumber(stats.r2, 3);
  const peakLabel = stats.category || '—';
  const trend = stats.slope > 0.0001 ? '上升' : stats.slope < -0.0001 ? '下降' : '基本持平';
  const lowR2 = stats.r2 < 0.5;
  const range = `取值范围 ${min}–${max}，均值 ${mean}`;
  const peak = `峰值出现在 ${peakLabel}（${max}）`;

  if (type === 'line') {
    const yName = model.yLabel || '数值';
    const xName = model.xLabel || '横轴';
    const bits = [];
    if (n >= 3) {
      bits.push(`整体呈${trend}趋势（斜率 ${slope}）`);
      bits.push(`R²=${r2}，${lowR2 ? '波动明显' : '趋势较平稳'}`);
    } else {
      bits.push(`样本量不足（n=${n}），未作趋势判断`);
    }
    bits.push(peak);
    bits.push(range);
    return `图 ${figureNo}：${yName}随${xName}的变化（n=${n}）。${bits.join('；')}。`;
  }

  if (type === 'bar') {
    const yName = model.yLabel || '数值';
    const xName = model.xLabel || '类别';
    const bits = [`共 ${n} 个类别`, peak, range];
    if (n >= 3) bits.push(`按输入顺序的回归斜率 ${slope}，R²=${r2}，${lowR2 ? '波动明显' : '趋势较平稳'}`);
    return `图 ${figureNo}：${yName}按${xName}的类别对比（n=${n}）。${bits.join('；')}。`;
  }

  if (type === 'scatter') {
    const yName = model.yLabel || '纵轴';
    const xName = model.xLabel || '横轴';
    const bits = [];
    if (n >= 3) {
      bits.push(`线性拟合斜率 ${slope}`);
      bits.push(`R²=${r2}，${lowR2 ? '波动明显' : '线性关系较明显'}`);
    } else {
      bits.push(`样本量不足（n=${n}），未作拟合判断`);
    }
    bits.push(`y 最大值 ${max} 出现在 ${peakLabel}`);
    bits.push(range);
    return `图 ${figureNo}：${yName}与${xName}的关系（n=${n}）。${bits.join('；')}。`;
  }

  const axes = model.radar ? model.radar.axes : [];
  const axisNames = axes.length ? axes.join('、') : '多项指标';
  const bits = [`首项指标 ${axes[0] || '指标'}：${peak}`, range];
  if (n >= 3) bits.push(`按行序的回归斜率 ${slope}，R²=${r2}，${lowR2 ? '波动明显' : '趋势较平稳'}`);
  return `图 ${figureNo}：${axisNames}的多指标对比（n=${n}，指标 ${axes.length} 项）。${bits.join('；')}。`;
}

/* ---------- matplotlib / LaTeX 导出 ---------- */

function pyStr(v) {
  return JSON.stringify(String(v == null ? '' : v))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function mplLabel(v) {
  return String(v == null ? '' : v).replace(/\$/g, '\\$');
}

function pyNum(v) {
  return Number.isFinite(v) ? String(round(v, 6)) : '0';
}

function pyNullableNum(v) {
  return Number.isFinite(v) ? pyNum(v) : 'None';
}

function pyStrList(values) {
  return '[' + values.map(v => pyStr(mplLabel(v))).join(', ') + ']';
}

function pyNumList(values) {
  return '[' + values.map(pyNullableNum).join(', ') + ']';
}

function pyTuplePoints(points) {
  return '[' + points
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map(p => `(${pyNum(p.x)}, ${pyNum(p.y)})`)
    .join(', ') + ']';
}

const PY_HEADER = `# -*- coding: utf-8 -*-
# 研究图表 · 由论小研生成
# 依赖：matplotlib；输出 figure.pdf / figure.png
import math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager


def _setup_cjk_font():
    """中文字体回退：按顺序选择系统已安装的 CJK 字体。"""
    candidates = ["Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "SimHei", "PingFang SC", "WenQuanYi Micro Hei"]
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for name in candidates:
        if name in installed:
            plt.rcParams["font.sans-serif"] = [name, "DejaVu Sans"]
            break
    else:
        plt.rcParams["font.sans-serif"] = ["DejaVu Sans"]
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["axes.unicode_minus"] = False


_setup_cjk_font()
`;

const PY_FOOTER = `
fig.tight_layout()
fig.savefig("figure.pdf", bbox_inches="tight")
fig.savefig("figure.png", dpi=300, bbox_inches="tight")
plt.close(fig)
`;

function pythonCommonAxes(model) {
  const y = computeYScale(model);
  return {
    y,
    lines: [
      'ax.grid(True, color="#e8e3da", linewidth=0.6)',
      'ax.set_axisbelow(True)',
      'for side in ("top", "right"):',
      '    ax.spines[side].set_visible(False)',
      `ax.set_ylim(${pyNum(y.min)}, ${pyNum(y.max)})`,
      `ax.set_title(${pyStr(mplLabel(model.title))}, fontsize=13, pad=12)`,
      `ax.set_xlabel(${pyStr(mplLabel(model.xLabel || '横轴'))}, fontsize=10)`,
      `ax.set_ylabel(${pyStr(mplLabel(model.yLabel || '数值'))}, fontsize=10)`,
    ],
  };
}

function xTicksPython(model) {
  const xAxis = model.xAxis;
  if (!xAxis || !xAxis.ticks || !xAxis.ticks.length) return ['x_ticks = []', 'x_ticklabels = []'];
  return [
    `x_ticks = [${xAxis.ticks.map(t => pyNum(t.value)).join(', ')}]`,
    `x_ticklabels = ${pyStrList(xAxis.ticks.map(t => t.label))}`,
  ];
}

/**
 * 生成与预览一致的 matplotlib 脚本；含中文字体回退，输出 figure.pdf / figure.png。
 * @param {ReturnType<typeof parseCsv>} parsed
 * @param {ReturnType<typeof profileCsv>} profile
 * @param {{chartType?:string}|string} [chart]
 * @returns {string}
 */
export function matplotlibScript(parsed, profile, chart) {
  const p = ensureProfile(profile, parsed);
  let type = null;
  if (typeof chart === 'string') type = chart;
  else if (chart && typeof chart === 'object' && typeof chart.chartType === 'string') type = chart.chartType;
  type = pickChartType(type, p);
  const model = buildChartModel(parsed, p, type);

  if (!model.hasData) {
    return PY_HEADER + `
fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=160)
fig.patch.set_facecolor("#ffffff")
ax.axis("off")
ax.text(0.5, 0.5, ${pyStr(mplLabel(model.invalidReason || '暂无可绘制的数值列'))}, transform=ax.transAxes, ha="center", va="center", fontsize=12, color="#8a8177")
` + PY_FOOTER;
  }

  if (type === 'line') {
    const common = pythonCommonAxes(model);
    const ticks = xTicksPython(model);
    const seriesCode = model.series.map(s => `    (${pyStr(mplLabel(s.name))}, ${pyTuplePoints(s.points)}),`).join('\n');
    return PY_HEADER + `
fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=160)
fig.patch.set_facecolor("#ffffff")
palette = ["#0f5b57", "#a9522c", "#b08324", "#4a6b8a", "#7a5c9e", "#5f7a52"]
series = [
${seriesCode}
]
for idx, (name, pairs) in enumerate(series):
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    ax.plot(xs, ys, color=palette[idx % len(palette)], linewidth=1.6, marker="o", markersize=3.2, label=name)
${ticks.join('\n')}
if x_ticks:
    ax.set_xticks(x_ticks)
    ax.set_xticklabels(x_ticklabels, rotation=0)
${common.lines.join('\n')}
ax.legend(frameon=False, fontsize=8, loc="best")
ax.set_xlim(${pyNum(model.xAxis.domain[0])}, ${pyNum(model.xAxis.domain[1])})
` + PY_FOOTER;
  }

  if (type === 'bar') {
    const common = pythonCommonAxes(model);
    const labels = model.categories.map(text);
    const seriesCode = model.series.map(s => {
      const values = new Array(labels.length).fill(null);
      for (const pnt of s.points) values[pnt.row] = pnt.y;
      return `    (${pyStr(mplLabel(s.name))}, ${pyNumList(values)}),`;
    }).join('\n');
    const rotate = labels.some(l => Array.from(l).length > 4) || labels.length > 6 ? 30 : 0;
    return PY_HEADER + `
fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=160)
fig.patch.set_facecolor("#ffffff")
palette = ["#0f5b57", "#a9522c", "#b08324", "#4a6b8a", "#7a5c9e", "#5f7a52"]
labels = ${pyStrList(labels)}
series = [
${seriesCode}
]
x = list(range(len(labels)))
count = max(1, len(series))
width = 0.8 / count
for idx, (name, values) in enumerate(series):
    offset = (idx - (count - 1) / 2) * width
    xs = [i + offset for i, v in enumerate(values) if v is not None]
    ys = [v for v in values if v is not None]
    ax.bar(xs, ys, width=width, color=palette[idx % len(palette)], label=name, edgecolor="white", linewidth=0.4)
ax.set_xticks(x)
ax.set_xticklabels(labels, rotation=${rotate})
${common.lines.join('\n')}
ax.legend(frameon=False, fontsize=8, loc="best")
` + PY_FOOTER;
  }

  if (type === 'scatter') {
    const common = pythonCommonAxes(model);
    const ticks = xTicksPython(model);
    const points = model.series[0] ? model.series[0].points : [];
    const xs = points.map(pnt => pnt.x);
    const ys = points.map(pnt => pnt.y);
    const fit = model.fit;
    let fitCode = '';
    if (fit && Number.isFinite(fit.slope)) {
      const domain = model.xAxis ? model.xAxis.domain : [Math.min(...xs), Math.max(...xs)];
      const y0 = fit.intercept + fit.slope * domain[0];
      const y1 = fit.intercept + fit.slope * domain[1];
      if (Number.isFinite(y0) && Number.isFinite(y1)) {
        fitCode = `ax.plot([${pyNum(domain[0])}, ${pyNum(domain[1])}], [${pyNum(y0)}, ${pyNum(y1)}], color="#6b6259", linewidth=1.0, linestyle="--", label="线性拟合")`;
      }
    }
    return PY_HEADER + `
fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=160)
fig.patch.set_facecolor("#ffffff")
x_values = ${pyNumList(xs)}
y_values = ${pyNumList(ys)}
ax.scatter(x_values, y_values, s=24, color="#0f5b57", edgecolors="white", linewidths=0.6, alpha=0.85, label=${pyStr(mplLabel(model.yLabel))})
${fitCode}
${ticks.join('\n')}
if x_ticks:
    ax.set_xticks(x_ticks)
    ax.set_xticklabels(x_ticklabels, rotation=0)
${common.lines.join('\n')}
ax.legend(frameon=False, fontsize=8, loc="best")
` + PY_FOOTER;
  }

  const axes = model.radar.axes;
  const rows = model.radar.rows;
  const rowCode = rows.map(r => `    (${pyStr(mplLabel(r.name))}, [${r.values.map(v => pyNum(clampNum(v, 0, 1))).join(', ')}]),`).join('\n');
  return PY_HEADER + `
fig = plt.figure(figsize=(7.2, 4.2), dpi=160)
fig.patch.set_facecolor("#ffffff")
ax = fig.add_subplot(111, polar=True)
palette = ["#0f5b57", "#a9522c", "#b08324", "#4a6b8a", "#7a5c9e", "#5f7a52"]
labels = ${pyStrList(axes)}
rows = [
${rowCode}
]
angles = [i / float(len(labels)) * 2 * math.pi for i in range(len(labels))]
angles += angles[:1]
for idx, (name, values) in enumerate(rows):
    closed = values + values[:1]
    color = palette[idx % len(palette)]
    ax.plot(angles, closed, color=color, linewidth=1.6, label=name)
    ax.fill(angles, closed, color=color, alpha=0.10)
ax.set_xticks(angles[:-1])
ax.set_xticklabels(labels, fontsize=9)
ax.set_ylim(0, 1)
ax.set_yticks([0.25, 0.5, 0.75, 1.0])
ax.set_yticklabels(["25%", "50%", "75%", "100%"])
ax.set_title(${pyStr(mplLabel(model.title))}, fontsize=13, pad=16)
ax.legend(loc="upper right", bbox_to_anchor=(1.28, 1.12), frameon=False, fontsize=8)
` + PY_FOOTER;
}

function latexEscape(v) {
  const map = {
    '\\': '\\textbackslash{}',
    '&': '\\&',
    '%': '\\%',
    '$': '\\$',
    '#': '\\#',
    '_': '\\_',
    '{': '\\{',
    '}': '\\}',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
  };
  return String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, ' ')
    .replace(/[\\&%$#_{}~^]/g, ch => map[ch]);
}

/**
 * 生成 booktabs 风格的 LaTeX 三线表；长表超过 80 行时截断并注明。
 * @param {ReturnType<typeof parseCsv>} parsed
 * @param {ReturnType<typeof profileCsv>} profile
 * @returns {string}
 */
export function latexTable(parsed, profile) {
  const p = ensureProfile(profile, parsed);
  const rows = parsed && Array.isArray(parsed.rows) ? parsed.rows : [];
  const columns = p && Array.isArray(p.columns) ? p.columns : [];
  const headers = columns.map(c => c.name);
  const comment =
    `% 由论小研从 CSV 生成（分隔符：${parsed && parsed.delimiter ? parsed.delimiter : ','}；数据行：${rows.length}）\n` +
    `% 需在导言区加载 \\usepackage{booktabs}\n`;

  if (!columns.length) {
    return comment + `\\begin{table}[htbp]
  \\centering
  \\caption{数据表（无可用数据）}
  \\label{tab:lunxiaoyan-csv}
  \\begin{tabular}{l}
    \\toprule
    说明 \\\\
    \\midrule
    无可用数据 \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}
`;
  }

  const align = columns.map((c, i) => (i === 0 ? 'l' : c.type === 'number' ? 'r' : 'l')).join('') || 'l';
  const shown = rows.slice(0, MAX_LATEX_ROWS);
  const omitted = Math.max(0, rows.length - shown.length);
  const headerLine = headers.map(latexEscape).join(' & ') + ' \\\\';
  const bodyLines = shown.map(row => {
    const cells = columns.map((c, i) => latexEscape(Array.isArray(row) ? row[i] : ''));
    return '    ' + cells.join(' & ') + ' \\\\';
  });
  if (omitted > 0) {
    bodyLines.push(`    \\multicolumn{${columns.length}}{c}{$\\cdots$} \\\\`);
  }
  const caption = latexEscape(`数据表：${rows.length} 行 × ${columns.length} 列${omitted > 0 ? `（展示前 ${shown.length} 行）` : ''}`);
  return comment + `\\begin{table}[htbp]
  \\centering
  \\caption{${caption}}
  \\label{tab:lunxiaoyan-csv}
  \\begin{tabular}{${align}}
    \\toprule
    ${headerLine}
    \\midrule
${bodyLines.join('\n')}
    \\bottomrule
  \\end{tabular}
\\end{table}
`;
}

/* ---------- 论文提纲 ---------- */

function conceptsOf(value) {
  const s = text(value);
  const out = new Set();
  for (const c of CONCEPTS) if (c.re.test(s)) out.add(c.key);
  return out;
}

function paperSearchText(paper) {
  const parts = [paper && paper.title, paper && paper.abstract];
  for (const s of (paper && paper.sections) || []) {
    parts.push(s && s.title);
    for (const para of (s && s.paragraphs) || []) parts.push(para && para.text);
  }
  for (const c of (paper && paper.chunks) || []) parts.push(c && c.text);
  return parts.filter(Boolean).join(' ').slice(0, 30000);
}

function scorePaper(paper, ideaTokens, ideaConcepts) {
  const title = text(paper && paper.title);
  const body = paperSearchText(paper || {});
  const titleTokens = new Set(contentTokens(title));
  const bodyTokens = new Set(contentTokens(body));
  let score = 0;
  for (const t of ideaTokens) {
    if (titleTokens.has(t)) score += t.length >= 5 ? 2.4 : 1.8;
    else if (bodyTokens.has(t)) score += 1.0;
  }
  const paperConcepts = conceptsOf(`${title} ${body.slice(0, 12000)}`);
  for (const key of ideaConcepts) if (paperConcepts.has(key)) score += 4;
  return { score, relevant: score >= 0.75 };
}

function ideaKeywords(value) {
  const s = text(value);
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'using', 'based', 'toward', 'towards', '研究', '方法', '系统', '论文']);
  const en = (s.match(/[A-Za-z][A-Za-z0-9+-]{2,}/g) || [])
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 3 && !stop.has(w));
  const zh = (s.match(/[\u4e00-\u9fff]{2,6}/g) || []).filter(w => !stop.has(w));
  return [...new Set([...zh.slice(0, 3), ...en.slice(0, 3)])].slice(0, 4);
}

function evidenceCandidates(paper) {
  const out = [];
  const keys = new Set();
  const push = (title, page, body) => {
    const t = text(title);
    const pg = Number.isFinite(page) && page > 0 ? Math.floor(page) : null;
    const key = `${t}|${pg}|${text(body).slice(0, 40)}`;
    if (keys.has(key)) return;
    keys.add(key);
    out.push({ title: t, page: pg, text: text(body) });
  };
  for (const s of (paper && paper.sections) || []) {
    if (!s) continue;
    let page = Number.isFinite(s.page) && s.page > 0 ? s.page : null;
    let body = '';
    for (const para of s.paragraphs || []) {
      if (!para) continue;
      if (!body) body = para.text || '';
      if (Number.isFinite(para.page) && para.page > 0) { page = para.page; break; }
    }
    push(s.title, page, body);
  }
  for (const c of (paper && paper.chunks) || []) if (c) push(c.section, c.page, c.text);
  return out;
}

function pickEvidence(paper, role, ideaTokens) {
  const candidates = evidenceCandidates(paper);
  if (!candidates.length) return { page: 1, section: '', text: '' };
  const pattern = ROLE_PATTERNS[role] || ROLE_PATTERNS.related;
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    let score = 0;
    if (pattern.test(c.title)) score += 5;
    if (c.page) score += 1;
    if (c.text) score += 0.5;
    if (ideaTokens && c.text) {
      let overlap = 0;
      for (const t of contentTokens(c.text)) if (ideaTokens.has(t)) overlap++;
      score += Math.min(3, overlap * 0.12);
    }
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return { page: best.page || 1, section: best.title || '', text: best.text || '' };
}

function toPage(page) {
  const n = Number(page);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function paperLabel(paper) {
  return `《${text(paper && paper.title) || '未命名论文'}》`;
}

function citeFor(paper, evidence) {
  return citeToken(String(paper.id), toPage(evidence.page), evidence.section || '');
}

/**
 * 基于用户想法与用户提供的论文生成中文研究提纲。
 * 引用只使用传入论文的真实 id、页码与章节；相关论文少于 3 篇时写入“证据缺口”。
 * @param {string} idea 研究想法
 * @param {Array<object>} papers 论文对象（同 PDF 解析 shape）
 * @param {{maxPapers?:number}} [opts]
 * @returns {{markdown:string,usedPapers:Array<{id:string,title:string,year:number|null,why:string}>,gaps:string[]}}
 */
export function buildOutline(idea, papers, opts = {}) {
  const ideaFull = text(idea) || '本课题';
  const topic = truncateLabel(ideaFull, 30);
  const allPapers = (Array.isArray(papers) ? papers : [])
    .filter(p => p && typeof p === 'object' && p.id != null && String(p.id) && text(p.title));
  const ideaTokens = new Set(contentTokens(ideaFull).filter(t => t.length >= 2));
  const ideaConcepts = conceptsOf(ideaFull);
  const ranked = allPapers
    .map(paper => ({ paper, ...scorePaper(paper, ideaTokens, ideaConcepts) }))
    .filter(x => x.relevant)
    .sort((a, b) => b.score - a.score || (String(a.paper.id) < String(b.paper.id) ? -1 : 1));
  const maxPapers = Number.isFinite(opts && opts.maxPapers)
    ? clampNum(Math.floor(opts.maxPapers), 1, 6)
    : 6;
  const selected = ranked.slice(0, maxPapers).map(x => x.paper);
  const ctx = selected.map(paper => ({
    paper,
    related: pickEvidence(paper, 'related', ideaTokens),
    method: pickEvidence(paper, 'method', ideaTokens),
    experiment: pickEvidence(paper, 'experiment', ideaTokens),
  }));

  const usedPapers = ctx.map(c => {
    let role = '相关工作';
    let ev = c.related;
    if (ROLE_PATTERNS.method.test(c.method.section)) { role = '方法设计'; ev = c.method; }
    else if (ROLE_PATTERNS.experiment.test(c.experiment.section)) { role = '实验评测'; ev = c.experiment; }
    const where = ev.section ? `§${ev.section}，p.${toPage(ev.page)}` : `p.${toPage(ev.page)}`;
    return {
      id: String(c.paper.id),
      title: text(c.paper.title),
      year: c.paper.year != null && Number.isFinite(Number(c.paper.year)) ? Number(c.paper.year) : null,
      why: `为「${topic}」提供${role}依据（${where}）`,
    };
  });

  const gaps = [];
  if (selected.length < 3) {
    const queryParts = [];
    for (const key of ideaConcepts) if (CONCEPT_LABELS[key]) queryParts.push(CONCEPT_LABELS[key]);
    for (const k of ideaKeywords(ideaFull)) if (!queryParts.includes(k)) queryParts.push(k);
    const query = queryParts.slice(0, 5).join('、') || topic;
    const prefix = selected.length === 0
      ? (allPapers.length === 0
        ? `未提供任何可引用的论文。建议检索：${query} 的 benchmark、强基线（baseline）与综述（survey）。`
        : `提供的 ${allPapers.length} 篇论文中没有与「${topic}」直接相关的可引用文献。建议检索：${query} 的 benchmark、强基线（baseline）与综述（survey）。`)
      : `仅找到 ${selected.length} 篇与「${topic}」直接相关的提供论文（少于 3 篇）。建议补充检索：${query} 的 benchmark、强基线（baseline）与综述（survey）。`;
    gaps.push(prefix);
  }

  const abstractBullets = [
    `- 问题：围绕「${topic}」说明要解决的核心问题、现有做法的主要失效模式与本文的切入点。`,
    `- 方法：用一段话概括为「${topic}」提出的方法框架，点明输入、关键模块与输出，不引用未提供的文献。`,
    '- 贡献：列出 2–3 条可验证贡献，并交代它们分别由第 3、4 节的哪些设计或实验支撑。',
    '- 结果：在真实实验完成后再写入主要指标变化与适用范围，不在提纲阶段虚构具体数值。',
  ];

  const introBullets = [
    `- 背景：从「${topic}」的实际需求出发，说明问题为什么重要、当前使用场景中的约束是什么。`,
    '- 缺口：把现有做法的不足拆成可检验的假设，避免只写“效果不好”这类无法验证的判断。',
    `- 思路：用一句话给出「${topic}」的核心洞察，并说明它与已有工作的关键差异。`,
    '- 贡献：把贡献写成“设计 + 证据”的配对，逐条对应到后续方法或实验章节。',
    '- 结构：最后一段简述全文组织方式，引导读者进入第 2 节的相关工作。',
  ];
  if (ctx.length) {
    introBullets.push(`- 问题背景对照：将${paperLabel(ctx[0].paper)}${citeFor(ctx[0].paper, ctx[0].related)}作为背景对照文献，核对问题定义与评价口径。`);
  }

  const relatedBullets = [
    `- 脉络：按「${topic}」涉及的概念拆分研究脉络，说明每条脉络解决的是哪一类子问题。`,
    '- 对照：比较不同路线的假设、数据依赖与失败模式，而不是只罗列论文结论。',
  ];
  for (let i = 0; i < ctx.length; i += 2) {
    const group = ctx.slice(i, i + 2);
    const names = group.map(c => `${paperLabel(c.paper)}${citeFor(c.paper, c.related)}`).join('、');
    relatedBullets.push(`- 文献对照：将${names}放在同一比较维度下，提炼它们在「${topic}」上的问题设定、证据来源与评价方式。`);
  }
  relatedBullets.push('- 定位：在相关工作总结处明确本文要填补的空白，并说明为什么现有路线不能直接复用。');
  if (gaps.length) relatedBullets.push(`- **证据缺口**：${gaps[0]}`);

  const methodBullets = [
    `- 形式化：给出「${topic}」的任务定义、输入输出与约束，写清哪些部分是可学习的、哪些是规则约束。`,
    '- 框架：用一张架构图或伪代码说明数据流，确保每个模块的职责可以被单独检验。',
    '- 关键模块：逐个解释新增设计的动机、实现细节与替代方案，避免只给模块名称。',
    '- 训练与推理：交代优化目标、超参数选择依据与推理成本，说明方法在真实场景中的可行性。',
  ];
  if (ctx.length) {
    const group = ctx.slice(0, Math.min(2, ctx.length));
    const names = group.map(c => `${paperLabel(c.paper)}${citeFor(c.paper, c.method)}`).join('、');
    methodBullets.push(`- 方法借鉴：参考${names}的建模与实现细节，抽取可复用部分并明确针对「${topic}」的改造点。`);
  }

  const experimentBullets = [
    '- 数据：说明数据来源、划分方式与预处理流程，报告真实样本量；不得用未经验证的规模数字。',
    '- 基线：选择强基线并交代复现设置，避免只与弱基线比较。',
    '- 指标：给出主指标与辅助指标的定义、计算口径与统计显著性检验方式。',
    '- 主实验：按研究问题组织结果表，逐条回答第 1 节提出的假设。',
    '- 消融与稳健性：拆开新增模块做消融，并补充不同数据规模、噪声或跨域设置下的稳健性分析。',
  ];
  if (ctx.length) {
    const group = ctx.length > 1 ? ctx.slice(1, 3) : ctx.slice(0, 1);
    const names = group.map(c => `${paperLabel(c.paper)}${citeFor(c.paper, c.experiment)}`).join('、');
    experimentBullets.push(`- 评测对照：把${names}列为实验对照文献，先核对其评测口径，再确定本课题的基线与复现范围。`);
  }

  const conclusionBullets = [
    `- 总结：回收「${topic}」的问题、方法与证据，用一段话回答“做了什么、为什么有效”。`,
    '- 贡献回收：逐条对应摘要中的贡献，说明每条贡献由哪组实验或分析支撑。',
    '- 局限：诚实列出数据、评价与部署层面的限制，不把未验证的推断写成结论。',
    '- 展望：给出 2–3 个可执行的后续方向，并说明它们分别需要什么新证据。',
  ];

  const markdown = [
    `# 研究提纲：${topic}`,
    '',
    `> 研究想法：${ideaFull}`,
    `> 证据基础：提供 ${allPapers.length} 篇论文，筛选出与想法直接相关的 ${selected.length} 篇；引用均指向真实论文 id、页码与章节。`,
    '',
    '## Abstract（摘要）',
    ...abstractBullets,
    '',
    '## 1 Introduction（引言）',
    ...introBullets,
    '',
    '## 2 Related Work（相关工作）',
    ...relatedBullets,
    '',
    '## 3 Method（方法）',
    ...methodBullets,
    '',
    '## 4 Experiments（实验）',
    ...experimentBullets,
    '',
    '## 5 Conclusion（结论）',
    ...conclusionBullets,
    '',
  ].join('\n');

  return { markdown, usedPapers, gaps };
}

/* ---------- 研究架构图 ---------- */

function groupMeta(group) {
  const key = text(group) || 'pipeline';
  if (GROUP_META[key]) return GROUP_META[key];
  return { label: key, color: '#7a5c9e', fill: '#f2eef6' };
}

/**
 * 从研究想法生成稳定的研究架构（输入 → 解析 → 检索 → 推理 → 校验 → 输出，外加记忆、工具、护栏）。
 * 当想法涉及 RAG、知识图谱、写作或多模态时，节点标签会自动适配。
 * @param {string} idea
 * @param {{labels?:Record<string,string>}} [opts]
 * @returns {{nodes:Array<{id:string,label:string,group:string}>,edges:Array<{from:string,to:string,label:string}>}}
 */
export function diagramFromIdea(idea, opts = {}) {
  const s = text(idea).toLowerCase();
  const rag = /(rag|retrieval[\s-]*augmented|检索增强|检索|向量库|知识库)/i.test(s);
  const graph = /(knowledge\s*graph|\bgraph\b|知识图谱|图谱|图结构|图神经网络|\bgnn\b)/i.test(s);
  const writing = /(academic\s*writing|paper\s*writing|\bwriting\b|论文|写作|提纲|综述|润色|投稿)/i.test(s);
  const multimodal = /(multimodal|multi-modal|vision[\s-]*language|image[\s-]*text|多模态|图文|跨模态|视觉|图像|视频)/i.test(s);

  const labels = {
    input: '研究问题输入',
    parse: '文档解析',
    retrieve: '知识检索',
    reason: '推理与规划',
    verify: '结果校验',
    output: '输出与归档',
    memory: '长期记忆',
    tools: '外部工具',
    guard: '安全护栏',
  };
  let parseEdge = '结构化';
  let retrieveEdge = '证据召回';
  let reasonEdge = '候选结果';
  let verifyEdge = '校验';
  let outputEdge = '结果';

  if (rag) {
    labels.retrieve = 'RAG 检索增强';
    labels.reason = '检索增强推理';
    labels.memory = '向量知识库';
    labels.verify = '引用一致性校验';
    parseEdge = '分块与向量化';
    retrieveEdge = '检索证据';
  }
  if (graph) {
    labels.parse = '实体关系与图谱解析';
    labels.retrieve = rag ? '图谱增强检索' : '图谱检索';
    labels.reason = '图结构推理';
    labels.memory = '图数据库';
    labels.verify = '事实一致性校验';
    labels.tools = '图算法工具';
    parseEdge = '抽取实体关系';
    retrieveEdge = '子图检索';
    reasonEdge = '图推理结果';
  }
  if (writing) {
    labels.input = '写作任务与素材';
    labels.parse = '文献与素材解析';
    labels.retrieve = rag ? '证据检索（RAG）' : '证据检索';
    labels.reason = '论证与结构生成';
    labels.verify = '引用与事实校验';
    labels.output = '论文草稿与修订';
    labels.tools = '检索与写作工具';
    labels.guard = '学术规范护栏';
    verifyEdge = '引用核验';
    outputEdge = '草稿';
  }
  if (multimodal) {
    labels.input = '多模态输入';
    labels.parse = graph ? '图文与实体解析' : '图文版面解析';
    labels.retrieve = graph ? '跨模态图检索' : '跨模态检索';
    labels.reason = '多模态融合推理';
    labels.output = '图文报告';
    labels.tools = 'OCR 与视觉工具';
    parseEdge = '图文对齐';
  }

  const nodes = [
    { id: 'n_input', label: labels.input, group: 'pipeline' },
    { id: 'n_parse', label: labels.parse, group: 'pipeline' },
    { id: 'n_retrieve', label: labels.retrieve, group: 'pipeline' },
    { id: 'n_reason', label: labels.reason, group: 'pipeline' },
    { id: 'n_verify', label: labels.verify, group: 'pipeline' },
    { id: 'n_output', label: labels.output, group: 'pipeline' },
    { id: 'n_memory', label: labels.memory, group: 'support' },
    { id: 'n_tools', label: labels.tools, group: 'support' },
    { id: 'n_guard', label: labels.guard, group: 'safety' },
  ];

  if (opts && opts.labels && typeof opts.labels === 'object') {
    for (const node of nodes) {
      if (typeof opts.labels[node.id] === 'string' && text(opts.labels[node.id])) node.label = text(opts.labels[node.id]);
    }
  }

  const edges = [
    { from: 'n_input', to: 'n_parse', label: '提交' },
    { from: 'n_parse', to: 'n_retrieve', label: parseEdge },
    { from: 'n_retrieve', to: 'n_reason', label: retrieveEdge },
    { from: 'n_reason', to: 'n_verify', label: reasonEdge },
    { from: 'n_verify', to: 'n_output', label: outputEdge },
    { from: 'n_memory', to: 'n_retrieve', label: '召回' },
    { from: 'n_tools', to: 'n_reason', label: '工具调用' },
    { from: 'n_guard', to: 'n_verify', label: verifyEdge },
    { from: 'n_guard', to: 'n_output', label: '输出审查' },
  ];
  return { nodes, edges };
}

function normalizeDiagramSpec(spec) {
  const src = spec && typeof spec === 'object' ? spec : {};
  const nodes = [];
  const ids = new Set();
  for (const n of Array.isArray(src.nodes) ? src.nodes : []) {
    if (!n) continue;
    const id = text(n.id);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    nodes.push({ id, label: text(n.label) || id, group: text(n.group) || 'pipeline' });
  }
  const edges = [];
  for (const e of Array.isArray(src.edges) ? src.edges : []) {
    if (!e) continue;
    const from = text(e.from);
    const to = text(e.to);
    if (!ids.has(from) || !ids.has(to) || from === to) continue;
    edges.push({ from, to, label: text(e.label) });
  }
  return { nodes, edges };
}

function stableHash(value) {
  let h = 2166136261 >>> 0;
  const s = String(value || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

function wrapLabel(label, maxUnits) {
  const chars = Array.from(text(label));
  if (!chars.length) return [''];
  const widthOf = ch => (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : /[A-Z]/.test(ch) ? 0.66 : 0.56);
  const total = chars.reduce((sum, ch) => sum + widthOf(ch), 0);
  if (total <= maxUnits) return [chars.join('')];
  const lines = [];
  let cur = '';
  let curW = 0;
  for (const ch of chars) {
    const w = widthOf(ch);
    if (curW + w > maxUnits && cur) {
      lines.push(cur);
      cur = '';
      curW = 0;
    }
    cur += ch;
    curW += w;
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) {
    const second = lines.slice(1).join('');
    const maxSecond = Math.max(2, Math.floor(maxUnits));
    lines.length = 2;
    lines[1] = truncateLabel(second, maxSecond);
  }
  return lines;
}

function layoutDiagram(spec) {
  const normalized = normalizeDiagramSpec(spec);
  const nodes = normalized.nodes;
  if (!nodes.length) return null;
  let pipeline = nodes.filter(n => n.group === 'pipeline');
  if (!pipeline.length) pipeline = nodes.slice(0, Math.min(6, nodes.length));
  const pipelineIds = new Set(pipeline.map(n => n.id));
  const side = nodes.filter(n => !pipelineIds.has(n.id));

  const n = pipeline.length;
  const gap = n > 7 ? 14 : 24;
  const boxW = Math.max(70, Math.min(132, (DIAGRAM_W - 96 - gap * (n - 1)) / n));
  const totalW = n * boxW + gap * (n - 1);
  const startX = (DIAGRAM_W - totalW) / 2;
  const boxH = 62;
  const pipelineY = 172;
  const laidPipeline = pipeline.map((node, i) => ({
    ...node,
    layer: 'pipeline',
    index: i,
    cx: startX + i * (boxW + gap) + boxW / 2,
    cy: pipelineY,
    w: boxW,
    h: boxH,
    meta: groupMeta(node.group),
  }));

  const m = side.length;
  const sideH = 52;
  const sideY = 306;
  let sideW = 160;
  let sideGap = 110;
  if (m > 3) { sideW = 150; sideGap = 30; }
  else if (m === 2) sideGap = 160;
  else if (m === 1) sideGap = 0;
  const sideTotal = m * sideW + Math.max(0, m - 1) * sideGap;
  const sideStart = (DIAGRAM_W - sideTotal) / 2;
  const laidSide = side.map((node, i) => ({
    ...node,
    layer: 'side',
    index: i,
    cx: sideStart + i * (sideW + sideGap) + sideW / 2,
    cy: sideY,
    w: sideW,
    h: sideH,
    meta: groupMeta(node.group),
  }));

  const byId = new Map([...laidPipeline, ...laidSide].map(n => [n.id, n]));
  const edges = [];
  for (const e of normalized.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    let sx, sy, tx, ty, lx, ly, vertical = false;
    if (a.layer === 'pipeline' && b.layer === 'pipeline') {
      const forward = b.cx >= a.cx;
      sx = forward ? a.cx + a.w / 2 : a.cx - a.w / 2;
      tx = forward ? b.cx - b.w / 2 : b.cx + b.w / 2;
      sy = ty = a.cy;
      lx = (a.cx + b.cx) / 2;
      ly = a.cy - a.h / 2 - 10;
    } else if (a.layer === 'pipeline' && b.layer === 'side') {
      sx = a.cx; sy = a.cy + a.h / 2;
      tx = b.cx; ty = b.cy - b.h / 2;
      lx = (sx + tx) / 2; ly = (sy + ty) / 2;
      vertical = true;
    } else if (a.layer === 'side' && b.layer === 'pipeline') {
      sx = a.cx; sy = a.cy - a.h / 2;
      tx = b.cx; ty = b.cy + b.h / 2;
      lx = (sx + tx) / 2; ly = (sy + ty) / 2;
      vertical = true;
    } else {
      const forward = b.cx >= a.cx;
      sx = forward ? a.cx + a.w / 2 : a.cx - a.w / 2;
      tx = forward ? b.cx - b.w / 2 : b.cx + b.w / 2;
      sy = ty = a.cy;
      lx = (a.cx + b.cx) / 2;
      ly = a.cy - a.h / 2 - 9;
    }
    const edgeGroup = a.group !== 'pipeline' ? a.group : b.group !== 'pipeline' ? b.group : 'pipeline';
    edges.push({
      ...e,
      sx, sy, tx, ty, lx, ly, vertical,
      dashed: a.group !== 'pipeline' || b.group !== 'pipeline',
      color: edgeGroup === 'pipeline' ? '#6b6259' : groupMeta(edgeGroup).color,
      markerKey: edgeGroup === 'pipeline' ? 'neutral' : stableHash(groupMeta(edgeGroup).color),
    });
  }

  const groupList = [];
  for (const node of nodes) if (!groupList.includes(node.group)) groupList.push(node.group);
  return {
    nodes: [...laidPipeline, ...laidSide],
    pipeline: laidPipeline,
    side: laidSide,
    edges,
    groups: groupList,
    hash: stableHash(JSON.stringify({ nodes, edges: normalized.edges })),
  };
}

/**
 * 渲染分层研究架构 SVG（圆角框、箭头与标签、按组图例）。
 * @param {{nodes?:Array<object>,edges?:Array<object>,title?:string}} spec
 * @returns {string}
 */
export function renderDiagramSvg(spec) {
  const layout = layoutDiagram(spec);
  const title = text(spec && spec.title) || '研究架构示意';
  if (!layout) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DIAGRAM_W} ${DIAGRAM_H}" width="100%" role="img" aria-label="研究架构示意" style="width:100%;height:auto;display:block;max-width:100%">` +
      `<rect x="0" y="0" width="${DIAGRAM_W}" height="${DIAGRAM_H}" fill="#fdfcf8"/>` +
      `<text x="40" y="42" font-family="${SERIF}" font-size="18" font-weight="600" fill="#26221d">${xml(title)}</text>` +
      `<text x="${DIAGRAM_W / 2}" y="${DIAGRAM_H / 2}" text-anchor="middle" font-family="${SANS}" font-size="13" fill="#8a8177">暂无可展示的架构节点</text>` +
      `</svg>`;
  }

  const colors = new Set(layout.edges.map(e => e.color));
  let defs = '<defs>';
  for (const color of colors) {
    const key = color === '#6b6259' ? 'neutral' : stableHash(color);
    defs += `<marker id="lxyArrow-${layout.hash}-${key}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`;
  }
  defs += '</defs>';

  const subtitle = layout.pipeline.map(n => n.label).join(' → ');
  let edges = '';
  for (const e of layout.edges) {
    let d;
    if (e.vertical) {
      const midY = (e.sy + e.ty) / 2;
      d = `M ${svgNum(e.sx)} ${svgNum(e.sy)} C ${svgNum(e.sx)} ${svgNum(midY)}, ${svgNum(e.tx)} ${svgNum(midY)}, ${svgNum(e.tx)} ${svgNum(e.ty)}`;
    } else if (Math.abs(e.sy - e.ty) < 0.1) {
      d = `M ${svgNum(e.sx)} ${svgNum(e.sy)} L ${svgNum(e.tx)} ${svgNum(e.ty)}`;
    } else {
      const midX = (e.sx + e.tx) / 2;
      d = `M ${svgNum(e.sx)} ${svgNum(e.sy)} C ${svgNum(midX)} ${svgNum(e.sy)}, ${svgNum(midX)} ${svgNum(e.ty)}, ${svgNum(e.tx)} ${svgNum(e.ty)}`;
    }
    const marker = `<marker id="lxyArrow-${layout.hash}-${e.markerKey}"`;
    const markerId = `lxyArrow-${layout.hash}-${e.markerKey}`;
    edges += `<path d="${d}" fill="none" stroke="${e.color}" stroke-width="1.15"${e.dashed ? ' stroke-dasharray="4 4"' : ''} marker-end="url(#${markerId})"/>`;
    void marker;
  }

  let boxes = '';
  for (const node of layout.nodes) {
    const sideNode = node.layer === 'side';
    const fs = sideNode ? 11 : node.w < 90 ? 10.5 : 12.5;
    const maxUnits = Math.max(4, Math.floor((node.w - 18) / (fs * 0.95)));
    const lines = wrapLabel(node.label, maxUnits);
    const firstY = node.cy - (lines.length - 1) * fs * 0.62;
    const textLines = lines.map((line, i) =>
      `<tspan x="${svgNum(node.cx)}" y="${svgNum(firstY + i * fs * 1.24)}">${xml(line)}</tspan>`).join('');
    boxes += `<g data-node-id="${xml(node.id)}">` +
      `<rect x="${svgNum(node.cx - node.w / 2)}" y="${svgNum(node.cy - node.h / 2)}" width="${svgNum(node.w)}" height="${svgNum(node.h)}" rx="10" fill="${node.meta.fill}" stroke="${node.meta.color}" stroke-width="1.1"/>` +
      `<text text-anchor="middle" font-family="${SANS}" font-size="${fs}" fill="#26221d">${textLines}</text>` +
      `</g>`;
  }

  let edgeLabels = '';
  for (const e of layout.edges) {
    if (!e.label) continue;
    const w = Math.max(24, Array.from(e.label).length * 9.5 + 8);
    edgeLabels += `<g><rect x="${svgNum(e.lx - w / 2)}" y="${svgNum(e.ly - 8)}" width="${svgNum(w)}" height="15" rx="4" fill="#fdfcf8" opacity="0.94"/>` +
      `<text x="${svgNum(e.lx)}" y="${svgNum(e.ly + 2.5)}" text-anchor="middle" font-family="${SANS}" font-size="9.5" fill="#6b6259">${xml(e.label)}</text></g>`;
  }

  let legend = '<g aria-label="分组图例">';
  let lx = 48;
  const ly = 389;
  for (const group of layout.groups) {
    const meta = groupMeta(group);
    const label = truncateLabel(meta.label, 10);
    legend += `<rect x="${svgNum(lx)}" y="${ly - 9}" width="14" height="10" rx="2" fill="${meta.fill}" stroke="${meta.color}" stroke-width="0.9"/>` +
      `<text x="${svgNum(lx + 20)}" y="${ly}" font-family="${SANS}" font-size="9.5" fill="#6b6259">${xml(label)}</text>`;
    lx += 26 + Array.from(label).length * 10.5;
  }
  legend += '</g>';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DIAGRAM_W} ${DIAGRAM_H}" width="100%" role="img" aria-label="${xml(title)}" style="width:100%;height:auto;display:block;max-width:100%">` +
    defs +
    `<rect x="0" y="0" width="${DIAGRAM_W}" height="${DIAGRAM_H}" fill="#fdfcf8"/>` +
    `<text x="48" y="40" font-family="${SERIF}" font-size="18" font-weight="600" fill="#26221d">${xml(title)}</text>` +
    `<text x="48" y="61" font-family="${SANS}" font-size="10.5" fill="#8a8177">${xml(truncateLabel(subtitle, 48))}</text>` +
    edges + boxes + edgeLabels + legend +
    `</svg>`;
}

function mermaidId(value, used) {
  let base = String(value == null ? '' : value).replace(/[^A-Za-z0-9_]/g, '_');
  if (!base) base = 'n';
  if (!/^[A-Za-z_]/.test(base)) base = 'n_' + base;
  let out = base;
  let k = 2;
  while (used.has(out)) { out = base + '_' + k; k++; }
  used.add(out);
  return out;
}

function mermaidEscape(value) {
  return text(value).replace(/[#<>"&]/g, ch => ({
    '#': '#35;', '<': '#lt;', '>': '#gt;', '"': '#quot;', '&': '#38;',
  })[ch]);
}

/**
 * Mermaid flowchart 代码。
 * @param {ReturnType<typeof diagramFromIdea>} spec
 * @returns {string}
 */
export function toMermaid(spec) {
  const { nodes, edges } = normalizeDiagramSpec(spec);
  const header = '%% 研究架构图 · 由论小研生成\n%% 将以下内容粘贴到 Mermaid 编辑器即可渲染\n';
  if (!nodes.length) return header + 'flowchart LR\n  empty["暂无架构节点"]\n';
  const used = new Set();
  const idMap = new Map();
  for (const n of nodes) idMap.set(n.id, mermaidId(n.id, used));
  const usedClasses = new Set();
  const classMap = new Map();
  for (const n of nodes) {
    if (classMap.has(n.group)) continue;
    let base = 'g_' + String(n.group || 'pipeline').replace(/[^A-Za-z0-9_]/g, '_');
    if (!/^[A-Za-z_]/.test(base)) base = 'g_group';
    let cls = base;
    let k = 2;
    while (usedClasses.has(cls)) { cls = base + '_' + k; k++; }
    usedClasses.add(cls);
    classMap.set(n.group, cls);
  }
  const lines = [header + 'flowchart LR'];
  for (const n of nodes) lines.push(`  ${idMap.get(n.id)}["${mermaidEscape(n.label)}"]`);
  for (const e of edges) {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    if (!from || !to) continue;
    lines.push(e.label ? `  ${from} -->|"${mermaidEscape(e.label)}"| ${to}` : `  ${from} --> ${to}`);
  }
  for (const [group, cls] of classMap) {
    const meta = groupMeta(group);
    lines.push(`  classDef ${cls} fill:${meta.fill},stroke:${meta.color},stroke-width:1px,color:#26221d;`);
  }
  for (const [group, cls] of classMap) {
    const ids = nodes.filter(n => n.group === group).map(n => idMap.get(n.id));
    lines.push(`  class ${ids.join(',')} ${cls};`);
  }
  return lines.join('\n') + '\n';
}

function gvEscape(value) {
  return text(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Graphviz DOT 代码。
 * @param {ReturnType<typeof diagramFromIdea>} spec
 * @returns {string}
 */
export function toGraphviz(spec) {
  const { nodes, edges } = normalizeDiagramSpec(spec);
  const lines = ['// 研究架构图 · 由论小研生成（Graphviz DOT）'];
  if (!nodes.length) {
    lines.push('digraph research_arch {', '  empty [label="暂无架构节点"];', '}');
    return lines.join('\n') + '\n';
  }
  lines.push('digraph research_arch {');
  lines.push('  graph [rankdir=LR, splines=spline, nodesep=0.35, ranksep=0.75, pad=0.2, bgcolor="#fdfcf8", fontname="Microsoft YaHei"];');
  lines.push('  node [shape=box, style="rounded,filled", fontname="Microsoft YaHei", fontsize=11, margin="0.12,0.07", color="#0f5b57", fillcolor="#edf4f2"];');
  lines.push('  edge [fontname="Microsoft YaHei", fontsize=9, color="#6b6259", arrowsize=0.7];');
  for (const n of nodes) {
    const meta = groupMeta(n.group);
    lines.push(`  "${gvEscape(n.id)}" [label="${gvEscape(n.label)}", fillcolor="${meta.fill}", color="${meta.color}"];`);
  }
  for (const e of edges) {
    const meta = groupMeta(e.from === e.to ? 'pipeline' : 'pipeline');
    void meta;
    const a = nodes.find(n => n.id === e.from);
    const b = nodes.find(n => n.id === e.to);
    const sideEdge = (a && a.group !== 'pipeline') || (b && b.group !== 'pipeline');
    const color = a && a.group !== 'pipeline' ? groupMeta(a.group).color : b && b.group !== 'pipeline' ? groupMeta(b.group).color : '#6b6259';
    const attrs = [`label="${gvEscape(e.label)}"`, `color="${color}"`];
    if (sideEdge) attrs.push('style=dashed');
    lines.push(`  "${gvEscape(e.from)}" -> "${gvEscape(e.to)}" [${attrs.join(', ')}];`);
  }
  lines.push('  // 分组：' + nodes.map(n => `${n.id}=${n.group}`).join('；'));
  lines.push('}');
  return lines.join('\n') + '\n';
}

function tikzId(value, used) {
  let base = 'n_' + String(value == null ? '' : value).replace(/[^A-Za-z0-9_]/g, '_');
  if (base === 'n_') base = 'n_node';
  let out = base;
  let k = 2;
  while (used.has(out)) { out = base + '_' + k; k++; }
  used.add(out);
  return out;
}

/**
 * TikZ 代码（中文标签用 \textbf 包裹并逐个转义特殊字符）。
 * @param {ReturnType<typeof diagramFromIdea>} spec
 * @returns {string}
 */
export function toTikz(spec) {
  const layout = layoutDiagram(spec);
  const header = '% 研究架构图 · 由论小研生成（TikZ）\n% 需使用 XeLaTeX + ctex 编译，并在导言区加载 tikz\n';
  if (!layout) {
    return header + '\\begin{tikzpicture}[box/.style={rounded corners=3pt, draw, align=center}]\n' +
      '  \\node[box] {暂无可展示的架构节点};\n' +
      '\\end{tikzpicture}\n';
  }
  const used = new Set();
  const idMap = new Map();
  for (const n of layout.nodes) idMap.set(n.id, tikzId(n.id, used));
  const lines = [header];
  lines.push('\\definecolor{lxyPipeFill}{HTML}{EDF4F2}');
  lines.push('\\definecolor{lxyPipeLine}{HTML}{0F5B57}');
  lines.push('\\definecolor{lxySupportFill}{HTML}{EDF1F6}');
  lines.push('\\definecolor{lxySupportLine}{HTML}{4A6B8A}');
  lines.push('\\definecolor{lxySafetyFill}{HTML}{F8EFEA}');
  lines.push('\\definecolor{lxySafetyLine}{HTML}{A9522C}');
  lines.push('\\definecolor{lxyOtherFill}{HTML}{F2EEF6}');
  lines.push('\\definecolor{lxyOtherLine}{HTML}{7A5C9E}');
  lines.push('\\definecolor{lxyNeutral}{HTML}{6B6259}');
  lines.push('\\begin{tikzpicture}[');
  lines.push('  box/.style={rounded corners=3pt, draw, line width=0.6pt, align=center, inner sep=3pt, font=\\small},');
  lines.push('  pipe/.style={box, fill=lxyPipeFill, draw=lxyPipeLine},');
  lines.push('  support/.style={box, fill=lxySupportFill, draw=lxySupportLine},');
  lines.push('  safety/.style={box, fill=lxySafetyFill, draw=lxySafetyLine},');
  lines.push('  other/.style={box, fill=lxyOtherFill, draw=lxyOtherLine},');
  lines.push('  arr/.style={->, >=stealth, draw=lxyNeutral, line width=0.7pt},');
  lines.push('  arrSide/.style={arr, dashed}');
  lines.push(']');
  lines.push(`  \\node[font=\\large\\bfseries, anchor=west] at (-6.2, 2.65) {${latexEscape(text(spec && spec.title) || '研究架构示意')}};`);
  for (const n of layout.nodes) {
    const style = n.group === 'support' ? 'support' : n.group === 'safety' ? 'safety' : n.group === 'pipeline' ? 'pipe' : 'other';
    const x = (n.cx - DIAGRAM_W / 2) / 60;
    const y = (DIAGRAM_H / 2 - n.cy) / 60;
    const width = Math.max(1.0, (n.w / 60) * 0.9).toFixed(2);
    lines.push(`  \\node[${style}, text width=${width}cm] (${idMap.get(n.id)}) at (${x.toFixed(2)}, ${y.toFixed(2)}) {\\textbf{${latexEscape(n.label)}}};`);
  }
  for (const e of layout.edges) {
    const style = e.dashed ? 'arrSide' : 'arr';
    const labelNode = e.label
      ? ` node[midway, fill=white, inner sep=1pt, font=\\scriptsize, text=black!55] {${latexEscape(e.label)}}`
      : '';
    lines.push(`  \\draw[${style}] (${idMap.get(e.from)}) --${labelNode} (${idMap.get(e.to)});`);
  }
  lines.push('\\end{tikzpicture}');
  return lines.join('\n') + '\n';
}

/**
 * 用 matplotlib 复刻研究架构图，输出 architecture.pdf / architecture.png。
 * @param {ReturnType<typeof diagramFromIdea>} spec
 * @returns {string}
 */
export function toMatplotlib(spec) {
  const layout = layoutDiagram(spec);
  const title = text(spec && spec.title) || '研究架构示意';
  const header = `# -*- coding: utf-8 -*-
# 研究架构图 · 由论小研生成（matplotlib）
# 依赖：matplotlib；输出 architecture.pdf / architecture.png
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Patch


def _setup_cjk_font():
    """中文字体回退：按顺序选择系统已安装的 CJK 字体。"""
    candidates = ["Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "SimHei", "PingFang SC", "WenQuanYi Micro Hei"]
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for name in candidates:
        if name in installed:
            plt.rcParams["font.sans-serif"] = [name, "DejaVu Sans"]
            break
    else:
        plt.rcParams["font.sans-serif"] = ["DejaVu Sans"]
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["axes.unicode_minus"] = False


_setup_cjk_font()
`;
  const footer = `
fig.tight_layout()
fig.savefig("architecture.pdf", bbox_inches="tight")
fig.savefig("architecture.png", dpi=300, bbox_inches="tight")
plt.close(fig)
`;
  if (!layout) {
    return header + `
fig, ax = plt.subplots(figsize=(9.0, 4.2), dpi=160)
fig.patch.set_facecolor("#fdfcf8")
ax.set_xlim(0, 900)
ax.set_ylim(0, 420)
ax.axis("off")
ax.text(40, 392, ${pyStr(mplLabel(title))}, fontsize=16, color="#26221d", ha="left", va="top")
ax.text(450, 210, "暂无可展示的架构节点", fontsize=11, color="#8a8177", ha="center", va="center")
` + footer;
  }

  const nodeCode = layout.nodes.map(n => {
    const fs = n.layer === 'side' ? 10 : n.w < 90 ? 9.5 : 10.5;
    const maxUnits = Math.max(4, Math.floor((n.w - 18) / (fs * 0.95)));
    const labelLines = wrapLabel(n.label, maxUnits).map(l => mplLabel(l));
    return `    {"cx": ${pyNum(n.cx)}, "cy": ${pyNum(n.cy)}, "w": ${pyNum(n.w)}, "h": ${pyNum(n.h)}, "label": ${pyStr(labelLines.join('\n'))}, "color": ${pyStr(n.meta.color)}, "fill": ${pyStr(n.meta.fill)}},`;
  }).join('\n');
  const edgeCode = layout.edges.map(e => `    {"sx": ${pyNum(e.sx)}, "sy": ${pyNum(e.sy)}, "tx": ${pyNum(e.tx)}, "ty": ${pyNum(e.ty)}, "lx": ${pyNum(e.lx)}, "ly": ${pyNum(e.ly)}, "label": ${pyStr(mplLabel(e.label))}, "color": ${pyStr(e.color)}, "dashed": ${e.dashed ? 'True' : 'False'}},`).join('\n');
  const groups = layout.groups.map(group => {
    const meta = groupMeta(group);
    return `    Patch(facecolor=${pyStr(meta.fill)}, edgecolor=${pyStr(meta.color)}, label=${pyStr(meta.label)}),`;
  }).join('\n');
  const subtitle = layout.pipeline.map(n => n.label).join(' → ');

  return header + `
W, H = 900, 420
fig, ax = plt.subplots(figsize=(9.0, 4.2), dpi=160)
fig.patch.set_facecolor("#fdfcf8")
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.axis("off")
nodes = [
${nodeCode}
]
edges = [
${edgeCode}
]
for node in nodes:
    x = node["cx"] - node["w"] / 2
    y = H - node["cy"] - node["h"] / 2
    ax.add_patch(FancyBboxPatch(
        (x, y), node["w"], node["h"],
        boxstyle="round,pad=0,rounding_size=9",
        linewidth=0.9, edgecolor=node["color"], facecolor=node["fill"],
    ))
    ax.text(node["cx"], H - node["cy"], node["label"], ha="center", va="center", fontsize=10.5, color="#26221d", linespacing=1.25)
for edge in edges:
    ax.add_patch(FancyArrowPatch(
        (edge["sx"], H - edge["sy"]), (edge["tx"], H - edge["ty"]),
        arrowstyle="-|>", mutation_scale=9, linewidth=1.0,
        color=edge["color"], linestyle="--" if edge["dashed"] else "-",
        shrinkA=0, shrinkB=0,
    ))
    if edge["label"]:
        ax.text(edge["lx"], H - edge["ly"], edge["label"], ha="center", va="center", fontsize=8, color="#6b6259",
                bbox=dict(boxstyle="round,pad=0.15", fc="#fdfcf8", ec="none", alpha=0.92))
handles = [
${groups}
]
if handles:
    ax.legend(handles=handles, loc="lower left", bbox_to_anchor=(0.03, 0.02), ncol=3, frameon=False, fontsize=8.5, handlelength=1.2)
ax.text(40, 392, ${pyStr(mplLabel(title))}, fontsize=16, color="#26221d", ha="left", va="top")
ax.text(40, 370, ${pyStr(mplLabel(subtitle))}, fontsize=9, color="#6b6259", ha="left", va="top")
` + footer;
}
