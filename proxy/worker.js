/**
 * 论小研 · GitHub Pages CORS 代理
 * 浏览器从 github.io 无法直连 open.bigmodel.cn，由此 Worker 转发并补 CORS。
 *
 * 部署：npx wrangler deploy
 * 密钥：npx wrangler secret put ZHIPU_API_KEY
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const allow =
      /yanbopeng7-coder\.github\.io$/i.test(String(origin).replace(/^https?:\/\//, "").split("/")[0]) ||
      origin === "null" ||
      origin === "*";
    const cors = {
      "Access-Control-Allow-Origin": allow ? (origin === "null" ? "*" : origin) : "https://yanbopeng7-coder.github.io",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: true, service: "lunxiaoyan-proxy" }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
    const key =
      env.ZHIPU_API_KEY ||
      (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!key) {
      return new Response(JSON.stringify({ error: { message: "missing api key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
    const upstream = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: await request.text(),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
    });
  },
};
