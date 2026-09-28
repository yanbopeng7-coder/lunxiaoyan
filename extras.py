# -*- coding: utf-8 -*-
"""论小研扩展模块：开题、降重、答辩、实验等演示内容。"""
import re


def _pack(model_id, model_name, sections, extra=None):
    data = {"mode": "demo", "model": model_name(model_id), "sections": sections}
    if extra:
        data.update(extra)
    return data


_FILLERS = [
    (u"从笔者目前所搜集的资料来看，", u"既有研究显示，"),
    (u"从笔者目前所搜集的资料来看", u"既有研究显示"),
    (u"从目前搜集的资料来看，", u"既有研究显示，"),
    (u"整体来看，", u""),
    (u"总的来说，", u""),
    (u"也就是说，", u""),
    (u"也就是说", u""),
    (u"近年来受到了国内外学者的广泛关注。", u""),
    (u"近年来受到了国内外学者的广泛关注", u"已有若干研究路径"),
    (u"随着人工智能的飞速发展，", u""),
    (u"随着社会的不断发展，", u""),
    (u"具有较好的检测效果", u"效果需用具体指标报告"),
    (u"具有一定的实际意义", u"其价值应落到可验证的问题上"),
    (u"本文提出一种", u"本文针对该问题给出"),
    (u"笔者", u"已有文献"),
]


def _style_swap(s):
    s = s or ""
    for a, b in _FILLERS:
        s = s.replace(a, b)
    s = re.sub(u"[ \t]+", u" ", s)
    s = re.sub(u"，{2,}", u"，", s)
    s = re.sub(u"。{2,}", u"。", s)
    return s.strip(u" ，、；;")


def _promote_conclusion(raw):
    """把「也就是说」后的判断提前，主题词全部保留。"""
    m = re.search(u"也就是说[，,]?(.*)$", raw, re.S)
    if not m:
        return None
    concl = _style_swap(m.group(1)).strip(u"。；; ")
    rest = _style_swap(re.sub(u"也就是说[，,]?.*$", u"", raw, flags=re.S))
    if not concl:
        return None
    if rest:
        return concl + u"。" + rest.strip(u"。") + u"。"
    return concl + u"。"


def _rewrite_paragraph(src):
    raw = (src or "").strip()
    if not raw:
        return raw
    promoted = _promote_conclusion(raw)
    if promoted:
        return promoted
    swapped = _style_swap(raw)
    if swapped and swapped != raw:
        return swapped if swapped.endswith(u"。") else swapped + u"。"
    t = swapped or raw
    if not t.endswith(u"。"):
        t += u"。"
    return t


def _risks_from(src):
    items = []
    if u"也就是说" in src or u"整体来看" in src:
        items.append(u"「也就是说／整体来看」是口语衔接，学术段应直接给判断。")
    if u"搜集的资料" in src or u"笔者" in src:
        items.append(u"「从笔者搜集的资料来看」可改为「既有研究」并补出处。")
    if u"广泛关注" in src or u"飞速发展" in src:
        items.append(u"「广泛关注／飞速发展」是空泛背景，删去不影响原意。")
    if u"本文提出" in src and u"具有" in src:
        items.append(u"「本文提出…具有较好效果」应改成对象、方法与可报指标。")
    if not items:
        items = [
            u"空泛背景句可删，不影响原意。",
            u"段首给出判断，材料放在后面。",
        ]
    return items


def _rewrite_pack(src, model_id, model_name):
    src = (src or "").strip()
    if not src:
        src = (
            u"随着人工智能的飞速发展，深度学习在计算机视觉领域取得了广泛应用。"
            u"本文提出一种基于 YOLO 的行人检测方法，具有较好的检测效果。"
        )
    after = _rewrite_paragraph(src)
    pairs = [{u"before": src, u"after": after}]
    return _pack(
        model_id,
        model_name,
        [
            {u"title": u"改写对照", u"pairs": pairs},
            {u"title": u"修改建议", u"items": _risks_from(src)},
        ],
    )


def extra_demos(action, text, filename, extra, model_id, model_name, topic):
    extra = extra or {}
    topic = topic or extra.get("topic") or u"基于深度学习的校园行人检测与轨迹分析"

    catalog = {
        "topic": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"可行性结论", u"p": u"题目可做，建议收窄为「校园门口/走廊遮挡场景下的行人检测与轨迹连续」，避免做成通用 YOLO 系统说明书。综合可行度 78/100。"},
                {u"title": u"研究空白", u"items": [u"校园相机俯仰角、逆光与远距离小目标组合场景缺少公开基准。", u"跟踪指标（IDF1、ID Switch）在本科论文中常被 mAP 替代，存在方法错配。", u"隐私合规与本地部署几乎未被写入同类学位论文。"]},
                {u"title": u"风险与工作量", u"items": [u"数据：至少 1 个校门口场景、2000+ 张有效标注，否则实验说服力不足。", u"算力：YOLOv8n 即可，不必上很大模型。", u"伦理：监控数据需脱敏，论文中必须写采集授权。"]},
                {u"title": u"建议题目三种写法", u"items": [u"面向遮挡场景的校园行人多目标跟踪方法研究", u"轻量级校园行人检测与轨迹热力分析系统设计与实现", u"边缘设备上的校园小目标行人感知方法"]},
            ],
            {u"score": 78},
        ),
        "proposal": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"一、选题依据", u"p": u"智慧校园安防仍大量依赖人工盯屏。通用检测器在逆光、远处行人与门口遮挡下漏检明显。本文拟构建检测—跟踪—分析流水线，并在自建校园数据上验证。"},
                {u"title": u"二、研究内容", u"items": [u"校园行人数据的采集、标注规范与划分。", u"面向行人尺度的检测增强与轻量模型。", u"ByteTrack 低分框关联在拥堵门口的效果。", u"轨迹热力与越界事件，以及隐私处理说明。"]},
                {u"title": u"三、研究方案", u"p": u"基线：YOLOv8n + DeepSORT。改进：尺度感知增强 + ByteTrack。指标：mAP@0.5、Precision/Recall、IDF1、IDS、FPS。对比 YOLOv5s、YOLOv7-tiny。"},
                {u"title": u"四、12 周进度", u"items": [u"第1–2周：文献与开题修订", u"第3–5周：数据与标注", u"第6–8周：检测训练与对比", u"第9–10周：跟踪与可视化", u"第11–12周：论文初稿与规范"]},
                {u"title": u"五、预期成果", u"items": [u"可运行系统演示与实验对比表", u"不少于 1.5 万字论文（按学校要求）", u"数据集说明与复现代码清单"]},
            ],
        ),
        "litreview": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"综述写法（不要编年体）", u"p": u"按技术线写：两阶段检测 → YOLO 系列 → Transformer 检测器 → 多目标跟踪 → 校园/安防应用。每条线用「共识—分歧—空白—本文位置」收束。"},
                {u"title": u"检测技术线", u"p": u"Faster R-CNN 精度高但偏慢；YOLO 系列在端侧更常见。近年 RT-DETR 等开始进入实时区，本科论文若完全不提会被认为文献滞后。"},
                {u"title": u"跟踪技术线", u"p": u"SORT/DeepSORT 依赖外观特征；ByteTrack 强调低分检测框关联，更适合门口漏检。应在综述末明确：本文为何选 ByteTrack 而不是只「用了跟踪」。"},
                {u"title": u"可直接粘贴的过渡段", u"pre": u"综上，现有工作在通用基准上已较成熟，但对校园监控的逆光、远距离小目标与拥堵遮挡同时约束不足。本文将问题收窄到校园场景的检测—跟踪级联，并以 ID Switch 作为跟踪有效性的直接证据，而不是仅用检测 mAP 间接说明。"},
            ],
        ),
        "schedule": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"任务书目标", u"p": u"完成校园行人检测与轨迹分析的设计、实现、实验与论文撰写。"},
                {u"title": u"里程碑", u"items": [u"M1 开题通过：问题、基线、数据方案明确", u"M2 数据就绪：标注规范冻结，划分固定", u"M3 检测达标：mAP 有对照表", u"M4 跟踪与分析：IDS/热力可演示", u"M5 定稿：国标文献+摘要中英对照"]},
                {u"title": u"甘特（周）", u"pre": u"周次  文献  数据  检测  跟踪  写作  规范\n1-2    ██\n3-5          ██████\n6-8                ██████\n9-10                     ████\n11-12                          ██████  ██"},
                {u"title": u"每周交付物", u"items": [u"阅读笔记 2 页或实验记录 1 张表", u"失败案例 3 张图", u"向导师同步 150 字进展（见「导师周报」模块）"]},
            ],
        ),
        "expand": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"扩写章节：1.2 研究意义与创新点", u"p": extra.get("chapter") or u"绪论"},
                {u"title": u"扩写稿（可直接粘贴后改数据）", u"pre": u"校园监控具有固定机位、行人尺度变化大、出入口周期性拥堵等特点。直接部署通用检测器，容易在远处行人上出现漏检，并在遮挡后造成轨迹中断，从而削弱后续热力与越界分析的可信度。\n\n针对上述约束，本文的工作主要体现在三个方面。第一，在检测端引入面向行人尺度的增强与损失加权，提高小目标召回。第二，在跟踪端采用低分框关联策略，降低门口场景的身份切换。第三，在应用端输出轨迹热力，并讨论本地部署与脱敏，避免只做算法堆砌。\n\n需要强调的是，上述贡献必须由实验逐条对应：检测看 mAP 与召回，跟踪看 IDF1 与 ID Switch，系统看 FPS 与可视化，而不能用一句「效果较好」概括。"},
                {u"title": u"本段还缺什么", u"items": [u"补一句相关工作差异（相对 YOLOv8+DeepSORT）", u"补数据规模（场景数、图像数）", u"删掉「具有重要意义」类空话"]},
            ],
        ),
        "rewrite": lambda: _rewrite_pack(extra.get("src") or text, model_id, model_name),
        "translate": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"中文原文（规范化学术表达）", u"pre": extra.get("src") or u"针对校园监控中的远距离小目标与门口遮挡，本文在 YOLOv8 检测器上引入尺度感知增强，并与 ByteTrack 级联，形成可输出轨迹热力的分析流水线。在含 8 个场景的自建数据上，mAP@0.5 为 86.4%。"},
                {u"title": u"英文（论文摘要/段落）", u"pre": u"To handle small-scale pedestrians and entrance occlusion in campus CCTV, we augment YOLOv8 with scale-aware training and cascade ByteTrack for trajectory heatmaps. On a self-collected set of eight scenes, the detector reaches 86.4% mAP@0.5."},
                {u"title": u"用词提醒", u"items": [u"不要把「本文」译成 this paper 每句都出现，可改 we / this thesis。", u"mAP@0.5 保持原样，不要写成 accuracy。", u"「创新」慎用 novel，改具体动作：augment / cascade / report。"]},
            ],
        ),
        "terms": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"缩写表（建议放在正文前或附录）", u"pre": u"缩写    英文全称                              中文\nmAP     mean Average Precision                 平均精度均值\nFPS     Frames Per Second                      每秒帧数\nMOT     Multiple Object Tracking               多目标跟踪\nIDS     Identity Switch                        身份切换\nIDF1    ID F1 Score                            身份 F1\nCCTV    Closed-Circuit Television              闭路监控\nNMS     Non-Maximum Suppression                非极大值抑制"},
                {u"title": u"术语统一", u"items": [u"pedestrian / 行人，不要混用「路人」「目标人」", u"bounding box / 检测框，不要「锚框」乱指", u"backbone 保留英文或写「骨干网络」，全文只选一种"]},
            ],
        ),
        "experiment": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"实验设计（可写入第4章）", u"p": u"先冻结数据划分，再比模型，再做消融，最后分析失败案例。不要边训练边改测试集。"},
                {u"title": u"必须做的对照", u"items": [u"检测：YOLOv5s / YOLOv7-tiny / YOLOv8n", u"跟踪：DeepSORT vs ByteTrack（同一检测器）", u"消融：无增强 / 仅尺度增强 / 增强+低分框关联", u"效率：1080p 输入下的 FPS 与参数量"]},
                {u"title": u"表格骨架", u"pre": u"方法            mAP@0.5  Precision  Recall  FPS\nYOLOv5s         —        —          —      —\nYOLOv7-tiny     —        —          —      —\nYOLOv8n(基线)   —        —          —      —\n本文            86.4     填写       填写    填写"},
                {u"title": u"误差分析清单", u"items": [u"夜间/逆光漏检占比", u"严重遮挡 IDS 分布", u"标注噪声是否被模型「学成」误框"]},
            ],
        ),
        "figure": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"图题（国标风格）", u"items": [u"图1  校园行人检测与轨迹分析系统总体架构", u"图2  不同场景下的检测可视化对比", u"图3  门口遮挡场景的跟踪轨迹与身份切换示例", u"图4  区域热力与越界事件示意"]},
                {u"title": u"表题", u"items": [u"表1  自建校园数据集统计", u"表2  检测性能对比", u"表3  跟踪指标对比", u"表4  消融实验结果"]},
                {u"title": u"图注写法", u"p": u"图注只说明「看什么、条件是什么」，不在图注里下结论。结论放到正文：「如图3所示，ByteTrack 在门口场景的 IDS 低于 DeepSORT。」"},
            ],
        ),
        "formula": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"符号表", u"pre": u"符号    含义\nB_t     t 时刻检测框集合\nS_i     第 i 个检测框置信度\nτ_high  高分阈值（如 0.6）\nτ_low   低分阈值（如 0.1）\nIoU     交并比"},
                {u"title": u"正文应出现的定义（示例）", u"pre": u"平均精度均值（mAP）按 COCO 风格在 IoU=0.5 处计算。身份切换（IDS）定义为同一目标被赋予新 ID 的次数。FPS 在同一硬件、同一输入分辨率下取 300 帧平均。"},
                {u"title": u"排版注意", u"items": [u"变量斜体、缩写正体", u"首次出现给中文全称", u"不要整页堆公式却无实验对应"]},
            ],
        ),
        "reproduce": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"复现实验清单", u"items": [u"环境：Python、PyTorch、CUDA 版本写进附录", u"数据：划分随机种子、标注格式（YOLO txt）", u"训练：epochs、batch、img size、预训练权重来源", u"推理：置信度阈值、NMS、输入尺寸", u"跟踪：ByteTrack 官方超参是否改动", u"随机性：至少报告 3 个种子或明确单次结果"]},
                {u"title": u"附录可用的命令草稿", u"pre": u"python train.py --data campus.yaml --model yolov8n.pt --imgsz 640 --epochs 150\npython track.py --source videos/gate.mp4 --tracker bytetrack.yaml"},
            ],
        ),
        "defense": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"答辩可能被问到的 8 题（含参考答）", u"items": [
                    u"Q 创新点到底是什么？A 不要答「结合了 YOLO 和跟踪」。答：针对校园小目标与遮挡，检测端做尺度增强，跟踪端用低分框关联，并用 IDS 验证。",
                    u"Q 为什么不用更大的模型？A 监控要近实时，YOLOv8n 是精度-速度折中；可用 YOLOv8s 作对照说明并非不会用大模型。",
                    u"Q 数据会不会泄漏？A 训练/测试按场景划分，门口视频不进入训练集。",
                    u"Q 隐私怎么办？A 本地推理，保存轨迹点而非原视频，人脸模糊。",
                    u"Q mAP 高就代表跟踪好吗？A 不。跟踪必须看 IDF1/IDS。",
                    u"Q 和 DeepSORT 差在哪？A DeepSORT 重外观；拥堵时外观不可靠，低分框关联更关键。",
                    u"Q 失败案例？A 准备夜间、雨天、校服颜色接近背景的图，不要只放成功图。",
                    u"Q 工作量在哪？A 数据构建、对照实验、系统联调与隐私设计，而不是调一个预训练权重。",
                ]},
            ],
        ),
        "ppt": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"答辩 PPT 建议 12 页", u"items": [u"1 题目、姓名、导师", u"2 问题：校园监控痛点（1 张对比图）", u"3 相关工作差异表（3 行即可）", u"4 总体架构图", u"5 检测改进", u"6 跟踪改进", u"7 数据集", u"8 检测结果表+可视化", u"9 跟踪与热力", u"10 消融/失败案例", u"11 局限与展望", u"12 总结与致谢"]},
                {u"title": u"演讲稿开头 40 秒", u"pre": u"各位老师好。我汇报的题目是校园行人检测与轨迹分析。现有方案直接套用通用检测器，在远处行人与门口遮挡上容易漏检、断轨。我做了三件事：尺度增强的检测、低分框关联的跟踪、以及可演示的热力分析，并在自建校园数据上对比了常见基线。"},
            ],
        ),
        "venue": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"先满足学位，再谈外投", u"p": u"本科毕业设计优先对齐学校模板与工作量。外投需补消融、方差和伦理，否则易被拒。"},
                {u"title": u"可选去向（示意，非投稿承诺）", u"items": [u"学位：本校本科论文 / 优秀毕业论文申请", u"中文期刊：计算机应用、计算机工程与应用（需加强对比与创新表述）", u"会议研讨：CCF C 类视觉/多媒体相关研讨会（需英文与完整实验）", u"不建议：付费乱刊、与视觉无关的普刊"]},
                {u"title": u"投稿前检查", u"items": [u"贡献是否条目化且实验一一对应", u"相关工作是否覆盖 2023 年后方法", u"是否重复投递、是否包含未授权监控人脸"]},
            ],
        ),
        "rebuttal": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"回复审稿人的结构", u"p": u"先逐条复述意见，再答「已改/部分改/保留及理由」，最后给页码。语气克制，不辩称「审稿人没看懂」。"},
                {u"title": u"示例回复", u"pre": u"审稿人 1 意见 2：缺少消融实验。\n回复：感谢指出。我们在修订稿表4 增加了「无增强 / 仅尺度增强 / 完整方法」三组消融，mAP@0.5 分别为 …、…、86.4%。相应讨论见第4.3节。"},
                {u"title": u"常见雷区", u"items": [u"不要承诺下个版本再做却不改本次", u"数字前后矛盾", u"把意见理解为人身攻击"]},
            ],
        ),
        "weekly": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"本周周报（可发给导师）", u"pre": u"【本周完成】\n1. 完成校门口场景 800 张预标注，抽查一致率约 92%。\n2. 跑通 YOLOv8n 基线，验证集 mAP@0.5 约 81.7%（单次，未平均）。\n【问题】\n逆光样本不足，晚上 18:00 后漏检明显。\n【下周计划】\n补逆光数据；加入 ByteTrack 并统计 IDS。\n【需要老师支持】\n确认监控数据使用范围是否仅限论文实验。"},
                {u"title": u"邮件标题", u"items": [u"【毕设周报】第6周 检测基线与数据进展-姓名", u"不要只发「在吗老师」"]},
            ],
        ),
        "ethics": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"数据采集与隐私（建议写入实验章或单独一节）", u"pre": u"本研究所用校园监控图像仅用于行人检测与轨迹分析实验，采集前已获得管理部门同意。训练与展示图像对人脸、校服号、车牌进行模糊。系统默认本地推理，不上传原视频。轨迹数据保存期限与访问权限由实验结束后删除或按学校规定执行。"},
                {u"title": u"原创性声明（示意，以学校模板为准）", u"pre": u"本人郑重声明：所呈交的毕业论文是本人在导师指导下独立进行研究工作所取得的成果。除文中已经注明引用的内容外，本论文不包含其他个人或集体已经发表或撰写过的研究成果。"},
                {u"title": u"致谢草稿", u"pre": u"感谢导师在选题收窄、实验对照与论文规范上的指导。感谢实验室同学在标注与设备上的帮助。文中错误由本人负责。"},
            ],
        ),
        "diff": lambda: _pack(
            model_id,
            model_name,
            [
                {u"title": u"两稿对照（初稿 → 修改稿）", u"items": [u"摘要：由空泛背景改为问题-方法-数据-指标-局限五句。", u"创新点：由「结合现有方法」改为可检验的检测/跟踪差异。", u"实验：补对照表表头，仍缺消融数字。", u"文献：开始按 GB/T 7714 编号，仍有 3 条缺页码。"]},
                {u"title": u"还没改到的高优先级", u"items": [u"讨论章失败案例", u"隐私段落", u"IDF1 指标"]},
            ],
        ),
    }
    fn = catalog.get(action)
    if not fn:
        return None
    data = fn()
    data["source"] = filename or topic
    data["topic"] = topic
    return data


EXTRA_PROMPTS = {
    "topic": "评估论文选题可行性，给分数、空白、风险与题目改写。JSON。",
    "proposal": "生成开题报告：依据、内容、方案、进度、成果。",
    "litreview": "按技术线写文献综述结构与可粘贴段落，避免编年体。",
    "schedule": "生成任务书目标、里程碑、甘特与每周交付物。",
    "expand": "把指定章节扩写成可粘贴的学术段落，并指出还缺什么。",
    "rewrite": "学术降重：给出改写对照，禁止无意义同义替换。",
    "translate": "中英文学术互译，保留指标符号，给用词提醒。",
    "terms": "生成缩写表与术语统一建议。",
    "experiment": "设计对照、消融、表格骨架与误差分析。",
    "figure": "给出图题表题与图注写法。",
    "formula": "符号表与指标定义的规范表述。",
    "reproduce": "复现实验清单与命令草稿。",
    "defense": "答辩提问与参考回答。",
    "ppt": "答辩PPT页序与开场讲稿。",
    "venue": "学位与期刊会议去向建议，强调先满足学位。",
    "rebuttal": "审稿意见回复模板。",
    "weekly": "导师周报与邮件标题。",
    "ethics": "隐私、原创声明与致谢草稿。",
    "diff": "两版稿件的进步与未改项。",
}
