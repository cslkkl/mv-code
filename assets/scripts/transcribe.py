#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
transcribe.py — 用 faster-whisper 把 audio 转成带时间轴的 SRT。

★ 先看这条：**能用 LRC 就别用 Whisper。**
musicdl 下载歌曲时会同时带回官方 LRC（平台提供的歌词，与演唱对齐）。
中文歌词下两者的差距是数量级的 —— 实测同一首歌同一段：

    官方 LRC  桌垫下的老照片 / 笨拙系上红色领带的结 / 等会儿见你一定比想象美
    Whisper   捉点下的老照片 / 奔着西沙 红色零带的街 / 等会儿见你一听

所以正确顺序是：
    1. musicdl 下载 → 有 .lrc → 用 lrc2srt.py 转换（首选）
    2. 没有 LRC → 才用本脚本转写

为什么不用 `hyperframes transcribe`：它依赖 whisper-cpp 二进制，
`doctor` 报 whisper-cpp: Not found 时会直接跳过（"Captions skipped"）。
faster-whisper 是纯 pip 安装，CPU 可跑，快 3~4 倍。

用法：
    python transcribe.py assets/audio/song.mp3 lyrics.srt
    python transcribe.py song.mp3 lyrics.srt --model medium --lang zh
    python transcribe.py song.mp3 lyrics.srt --merge        # 合并碎句（推荐）

参数：
    --model   tiny | small(默认) | medium | large-v3
              small 是准确率/速度的平衡点；中文歌词 small 会错字，medium 明显更准
    --lang    语言代码，默认 zh
    --merge   合并 Whisper 切碎的短句（一句歌词被切成 2~3 条是最常见的问题）
    --gap     合并后句末留的空档，默认 0.12 秒（避免字幕硬切、没换气）
    --device  cpu(默认) | cuda
    --max-chars / --max-sec / --max-gap   合并的三个上限（默认 18 字 / 7 秒 / 0.5 秒）

首次运行会下载模型（small ≈ 480 MB，medium ≈ 1.5 GB），日志会打印进度。

⚠ 国内网络下模型下载会卡住或报 401（xet 加速端点被拒）。先设这几个环境变量：

    set HF_ENDPOINT=https://hf-mirror.com
    set HF_HUB_DISABLE_XET=1
    set HF_HOME=<某个不占系统盘的位置>

不设 HF_HUB_DISABLE_XET=1 的典型报错是：
    CAS Client Error: HTTP status client error (401 Unauthorized), domain: https://cas-server.xethub.hf.co/...
"""

import argparse
import os
import re
import sys


def fmt_ts(t: float) -> str:
    if t < 0:
        t = 0.0
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


# Whisper 中文会混着输出半角标点（实测 "," 就出现过），两套都要认
HARD_END = "。！？….!?"                  # 句子确定结束
SOFT_END = "，、；：,;:"                 # 可能是一句歌词的换气点


def is_fragment(text: str) -> bool:
    """这条是不是被切碎的半句：太短，或者以无标点的方式结束。"""
    t = text.strip()
    if not t:
        return True
    core = re.sub(r"[\s\W_]", "", t)
    if len(core) <= 10:
        return True
    # 软标点结尾说明"还能接着唱"，可以合并；硬标点结尾就是一句完了
    if t[-1] in HARD_END:
        return False
    return True


def char_count(text: str) -> int:
    return len(re.sub(r"[\s\W_]", "", text))


# Whisper 中文输出的花式标点 → 正常标点
PUNCT_MAP = {
    "﹔": "，", "﹑": "，", "·": "，", "、": "，",
    ",": "，", ";": "；", ":": "：",
    "?": "？", "!": "！", ".": "。",
    "，": "，", "。": "。", "？": "？", "！": "！", "；": "；", "：": "：",
}


def clean_punct(text: str) -> str:
    for k, v in PUNCT_MAP.items():
        text = text.replace(k, v)
    text = re.sub(r"\s+", "", text).strip()
    return text.strip("，、；：,;:")          # 去掉结尾多余的逗号



def split_long(seg, max_sec=7.0, split_at=HARD_END):
    """
    把 Whisper 的长段落按标点切开。

    Whisper 在 condition_on_previous_text=False 时经常一口气吐 10~12 秒、
    横跨 2~3 句歌词。做 MV 分镜必须一句一镜，所以借 word_timestamps 在标点处切。
    """
    words = list(getattr(seg, "words", None) or [])
    if not words:
        return [{"t0": seg.start, "t1": seg.end, "text": clean_punct(seg.text)}]

    pieces, cur, cur_start = [], [], seg.start
    for w in words:
        cur.append(w.word)
        joined = clean_punct("".join(cur))
        ends_sentence = w.word.strip()[-1:] in split_at
        # 只在标点切；没有标点就允许更长（硬切会把「我们终 / 于来到了这一天」切开，
        # 比一条 8 秒的字幕难看得多）。真正的兜底是 max_sec 的 2.2 倍。
        too_long = (w.end - cur_start) >= max_sec * 2.2
        if ends_sentence or too_long:
            pieces.append({"t0": cur_start, "t1": w.end, "text": joined})
            cur, cur_start = [], w.end
    if cur:
        pieces.append({"t0": cur_start, "t1": seg.end, "text": clean_punct("".join(cur))})

    # 丢掉空片 / 纯标点片
    return [p for p in pieces if char_count(p["text"]) > 0]


def resplit_by_punct(rows, marks="，、；,;"):
    """
    把"一条字幕跨了 2~3 句歌词"的长条按标点切开，时间按字数比例分配。

    为什么不靠 word_timestamps：faster-whisper 的 words 在生成器迭代期间不一定
    已填充，实测同一条 segment 在独立调用时能切出 3 片、在 transcribe 循环里却
    拿不到 words。按文字切不依赖任何内部状态，结果稳定。

    这条是为了分镜服务：一句歌词一个镜头。切出来的时长是估算值（按字数比例），
    误差在 ±0.3 秒量级，对分镜够用；做字幕要精确对齐请走 LRC。
    """
    out = []
    for r in rows:
        parts = re.split(r"([" + marks + "])", r["text"])
        # 把「文字 + 标点」配对回完整片段
        pieces, buf = [], ""
        for tok in parts:
            if tok in marks:
                buf += tok
                if char_count(buf) > 0:
                    pieces.append(buf)
                buf = ""
            else:
                buf += tok
        if char_count(buf) > 0:
            pieces.append(buf)

        if len(pieces) <= 1:
            out.append(r)
            continue

        total_chars = sum(char_count(p) for p in pieces) or 1
        span = r["t1"] - r["t0"]
        t = r["t0"]
        for p in pieces:
            share = span * (char_count(p) / total_chars)
            out.append({"t0": t, "t1": t + share, "text": p.strip("，、；,;。.？！?!")})
            t += share
    return out


def merge_rows(rows, max_chars=18, max_sec=7.0, max_gap=0.5):
    """
    合并被切碎的半句。

    中文歌词几乎不带标点，不能只靠标点判断句界。用三个上限兜住：
      - 合并后不超过 max_chars 个字
      - 合并后不超过 max_sec 秒
      - 两条之间的静音不超过 max_gap 秒
    任一超标就另起一句。
    """
    if not rows:
        return rows
    out = [dict(rows[0])]
    for r in rows[1:]:
        prev = out[-1]
        joined = prev["text"] + r["text"]
        fits = (
            r["t0"] - prev["t1"] <= max_gap
            and char_count(joined) <= max_chars
            and (r["t1"] - prev["t0"]) <= max_sec
            and is_fragment(prev["text"])
        )
        if fits:
            prev["text"] = joined
            prev["t1"] = r["t1"]
        else:
            out.append(dict(r))
    return out


def transcribe(audio, out_srt, model_size="small", lang="zh", device="cpu", merge=False, gap=0.12,
               max_chars=18, max_sec=7.0, max_gap=0.5, split="sentence"):
    # split=sentence：只在句号/问号/叹号处切，一条字幕可能跨 2~3 句歌词
    # split=comma   ：逗号也切，接近"一句歌词一条字幕"（近似，不是精确歌词行）
    split_at = HARD_END + SOFT_END if split == "comma" else HARD_END
    from faster_whisper import WhisperModel

    print(f"[1/3] 加载模型 {model_size} ({device}) ...", file=sys.stderr)
    model = WhisperModel(model_size, device=device, compute_type="int8" if device == "cpu" else "float16")

    # Whisper 的中文默认输出繁体。用 initial_prompt 把它压回简体 —— 这是最省事的办法，
    # 不用额外装 opencc。prompt 用简体写，模型会跟随这个风格。
    prompt = "以下是普通话的句子，请用简体中文转写，保留标点。" if lang == "zh" else None

    print(f"[2/3] 转写 {os.path.basename(audio)} ...", file=sys.stderr)
    segments, info = model.transcribe(
        audio,
        language=lang,
        beam_size=5,
        vad_filter=True,                                    # 掐掉间奏里的静音幻觉
        vad_parameters={"min_silence_duration_ms": 500},
        condition_on_previous_text=False,                   # 防止重复循环
        word_timestamps=True,                               # 拿词级时间，才能按标点重新切句
        initial_prompt=prompt,
    )

    # segments 是生成器：必须先把结果物化，否则迭代中途读 seg.words 拿到的是空/不全的词级时间
    segments = list(segments)

    rows = []
    for seg in segments:
        if getattr(seg, "words", None):
            rows.extend(split_long(seg, max_sec, split_at))
        else:
            text = clean_punct(seg.text)
            if text:
                rows.append({"t0": seg.start, "t1": seg.end, "text": text})
    print(f"      原始 {len(rows)} 条，语言 {info.language}（置信度 {info.language_probability:.2f}）", file=sys.stderr)

    # 按标点在内部再切一遍（一条跨多句歌词时切成一句一条）
    if split == "comma" and rows:
        before = len(rows)
        rows = resplit_by_punct(rows)
        print(f"      按标点切分 {before} → {len(rows)} 条", file=sys.stderr)

    # 合并碎句
    if merge and rows:
        before = len(rows)
        rows = merge_rows(rows, max_chars=max_chars, max_sec=max_sec, max_gap=max_gap)
        print(f"      合并 {before} → {len(rows)} 条", file=sys.stderr)

    # 句末对齐：每句结束拉到下一句开始前 gap 秒
    for i in range(len(rows) - 1):
        nxt = rows[i + 1]
        if rows[i]["t1"] >= nxt["t0"]:
            rows[i]["t1"] = max(rows[i]["t0"] + 0.5, nxt["t0"] - gap)

    print(f"[3/3] 写出 {out_srt} ...", file=sys.stderr)
    with open(out_srt, "w", encoding="utf-8") as f:
        for i, r in enumerate(rows, 1):
            f.write(f"{i}\n{fmt_ts(r['t0'])} --> {fmt_ts(r['t1'])}\n{r['text']}\n\n")

    print(f"完成：{len(rows)} 条字幕 → {out_srt}", file=sys.stderr)
    return rows


def main():
    ap = argparse.ArgumentParser(add_help=True, description="faster-whisper → SRT")
    ap.add_argument("audio")
    ap.add_argument("out", nargs="?", default="lyrics.srt")
    ap.add_argument("--model", default="small")
    ap.add_argument("--lang", default="zh")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--merge", action="store_true", help="合并被切碎的短句")
    ap.add_argument("--gap", type=float, default=0.12)
    ap.add_argument("--max-chars", type=int, default=18, help="合并后单条最多几个字")
    ap.add_argument("--max-sec", type=float, default=7.0, help="合并后单条最多几秒")
    ap.add_argument("--max-gap", type=float, default=0.5, help="两条间隔超过这么久就不合并")
    ap.add_argument("--split", choices=["sentence", "comma"], default="sentence",
                    help="sentence=只在句号处切（一条可能跨多句歌词）；comma=逗号也切，接近一句一镜")
    a = ap.parse_args()

    if not os.path.exists(a.audio):
        sys.exit(f"找不到音频：{a.audio}")

    transcribe(a.audio, a.out, a.model, a.lang, a.device, a.merge, a.gap,
               a.max_chars, a.max_sec, a.max_gap, a.split)


if __name__ == "__main__":
    main()
