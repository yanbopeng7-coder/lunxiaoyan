# 论小研 · 科研助手 Agent

面向科研全流程的静态优先 Agent：**PDF 解析与语义去重 → 带出处问答 → 双语阅读 → 检索追踪 → 引用图谱 → 写作与数据可视化**，同时保留原版 30+ 论文写作工具。

- 在线演示：https://yanbopeng7-coder.github.io/lunxiaoyan/
- 仓库：https://github.com/yanbopeng7-coder/lunxiaoyan
- 运行形态：GitHub Pages 纯静态 + 可选 Flask 后端（本地或 Linux 服务器，用于在线模型与 arXiv API）

> 默认不内置任何 API Key。核心六个模块可在浏览器内离线跑通；在线模型为可选增强。

## 一、功能模块

| 模块 | 能力 | 主要实现 |
|---|---|---|
| 意图编排中枢 | Task Planning、多工具调用、思考日志、计划/执行分离 | `docs/static/js/lab/agent.js`、`agent-ui.js` |
| 文献库解析 | 批量 PDF 上传、SimHash 语义去重、v1/v7 版本提示、标题树/摘要/参考文献、Tesseract OCR、长文档分级加载 | `lab/library.js`、`static/vendor/pdf.min.js`、`assets/ocr` |
| 抗幻觉问答 | BM25 稀疏检索、原文页/节锚点、证据不足拒答、多文对比 | `lab/rag.js` |
| 沉浸阅读翻译 | 标题树导航、`[n]` ↔ References 双向跳转、中英对照、联动滚动 | `lab/reader.js` |
| 检索追踪推荐 | arXiv 检索、参考文献下钻、GitHub 复现性优先、按本地库相关性排序 | `lab/retrieve.js`、Flask `/api/arxiv`（可选） |
| 引用图谱综述 | PageRank 基石节点、边缘衍生识别、自动综述、Future Work 去旧提新 | `lab/graph.js` |
| 写作与可视化 | 无幻觉论文框架、Mermaid/Graphviz/TikZ/Matplotlib 架构图、CSV 图表 + Figure Caption | `lab/writing.js`、`copilot-ui.js` |

## 二、快速开始

### 1. 纯静态（推荐评审直接打开）

```bash
cd lunxiaoyan
python -m http.server 8080
# http://127.0.0.1:8080/docs/
```

无需安装依赖、无需密钥。文献库的 v1/v7 去重、RAG、阅读器、图谱、CSV 图表均在浏览器本地运行。

### 2. 本地 Flask（需要在线模型时）

```bash
cp .env.example .env
# 填入 ZHIPU_API_KEY / SILICONFLOW_API_KEY（.env 已被 .gitignore 忽略）
pip install -r requirements.txt
python app.py
# http://127.0.0.1:8080
```

Flask 提供 `/api/llm`（服务端持钥，避免浏览器 CORS）和 `/api/arxiv`。静态页需要在线能力时，可在 `docs/index.html` 里设置：

```html
<script>window.LX_API_BASE = "https://你的后端域名";</script>
```

不设置则自动使用本地演示/浏览器端能力，不会发无效请求。

### 3. Linux 服务器（评审期稳定在线）

见 [`deploy/linux/README.md`](deploy/linux/README.md)。要点：

- Flask 用 systemd 常驻，密钥只放服务器 `.env`
- 公网地址必须稳定：学校固定域名 + Nginx 反代，或 Cloudflare **Named Tunnel**
- 不要把临时 `trycloudflare.com` 地址写进前端，隧道重启后会失效

## 三、目录

```
├─ app.py / engine.py / extras.py   Flask 后端与写作工具引擎
├─ templates/ static/               原版工作台源码
├─ docs/                            GitHub Pages 发布目录
│  └─ static/js/lab/                Agent 算法模块（浏览器端）
├─ deploy/linux/                    systemd、启动脚本、部署说明
├─ 论小研-科研Agent演示.mp4          演示视频（提交前替换为最终版）
└─ requirements.txt / .env.example
```

## 四、测试用例

| 用例 | 入口 |
|---|---|
| v7 先入库、v1 后上传 → 语义去重 + 版本提示 | 文献库 → 一键 Attention v1→v7 测例 |
| 扫描件 OCR | 文献库 → 扫描件 OCR 测例 |
| 长文档分级加载 | 文献库 → PDF 长文档分级加载测例 |
| 单篇/多篇 RAG 问答 | 抗幻觉问答 |
| 引用双向跳转 / 中英对照 | 沉浸阅读翻译 |
| 16 篇局域图谱 + PageRank + 综述 | 引用图谱综述 → 载入 16 篇演示语料 |
| CSV → 图表 + Caption + Matplotlib | CSV 数据可视化 → 载入演示 CSV |
| 架构图脚本 | 架构拓扑图 → 生成 |

详细实测记录见 [`TEST_REPORT.md`](TEST_REPORT.md)，评分对照见 [`RUBRIC.md`](RUBRIC.md)，架构说明见 [`ARCHITECTURE.md`](ARCHITECTURE.md)，演示脚本见 [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)。

## 五、环境变量

复制 `.env.example` 为 `.env`，只在本机/服务器填写：

```
ZHIPU_API_KEY=
SILICONFLOW_API_KEY=
GROQ_API_KEY=
```

**任何真实 Key 都不得提交到公开仓库。** `.env` 已加入 `.gitignore`；如果曾经提交过，请轮换密钥并清理 Git 历史。

## 六、已知边界

- 智谱接口不允许浏览器直连（CORS），静态页的在线智谱调用需要后端代理；硅基流动等支持 CORS 的接口可由用户自备 Key 直连。
- OCR 默认只带英文 `eng.traineddata`；中文扫描件需追加 `chi_sim` 语言包。
- arXiv 实时检索依赖后端 `/api/arxiv`；没有后端时回退内置演示条目。
- 原版 30+ 写作工具保持不变，Agent 模块为新增页面。

## 七、团队信息

- 参赛组别：`（填写）`
- 成员：`（填写）`
- 学校：`（填写）`
- 联系方式：`（填写）`
