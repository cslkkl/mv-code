# <歌名> — 音乐分析

## 基本事实

- 歌名 / 歌手：
- 时长： mm:ss（ffprobe）
- 采样率 / 声道：
- BPM： （confidence ）
- 调性（听感）：
- 原曲响度： LUFS integrated，true peak dBFS（`ffmpeg ebur128`）

## 主题

一句话断言（不是介绍、不是百科）。例：这是一支关于「告别不是转身，是把对方留在原处」的歌。

## 情绪走向

| 时间 | 段落 | 情绪 | 该给什么镜头 |
|---|---|---|---|
| 0:00-0:18 | 前奏 | 悬停 | 空镜，只给环境，角色不出场 |
| | | | |

## 结构段落

- 前奏
- 主歌 1
- 副歌 1
- 间奏
- 主歌 2
- 副歌 2
- 桥段
- 尾奏

> 副歌判定：统计 `lyrics.srt` 里重复出现 ≥2 次的句子，重复句所在的时间段就是副歌。

## 节奏锚点

- 节拍点（前 32 个）：
- 每小节第一拍（4/4）：
- 段落边界：
- 全曲最响： （`moments.peak`）
- **最后一个重音**： （切镜尾要落在这里）
- 尾巴衰减起点： （`moments.tailEnd`）

> 生成方式：
> ```bash
> npx hyperframes audio assets/audio/song.mp3 \
>   --only bpm,beats,sections,onsets,moments,loudness --json > analysis.json
> ```
> `beats.confidence < 0.4` 说明节拍不可信，改用 `onsets.events` 里强度最高的那些点。

## 检索到的解读

1. **结论** —— 证据。
   来源：[标题](链接)
2. …
3. …

## 低置信度歌词（待确认）

| # | 时间 | 我听到的 | 可能是什么 | 置信度 |
|---|---|---|---|---|
