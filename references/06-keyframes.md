# ⑥ 关键帧草图 — storyboard.png

**目的**：在烧渲染时间之前，用一张图让用户一眼看完整个片子的构图和节奏。**不渲染成片。**

## 做法

### A. 用快照拼版（推荐，最能反映真实成品）

1. 为每个 Frame 写一个 composition `compositions/frames/NN.html`，只画**这一镜的关键瞬间**（该镜的 `start + duration*0.6` 那一帧的状态），不做动画。
2. 每个 Frame 在 `index.html` 里挂上去（`data-composition-src` + `data-start` + `data-duration`）。
3. 一次性抽帧：

```bash
npx hyperframes snapshot \
  --at 2.5,6.8,11.2,14.9,... \
  --no-end -o boards/stills --json
```

4. 拼成总览图：

```bash
# 4 列网格，每格 480x270（1920/4）
ffmpeg -y -pattern_type glob -i 'boards/stills/frame-*.png' \
  -vf "scale=480:270,tile=4x5:margin=12:padding=8:color=0x1b1a17" \
  -frames:v 1 storyboard.png
```

`tile=4x5` 的列数×行数按镜头数调整（12 镜 → `3x4`，20 镜 → `4x5`）。

> `snapshot` 每次运行会**清空** `-o` 目录并从 `00` 编号，所以别把单帧快照抽到同一个目录。

### B. 手绘草图（快但不像成品）

用 Canvas 画简笔轮廓：矩形=画框，火柴人=角色，箭头=运镜方向。适合分镜还没定死时讨论构图。**不推荐作为最终确认依据**，因为用户看不到画风的真实质感。

## 版式要求

```
┌────────┬────────┬────────┬────────┐
│ 01     │ 02     │ 03     │ 04     │   ← 每个格子下方标：编号 / 时间 / 一句 caption
│ 0.0-4.2│        │        │        │
├────────┼────────┼────────┼────────┤
│ 05     │ ...    │        │        │
└────────┴────────┴────────┴────────┘
```

每格下方必须有三行信息（别省，用户就是靠这个判断节奏）：

- `01 · 0.0–4.2s`
- `> 歌词原文`（这一镜对应的那句）
- 运镜：`慢推 / 跟随 / 静止`

版式直接写进一个 HTML 页面用浏览器打开也行（比 ffmpeg 拼更好看）：

```html
<div class="board">
  <figure><img src="boards/stills/frame-00-at-2.5s.png"><figcaption>01 · 0.0–4.2s<br>巷子空着<br>慢推</figcaption></figure>
  ...
</div>
```

然后用 `npx hyperframes snapshot` 或 Playwright 截图成 `storyboard.png`。

## 确认要点（给用户看的四个问题）

出图时主动说这四句，让用户有的放矢地反馈：

1. 有没有哪一镜**看不出在演什么**？
2. 角色**大小跳变**的地方（对照 05 的一致性表）看着顺不顺？
3. 副歌的情绪**够不够**（不够就说明要换景别）？
4. 结尾那一镜**有没有余味**？

## 改稿纪律

- 用户只挑了几镜 → 只重做那几镜的 `stills`，其余保留（`snapshot` 用 `--keep` 或单帧抽到子目录再覆盖同名文件）。
- 改完重拼 `storyboard.png`，**再停一次**。
- 不要因为「我觉得还能更好」自行重做已通过的镜头。

## 检查单

- [ ] 每个 Frame 都有一张草图，编号与 storyboard.md 一致
- [ ] 每格标了编号、时间区间、歌词、运镜
- [ ] 拼图分辨率 ≥ 1920 宽，格子里的角色能看清表情
- [ ] 用户确认后才进 07 渲染
