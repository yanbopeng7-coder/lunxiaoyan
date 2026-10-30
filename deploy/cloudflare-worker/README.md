# Cloudflare Worker 代理（推荐用于 GitHub Pages 在线模型）

## 为什么需要

GitHub Pages 是纯静态托管，浏览器直连智谱会被 CORS 拦截；把 Key 放进前端又会泄露。Worker 相当于一个免费的稳定中转：

```
浏览器 → Worker /api/llm → 智谱/硅基流动（Key 在 Worker Secret）
```

## 部署

1. 安装并登录 wrangler：

```bash
npm i -g wrangler
wrangler login
```

2. 在 `deploy/cloudflare-worker/` 下执行：

```bash
wrangler deploy worker.js --name lunxiaoyan-api
wrangler secret put ZHIPU_API_KEY        # 粘贴智谱 Key
# 如用硅基流动：
# wrangler secret put SILICONFLOW_API_KEY
# 并设置 LLM_PROVIDER=silicon（可在控制台 Variables 添加）
```

3. 记下输出地址，例如：

```
https://lunxiaoyan-api.your-name.workers.dev
```

4. 在 `docs/index.html` 的 `<head>` 里加入：

```html
<script>window.LX_API_BASE = "https://lunxiaoyan-api.your-name.workers.dev";</script>
```

5. 重新构建/推送 `docs/`，页面的在线模型会走 Worker；不设置则保持本地演示。

## 验证

```bash
curl https://lunxiaoyan-api.your-name.workers.dev/api/health
# {"ok":true,...}
```

## 注意

- 不要把 Key 写进 `worker.js` 或仓库，只用 `wrangler secret`。
- 建议在 Cloudflare 控制台给 Worker 加访问频率限制，避免额度被刷。
- 免费额度对评审演示足够；如访问量大，换 Named Tunnel + 自有服务器。
