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
    "groq-qwen38": {"api": "qwen/qwen3.8-27b", "thinking": False, "provider": "groq"},
    "groq-gpt120": {"api": "openai/gpt-oss-120b", "thinking": False, "provider": "groq"},
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
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "env": "GROQ_API_KEY",
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
    {
        "id": "groq-qwen38",
        "name": "通义千问 3.8-27B",
        "tag": "Groq",
        "vendor": "Groq",
        "desc": "通义 27B，由 Groq 托管",
    },
    {
        "id": "groq-gpt120",
        "name": "GPT-OSS 120B",
        "tag": "长文",
        "vendor": "Groq",
        "desc": "开源大模型，适合较长回答",
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
    "chat": "你是论小研，面向本科生与研究生的科研论文写作助手。用中文写完整回答，不少于 400 字，分成问题、方法、实验、局限四段。必须使用用户题目里的对象，不要换成另一篇论文的任务。没有实验表的百分点不要编。不要空泛鼓励。",
    "evaluate": "你是论文评审助手。根据文稿给出 0-100 综合评分、学术规范重合度估计（百分比，仅作表述规范与原创性提示，非查重鉴定）、优点、不足、改进建议、分项评分。用 JSON 输出。",
    "outline": "你是科研写作规划助手。按用户给出的主题写 5 章大纲和 3 个研究问题。每一章的 points 至少 80 个汉字，写清本章要回答的问题、要放的图表和不能写进本章的内容。题目里没有的任务不要写进方法：作物病害不要写行人跟踪，翻译或摘要任务不要写检测。研究问题写成完整问句。严禁编造论文题名、作者和会议。没有文献列表时，文献区写「待补充检索」。只输出 JSON，字段为 topic、chapters[{title,points}]、questions[{q}]。",
    "coach": "你是论文写作导师。引导题、参考表述和改写都要紧扣学生的题目。参考表述不少于 150 字，包含问题现象、与基线的一处差异、准备用的指标。题目里没有的任务不要写进去。没有实验表就不要写具体百分点。不要打分。",
    "polish": "你是学术中文润色编辑。分析语言、逻辑、学术表达，给 0-10 分，列出亮点、逻辑通顺度、优化方向与改写示例。JSON。",
    "abstract": "你是学报编辑。按题目写中文摘要和英文摘要，每篇不少于 150 字，包含问题、方法、数据划分、要报告的指标和局限。数字只能来自用户文稿；文稿里没有的百分点不要编。再给 3 到 5 个关键词。",
    "refs": "你是参考文献编辑，按 GB/T 7714—2025 顺序编码制整理条目，不要再用 GB/T 7714—2015。西文个人责任者姓仅首字母大写，名缩写为首字母且不加下点。预印本用 PP/OL，不要标成 EB/OL。标准只写标准编号和标准名称。纠正残缺字段并给出校验说明。",
    "path": "你是研究生导师。根据专业、技能、兴趣与作业文本，给出短期（3个月）与中长期（1-2年）科研路径。",
    "submit": "你是投稿顾问。对照期刊/学位规范与论文初稿，给出格式、内容侧重、结构优化建议。",
    "reviewer": "你按指定审稿人风格写评审意见、修改建议与返修提问。",
    "retrospect": "你对照多份历史评估/润色记录，总结进步点、遗留问题与后续优化优先级。",
    "pipeline": "你对论文做快速全流程体检。只输出精炼中文报告，总分控制在 600 字内：综合分、3条优点、3条不足、大纲调整要点、润色要点、文献问题、下一步3条。不要长篇展开。",
    "translate": "你是中英学术翻译。把英文论文段落译为通顺中文。保留 BLEU、GPU、Adam、公式与专有名词原文；禁止中英单词混杂插替。按用户给出的 [1][2]… 编号逐段只输出译文，不要解释。",
}
SYSTEM_PROMPTS.update(EXTRA_PROMPTS)


def model_name(model_id):
    for m in MODELS:
        if m["id"] == model_id:
            return u"%s（%s）" % (m["name"], m["tag"])
    return u"智谱清言 4-Flash（最快，推荐）"


def _clip(text, n=2200):
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
        "groq": bool(os.environ.get("GROQ_API_KEY")),
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


def _openai_chat(url, api_key, model, messages, extra_headers=None, extra_body=None, max_tokens=1024):
    headers = {
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }
    if extra_body:
        payload.update(extra_body)
    # 不走系统代理，避免本机 Clash 把智谱请求拖慢
    resp = requests.post(url, headers=headers, json=payload, timeout=60, proxies={"http": None, "https": None})
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
    # 短答任务少给 token，减轻尾部拖延；全流程也不要 2k
    tok = 700
    if model_id in ("glm-z1-flash", "glm-4.5-flash", "glm-4.7-flash"):
        tok = 900
    try:
        text = _openai_chat(
            provider["url"],
            key,
            spec["api"],
            messages,
            extra_body=extra,
            max_tokens=tok,
        )
        return text, False
    except Exception as e:
        try:
            with open(os.path.join(os.path.dirname(__file__), "data", "llm_error.log"), "a", encoding="utf-8") as f:
                f.write("%s | %s | %s\n" % (model_id, type(e).__name__, e))
        except Exception:
            pass
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
    topic = _guess_topic(text, filename)
    info = _brief(topic, text)
    return {
        "mode": "offline",
        "source": filename or u"未命名文稿",
        "topic": topic,
        "strengths": [
            info["problem"],
            info["method"],
        ],
        "weaknesses": [
            info["metric"],
            u"相关工作如果按年份罗列，看不出本文位置。",
            u"参考文献若混用体例，按 GB/T 7714—2025 重排，缺页码的标出来，不要编页码。",
        ],
        "suggestions": [
            info["zh"],
            u"每一条贡献对应第4章的一列，对不上的句子删掉。",
            u"失败案例要写清错在什么输入上、错成什么、占测试集多少。",
        ],
        "summary": u"文稿《%s》按「%s」做离线检查，不打分。%s"
        % (filename or topic, info["kind"], info["problem"]),
        "model": "",
    }


def _brief(topic, text):
    blob = (topic or u"") + u"\n" + (text or u"")
    t = topic or _guess_topic(text, u"") or u"待定题目"
    if any(k in blob for k in (u"病虫", u"大豆", u"叶片", u"作物", u"病害", u"植物", u"农业")):
        return {
            "kind": u"田间叶片病害",
            "problem": u"田间拍摄的「%s」里，早期病斑小，光照和品种差很大。直接套通用检测器时，小病斑召回低，相似病害还会混成一类。" % t,
            "method": u"流水线是采集与标注、叶片裁剪、病斑检测或分割、按类别输出位置和置信度。跟踪、轨迹和 ByteTrack 与本题无关。",
            "metric": u"检测报 mAP@0.5 和按病害类别的召回，分类报宏平均 F1 与混淆矩阵，并单列早期小病斑。没有实验表就不要先写百分点。",
            "chapters": [
                {"title": u"第1章 绪论", "points": u"写清「%s」发生在田间哪一环节，现有人工巡田漏掉早期病斑。贡献写成可检验条目，并预告实验表。" % t, "cite": u"引用田间病害数据与实验室叶片数据的差距，不要写校园监控。"},
                {"title": u"第2章 相关工作", "points": u"分公开叶片数据集、病斑检测或分割、农业边缘部署三条线。每条线收束为共识、分歧、空白和本文位置。", "cite": u"本文位置只写面向田间叶片的早期病斑，不要写成新网络，除非表里有对照。"},
                {"title": u"第3章 方法", "points": u"输入是田间叶片图像。模块是标注规范、检测或分割骨干、类别头和阈值。画出与官方默认权重的差异。方法章只保留叶片检测或分割，不要加入轨迹模块。", "cite": u"方法章只解释为什么提高小病斑采样。"},
                {"title": u"第4章 实验", "points": u"按地块或拍摄日期划分。表列类别样本量、mAP 或 F1、小病斑召回、相似病害混淆和速度。消融一次只动一个因素。", "cite": u"同一株叶子不能同时出现在训练和测试。"},
                {"title": u"第5章 总结", "points": u"只总结检测得到的数字和做不到的事：夜间、新品种、未见病害。", "cite": u"展望不要写「意义重大」。"},
            ],
            "questions": [
                {"q": u"早期小病斑的召回比中后期低多少？这一差距是漏检还是标注噪声？", "hint": u"按短边小于 32 像素的子集单独列表。"},
                {"q": u"外观接近的两类病害主要错到谁？", "hint": u"用混淆矩阵，不要只给总准确率。"},
                {"q": u"训练和测试是否按地块分开？", "hint": u"同一株作物的不同叶子同时进入两侧，不能称为泛化。"},
            ],
            "coach_ref": u"与直接使用通用检测器不同，本文面向田间叶片：早期病斑尺度小，相似病害外观接近，同一地块光照变化大。检测端按叶片裁剪并提高小目标采样，输出各类病害的框和置信度。验证看按类别召回、小病斑子集和混淆矩阵。跟踪不属于本题。",
            "zh": u"田间叶片的早期病斑小，光照和品种变化大，通用检测器漏检明显，相似病害也容易混淆。本文给出标注规范，并提高小病斑采样权重。实验按地块划分，报告 mAP@0.5、按类别召回和小病斑子集。表中没有的数字不写入摘要。夜间、新品种和未见病害仍是局限。",
            "en": u"Early lesions on field leaves are small, and illumination and cultivar shift cause generic detectors to miss them or confuse similar diseases. This thesis states the labeling rule and biases training toward small lesions. Splits follow field plots. Report mAP@0.5, per-class recall, and the small-lesion subset. Do not invent numbers. Night imaging, new cultivars, and unseen diseases remain limits.",
        }
    if any(k in blob for k in (u"行人", u"轨迹", u"跟踪", u"校园监控", u"安防")):
        return {
            "kind": u"校园行人",
            "problem": u"「%s」若直接套通用检测器，逆光、门口遮挡和远处小目标会漏检；只报检测框也无法回答轨迹是否被打断。" % t,
            "method": u"检测端处理尺度和遮挡，跟踪端把框变成轨迹，分析端只消费轨迹点。三个模块各自对应一个现象。",
            "metric": u"检测用 mAP@0.5，跟踪单独报身份切换。已有文稿中的 86.4% 只说明检测，不能代替跟踪。",
            "chapters": [
                {"title": u"第1章 绪论", "points": u"写清漏检发生在什么条件下，本文做检测、跟踪还是两者。", "cite": u"贡献条目对应后文的表。"},
                {"title": u"第2章 相关工作", "points": u"检测器、跟踪器、校园场景三条线，写明不解决人脸识别。", "cite": u"每条线用共识、分歧、空白、本文位置收束。"},
                {"title": u"第3章 方法", "points": u"检测输出框，跟踪做关联，分析只读轨迹。画出与官方检测器加简单排序跟踪的差异。", "cite": u"不要把三个模块合成一句「结合了深度学习」。"},
                {"title": u"第4章 实验", "points": u"检测对照和跟踪对照分开列表。消融一次只关一个模块，并给出失败案例占比。", "cite": u"测试相机不能出现在训练视频里还不说明。"},
                {"title": u"第5章 总结", "points": u"检测数字和跟踪数字分开写。局限写夜间，以及保存的是原视频还是轨迹点。", "cite": u"没有的实验写成尚未完成。"},
            ],
            "questions": [
                {"q": u"远处小目标和门口遮挡，分别拖累检测还是跟踪？", "hint": u"分开报指标。"},
                {"q": u"低分框参与关联后，身份切换下降还是误关联变多？", "hint": u"给身份切换次数，不要只用 mAP。"},
                {"q": u"测试相机是否出现在训练视频里？", "hint": u"重叠则不能称为跨场景。"},
            ],
            "coach_ref": u"与直接部署通用检测器不同，本文面向校园监控中的逆光、远处行人和门口遮挡。检测端针对行人尺度，跟踪端处理遮挡时的框关联。检测看 mAP@0.5，跟踪看身份切换，两者不要写成一个「效果较好」。",
            "zh": u"校园监控里，通用行人检测器在逆光、遮挡和远处小目标上漏检，遮挡后轨迹也容易中断。本文把检测和跟踪分开，分析端只使用轨迹点。检测和跟踪的指标分开报告。已有的 86.4% 只说明检测。夜间成像和是否保存原视频仍是局限。",
            "en": u"Generic pedestrian detectors miss small or backlit people, and occlusion breaks tracks. This thesis separates detection and association, then reads analytics from track points only. Report detection and identity switches separately. Night imaging and raw-video retention remain limits.",
        }
    return {
        "kind": u"按题目展开",
        "problem": u"「%s」需要写清输入是什么、现有方法卡在哪一个可观察现象、准备用哪一项指标证明改动有效。" % t,
        "method": u"方法只保留一条主线：输入、输出、与最强基线差在哪一个模块。不要把题目里没有的跟踪或翻译写进去。",
        "metric": u"至少报告主指标和一个失败子集。对照必须是同数据划分上的基线。表里没有的百分点不要编。",
        "chapters": [
            {"title": u"第1章 绪论", "points": u"用「%s」的一个具体失败开头，贡献条目注明由哪张表检验。" % t, "cite": u"删掉与题目无关的背景段落。"},
            {"title": u"第2章 相关工作", "points": u"两条到三条技术线，比较数据、指标和失败条件，最后写本文不做什么。", "cite": u"不要按年份流水账。"},
            {"title": u"第3章 方法", "points": u"只写「%s」的输入、关键模块、输出，以及和基线的一处差异。" % t, "cite": u"用「因为某现象，所以改这一处」。"},
            {"title": u"第4章 实验", "points": u"数据来源、划分、主指标、子集指标、一次只改变一个因素的消融、失败案例分布。", "cite": u"没有的实验写尚未完成。"},
            {"title": u"第5章 总结", "points": u"复述已有数字，并写数据覆盖不到的情形和指标解释不了的情形。", "cite": u"不要用「意义重大」收尾。"},
        ],
        "questions": [
            {"q": u"「%s」里，现有方法最容易失败的输入长什么样？" % t, "hint": u"给出一个能看见的例子。"},
            {"q": u"删掉你的改动后，主指标和子集指标哪一个会先掉？", "hint": u"用消融，不要用形容词。"},
            {"q": u"训练和测试是否共享同一批样本或同一场景？", "hint": u"共享则只能叫拟合。"},
        ],
        "coach_ref": u"针对「%s」，现有做法的问题要落到一个能看见的失败。本文只改与该失败对应的一个环节，并在同一数据划分上与基线对比。主指标说明总体，子集指标说明这个失败有没有减轻。实验没跑完就写预期，不要先写百分点。" % t,
        "zh": u"「%s」先写清输入、失败现象和方法差异。本文给出一条主线，并在同一划分上报告主指标和失败子集。具体百分点只能来自实验表。局限写数据覆盖不到的情形。" % t,
        "en": u"State the input, the observable failure, and the single change. Report a main metric and a failure-subset metric on one split. Copy numbers only from the result table.",
    }


def demo_outline(topic, text, model_id):
    topic = topic or _guess_topic(text, "")
    info = _brief(topic, text)
    chapters = info["chapters"]
    questions = info["questions"]
    papers = [
        {"title": info["kind"], "meta": u"离线推断，按题目「%s」选择文献，不套另一篇论文" % topic, "why": info["method"]},
        {"title": u"该方向的基线论文", "meta": u"写明你复现的版本和配置", "why": info["metric"]},
        {"title": u"同一任务、不同数据假设的工作", "meta": u"用来写分歧", "why": info["problem"]},
        {"title": u"GB/T 7714—2025 信息与文献 参考文献著录规则", "meta": u"国家标准", "why": u"只约束文献格式，不充当创新点。"},
    ]
    return {
        "mode": "offline",
        "source": "offline",
        "topic": topic,
        "chapters": chapters,
        "papers": papers,
        "questions": questions,
        "model": "",
    }


def demo_coach(chapter, answer, model_id, topic=u"", text=u""):
    chapter = chapter or u"绪论 / 创新点"
    info = _brief(topic or chapter, (answer or u"") + u"\n" + (text or u""))
    has_ans = bool((answer or "").strip())
    return {
        "mode": "offline",
        "source": "offline",
        "chapter": chapter,
        "prompt": u"请用一段话说明「%s」：问题现象、和基线的一处差异、准备用什么指标证明。按「%s」写，不要套另一篇论文。" % (topic or chapter, info["kind"]),
        "reference": info["coach_ref"],
        "strengths": [info["problem"], info["method"]] if has_ans else [],
        "weaknesses": [
            u"判断没有放在段首，或改动没有对应到指标。",
            u"文中没有的百分点不要补进去。",
        ] if has_ans else [u"还没有作答。先把参考表述里的数据和基线名称换成你自己的，再提交。"],
        "rewrite": info["coach_ref"],
        "next_chapter": info["chapters"][1]["points"],
        "model": "",
    }


def demo_polish(text, filename, model_id):
    return {
        "mode": "offline",
        "source": filename or u"论文初稿",
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
    info = _brief(_guess_topic(text, u""), text or u"")
    return {
        "mode": "offline",
        "source": "offline",
        "requirement": req,
        "zh": info["zh"],
        "en": info["en"],
        "keywords_zh": [info["kind"], u"基线对照", u"失败子集"],
        "keywords_en": ["baseline", "failure subset"],
        "model": "",
    }


def demo_refs(raw, standard, model_id):
    standard = standard or u"GB/T 7714—2025 顺序编码制"
    items = [
        u"[1] Redmon J, Farhadi A. YOLOv3: An incremental improvement[PP/OL]. arXiv (2018-04-08)[2026-06-01]. https://arxiv.org/abs/1804.02767.",
        u"[2] Zhang Y, Sun P, Jiang Y, et al. ByteTrack: Multi-object tracking by associating every detection box[C]//European Conference on Computer Vision. Cham: Springer, 2022: 1-21.",
        u"[3] Wojke N, Bewley A, Paulus D. Simple online and realtime tracking with a deep association metric[C]//IEEE International Conference on Image Processing. Piscataway: IEEE, 2017: 3645-3649.",
        u"[4] 王磊. 智慧校园视频监控关键技术研究[D]. 南京: 某大学, 2023.",
        u"[5] GB/T 7714—2025 信息与文献 参考文献著录规则[S].",
    ]
    notes = [
        u"已按 GB/T 7714—2025 顺序编码制重新编号。",
        u"西文个人责任者姓仅首字母大写，名缩写为首字母，缩写名后不加下点。",
        u"arXiv 预印本按 PP/OL 著录。EB 只用于网站、网页，不能再标预印本。",
        u"标准只著录标准编号和标准名称，不写发布机构和出版社。",
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
            u"参考文献严格 GB/T 7714—2025 顺序编码制，文内引用与文末编号一一对应。",
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
    refs = demo_refs(text, u"GB/T 7714—2025 顺序编码制", model_id)
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


def demo_chat(scene, question, model_id, topic=u"", text=u""):
    q = question or text or u""
    info = _brief(topic or q, q + u"\n" + (text or u""))
    lines = [c["title"] + u"：" + c["points"] for c in info["chapters"]]
    qs = [item["q"] for item in info["questions"]]
    body = (
        u"【离线推断】按「%s」来写，类型是%s。\n\n%s\n\n%s\n\n%s\n\n%s"
        % (topic or (q[:36] or info["kind"]), info["kind"], info["problem"], info["method"], info["metric"], u"\n".join(lines))
    )
    if u"大纲" in q:
        body = u"【离线推断】大纲按「%s」展开。\n\n%s\n\n研究问题：\n%s" % (info["kind"], u"\n\n".join(lines), u"\n".join(qs))
    elif u"摘要" in q:
        body = u"【离线推断】摘要只写表里已有的事实。\n\n%s\n\n%s" % (info["zh"], info["en"])
    elif u"文献" in q:
        body = u"【离线推断】文献按技术线，不要按年份。\n\n%s\n\n%s" % (info["problem"], info["method"])
    elif u"答辩" in q:
        body = u"【离线推断】答辩先回答这三问，每问约 40 秒。\n\n%s\n\n%s" % (u"\n".join(qs), info["metric"])
    return {
        "mode": "offline",
        "source": "offline",
        "reply": body,
        "model": "",
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
        "chat": (
            u"场景：%s\n问题：%s%s"
            % (
                extra.get("scene") or "writing",
                extra.get("question") or text,
                (u"\n已上传论文《%s》，回答必须紧扣正文：\n%s" % (filename, _clip(text, 2200))) if text else u"",
            )
        ),
        "evaluate": u"文件名：%s\n请评估（简洁）：\n%s" % (filename, _clip(text, 2800)),
        "outline": u"主题：%s\n文稿：\n%s" % (extra.get("topic") or _guess_topic(text, filename), _clip(text, 2200)),
        "coach": u"章节：%s\n学生作答：%s\n文稿摘录：%s"
        % (extra.get("chapter") or "", extra.get("answer") or "", _clip(text, 1500)),
        "polish": u"文件：%s\n%s" % (filename, _clip(text, 2800)),
        "abstract": u"要求：%s\n正文：\n%s" % (extra.get("requirement") or u"本科毕业论文摘要", _clip(text, 2800)),
        "refs": u"标准：%s\n条目：\n%s" % (extra.get("standard") or u"GB/T 7714—2025 顺序编码制", _clip(text, 2500)),
        "path": u"专业：%s\n技能：%s\n兴趣：%s\n作业：\n%s"
        % (extra.get("major"), extra.get("skills"), extra.get("interest"), _clip(text, 1500)),
        "submit": u"规范：\n%s\n论文：\n%s" % (_clip(extra.get("guide") or "", 1500), _clip(text, 2500)),
        "reviewer": u"风格：%s\n论文：\n%s" % (extra.get("style") or "gentle", _clip(text, 2800)),
        "retrospect": u"历史记录：\n%s" % json.dumps(extra.get("records") or [], ensure_ascii=False)[:2500],
        "pipeline": u"快速全流程短报告。文件：%s\n正文摘录：\n%s" % (filename, _clip(text, 2200)),
        "translate": u"%s\n\n待译段落：\n%s"
        % (
            extra.get("note")
            or u"英译中，按 [1][2]… 输出通顺中文，保留公式与专名。",
            _clip(text, 3500),
        ),
        "venue": u"根据这篇论文推荐期刊或会议，说明适合原因和投稿前要补的内容。不要向用户索要正文。\n文件：%s\n论文：\n%s"
        % (filename, _clip(text, 2200)),
        "ppt": u"根据这篇论文写约12页答辩PPT大纲和40秒开场讲稿。每页对应论文中的题目、方法或实验。不要复述任务说明。\n文件：%s\n论文：\n%s"
        % (filename, _clip(text, 2200)),
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
        "chat": lambda: demo_chat(extra.get("scene") or "writing", extra.get("question") or text, model_id, extra.get("topic") or "", text),
        "evaluate": lambda: demo_evaluate(text, filename, model_id),
        "outline": lambda: demo_outline(extra.get("topic"), text, model_id),
        "coach": lambda: demo_coach(extra.get("chapter"), extra.get("answer"), model_id, extra.get("topic") or "", text),
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
        topic = extra.get("topic") or _guess_topic(text, filename)
        if action == "outline":
            chapters = parsed.get("chapters") or []
            bodies = []
            for c in chapters:
                if isinstance(c, dict):
                    body = c.get("points") or c.get("content") or c.get("summary") or u""
                    if not c.get("points"):
                        c["points"] = body
                    bodies.append(body)
                else:
                    bodies.append(u"%s" % c)
            if not parsed.get("questions") and parsed.get("research_questions"):
                parsed["questions"] = [
                    {u"q": q} if not isinstance(q, dict) else q
                    for q in parsed.get("research_questions") or []
                ]
            thin = sum(len(b) for b in bodies) < 220 or not any(u"。" in b for b in bodies)
            if thin:
                info = demo_outline(topic, text, model_id)
                parsed["sections"] = [{u"title": u"离线推断", u"p": u"上面是模型给出的章名。下面按「%s」把每一章写成可以接着写的段落。" % topic}]
                parsed["sections"].extend([{u"title": c["title"], u"p": c["points"]} for c in info["chapters"]])
        if action == "chat":
            reply = parsed.get("reply") or u""
            if len(reply) < 180:
                parsed["reply"] = (reply + u"\n\n" + demo_chat(extra.get("scene") or "writing", extra.get("question") or text, model_id, topic, text)["reply"]).strip()
        return parsed

    packed = {
        "demo": False,
        "mode": "online",
        "model": model_name(model_id),
        "llm_text": llm_text,
    }
    topic = extra.get("topic") or _guess_topic(text, filename)
    if action == "chat":
        packed["reply"] = llm_text
        if len(llm_text) < 180:
            packed["reply"] = (llm_text + u"\n\n" + demo_chat(extra.get("scene") or "writing", extra.get("question") or text, model_id, topic, text)["reply"]).strip()
    else:
        packed["sections"] = [{u"title": u"模型输出", u"pre": llm_text}]
        if action == "outline" and len(llm_text) < 220:
            info = demo_outline(topic, text, model_id)
            packed["sections"].append({u"title": u"离线推断", u"p": u"模型回复过短。下面按「%s」展开。" % topic})
            packed["sections"].extend([{u"title": c["title"], u"p": c["points"]} for c in info["chapters"]])
    return packed
