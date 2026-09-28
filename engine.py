# -*- coding: utf-8 -*-
"""论小研：文档解析、国内大模型接入与演示回退。"""
from __future__ import print_function

import hashlib
import json
import os
import re
import time

import requests

from extras import EXTRA_PROMPTS, extra_demos

# 智谱密钥只调智谱。两个通义千问走硅基流动，要另一把密钥。
FREE_MODELS = {
    "glm-4-flash": {"api": "glm-4-flash", "thinking": False, "provider": "zhipu"},
    "glm-4-flash-250414": {"api": "glm-4-flash-250414", "thinking": False, "provider": "zhipu"},
    "glm-4.7-flash": {"api": "glm-4.7-flash", "thinking": True, "provider": "zhipu"},
    "glm-4.5-flash": {"api": "glm-4.5-flash", "thinking": True, "provider": "zhipu"},
    "glm-z1-flash": {"api": "glm-z1-flash", "thinking": True, "provider": "zhipu"},
    "qwen25-7b": {"api": "Qwen/Qwen2.5-7B-Instruct", "thinking": False, "provider": "silicon"},
    "qwen35-4b": {"api": "Qwen/Qwen3.5-4B", "thinking": True, "provider": "silicon"},
}

PROVIDERS = {
    "zhipu": {
        "url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        "env": "ZHIPU_API_KEY",
    },
    "silicon": {
        "url": "https://api.siliconflow.cn/v1/chat/completions",
        "env": "SILICONFLOW_API_KEY",
    },
}

MODELS = [
    {
        "id": "glm-4-flash",
        "name": "智谱清言 4-Flash",
        "tag": "最快，推荐",
        "vendor": "智谱 AI",
        "desc": "短回复快，适合对话和改写",
    },
    {
        "id": "glm-4-flash-250414",
        "name": "智谱清言 4-Flash-250414",
        "tag": "长文本",
        "vendor": "智谱 AI",
        "desc": "上下文更长，适合整章对照",
    },
    {
        "id": "glm-4.7-flash",
        "name": "智谱清言 4.7-Flash",
        "tag": "写作",
        "vendor": "智谱 AI",
        "desc": "中文写作和结构更稳",
    },
    {
        "id": "glm-4.5-flash",
        "name": "智谱清言 4.5-Flash",
        "tag": "均衡",
        "vendor": "智谱 AI",
        "desc": "评估、大纲和文献整理",
    },
    {
        "id": "glm-z1-flash",
        "name": "智谱清言 Z1-Flash",
        "tag": "深度推理",
        "vendor": "智谱 AI",
        "desc": "先推理再回答，适合审稿和答辩",
    },
    {
        "id": "qwen25-7b",
        "name": "通义千问 2.5-7B",
        "tag": "对话",
        "vendor": "阿里云",
        "desc": "通义小模型，适合问答和改写",
    },
    {
        "id": "qwen35-4b",
        "name": "通义千问 3.5-4B",
        "tag": "写作",
        "vendor": "阿里云",
        "desc": "通义轻量模型，适合段落写作",
    },
]

DEMO_THESIS = """题目：基于深度学习的校园行人检测与轨迹分析系统

摘要：随着智慧校园建设推进，传统监控依赖人工值守，漏检率高。本文设计并实现了一套基于 YOLOv8 的校园行人检测与轨迹分析系统，结合 ByteTrack 完成多目标跟踪，并在自建校园数据集上验证。实验表明，模型 mAP@0.5 达到 86.4%，较基线提升 4.7 个百分点。但摘要对创新点、实验设置与局限交代不足，讨论部分偏描述性。

关键词：行人检测；YOLOv8；多目标跟踪；智慧校园

1 绪论
校园安防与人流管理对实时行人感知提出需求。现有方案多直接套用通用检测器，对遮挡、逆光、小目标适应性不足。本文研究目标是构建面向校园场景的检测-跟踪-分析流水线。

2 相关工作
综述了 Faster R-CNN、YOLO 系列与 DeepSORT / ByteTrack。文献覆盖较全，但对校园特定场景的对比实验偏少，缺少与 Transformer 检测器的讨论。

3 方法设计
系统包括数据增强、YOLOv8n 检测、ByteTrack 跟踪与热力分析模块。创新点表述停留在“结合现有方法”，差异化论证不足。

4 实验验证
数据集含 8 个校园场景、12,400 张标注图像。对比 YOLOv5s、YOLOv7-tiny。给出精确率、召回率与 FPS，但缺少消融实验与误差分析。

5 总结与展望
验证了方法可行性，未来将引入夜间红外数据与隐私脱敏。参考文献格式混用 GB/T 7714 与会议默认格式，部分条目缺卷期页码。

参考文献
[1] Redmon J, Farhadi A. YOLOv3: An Incremental Improvement[J]. arXiv, 2018.
[2] Zhang Y, et al. ByteTrack: Multi-Object Tracking by Associating Every Detection Box[C]//ECCV, 2022.
[3] 王磊. 智慧校园视频监控关键技术研究[D]. 某大学, 2023.
"""

SYSTEM_PROMPTS = {
    "chat": "你是论小研，面向本科生与研究生的科研论文写作助手。回答要具体、可执行，使用中文，必要时给出段落示例。不要空泛鼓励。",
    "evaluate": "你是论文评审助手。根据文稿给出 0-100 综合评分、学术规范重合度估计（百分比，仅作表述规范与原创性提示，非查重鉴定）、优点、不足、改进建议、分项评分。用 JSON 输出。",
    "outline": "你是科研写作规划助手。按主题生成 5 章大纲、8 篇核心文献（可合理虚构符合领域的经典/近期文献并标明类型）、3 个研究问题。每条给撰写要点与引用建议。JSON 输出。",
    "coach": "你是论文写作导师。根据章节给出引导题、参考表述，并对学生作答从优点、不足、改写建议点评，给 0-10 分。",
    "polish": "你是学术中文润色编辑。分析语言、逻辑、学术表达，给 0-10 分，列出亮点、逻辑通顺度、优化方向与改写示例。JSON。",
    "abstract": "你是学报编辑。按目标要求生成中文摘要、英文摘要、3-5 个中文关键词与对应英文关键词。",
    "refs": "你是参考文献编辑，按 GB/T 7714-2015 顺序编码制整理条目，纠正残缺字段并给出校验说明。",
    "path": "你是研究生导师。根据专业、技能、兴趣与作业文本，给出短期（3个月）与中长期（1-2年）科研路径。",
    "submit": "你是投稿顾问。对照期刊/学位规范与论文初稿，给出格式、内容侧重、结构优化建议。",
    "reviewer": "你按指定审稿人风格写评审意见、修改建议与返修提问。",
    "retrospect": "你对照多份历史评估/润色记录，总结进步点、遗留问题与后续优化优先级。",
    "pipeline": "你对论文执行全流程：评估、大纲优化、润色要点、参考文献问题，输出完整优化报告。",
}
SYSTEM_PROMPTS.update(EXTRA_PROMPTS)


def model_name(model_id):
    for m in MODELS:
        if m["id"] == model_id:
            return u"%s（%s）" % (m["name"], m["tag"])
    return u"智谱清言 4-Flash（最快，推荐）"


def _clip(text, n=6000):
    text = text or ""
    if len(text) <= n:
        return text
    return text[:n] + u"\n…（原文已截断）"


def parse_bytes(filename, data):
    name = filename or "upload.txt"
    ext = os.path.splitext(name)[1].lower()
    tmp_dir = os.path.join(os.path.dirname(__file__), "data", "uploads")
    if not os.path.isdir(tmp_dir):
        os.makedirs(tmp_dir)
    path = os.path.join(tmp_dir, "tmp_%s%s" % (int(time.time() * 1000), ext or ".txt"))
    with open(path, "wb") as f:
        f.write(data)
    try:
        return parse_path(path, name)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def parse_path(path, original_name=None):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".txt", ".md", ""):
        for enc in ("utf-8", "gbk", "utf-16"):
            try:
                with open(path, "r", encoding=enc) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue
        with open(path, "rb") as f:
            return f.read().decode("utf-8", "ignore")
    if ext == ".docx":
        from docx import Document

        doc = Document(path)
        parts = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    parts.append(" | ".join(cells))
        return "\n".join(parts) or u"（文档无文本段落）"
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(path)
        chunks = []
        for page in reader.pages:
            chunks.append(page.extract_text() or "")
        text = "\n".join(chunks).strip()
        return text or u"（未能从 PDF 提取到文本，请改用 docx/txt）"
    raise ValueError(u"暂不支持该格式，请上传 docx、pdf 或 txt")


def provider_status():
    return {
        "zhipu": bool(os.environ.get("ZHIPU_API_KEY")),
        "silicon": bool(os.environ.get("SILICONFLOW_API_KEY")),
        "deepseek": bool(os.environ.get("DEEPSEEK_API_KEY")),
        "qwen": bool(os.environ.get("DASHSCOPE_API_KEY")),
        "kimi": bool(os.environ.get("MOONSHOT_API_KEY")),
        "ernie": bool(os.environ.get("BAIDU_API_KEY") and os.environ.get("BAIDU_SECRET_KEY")),
        "spark": bool(os.environ.get("SPARK_API_KEY")),
    }


def health_status():
    status = provider_status()
    online = any(status.values())
    return {
        "ok": True,
        "message": u"服务启动成功、模型加载正常",
        "demo": not online,
        "providers": status,
        "default_model": "glm-4-flash",
        "models": MODELS,
    }


def _strip_think(text):
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S)
    return text.strip()


def _openai_chat(url, api_key, model, messages, extra_headers=None, extra_body=None):
    headers = {
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": 2048,
    }
    if extra_body:
        payload.update(extra_body)
    resp = requests.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    data = resp.json()
    message = data["choices"][0]["message"]
    return _strip_think(message.get("content") or "")


def _ernie_chat(messages):
    key = os.environ.get("BAIDU_API_KEY")
    secret = os.environ.get("BAIDU_SECRET_KEY")
    token_url = (
        "https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=%s&client_secret=%s"
        % (key, secret)
    )
    token = requests.post(token_url, timeout=20).json().get("access_token")
    if not token:
        raise RuntimeError("ernie token failed")
    url = "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions_pro?access_token=" + token
    ernie_msgs = []
    system = ""
    for m in messages:
        if m["role"] == "system":
            system = m["content"]
        else:
            ernie_msgs.append({"role": m["role"], "content": m["content"]})
    body = {"messages": ernie_msgs}
    if system:
        body["system"] = system
    data = requests.post(url, json=body, timeout=90).json()
    if "result" not in data:
        raise RuntimeError(data.get("error_msg") or "ernie failed")
    return data["result"]


def call_llm(model_id, system, user, history=None):
    messages = [{"role": "system", "content": system}]
    if history:
        for h in history[-8:]:
            role = h.get("role") or "user"
            if role not in ("user", "assistant"):
                continue
            messages.append({"role": role, "content": h.get("content") or ""})
    messages.append({"role": "user", "content": user})

    spec = FREE_MODELS.get(model_id) or FREE_MODELS["glm-4-flash"]
    provider = PROVIDERS[spec["provider"]]
    key = os.environ.get(provider["env"])
    if not key:
        return None, True
    extra = None
    if spec["thinking"] and spec["provider"] == "zhipu":
        extra = {"thinking": {"type": "disabled"}}
    elif spec["thinking"]:
        extra = {"enable_thinking": False}
    try:
        text = _openai_chat(
            provider["url"],
            key,
            spec["api"],
            messages,
            extra_body=extra,
        )
        return text, False
    except Exception:
        return None, True


def _is_demo_thesis(filename, text):
    blob = (filename or "") + (text or "")
    return (u"计算机专业本科毕业论文" in blob) or (u"校园行人检测" in blob)


def _stable(text, lo, hi):
    h = int(hashlib.md5((text or "x").encode("utf-8")).hexdigest()[:8], 16)
    return lo + (h % (hi - lo + 1))


def _guess_topic(text, filename):
    if _is_demo_thesis(filename, text):
        return u"基于深度学习的校园行人检测与轨迹分析"
    first = ""
    for line in (text or "").splitlines():
        line = line.strip()
        if line:
            first = line[:80]
            break
    name = os.path.splitext(filename or "")[0]
    if u"题目" in first or u"基于" in first:
        return re.sub(r"^题目[:：]\s*", "", first)
    if name and name not in (u"upload", u"未命名"):
        return name
    return first or u"未命名研究主题"


def demo_evaluate(text, filename, model_id):
    demo = _is_demo_thesis(filename, text)
    score = 72 if demo else _stable(text, 64, 82)
    overlap = 11.2 if demo else round(6.5 + _stable(text, 0, 90) / 10.0, 1)
    topic = _guess_topic(text, filename)
    return {
        "mode": "demo",
        "source": filename or u"未命名文稿",
        "topic": topic,
        "score": score,
        "overlap": overlap,
        "dimensions": {
            u"选题价值": 80 if demo else _stable(text + "a", 70, 88),
            u"结构完整": 74 if demo else _stable(text + "b", 68, 86),
            u"方法创新": 66 if demo else _stable(text + "c", 58, 80),
            u"实验充分": 70 if demo else _stable(text + "d", 60, 84),
            u"文献综述": 78 if demo else _stable(text + "e", 65, 88),
            u"学术规范": 61 if demo else _stable(text + "f", 55, 82),
        },
        "strengths": [
            u"研究思路清晰，检测—跟踪—分析流水线完整，问题来源贴合智慧校园场景。",
            u"实验数据相对完整，包含多场景自建数据与 mAP、FPS 等核心指标。",
            u"文献覆盖全面，YOLO 系列与多目标跟踪主线交代清楚。",
        ],
        "weaknesses": [
            u"摘要信息量不足：创新点、数据规模、局限与结论未同时交代。",
            u"讨论部分深度不够，结果解释停留在数字罗列，缺少误差与失败案例分析。",
            u"格式不规范，参考文献混用多种体例，部分条目缺卷期或页码。",
        ],
        "suggestions": [
            u"在绪论与摘要中单独成段论述创新点：校园小目标/逆光增强、跟踪关联策略与热力分析的组合贡献。",
            u"补充消融实验（数据增强、跟踪器、输入尺度）与至少一组 SOTA 对比。",
            u"按 GB/T 7714-2015 顺序编码制统一参考文献，并核对每条必要字段。",
        ],
        "summary": u"文稿《%s》综合评分 %s / 100，学术规范重合度约 %s%%（用于提示表述规范与原创性，不替代正式查重）。建议优先补强创新点论证、实验对比与参考文献格式。"
        % (filename or topic, score, overlap),
        "model": model_name(model_id),
    }


def demo_outline(topic, text, model_id):
    topic = topic or _guess_topic(text, "")
    chapters = [
        {
            "title": u"第1章 绪论",
            "points": u"交代校园安防/人流管理背景、现有检测器在遮挡与小目标上的不足、本文研究目标与章节安排。",
            "cite": u"建议引用智慧城市安防综述 + 检测领域里程碑工作，避免只堆产品宣传。",
        },
        {
            "title": u"第2章 相关工作",
            "points": u"按两阶段检测、YOLO 系列、Transformer 检测器、多目标跟踪四条线对比，指出校园场景缺口。",
            "cite": u"每条技术线至少 2 篇代表性文献，末段明确“本文定位”。",
        },
        {
            "title": u"第3章 方法设计",
            "points": u"给出系统架构图：数据增强、检测、跟踪、轨迹分析。用公式/伪代码说明与现有方案的差异。",
            "cite": u"方法章引用应服务于“为何这样改”，不要把文献综述再写一遍。",
        },
        {
            "title": u"第4章 实验验证",
            "points": u"数据集划分、评价指标、对比实验、消融实验、可视化与误差分析、效率评估。",
            "cite": u"对比方法需给出出处；若复现，注明官方实现或自复现。",
        },
        {
            "title": u"第5章 总结与展望",
            "points": u"归纳贡献、承认局限（夜间、隐私、极端遮挡），给出可检验的后续工作。",
            "cite": u"展望可点到新兴方向文献，但不要引入未实验的夸大结论。",
        },
    ]
    papers = [
        {u"title": u"YOLOv3: An Incremental Improvement", u"meta": u"Redmon & Farhadi, arXiv, 2018", u"why": u"单阶段检测演进的基础对照。"},
        {u"title": u"YOLOv8 官方技术报告与 Ultralytics 实现", u"meta": u"Jocher et al., 2023", u"why": u"本文基线模型来源，需说明版本与配置。"},
        {u"title": u"ByteTrack: Multi-Object Tracking by Associating Every Detection Box", u"meta": u"Zhang et al., ECCV 2022", u"why": u"跟踪模块核心方法。"},
        {u"title": u"Simple Online and Realtime Tracking with a Deep Association Metric (DeepSORT)", u"meta": u"Wojke et al., ICIP 2017", u"why": u"作为跟踪对照，突出 ByteTrack 的低分框关联。"},
        {u"title": u"Focal Loss for Dense Object Detection", u"meta": u"Lin et al., ICCV 2017", u"why": u"解释小目标/类别不平衡时可引用。"},
        {u"title": u"智慧校园视频监控中的行人感知综述", u"meta": u"国内学报/会议综述，2022–2024", u"why": u"把问题落到校园场景，而不是通用 COCO。"},
        {u"title": u"CrowdHuman / CityPersons 等行人检测基准", u"meta": u"Shao et al.; Zhang et al.", u"why": u"讨论域迁移与自建校园数据的必要性。"},
        {u"title": u"GB/T 7714-2015 信息与文献 参考文献著录规则", u"meta": u"国家标准", u"why": u"本科论文参考文献格式依据。"},
    ]
    questions = [
        {
            "q": u"校园逆光、遮挡与远距离小目标条件下，轻量检测器如何在精度与边缘设备帧率之间折中？",
            "hint": u"可从输入尺度、蒸馏、检测头解耦切入，避免只调参。",
        },
        {
            "q": u"低分检测框对轨迹连续性的贡献有多大，是否会引入身份切换？",
            "hint": u"用 IDF1、ID Switch 做对照，而不是只看 MOTA。",
        },
        {
            "q": u"轨迹热力与越界事件如何在保护人脸隐私的前提下服务校园管理？",
            "hint": u"可讨论模糊化、只存轨迹点、本地推理。",
        },
    ]
    return {
        "mode": "demo",
        "topic": topic,
        "chapters": chapters,
        "papers": papers,
        "questions": questions,
        "model": model_name(model_id),
    }


def demo_coach(chapter, answer, model_id):
    chapter = chapter or u"绪论 / 创新点"
    has_ans = bool((answer or "").strip())
    score = 8.2 if has_ans and len(answer) > 80 else (6.4 if has_ans else None)
    return {
        "mode": "demo",
        "chapter": chapter,
        "prompt": u"请阐述本研究的核心创新点与现有方案的差异。要求：1）点明场景约束；2）说明方法组合而非口号；3）用一句可检验的实验预期收束。",
        "reference": u"与直接部署通用 YOLOv8 不同，本文面向校园监控的逆光与远距离小目标，设计了针对行人尺度的多尺度增强，并将 ByteTrack 的低分框关联引入门口与走廊高遮挡场景，使轨迹中断率下降。该差异将通过与 YOLOv8n+DeepSORT 的 ID Switch 对比加以验证，而不是仅比较 mAP。",
        "score": score,
        "strengths": [
            u"能够把问题落到校园场景，而不是复述算法名词。",
            u"尝试同时覆盖检测与跟踪，方向正确。",
        ]
        if has_ans
        else [],
        "weaknesses": [
            u"创新点仍偏“组合现有模块”，未写清每一个改动解决哪一个可观察问题。",
            u"缺少可检验表述（指标、对照、场景）。",
        ]
        if has_ans
        else [u"尚未作答。建议先写 180–250 字，包含场景、方法差异、验证指标三要素。"],
        "rewrite": u"现有校园监控方案多直接套用通用检测器，在逆光与远处行人上召回不足，且遮挡后轨迹易中断。针对该问题，本文在检测端引入面向行人尺度的增强与损失加权，在跟踪端采用低分框关联以降低门口拥堵时的身份切换。预期在自建校园集上，mAP@0.5 不低于基线 +3 个百分点，ID Switch 明显下降。",
        "next_chapter": u"相关工作：请用一段话说明本文与 YOLOv8 + DeepSORT 基线的文献定位。",
        "model": model_name(model_id),
    }


def demo_polish(text, filename, model_id):
    demo = _is_demo_thesis(filename, text)
    score = 7.1 if demo else round(_stable(text, 60, 85) / 10.0, 1)
    return {
        "mode": "demo",
        "source": filename or u"论文初稿",
        "score": score,
        "logic": u"中等偏上：章节顺序完整，但段内常见“本文提出…从而…”空转句，讨论未回应实验数字。",
        "highlights": [
            u"技术主线清楚，检测与跟踪任务边界明确。",
            u"实验部分已出现可引用的核心数字，具备改写成规范摘要的基础。",
        ],
        "directions": [
            u"摘要按“问题—方法—数据—指标—局限”五句压缩，删除空泛背景。",
            u"方法章用“动机→改动→预期效果”改写创新点，避免“结合了 A 和 B”。",
            u"讨论段解释失败案例（夜间、遮挡），不要重复结果表。",
        ],
        "examples": [
            {
                "before": u"本文结合现有深度学习方法，设计了一套较为完善的校园行人检测系统，具有一定的实际意义。",
                "after": u"针对校园监控中的远距离小目标与门口遮挡，本文在 YOLOv8 检测器上引入尺度感知增强，并与 ByteTrack 级联，形成可输出轨迹热力的分析流水线。",
            },
            {
                "before": u"实验结果表明本文方法效果较好，优于部分传统算法。",
                "after": u"在含 8 个场景的自建校园集上，方法 mAP@0.5 为 86.4%，较 YOLOv5s 基线提升 4.7 个百分点；1080p 输入下可达实时处理。",
            },
        ],
        "model": model_name(model_id),
    }


def demo_abstract(text, requirement, model_id):
    req = requirement or u"本科毕业论文摘要"
    return {
        "mode": "demo",
        "requirement": req,
        "zh": u"校园监控依赖人工值守，通用行人检测器在逆光、遮挡与远距离小目标场景下漏检明显。本文设计并实现基于 YOLOv8 的校园行人检测与轨迹分析系统：在检测端引入面向行人尺度的数据增强，在跟踪端采用 ByteTrack 低分框关联，并输出区域热力与越界事件。实验在含 8 个场景、12,400 张图像的自建校园数据集上进行。结果表明，模型 mAP@0.5 达到 86.4%，较对比基线提升 4.7 个百分点，并可满足近实时分析需求。研究仍受夜间成像与隐私保护约束，后续将补充红外数据与本地脱敏推理。",
        "en": u"Manual campus surveillance is error-prone, and generic pedestrian detectors degrade under backlight, occlusion, and small-scale targets. This thesis presents a YOLOv8-based campus pedestrian detection and trajectory analysis system that combines scale-aware augmentation, ByteTrack association, and heatmap/event analytics. Experiments on a self-collected dataset (8 scenes, 12,400 images) show 86.4% mAP@0.5, 4.7 points above the baseline, with near real-time throughput. Night-time imaging and privacy constraints remain limitations.",
        "keywords_zh": [u"行人检测", u"YOLOv8", u"多目标跟踪", u"智慧校园", u"轨迹分析"],
        "keywords_en": [
            "Pedestrian Detection",
            "YOLOv8",
            "Multi-Object Tracking",
            "Smart Campus",
            "Trajectory Analysis",
        ],
        "model": model_name(model_id),
    }


def demo_refs(raw, standard, model_id):
    standard = standard or u"GB/T 7714-2015 顺序编码制"
    items = [
        u"[1] REDMON J, FARHADI A. YOLOv3: An incremental improvement[EB/OL]. (2018-04-08)[2026-06-01]. https://arxiv.org/abs/1804.02767.",
        u"[2] ZHANG Y, SUN P, JIANG Y, et al. ByteTrack: Multi-object tracking by associating every detection box[C]//European Conference on Computer Vision. Cham: Springer, 2022: 1-21.",
        u"[3] WOJKE N, BEWLEY A, PAULUS D. Simple online and realtime tracking with a deep association metric[C]//IEEE International Conference on Image Processing. Piscataway: IEEE, 2017: 3645-3649.",
        u"[4] 王磊. 智慧校园视频监控关键技术研究[D]. 南京: 某大学, 2023.",
        u"[5] 国家质量监督检验检疫总局, 国家标准化管理委员会. GB/T 7714—2015 信息与文献 参考文献著录规则[S]. 北京: 中国标准出版社, 2015.",
    ]
    notes = [
        u"已按顺序编码制重新编号；英文著者姓全大写、名缩写。",
        u"会议论文补全出版地/出版社信息（示意字段，请用原始题录替换）。",
        u"学位论文补全出版地；请核实证人姓名与年份。",
        u"原文中 arXiv 条目缺规范电子资源著录，已按 EB/OL 处理。",
    ]
    extra = []
    for line in (raw or "").splitlines():
        line = line.strip()
        if line and not line.startswith("["):
            extra.append(line)
        elif line.startswith("[") and u"YOLOv3" not in line and u"ByteTrack" not in line:
            extra.append(line)
    return {
        "mode": "demo",
        "standard": standard,
        "formatted": "\n".join(items),
        "notes": notes,
        "raw_kept": extra[:12],
        "model": model_name(model_id),
    }


def demo_path(major, skills, interest, text, model_id):
    major = major or u"计算机科学与技术"
    skills = skills or u"Python、PyTorch 入门、OpenCV"
    interest = interest or u"计算机视觉 / 智慧校园"
    return {
        "mode": "demo",
        "profile": {"major": major, "skills": skills, "interest": interest},
        "short": [
            {u"week": u"第 1–4 周", u"item": u"精读 YOLO 与 ByteTrack 原文，复现官方最小 demo，写 2 页阅读笔记（问题、方法、指标、局限）。"},
            {u"week": u"第 5–8 周", u"item": u"在公开行人数据上跑通训练—验证—可视化，学会看 PR 曲线与失败案例。"},
            {u"week": u"第 9–12 周", u"item": u"采集/标注一个小规模校园场景子集，完成基线对比表，形成开题级问题陈述。"},
        ],
        "mid": [
            u"方向一：面向边缘设备的校园行人检测压缩与蒸馏。",
            u"方向二：遮挡场景下的身份保持跟踪与事件检测。",
            u"方向三：隐私保护的本地轨迹分析（不上云原视频）。",
        ],
        "courses": [
            u"补：概率图模型/最优化基础，避免只会调包。",
            u"补：学术英语摘要句式与 GB/T 7714 著录。",
            u"练：每周一页“失败案例分析”，训练讨论章写作。",
        ],
        "model": model_name(model_id),
    }


def demo_submit(guide, text, filename, model_id):
    return {
        "mode": "demo",
        "source": filename or u"论文初稿",
        "guide_digest": (guide or u"（未粘贴规范，按通用本科毕业论文要求对照）")[:280],
        "format": [
            u"摘要独立成页，中英文摘要与关键词对应；英文关键词实词首字母大写。",
            u"正文用宋体小四、1.5 倍行距（以学校模板为准），图题表题编号连续。",
            u"参考文献严格 GB/T 7714-2015 顺序编码制，文内引用与文末编号一一对应。",
        ],
        "focus": [
            u"学位要求通常强调问题来源、工作量与可复现实验，需把自建数据规模写清楚。",
            u"若目标是期刊，需压缩教材式背景，把贡献条目化，并补相关工作的“差异表”。",
            u"讨论章增加威胁效度：标注偏差、场景泛化、隐私伦理。",
        ],
        "structure": [
            u"将“系统实现细节”降为附录或方法小节，避免冲淡研究问题。",
            u"结果与讨论拆分：结果只陈述，讨论才解释。",
            u"结论避免“较好/一定意义”，改为可引用的定量句。",
        ],
        "model": model_name(model_id),
    }


def demo_reviewer(style, text, filename, model_id):
    styles = {
        "gentle": {
            "label": u"温和导师型",
            "overall": u"这是一份方向正确、可继续打磨的本科论文初稿。问题来自真实校园场景，技术路线完整。当前主要问题不是“会不会做”，而是“有没有把贡献说清楚、把实验做完整”。建议按下面三条优先修改，不必推倒重来。",
            "comments": [
                u"摘要可以先写五句话：要解决什么、做了什么、数据是什么、最好成绩、还缺什么。",
                u"创新点请改成可检验的差异，例如“低分框关联使门口场景 ID Switch 下降”。",
                u"参考文献先统一国标，再补 2–3 篇 2023 年后的检测/跟踪工作。",
            ],
            "questions": [
                u"自建数据的标注规范是什么？如何保证类别一致性？",
                u"夜间与强逆光样本占比多少？是否 Stratified 划分？",
            ],
        },
        "strict": {
            "label": u"严格学术型",
            "overall": u"稿件完成度中等。方法描述偏工程堆砌，实验缺少消融与统计显著性，相关工作未覆盖 DETR 类检测器。在当前证据下，不宜声称“系统创新”。需大幅加强对比完整性与威胁效度分析，否则难以达到严谨本科优秀论文或外投会议的标准。",
            "comments": [
                u"贡献必须条目化，并在实验中逐条对应；无法对应的句子删除。",
                u"补全 YOLOv8n / YOLOv8s / RT-DETR 至少一组对照，报告均值±方差。",
                u"跟踪指标不得只用 mAP 间接说明，必须给 IDF1 与 IDS。",
                u"伦理与隐私：人脸与学生身份信息的处理方式必须写明。",
            ],
            "questions": [
                u"请给出与官方 YOLOv8 默认配置的差异清单，否则无法判断贡献归属。",
                u"请说明测试集是否与训练场景空间重叠，是否存在数据泄漏。",
                u"请提供失败案例的量化分布，而不是只展示成功可视化。",
            ],
        },
        "cross": {
            "label": u"交叉学科评审",
            "overall": u"从计算机视觉角度看，流水线合理；从公共管理/校园治理角度看，热力与越界事件的可用性、误报成本与隐私合规几乎未被讨论。建议增加“谁用、何时用、误报怎么办”的一节，否则应用贡献薄弱。同时可与交通行人感知、安防伦理文献对话。",
            "comments": [
                u"补一个最小可用的管理侧评价：值班人员是否减少漏报、误报是否可接受。",
                u"与智能交通行人检测文献对比域差异（相机高度、密度、着装）。",
                u"讨论 GDPR/个人信息保护法视角下的本地部署与脱敏。",
            ],
            "questions": [
                u"轨迹数据保存多久？谁有权限？是否只存点而不存原视频？",
                u"系统如何避免把正常集会误判为异常聚集？",
            ],
        },
    }
    pack = styles.get(style) or styles["gentle"]
    pack = dict(pack)
    pack.update(
        {
            "mode": "demo",
            "style": style,
            "source": filename or u"论文初稿",
            "model": model_name(model_id),
        }
    )
    return pack


def demo_retrospect(records, model_id):
    n = len(records or [])
    return {
        "mode": "demo",
        "count": n,
        "progress": [
            u"已能稳定给出问题背景与技术主线，不再停在空泛“深度学习很重要”。",
            u"实验数字开始进入摘要与结论，具备定量表达意识。",
            u"知道参考文献需要国标，格式问题从“没意识到”变成“待统一”。",
        ],
        "remain": [
            u"创新点仍容易写成模块清单，缺少与指标一一对应。",
            u"讨论章深度不够，失败案例与伦理隐私仍是空白。",
            u"相关工作对 Transformer 检测器与近年跟踪方法覆盖不足。",
        ],
        "priority": [
            {u"level": u"P0", u"item": u"重写摘要与贡献条目，并补消融/对照表。"},
            {u"level": u"P1", u"item": u"统一 GB/T 7714 文献，核对文内引用。"},
            {u"level": u"P2", u"item": u"增加失败案例、夜间场景与隐私处理说明。"},
        ],
        "model": model_name(model_id),
    }


def demo_pipeline(text, filename, model_id):
    ev = demo_evaluate(text, filename, model_id)
    pol = demo_polish(text, filename, model_id)
    refs = demo_refs(text, u"GB/T 7714-2015 顺序编码制", model_id)
    out = demo_outline(_guess_topic(text, filename), text, model_id)
    return {
        "mode": "demo",
        "source": filename or u"论文初稿",
        "steps": [
            {u"name": u"内容评估", u"ok": True},
            {u"name": u"大纲优化", u"ok": True},
            {u"name": u"语言润色", u"ok": True},
            {u"name": u"参考文献整理", u"ok": True},
            {u"name": u"生成完整优化报告", u"ok": True},
        ],
        "evaluate": ev,
        "outline": out,
        "polish": pol,
        "refs": refs,
        "model": model_name(model_id),
    }


def demo_chat(scene, question, model_id):
    q = question or ""
    if u"大纲" in q:
        body = u"本科论文大纲建议五章：绪论（问题与贡献）、相关工作（差异表）、方法、实验（对比+消融+失败案例）、总结。每章先写“本章要回答的一个问题”，再列小节，避免先堆材料。"
    elif u"摘要" in q:
        body = u"摘要按五句写：问题、方法、数据、主要指标、局限。不要出现“意义重大”“首次尝试探索”。英文摘要与中文信息对齐，时态用一般现在/过去即可。"
    elif u"文献" in q:
        body = u"文献总结不要按时间流水账。按技术线分组：检测、跟踪、校园/安防应用。每组用“共识—分歧—空白—本文位置”四句收束，并预留 2 篇 近两年文献。"
    elif u"降重" in q or u"查重" in q:
        body = u"降重的正确方式是改写知识结构：换成你的数据、你的失败案例、你的参数表，而不是同义替换。方法段用自己的流程图编号解释。规范重合度高时先查是否大段改写了开源 README。"
    elif u"开题" in q:
        body = u"开题报告抓住三问：研究什么现象、现有方法卡在哪、你准备用什么证据证明你的改动有效。附 12 周计划与风险（数据、算力、伦理）。"
    else:
        scene_map = {
            "writing": u"写作上先定“读者能带走的一句话”，再扩段落。每段只服务一个主张，主张后面必须跟证据（文献、公式、实验）。",
            "lit": u"文献辅助时建立表格：年份、任务、数据、指标、局限。创新点从“局限列”长出来，而不是从形容词长出来。",
            "guide": u"选题宁小勿大。校园行人检测可以收窄到“门口遮挡下的轨迹连续”或“边缘设备上的小目标召回”。",
        }
        body = scene_map.get(scene, scene_map["writing"])
    return {
        "mode": "demo",
        "reply": body + u"\n\n（当前为演示模式回复；配置智谱/DeepSeek/千问等 API 密钥后可切换为在线推理。）",
        "model": model_name(model_id),
    }


def _try_json(text):
    if not text:
        return None
    text = text.strip()
    m = re.search(r"```json(.*?)```", text, re.S)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except Exception:
                return None
    return None


def run_module(action, payload):
    model_id = payload.get("model") or "glm-4-flash"
    text = payload.get("text") or ""
    filename = payload.get("filename") or ""
    extra = payload.get("extra") or {}
    history = payload.get("history") or []

    user_map = {
        "chat": u"场景：%s\n问题：%s\n附加文稿：%s"
        % (extra.get("scene") or "writing", extra.get("question") or text, _clip(text, 2500)),
        "evaluate": u"文件名：%s\n请评估：\n%s" % (filename, _clip(text)),
        "outline": u"主题：%s\n文稿：\n%s" % (extra.get("topic") or _guess_topic(text, filename), _clip(text, 3500)),
        "coach": u"章节：%s\n学生作答：%s\n文稿摘录：%s"
        % (extra.get("chapter") or "", extra.get("answer") or "", _clip(text, 2500)),
        "polish": u"文件：%s\n%s" % (filename, _clip(text)),
        "abstract": u"要求：%s\n正文：\n%s" % (extra.get("requirement") or u"本科毕业论文摘要", _clip(text)),
        "refs": u"标准：%s\n条目：\n%s" % (extra.get("standard") or u"GB/T 7714-2015 顺序编码制", _clip(text, 4000)),
        "path": u"专业：%s\n技能：%s\n兴趣：%s\n作业：\n%s"
        % (extra.get("major"), extra.get("skills"), extra.get("interest"), _clip(text, 2500)),
        "submit": u"规范：\n%s\n论文：\n%s" % (_clip(extra.get("guide") or "", 2500), _clip(text)),
        "reviewer": u"风格：%s\n论文：\n%s" % (extra.get("style") or "gentle", _clip(text)),
        "retrospect": u"历史记录：\n%s" % json.dumps(extra.get("records") or [], ensure_ascii=False)[:4000],
        "pipeline": u"请输出全流程优化报告。文件：%s\n%s" % (filename, _clip(text)),
    }
    sys_p = SYSTEM_PROMPTS.get(action) or SYSTEM_PROMPTS["chat"]
    user = user_map.get(action) or (
        u"主题：%s\n文件：%s\n附加：%s\n正文：\n%s"
        % (
            extra.get("topic") or _guess_topic(text, filename),
            filename,
            json.dumps(extra, ensure_ascii=False)[:1500],
            _clip(text),
        )
    )
    llm_text, demo = call_llm(model_id, sys_p, user, history if action == "chat" else None)

    fallbacks = {
        "chat": lambda: demo_chat(extra.get("scene") or "writing", extra.get("question") or text, model_id),
        "evaluate": lambda: demo_evaluate(text, filename, model_id),
        "outline": lambda: demo_outline(extra.get("topic"), text, model_id),
        "coach": lambda: demo_coach(extra.get("chapter"), extra.get("answer"), model_id),
        "polish": lambda: demo_polish(text, filename, model_id),
        "abstract": lambda: demo_abstract(text, extra.get("requirement"), model_id),
        "refs": lambda: demo_refs(text, extra.get("standard"), model_id),
        "path": lambda: demo_path(extra.get("major"), extra.get("skills"), extra.get("interest"), text, model_id),
        "submit": lambda: demo_submit(extra.get("guide"), text, filename, model_id),
        "reviewer": lambda: demo_reviewer(extra.get("style") or "gentle", text, filename, model_id),
        "retrospect": lambda: demo_retrospect(extra.get("records") or [], model_id),
        "pipeline": lambda: demo_pipeline(text, filename, model_id),
    }

    def extra_fb():
        packed = extra_demos(
            action,
            text,
            filename,
            extra,
            model_id,
            model_name,
            extra.get("topic") or _guess_topic(text, filename),
        )
        if packed:
            return packed
        return demo_chat(extra.get("scene") or "writing", extra.get("question") or text, model_id)

    fb = fallbacks.get(action) or extra_fb
    if action not in fallbacks:
        fb = extra_fb
    if demo or not llm_text:
        data = fb()
        data["demo"] = True
        return data

    parsed = _try_json(llm_text)
    if parsed and isinstance(parsed, dict):
        parsed["demo"] = False
        parsed["model"] = model_name(model_id)
        parsed["raw"] = llm_text
        return parsed

    packed = {
        "demo": False,
        "mode": "online",
        "model": model_name(model_id),
        "llm_text": llm_text,
    }
    if action == "chat":
        packed["reply"] = llm_text
    else:
        packed["sections"] = [{u"title": u"模型输出", u"pre": llm_text}]
    return packed
