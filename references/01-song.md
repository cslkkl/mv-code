# ① 音乐分析 — 产出 song.md 与 lyrics.srt

## 输入

`assets/audio/song.mp3`（+ 可能存在的 `assets/audio/song.lrc`）+ 歌名/歌手名。

---

## A. 歌词：三条路，按这个顺序试

### 路线 1（首选）：官方 LRC → SRT

**musicdl 下载歌曲时会同时带回 `.lrc`** —— 平台提供的歌词，与演唱精确对齐。
这条路的准确率比 Whisper 高一个数量级，实测同一段：

| | 内容 |
|---|---|
| ✅ 官方 LRC | 桌垫下的老照片 / 笨拙系上红色领带的结 / 等会儿见你一定比想象美 |
| ❌ Whisper small | 捉点下的老照片 / 奔着西沙 红色零带的街 / 等会儿见你一听 |
| ⚠ Whisper medium | 桌垫下的老照片 / 笨拙细杀红色领带的街 / 等会儿见你一定 |

```bash
python assets/scripts/lrc2srt.py assets/audio/song.lrc lyrics.srt \
  --audio-duration 371.08 --merge
```

- **LRC 只有开始时间、没有结束时间**：每句 `t1` 由下一句 `t0` 推出，最后一句用 `--audio-duration` 兜住
- `--merge`：LRC 换行跟着换气走（「我们终于 / 来到了这一天」是两行）。做**字幕**可不合并，做**分镜**要合并
- 头部「作词/作曲/编曲」默认丢掉（制作人员不是唱词），`--keep-header` 保留

### 路线 2：已有 SRT

用户给了就直接用。先检查三件事：

```bash
tail -5 lyrics.srt                          # 最后一条时间要接近 ffprobe 的 duration
grep -c '^\d\+$' lyrics.srt                 # 条数是否合理（一行 ≤ 16 汉字）
file -i lyrics.srt                          # 必须 utf-8
```

### 路线 3（兜底）：Whisper 转写

没有 LRC 才走这条。**注意它给的是语义分段，不是歌词行**，必须人工核对。

```bash
# 先设这两个环境变量，否则模型下载会卡住或报 401
export HF_ENDPOINT=https://hf-mirror.com
export HF_HUB_DISABLE_XET=1

python assets/scripts/transcribe.py assets/audio/song.mp3 lyrics.srt \
  --model medium --split comma
```

| 参数 | 说明 |
|---|---|
| `--model small\|medium\|large-v3` | **中文强烈建议 medium**，small 错字明显（「桌垫下」→「捉点下」）。medium 模型约 1.5 GB |
| `--split comma` | 逗号也切，接近「一句歌词一条字幕」（近似，不是精确歌词行） |
| `--split sentence` | 只在句号切，一条可能横跨 2~3 句歌词 |
| `--merge` | 合并被切碎的半句（`--max-chars` / `--max-sec` / `--max-gap` 三个上限） |

> 为什么不用 `hyperframes transcribe`：它依赖 whisper-cpp 二进制，`doctor` 报
> `whisper-cpp: Not found` 时直接跳过（"Captions skipped"）。faster-whisper 是纯 pip 装。
>
> 国内网络下模型下载的典型报错：
> `CAS Client Error: HTTP status client error (401 Unauthorized), domain: https://cas-server.xethub.hf.co/...`
> 设 `HF_HUB_DISABLE_XET=1` 即可。

### 转写/转换后必须做的四件事

1. **合并碎句**：一句歌词被切成 2~3 条是常态。做分镜必须一句一条。
2. **对齐句末**：每条 `结束时间` 拉到下一句 `开始时间` 前 0.12 秒（`MVSrt.tighten` 已内置）。
3. **修专有名词**：歌名、人名、地名按用户的写法改。
4. **标低置信度**：听不清的句子单独列出来，正文里标 `【?】`，等用户确认。

### 写进 `song.md` 的「低置信度歌词」小节

```markdown
| # | 时间 | 我听到的 | 可能是什么 | 置信度 |
|---|---|---|---|---|
| 12 | 00:48,120 | 【?】我把它当成风 | 我把它当作枫 | 低 |
```

> 走 LRC 路线时这一节通常是空的 —— 那是好事，直接写「无，歌词来自平台官方 LRC」。

---

## B. 检索解读 → 主题与情绪

用 WebSearch 查三件事，**每条都要带来源链接**：

1. `"<歌名>" 歌词 解读` / `"<歌名>" 歌词 含义`
2. `"<歌名>" 乐评` / `"<歌名>" 评论`
3. `"<歌名>" 网易云 热评` 或 `"<歌名>" 听众 故事`

归纳 **3~5 条**，每条一句结论 + 一句证据 + 链接。要写成「这支 MV 能用的判断」，不是百科条目：

```markdown
1. **离别是「回不去」而非「失去」** —— 反复出现的"旧巷""那年的雨"，指向记忆的空间而非人。
   来源：[乐评标题](https://…)
2. **副歌是自我说服** —— 听众评论高频出现"听完没有哭，是松了一口气"。
   来源：[热评合集](https://…)
```

> 检索不到就明说「没查到有效解读，按歌词字面推断」，不要编造来源链接。

---

## C. 节奏与段落 → 时间轴骨架

### 一条命令拿全部

```bash
npx hyperframes audio assets/audio/song.mp3 \
  --only bpm,beats,sections,onsets,moments,loudness --json > analysis.json
```

**实测输出**（真实歌曲《那些年》，5:32）：

```json
"bpm": { "value": 157.9 },
"beats": { "confidence": 0.194, "times": [ ... 955 个点 ] },
"sections": { "spans": [ {"start":0,"end":12.465,"label":"A"}, ... 17 段 ] },
"moments": { "peak": 304.084, "tailEnd": 367.776 },
"loudness": { "lufsIntegrated": -9.4 }
```

**关键字段**

| 字段 | 用途 | 注意 |
|---|---|---|
| `bpm.value` | 节拍密度基准 | 抒情歌会被测成双倍速（实测 157.9 对一首 78 BPM 的歌） |
| `beats.times` | 切镜头候选点 | **`confidence` < 0.4 时别信**（实测 0.194） |
| `beats.confidence` | 信任度 | ≥ 0.9 才用于「每拍一切」 |
| `sections.spans` | 段落候选 | label 只有 A/B/C…，**段落语义靠歌词自己判** |
| `onsets.events` | 重音（鼓点、字头） | 找「最后一个重音」用这个 |
| `moments.peak` | 全曲最响的一瞬 | 情绪最高点，留给近景 |
| `moments.tailEnd` | 尾巴衰减到 -40dB 的位置 | 结尾留白起点 |
| `loudness.lufsIntegrated` | 原曲响度 | 渲染完拿它对比（08-review 第 7 项） |

> 短样本（< 10 秒）会返回 `bpm.value: null` + `beats.reason: "too short for a steady beat"`，
> 这不是失败：改看 `onsets`。

### 段落划分（必须人工判断，脚本只给候选）

1. `sections` 给的 A/B/C 是聚类结果，不是「主歌-副歌」。
2. 用 `beats.times` 的间隔突变找段落边界（同段内 BPM 稳定，换段抖动）。
3. 用 `loudness` 短时能量曲线看起伏。
4. **用 lyrics.srt 的重复句找副歌** —— 副歌的歌词一定会重复。统计每句出现次数，≥2 次且长度 ≥4 字的就是副歌句，它所在的时间段就是副歌。

```python
from collections import Counter
import re
cues = MVSrt_parse("lyrics.srt")                 # 或用 lrc2srt 的 parse_lrc
norm = [re.sub(r"[^\u4e00-\u9fa5a-zA-Z]", "", c["text"]) for c in cues]
chorus = {t for t, n in Counter(norm).items() if n >= 2 and len(t) >= 4}
print("副歌候选句:", chorus)
```

### 最后一个重音

「最后一个重音」= 最后一次「强 onset + 高响度」同时出现的位置，通常是最后一句副歌的第一个字或一记鼓。

```bash
jq -r '.items[0].onsets.events | sort_by(.strength) | reverse | .[0]' analysis.json
```

或直接看 `moments.peak`。写进 `song.md`，分镜的最后一镜要落在这个点上。

---

## D. `song.md` 模板（照 `assets/templates/song.md` 填）

```markdown
# <歌名> — 音乐分析

## 基本事实
- 歌名 / 歌手 / 时长 / 采样率 / 声道
- BPM: 118（confidence 0.93）
- 调性（听感）：大调偏暗
- 原曲响度：-9.4 LUFS integrated，true peak -0.1 dBFS
- 歌词来源：平台官方 LRC / Whisper medium / 用户提供

## 主题
一句话断言（不是介绍）。

## 情绪走向
| 时间 | 段落 | 情绪 | 该给什么镜头 |
|---|---|---|---|
| 0:00-0:18 | 前奏 | 悬停 | 空镜，只给环境，角色不出场 |
| …… | | | |

## 结构段落
- 前奏 0:00-0:18
- 主歌1 0:18-0:52
- ……

## 节奏锚点
- 节拍点（前 32 个）
- 每小节第一拍（4/4）
- 段落边界
- 全曲最响：1:56.8
- **最后一个重音**：2:58.4
- 尾巴衰减起点：3:04.0

## 检索到的解读
1. …（含链接）

## 低置信度歌词（待确认）
| # | 时间 | 我听到的 | 可能是什么 |
```

---

## 检查单

- [ ] 优先试过 LRC 路线；用了 LRC 就在 `song.md` 里注明
- [ ] `lyrics.srt` 条数 = 实际歌词句数，无空字幕、无重叠
- [ ] 最后一条时间 ≤ 音频时长
- [ ] BPM 与 `beats.confidence` 都记了；confidence < 0.4 时注明「改用 onset 切镜」
- [ ] 段落表覆盖 0 → 全曲结束，无空隙
- [ ] 「最后一个重音」有具体时间点
- [ ] 检索的每条解读都有来源链接（或明说没查到）
- [ ] 低置信度歌词已单独列出（走 LRC 时写「无」）
