# HyperFrames 硬性契约 — 写任何 composition 前必读

这套规则违反了不会报错，只会**渲染出黑屏或空白**。已在本机实测（hyperframes 0.8.214，Node 24，Chrome headless）。

## 1. 项目骨架

```
index.html                    ← 根 composition，声明变量、挂场景、放音频
compositions/
  s01.html, s02.html, …       ← 每个场景一个文件，内容全在 <template> 里
  character.js                ← 角色模块
assets/
  audio/song.mp3
  lib/gsap.min.js             ← 本地内置，不用 CDN
  fonts/
```

`index.html`：

```html
<div id="root" data-composition-id="main" data-start="0" data-duration="62"
     data-width="1920" data-height="1080" data-fps="30">
  <div id="s01" class="clip" data-composition-id="s01"
       data-composition-src="compositions/s01.html"
       data-start="0" data-duration="4.2"
       data-track-index="0" data-track-kind="graphics"
       data-width="1920" data-height="1080"></div>
  <audio id="music" data-timeline-role="music" data-start="0" data-duration="62"
         src="assets/audio/song.mp3" data-volume="1"></audio>
</div>
```

`compositions/s01.html`：

```html
<template>
  <style> #root { position: absolute; inset: 0; } </style>
  <div id="root" data-composition-id="s01" data-width="1920" data-height="1080">
    …
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#thing", { opacity: 0 }, { opacity: 1, duration: .3 }, 0.2);
    window.__timelines["s01"] = tl;      // 最后注册
  </script>
</template>
```

## 2. 十二条契约（违反即黑屏/报错）

1. 每个有时长的元素都要 `class="clip"` + `data-start` + `data-duration`（秒）。显示区间是 `[start, start+duration)`，**落在结束点的状态永远不会被渲染**。
2. 视频总长 = 根节点的 `data-duration`。超出被截断，不够则停在最后一帧。
3. 每个 composition 构建**一个 paused timeline**，在**所有 tween 之后**注册到 `window.__timelines["<id>"]`。
4. 禁止 `Date.now()`、未 seed 的 `Math.random()`、网络请求、计时器、`repeat: -1`。**一切可见状态必须是时间的函数。**
5. 不要在 `.clip` 元素上 tween `display` / `visibility` / `autoAlpha` —— 要动就动子元素。
6. 不要给 GSAP 要动的元素写 CSS `transform`；用 `fromTo` 在 tween 里设初始值。动 transform，不动 `left/top/width/height`。
7. 永远不要 `play()` / `pause()` / seek 媒体。`<video>` 要留声就 `data-has-audio="true"`，否则 `muted`。音乐/人声一律单独的 `<audio>`。
8. 每个 `<audio>` 必须有 `id`。媒体上不要 `crossorigin`。同一个 `<video>` 和它的包裹层不能都加时间。
9. 字体只能用内置那批（Inter/Montserrat/…/Noto Sans JP），其他要 `@font-face` 指到 `assets/fonts/` 或用 `local("字体名")`。
10. 资源路径写 `assets/...`，**不要以 `/` 开头**（子 composition 里也一样）。
11. 调色、颗粒、模糊、暗角一律走 `npx hyperframes media-treatment`，不要用 CSS filter。
12. 场景文件把 style/markup/script 全放进 `<template>`，根元素选择器用 `#root`。

## 3. 本机实测踩到的五个坑

### 坑 1：GSAP 走 CDN 会渲染出全黑

`hyperframes init` 模板默认引用 `https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js`。本机实测这条 CDN 连接被重置：

```
Failed to load npm/gsap@3.14.2/dist/gsap.min.js: net::ERR_CONNECTION_RESET
page_error: Cannot read properties of undefined (reading 'timeline')
```

后果：`check` 报 65 个 page_error，`render` 出一段纯黑。

**修法**：`npm pack gsap@3.14.2` → 解包 → 拷 `dist/gsap.min.js` 到 `assets/lib/`，改成 `<script src="assets/lib/gsap.min.js">`。详见 `00-setup.md`。

### 坑 2：中文字体名会被 lint 拦

```
font_family_without_font_face: Font family used without @font-face declaration: noto sans sc
```

HyperFrames 只自动解析内置拉丁字体，中文必须自己声明：

```css
@font-face { font-family: "Noto Sans SC"; src: local("Microsoft YaHei"); }
```

### 坑 3：`data-composition-id` 必须三个地方同名

宿主 div 的 `data-composition-id`、场景文件里根元素的 `data-composition-id`、`window.__timelines["<id>"]` 的键 —— 三者必须完全一致。不一致的症状是**每个场景渲染前卡 45 秒，然后画面静止**。

### 坑 4：`beats` 需要标记音乐轨

```
No music track found. Add data-timeline-role="music" to the <audio> element
```

`<audio id="music" data-timeline-role="music" …>` 加上才能跑 `npx hyperframes beats`。之后会在 `beats/<audio 路径>.json` 生成节拍表。

### 坑 5：canvas / p5 必须走 `hf-seek`，不能自己开 rAF

```js
window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
renderAt(0);      // 首帧也要画，否则第 0 帧是空白
```

用 `requestAnimationFrame` 或 `setInterval` 当钟 → 渲染出来的每一帧都一样（渲染器只 seek，不跑时间）。

## 4. 常用命令

```bash
npx hyperframes doctor                     # 环境自检
npx hyperframes check --json               # lint + 运行时 + 布局 + 动效 + 对比度
npx hyperframes snapshot --at 3,7.5 --no-end -o snaps --json
npx hyperframes audio x.mp3 --only bpm,beats,sections,onsets,moments,loudness --json
npx hyperframes beats --json               # 需要 data-timeline-role="music"
npx hyperframes timeline --json            # 每段的绝对起止
npx hyperframes render -o out/x.mp4 -q draft|looks|delivery
npx hyperframes preview --background       # 给用户看的浏览器预览
npx hyperframes lint --verbose
```

`render` 的质量档：`draft`（快，看节奏）/ `looks`（默认，CRF 16）/ `delivery`（终版）。

## 5. `check` 的输出怎么读

```json
{ "ok": false,
  "lint":    { "ok": true,  "errorCount": 0, "warningCount": 0, "findings": [] },
  "runtime": { "ok": true,  "errorCount": 0 },
  "layout":  { "ok": true,  "warningCount": 2 },
  "motion":  { "ok": true,  "warningCount": 1 },
  "contrast":{ "ok": false, "errorCount": 1 } }
```

| 段 | 报什么 | 怎么修 |
|---|---|---|
| `lint` | 静态规则（字体、媒体属性、clip 缺属性） | 按 `fixHint` 改 |
| `runtime` | 页面 JS 错误、资源 404 | 先看有没有 `ERR_CONNECTION_RESET`（CDN 问题） |
| `layout` | 元素出画（`panel_out_of_canvas`）、文字溢出 | 挪回画布内，或加 `data-layout-allow-overflow` |
| `motion` | **`dead_stretch`：某段 3 秒以上画面没变化** ← 最常撞 | 见 08 第 1 项 |
| `contrast` | WCAG AA 不达标 | 字幕加深色底衬或描边 |

`motion.dead_stretch` 是「像幻灯片」的自动告警，别忽略。

## 6. 字幕位置

字幕放在**根 composition**（`index.html`）里，不放进场景文件 —— 场景会随镜头推拉缩放，字幕不能。

```html
<div id="subs" class="clip" data-start="0" data-duration="62" data-track-index="99"
     style="position:absolute; left:0; right:0; bottom:96px; text-align:center; z-index:99;"></div>
```

逐帧由 `hf-seek` 更新文本（用 `MVSrt.at(cues, t)`），见 `assets/templates/srt.js`。
