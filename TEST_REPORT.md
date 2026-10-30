# 测试与验证记录

测试日期：2026-10-30
线上地址：https://yanbopeng7-coder.github.io/lunxiaoyan/
测试环境：Windows 11 · Chrome（Playwright）· Python 3.12

## 1. 线上实测

| 用例 | 操作 | 结果 |
|---|---|---|
| 页面加载 | 打开首页 | 200，原版 30+ 页面与 Agent 六个页面均可导航 |
| 文献库 v1/v7 | 文献库 → 一键 Attention v1→v7 测例 | 通过：解析出 v7（16 chunks/7 refs）与 v1（9 chunks/5 refs），浏览器本地完成，无后端依赖 |
| 扫描件 OCR | 文献库 → 扫描件 OCR 测例 | 通过：本地 Tesseract WASM 识别 1 页并入库（1 chunk） |
| 演示视频 | `论小研-科研Agent演示-最终.mp4` | 5:06，1920×1080，中文旁白 + 软字幕 |
| 引用图谱 | 引用图谱 → 载入 16 篇演示语料 | 通过：16 节点 / 20 条边，PageRank 基石节点、综述、Future Work 正常渲染 |
| CSV 可视化 | CSV 数据可视化 → 载入演示 CSV → 生成 | 通过：折线图 + Figure Caption（斜率 0.0608、R²=0.967、峰值 0.864）+ Matplotlib 脚本 |
| 抗幻觉问答 | 选论文 → 带出处回答 | 通过：返回证据段落与来源；无后端时走浏览器检索 |
| 阅读器 | 打开阅读器 | 页面与论文选择器正常；`[n]`/References 与中英对照依赖文献库数据 |
| 检索追踪 | 检索 / 基于本地库推荐 | 有后端时走 arXiv；无后端回退内置演示条目 |
| 在线模型 | 评估/润色等原版工具 | 无 Key 时本地演示；配后端 `/api/llm` 或硅基流动 Key 可在线 |

## 2. 修复记录

| 问题 | 处理 |
|---|---|
| 前端写死临时 Cloudflare 隧道，隧道失效导致文献库为空 | 移除硬编码地址；默认 `PUBLIC_API_BASE=""`，核心功能走浏览器端；需要在线时由 `window.LX_API_BASE` 指定稳定后端 |
| `.env` 被误加入待提交（含真实 Key） | 从提交中移除、加入 `.gitignore`，远端确认 `.env` 404；密钥需轮换 |
| 仓库 rebase 未完成、代码重复 | 已结束 rebase，基于最新树生成干净提交，`agent-ui.js` 单份实现 |
| 智谱浏览器直连 CORS | 静态页不再强制直连；后端 `/api/llm` 代理，或使用支持 CORS 的硅基流动 Key |

## 3. 关键数据

- 演示语料：16 篇 Transformer 谱系论文；图谱 16 节点 / 20 边。
- v7：16 chunks / 7 refs；v1：9 chunks / 5 refs。
- CSV：5 行 5 列，生成 line 图，Caption 含 R²=0.967。
- 静态资源：`docs/static/js/lab/library.js` 13.8 KB，线上 200。

## 4. 已知问题

1. **在线模型依赖后端**：GitHub Pages 无法直连智谱（CORS）。评审期若需要模型生成，必须部署 `deploy/linux` 的后端并配置稳定域名，或在页面设置 `window.LX_API_BASE`。
2. **OCR 仅带英文模型**：本地 Tesseract 资源已随 `static/ocr` 发布，中文扫描件需追加 `chi_sim.traineddata`。
3. **解析深度有限**：标题树/参考文献为启发式抽取，复杂双栏、公式、表格可能漏检；生产化建议接 GROBID/MinerU。
4. **长文档**：541 页教材未随仓库分发，分块/分级加载逻辑已具备但未做端到端压测。

## 5. 复现步骤

```bash
cd lunxiaoyan
python -m http.server 8080
# 打开 http://127.0.0.1:8080/docs/
# 文献库 → 一键 Attention v1→v7 测例
# 引用图谱 → 载入 16 篇演示语料
# CSV 数据可视化 → 载入演示 CSV → 生成
```

后端（可选）：

```bash
cp .env.example .env   # 填 Key
pip install -r requirements.txt
python app.py
```
