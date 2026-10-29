# ① 音乐分析 — 产出 song.md 与 lyrics.srt

## 输入

`assets/audio/song.mp3` + 歌名/歌手名。

## A. 歌词转写 → `lyrics.srt`

### 已有 SRT

用户给了就直接用，跳到 B 之前先检查三件事：

```bash
# 1. 时间轴是否覆盖整首歌
tail -5 lyrics.srt          # 最后一条的时间要接近 ffprobe 的 duration

# 2. 行数与句子数是否合理（一行字幕 ≤ 16 个汉字）
grep -c '^\d\+$' lyrics.srt

# 3. 中文编码
file -i lyrics.srt          # 必须是 utf-8
```

不满足就修：单行超长按语义拆成两条、时间轴整体偏移（用 `ffmpeg` 复听首句校正）。

### 没有 SRT：Whisper 转写

**HyperFrames 自带的 `transcribe` 依赖 whisper-cpp 二进制**，`doctor` 报 `whisper-cpp: Not found` 时它只会打印 "Captions skipped"。要么按 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) 自编译，要么走下面这条更省事的路。

**推荐：faster-whisper**（Python，CPU 可跑，比 openai-whisper 快数倍）

```bash
uv pip install --python .venv/Scripts/python.exe faster-whisper
```

```python
# transcribe.py
import sys, faster_whisper

audio = sys.argv[1]              # assets/audio/song.mp3
out   = sys.argv[2]              # lyrics.srt
model = faster_whisper.WhisperModel("small", device="cpu", compute_type="int8")

segments, info = model.transcribe(
    audio,
    language="zh",
    vad_filter=True,             # 掐掉间奏里的静音幻觉
    vad_parameters={"min_silence_duration_ms": 500},
    beam_size=5,
    condition_on_previous_text=False,   # 防止重复循环
)

def ts(t):
    h, r = divmod(t, 3600); m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s % 1) * 1000):03d}"

with open(out, "w", encoding="utf-8") as f:
    for i, seg in enumerate(segments, 1):
        f.write(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{seg.text.strip()}\n\n")
```

模型选择：`tiny` 快但中文错字多，`small` 是准确率/速度的平衡点，`medium` 只在用户嫌错字多时换。**首次运行会下载模型（small ≈ 480 MB）**，提前说一声。

**转写完必须做的后处理**（机器转写的中文歌词几乎不可能直接用）：

1. **合并碎句**：Whisper 常把一句歌词切成 2~3 条。按标点/语义合并，一条字幕对应「一口气唱完的一句」。
2. **对齐句末**：把每条 `结束时间` 拉到下一句 `开始时间` 前 0.12 秒，让字幕无空隙接续（视觉上不能闪）。
3. **修专有名词**：歌名、人名、地名按用户的写法改。
4. **标低置信度**：把听不清的句子单独列出来，正文里用 `【?】` 标出，等用户确认。

### 结果写进 `song.md` 的「低置信度歌词」小节

原文照抄这一步的交付要求：

> 将识别置信度低、可能有误的歌词单独列出，等我确认。

列成表：

```markdown
| # | 时间 | 我听到的 | 可能是什么 | 置信度 |
|---|---|---|---|---|
| 12 | 00:48,120 | 【?】我把它当成风 | 我把它当作枫 | 低 |
```

## B. 检索解读 → 主题与情绪

用 WebSearch 查三件事，**每条都要带来源链接**：

1. `"<歌名>" 歌词 解读` / `"<歌名>" 歌词 含义`
2. `"<歌名>" 乐评` / `"<歌名>" 评论`
3. `"<歌名>" 网易云 热评` 或 `"<歌名>" 听众 故事`

归纳 **3~5 条**，每条一句结论 + 一句证据 + 链接。别写成百科条目，要写成「这支 MV 能用的判断」：

```markdown
1. **离别是「回不去」而非「失去」** —— 反复出现的"旧巷""那年的雨"，指向记忆的空间而非人。
   来源：[乐评标题](https://…)
2. **副歌是自我说服** —— 听众评论里高频出现"听完没有哭，是松了一口气"。
   来源：[热评合集](https://…)
```

> 检索不到就明说「没查到有效解读，按歌词字面推断」，不要编造来源链接。

## C. 节奏与段落 → 时间轴骨架

### 一条命令拿全部

```bash
npx hyperframes audio assets/audio/song.mp3 \
  --only bpm,beats,sections,onsets,moments,loudness --json > analysis.json
```

实测输出（120 BPM 节拍器样本）：

```json
{
  "bpm": { "value": 120, "curve": [...] },
  "beats": { "times": [0.505, 1.005, ...], "confidence": 0.991 },
  "sections": { "spans": [{"start": 0, "end": 60, "label": "A"}] },
  "onsets": { "events": [{"t": 0.03, "strength": 0.47}, ...] },
  "moments": { "onset": 0, "steepest": 0.808, "peak": 4.114, "tailEnd": 60 },
  "loudness": { "lufsIntegrated": -34.1, "truePeakDb": -17.9 }
}
```

**关键字段**

| 字段 | 用途 | 注意 |
|---|---|---|
| `bpm.value` | 全片节拍密度基准 | `null` + `beats.reason: "too short for a steady beat"` 表示没测到，改看 `onset` |
| `beats.times` | 切镜头的候选点 | **`confidence` < 0.4 时别信**，抒情歌会被测成双倍速 |
| `beats.confidence` | 上面那条的信任度 | ≥ 0.9 才用于「每拍一切」 |
| `sections.spans` | 前奏/主歌/副歌骨架 | label 只有 A/B/C…，**段落语义要靠歌词自己判** |
| `onsets.events` | 重音（鼓点、字头） | 找「最后一个重音」用这个 |
| `moments.peak` | 全曲最响的一瞬 | 通常是情绪最高点，留给近景 |
| `moments.tailEnd` | 尾巴衰减到 -40dB 的位置 | 结尾留白的起点 |
| `loudness.lufsIntegrated` | 原曲响度 | 渲染完拿它对比（08-review） |

### 段落划分（这一步必须人工判断，脚本只给候选）

`sections` 给的 A/B/C 是聚类结果，不是「主歌-副歌」。做法：

1. 用 `beats.times` 的间隔突变找段落边界（同一段内 BPM 稳定，换段时抖动）。
2. 用 `loudness` 短时能量曲线看起伏：主歌低、副歌高、桥段可能骤降。
3. 用 `lyrics.srt` 的重复句找副歌：**副歌的歌词一定会重复**。统计每句文本出现次数，出现 ≥2 次的就是副歌句。

```python
# 副歌检测：文本重复 + 时间分布
from collections import Counter
import re
cues = parse_srt("lyrics.srt")            # [{'t0':..,'t1':..,'text':..}]
norm = [re.sub(r"[^\u4e00-\u9fa5a-zA-Z]", "", c["text"]) for c in cues]
counter = Counter(norm)
chorus = {t for t, n in counter.items() if n >= 2 and len(t) >= 4}
print("副歌候选句:", chorus)
```

### 最后一个重音

「最后一个重音」= 最后一次「强 onset + 高响度」同时出现的位置，通常是最后一句副歌的第一个字或一个鼓点。

```bash
# 取 tail 之前 8 秒的所有 onset 强度
jq -r '.items[0].onsets.events | map(select(.t > 100 and .t < 200)) | sort_by(.strength) | reverse | .[0]' analysis.json
```

或直接看 `momentums.peak` 附近。把它写进 `song.md`，分镜的最后一镜要落在这个点上。

## D. `song.md` 模板（照抄这个结构）

```markdown
# <歌名> — 音乐分析

## 基本事实
- 歌名 / 歌手 / 时长 / 采样率 / 声道
- BPM: 118（confidence 0.93）
- 调性: （听感判断，如「大调偏暗」）
- 原曲响度: -9.8 LUFS integrated，true peak -0.3 dBFS

## 主题
一句话断言（不是介绍）。例：这是一支关于「告别不是转身，是把对方留在原处」的歌。

## 情绪走向
| 时间 | 段落 | 情绪 | 该给什么镜头 |
|---|---|---|---|
| 0:00-0:18 | 前奏 | 悬停 | 空镜，只给环境，角色不出场 |
| 0:18-0:52 | 主歌1 | 低语 | 中景，角色动作小 |
| 0:52-1:20 | 副歌1 | 撑开 | 全景 + 一次推近 |
| 1:20-1:44 | 间奏 | 回撤 | 空镜，物件特写 |
| …… | | | |

## 结构段落
- 前奏 0:00-0:18
- 主歌1 0:18-0:52
- 副歌1 0:52-1:20
- 主歌2 1:20-1:52
- 副歌2 1:52-2:20
- 桥段 2:20-2:44
- 尾奏 2:44-3:12

## 节奏锚点
- 节拍点（前 32 个）：0.51, 1.01, 1.51, …
- 每小节第一拍（4/4）：0.51, 2.51, 4.51, …
- 段落边界：18.2 / 52.4 / 80.1 / …
- 全曲最响：1:56.8
- **最后一个重音**：2:58.4（尾奏前的最后一记鼓）
- 尾巴衰减起点：3:04.0

## 检索到的解读
1. …（含链接）
2. …

## 低置信度歌词（待确认）
| # | 时间 | 我听到的 | 可能是什么 |
|---|---|---|---|
```

## 检查单

- [ ] `lyrics.srt` 条数 = 实际歌词句数，无空字幕、无重叠
- [ ] 最后一条时间 ≈ 音频时长
- [ ] BPM 与 `beats.confidence` 都记了；confidence < 0.4 时注明「改用 onset 切镜」
- [ ] 段落表覆盖 0 → 全曲结束，无空隙
- [ ] 「最后一个重音」有具体时间点
- [ ] 检索的每条解读都有来源链接（或明说没查到）
- [ ] 低置信度歌词已单独列出，等用户确认
