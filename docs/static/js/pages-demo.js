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

  function brief(topic, text) {
    var blob = (topic || "") + "\n" + (text || "");
    var t = topic || "待定题目";
    if (/病虫|大豆|叶片|作物|农业|病害|植物/.test(blob)) {
      return {
        kind: "田间叶片病害",
        problem: "田间拍摄的「" + t + "」里，早期病斑小、光照和品种差很大。直接套 COCO 上的检测器，小病斑召回低，相似病害还会混成一类。论文要写清：拍的是叶面还是整株、病害有几类、早期样本占多少。",
        method: "建议流水线是：田间图像采集与标注、叶片区域裁剪、病害检测或分割、按类别输出置信度和位置。不要写成行人跟踪。跟踪、轨迹、ByteTrack 与本题无关，写进去会被看成套模板。",
        metric: "检测报 mAP@0.5 和按病害类别的召回；分类报宏平均 F1 与混淆矩阵。必须单列早期小病斑和相似病害（例如褐斑与灰斑）两组失败，不要只用一个总准确率。",
        related: "相关工作分三条线，不要按年份流水账。1）公开植物病害数据集和实验室叶片照片，说明它们和田间光照、遮挡差在哪。2）叶片分割与病斑检测，对比两阶段、YOLO 类单阶段和分割模型。3）农业部署：手机或边缘设备上的速度、误报会不会让农户误施药。每条线用「共识—分歧—空白—本文位置」收束。本文位置只能写「面向田间大豆叶片的早期病斑检测」，不能写成新网络，除非实验表里真有这项对照。",
        fail: "失败案例至少准备三类：病斑小于 32 像素、病斑外观接近的两类、逆光或水滴反光。每一类给出张数占比，并说明漏检会导致什么（晚发现、错用药）。",
        chapters: [
          "第1章 绪论：写清「" + t + "」发生在田间哪一环节；现有人工巡田漏掉早期病斑；本文只解决叶片图像上的检测/分类，不解决施药决策。贡献写成可检验条目，并预告第4章哪张表对应哪一条。",
          "第2章 相关工作：公开叶片数据集、病斑检测/分割、农业边缘部署三条线。每条线末尾用一句话写本文不解决什么，避免把综述写成产品介绍。",
          "第3章 方法：输入是田间叶片图像。模块依次为预处理与标注规范、检测或分割骨干、类别头、置信度阈值。画出和「直接用官方检测器默认权重」差在哪一步。方法章只保留叶片检测或分割。",
          "第4章 实验：数据按地块或拍摄日期划分，避免同一株叶子同时出现在训练和测试。表列：类别、样本量、mAP 或 F1、小病斑召回、相似病害混淆、推理速度。消融只动一个因素：输入尺度、增强、类别权重。",
          "第5章 总结：只总结检测得到的数字和做不到的事（夜间、新品种、未见病害）。展望写补红外或新品种，不要写「意义重大」。"
        ],
        questions: [
          "早期病斑（短边小于 32 像素）的召回比中后期低多少？这一差距对应漏检还是标注噪声？",
          "外观接近的两类病害在混淆矩阵上主要错到谁？是特征不够还是样本量不够？",
          "训练和测试是否按地块分开？同一株作物的不同叶子同时进入两侧，结果不能当泛化。"
        ],
        coachQ: "请用一段话说明「" + t + "」的核心差异：田间约束是什么，你改的是检测、分割还是分类，准备用哪张表证明。不要写跟踪。",
        coachRef: "与直接使用通用检测器不同，本文面向田间大豆叶片：早期病斑尺度小，褐斑与灰斑外观接近，且同一地块的光照变化大。检测端按叶片裁剪并提高小目标的采样权重，输出各类病害的框和置信度。验证不看总准确率口号，而看按类别的召回、小病斑子集的 mAP@0.5，以及相似病害的混淆矩阵。跟踪和轨迹分析不属于本题。",
        coachNotes: [
          "先写判断：本题解决的是叶片病斑检测，不是行人跟踪。",
          "三个改动各对应一个可观察现象：小病斑、相似病害、地块光照。",
          "收束句必须点名指标和对照，例如「相对官方默认权重，小病斑召回是否上升」。",
          "若文中出现 ByteTrack、IDF1、校园门口，删掉，那是另一篇论文的模板。"
        ],
        zh: "田间大豆叶片的早期病斑小，光照和品种变化大，通用检测器漏检明显，相似病害也容易混淆。本文采集田间叶片图像，给出标注规范，并在检测或分割模型上提高小病斑采样权重，输出各类病害的位置与置信度。实验按地块划分训练和测试，报告 mAP@0.5、按类别召回、小病斑子集和相似病害混淆矩阵。数字以你的实验表为准，没有跑完的指标不要先写进摘要。夜间成像、新品种和未见病害仍是局限。",
        en: "Early lesions on field soybean leaves are small, and illumination and cultivar shift cause generic detectors to miss them or confuse similar diseases. This thesis collects field leaf images, states the labeling rule, and biases training toward small lesions, outputting class, box, and confidence. Splits follow field plots. Report mAP@0.5, per-class recall, the small-lesion subset, and the confusion matrix. Do not invent numbers before the table exists. Night imaging, new cultivars, and unseen diseases remain limits.",
        keywords: ["大豆病害", "叶片检测", "小病斑", "混淆矩阵", "田间图像"],
        papers: [
          "PlantVillage 一类实验室叶片数据集：说明它和田间遮挡、土壤背景的差距，不能直接当本文测试集。",
          "YOLO 系列或你实际使用的检测器论文：写明版本、输入尺度和是否用了官方默认权重当基线。",
          "叶片分割或病斑检测的农业论文 2 篇：对比它们的类别数、拍摄环境和指标。",
          "GB/T 7714—2025：文献格式依据，不参与方法创新。"
        ]
      };
    }
    if (/行人|轨迹|跟踪|校园监控|安防/.test(blob)) {
      return {
        kind: "校园行人",
        problem: "「" + t + "」若直接套通用检测器，逆光、门口遮挡和远处小目标会漏检；只报检测框也无法回答轨迹是否被遮挡打断。",
        method: "检测端处理尺度和遮挡，跟踪端把框变成轨迹，分析端只消费轨迹点。三个模块各自对应一个现象，不要合成一句「结合了深度学习」。",
        metric: "检测用 mAP@0.5，跟踪单独报 IDF1 和身份切换次数。文稿里若已有 86.4% 和相对基线 +4.7 个点，只能解释检测，不能代替跟踪。",
        related: "分检测器、多目标跟踪、校园或安防场景三条线。跟踪线要写低分框该不该参与关联。每条线收束为共识、分歧、空白和本文位置。",
        fail: "失败案例写逆光、拥挤门口、人走出画面再进入。每类给出占比，并说明是漏检还是身份切换。",
        chapters: [
          "第1章 绪论：校园监控在什么条件下漏检；本文目标是检测、跟踪还是两者；贡献条目对应后文的表。",
          "第2章 相关工作：检测器、跟踪器、场景差异。写明本文不解决人脸识别。",
          "第3章 方法：检测输出框，跟踪做关联，分析只读轨迹。画出和「官方检测器 + 简单排序跟踪」的差异。",
          "第4章 实验：同一划分上的检测对照和跟踪对照分开列表。消融一次只关一个模块。补充失败案例分布。",
          "第5章 总结：检测数字和跟踪数字分开写。局限写夜间和隐私：是否只存轨迹点、不存原图。"
        ],
        questions: [
          "远处小目标和门口遮挡，分别拖累检测还是跟踪？",
          "低分框参与关联后，身份切换是下降还是引入更多误关联？",
          "测试相机是否出现在训练视频里？重叠则不能称为跨场景。"
        ],
        coachQ: "请说明「" + t + "」相对通用检测器的差异：场景约束、检测与跟踪各改了什么、各自用哪项指标证明。",
        coachRef: "与直接部署通用检测器不同，本文面向校园监控中的逆光、远处行人和门口遮挡。检测端针对行人尺度做增强；跟踪端处理遮挡时的框关联，避免轨迹一断就换成新身份。分析模块只使用轨迹点。检测好坏看 mAP@0.5，跟踪好坏看身份切换，两者不要混在一个「效果较好」里。",
        coachNotes: [
          "判断放在段首：漏检和轨迹中断是两个问题。",
          "每个改动后面跟对照名称，不要只写模块名单。",
          "若还没有跟踪实验，就明确写「本文目前只完成检测」。",
          "隐私写清保存的是原视频还是轨迹点。"
        ],
        zh: "校园监控里，通用行人检测器在逆光、遮挡和远处小目标上漏检，遮挡后轨迹也容易中断。本文把检测和跟踪分开：检测端针对行人尺度，跟踪端处理低置信框的关联，分析端根据轨迹点给出区域热力。实验需要分别报告检测的 mAP@0.5 和跟踪的身份切换。已有文稿中的 86.4% 只说明检测。夜间成像和是否保存原视频仍是局限。",
        en: "Generic pedestrian detectors miss small or backlit people on campus cameras, and occlusion breaks tracks. This thesis separates detection and association: scale-aware detection, then track linking, then analytics on track points only. Report mAP@0.5 and identity switches separately. A detection number does not prove tracking. Night imaging and whether raw video is stored remain limits.",
        keywords: ["行人检测", "多目标跟踪", "遮挡", "校园监控", "轨迹"],
        papers: [
          "你实际采用的检测器论文：写版本和输入尺度。",
          "跟踪方法原文：说明为什么不用更简单的排序跟踪做对照。",
          "行人基准（拥挤或街景）：用来解释为何还要自建校园数据。",
          "GB/T 7714—2025：只约束文献格式。"
        ]
      };
    }
    return {
      kind: "按题目展开",
      problem: "「" + t + "」现在的写法容易停在背景。读者看完仍不知道：输入是什么、现有方法卡在哪一个可观察现象、你准备用哪一项指标证明改动有效。",
      method: "方法只保留一条主线。先写输入和输出，再写与最强基线差在哪一个模块，最后写这个差异会改变哪一列实验结果。不要把无关任务（例如跟踪、翻译、推荐）写进方法。",
      metric: "至少两个数：主指标，以及一个能暴露失败的子集指标。对照必须是同数据划分上的基线，而不是「优于部分传统算法」。",
      related: "相关工作按技术路线分组，每组四句：这一路的共识、还在争的点、没覆盖「" + t + "」的哪一个约束、本文因此放在哪里。不要按年份罗列。",
      fail: "失败案例写成「在什么输入上错、错成什么、占测试集百分之多少」。没有这三项，讨论章就是空的。",
      chapters: [
        "第1章 绪论：用「" + t + "」的一个具体场景开头。写出现有做法的一个可观察失败，再写本文贡献条目，并注明每条由第4章哪张表检验。",
        "第2章 相关工作：两条到三条技术线。每条线比较数据、指标和失败条件，最后一句写本文不做什么。",
        "第3章 方法：只写「" + t + "」的输入、关键模块、输出，以及和基线的一处差异。差异用「因为某现象，所以改这一处」来写。",
        "第4章 实验：数据从哪来、如何划分、主指标、子集指标、消融（一次只改变一个因素）、失败案例分布。没有的实验就写「尚未完成」，不要编数字。",
        "第5章 总结：用已有数字复述做得到的事，并写两个局限（数据覆盖不到的情况、指标解释不了的情况）。"
      ],
      questions: [
        "「" + t + "」里，现有方法最容易失败的输入长什么样？",
        "你的改动如果删掉，主指标和子集指标哪一个会先掉？",
        "训练和测试是否共享了同一批样本或同一场景？共享则结论只能叫拟合，不能叫泛化。"
      ],
      coachQ: "请用一段话写「" + t + "」：问题现象、你和基线的一处差异、准备用什么指标证明。不要用「具有重要意义」收尾。",
      coachRef: "针对「" + t + "」，现有做法的问题要落到一个能看见的失败，而不是「效果不够好」。本文只改与该失败对应的一个环节，并在同一数据划分上与基线对比。主指标说明总体，子集指标说明这个失败有没有减轻。若实验还没跑完，段落里就写「预期在该子集上优于基线」，不要先写一个具体百分点。",
      coachNotes: [
        "段首是判断，不是「随着技术的发展」。",
        "方法名词后面马上写它解决的现象。",
        "指标写全称，并说明对照是谁。",
        "把题目里没有的任务删掉，避免所有论文都写成检测加跟踪。"
      ],
      zh: "「" + t + "」需要先写清输入、失败现象和方法差异。本文给出一条可实现的主线，并在同一划分的数据上报告主指标和失败子集。具体百分点只能来自实验表；表中没有的数字不写入摘要。局限写数据覆盖不到的情形，以及该指标解释不了的情形。",
      en: "State the input, the observable failure, and the single change for \"" + t + "\". Report a main metric and a failure-subset metric on one split. Copy numbers only from the result table. Limits are the cases the data do not cover and the cases the metric cannot explain.",
      keywords: [t.slice(0, 12), "基线对照", "失败案例", "数据划分"],
      papers: [
        "该方向最常用的基线论文 1 篇：写清你复现的配置。",
        "和「" + t + "」同一任务、不同数据假设的论文 2 篇：用来写分歧。",
        "近两年的一篇综述或强基线：避免相关工作停在教材。",
        "GB/T 7714—2025：文献格式，不充当创新点。"
      ]
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
      if (/大纲/.test(q)) reply = "【离线推断】按「" + topic + "」列大纲，每章先写要回答的问题。\n\n" + b.chapters.join("\n\n") + "\n\n研究问题：\n" + b.questions.join("\n");
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
      var zh = (src || "").trim() || b.zh;
      return pack([
        { title: "中文", pre: zh },
        { title: "英文", pre: /[A-Za-z]{20}/.test(zh) ? zh : b.en },
        { title: "用词提醒", items: ["数字和指标符号保持原样，不换算、不四舍五入出新值", "少用 novel、significant，除非统计检验写在原文", "this thesis 和 we 全段只用一种", "题目术语与「" + topic + "」一致，不要译成另一个任务"] }
      ]);
    }
    if (action === "expand") {
      return pack([
        { title: "扩写（" + (extra.chapter || "本章") + "）", pre: b.problem + "\n\n" + b.method + "\n\n" + b.coachRef + "\n\n" + b.metric },
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
    return pack([
      { title: "结果", p: "已根据「" + topic + "」生成建议。请把空话改成数据、对照和局限。" },
      { title: "可执行下一步", items: ["写清问题与指标", "补一张对照表", "留失败案例"] }
    ]);
  };
})(window);
