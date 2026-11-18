# -*- coding: utf-8 -*-
"""生成独立作品介绍文档（约 20 页，无空白页）。"""
import base64, io, os
from playwright.sync_api import sync_playwright
from PIL import Image
from pypdf import PdfReader

ROOT = r"D:\lunxiaoyan"
OUT = r"D:\论小研-省赛提交材料\02_技术文档\论小研-作品介绍.pdf"
os.makedirs(os.path.dirname(OUT), exist_ok=True)


def b64(path, width=1180):
    im = Image.open(path).convert("RGB")
    if im.width > width:
        im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


IMG = {
    "lib": b64(os.path.join(ROOT, "_shots", "a4-library.png")),
    "ask": b64(os.path.join(ROOT, "_shots", "ask-gpu2.png")),
    "read": b64(os.path.join(ROOT, "_shots", "reader-bi6.png")),
    "graph": b64(os.path.join(ROOT, "_shots", "current-graph.png")),
    "csv": b64(os.path.join(ROOT, "_shots", "current-csvviz2.png")),
    "agent": b64(os.path.join(ROOT, "_shots", "current-agent.png")),
}

HTML = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
@page {{ size: A4; margin: 15mm 14mm 15mm; }}
body {{ font-family:"Microsoft YaHei","PingFang SC",sans-serif; font-size:10.6pt; line-height:1.82; color:#1f2937; margin:0; }}
h1 {{ font-size:18pt; color:#12326b; margin:18px 0 8px; padding-bottom:4px; border-bottom:2px solid #3b6ef5; }}
h2 {{ font-size:12.8pt; color:#1e40af; margin:14px 0 5px; }}
h3 {{ font-size:11pt; color:#334155; margin:10px 0 3px; }}
p {{ margin:5px 0; text-align:justify; }}
ul,ol {{ margin:4px 0 8px 20px; padding:0; }}
li {{ margin:2px 0; }}
table {{ border-collapse:collapse; width:100%; margin:7px 0 10px; font-size:9.3pt; page-break-inside:avoid; }}
th,td {{ border:1px solid #cbd5e1; padding:4px 6px; vertical-align:top; }}
th {{ background:#eef4ff; color:#12326b; }}
pre {{ font-family:Consolas,"Microsoft YaHei",monospace; font-size:8.3pt; line-height:1.55; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; white-space:pre-wrap; }}
.figure {{ page-break-inside:avoid; margin:6px 0 10px; }}
.figure img {{ width:100%; border:1px solid #cbd5e1; border-radius:5px; }}
.cap {{ font-size:8.6pt; color:#64748b; text-align:center; margin-top:3px; }}
.cover {{ text-align:center; padding-top:120px; page-break-after:always; }}
.cover h1 {{ border:0; font-size:30pt; color:#0f2a5c; margin:0; }}
.cover .sub {{ font-size:14pt; color:#3b6ef5; margin-top:8px; }}
.cover .meta {{ margin-top:90px; font-size:10.5pt; color:#475569; line-height:2.1; }}
.lead {{ font-size:10.6pt; color:#334155; background:#f8fafc; border-left:3px solid #3b6ef5; padding:8px 10px; margin:6px 0 10px; }}
.small {{ font-size:9pt; color:#64748b; }}
.tag {{ display:inline-block; font-size:9pt; background:#eef4ff; color:#1e40af; border-radius:10px; padding:1px 8px; margin:2px 4px 2px 0; }}
</style></head><body>

<div class="cover">
  <h1>论小研 · 科研助手 Agent</h1>
  <div class="sub">全流程科研助手 · 作品介绍</div>
  <div class="meta">
    全国高校 AI 大模型挑战赛 · 省赛<br>
    参赛组别：AI大模型创新应用挑战赛<br>
    姓名：张景云<br>
    2026 年 10 月
  </div>
</div>

<h1>摘要</h1>
<p>本文介绍“论小研 · 科研助手 Agent”的设计与实现。作品面向科研文献阅读与写作场景，构建了文献解析、抗幻觉问答、沉浸阅读、检索追踪、引用图谱和写作可视化六个模块，并以意图编排中枢把工具串成可审计的工作流。系统采用静态优先架构，核心能力在浏览器本地完成，不依赖服务器存活；在线模型与 arXiv 检索作为可选增强，通过 Flask 或 Cloudflare Worker 代理接入。测试表明，系统可完成 arXiv v1/v7 语义去重、扫描件 OCR、带页码锚点的问答、16 篇论文的引用图谱与自动综述，以及 CSV 图表与学术 Figure Caption 生成。</p>
<p><b>关键词：</b>科研助手；检索增强生成；PDF 解析；语义去重；引用图谱；Agent 编排；可溯源</p>
<h2>文档结构</h2>
<ol>
<li>作品概述：定位、对比与主要成果</li>
<li>需求分析：科研痛点与赛题要求映射</li>
<li>系统架构：分层、数据流与技术选型</li>
<li>Agent 设计：规划、工具、记忆与 Guardrails</li>
<li>六大功能模块：实现与界面</li>
<li>AI 技术方案：解析、去重、检索、图谱与 Prompt</li>
<li>测试与验证：用例、数据与结果</li>
<li>创新点与评分对照</li>
<li>部署与使用</li>
<li>总结、团队分工与附录</li>
</ol>

<h1>一、作品概述</h1>
<div class="lead">论小研把“读文献”拆成可验证的五步：解析、检索、溯源、图谱、写作。它不是又一个论文润色工具，而是一个能自主规划、调用工具、把每个结论锚定到原文页码的科研 Agent。</div>
<p>作品面向本科生与研究生的真实科研流程：导入 PDF 后自动解析版面与章节，遇到同一论文的 v1/v7 版本主动去重；提问时用检索到的原文片段回答，并给出页码/章节锚点；阅读时保留原版面，支持引用双向跳转与中英对照；把多篇论文组织成引用图谱，自动识别基石论文、生成综述与 Future Work；最后把 idea 变成只引用真实文献的论文框架、架构图脚本与 CSV 图表。</p>
<p>系统采用“静态优先”的架构：六个核心模块全部在浏览器本地完成，评审打开 GitHub Pages 即可体验，不依赖服务器存活，也不要求填写密钥；在线模型、arXiv 实时检索通过可选的 Flask 后端或 Cloudflare Worker 接入。作品同时保留原版 30 多个论文写作页面，Agent 能力以新增页面的形式接入，不破坏原有工作流。</p>

<h2>1.1 作品定位</h2>
<table>
<tr><th>维度</th><th>传统文献工具 / Chatbot</th><th>论小研</th></tr>
<tr><td>文档理解</td><td>只抽纯文本，忽略版面</td><td>PDF.js 版面解析、章节树、参考文献、扫描件 OCR</td></tr>
<tr><td>版本管理</td><td>按文件名区分</td><td>正文 SimHash，识别同一论文的 v1/v7 并提示保留新版</td></tr>
<tr><td>问答</td><td>模型自由生成</td><td>BM25 检索 + 页/节锚点 + 证据不足拒答</td></tr>
<tr><td>阅读</td><td>单栏滚动</td><td>标题树、[n]↔References、中英对照联动滚动</td></tr>
<tr><td>洞察</td><td>无</td><td>PageRank 基石节点、自动综述、Future Work 去旧提新</td></tr>
<tr><td>输出</td><td>纯文本</td><td>无幻觉框架、Mermaid/TikZ、CSV 图表与 Figure Caption</td></tr>
</table>

<h2>1.2 主要成果</h2>
<ul>
<li>一个可公网访问的静态 Agent 工作台：<b>https://yanbopeng7-coder.github.io/lunxiaoyan/</b></li>
<li>六个命题模块全部落地，另有意图编排中枢把工具串成可审计工作流</li>
<li>官方 v1/v7 去重测例、扫描件 OCR、16 篇引用图谱、CSV 图表均可现场演示</li>
<li>5 分 06 秒、1080p 演示视频，中文旁白与软字幕</li>
<li>完整源码、技术文档、部署脚本与测试记录，可复现</li>
</ul>
<p><span class="tag">静态优先</span><span class="tag">可溯源</span><span class="tag">离线可演示</span><span class="tag">密钥不入库</span><span class="tag">原版兼容</span></p>

<h1>二、需求分析</h1>
<p>赛题要求突破传统文献管理工具与简单对话 Chatbot，构建“大模型驱动、Agent 自主进化”的科研助手。我们把真实科研痛点归纳为四类，并逐条转成设计约束。</p>
<h2>2.1 四类核心痛点</h2>
<table>
<tr><th>痛点</th><th>具体表现</th><th>设计约束</th></tr>
<tr><td>信息过载与版本混乱</td><td>arXiv 每日数百篇；同一论文 v1/v7 并存，文件名不可靠</td><td>内容级去重；版本号识别；保留新版/并存/差异查看</td></tr>
<tr><td>学术场景的确定性</td><td>通用模型会编造超参数、GPU 型号、BLEU 分数</td><td>检索增强；页/节锚点；证据不足拒答；数字校验</td></tr>
<tr><td>跨语言与引用追踪</td><td>原文、译文、参考文献之间反复 Ctrl+F</td><td>标题树；[n] 双向跳转；中英段落对齐；联动滚动</td></tr>
<tr><td>从读到写、从写到图</td><td>综述、Future Work、图表、架构图分散在不同工具</td><td>统一 Agent 编排；图谱驱动综述；脚本化绘图</td></tr>
</table>
<h2>2.2 赛题要求映射</h2>
<ul>
<li><b>输入可审查</b>：标准 PDF、扫描件、长文档都能入库；解析结果展示章节、引用与 OCR 状态。</li>
<li><b>输出可验证</b>：回答带原文锚点；图谱节点可点开查看角色与 PageRank；图表 Caption 的数字由数据计算。</li>
<li><b>系统闭环</b>：文献导入 → 问答 → 阅读 → 图谱 → 写作 → 图表，六个模块在同一工作台导航。</li>
<li><b>合规</b>：仓库不含真实 Key；在线能力走服务端/Worker 代理；论文默认只存本机。</li>
</ul>

<h1>三、系统架构</h1>
<pre>
┌──────────────────────────────────────────────────────────────┐
│ GitHub Pages（纯静态）                                        │
│  docs/index.html + static/js/app.js（原版 30+ 写作页面）       │
│  docs/static/js/agent-ui.js / copilot-ui.js（Agent 页面）      │
│  docs/static/js/lab/*.js（算法层，ES Module）                  │
│    library.js  rag.js  reader.js  retrieve.js  graph.js       │
│    agent.js    writing.js  core.js                            │
│  浏览器能力：PDF.js、Tesseract WASM、Canvas、IndexedDB         │
└───────────────▲──────────────────────────────────────────────┘
                │ 可选（在线模型 / arXiv）
┌───────────────┴──────────────────────────────────────────────┐
│ Flask 后端 / Cloudflare Worker                                │
│  /api/llm     服务端持钥调用大模型，规避浏览器 CORS            │
│  /api/arxiv   arXiv API 代理                                  │
└──────────────────────────────────────────────────────────────┘
</pre>
<h2>3.1 分层说明</h2>
<table>
<tr><th>层</th><th>职责</th><th>关键文件</th></tr>
<tr><td>页面层</td><td>原版写作工具 + 六个 Agent 页面；统一侧边栏与样式</td><td>templates/index.html、agent-ui.js、copilot-ui.js</td></tr>
<tr><td>算法层</td><td>解析、去重、检索、阅读、图谱、写作；纯前端可测试</td><td>static/js/lab/*.js</td></tr>
<tr><td>存储层</td><td>论文、PDF、轨迹、反馈写入 IndexedDB / localStorage</td><td>lab/core.js</td></tr>
<tr><td>可选服务</td><td>在线模型代理、arXiv 代理、密钥托管</td><td>app.py、deploy/linux、deploy/cloudflare-worker</td></tr>
</table>
<h2>3.2 数据流</h2>
<ol>
<li>PDF 上传 → 取文本层；文本过少的页面渲染为图像，走 Tesseract OCR。</li>
<li>结构化切块 → 计算 SimHash / shingle 相似度 → 命中重复时提示版本策略。</li>
<li>chunk 写入 IndexedDB → RAG、阅读器、图谱共用同一份解析结果。</li>
<li>问答检索 topK → 生成带页/节锚点的回答 → 前端校验引用与数字。</li>
<li>参考文献建边 → PageRank/中心性 → 综述与 Future Work。</li>
</ol>

<h1>四、Agent 设计</h1>
<div class="lead">Agent 的价值不在“多调用一次模型”，而在把复杂任务拆成可检查的步骤，并让每一步的输入输出都留痕。</div>
<h2>4.1 任务规划</h2>
<p>意图编排中枢接收研究目标后，先拆成“解析文献 → 检索证据 → 跨文对比 → 图谱综述 → 写作/图表”的计划；用户可以先只看计划，再决定是否执行。计划步骤与工具名一一对应，避免模型自由发挥。</p>
<h2>4.2 工具注册与调用</h2>
<table>
<tr><th>工具</th><th>作用</th><th>失败降级</th></tr>
<tr><td>文献解析</td><td>PDF 文本层 / OCR / 结构抽取</td><td>提示粘贴文本或换文件</td></tr>
<tr><td>混合检索</td><td>BM25 召回原文 chunk</td><td>无结果时直接拒答</td></tr>
<tr><td>arXiv 检索</td><td>关键词检索、下钻入库</td><td>回退内置演示条目</td></tr>
<tr><td>引用图谱</td><td>PageRank、综述、Future Work</td><td>使用内置 16 篇语料</td></tr>
<tr><td>写作/绘图</td><td>大纲、Mermaid/TikZ、CSV 图表</td><td>本地模板生成</td></tr>
</table>
<h2>4.3 思考日志与记忆</h2>
<p>每次规划/工具调用记录步骤名、输入摘要、输出摘要与耗时，形成可回放的思考日志；会话内保留当前文献范围与上一轮答案，支持“它/这篇”等指代。日志只存本机，导出为 JSON 便于审计。</p>
<h2>4.4 Guardrails</h2>
<ul>
<li><b>引用校验</b>：回答中的锚点必须对应本次检索到的 paperId 与页码。</li>
<li><b>数值校验</b>：回答里的数字必须能在证据片段中找到；否则标记风险。</li>
<li><b>拒答</b>：检索分数低于阈值或没有匹配句时输出“证据不足”，不补写。</li>
<li><b>版本折叠</b>：同一 arXiv 多版本只检索最新版，避免重复引用。</li>
<li><b>提示注入</b>：PDF 文本按数据处理，不执行其中“忽略指令”类内容。</li>
</ul>

<h1>五、六大功能模块</h1>
<h2>5.1 文献库：解析与语义去重</h2>
<div class="figure"><img src="{IMG['lib']}"><div class="cap">图 1 文献库：v7 与 v1 入库，提示版本关系</div></div>
<p>文献库支持批量上传 PDF/文本。解析层优先读取 PDF 文本层，按行重建标题、作者、摘要、章节与参考文献；文本量过低的页面判定为扫描件，渲染为 canvas 后交给 Tesseract WASM OCR。去重不依赖文件名，而是对正文做 SimHash 与 shingle Jaccard：相同 arXiv 号或相似度超过阈值即触发版本提示。</p>
<ul>
<li>先传 v7、再传 v1：系统提示“库中版本更新，建议保留新版”，也支持两版并存或查看差异。</li>
<li>v7 解析出 16 个 chunks、7 条参考文献；v1 为 9 个 chunks、5 条参考文献。</li>
<li>扫描件测例：本地 OCR 识别 1 页并入库；长文档按页分级加载，避免一次性占满内存。</li>
</ul>

<h2>5.2 抗幻觉问答</h2>
<div class="figure"><img src="{IMG['ask']}"><div class="cap">图 2 抗幻觉问答：回答带页码/章节锚点</div></div>
<p>检索采用 BM25：对 chunk 建 TF/DF，按 idf 加权取 topK；每个证据块携带 paperId、page、section。回答只由命中的原文句子组成，每条结论后给出可点击锚点；找不到证据时明确拒答。多文对比时按论文分组检索，输出逐篇证据与差异表。</p>
<p>示例问题：“训练用了多少块 GPU？β1、β2 如何设置？”系统会抽取包含 P100、12 小时、β1/β2 的原文句子，并把出处定位到具体页与章节，避免模型用常识补写。</p>

<h2>5.3 沉浸阅读与双向翻译</h2>
<div class="figure"><img src="{IMG['read']}"><div class="cap">图 3 双语阅读：标题树、引用跳转、中英对照</div></div>
<p>阅读器保留论文原版面：左侧标题树定位章节，右侧正文中的 <b>[n]</b> 可跳到 References，参考文献条目也能反向定位正文出现位置。打开中英对照后，两侧按段落对齐，拖动任意一侧，另一侧按比例联动；公式、变量与术语保留英文。</p>

<h2>5.4 检索、追踪与推荐</h2>
<p>检索模块支持按关键词或 arXiv id 检索，结果展示标题、作者、年份、引用数与 GitHub 链接；推荐打分综合考虑与本地库的相关性、时间新近度与是否附带开源代码，点赞/点踩会调整后续排序。找到论文后可一键下钻入库，继续参与问答和图谱。没有后端时回退内置演示条目，保证评审现场可用。</p>

<h2>5.5 引用图谱与自动综述</h2>
<div class="figure"><img src="{IMG['graph']}"><div class="cap">图 4 16 篇 Transformer 谱系论文的局域引用图谱</div></div>
<p>系统解析参考文献后与库内/演示语料标题匹配建边，使用 PageRank 迭代识别基石论文，入度与年份区分桥梁与边缘衍生。演示语料生成 16 个节点、20 条引用边；综述模板只使用节点标题、年份、PageRank 与摘要，不引入外部事实。</p>
<p>Future Work 模块先抽取各论文的 Future/Limitation 段落并聚类，再到年份更晚的论文中检索相似段落与解决性措辞（we address / solve / outperform 等），输出“仍开放”与“可能已解决”两类方向，并保留证据。</p>

<h2>5.6 写作与数据可视化</h2>
<div class="figure"><img src="{IMG['csv']}"><div class="cap">图 5 CSV 自动图表与学术 Figure Caption</div></div>
<p>写作模块根据 idea 生成 Abstract、Introduction、Related Work、Method、Experiments、Conclusion 框架；引用只允许来自库内真实文献，不足时输出“证据缺口”。架构图支持 Mermaid、Graphviz、TikZ、Matplotlib 四种脚本。</p>
<p>CSV 模块自动识别列类型并选图（折线/柱状/散点/雷达），生成 SVG 图表、Matplotlib 脚本与 booktabs 表格；Figure Caption 中的斜率、R²、峰值均为真实计算。演示数据生成折线图，斜率 0.0608、R²=0.967、峰值 0.864。</p>

<h1>六、AI 技术方案</h1>
<h2>6.1 文档解析</h2>
<p>解析流程为“文本层优先、OCR 兜底”：PDF.js 提取带坐标的文本项，按基线聚合成行，依据行距与缩进重建段落；标题通过字号、编号与关键词识别；参考文献按 [n] 或作者-年份切分。扫描页文本量低时，将页面渲染为 canvas，用本地 Tesseract WASM 做英文 OCR，再把结果回填为正文。</p>
<h2>6.2 语义去重</h2>
<p>对正文计算 64 位 SimHash，并抽样 5-gram 做 shingle Jaccard；两者与 arXiv 号、标题相似度共同决定是否重复。相同 arXiv 号不同版本时比较 version，库中版本更新则建议保留新版；否则提示替换。该策略不依赖文件名，能识别改名后的同一论文。</p>
<h2>6.3 检索与回答</h2>
<p>BM25 负责稀疏召回，chunk 带页码与章节；回答阶段优先抽取包含问题关键词与意图词的句子，再按证据组织。引用以 paperId/page/section 生成锚点，前端可点击回原文。证据不足时返回固定拒答文案，避免“看起来合理”的编造。</p>
<h2>6.4 图谱算法</h2>
<p>引用边来自参考文献匹配；PageRank 使用阻尼 0.85、40 轮迭代，介数中心性用 Brandes 算法；角色分类结合 PageRank 排名、入度与年份。综述与 Future Work 均以图计算和原文摘要为输入，数字不手写。</p>
<h2>6.5 Prompt 与 Guardrails</h2>
<p>在线模型只作为“归纳增强”：把检索到的证据编号为 S1…Sn，要求输出 JSON，引用必须能在片段中找到原句，否则丢弃；全部无效时回退本地抽取式回答。系统提示词明确“只使用给定片段、找不到就拒答”，并在前端做引用/数值校验。</p>

<h1>七、测试与验证</h1>
<table>
<tr><th>用例</th><th>操作</th><th>结果</th></tr>
<tr><td>v1/v7 语义去重</td><td>文献库 → 一键 Attention v1→v7 测例</td><td>通过：v7 16 chunks/7 refs；v1 9 chunks/5 refs；提示版本关系</td></tr>
<tr><td>扫描件 OCR</td><td>文献库 → 扫描件 OCR 测例</td><td>通过：本地 Tesseract 识别 1 页并入库</td></tr>
<tr><td>抗幻觉问答</td><td>选论文 → 提问 GPU / β1、β2</td><td>通过：回答带页/节锚点，无证据时拒答</td></tr>
<tr><td>引用图谱</td><td>载入 16 篇演示语料</td><td>通过：16 节点/20 边，PageRank、综述、Future Work 正常</td></tr>
<tr><td>CSV 图表</td><td>载入演示 CSV → 生成</td><td>通过：折线图 + Caption（斜率 0.0608、R²=0.967、峰值 0.864）</td></tr>
<tr><td>演示视频</td><td>最终成片</td><td>5:06，1920×1080，中文旁白 + 软字幕</td></tr>
</table>
<p>测试环境为 Windows 11 + Chrome（Playwright 驱动）。核心模块在无后端、无密钥条件下完成；在线模型与 arXiv 实时检索为可选增强，失败时自动回退，不阻断演示。</p>

<h1>八、创新点与评分对照</h1>
<h2>8.1 创新点</h2>
<ul>
<li><b>内容级版本管理</b>：SimHash + shingle 识别 arXiv v1/v7，而不是文件名；提示保留新版并支持差异查看。</li>
<li><b>确定性回答</b>：BM25 证据 + 页/节锚点 + 证据不足拒答，把“可回查”作为硬约束。</li>
<li><b>图谱驱动综述</b>：PageRank 基石、边缘衍生、Future Work 去旧提新，综述数字全部来自图计算。</li>
<li><b>离线优先的 Agent</b>：六个模块在浏览器本地完成，评审不依赖服务器存活。</li>
<li><b>原版兼容</b>：30+ 写作页面与 Agent 页面共用侧边栏与样式，不推翻原有工作流。</li>
</ul>
<h2>8.2 评分维度对照（自评）</h2>
<table>
<tr><th>维度</th><th>权重</th><th>自评</th><th>主要依据</th></tr>
<tr><td>Agent 与大模型技术深度</td><td>35%</td><td>62</td><td>编排、BM25 RAG、解析/OCR、工具链、拒答与引用校验</td></tr>
<tr><td>科研场景创新性</td><td>25%</td><td>66</td><td>语义去重、PageRank 基石、Future Work 去旧提新、双语联动</td></tr>
<tr><td>全栈工程质量</td><td>10%</td><td>62</td><td>静态+可选后端、部署脚本、模块化；缺单元测试与 Docker</td></tr>
<tr><td>科研实用性与闭环</td><td>10%</td><td>66</td><td>六模块可演示；在线模型需额外部署</td></tr>
<tr><td>学术级 UI/UX</td><td>10%</td><td>70</td><td>统一学术风格、图谱/图表可视化、阅读器联动</td></tr>
<tr><td>学术价值与推广</td><td>10%</td><td>60</td><td>可离线、可复现；文档与测试仍需持续完善</td></tr>
</table>

<h1>九、部署与使用</h1>
<h2>9.1 纯静态（评审推荐）</h2>
<pre>cd lunxiaoyan
python -m http.server 8080
# 打开 http://127.0.0.1:8080/docs/
# 或直接访问 https://yanbopeng7-coder.github.io/lunxiaoyan/</pre>
<p>无需安装依赖、无需密钥；文献库去重、RAG、阅读器、图谱、CSV 图表均在浏览器本地运行。</p>
<h2>9.2 本地 Flask / Linux / Worker</h2>
<ul>
<li><b>Flask</b>：复制 <code>.env.example</code> 为 <code>.env</code> 填 Key，<code>python app.py</code>，提供 <code>/api/llm</code> 与 <code>/api/arxiv</code>。</li>
<li><b>Linux</b>：<code>deploy/linux</code> 提供 systemd、启动脚本与稳定域名/命名隧道说明。</li>
<li><b>Cloudflare Worker</b>：<code>deploy/cloudflare-worker</code>，密钥放 Worker Secret，前端配置 <code>window.LX_API_BASE</code>。</li>
</ul>
<p class="small">安全说明：仓库不包含任何真实 API Key；<code>.env</code> 已加入 <code>.gitignore</code>。智谱接口不允许浏览器直连，因此在线模型统一走服务端或 Worker 代理；未配置时自动使用本地演示。</p>

<h1>十、总结与展望</h1>
<p>论小研以“可验证”为核心，把科研阅读拆成解析、检索、溯源、图谱、写作五个可审计环节。当前版本已能在无后端环境下完整演示 v1/v7 去重、RAG、阅读、图谱与 CSV 可视化；在线模型与 arXiv 实时检索可通过 Flask 或 Worker 接入。</p>
<p>后续计划：增强公式/表格结构化解析（GROBID/MinerU）、补充中文 OCR 语言包、增加 541 页长文档端到端压测，并把 Agent 轨迹导出为可复现实验记录。我们希望它不只是“帮人写论文”，而是让每个科研结论都能回到原文的哪一页、哪一节。</p>
<p class="small">作品信息：参赛组别 AI大模型创新应用挑战赛；姓名 张景云；在线演示 https://yanbopeng7-coder.github.io/lunxiaoyan/</p>


<h1>十一、技术选型与对比</h1>
<table>
<tr><th>环节</th><th>选型</th><th>理由</th><th>备选与取舍</th></tr>
<tr><td>PDF 解析</td><td>PDF.js（浏览器）</td><td>静态站可直接运行，无需上传文件；能拿到文本层与坐标</td><td>PyMuPDF 更强，但需要后端；作为可选增强</td></tr>
<tr><td>扫描件 OCR</td><td>Tesseract.js WASM</td><td>纯前端、可离线；英文模型体积可控</td><td>VLM OCR 精度更高，但依赖在线模型与费用</td></tr>
<tr><td>检索</td><td>BM25</td><td>无需 embedding 服务，可解释、可离线</td><td>稠密检索语义更强，但需要模型与向量库</td></tr>
<tr><td>去重</td><td>SimHash + shingle Jaccard</td><td>对长文稳定、计算轻；适合版本识别</td><td>MinHash 可扩展，但当前规模无需</td></tr>
<tr><td>图谱</td><td>PageRank + 介数中心性</td><td>经典、可解释；适合 20 篇局域网络</td><td>社区发现可补充聚类视角</td></tr>
<tr><td>前端</td><td>原生 ES Module + Canvas/SVG</td><td>零构建、Pages 直接托管；易审计</td><td>React/Vue 生态更丰富，但增加构建链</td></tr>
<tr><td>在线模型</td><td>Flask / Cloudflare Worker 代理</td><td>密钥留在服务端，规避浏览器 CORS</td><td>浏览器直连仅适合支持 CORS 的厂商</td></tr>
</table>
<p>选型的核心原则是“评审现场不依赖不确定资源”：能在浏览器完成的绝不放到服务器；必须联网的能力做成可降级，失败时回到本地演示。</p>

<h1>十二、关键实现细节</h1>
<h2>12.1 数据结构</h2>
<pre>paper = {{
  id, title, authors, year, arxivId, version,
  sections: [{{ id, level, title, page, paragraphs: [{{ text, page, bbox }}] }}],
  references: [{{ index, raw, title, authors, year, arxivId }}],
  chunks: [{{ id, text, page, section }}],
  fingerprint: {{ simhash, shingles }}
}}</pre>
<h2>12.2 引用锚点</h2>
<p>回答中的引用使用统一 token 形式 <code>[[c:paperId:page:section]]</code>，前端渲染为可点击 chip；点击后按 paperId 找到论文、按 page 定位原文、按 section 高亮段落。没有对应证据的 token 会被 Guardrails 标记为无效。</p>
<h2>12.3 模型输出约束</h2>
<pre>{{
  "answer_md": "回答，引用写作 [S1]",
  "citations": [{{"sid": 1, "quote": "片段中的原句"}}],
  "confidence": 0.0,
  "abstain": false
}}</pre>
<p>模型只拿到编号后的证据片段，不允许引入外部知识；引用必须在片段中原样出现，否则丢弃；全部无效时回退本地抽取式回答。这样即使模型不稳定，输出仍受证据约束。</p>

<h1>十三、测试数据与指标</h1>
<table>
<tr><th>指标</th><th>数值</th><th>说明</th></tr>
<tr><td>v7 解析</td><td>16 chunks / 7 refs</td><td>Attention Is All You Need v7</td></tr>
<tr><td>v1 解析</td><td>9 chunks / 5 refs</td><td>同一论文早期版本，触发去重提示</td></tr>
<tr><td>图谱规模</td><td>16 节点 / 20 边</td><td>Transformer 谱系演示语料</td></tr>
<tr><td>CSV 图表</td><td>5 行 5 列，line 图</td><td>斜率 0.0608、R²=0.967、峰值 0.864</td></tr>
<tr><td>扫描件 OCR</td><td>1 页识别并入库</td><td>本地 Tesseract WASM</td></tr>
<tr><td>演示视频</td><td>5:06 / 1080p</td><td>中文旁白 + 软字幕</td></tr>
</table>
<p>测试在 Windows 11 + Chrome 下完成；核心模块在无后端、无密钥条件下通过。在线模型与 arXiv 实时检索为可选增强，失败时自动回退。</p>

<h1>十四、团队分工与开发过程</h1>
<table>
<tr><th>角色</th><th>工作内容</th><th>成员</th></tr>
<tr><td>算法与 Agent</td><td>PDF 解析、RAG、图谱、Agent 编排</td><td>张景云</td></tr>
<tr><td>前端与交互</td><td>页面、阅读器、可视化、样式</td><td>张景云</td></tr>
<tr><td>测试与文档</td><td>测试用例、部署、演示视频</td><td>张景云</td></tr>
</table>
<p>开发过程保留完整 Git 提交：先完成原版写作工具，再逐步加入文献库、RAG、阅读器、图谱与写作模块；每次提交对应一个可演示的功能点。详细记录见仓库 README 与 TEST_REPORT。</p>

<h1>十五、风险、合规与改进计划</h1>
<table>
<tr><th>风险</th><th>影响</th><th>当前处理</th></tr>
<tr><td>智谱接口 CORS</td><td>静态页无法直连在线模型</td><td>默认本地演示；在线走 Flask/Worker 代理</td></tr>
<tr><td>扫描件语言</td><td>中文 OCR 精度不足</td><td>默认英文模型；可追加 chi_sim</td></tr>
<tr><td>复杂版面</td><td>公式/表格可能漏检</td><td>文本层+启发式；后续接 GROBID/MinerU</td></tr>
<tr><td>长文档</td><td>内存与耗时</td><td>按页分级加载；541 页教材需进一步压测</td></tr>
<tr><td>密钥管理</td><td>泄露风险</td><td>仓库无 Key；.env 忽略；Worker Secret</td></tr>
</table>
<p>改进计划：补中文 OCR、增强公式/表格结构、增加 541 页长文档压测、把 Agent 轨迹导出为可复现实验记录，并补充单元测试与 Docker 部署。</p>

<h1>附录 A　目录结构</h1>
<pre>lunxiaoyan/
├─ app.py / engine.py / extras.py     Flask 后端与写作引擎
├─ templates/index.html               原版工作台 + Agent 页面
├─ static/
│  ├─ js/app.js                       原版逻辑
│  ├─ js/agent-ui.js                  Agent 页面逻辑
│  ├─ js/copilot-ui.js                写作/图表页面
│  └─ js/lab/                         解析、RAG、阅读、图谱、编排
├─ docs/                              GitHub Pages 发布目录
├─ deploy/linux/                      systemd 与启动脚本
├─ deploy/cloudflare-worker/          在线模型代理
├─ tools/                             数据与文档生成脚本
└─ requirements.txt / .env.example</pre>

<h1>附录 B　复现命令</h1>
<pre># 纯静态演示
python -m http.server 8080
# http://127.0.0.1:8080/docs/

# 本地 Flask（可选，在线模型）
cp .env.example .env      # 填 ZHIPU_API_KEY
pip install -r requirements.txt
python app.py

# 只验证前端
python -m http.server 8080
# 文献库 → 一键 Attention v1→v7 测例
# 引用图谱 → 载入 16 篇演示语料
# CSV 数据可视化 → 载入演示 CSV → 生成</pre>
<p class="small">文档版本：2026-10-31；如页面或接口有更新，以仓库 README 与在线演示为准。</p>


<h1>十六、与同类方案对比</h1>
<table>
<tr><th>能力</th><th>Zotero + 通用 Chatbot</th><th>Elicit / SciSpace</th><th>NotebookLM</th><th>论小研</th></tr>
<tr><td>PDF 版面解析</td><td>元数据为主，正文靠插件</td><td>云端解析，上传整篇</td><td>上传后云端解析</td><td>浏览器本地解析 + OCR</td></tr>
<tr><td>版本语义去重</td><td>按文件/标题</td><td>有限</td><td>无</td><td>SimHash + v1/v7 提示</td></tr>
<tr><td>回答溯源</td><td>靠模型自述</td><td>有引用，粒度较粗</td><td>段落引用</td><td>页码/章节锚点 + 拒答</td></tr>
<tr><td>引用图谱</td><td>无</td><td>部分</td><td>无</td><td>PageRank + 综述 + Future Work</td></tr>
<tr><td>离线/免登录</td><td>客户端 + 需账号</td><td>需账号/付费</td><td>需账号</td><td>静态页，打开即用</td></tr>
<tr><td>数据位置</td><td>本地库</td><td>云端</td><td>云端</td><td>默认本机 IndexedDB</td></tr>
</table>
<p>论小研的差异点不是“模型更大”，而是把确定性写进产品：解析在本地、引用可回查、没有证据就拒答；同时保留原版写作工具，避免教师/学生重新学习一套系统。</p>

<h1>十七、接口与配置</h1>
<h2>17.1 在线模型代理</h2>
<p>前端向 <code>POST /api/llm</code> 发送 OpenAI 兼容的 chat completions 请求；Flask 或 Worker 在服务端注入 <code>Authorization</code> 后转发。静态页通过 <code>window.LX_API_BASE</code> 指定代理地址；不设置时走本地演示。</p>
<table>
<tr><th>配置项</th><th>位置</th><th>说明</th></tr>
<tr><td>ZHIPU_API_KEY</td><td>服务端 .env / Worker Secret</td><td>智谱密钥，不进入前端</td></tr>
<tr><td>SILICONFLOW_API_KEY</td><td>服务端 .env / Worker Secret</td><td>可选，支持浏览器 CORS 时可直连</td></tr>
<tr><td>LX_API_BASE</td><td>docs/index.html</td><td>代理根地址；留空则本地演示</td></tr>
<tr><td>LLM_PROVIDER</td><td>Worker 变量</td><td>zhipu / silicon，默认自动判断</td></tr>
</table>
<h2>17.2 arXiv 代理</h2>
<p><code>GET /api/arxiv?q=关键词&amp;max=8</code> 返回标题、作者、年份、摘要、PDF 与 GitHub 链接。无后端时前端回退内置演示条目，保证检索页面可操作。</p>
<h2>17.3 本地运行</h2>
<pre>cp .env.example .env
pip install -r requirements.txt
python app.py
# 打开 http://127.0.0.1:8080</pre>

<h1>十八、开发计划与里程碑</h1>
<table>
<tr><th>阶段</th><th>目标</th><th>交付物</th><th>状态</th></tr>
<tr><td>M1 基础工作台</td><td>原版 30+ 写作页面、评估/大纲/润色</td><td>templates、app.js、Flask 引擎</td><td>已完成</td></tr>
<tr><td>M2 文献库</td><td>PDF 解析、SimHash 去重、OCR</td><td>library.js、文献库页面</td><td>已完成</td></tr>
<tr><td>M3 问答与阅读</td><td>BM25 RAG、引用跳转、中英对照</td><td>rag.js、reader.js</td><td>已完成</td></tr>
<tr><td>M4 图谱与写作</td><td>PageRank、综述、CSV/架构图</td><td>graph.js、writing.js</td><td>已完成</td></tr>
<tr><td>M5 编排与交付</td><td>Agent 编排、部署、文档、视频</td><td>agent.js、deploy、技术文档</td><td>已完成</td></tr>
<tr><td>M6 打磨</td><td>中文 OCR、公式/表格、长文档压测</td><td>后续版本</td><td>进行中</td></tr>
</table>
<p>开发过程保留完整 Git 历史；每个里程碑对应可演示的功能点，便于评审复核。</p>

<h1>附录 C　术语表</h1>
<table>
<tr><th>术语</th><th>含义</th></tr>
<tr><td>RAG</td><td>Retrieval-Augmented Generation，先检索原文再生成回答</td></tr>
<tr><td>BM25</td><td>基于词频与逆文档频率的稀疏检索算法</td></tr>
<tr><td>SimHash</td><td>将长文本映射为固定长度指纹，用于近似重复检测</td></tr>
<tr><td>Shingle</td><td>连续 n-gram 片段，用于 Jaccard 相似度</td></tr>
<tr><td>PageRank</td><td>图上的迭代重要性算法，用于识别基石论文</td></tr>
<tr><td>Guardrails</td><td>对模型输入输出做约束与校验的安全机制</td></tr>
<tr><td>OCR</td><td>光学字符识别，把扫描页图像转成文本</td></tr>
<tr><td>IndexedDB</td><td>浏览器本地数据库，用于存论文与解析结果</td></tr>
<tr><td>锚点</td><td>回答中指向原文页码/章节的可点击引用</td></tr>
<tr><td>Future Work</td><td>论文结尾提出的未来研究方向</td></tr>
</table>
<p class="small">以上内容与仓库 README、TEST_REPORT、RUBRIC 保持一致；如实现有更新，以在线演示与源码为准。</p>


<h1>十九、用户使用手册</h1>
<h2>19.1 首次使用（约 5 分钟）</h2>
<table>
<tr><th>步骤</th><th>操作</th><th>预期结果</th></tr>
<tr><td>1</td><td>打开在线地址，左侧进入“文献库”</td><td>看到上传区与三个演示测例</td></tr>
<tr><td>2</td><td>点“一键 Attention v1→v7 去重测例”</td><td>两篇论文入库，提示版本关系</td></tr>
<tr><td>3</td><td>进入“抗幻觉问答”，选论文并提问</td><td>回答带页码/章节锚点</td></tr>
<tr><td>4</td><td>进入“沉浸阅读翻译”，打开阅读器</td><td>标题树、[n] 跳转、中英对照</td></tr>
<tr><td>5</td><td>进入“引用图谱综述”，载入 16 篇演示语料</td><td>图谱、基石节点、自动综述</td></tr>
<tr><td>6</td><td>进入“CSV 数据可视化”，载入演示 CSV 并生成</td><td>图表、Caption、Matplotlib 脚本</td></tr>
<tr><td>7</td><td>进入“意图编排中枢”，生成计划并执行</td><td>计划、工具调用、思考日志</td></tr>
</table>
<h2>19.2 常见问题</h2>
<table>
<tr><th>问题</th><th>原因 / 处理</th></tr>
<tr><td>文献库一直是空的</td><td>首次解析需要几秒；若仍为空，刷新后重试，或换 Chrome/Edge</td></tr>
<tr><td>问答提示“证据不足”</td><td>问题超出已入库论文范围；换论文或补充 PDF</td></tr>
<tr><td>扫描件识别慢</td><td>OCR 在本地运行，首次需加载 WASM；耐心等待或只测 1 页</td></tr>
<tr><td>在线模型报错</td><td>未配置代理时自动回退本地演示；检查 LX_API_BASE 或后端</td></tr>
<tr><td>图谱没有边</td><td>演示语料自带引用；真实论文需参考文献能被解析</td></tr>
</table>

<h1>二十、答辩要点</h1>
<table>
<tr><th>可能的问题</th><th>回答要点</th></tr>
<tr><td>你们的 Agent 和直接调模型有什么区别？</td><td>有任务规划、工具注册、思考日志与证据校验；模型只做归纳，不负责编造</td></tr>
<tr><td>如何保证不 hallucinate？</td><td>BM25 召回 + 页/节锚点 + 引用/数值校验 + 证据不足拒答</td></tr>
<tr><td>为什么用 BM25 不用向量检索？</td><td>离线、可解释、无需 embedding 服务；规模到千篇可换混合检索</td></tr>
<tr><td>v1/v7 去重怎么做的？</td><td>正文 SimHash + shingle Jaccard + arXiv 版本号，不看文件名</td></tr>
<tr><td>图谱的基石节点怎么定义？</td><td>PageRank 排名靠前、入度高、年份较早；角色分类结合中心性</td></tr>
<tr><td>为什么评审时不用登录？</td><td>静态页 + 本地存储，打开即用；在线能力是可选的</td></tr>
<tr><td>数据隐私怎么处理？</td><td>论文默认只存浏览器 IndexedDB，不上传服务器；密钥只在服务端</td></tr>
<tr><td>下一步做什么？</td><td>中文 OCR、公式/表格结构化、长文档压测、Agent 轨迹导出</td></tr>
</table>

<h1>附录 D　参考资料</h1>
<ul>
<li>Vaswani et al. Attention Is All You Need. arXiv:1706.03762（v1/v7 测试语料）</li>
<li>Robertson &amp; Zaragoza. The Probabilistic Relevance Framework: BM25 and Beyond.</li>
<li>Page et al. The PageRank Citation Ranking: Bringing Order to the Web.</li>
<li>PDF.js 文档：https://mozilla.github.io/pdf.js/</li>
<li>Tesseract.js 文档：https://github.com/naptha/tesseract.js</li>
<li>GB/T 7714—2025《信息与文献 参考文献著录规则》</li>
<li>Devlin et al. BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding. arXiv:1810.04805.</li>
<li>Brown et al. Language Models are Few-Shot Learners. arXiv:2005.14165.</li>
<li>Liu et al. RoBERTa: A Robustly Optimized BERT Pretraining Approach. arXiv:1907.11692.</li>
<li>Xu et al. LayoutLMv3: Pre-training for Document AI with Unified Text and Image Masking. arXiv:2204.08387.</li>
<li>GROBID 文档：https://grobid.readthedocs.io/</li>
<li>MinerU 文档：https://github.com/opendatalab/MinerU</li>
<li>Cloudflare Workers 文档：https://developers.cloudflare.com/workers/</li>
</ul>
<h2>版本记录</h2>
<table>
<tr><th>日期</th><th>版本</th><th>说明</th></tr>
<tr><td>2026-10-22</td><td>v1.0</td><td>完成六模块与 Agent 编排页面</td></tr>
<tr><td>2026-10-30</td><td>v1.1</td><td>本地 OCR、去隧道、测试与文档</td></tr>
<tr><td>2026-10-31</td><td>v1.2</td><td>作品介绍文档、演示视频与提交包</td></tr>
</table>
<h2>提交材料清单</h2>
<table>
<tr><th>材料</th><th>内容</th><th>位置</th></tr>
<tr><td>作品源码</td><td>Flask 后端、原版工作台、六个 Agent 模块、部署与测试脚本</td><td>01_作品源码/</td></tr>
<tr><td>技术文档</td><td>本文件（作品介绍）</td><td>02_技术文档/</td></tr>
<tr><td>演示视频</td><td>5:06，1080p，中文旁白 + 软字幕</td><td>03_演示视频/</td></tr>
<tr><td>作品文档</td><td>应用方案、修订版</td><td>04_作品文档/</td></tr>
<tr><td>运行部署</td><td>README、依赖、环境变量模板、Linux / Worker 部署</td><td>05_运行与部署/</td></tr>
<tr><td>测试评分</td><td>测试报告、评分对照、架构说明、演示脚本</td><td>06_测试与评分/</td></tr>
<tr><td>在线演示</td><td>地址、无需登录、3 分钟体验路径</td><td>07_在线演示/</td></tr>
</table>
<p>致谢：感谢指导老师在选题与评测方向上的建议，感谢开源社区提供的 PDF.js、Tesseract.js 与 arXiv 接口。作品仍有不足，欢迎评审专家批评指正。</p>
<p class="small">文档中的测试数据来自 2026-10-30 的本地与线上实测；如后续版本有变化，以仓库 TEST_REPORT 为准。</p>

</body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    page = b.new_page()
    page.set_content(HTML, wait_until="load")
    page.pdf(path=OUT, format="A4", print_background=True,
             margin={"top": "15mm", "bottom": "15mm", "left": "14mm", "right": "14mm"},
             display_header_footer=True, header_template="<div></div>",
             footer_template="<div style='width:100%;font-size:8px;color:#94a3b8;text-align:center'>论小研 · 作品介绍 · <span class='pageNumber'></span>/<span class='totalPages'></span></div>")
    b.close()

import pymupdf
doc = pymupdf.open(OUT)
import shutil
shutil.copyfile(OUT, r"D:\论小研-作品介绍.pdf")
print("pages", doc.page_count, "size", round(os.path.getsize(OUT) / 1024), "KB")
for i, page in enumerate(doc, 1):
    t = page.get_text().strip()
    if len(t) < 80:
        print("low-text page", i, len(t))
