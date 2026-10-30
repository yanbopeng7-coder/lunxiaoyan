# -*- coding: utf-8 -*-
"""生成 5–8 分钟科研 Agent 演示视频：TTS 旁白 + 页面截图 + 字幕 + MP4。"""
import os, re, subprocess, wave, json
import win32com.client
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = r"D:\lunxiaoyan"
FRAMES = os.path.join(ROOT, "demo_frames")
AUDIO = os.path.join(ROOT, "demo_audio")
OUT = os.path.join(ROOT, "论小研-科研Agent演示-最终.mp4")
os.makedirs(AUDIO, exist_ok=True)

NARRATION = [
    "论小研是一个面向科研全流程的智能体。它把文献解析、抗幻觉问答、沉浸式阅读、前沿追踪、引用图谱和写作可视化连成一条闭环。打开网页就能用，核心能力在浏览器本地完成，论文不需要上传到服务器。",
    "先看文献库。我们依次上传 Attention Is All You Need 的第七版和第一版。系统不是看文件名，而是对正文做 SimHash 语义指纹：两篇论文相似度超过百分之九十五，立刻提示这是同一论文的不同版本。库中已经是更新的 v7，所以建议保留新版；也可以选择两版并存，或查看逐段修订差异。解析结果里能看到标题、作者、章节切块和参考文献条目。扫描件会走 Tesseract 本地 OCR。",
    "第二个模块是抗幻觉问答。选中论文后提问：训练用了多少块 GPU，β1、β2 怎么设置。系统用 BM25 检索原文片段，再抽取包含答案的句子；每条结论后面都有页码和章节锚点，点一下就能回到原文。找不到证据时它会明确说证据不足，而不是编一个数字。切到多文对比，还能把 Transformer 和 BERT 的架构差异逐条列出来。",
    "阅读器保留论文原版面，左侧是标题树，右侧是正文。正文里的方括号编号可以跳到参考文献，参考文献条目也能反向定位到正文出现的位置。打开中英对照，两侧按段落对齐，拖动任意一侧，另一侧会同步滚动；公式和术语保留英文。",
    "前沿追踪模块可以按关键词检索 arXiv，也可以基于本地文献库做推荐。推荐理由会标出相关性、时效性，以及论文是否附带 GitHub 代码；点赞和点踩会调整后续排序。找到合适的论文可以一键下钻入库，继续参与问答和图谱。",
    "把十六篇 Transformer 谱系论文放进局域引用图谱。节点大小对应 PageRank，颜色区分基石论文、桥梁节点和边缘衍生论文。系统会自动生成一段领域综述，里面的数字都来自图计算。Future Work 模块会把多篇论文的未来工作聚类，再到更晚的论文里找解决性证据，标出哪些方向仍然开放，哪些旧 idea 已经被后续工作解决。",
    "写作与可视化模块读取原始 CSV，自动判断应该画折线、柱状、散点还是雷达图。这里生成折线图和符合学术规范的 Figure Caption，斜率、R 方和峰值都是真实计算出来的。同时输出 Matplotlib 脚本和 LaTeX 表格；架构图还可以导出 Mermaid、Graphviz、TikZ 和 Matplotlib 四种脚本。",
    "最后是意图编排中枢。输入一个研究目标，Agent 先做任务规划，再调用文献解析、RAG、arXiv 检索、图谱和写作工具，整个过程有思考日志和工具调用记录，可以回放和审计。这样就把六个模块串成了一个可解释的科研工作流。",
    "论小研的目标不是替人写论文，而是让读文献这件事变得可验证：每个结论都能回到原文的哪一页、哪一节。代码、文档和在线演示地址都在 GitHub 仓库，欢迎评审老师体验。",
]

SHOTS = ["01_home.png", "02_library.png", "03_rag.png", "04_reader.png", "05_retrieve.png",
         "06_graph.png", "07_csv.png", "08_agent.png", "01_home.png"]
CAPTIONS = ["论小研 · 科研助手 Agent", "文献库：v1 / v7 语义去重", "抗幻觉问答：页码与章节锚点",
            "沉浸阅读：引用双向跳转 + 中英对照", "前沿追踪：arXiv 检索与开源优先推荐",
            "引用图谱：PageRank 基石 + 自动综述", "数据可视化：CSV → 图表 + Figure Caption",
            "意图编排：Task Planning + 工具调用", "让每个结论都能回到原文"]

FONT_B = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_R = r"C:\Windows\Fonts\msyh.ttc"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def title_card(path, main, sub, url, modules=None):
    img = Image.new("RGB", (1920, 1080), (12, 26, 46))
    d = ImageDraw.Draw(img)
    for y in range(1080):  # 渐变
        c = (12 + int(y / 1080 * 10), 26 + int(y / 1080 * 18), 46 + int(y / 1080 * 26))
        d.line([(0, y), (1920, y)], fill=c)
    d.text((140, 300), main, font=font(FONT_B, 86), fill=(245, 242, 232))
    d.text((146, 430), sub, font=font(FONT_R, 38), fill=(150, 200, 195))
    d.text((146, 520), url, font=font(FONT_R, 28), fill=(160, 172, 186))
    if modules:
        y = 640
        for m in modules:
            d.text((150, y), "·  " + m, font=font(FONT_R, 28), fill=(210, 218, 228))
            y += 46
    d.line([(140, 700 if not modules else 980), (1780, 700 if not modules else 980)], fill=(70, 95, 120), width=2)
    img.save(path)


def decorate(src, dst, caption, idx):
    img = Image.open(src).convert("RGB")
    if img.size != (1920, 1080):
        img = img.resize((1920, 1080), Image.LANCZOS)
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 968, 1920, 1080], fill=(10, 22, 38, 205))
    d.rectangle([0, 968, 10, 1080], fill=(93, 202, 190, 255))
    d.text((42, 995), f"{idx:02d}", font=font(FONT_B, 34), fill=(126, 200, 191))
    d.text((110, 998), caption, font=font(FONT_B, 34), fill=(245, 243, 235))
    img.save(dst)


def make_audio():
    voice = win32com.client.Dispatch("SAPI.SpVoice")
    tok = voice.GetVoices("Name=Microsoft Huihui Desktop")
    if tok.Count:
        voice.Voice = tok.Item(0)
    voice.Rate = -1
    paths = []
    for i, text in enumerate(NARRATION):
        p = os.path.join(AUDIO, f"seg{i:02d}.wav")
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        stream.Open(p, 3, False)
        voice.AudioOutputStream = stream
        voice.Speak(text)
        stream.Close()
        paths.append(p)
    return paths


def wav_duration(path):
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def srt_time(t):
    h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")


def main():
    title_card(os.path.join(FRAMES, "final_00.png"), "论小研 · 科研助手 Agent",
               "全国高校 AI 大模型挑战赛 · 省赛作品",
               "https://yanbopeng7-coder.github.io/lunxiaoyan/")
    title_card(os.path.join(FRAMES, "final_08.png"), "六个模块，一条科研闭环",
               "解析 · 问答 · 阅读 · 追踪 · 图谱 · 写作",
               "https://yanbopeng7-coder.github.io/lunxiaoyan/",
               ["文献库：PDF 解析与语义去重", "抗幻觉问答：BM25 + 原文锚点", "沉浸阅读：引用双向跳转 + 中英对照",
                "前沿追踪：arXiv + 开源优先", "引用图谱：PageRank + 自动综述", "写作可视化：大纲 / 图表 / TikZ"])
    for i, shot in enumerate(SHOTS):
        src = os.path.join(FRAMES, shot)
        decorate(src, os.path.join(FRAMES, f"final_{i:02d}.png"), CAPTIONS[i], i)

    audios = make_audio()
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    clips = []
    for i, audio in enumerate(audios):
        img = os.path.join(FRAMES, f"final_{i:02d}.png")
        clip = os.path.join(AUDIO, f"clip{i:02d}.mp4")
        dur = wav_duration(audio) + 0.7
        cmd = [ff, "-y", "-loop", "1", "-framerate", "10", "-i", img, "-i", audio,
               "-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-r", "10", "-threads", "2",
               "-pix_fmt", "yuv420p", "-vf", "scale=1920:1080,format=yuv420p", "-c:a", "aac", "-b:a", "128k", "-af", "apad=pad_dur=0.7",
               "-shortest", clip]
        subprocess.run(cmd, check=True)
        clips.append(clip)
        print("clip", i, "sec", round(dur, 1))

    lst = os.path.join(AUDIO, "list.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for c in clips:
            f.write("file '%s'\n" % c.replace("\\", "/"))
    silent = os.path.join(AUDIO, "silent.mp4")
    subprocess.run([ff, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent], check=True)

    # 字幕：按句子长度分配每段音频时长
    entries, t = [], 0.0
    for i, (audio, text) in enumerate(zip(audios, NARRATION)):
        dur = wav_duration(audio)
        sents = [s for s in re.split(r"(?<=[。！？；])", text) if s.strip()]
        total = sum(len(s) for s in sents) or 1
        for s in sents:
            d = dur * len(s) / total
            entries.append((t, t + d, s.strip()))
            t += d
        t += 0.7
    srt = os.path.join(AUDIO, "demo.srt")
    with open(srt, "w", encoding="utf-8") as f:
        for i, (a, b, txt) in enumerate(entries, 1):
            f.write(f"{i}\n{srt_time(a)} --> {srt_time(b)}\n{txt}\n\n")

    subprocess.run([ff, "-y", "-i", silent, "-i", srt, "-c", "copy", "-c:s", "mov_text",
                    "-metadata:s:s:0", "language=chi", OUT], check=True)
    total = sum(wav_duration(a) + 0.7 for a in audios)
    print("OUT", OUT, "duration", round(total / 60, 2), "min", "size", round(os.path.getsize(OUT) / 1048576, 1), "MB")


if __name__ == "__main__":
    main()
