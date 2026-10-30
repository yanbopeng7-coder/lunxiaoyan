/**
 * 论小研 · Cloudflare Worker 代理
 * 作用：给 GitHub Pages 静态站提供稳定的 /api/llm 入口，密钥只存在 Worker Secret。
 *
 * 部署（二选一）：
 * 1) 控制台：Workers & Pages → Create Worker → 粘贴本文件 → Settings → Variables
 *    添加 Secret：ZHIPU_API_KEY（或 SILICONFLOW_API_KEY），并设置 LLM_PROVIDER。
 * 2) wrangler：
 *    npm i -g wrangler
 *    wrangler secret put ZHIPU_API_KEY
 *    wrangler deploy worker.js --name lunxiaoyan-api
 *
 * 部署后把 https://<worker>.<subdomain>.workers.dev 写进页面：
 *   <script>window.LX_API_BASE = "https://<worker>.<subdomain>.workers.dev";</script>
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
};

const PROVIDERS = {
  zhipu: {
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    key: 'ZHIPU_API_KEY',
    model: 'glm-4-flash',
  },
  silicon: {
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    key: 'SILICONFLOW_API_KEY',
    model: 'Qwen/Qwen2.5-7B-Instruct',
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'lunxiaoyan-worker', providers: Object.keys(PROVIDERS) });
    }

    if (url.pathname !== '/api/llm') return json({ ok: false, error: 'Not Found' }, 404);
    if (request.method !== 'POST') return json({ ok: false, error: 'Method Not Allowed' }, 405);

    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Invalid JSON' }, 400); }

    const providerName = env.LLM_PROVIDER || (env.SILICONFLOW_API_KEY ? 'silicon' : 'zhipu');
    const provider = PROVIDERS[providerName] || PROVIDERS.zhipu;
    const key = env[provider.key];
    if (!key) return json({ ok: false, error: 'Worker 未配置 ' + provider.key }, 500);

    body.model = body.model || provider.model;
    body.stream = false;

    try {
      const upstream = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify(body),
      });
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
      });
    } catch (e) {
      return json({ ok: false, error: '上游模型请求失败：' + (e.message || e) }, 502);
    }
  },
};
