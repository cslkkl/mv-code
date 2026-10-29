# 一页流程卡 — 每首歌照这个顺序走

复制这份到工程里当清单用。每完成一项打勾。

```
用户: 「给《X》做支 MV」
```

---

## 0. 开工（1 分钟，不问就做）

- [ ] `npx hyperframes doctor` 全绿（whisper-cpp 红可忽略）
- [ ] 建目录 `mv-<name>/{assets/{audio,lib,fonts},compositions,tests,out,qa}`
- [ ] `assets/lib/gsap.min.js` 放好（见 00-setup 第 3 节）

## 1. 找歌（3~10 分钟）

- [ ] 先问一句「本地有 mp3 吗？有链接吗？」
- [ ] 没有 → `musicdl -k "歌名 歌手"`（见 `musicdl.md`）
- [ ] 统一改名 `assets/audio/song.mp3`，`ffprobe` 记时长
- [ ] `ffmpeg ebur128` 记原曲 LUFS

## 2. 分析（10~20 分钟）→ **song.md**

- [ ] `lyrics.srt`：有就用，没有 Whisper 转（见 01-song）
- [ ] 修 SRT：合并碎句、句末对齐 −0.12s、专名改正
- [ ] WebSearch 三个角度，归纳 3~5 条解读，**每条带链接**
- [ ] `npx hyperframes audio … --only bpm,beats,sections,onsets,moments,loudness --json`
- [ ] 段落划分（用副歌的「重复句」定，别信自动 label）
- [ ] 标出 **最后一个重音** 的时间点
- [ ] 低置信度歌词单独列出 → **问用户确认**

## 3. 三张画风样图（20~40 分钟）→ **停**

- [ ] 同一个开场画面，画三遍：像素 / 纸艺 / 蜡笔
- [ ] 每张 1920x1080，`snapshot` 出图
- [ ] 每张附一句适配理由
- [ ] **停，等用户选** → 写 `tests/style-choice.md`

## 4. 角色（20~40 分钟）→ **停**

- [ ] 复制 `assets/templates/character.js` 到 `compositions/character.js`，改配色/比例
- [ ] 表情 ≥3（开心/害羞/难过），动作 ≥4（走/跳/拥抱/手持）
- [ ] 道具挂 `pose().hand.r`，`y ≥ headTop+2`
- [ ] 出 `character-sheet.png`（三视图 + 表情表）
- [ ] **停，等用户确认**

## 5. 分镜（30~60 分钟）→ **停**

- [ ] 一句歌词一个 Frame，`start`/`duration` 严格衔接
- [ ] 抽象句换成具体动作（对照 04-storyboard 的对照表）
- [ ] 切点吸附 `beat_anchor`
- [ ] 问一次「有没有哪句你有具体想法」
- [ ] **停，等用户确认**

## 6. 转场（10~20 分钟）

- [ ] 三选一 + 理由，写进 `storyboard.md`
- [ ] 每两个相邻镜头填 `transition_in`
- [ ] 填「衔接帧一致性表」（角色位置/大小/姿态）
- [ ] 全片无整屏叠化、无来回推拉

## 7. 关键帧总览（30~60 分钟）→ **停**

- [ ] 每个 Frame 一个静态 composition
- [ ] `snapshot --at` 批量抽帧
- [ ] `ffmpeg tile` 拼 `storyboard.png`，每格标编号/时间/歌词/运镜
- [ ] **停，等用户确认**

## 8. 渲染（30 分钟 ~ 1 小时）

- [ ] 一镜一层相机，背景/角色/道具同画布
- [ ] 字幕在根 composition、`bottom:96px`、`z-index:99`、不随镜头
- [ ] `audio data-timeline-role="music" data-start="0"`
- [ ] 先渲 10s 草稿估时间
- [ ] `render -o out/终版.mp4 -q delivery`

## 9. 质检（30 分钟）→ **QA.md**

- [ ] 1 像幻灯片：`fps=2` 抽帧算 RMSE，找静止段
- [ ] 2 运镜晃：每镜 `#camera` tween ≤1
- [ ] 3 表现力：`moments.peak` 那帧 vs 主歌帧对比
- [ ] 4 道具：断言 `hand.r` + `headTop`
- [ ] 5 歌词演出：逐句抽帧对照
- [ ] 6 歌词对齐：差值 ≤0.15s
- [ ] 7 响度：两段 LUFS 差 ≤1.0
- [ ] 8 `check --json` 全绿

## 10. 交付

- [ ] `out/终版.mp4`
- [ ] `storyboard.png` / `character-sheet.png`
- [ ] `QA.md` + `qa/` 抽帧证据
- [ ] 一句话说明「哪些靠代码画、哪些是妥协」

---

## 时间与成本预期（跟用户讲清楚）

| 阶段 | 时长 | 主要成本 |
|---|---|---|
| 找歌 + 分析 | 15~30 分钟 | 几乎免费 |
| 三张样图 | 20~40 分钟 | 免费（代码画） |
| 角色 + 设定图 | 20~40 分钟 | 免费 |
| 分镜 + 转场 | 40~80 分钟 | 免费 |
| 关键帧总览 | 30~60 分钟 | 免费 |
| 全片实现 | 2~5 小时 | 免费 |
| 渲染 | 10 分钟~1 小时 | 电费/时间 |
| 质检 + 返工 | 30~90 分钟 | 免费 |

**全流程 4~8 小时**（3 分钟的曲子）。全程零 AI 生图费用 —— 这是这套流水线最大的价值。

## 三个最常见的走偏

1. **在分镜阶段偷偷换画风** → 全片重来。画风在 `tests/style-choice.md` 里定死。
2. **每个镜头重画角色** → 造型前后不一致。永远走 `character.js`。
3. **跳过关键帧总览直接渲染** → 渲完才发现构图崩，几小时白烧。第 7 步不能跳。
