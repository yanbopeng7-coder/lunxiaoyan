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
      return pack([
        { title: "还没有原文", p: "先上传论文，或把要改的段落贴进来。离线改写只删空话，不编实验数字，也不会换成另一篇论文的题目。" }
      ]);
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

  function notedFacts(text) {
    var parts = String(text || "").split(/[。！？\n]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].replace(/\s+/g, " ").trim();
      if (s.length < 10 || s.length > 90) continue;
      if (/^题目[:：]|^关键词[:：]|^摘要[:：]/.test(s)) continue;
      if (/\d/.test(s) || /实验|数据|方法|指标|准确|召回|mAP|F1|BLEU|划分/.test(s)) out.push(s);
      if (out.length >= 3) break;
    }
    return out;
  }

  function pickFamily(topic, text) {
    var rows = [
      ["田间病害或作物表型", /病虫|病害|病斑|锈病|虫害|叶病|霉病|叶片|作物|农业|植物/, "plant"],
      ["医学影像或临床文本", /医学|病灶|影像|结节|诊断|病理|CT|MRI|超声/i, "med"],
      ["文本或语言任务", /翻译|情感|评论|文本分类|问答|语料|语言模型/, "text"],
      ["推荐", /推荐|协同过滤|点击率/, "rec"],
      ["按时间预测", /预测|时序|负荷|销量|客流/, "forecast"],
      ["检测与轨迹", /行人|轨迹|跟踪|监控|安防/, "track"],
      ["图像分割", /分割/, "seg"],
      ["检测或识别", /检测|识别|监测/, "detect"],
      ["分类", /分类/, "cls"]
    ];
    var i;
    for (i = 0; i < rows.length; i++) if (rows[i][1].test(topic || "")) return rows[i];
    var body = String(text || "").replace(/摘要[:：]/g, "").replace(/关键词[:：]/g, "");
    for (i = 0; i < rows.length; i++) if (rows[i][1].test(body)) return rows[i];
    return ["按题目展开", /$^/, "plain"];
  }

  function familySpec(id, t, text) {
    var hasScore = /86\.4|4\.7/.test(text || "");
    var map = {
      plant: {
        input: "田间或自然光下、和「" + t + "」对应的图像",
        change: "裁剪到叶片或目标区域，并提高小目标或少数类的采样",
        metric: "按类别召回和混淆矩阵；若是检测再报 mAP@0.5，并单列小目标或早期样本",
        split: "按地块、植株或拍摄日期划分，同一株不要同时进入训练和测试",
        fail: "目标很小、两类外观接近、逆光或反光",
        notDo: "不写施药或诊疗建议；题目里没有跟踪，就不要写轨迹",
        lines: ["公开数据集和真实拍摄环境的差距", "检测、分割或分类模型谁做基线", "手机或边缘设备上的速度和误报"],
        scene: "拍摄在田间或温室，背景里有土、叶片遮挡和反光，不是实验室白底。同一植株的不同图像不能一边训练一边测试。"
      },
      med: {
        input: "和「" + t + "」对应的影像或文本，一条样本要能追溯到哪一位病人",
        change: "只改和漏诊或混淆对应的一处，例如输入尺度或类别权重",
        metric: "敏感度、特异度，或分割的 Dice；再报少见类型的子集",
        split: "按病人划分，不能按同一病人的相邻切片随机拆开",
        fail: "少见类型、不同设备、图像质量差",
        notDo: "不把论文结果写成可以临床使用的结论",
        lines: ["公开数据集的采集设备和你的是否相同", "同任务的强基线", "按病人划分的工作"],
        scene: "每一张影像或每一段文本都要能回到病人编号。同一病人的相邻切片、同一次检查的不同窗位，不能拆到训练和测试两边。"
      },
      text: {
        input: "和「" + t + "」对应的句子、评论或文档",
        change: "只改和错例对应的一处，例如领域词、标签体系或是否使用外部知识",
        metric: "分类报宏平均 F1 和混淆矩阵；翻译对照参考译文；问答必须能指回原文句子",
        split: "同一文档的相邻句不要分到训练和测试两侧",
        fail: "否定句、领域词、过长的句子",
        notDo: "不要改成图像检测或行人跟踪",
        lines: ["本任务常用的基线模型", "不同数据领域的一篇", "近两年的一篇强基线"],
        scene: "一条样本是一句评论、一个问句或一段待译文本。标签定义要先写清，例如几个情感类、译文以哪一份为参考。"
      },
      rec: {
        input: "和「" + t + "」对应的用户与物品交互记录",
        change: "只改排序或召回里的一处，并写清和最强基线的差别",
        metric: "Recall@K 或 NDCG，并单独看冷启动用户",
        split: "按时间切，测试里不能出现训练时刻之后才发生的交互",
        fail: "冷启动、热门物品占满推荐列表、交互很少的用户",
        notDo: "不要把随机划分的结果写成线上效果",
        lines: ["经典协同过滤或你实际使用的基线", "和你的场景数据规模接近的一篇", "近两年的一篇"],
        scene: "一条样本是某用户在某时刻对某物品的行为。测试只能使用切分时刻之后的行为，不能把以后才发生的点击放进训练。"
      },
      forecast: {
        input: "和「" + t + "」对应的历史序列",
        change: "只改一个因素，例如输入窗口、外部变量或模型结构",
        metric: "MAE 或 RMSE，并单列突变或高峰时段",
        split: "按时间先后划分，不能打乱后随机抽测试",
        fail: "节假日、突变、训练里没见过的区间",
        notDo: "不要把拟合训练曲线写成预测能力",
        lines: ["本序列任务的常用基线", "使用了不同外部变量的一篇", "近两年的一篇"],
        scene: "输入是按时间排好的历史窗口，输出是下一小段的数值。训练用较早的时段，测试用更晚的时段，中间可以留一段不用，避免贴得太近。"
      },
      track: {
        input: "和「" + t + "」对应的视频或连续帧",
        change: "检测和轨迹关联分开写，各自对应一个失败现象",
        metric: hasScore ? "文稿里的 86.4% 只说明检测。跟踪要另报身份切换，不能用检测数字代替" : "检测报 mAP@0.5，跟踪另报身份切换。正文里还没有这些数字，就不要先写百分点",
        split: "测试视频的相机不要静默地出现在训练集里",
        fail: "遮挡、小目标、目标离开画面再回来",
        notDo: "题目里没有人脸识别，就不要写身份识别",
        lines: ["你采用的检测器及版本", "跟踪基线", "和你的场景密度接近的公开数据"],
        scene: "输入是连续帧。检测只负责框，关联只负责这些框是不是同一个人或同一个目标。两个模块的失败不要写在同一个指标里。"
      },
      seg: {
        input: "和「" + t + "」对应的图像及标注掩膜",
        change: "只改边界或小区域对应的一处",
        metric: "Dice 或 IoU，并单列小区域和边界",
        split: "同一主体的相邻切片不要同时进入训练和测试",
        fail: "细边界、小区域、标注不一致",
        notDo: "不要只用一个总准确率",
        lines: ["分割基线及输入尺寸", "不同标注规范的一篇", "近两年的一篇"],
        scene: "一条样本是原图加上像素级掩膜。先写清标注规则：边界算不算目标、小碎块是否保留。规则不同的掩膜不能混在一张表里比。"
      },
      detect: {
        input: "和「" + t + "」对应的图像",
        change: "相对官方默认权重，只改和漏检对应的一处",
        metric: "mAP@0.5 与按类别召回，并单列小目标或困难样本",
        split: "同一场景不要同时出现在训练和测试",
        fail: "小目标、遮挡、和训练分布不一样的场景",
        notDo: "题目里没有跟踪，就不要写轨迹",
        lines: ["官方检测器及版本", "同任务不同数据的一篇", "近两年的一篇"],
        scene: "一条样本是一张图和上面的框。先写类别表和框的最小尺寸。小于这个尺寸的目标单列成困难子集，不要混进总指标。"
      },
      cls: {
        input: "和「" + t + "」对应的一条样本",
        change: "只改和易混类别对应的一处，例如特征、损失或采样",
        metric: "宏平均 F1 和混淆矩阵，不要只报总准确率",
        split: "同一来源的近重复样本不要分到两侧",
        fail: "外观或表述接近的两类、样本很少的类",
        notDo: "不要写成检测加跟踪",
        lines: ["本任务常用分类基线", "类别定义不同的一篇", "近两年的一篇"],
        scene: "一条样本对应一个类别。先列出类别名单和每类大概多少条。总准确率会被大类撑住，所以必须同时给混淆矩阵。"
      },
      plain: {
        input: "「" + t + "」实际采集的记录，图像、文本、表格或序列按你的数据为准",
        change: "只改和一个可观察失败对应的一处，并写明与最强基线的配置差在哪",
        metric: "一个主指标，外加一个失败子集。用这个方向已经在用的指标名，不要新造一个分数",
        split: "测试样本不能在训练里出现过；数据有时间顺序就按时间切",
        fail: "最容易错的三类输入，每类写占测试集多少",
        notDo: "题目里没有的任务不要写进方法",
        lines: ["本方向最常用的基线", "数据假设和你不同的一篇", "近两年的一篇"],
        scene: "先用一段话定义「" + t + "」的一条样本：字段有哪些、从哪采集、怎样算一条。定义不清时，后面的对照表没有意义。"
      }
    };
    return map[id];
  }

  function workedCase(t, s, kind) {
    return [
      "下面是「" + t + "」的一份离线试用案例，按「" + kind + "」来写。数字格先空着，跑完实验再填，不要先写百分点。",
      "",
      "一、场景",
      "题目就用「" + t + "」。输入是" + s.input + "。先用三句话告诉读者：数据从哪来、一条样本长什么样、现有做法会在什么输入上错。最容易错的是：" + s.fail + "。",
      s.scene,
      "",
      "二、基线只改一处",
      "基线写你真正复现的那个配置：名称、版本、输入尺寸，这三项留空给你填，这里不代填。本文相对基线只改一处：" + s.change + "。其余数据划分、训练轮数和阈值与基线相同。改了两处以上，就看不出是哪一处在起作用。",
      "步骤可以写成：",
      "1. 固定划分。" + s.split + "。把划分方式、随机种子或时间切分点写进实验设置。",
      "2. 先跑基线，把主指标和失败子集记进同一张表。失败子集就是「" + s.fail + "」。",
      "3. 加上这一处改动，用同一划分再跑一遍。",
      "4. 做一次消融：去掉这一处，其他不动。主指标和失败子集哪一个先掉，创新点就写哪一个。",
      "",
      "三、实验表（格子写「待填」，不要先写 86.4 这类数字）",
      "组别 | 划分 | 主指标 | 失败子集 | 和基线的差别",
      "基线 | 同一划分 | 待填 | 待填 | 官方或论文默认配置",
      "本文 | 同一划分 | 待填 | 待填 | 只做了上面那一处",
      "去掉该改动 | 同一划分 | 待填 | 待填 | 消融",
      "主指标按这个题目来：" + s.metric + "。",
      "",
      "四、可粘贴进方法章的一段",
      "针对「" + t + "」，输入是" + s.input + "。现有做法在「" + s.fail + "」上容易失败。" + s.scene + "本文只改一处：" + s.change + "。实验使用与基线相同的划分，报告主指标和上述失败子集。表中尚未填入的数字不写入正文。" + s.notDo + "。",
      "",
      "五、失败案例",
      "从测试集里各抽一类：" + s.fail + "。每一类写四项：有多少条、错成什么、占测试集多少、漏掉之后会影响什么。还没数过就写「尚未统计」。",
      "",
      "六、不要写进去",
      s.notDo + "。摘要只保留这张表里已经填上的格。相关工作分三条：" + s.lines.join("；") + "。"
    ].join("\n");
  }

  function brief(topic, text) {
    var t = String(topic || "待定题目").replace(/\s+/g, " ").trim() || "待定题目";
    var fam = pickFamily(t, text);
    var s = familySpec(fam[2], t, text);
    var facts = notedFacts(text);
    var factLine = facts.length
      ? "文稿里已经写到、可以引用的句子：" + facts.join("。") + "。除此之外的百分点不要编。"
      : "当前没有可引用的实验数字，所以下面不写百分点。";
    var problem = "「" + t + "」的输入是" + s.input + "。" + s.fail + "会让现有做法失败。" + factLine;
    var method = "方法只保留一条主线：" + s.change + "。输出要能放进实验表。" + s.notDo + "。";
    var metric = s.metric + "。对照必须是同一划分上的基线。";
    var related = "相关工作按三条线写，不要按年份堆：" + s.lines.join("；") + "。每条线用共识、分歧、没覆盖「" + t + "」的哪一点、本文放在哪里来收束。";
    var fail = "失败案例写成：在「" + s.fail + "」上错成什么、占测试集多少。" + s.split + "。";
    var trial = workedCase(t, s, fam[0]);
    return {
      kind: fam[0],
      problem: problem,
      method: method,
      metric: metric,
      related: related,
      fail: fail,
      case: trial,
      chapters: [
        "第1章 绪论。开头不要写时代背景，直接写「" + t + "」里一条失败的样本长什么样。" + s.scene + "贡献列成两条以内，每条注明由第4章哪一列检验。" + s.notDo + "。",
        "第2章 相关工作。分三条写，不要按年份：" + s.lines.join("；") + "。每条用四句收束：这一路的共识、还在争的点、没覆盖「" + t + "」的哪一个约束、本文因此做哪一处。最后一句写本文不做什么。",
        "第3章 方法。先定义一条样本：" + s.input + "。再写基线配置（名称、版本、输入尺寸留空待填）。然后只写一处差异：" + s.change + "。配一张图，图上标出这一处相对基线新增或改动的模块，其余模块标成与基线相同。",
        "第4章 实验。" + s.split + "。表列至少四列：组别、划分、主指标、失败子集。主指标是" + s.metric + "。失败子集覆盖" + s.fail + "。消融只删掉这一处改动。格子没有跑完就写待填。",
        "第5章 总结。用表里已经填上的格子复述做得到的事，并写两件做不到的事：" + s.fail + "。没有的实验写成尚未完成，不展望一个更大的系统。"
      ],
      questions: [
        "「" + t + "」里，" + s.fail + " 分别把结果拉低多少？",
        "删掉你的这一处改动后，主指标和失败子集哪一个先掉？",
        s.split + "。如果没有分开，这个结果只能叫拟合。"
      ],
      coachQ: "请用一段话写「" + t + "」：输入是什么，你和基线的一处差异，准备用什么指标证明。不要用「具有重要意义」收尾。",
      coachRef: "针对「" + t + "」，输入是" + s.input + "。现有做法容易在「" + s.fail + "」上失败。本文只做这一处改动：" + s.change + "。验证看" + s.metric + "。" + s.notDo + "。实验若还没跑完，就写预期，不要先写百分点。",
      coachNotes: [
        "段首写判断：输入是" + s.input + "。",
        "改动只留一处，并写它对应「" + s.fail + "」里的哪一种。",
        "指标写成：" + s.metric + "。",
        s.notDo + "。"
      ],
      zh: "「" + t + "」要先写清输入、失败现象和一处方法差异。输入是" + s.input + "。本文" + s.change + "。实验上，" + s.split + "，并报告" + s.metric + "。表里没有的数字不写入摘要。局限是" + s.fail + "。",
      en: "For \"" + t + "\", state the input, one observable failure, and one change. Report the main metric and a failure subset on a single split. Copy numbers only from the result table.",
      keywords: [t.slice(0, 12), fam[0].slice(0, 8), "基线对照", "失败子集"],
      papers: s.lines.map(function (line) { return line + "：写清和「" + t + "」的数据、指标有什么不同。"; }).concat(["GB/T 7714—2025：只约束文献格式，不充当创新点。"])
    };
  }

  w.LX_LOCAL_RUN = function (action, extra, text, filename) {
    extra = extra || {};
    text = text || "";
    var topic = guessTopic(text, filename, extra);
    var src = extra.src || text;
    var q = extra.question || text;

    if (action === "chat") {
      var b = brief(topic, q + "\n" + text);
      var reply = "【离线推断】题目按「" + topic + "」理解，下面按「" + b.kind + "」来写，不是套另一篇论文。\n\n"
        + b.problem + "\n\n" + b.method + "\n\n" + b.metric + "\n\n" + b.related + "\n\n" + b.fail + "\n\n"
        + "章节可以直接改成：\n" + b.chapters.join("\n");
      if (/大纲/.test(q)) reply = "【离线推断】按「" + topic + "」列大纲，每章先写要回答的问题。\n\n" + b.chapters.join("\n\n") + "\n\n" + b.case + "\n\n研究问题：\n" + b.questions.join("\n");
      if (/摘要/.test(q)) reply = "【离线推断】摘要用「" + topic + "」里已经能核对的事实。没有实验表的百分点不要先写。\n\n" + b.zh + "\n\n英文可对齐为：\n" + b.en;
      if (/文献/.test(q)) reply = "【离线推断】文献总结对着「" + topic + "」，按技术线而不是按年份。\n\n" + b.related + "\n\n建议放进表里的文献：\n" + b.papers.join("\n");
      if (/答辩/.test(q)) reply = "【离线推断】答辩围绕「" + topic + "」，每题准备约 40 秒，先给判断再给证据。\n\n"
        + "1. " + b.questions[0] + "\n2. " + b.questions[1] + "\n3. " + b.questions[2] + "\n\n"
        + "工作量要能说出：数据从哪来、标注花了多久、基线是哪一个官方配置。说不清的创新就承认是系统集成，不要另编一个网络名。\n" + b.fail;
      return { ok: true, demo: true, mode: "offline", source: "offline", model: "", reply: reply };
    }
    if (action === "rewrite") return rewrite(src);
    var b = brief(topic, (text || "") + "\n" + (extra.answer || "") + "\n" + (extra.chapter || ""));
    if (action === "evaluate") {
      return pack([
        { title: "综合判断", p: "文稿《" + (filename || topic) + "》按「" + b.kind + "」来看。下面是离线检查，不打分。\n" + b.problem },
        { title: "方法是否对题", p: b.method },
        { title: "优点", items: ["题目「" + topic + "」已经落到一个具体对象", "可以改写成问题—方法—指标三段，而不是背景介绍"] },
        { title: "不足", items: [b.fail, "创新点若仍是模块名单，实验表对不上", "相关工作若按年份罗列，看不出本文位置"] },
        { title: "改进建议", items: [b.metric, b.related, "摘要只保留文稿里已出现的事实，没有的百分点留空"] }
      ], { summary: clip(text, 180) });
    }
    if (action === "outline") {
      return pack([
        { title: "主题", p: topic + "（按「" + b.kind + "」展开，章节随题目变化）" },
        { title: "要解决的问题", p: b.problem },
        { title: "方法主线", p: b.method },
        { title: "章节大纲", items: b.chapters },
        { title: "试用案例", pre: b.case },
        { title: "研究问题", items: b.questions },
        { title: "文献怎么放", items: b.papers },
        { title: "实验必须出现的内容", p: b.metric + "\n" + b.fail }
      ]);
    }
    if (action === "coach") {
      var ans = (extra.answer || "").trim();
      return pack([
        { title: "引导题", p: b.coachQ },
        { title: "参考表述", pre: b.coachRef },
        { title: "试用案例", pre: b.case },
        { title: "对照着改", items: b.coachNotes },
        { title: "若已作答", p: ans ? ("已收到作答「" + clip(ans, 80) + "」。先检查判断是否在段首，再检查有没有点名对照和指标。空话删掉，文中没有的百分点不要补。") : "还没有作答。可以先把上面的参考表述改成你的数据和你的基线名称，再提交一次。" }
      ]);
    }
    if (action === "polish") {
      return pack([
        { title: "语言判断", p: "对着「" + topic + "」看：空泛背景可以整段删。段首留下判断，判断后面跟文献、数据或实验。" },
        { title: "可改方向", items: ["删「随着…的发展」「具有重要意义」", "指标先写全称再写缩写", "一个句子只留一个主张", b.method] },
        { title: "改写示例", pairs: [
          { before: "本文结合现有方法，设计了较为完善的系统，具有一定实际意义。", after: b.coachRef }
        ]}
      ]);
    }
    if (action === "abstract") {
      return pack([
        { title: "中文摘要", pre: b.zh },
        { title: "英文摘要", pre: b.en },
        { title: "关键词", items: b.keywords },
        { title: "使用前核对", p: "摘要里的数字必须能在实验表里找到。表里没有的，改成「将报告主指标和失败子集」，不要编百分点。" }
      ]);
    }
    if (action === "refs") {
      var lines = (text || "").split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!lines.length) lines = b.papers.slice();
      var formatted = lines.map(function (line, i) {
        var body = line.replace(/^\s*\[\d+\]\s*/, "");
        return "[" + (i + 1) + "] " + body;
      }).join("\n");
      return pack([
        { title: "按「" + topic + "」整理", pre: formatted },
        { title: "这些文献该怎么用", items: b.papers },
        { title: "格式", items: ["顺序编码制，文内 [1] 与文末同一条", "西文姓仅首字母大写，名缩写后不加下点", "预印本用 [PP/OL]，网站才用 [EB/OL]", "缺卷期页码的条目标出来再补，不要编页码"] }
      ], { formatted: formatted });
    }
    if (action === "path") {
      return pack([
        { title: "题目", p: "按「" + topic + "」排，不换成别的方向。" },
        { title: "第 1–4 周", p: b.related },
        { title: "第 5–8 周", p: "冻结数据划分，跑通一个官方基线，把主指标和失败子集记进同一张表。" + b.metric },
        { title: "第 9–12 周", p: b.fail + " 然后按五章把已有数字写进摘要，没有的实验标成待做。" },
        { title: "章节对应", items: b.chapters }
      ]);
    }
    if (action === "pipeline") {
      return pack([
        { title: "流程", items: ["内容评估", "大纲", "语言", "文献格式", "修改优先级"] },
        { title: "1. 内容评估", p: "文稿《" + (filename || topic) + "》。" + b.problem + "\n" + b.method },
        { title: "评估·要补的实验", p: b.metric + "\n" + b.fail },
        { title: "2. 大纲", items: b.chapters },
        { title: "研究问题", items: b.questions },
        { title: "3. 语言", p: "段首先写判断。删掉「较好」「一定的」「具有重要意义」。" },
        { title: "可直接替换的一句", pre: b.coachRef },
        { title: "4. 参考文献", items: ["统一 GB/T 7714—2025 顺序编码制", "西文姓仅首字母大写，名缩写后不加下点", "预印本用 [PP/OL]，不要标成 [EB/OL]", "文内编号和文末条目一一对应"].concat(b.papers) },
        { title: "5. 优先修改", items: ["先让摘要只包含表里有的事实", "再让每一条贡献对应第4章的一列", "最后补失败案例的张数或占比"] }
      ]);
    }
    if (action === "submit") {
      return pack([
        { title: "总体意见", p: "「" + topic + "」先把贡献写成可检验条目，再对学校模板。实验表和失败案例齐了再考虑投稿。" },
        { title: "内容必须回答", items: b.questions },
        { title: "格式对照", items: ["摘要独立成页，中英文信息对齐", "图题表题编号连续", "参考文献按 GB/T 7714—2025"] },
        { title: "摘要可用底稿", pre: b.zh }
      ]);
    }
    if (action === "reviewer") {
      return pack([
        { title: "总体意见", p: "按「" + topic + "」审。方向可以继续，但贡献必须能在表里找到，不能靠形容词。" },
        { title: "意见", items: [b.problem, b.method, b.metric, b.related] },
        { title: "返修要回答", items: b.questions.concat([b.fail]) }
      ]);
    }
    if (action === "retrospect") {
      return pack([
        { title: "现在已经能写清的", p: b.problem },
        { title: "还没落到纸上的", items: [b.metric, b.fail, "相关工作仍可能是年份流水账"] },
        { title: "下一步就做这三件", items: b.chapters.slice(2, 5) }
      ]);
    }
    if (action === "topic") {
      return pack([
        { title: "题目", p: "「" + topic + "」可以做。离线判断不打分。" },
        { title: "收窄之后写什么", p: b.problem + "\n" + b.method },
        { title: "不要写成", items: ["系统说明书或功能清单", "和题目无关的跟踪、推荐或翻译模块", "没有对照表的「效果较好」"] },
        { title: "开题时就要能回答", items: b.questions }
      ]);
    }
    if (action === "proposal") {
      return pack([
        { title: "一、选题依据", pre: b.problem + "\n" + b.related },
        { title: "二、研究内容", items: [b.method, b.metric, b.fail, "按学校模板完成论文，文献用 GB/T 7714—2025"] },
        { title: "试用案例", pre: b.case },
        { title: "三、章节", items: b.chapters },
        { title: "四、12 周", items: ["第1–2周：按技术线做差异表，冻结研究问题", "第3–5周：数据来源、标注规范和划分方式写死", "第6–8周：基线与一处改动的对照、消融", "第9–12周：失败案例、摘要和答辩材料"] }
      ]);
    }
    if (action === "litreview") {
      return pack([
        { title: "怎么分组", p: b.related },
        { title: "建议入表的文献", items: b.papers },
        { title: "可粘贴的过渡段", pre: "现有工作在通用数据上已经比较完整，但对「" + topic + "」的具体约束讨论不足。本文将问题收窄到一个可观察的失败，并用主指标和失败子集一起验证，而不是只给一个总准确率。" }
      ]);
    }
    if (action === "translate") {
      var raw = (src || "").trim();
      var fromZh = /[\u4e00-\u9fff]/.test(raw) && !/[A-Za-z]{40}/.test(raw);
      return pack([
        { title: fromZh ? "英文译文" : "中文译文", pre: fromZh ? ("【离线推断】原文是中文，应译成英文，不能把原文编号后原样返回。请在连上模型后重新生成。原文开头：\n" + clip(raw, 280)) : (raw || b.zh) },
        { title: "用词提醒", items: ["中文稿译成英文，英文稿译成中文", "不要加 [1][2] 编号，除非原文自己就有编号", "数字和指标符号保持原样"] }
      ]);
    }
    if (action === "expand") {
      return pack([
        { title: "扩写（" + (extra.chapter || "本章") + "）", pre: b.case },
        { title: "这一章还要补上的句子", items: b.questions.concat([b.fail]) }
      ]);
    }
    if (action === "defense") {
      return pack([
        { title: "答辩题（" + topic + "）", items: b.questions.concat([
          "基线是官方默认配置还是你改过的配置？差异清单在哪一页？",
          b.fail,
          "哪一个数字现在还没有实验，答辩时准备怎么说「尚未完成」？"
        ]) },
        { title: "40 秒结构", p: "先用一句话回答，再指出表或图的编号，最后说这个证据解释不了什么。不要从背景讲起。" }
      ]);
    }
    if (action === "venue") {
      return pack([
        { title: "去向", p: "「" + topic + "」先满足学校对学位论文的章节、数据和格式要求。方法和对照完整之后，再按任务名称找期刊或会议，不要先选一个热门venue再改题目。" },
        { title: "投稿前核对", items: b.questions.concat(["期刊范围是否包含这个任务，而不是只沾「深度学习」", "摘要数字是否都能在正文表中找到"]) }
      ]);
    }
    if (action === "ppt") {
      return pack([
        { title: "页序", items: ["题目与一句结论", "失败现象（配一张坏例）", "相关工作三条线", "方法只画和基线的差异", "数据划分", "主结果表", "消融", "失败案例", "局限", "总结"] },
        { title: "开场", pre: "各位老师好。题目是" + topic + "。" + b.problem + "我只改了与这个失败对应的一个环节，并用同一划分上的对照来说明。" },
        { title: "可能被问", items: b.questions }
      ]);
    }
    if (action === "weekly") {
      return pack([
        { title: "周报", pre: "【题目】" + topic + "\n【本周完成】" + (text || "补了一张对照表或一页文献差异。") + "\n【卡住】" + b.questions[0] + "\n【下周】" + b.metric },
        { title: "邮件标题", items: ["【周报】" + topic.slice(0, 18) + " 第N周"] }
      ]);
    }
    if (action === "terms") {
      return pack([
        { title: "按「" + topic + "」统一说法", p: "只列这篇文稿里已经出现、或题目必然要用的术语。不要换成另一篇论文的缩写表。" },
        { title: "建议固定下来的概念", items: [b.method, b.metric, "同一概念全文只用一个名字，缩写在首次出现时写出全称"] },
        { title: "文稿摘录", pre: clip(text, 360) || "还没有上传文稿。上传后这里按正文里的用词来列。" }
      ]);
    }
    if (action === "formula") {
      return pack([
        { title: "符号跟着「" + topic + "」走", p: b.metric },
        { title: "正文里要定义的量", items: ["主指标在第一次出现时写出全称和计算口径", "阈值、损失和划分方式各给一个符号，并说明取自哪一节", b.fail] },
        { title: "文稿摘录", pre: clip(text, 360) || "还没有上传文稿。上传后按正文里的指标写符号，不另编一套公式。" }
      ]);
    }
    if (action === "figure") {
      return pack([
        { title: "图和表要服务「" + topic + "」", p: b.method },
        { title: "建议的图题表题", items: ["图1  问题现象：哪一类输入失败", "图2  方法和基线差在哪一处", "表1  数据划分", "表2  主指标与失败子集，单元格没有结果就写待填"] },
        { title: "图注", p: "图注只写看什么、条件是什么。结论放在正文，并指回图号或表号。" },
        { title: "文稿摘录", pre: clip(text, 360) || "还没有上传文稿。" }
      ]);
    }
    if (action === "experiment") {
      return pack([
        { title: "实验设计", p: b.method },
        { title: "必须分开报的内容", items: [b.metric, b.fail, "先冻结划分，再比基线，再做只改一处的消融"] },
        { title: "文稿里已经写到的实验", pre: clip(text, 400) || "还没有上传文稿。上传后按正文里的数据和指标补表，不另编百分点。" }
      ]);
    }
    if (action === "reproduce") {
      return pack([
        { title: "复现「" + topic + "」要写清的项", items: ["数据从哪来、怎么划分、随机种子", "基线的官方配置和你改过的那一处", b.metric, "失败子集怎么抽、占测试集多少"] },
        { title: "文稿摘录", pre: clip(text, 360) || "还没有上传文稿。上传后按正文里的配置列清单，缺的项标成待补，不编命令参数。" }
      ]);
    }
    if (action === "ethics") {
      return pack([
        { title: "声明要扣住「" + topic + "」", p: "数据采集、保存范围和展示时去掉了哪些可识别信息，都按这篇文稿里的做法写。文稿没写的授权不要编。" },
        { title: "建议单列的三件事", items: [b.fail, "数据是否出过这台机器", "展示用的图是否还能认出具体的人、地点或编号"] },
        { title: "文稿摘录", pre: clip(text, 360) || "还没有上传文稿。" }
      ]);
    }
    if (action === "rebuttal") {
      return pack([
        { title: "回复结构", p: "先复述审稿意见，再写已改、部分改或保留的理由，并给出页码。语气只对意见，不对人。" },
        { title: "这篇文稿可以拿来回应的点", items: [b.method, b.metric, b.fail] },
        { title: "论文与审稿意见", pre: clip(text, 500) || "请上传论文，并在下面粘贴审稿意见。" }
      ]);
    }
    if (action === "diff") {
      return pack([
        { title: "对照「" + topic + "」", p: b.problem },
        { title: "已提供的稿件", pre: clip(text, 500) || "请上传一稿，并在下面贴上另一稿或修改说明。" },
        { title: "还要对上的内容", items: [b.metric, b.fail, b.related] }
      ]);
    }
    return pack([
      { title: "结果", p: "已根据「" + topic + "」生成建议。请把空话改成数据、对照和局限。" },
      { title: "可执行下一步", items: ["写清问题与指标", "补一张对照表", "留失败案例"] }
    ]);
  };
})(window);
