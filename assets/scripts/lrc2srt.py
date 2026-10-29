#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
lrc2srt.py — 把 .lrc 歌词转成带时间轴的 .srt，并按句合并、补句末时间。

为什么优先走这条路：musicdl 下载歌曲时会**同时带回官方 LRC**
（歌词由平台提供，与演唱对齐），比 Whisper 转写准一个数量级 ——
中文歌词尤其明显，Whisper 的 small 模型会错字（"桌垫下"→"捉点下"）。

用法：
    python lrc2srt.py song.lrc lyrics.srt
    python lrc2srt.py song.lrc lyrics.srt --next-gap 0  # 句末直接接到下一句
    python lrc2srt.py song.lrc lyrics.srt --keep-header  # 保留 作词/作曲 那几行

默认行为：
  - 丢掉 [ti:] [ar:] [al:] [by:] 这类元信息行
  - 丢掉开头的「作词 : xxx」「作曲 : xxx」制作人员行（它们是歌词不是唱词）
  - 一条 LRC 行 = 一条字幕。LRC 本来就是一行一句，不需要合并
  - 每句结束时间 = 下一句开始（--next-gap 可留空档）
  - 最后一句给一个合理时长（默认 4 秒，或到音频结尾，用 --audio-duration 指定）

LRC 的时间只有「开始」，没有「结束」—— 这是必须知道的关键点。
"""

import argparse
import os
import re
import sys

TS = re.compile(r"\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
META = re.compile(r"^\[(ti|ar|al|by|offset|re|ve|length):", re.I)
CREDIT = re.compile(r"^(作词|作曲|编曲|制作人|监制|出品|发行|录音|混音|母带|吉他|贝斯|鼓|和声|"
                    r"词|曲|OP|SP|Produced|Written|Composed|Arranged)\s*[:：]", re.I)


def fmt(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


def parse_lrc(path):
    cues = []
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for raw in f:
            line = raw.rstrip("\n")
            if not line.strip() or META.match(line.strip()):
                continue
            stamps = TS.findall(line)
            text = TS.sub("", line).strip()
            if not stamps:
                continue
            # 一行可以有多个时间戳（副歌复用），每个都算一条
            for h, m, frac in stamps:
                t = int(h) * 60 + int(m)
                if frac:
                    t += int(frac.ljust(3, "0")) / 1000.0
                cues.append({"t0": t, "text": text})
    cues.sort(key=lambda c: c["t0"])
    return cues


def char_count(text: str) -> int:
    return len(re.sub(r"[\s\W_]", "", text))


def is_fragment(text: str) -> bool:
    """这条是不是被 LRC 切开的一半句：以无标点方式结束。"""
    t = text.strip()
    if not t:
        return True
    return t[-1] not in "。！？…，、；：,.!?;:"


def merge_cues(cues, max_chars=20, max_sec=8.0, max_gap=2.2):
    """
    把 LRC 切开的半句合并回完整一句。

    LRC 的换行跟着演唱换气走，所以「我们终于 / 来到了这一天」是两行。
    做字幕可以保留（跟着唱更准），做分镜要合并（一句歌词一个镜头）。

    注意：LRC 只有开始时间、没有结束时间，所以这里的间隔一律按
    「下一行开始 - 上一行开始」算，不能按「下一行开始 - 上一行结束」。

    三个上限兜住，避免把整段主歌压成一条：
      - 合并后 ≤ max_chars 字
      - 合并后跨度 ≤ max_sec 秒
      - 两行起始间隔 ≤ max_gap 秒
    """
    if not cues:
        return cues
    out = [dict(cues[0])]
    for c in cues[1:]:
        prev = out[-1]
        joined = prev["text"] + c["text"]
        if (c["t0"] - prev["t0"] <= max_gap
                and char_count(joined) <= max_chars
                and (c["t0"] - prev["t0"]) <= max_sec
                and is_fragment(prev["text"])):
            prev["text"] = joined
        else:
            out.append(dict(c))
    return out


def convert(cues, next_gap=0.0, tail=4.0, audio_duration=None, drop_credits=True, keep_blank=False,
            merge=False, max_chars=20, max_sec=8.0, max_gap=2.2):
    if drop_credits:
        cues = [c for c in cues if c["text"] and not CREDIT.match(c["text"])]
    if not keep_blank:
        cues = [c for c in cues if c["text"]]

    if merge:
        cues = merge_cues(cues, max_chars, max_sec, max_gap)

    out = []
    for i, c in enumerate(cues):
        end = None
        if i + 1 < len(cues):
            end = cues[i + 1]["t0"] - next_gap
        else:
            end = c["t0"] + tail
            if audio_duration:
                end = min(end, audio_duration)
        if end <= c["t0"]:
            end = c["t0"] + 0.5
        out.append({"t0": c["t0"], "t1": end, "text": c["text"]})
    return out


def write_srt(rows, path):
    with open(path, "w", encoding="utf-8") as f:
        for i, r in enumerate(rows, 1):
            f.write(f"{i}\n{fmt(r['t0'])} --> {fmt(r['t1'])}\n{r['text']}\n\n")


def write_js(rows, path, var_name="MV_LYRICS"):
    """
    输出内联 JS：window.MV_LYRICS = [...]; 
    比 SRT 更可靠 —— 渲染器可能在你 fetch 完成前就抓帧，内联是同步的，没有竞态。
    歌词才几 KB，内联没有任何损失。
    """
    import json
    payload = [{"t0": round(r["t0"], 3), "t1": round(r["t1"], 3), "text": r["text"]} for r in rows]
    body = (
        "// 自动生成，勿手改。由 lyrics.srt 转出，供 composition 同步读取（避免 fetch 竞态）\n"
        f"window.{var_name} = " + json.dumps(payload, ensure_ascii=False) + ";\n"
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)


def main():
    ap = argparse.ArgumentParser(description="LRC → SRT")
    ap.add_argument("lrc")
    ap.add_argument("out", nargs="?", default="lyrics.srt")
    ap.add_argument("--next-gap", type=float, default=0.0,
                    help="句末到下一句之间留的空档（秒）；0=紧接下一句")
    ap.add_argument("--tail", type=float, default=4.0, help="最后一句的时长")
    ap.add_argument("--audio-duration", type=float, default=None,
                    help="音频总时长（ffprobe 量的），最后一句不会超过它")
    ap.add_argument("--keep-header", action="store_true", help="保留 作词/作曲 等制作人员行")
    ap.add_argument("--merge", action="store_true",
                    help="合并被 LRC 换行切开的半句（做分镜建议开，做字幕可以不开）")
    ap.add_argument("--max-chars", type=int, default=20, help="合并后单条最多几个字")
    ap.add_argument("--max-sec", type=float, default=8.0, help="合并后单条最多几秒")
    ap.add_argument("--max-gap", type=float, default=2.2, help="两行起始间隔超过这么久就不合并")
    ap.add_argument("--js-out", default=None,
                    help="额外输出内联 JS（如 assets/lib/lyrics.js），composition 同步读取，无 fetch 竞态")
    a = ap.parse_args()

    if not os.path.exists(a.lrc):
        sys.exit(f"找不到 LRC：{a.lrc}")

    cues = parse_lrc(a.lrc)
    if not cues:
        sys.exit("LRC 里没有解析出任何时间戳，检查是不是纯文本歌词")

    rows = convert(cues, a.next_gap, a.tail, a.audio_duration,
                   drop_credits=not a.keep_header,
                   merge=a.merge, max_chars=a.max_chars, max_sec=a.max_sec, max_gap=a.max_gap)
    write_srt(rows, a.out)
    print(f"完成：{len(rows)} 条字幕 → {a.out}", file=sys.stderr)
    if a.js_out:
        write_js(rows, a.js_out)
        print(f"        内联 JS → {a.js_out}", file=sys.stderr)


if __name__ == "__main__":
    main()
