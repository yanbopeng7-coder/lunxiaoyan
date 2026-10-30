# 架构设计

## 1. 总体形态

```
┌──────────────────────────────────────────────────────────────┐
│ GitHub Pages（纯静态）                                        │
│  docs/index.html + static/js/app.js（原版工具）                │
│  docs/static/js/agent-ui.js / copilot-ui.js（Agent 页面）      │
│  docs/static/js/lab/*（算法层，ES Module）                    │
│    library.js  rag.js  reader.js  retrieve.js  graph.js       │
│    agent.js    writing.js  core.js                            │
│  浏览器能力：PDF.js 渲染/抽取、Tesseract WASM OCR、Canvas 图谱 │
└───────────────▲──────────────────────────────────────────────┘
                │ 可选（在线模型 / arXiv）
┌───────────────┴──────────────────────────────────────────────┐
│ Flask 后端（本地或 Linux 服务器）                             │
│  /api/llm     服务端持钥调用大模型，规避浏览器 CORS            │
│  /api/arxiv   arXiv API 代理                                  │
│  /api/parse   可选：服务端解析                                 │
└──────────────────────────────────────────────────────────────┘
```

设计原则：

1. **静态优先**：评审只打开一个网址即可体验核心六模块，不依赖服务器存活。
2. **密钥零入库**：`.env` 被 `.gitignore` 忽略，仓库不内置任何 Key。
3. **可降级**：在线模型/arXiv 不可用时自动回退浏览器端能力或内置演示数据。

## 2. 模块与数据流

### 2.1 文献解析与去重
- PDF.js 取文本层 → 按行重建 → 章节/摘要/参考文献粗抽取 → 切块（约 300–500 字）。
- 计算 SimHash + 正文 shingle Jaccard；同 arXiv 号或相似度超阈值触发去重。
- 版本号从文件名/正文 arXiv id 提取；库中版本更新时提示保留新版。
- 扫描页文本量低 → 渲染成图 → Tesseract WASM OCR → 回填文本。
- 结果写入 IndexedDB（`papers` / `files`），供问答、阅读、图谱复用。

### 2.2 抗幻觉 RAG
- 稀疏 BM25（`lab/rag.js`）：对 chunk 建 TF/DF，按 idf 打分，取 topK。
- 每个证据块带 `paperId / page / section`，回答中生成可点击锚点。
- 检索不到证据时返回“证据不足”，不调用模型补写。
- 多文对比按论文分组检索，输出逐篇证据表。

### 2.3 阅读与翻译
- 标题树来自 section 结构；正文 `[n]` 正则匹配 references index。
- 点击 `[n]` → 参考文献条目；点击条目 → 正文出现位置（page + section）。
- 中英双栏：按段落对齐，左右 pane 按滚动比例联动；公式/术语保留英文。
- 译文优先读预置缓存；缺失时可由后端模型补全。

### 2.4 检索追踪
- 有后端时 `/api/arxiv` 代理 arXiv API；无后端时回退内置演示条目。
- 推荐打分：与本地库的 token 相关性 + 是否带 GitHub 链接 + 时间新近度。
- 点赞/点踩写入 localStorage，用于调整后续排序。

### 2.5 引用图谱
- 解析参考文献 → 与库内/演示语料标题匹配建边。
- PageRank 迭代求基石节点；入度/年份辅助识别边缘衍生。
- 综述模板只使用节点标题、年份、PageRank 与摘要，不编造事实。
- Future Work：抽取 Future/Limitation 段落 → 聚类 → 在更晚论文中找相似+解决性措辞。

### 2.6 写作与可视化
- 无幻觉框架：只引用库内 paperId，缺证据时输出“证据缺口”。
- 架构图：Mermaid / Graphviz / TikZ / Matplotlib 四种脚本。
- CSV：RFC4180 解析 → 列类型推断 → 自动选图 → SVG + Figure Caption + Matplotlib/LaTeX。

## 3. 数据与存储

IndexedDB（浏览器）：

- `papers`：结构化论文（meta、sections、references、chunks、指纹）
- `files`：原始 PDF ArrayBuffer
- `feedback` / `runs`：推荐反馈与 Agent 轨迹（localStorage/IndexedDB）

后端无状态；密钥只在服务端环境变量。

## 4. 安全与合规

- 仓库不含真实 Key；`.env`、`.env.*` 已忽略。
- 后端 CORS 白名单只允许站点域名（部署时配置）。
- 上传文件只存本机 IndexedDB，不上传服务器。
- 外部网页/PDF 文本按数据处理，不执行其中指令。

## 5. 性能与边界

- PDF 逐页渲染、按需解析；长文档分块入库，不在内存中保留全文渲染。
- 图谱 16–20 节点用 Canvas/SVG，交互流畅。
- 当前解析为启发式，复杂公式/表格/双栏仍可能有误差；生产化可接 GROBID/MinerU。
