(function () {
  "use strict";
  window.LX_SCENE = "writing";
  window.LX_STYLE = "gentle";
  var files = {};
  var last = {};
  var chat = [];

  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    setTimeout(function () { el.style.display = "none"; }, 2400);
  }
  function loading(on, text) {
    var ov = $("overlay");
    if (!ov) return;
    ov.classList.toggle("show", !!on);
    if ($("overlayText")) $("overlayText").textContent = text || "生成中…";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function modelId() {
    var s = $("modelSelect");
    return (s && s.value) || "glm-4-flash";
  }
  function isStaticHost() {
    var h = location.hostname || "";
    return location.protocol === "file:" || /github\.io$/i.test(h);
  }
  var LIVE_MODELS = {
    "glm-4-flash": { api: "glm-4-flash", thinking: false, provider: "zhipu" },
    "glm-4-flash-250414": { api: "glm-4-flash-250414", thinking: false, provider: "zhipu" },
    "glm-4.7-flash": { api: "glm-4.7-flash", thinking: true, provider: "zhipu" },
    "glm-4.5-flash": { api: "glm-4.5-flash", thinking: true, provider: "zhipu" },
    "glm-z1-flash": { api: "glm-z1-flash", thinking: true, provider: "zhipu" },
    "qwen25-7b": { api: "Qwen/Qwen2.5-7B-Instruct", thinking: false, provider: "silicon" },
    "qwen35-4b": { api: "Qwen/Qwen3.5-4B", thinking: true, provider: "silicon" }
  };
  var LIVE_URLS = {
    zhipu: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    silicon: "https://api.siliconflow.cn/v1/chat/completions"
  };
  function zhipuKey() {
    var box = $("zhipuKey");
    return ((box && box.value) || localStorage.getItem("lx.zhipu") || "").trim();
  }
  function siliconKey() {
    var box = $("siliconKey");
    return ((box && box.value) || localStorage.getItem("lx.silicon") || "").trim();
  }
  function currentSpec() {
    return LIVE_MODELS[modelId()] || LIVE_MODELS["glm-4-flash"];
  }
  function keyFor(spec) {
    return spec.provider === "silicon" ? siliconKey() : zhipuKey();
  }
  function stripThink(text) {
    return String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }
  function callLive(action, extra, text, filename) {
    var spec = currentSpec();
    var body = {
      model: spec.api,
      temperature: 0.4,
      max_tokens: 2048,
      messages: [
        { role: "system", content: "你是论小研，面向本科生与研究生的科研论文写作助手。用中文给出可执行的结果，紧扣用户原文，不要空泛套话。" },
        { role: "user", content: "功能：" + action + "\n文件：" + (filename || "") + "\n附加：" + JSON.stringify(extra || {}) + "\n正文：\n" + (text || "") }
      ]
    };
    if (spec.thinking && spec.provider === "zhipu") body.thinking = { type: "disabled" };
    if (spec.thinking && spec.provider === "silicon") body.enable_thinking = false;
    return fetch(LIVE_URLS[spec.provider], {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + keyFor(spec),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); }).then(function (pack) {
      if (!pack.ok) {
        var err = (pack.data && pack.data.error && pack.data.error.message) || "模型请求失败";
        throw new Error(err);
      }
      var msg = pack.data.choices[0].message || {};
      var content = stripThink(msg.content || "");
      var name = ($("modelSelect") && $("modelSelect").options[$("modelSelect").selectedIndex].text) || spec.api;
      if (action === "chat") {
        return { ok: true, demo: false, mode: "online", model: name, reply: content };
      }
      return { ok: true, demo: false, mode: "online", model: name, llm_text: content, sections: [{ title: "模型输出", pre: content }] };
    });
  }
  function localResult(action, extra, text, filename) {
    if (typeof window.LX_LOCAL_RUN === "function") {
      return window.LX_LOCAL_RUN(action, extra, text, filename);
    }
    return { ok: true, reply: "已生成。", sections: [{ title: "结果", p: "已生成。" }] };
  }
  function api(action, extra, text, filename) {
    loading(true);
    if (isStaticHost()) {
      var spec = currentSpec();
      if (!keyFor(spec)) {
        loading(false);
        toast(spec.provider === "silicon" ? "通义千问要填硅基流动密钥" : "先在左侧填写智谱密钥，才会请求对应模型");
        return Promise.resolve(localResult(action, extra, text, filename));
      }
      return callLive(action, extra, text, filename).then(function (d) {
        loading(false);
        return d;
      }).catch(function (e) {
        loading(false);
        toast(e.message || "模型请求失败");
        throw e;
      });
    }
    return fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: action,
        model: modelId(),
        text: text || "",
        filename: filename || "",
        extra: extra || {}
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      loading(false);
      if (!d || d.ok === false) throw new Error((d && d.error) || "失败");
      return d;
    }).catch(function () {
      loading(false);
      return localResult(action, extra, text, filename);
    });
  }
  function fileOf(key) { return files[key] || {}; }

  window.loadDemo = function (key) {
    function apply(d) {
      files[key] = { name: d.filename, text: d.text };
      var lab = $(key + "FileLabel") || $("pipeFileLabel");
      if (lab) lab.textContent = "来源文件：" + d.filename;
      toast("已载入演示用例《" + d.filename + "》");
      return d;
    }
    if (isStaticHost() && window.LX_DEMO) return Promise.resolve(apply(window.LX_DEMO));
    return fetch("/api/demo-thesis").then(function (r) { return r.json(); }).then(apply).catch(function () {
      return apply(window.LX_DEMO || { filename: "演示文稿.txt", text: "演示文稿" });
    });
  };

  function sectionsHtml(d) {
    if (!d) return "";
    if (d.reply) return "<p>" + esc(d.reply) + "</p>";
    var html = "";
    if (d.score != null) html += "<h3>综合评分 " + esc(d.score) + (d.overlap != null ? " · 规范重合度 " + esc(d.overlap) + "%" : "") + "</h3>";
    if (d.summary) html += "<p>" + esc(d.summary) + "</p>";
    if (d.strengths) html += "优点<ul>" + d.strengths.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.weaknesses) html += "不足<ul>" + d.weaknesses.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.suggestions) html += "建议<ul>" + d.suggestions.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.chapters) html += "<h4>章节大纲</h4><ul>" + d.chapters.map(function (c) { return "<li><b>" + esc(c.title) + "</b> " + esc(c.points) + "</li>"; }).join("") + "</ul>";
    if (d.papers) html += "<h4>核心文献</h4><ul>" + d.papers.map(function (p) { return "<li>" + esc(p.title) + " · " + esc(p.meta) + "</li>"; }).join("") + "</ul>";
    if (d.questions && d.questions[0] && d.questions[0].q) {
      html += "<h4>研究问题</h4><ul>" + d.questions.map(function (q) { return "<li>" + esc(q.q) + "</li>"; }).join("") + "</ul>";
    } else if (d.questions && typeof d.questions[0] === "string") {
      html += "<h4>问题</h4><ul>" + d.questions.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul>";
    }
    if (d.prompt) html += "<p><b>引导题</b> " + esc(d.prompt) + "</p>";
    if (d.reference) html += "<h4>参考表述</h4><p>" + esc(d.reference) + "</p>";
    if (d.rewrite) html += "<h4>改写建议</h4><p>" + esc(d.rewrite) + "</p>";
    if (d.zh) html += "<h4>中文摘要</h4><p>" + esc(d.zh) + "</p><h4>英文摘要</h4><p>" + esc(d.en) + "</p><p>" + esc((d.keywords_zh || []).join("；")) + "</p>";
    if (d.formatted) html += "<div class='pre' id='refsText'>" + esc(d.formatted) + "</div>";
    if (d.logic) html += "<p>" + esc(d.logic) + "</p>";
    if (d.highlights) html += "<ul>" + d.highlights.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.directions) html += "<ul>" + d.directions.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.examples) {
      html += d.examples.map(function (e) {
        return "<div class='example'><div><b>原文</b><br>" + esc(e.before) + "</div><div><b>改写</b><br>" + esc(e.after) + "</div></div>";
      }).join("");
    }
    if (d.short) html += "<ul>" + d.short.map(function (x) { return "<li><b>" + esc(x.week) + "</b> " + esc(x.item) + "</li>"; }).join("") + "</ul>";
    if (d.mid) html += "<ul>" + d.mid.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.format) html += "<h4>格式</h4><ul>" + d.format.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.focus) html += "<h4>侧重</h4><ul>" + d.focus.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.structure) html += "<h4>结构</h4><ul>" + d.structure.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.overall) html += "<p>" + esc(d.overall) + "</p>";
    if (d.comments) html += "<ul>" + d.comments.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.progress) html += "<h4>进步点</h4><ul>" + d.progress.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.remain) html += "<h4>遗留问题</h4><ul>" + d.remain.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (d.priority) html += "<ul>" + d.priority.map(function (x) { return "<li>" + esc(x.level) + " " + esc(x.item) + "</li>"; }).join("") + "</ul>";
    if (d.evaluate) html += "<h3>评估</h3>" + sectionsHtml(d.evaluate);
    if (d.outline) html += "<h3>大纲</h3>" + sectionsHtml(d.outline);
    if (d.polish) html += "<h3>润色</h3>" + sectionsHtml(d.polish);
    if (d.refs) html += "<h3>文献</h3>" + sectionsHtml(d.refs);
    if (d.sections) {
      d.sections.forEach(function (s) {
        html += "<h4>" + esc(s.title || "") + "</h4>";
        if (s.p) html += "<p>" + esc(s.p) + "</p>";
        if (s.pre) html += "<div class='pre'>" + esc(s.pre) + "</div>";
        if (s.items) html += "<ul>" + s.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
        if (s.pairs) {
          html += s.pairs.map(function (e) {
            return "<div class='example'><div><b>原文</b><br>" + esc(e.before) + "</div><div><b>改写</b><br>" + esc(e.after) + "</div></div>";
          }).join("");
        }
      });
    }
    if (d.llm_text && !html) html = "<div class='pre'>" + esc(d.llm_text) + "</div>";
    return html || "<p>已生成。</p>";
  }

  function extraOf(key) {
    var extra = { scene: window.LX_SCENE, style: window.LX_STYLE || "gentle" };
    if (key === "outline" && $("outlineTopic")) extra.topic = $("outlineTopic").value;
    if (key === "abstract" && $("absReq")) extra.requirement = $("absReq").value;
    if (key === "refs" && $("refStd")) extra.standard = $("refStd").value;
    if (key === "path") {
      extra.major = $("pathMajor") && $("pathMajor").value;
      extra.skills = $("pathSkills") && $("pathSkills").value;
      extra.interest = $("pathInterest") && $("pathInterest").value;
    }
    if (key === "submit" && $("subGuide")) extra.guide = $("subGuide").value;
    if (key === "topic" && $("topicName")) extra.topic = $("topicName").value;
    if (key === "proposal" && $("propTopic")) extra.topic = $("propTopic").value;
    if (key === "expand" && $("expandChap")) extra.chapter = $("expandChap").value;
    if (key === "rewrite" && $("rewriteSrc")) extra.src = $("rewriteSrc").value;
    if (key === "translate" && $("transSrc")) extra.src = $("transSrc").value;
    if (key === "coach" && $("coachAns")) extra.answer = $("coachAns").value;
    if (key === "reviewer") extra.style = window.LX_STYLE || "gentle";
    return extra;
  }
  function textOf(key) {
    if (key === "refs" && $("refRaw") && $("refRaw").value) return $("refRaw").value;
    if (key === "rewrite" && $("rewriteSrc") && $("rewriteSrc").value) return $("rewriteSrc").value;
    if (key === "translate" && $("transSrc") && $("transSrc").value) return $("transSrc").value;
    if (key === "rebuttal" && $("rebRaw") && $("rebRaw").value) return $("rebRaw").value;
    if (key === "weekly" && $("weekNote") && $("weekNote").value) return $("weekNote").value;
    if (key === "diff" && $("diffNote") && $("diffNote").value) return $("diffNote").value;
    if (key === "coach" && $("coachAns") && $("coachAns").value) return $("coachAns").value;
    return (fileOf(key).text) || "";
  }

  window.runTool = function (key) {
    var f = fileOf(key);
    var text = textOf(key);
    var need = { evaluate: 1, polish: 1, abstract: 1, submit: 1, reviewer: 1 };
    var start = function () {
      return api(key, extraOf(key), textOf(key), fileOf(key).name).then(function (d) {
        last[key] = d;
        var box = $(key + "Out");
        if (box) box.innerHTML = sectionsHtml(d);
        toast("已生成");
      });
    };
    if (need[key] && !text && !(f && f.text)) {
      return window.loadDemo(key).then(function () { text = textOf(key); return start(); });
    }
    return start();
  };

  window.runPipe = function () {
    var go = function () {
      api("pipeline", {}, fileOf("pipeline").text, fileOf("pipeline").name).then(function (d) {
        last.pipeline = d;
        $("pipeResult").innerHTML = "<div class='card report'>" + sectionsHtml(d) + "</div>";
      });
    };
    if (!(fileOf("pipeline").text)) window.loadDemo("pipeline").then(go);
    else go();
  };

  window.ask = function (q) { sendChat(q); };
  function drawChat() {
    var log = $("chatLog");
    if (!log) return;
    log.innerHTML = chat.map(function (m) {
      return "<div class='bubble " + m.role + "'>" + esc(m.content) + "</div>";
    }).join("") || "<p style='color:var(--muted)'>还没有对话。</p>";
    log.scrollTop = log.scrollHeight;
  }
  window.sendChat = function (preset) {
    var input = $("chatInput");
    var q = preset || (input && input.value.trim());
    if (!q) return;
    if (input && !preset) input.value = "";
    chat.push({ role: "user", content: q });
    drawChat();
    api("chat", { scene: window.LX_SCENE || "writing", question: q }, "", "").then(function (d) {
      chat.push({ role: "bot", content: d.reply || d.llm_text || "已回复" });
      drawChat();
    });
  };
  window.exportChat = function () {
    var t = chat.map(function (m) { return (m.role === "user" ? "我：" : "论小研：") + m.content; }).join("\n\n");
    if (!t) { toast("暂无对话"); return; }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
    a.download = "论小研-对话记录.txt";
    a.click();
  };
  window.copyOut = function (key) {
    var d = last[key];
    var t = (d && d.formatted) || "";
    if (!t) { toast("暂无内容"); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast("已复制"); });
  };

  function bindDrops() {
    var zones = document.querySelectorAll(".drop");
    for (var i = 0; i < zones.length; i++) {
      (function (zone) {
        var input = zone.querySelector("input[type=file]");
        if (!input) return;
        var key = zone.getAttribute("data-key") || (zone.id === "pipeDrop" ? "pipeline" : "file");
        function handle(file) {
          if (!file) return;
          var fd = new FormData();
          fd.append("file", file);
          loading(true, "解析文档…");
          var finish = function (name, text) {
            loading(false);
            files[key] = { name: name, text: text };
            var lab = $(key + "FileLabel") || zone.parentNode.querySelector(".filelab");
            if (lab) lab.textContent = "来源文件：" + name;
            toast("已解析：" + name);
          };
          if (isStaticHost() || !file.name) {
            if (!window.LX_READ_FILE) {
              loading(false);
              toast("文档解析组件未加载");
              return;
            }
            window.LX_READ_FILE(file).then(function (t) {
              if (!String(t || "").trim()) throw new Error("文档里没有可提取的文字");
              finish(file.name, t);
            }).catch(function (e) {
              loading(false);
              toast(e.message || "解析失败");
            });
            return;
          }
          fetch("/api/parse", { method: "POST", body: fd }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d.ok) throw new Error(d.error || "解析失败");
            finish(d.filename, d.text);
          }).catch(function (e) {
            loading(false);
            toast(e.message || "解析失败");
          });
        }
        zone.addEventListener("click", function (e) {
          if (e.target.tagName === "BUTTON") return;
          input.click();
        });
        input.addEventListener("change", function () { handle(input.files[0]); });
        zone.addEventListener("dragover", function (e) { e.preventDefault(); });
        zone.addEventListener("drop", function (e) { e.preventDefault(); handle(e.dataTransfer.files[0]); });
      })(zones[i]);
    }
  }

  bindDrops();
  if (typeof setScene === "function") setScene("writing");
  function bindKey(id, storageKey, filled, cleared) {
    var box = $(id);
    if (!box) return;
    box.value = localStorage.getItem(storageKey) || "";
    box.addEventListener("change", function () {
      localStorage.setItem(storageKey, box.value.trim());
      toast(box.value.trim() ? filled : cleared);
    });
  }
  bindKey("zhipuKey", "lx.zhipu", "智谱密钥已保存在这台浏览器", "已清除智谱密钥");
  bindKey("siliconKey", "lx.silicon", "硅基流动密钥已保存在这台浏览器", "已清除硅基流动密钥");
  var sel = $("modelSelect");
  if (sel) {
    sel.addEventListener("change", function () {
      var name = sel.options[sel.selectedIndex].text;
      if ($("modelOk")) $("modelOk").textContent = "已切换到：" + name;
      if ($("speedBadge")) $("speedBadge").textContent = "当前模型：" + name;
    });
  }
  var dark = $("darkBox");
  if (dark) {
    dark.checked = localStorage.getItem("lx.theme") === "dark";
    document.documentElement.setAttribute("data-theme", dark.checked ? "dark" : "light");
    dark.addEventListener("change", function () {
      var mode = dark.checked ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", mode);
      localStorage.setItem("lx.theme", mode);
    });
  }
  var hash = (location.hash || "").replace("#", "");
  if (hash && typeof go === "function") go(hash);
  var inp = $("chatInput");
  if (inp) inp.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); sendChat(); }
  });
})();
