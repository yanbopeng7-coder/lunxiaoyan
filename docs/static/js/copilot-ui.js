/**
 * 模块六辅助 UI：CSV 图表、架构图脚本、无幻觉论文框架（仅引用用户提供文献）
 */
import {
  parseCsv,
  profileCsv,
  chooseChart,
  renderChart,
  captionFor,
  matplotlibScript,
  latexTable,
  buildOutline,
  diagramFromIdea,
  renderDiagramSvg,
  toMermaid,
  toGraphviz,
  toTikz,
  toMatplotlib,
} from "./lab/writing.js";

function $(id) {
  return document.getElementById(id);
}
function toast(msg) {
  if (typeof window.toast === "function") return window.toast(msg);
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(function () {
    el.style.display = "none";
  }, 2200);
}

function setHtml(id, html) {
  const box = $(id);
  if (box) box.innerHTML = html;
}

function preBlock(title, code) {
  return (
    "<h4>" +
    title +
    "</h4><div class='pre' style='max-height:280px;overflow:auto'>" +
    String(code || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;") +
    "</div>"
  );
}

function parsePaperLines(raw) {
  const lines = String(raw || "")
    .split(/\n+/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  const papers = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const yearM = line.match(/\b(19|20)\d{2}\b/);
    let title = line
      .replace(/^\[\d+\]\s*/, "")
      .replace(/^[A-Z][a-z]+(?:\s+[A-Z]\.)?(?:,|\s+et\s+al).{0,80}?\.\s*/, "")
      .trim();
    if (title.length < 8) title = line.slice(0, 120);
    papers.push({
      id: "u" + (i + 1),
      title: title.slice(0, 180),
      year: yearM ? Number(yearM[0]) : null,
      abstract: line,
      sections: [{ title: "Abstract", page: 1, paragraphs: [{ text: line, page: 1 }] }],
      chunks: [{ section: "Abstract", page: 1, text: line }],
    });
  }
  return papers;
}

window.runCsvViz = function () {
  const raw = ($("csvRaw") && $("csvRaw").value) || "";
  if (!raw.trim()) {
    toast("请先粘贴或载入 CSV");
    return;
  }
  const parsed = parseCsv(raw);
  const profile = profileCsv(parsed);
  const typeSel = ($("csvChartType") && $("csvChartType").value) || "auto";
  const type = typeSel === "auto" ? chooseChart(profile) : typeSel;
  const chart = renderChart(parsed, profile, { type: type });
  const cap = captionFor(parsed, profile, chart);
  const mpl = matplotlibScript(parsed, profile, chart);
  const tex = latexTable(parsed, profile);
  let html = "";
  html += "<p><b>图表类型</b>：" + (chart.chartType || type) + " · " + (parsed.rows || []).length + " 行</p>";
  if (chart.svg) html += "<div class='viz-svg'>" + chart.svg + "</div>";
  if (chart.invalidReason) html += "<p style='color:var(--muted)'>" + chart.invalidReason + "</p>";
  html += "<h4>学术 Figure Caption</h4><p>" + String(cap || "") + "</p>";
  html += preBlock("Matplotlib 脚本", mpl);
  html += preBlock("booktabs 表格 (LaTeX)", tex);
  setHtml("csvOut", html);
  toast("图表已生成");
};

window.loadCsvDemo = async function () {
  try {
    const r = await fetch("static/demo/metrics-demo.csv", { cache: "no-store" });
    const t = await r.text();
    if ($("csvRaw")) $("csvRaw").value = t;
    toast("已载入演示 CSV");
  } catch (e) {
    if ($("csvRaw")) {
      $("csvRaw").value =
        "epoch,mAP50,precision,recall,FPS\n1,0.62,0.71,0.58,48\n2,0.71,0.76,0.65,47\n3,0.78,0.81,0.72,46\n4,0.83,0.84,0.78,45\n5,0.864,0.87,0.82,44\n";
    }
    toast("已载入内置演示 CSV");
  }
};

window.runDiagram = function () {
  const idea = (($("diagIdea") && $("diagIdea").value) || "").trim();
  if (!idea) {
    toast("请先填写研究想法 / 系统描述");
    return;
  }
  const spec = diagramFromIdea(idea, {});
  const svg = renderDiagramSvg(spec);
  let html = "<div class='viz-svg'>" + svg + "</div>";
  html += preBlock("Mermaid", toMermaid(spec));
  html += preBlock("Graphviz DOT", toGraphviz(spec));
  html += preBlock("TikZ", toTikz(spec));
  html += preBlock("Matplotlib 拓扑脚本", toMatplotlib(spec));
  setHtml("diagOut", html);
  toast("架构图已生成");
};

window.runFramework = function () {
  const idea = (($("fwIdea") && $("fwIdea").value) || "").trim();
  const raw = (($("fwPapers") && $("fwPapers").value) || "").trim();
  if (!idea) {
    toast("请先填写研究 idea");
    return;
  }
  const papers = parsePaperLines(raw);
  const out = buildOutline(idea, papers, { maxPapers: 6 });
  let html = "";
  if (out.gaps && out.gaps.length) {
    html += "<h4>证据缺口（未编造文献）</h4><ul>" + out.gaps.map(function (g) {
      return "<li>" + g.replace(/</g, "&lt;") + "</li>";
    }).join("") + "</ul>";
  }
  if (out.usedPapers && out.usedPapers.length) {
    html += "<h4>实际引用的用户文献</h4><ul>" + out.usedPapers.map(function (p) {
      return "<li>[" + p.id + "] " + (p.title || "") + (p.year ? " (" + p.year + ")" : "") + " — " + (p.why || "") + "</li>";
    }).join("") + "</ul>";
  } else {
    html += "<p><b>未使用任何虚构参考文献。</b>请在左侧粘贴真实文献条目后再生成。</p>";
  }
  html += "<h4>论文框架（Markdown）</h4><div class='pre'>" + String(out.markdown || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;") + "</div>";
  setHtml("fwOut", html);
  toast(papers.length ? "框架已生成（仅引用你提供的文献）" : "框架已生成（无文献可引，已标出缺口）");
};

// CSV file input
document.addEventListener("DOMContentLoaded", function () {
  const inp = $("csvFile");
  if (inp) {
    inp.addEventListener("change", function () {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        if ($("csvRaw")) $("csvRaw").value = String(reader.result || "");
        toast("已读取 " + f.name);
      };
      reader.readAsText(f, "utf-8");
    });
  }
});
