(function (w) {
  "use strict";
  w.LX_DEMO = {
    filename: "计算机专业本科毕业论文初稿.docx",
    text:
      "题目：基于深度学习的校园行人检测与轨迹分析系统\n\n" +
      "摘要：随着智慧校园建设推进，传统监控依赖人工值守，漏检率高。本文设计并实现了一套基于 YOLOv8 的校园行人检测与轨迹分析系统，结合 ByteTrack 完成多目标跟踪，并在自建校园数据集上验证。实验表明，模型 mAP@0.5 达到 86.4%，较基线提升 4.7 个百分点。但摘要对创新点、实验设置与局限交代不足，讨论部分偏描述性。\n\n" +
      "关键词：行人检测；YOLOv8；多目标跟踪；智慧校园\n\n" +
      "1 绪论\n校园安防与人流管理对实时行人感知提出需求。现有方案多直接套用通用检测器，对遮挡、逆光、小目标适应性不足。本文研究目标是构建面向校园场景的检测-跟踪-分析流水线。\n"
  };

  function modelName() {
    var s = document.getElementById("modelSelect");
    return (s && s.options[s.selectedIndex] && s.options[s.selectedIndex].text) || "智谱清言 4-Flash（最快，推荐）";
  }
  function clip(s, n) {
    s = s || "";
    n = n || 80;
    s = s.replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n) + "…" : s;
  }
  function guessTopic(text, filename, extra) {
    if (extra && extra.topic) return extra.topic;
    var t = (text || "").trim();
    var m = t.match(/题目[:：]\s*(.+)/);
    if (m) return m[1].split(/[\n。]/)[0];
    if (t) return clip(t, 36);
    if (filename) return filename.replace(/\.[^.]+$/, "");
    return "待定研究题目";
  }
  function pack(sections, more) {
    var d = { ok: true, demo: true, mode: "offline", source: "offline", model: "", sections: sections || [] };
    if (more) {
      for (var k in more) d[k] = more[k];
    }
    return d;
  }
  function rewrite(src) {
    var raw = (src || "").trim();
    if (!raw) {
      raw = "随着人工智能的飞速发展，深度学习在计算机视觉领域取得了广泛应用。本文提出一种基于 YOLO 的行人检测方法，具有较好的检测效果。";
    }
    var after = raw
      .replace(/从笔者目前所搜集的资料来看，?/g, "既有研究显示，")
      .replace(/从目前搜集的资料来看，?/g, "既有研究显示，")
      .replace(/也就是说，?/g, "")
      .replace(/整体来看，?/g, "")
      .replace(/总的来说，?/g, "")
      .replace(/近年来受到了国内外学者的广泛关注。?/g, "")
      .replace(/随着人工智能的飞速发展，/g, "")
      .replace(/随着社会的不断发展，/g, "")
      .replace(/具有较好的检测效果/g, "效果需用具体指标报告")
      .replace(/具有一定的实际意义/g, "其价值应落到可验证的问题上")
      .replace(/本文提出一种/g, "本文针对该问题给出")
      .replace(/笔者/g, "已有文献")
      .replace(/，{2,}/g, "，")
      .replace(/。{2,}/g, "。")
      .trim();
    if (after && after !== raw && after.slice(-1) !== "。") after += "。";
    var items = [];
    if (/也就是说|整体来看/.test(raw)) items.push("「也就是说／整体来看」是口语衔接，学术段应直接给判断。");
    if (/搜集的资料|笔者/.test(raw)) items.push("「从笔者搜集的资料来看」可改为「既有研究」并补出处。");
    if (/广泛关注|飞速发展/.test(raw)) items.push("空泛背景句可删，不影响原意。");
    if (!items.length) items = ["空泛背景句可删，不影响原意。", "段首给出判断，材料放在后面。"];
    return pack([
      { title: "改写对照", pairs: [{ before: raw, after: after || raw }] },
      { title: "修改建议", items: items }
    ]);
  }

  w.LX_LOCAL_RUN = function (action, extra, text, filename) {
    extra = extra || {};
    text = text || "";
    var topic = guessTopic(text, filename, extra);
    var src = extra.src || text;
    var q = extra.question || text;

    if (action === "chat") {
      var reply = "【离线推断】围绕「" + (q || "论文写作") + "」。\n"
        + "先给读者一句能带走的判断，再展开段落。每段只放一个主张，主张后面必须跟文献、数据或实验，不要用「意义重大」收尾。\n"
        + "若题目是校园行人检测：问题是遮挡、逆光和小目标；方法是 YOLOv8 检测加 ByteTrack 跟踪；文稿里已经写出的指标是 mAP@0.5 = 86.4%，较基线高 4.7 个百分点。讨论里还缺消融、失败案例和隐私说明。\n"
        + "建议结构：绪论写清约束，相关工作按检测器和跟踪器两条线对比，方法写输入输出，实验放对照表，总结只写做得到和做不到的事。";
      if (/大纲/.test(q)) reply = "【离线推断】本科论文五章，每章开头用一句话写「本章要回答的问题」。\n1 绪论：校园监控漏检发生在什么条件下。\n2 相关工作：检测器与多目标跟踪分开写，最后一句点出本文不解决什么。\n3 方法：YOLOv8 输出框，ByteTrack 接轨迹，分析模块只消费轨迹。\n4 实验：对照表、消融、失败案例分布，跟踪另报 IDF1 或 IDS。\n5 总结：86.4% 只说明检测，不代替跟踪和隐私论证。";
      if (/摘要/.test(q)) reply = "【离线推断】摘要五句，都用文稿里已有的事实。\n问题：校园监控依赖人工值守，遮挡和逆光下漏检。\n方法：YOLOv8 检测，ByteTrack 跟踪，自建校园数据验证。\n指标：mAP@0.5 为 86.4%，较基线提升 4.7 个百分点。\n局限：摘要尚未写清创新点对应哪张表，讨论偏描述。\n不要写「意义重大」。";
      if (/文献/.test(q)) reply = "【离线推断】文献按技术线，不按年份堆。\n检测线：从通用检测器写到校园场景失效（遮挡、小目标、逆光）。\n跟踪线：从检测框如何变成轨迹写到 ID 切换。\n每组用四句收束：共识、分歧、空白、本文位置。本文位置只能写「检测与跟踪串成流水线」，不能写成新的网络结构，除非实验表里真有这项对照。";
      if (/答辩/.test(q)) reply = "【离线推断】答辩准备四组，每组约 40 秒。\n创新点：对应 mAP 提升 4.7 个点的那次改动，说不清就承认是系统集成。\n对照：基线是谁、数据是否同一划分。\n失败：逆光、拥挤、出画面再进入时轨迹断在哪里。\n隐私与工作量：镜头范围、是否存原图、标注和训练各花了多少天。";
      return { ok: true, demo: true, mode: "offline", source: "offline", model: "", reply: reply };
    }
    if (action === "rewrite") return rewrite(src);
    if (action === "evaluate") {
      return pack([
        { title: "综合判断", p: "文稿《" + (filename || topic) + "》结构可识别，建议把创新点改成可检验条目，并补对照表与失败案例。" },
        { title: "优点", items: ["问题意识清楚", "有方法与实验章节雏形"] },
        { title: "不足", items: ["创新点偏「结合现有方法」", "实验缺消融", "文献格式不统一"] },
        { title: "改进建议", items: ["摘要改成问题-方法-数据-指标-局限", "跟踪单独报 IDF1/IDS", "按 GB/T 7714 整理文献"] }
      ], { summary: clip(text, 120) });
    }
    if (action === "outline") {
      return pack([
        { title: "主题", p: topic },
        { title: "章节大纲", items: ["第1章 绪论：问题、贡献、章节安排", "第2章 相关工作：按技术线对比", "第3章 方法：检测、跟踪、分析", "第4章 实验：对照、消融、失败案例", "第5章 总结：局限与后续"] },
        { title: "研究问题", items: ["现有方法在本场景卡在哪？", "你的改动对应哪条指标？", "失败案例说明了什么边界？"] }
      ]);
    }
    if (action === "coach") {
      return pack([
        { title: "引导题", p: extra.answer ? "请把作答里的判断提前，材料放到后面。" : "请用三句话说明：问题、方法差异、准备用什么指标证明。" },
        { title: "参考表述", pre: "针对" + topic + "中的关键约束，本文把贡献写成可检验条目，并在实验中逐条对应。" },
        { title: "点评", items: extra.answer ? ["有具体内容", "建议删空话、补数字"] : ["先作答再点评"] }
      ]);
    }
    if (action === "polish") {
      return pack([
        { title: "语言判断", p: "学术表达基本通顺，空泛背景句偏多。" },
        { title: "可改方向", items: ["段首给判断", "指标写全称后用缩写", "少用「较好」「一定的」"] }
      ]);
    }
    if (action === "abstract") {
      return pack([
        { title: "中文摘要", p: "针对" + topic + "中的关键问题，本文给出可实现方案，并在自建或公开数据上报告主要指标与局限。" },
        { title: "英文摘要", p: "This thesis studies " + topic + ", reports the main metric, and discusses remaining limits." },
        { title: "关键词", items: ["研究问题", "方法", "评价指标"] }
      ]);
    }
    if (action === "refs") {
      var raw = text || "Redmon J. YOLOv3[J]. arXiv, 2018.";
      return pack([
        { title: "整理结果", pre: "[1] " + clip(raw.replace(/\n/g, " "), 180) },
        { title: "校验说明", items: ["按 GB/T 7714—2025 顺序编码制", "西文姓仅首字母大写", "预印本用 PP/OL，不用 EB/OL", "检查缺卷期页码"] }
      ], { formatted: "[1] " + clip(raw.replace(/\n/g, " "), 180) });
    }
    if (action === "path") {
      return pack([
        { title: "短期（3个月）", items: ["精读 8 篇核心文献并做差异表", "冻结数据划分", "跑通基线并记录指标"] },
        { title: "中长期（1–2年）", items: ["补消融与失败案例", "把系统做成可演示版本", "按学位模板定稿"] }
      ]);
    }
    if (action === "pipeline") {
      return pack([
        { title: "流程", items: ["内容评估 ✓", "大纲优化 ✓", "语言润色 ✓", "参考文献整理 ✓", "生成完整优化报告 ✓"] },
        { title: "1. 内容评估", p: "文稿《" + (filename || topic) + "》问题意识清楚，方法与实验章节可识别。当前短板是创新点偏模块清单、对照/消融不足、文献格式不统一。" },
        { title: "评估·优点", items: ["有明确应用场景与技术主线", "已出现可引用的方法名词与实验数字雏形", "结构接近本科论文五章"] },
        { title: "评估·不足", items: ["创新点未写成可检验条目", "缺消融与失败案例分布", "相关工作偏罗列", "讨论章威胁效度与隐私几乎空白"] },
        { title: "评估·建议", items: ["摘要改成问题-方法-数据-指标-局限五句", "贡献条目化并在实验中逐条对应", "跟踪单独报 IDF1/IDS", "按 GB/T 7714—2025 统一文献"] },
        { title: "2. 大纲优化", items: ["第1章 绪论：问题、贡献、章节安排", "第2章 相关工作：按技术线做差异表", "第3章 方法：模块、流程、与基线差异", "第4章 实验：对照、消融、失败案例", "第5章 总结：局限、隐私与后续"] },
        { title: "研究问题", items: ["现有方法在本场景卡在哪？", "你的改动对应哪条指标？", "失败案例说明了什么边界？"] },
        { title: "3. 语言润色", p: "学术表达基本通顺，空泛背景句偏多。段首先给判断，少用「较好」「一定的」「具有重要意义」。" },
        { title: "润色方向", items: ["删空泛时代背景，直接写约束", "指标先写全称再缩写", "结论改成可引用的定量句"] },
        { title: "4. 参考文献", items: ["统一 GB/T 7714—2025 顺序编码制", "西文姓仅首字母大写，名缩写不加下点", "预印本用 [PP/OL]，不要标成 [EB/OL]", "核对文内引用与文末编号一一对应"] },
        { title: "5. 完整优化报告·优先修改", items: ["P0 重写摘要与贡献条目，并补对照/消融表", "P1 统一国标文献并补近两年相关工作", "P2 增加失败案例、隐私处理与局限说明"] }
      ]);
    }
    if (action === "submit") {
      return pack([
        { title: "总体意见", p: "围绕「" + topic + "」先把贡献条目化，再按学位/期刊模板核格式；实验表格与失败案例补齐后再投稿。" },
        { title: "格式对照", items: ["摘要独立成页，中英文与关键词对应", "图题表题编号连续", "参考文献严格 GB/T 7714—2025"] },
        { title: "内容侧重", items: ["写清问题来源与工作量", "压缩教材式背景", "讨论章补威胁效度与隐私"] },
        { title: "优先修改", items: ["摘要五句结构", "对照+消融", "国标文献", "隐私与局限"] }
      ]);
    }
    if (action === "reviewer") {
      return pack([
        { title: "总体意见", p: "方向正确，可继续打磨。主要问题不是「会不会做」，而是贡献是否说清楚、实验是否做完整。" },
        { title: "审稿意见", items: ["摘要按问题-方法-数据-指标-局限写", "创新点改成可检验差异并对应指标", "补对照与消融，跟踪单独报指标", "统一国标文献"] },
        { title: "返修提问", items: ["数据划分是否泄漏？", "失败案例的量化分布是什么？", "隐私与权限如何处理？"] }
      ]);
    }
    if (action === "retrospect") {
      return pack([
        { title: "进步点", items: ["问题背景与技术主线更清楚", "开始用定量指标说话", "知道文献需要国标"] },
        { title: "遗留问题", items: ["创新点仍易写成模块清单", "讨论章失败案例与隐私仍空白", "相关工作覆盖偏旧"] },
        { title: "后续优先级", items: ["P0 重写摘要与贡献，并补消融", "P1 统一文献", "P2 补失败案例与隐私说明"] }
      ]);
    }
    if (action === "topic") {
      return pack([
        { title: "可行性结论", p: "题目「" + topic + "」可做，建议收窄场景与指标，避免做成系统说明书。未连接模型，不给出数值评分。" },
        { title: "建议写法", items: ["面向具体场景的方法研究", "轻量系统的设计与实现", "某项指标改进的实验研究"] }
      ]);
    }
    if (action === "proposal") {
      return pack([
        { title: "一、选题依据", p: "现有方案在目标场景下仍有漏检或不可复现问题。本文拟完成方法、实验与论文。" },
        { title: "二、研究内容", items: ["数据与标注", "方法与基线", "对照实验", "论文与规范"] },
        { title: "三、12 周进度", items: ["第1–2周文献与开题", "第3–5周数据", "第6–8周实验", "第9–12周写作"] }
      ]);
    }
    if (action === "litreview") {
      return pack([
        { title: "综述写法", p: "按技术线写，不要编年体。每条线用「共识—分歧—空白—本文位置」收束。" },
        { title: "可粘贴过渡段", pre: "现有工作在通用基准上较成熟，但对本文场景的约束仍不足。本文将问题收窄，并用直接指标验证，而不是只用笼统准确率。" }
      ]);
    }
    if (action === "translate") {
      var zh = src || "本文针对具体问题给出方法，并报告主要指标与局限。";
      return pack([
        { title: "中文", pre: zh },
        { title: "英文", pre: "This thesis addresses the stated problem, presents the method, and reports the main metric and remaining limits." },
        { title: "用词提醒", items: ["指标符号保持原样", "少用 novel", "this thesis / we 择一"] }
      ]);
    }
    if (action === "expand") {
      return pack([
        { title: "扩写（" + (extra.chapter || "本章") + "）", pre: "针对「" + topic + "」，先写约束，再写本文三条可检验工作，最后说明必须由实验对应，而不能用「效果较好」概括。" },
        { title: "还缺什么", items: ["补相关工作差异一句", "补数据规模", "删空话"] }
      ]);
    }
    if (action === "defense") {
      return pack([
        { title: "答辩高频问题", items: [
          "创新点到底是什么？请对应到指标。",
          "为什么不用更大的模型？",
          "数据划分会不会泄漏？",
          "失败案例准备了吗？"
        ]}
      ]);
    }
    if (action === "venue") {
      return pack([
        { title: "去向建议", p: "围绕「" + topic + "」，先满足学校对学位论文的要求，再按方法和实验完整度选择对口期刊或会议。" },
        { title: "投稿前要补", items: ["把创新点写成可检验条目", "补对照实验和失败案例", "核对期刊范围是否与题目一致"] }
      ]);
    }
    if (action === "ppt") {
      return pack([
        { title: "建议 12 页", items: ["题目", "问题", "相关工作", "方法", "数据", "结果", "消融", "失败案例", "局限", "总结"] },
        { title: "开场 40 秒", pre: "各位老师好。我汇报的题目是" + topic + "。现有方案在关键约束上仍不足。我做了可检验的方法改进，并完成对照实验。" }
      ]);
    }
    if (action === "weekly") {
      return pack([
        { title: "周报", pre: "【本周完成】" + (text || "补实验记录与文献表。") + "\n【问题】指标或数据上的卡住点。\n【下周计划】对照实验或写作。" },
        { title: "邮件标题", items: ["【毕设周报】第N周 进展-姓名"] }
      ]);
    }
    return pack([
      { title: "结果", p: "已根据「" + topic + "」生成建议。请把空话改成数据、对照和局限。" },
      { title: "可执行下一步", items: ["写清问题与指标", "补一张对照表", "留失败案例"] }
    ]);
  };
})(window);
