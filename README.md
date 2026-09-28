# 论小研 · AI 科研论文辅助平台

本科/研究生论文写作辅助网页：评估、大纲、陪练、润色、摘要、国标文献、科研路径、投稿对照、审稿模拟与写作复盘。默认演示模式即可完整体验，配置国内大模型密钥后可切换为在线推理。

## 启动

双击 `启动论小研.bat`（或 `start.bat`）。脚本会自动找到本机 Python、启动服务并打开浏览器：

[http://127.0.0.1:8080](http://127.0.0.1:8080)

**请保持弹出的黑色窗口不要关闭**，关掉后网页会无法访问。再次双击只会打开已有页面，不会重复启动。

首次若缺依赖：

```bash
cd d:\lunxiaoyan
d:\py\Anaconda3\python.exe -m pip install -r requirements.txt
```

未配置 API 时自动走本地演示，首页可一键载入演示用例《计算机专业本科毕业论文初稿.docx》。

## GitHub Pages（给评委直接打开）

GitHub Pages 只能托管静态网页，不能跑 Flask。本仓库已按[官方文档](https://docs.github.com/zh/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)准备两种发布方式：

1. **从分支发布**：Settings → Pages → Build and deployment → Source 选 **Deploy from a branch**，Branch 选 `main`，文件夹选 `/docs`。
2. **GitHub Actions**：同一页 Source 选 **GitHub Actions**，使用仓库里的 `.github/workflows/pages.yml`。

生成 `docs/`：

```bash
d:\py\Anaconda3\python.exe build_pages.py
```

站点地址形如：`https://<你的用户名>.github.io/lunxiaoyan/`

网页版可直接点功能、载入演示用例；docx/pdf 解析仍需本地 `启动论小研.bat`。`.env` 不会上传。

## 可选模型

默认：**智谱清言 4-Flash**。下拉框里每一项都会请求对应的智谱模型编码，互不混用：

- 智谱清言 4-Flash
- 智谱清言 4-Flash-250414
- 智谱清言 4.7-Flash
- 智谱清言 4.5-Flash
- 智谱清言 Z1-Flash

网页版在左侧「网页版密钥」填写一次即可，密钥只存在这台浏览器里。本地 `启动论小研.bat` 读取 `.env` 里的 `ZHIPU_API_KEY`。

将 `.env.example` 复制为 `.env` 后填写对应密钥：

```
ZHIPU_API_KEY=
DEEPSEEK_API_KEY=
DASHSCOPE_API_KEY=
MOONSHOT_API_KEY=
BAIDU_API_KEY=
BAIDU_SECRET_KEY=
SPARK_API_KEY=
```

只配其中一家即可；该厂商模型走在线接口，其余仍回退演示引擎。

## 页面

1. 首页：功能入口、技术栈、数据看板、一键全流程
2. 智能论文助手：写作 / 文献 / 科研指导 + 多轮对话
3. 论文智能评估
4. 个性化文献与大纲
5. 实时写作陪练
6. 初稿润色分析
7. 摘要与关键词
8. 参考文献格式化（演示默认 GB/T 7714-2015 顺序编码制）
9. 科研路径规划
10. 投稿适配优化
11. 多风格审稿人模拟
12. 论文写作复盘

全局支持暗黑模式、模型切换、拖拽上传（docx / pdf / txt）、历史查看 / 复现 / 下载。
