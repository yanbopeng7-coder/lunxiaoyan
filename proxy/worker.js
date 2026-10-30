/**
 * 论小研 · Cloudflare Worker
 * - 密钥只放在 Worker Secret（ZHIPU_API_KEY），不进公开仓库
 * - 给 GitHub Pages 提供 /api/run 与 /api/llm，解决智谱 CORS
 */
const ALLOW_ORIGIN = "https://yanbopeng7-coder.github.io";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow =
    origin === ALLOW_ORIGIN ||
    /\.github\.io$/i.test(origin.replace(/^https?:\/\//, "").split("/")[0]) ||
    origin === "null";
  return {
    "Access-Control-Allow-Origin": allow ? origin || ALLOW_ORIGIN : ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function clip(text, n) {
  const s = String(text || "");
  return s.length <= n ? s : s.slice(0, n) + "\n…（原文已截断）";
}

function buildPrompt(action, body) {
  const text = body.text || "";
  const filename = body.filename || "";
  const extra = body.extra || {};
  const q = extra.question || text || "";
  if (action === "chat") {
    const paper = text
      ? `\n已上传论文《${filename || "文稿"}》。回答必须紧扣正文：\n${clip(text, 2200)}\n`
      : "";
    return `请直接回答。给出具体写法或修改意见。${paper}\n用户：${q}`;
  }
  if (action === "pipeline") {
    return `快速全流程短报告（600字内）：综合分、3条优点、3条不足、3条可执行修改、大纲一句、文献风险一句。文件：${filename}\n正文摘录：\n${clip(text, 2200)}`;
  }
  if (action === "evaluate") return `请简洁评估论文：\n文件：${filename}\n${clip(text, 2800)}`;
  if (action === "outline") return `按主题生成简洁大纲与研究问题。主题：${extra.topic || ""}\n${clip(text, 2200)}`;
  if (action === "refs") {
    return `按 GB/T 7714—2025 顺序编码制整理参考文献，简洁输出。\n${clip(text, 2500)}`;
  }
  return `请完成功能「${action}」，只输出结果。文件：${filename}\n${clip(text, 2200)}`;
}

async function callZhipu(env, messages, model) {
  const key = env.ZHIPU_API_KEY;
  if (!key) throw new Error("ZHIPU_API_KEY not configured on Worker");
  const upstream = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "glm-4-flash",
      temperature: 0.3,
      max_tokens: 700,
      messages,
    }),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const msg = (data && data.error && data.error.message) || "zhipu failed";
    throw new Error(msg);
  }
  const content = (((data.choices || [])[0] || {}).message || {}).content || "";
  return String(content).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    const json = (obj, status) =>
      new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && (path === "/" || path === "/api/health")) {
      return json({
        ok: true,
        service: "lunxiaoyan-worker",
        demo: !env.ZHIPU_API_KEY,
        providers: { zhipu: !!env.ZHIPU_API_KEY },
      });
    }

    if (request.method !== "POST") {
      return json({ ok: true, service: "lunxiaoyan-worker" });
    }

    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "invalid json" }, 400);
    }

    // OpenAI 兼容代理（浏览器 callLive）
    if (path === "/api/llm" || path.endsWith("/chat/completions")) {
      try {
        const key = env.ZHIPU_API_KEY;
        if (!key) return json({ error: { message: "missing server key" } }, 401);
        const upstream = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const text = await upstream.text();
        return new Response(text, {
          status: upstream.status,
          headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
        });
      } catch (e) {
        return json({ error: { message: String(e.message || e) } }, 502);
      }
    }

    // 论小研 /api/run（Pages 主路径）
    if (path === "/api/run" || path === "/") {
      const action = body.action || "chat";
      const model = body.model || "glm-4-flash";
      const sys =
        "你是论小研，面向本科生与研究生的科研论文写作助手。用中文给出可执行、简洁的结果，不要空泛套话。";
      try {
        const content = await callZhipu(
          env,
          [
            { role: "system", content: sys },
            { role: "user", content: buildPrompt(action, body) },
          ],
          model
        );
        const out = {
          ok: true,
          demo: false,
          mode: "online",
          model: model,
          action: action,
          llm_text: content,
          sections: [{ title: "模型输出", pre: content }],
        };
        if (action === "chat") out.reply = content;
        return json(out);
      } catch (e) {
        return json({ ok: false, error: String(e.message || e), demo: true }, 502);
      }
    }

    return json({ ok: false, error: "not found" }, 404);
  },
};
