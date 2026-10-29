# ⑦ 制作成片 — 从分镜到 mp4

用户确认了 `storyboard.png` 才开工。

## 规格（用户原话，逐条落实）

| 要求 | 落实方式 |
|---|---|
| 每个镜头的背景、角色、道具在**同一画布**统一绘制 | 一个 composition 一层 `#root` 里画完；不要背景图和角色视频分层叠加 |
| 随镜头推拉**同步运动** | 所有元素挂在同一个 `#camera` 容器里，只对 `#camera` 做 transform |
| 歌词读取 `lyrics.srt` | `MVSrt.at(cues, t)` 逐帧取 |
| 歌词置**最上层** | 在根 composition 里，`z-index` 最高，且在 `#camera` 外面 |
| 歌词显示在画面**下方** | `bottom: 96px`（1920x1080 下约 9%） |
| 歌词**不随镜头运动** | 放在 `#camera` 外面，不参与任何 transform |
| 配 `song.mp3` | `<audio data-timeline-role="music">` |
| 按分镜的画幅与帧率导出 MP4 | `data-width/height/fps` + `render -q delivery` |

## 一层画布 + 一个相机

这是「不分层叠加」的关键结构：

```html
<div id="root" data-composition-id="s01" data-width="1920" data-height="1080">
  <div id="camera">
    <div id="sky"></div>      <!-- 背景 -->
    <div id="far"></div>      <!-- 远景 -->
    <div id="mid"></div>      <!-- 中景 -->
    <div id="char"></div>     <!-- 角色（character.js 画进来） -->
    <div id="prop"></div>     <!-- 道具 -->
  </div>
</div>
```

```js
// 唯一的运镜：只动 #camera，所有元素自然同步
tl.fromTo("#camera",
  { scale: 1.00, x: 0, y: 0 },
  { scale: 1.08, x: -30, y: -12, duration: 4.2, ease: "none" }, 0);
```

**不要**这样做（会脱层）：

```js
tl.to("#sky", { scale: 1.08, duration: 4.2 });     // ❌ 背景自己在动
tl.to("#char", { scale: 1.08, duration: 4.2 });    // ❌ 角色自己在动
```

要视差就在**同一个相机**下给每个层不同的 `scale` 起点（见 `styles/paper.md`），但相机本身只有一个。

## 字幕不随镜头动

```html
<div id="root" data-composition-id="main" …>
  <div id="s01" class="clip" … data-composition-src="compositions/s01.html"></div>
  …
  <div id="subs" class="clip" data-start="0" data-duration="62" data-track-index="99"></div>
</div>
```

```js
// index.html 的脚本里
window.addEventListener("hf-seek", async (e) => {
  const t = e.detail.time;
  const cue = MVSrt.at(cues, t);
  subs.textContent = cue ? cue.text : "";
});
```

字体：`font-size: 56px`、`line-height: 1.4`、`text-shadow: 0 2px 0 rgba(0,0,0,.55)`（深色底）或 `-webkit-text-stroke: 2px #fff`（浅色底）。

## 逐镜实现顺序

按 `storyboard.md` 一镜一镜来，每镜做完先自检：

```bash
npx hyperframes snapshot --at <该镜 start+0.3>,<该镜 start+duration*0.6> \
  --composition s01 --no-end -o snaps/s01 --json
```

看两帧：开头（`reads` 的第一个窗口）和中部（动作到位）。**看图，不看 check 结果** —— check 通过不代表好看。

## 转场实现

按 05 的方案。三种最常用的写法：

**硬切**：什么都不用做，两个 clip 的时间窗首尾相接。

**甩镜（whip）**：上一镜尾 + 下一镜头。

```js
// 上一镜（尾 0.18s）
tl.to("#camera", { x: -1400, ease: "power2.in", duration: 0.18 }, dur - 0.18);
tl.to("#camera", { opacity: 0, duration: 0.18 }, dur - 0.18);
// 下一镜（头 0.18s）
tl.fromTo("#camera", { x: 1400 }, { x: 0, ease: "power2.out", duration: 0.18 }, 0);
tl.fromTo("#camera", { opacity: 0 }, { opacity: 1, duration: 0.18 }, 0);
```

注意：动的是**子元素 `#camera`** 而不是 `.clip` 宿主，符合契约第 5 条。

**前景扫过**：在 `#camera` 里放一个比画面大的形状，横穿全屏。

```js
tl.fromTo("#wipe", { x: -2400 }, { x: 2400, duration: 0.36, ease: "power1.inOut" }, cutAt - 0.18);
```

**卡片滑入（拼贴）**：新卡片从右下进入，旧卡片缩放到左上。

```js
tl.fromTo("#cardB", { x: 1100, y: 260, rotate: 6 }, { x: 0, y: 0, rotate: 0, duration: .28 }, cutAt);
tl.to("#cardA", { x: -420, y: -140, scale: .92, opacity: .35, duration: .28 }, cutAt);
```

## 音频

```html
<audio id="music" data-timeline-role="music" data-start="0"
       data-duration="62" src="assets/audio/song.mp3" data-volume="1"></audio>
```

- `data-duration` 不写就播完整曲；写了就截断。**建议不写**，让曲长自己决定，然后把根 `data-duration` 设成 `ffprobe` 出来的精确时长。
- 想淡出结尾：`data-fade-out="1.5"`。

## 渲染

```bash
# 先渲 10 秒草稿估时间与文件大小
npx hyperframes render --range 0,10 -o out/draft10.mp4 -q draft

# 全片草稿（看节奏，用户可以先看这个）
npx hyperframes render -o out/draft.mp4 -q draft

# 终版
npx hyperframes render -o out/终版.mp4 -q delivery -f 30
```

`-q`: `draft` / `looks`(默认 CRF16) / `delivery`。

渲染耗时参考（16 核 Ryzen 9 7940H，1920x1080@30）：
| 画风 | 每分钟成片 |
|---|---|
| 像素（canvas 320p） | ~25 秒 |
| 纸艺（DOM+CSS） | ~40 秒 |
| 蜡笔（p5.brush WEBGL） | ~4~8 分钟 |

蜡笔风先渲 10 秒草稿确认性能，别直接全片。

## 交付前自查（不是 08 的完整质检，是快速自检）

```bash
# 1. 时长对得上
ffprobe -v error -show_entries format=duration -of csv=p=0 out/终版.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 assets/audio/song.mp3

# 2. 有音轨且不是静音
ffmpeg -hide_banner -nostats -i out/终版.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+I:"

# 3. 抽帧看歌词对齐
ffmpeg -y -ss 12.5 -i out/终版.mp4 -frames:v 1 snaps/check-12.5.png
```

三条都过，再进 08 做完整的八项质检。

## 常见错误

| 现象 | 原因 | 修法 |
|---|---|---|
| 画面全黑 | CDN 的 gsap 没加载 | 见 `hyperframes.md` 坑 1 |
| 某个场景静止 | scene id 三处不一致 | 见 `hyperframes.md` 坑 3 |
| 字幕不动 | 字幕放在场景文件里了 | 移到根 composition |
| 字幕跟着镜头放大 | 字幕在 `#camera` 里 | 移出去 |
| 音画不同步 | `<audio data-start>` 不是 0 | 设 0，让画面去对齐音频 |
| 渲染 45 秒后出空白帧 | 场景没有 timeline（纯静态） | 加 `data-no-timeline` 或给一个 0.01s 的 tween |
