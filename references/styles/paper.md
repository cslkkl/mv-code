# 画风 B — 纸艺拼贴绘本

## 规格

| 项 | 值 |
|---|---|
| 实现 | DOM + CSS 为主，复杂形状用内联 SVG；尽量不碰 canvas |
| 每个元素 | **剪纸白边**（`paint-order: stroke` 或双层描边）或**撕纸毛边** + 投影 |
| 投影 | 两层：`drop-shadow(2px 3px 2px rgba(0,0,0,.35))` + 极淡的大范围环境影 |
| 底纹 | 旧报纸 / 牛皮纸（CSS 生成，不下载图片） |
| 动画 | 画面每秒更新 **8~12 次**；每次整体抖动 **1~2px**（seed 由帧号决定） |
| 层叠 | 3~5 层，每层轻微视差（推镜时层与层速度不同） |

## 剪纸白边的三种做法

**A. SVG `paint-order`（最干净，推荐）**

```html
<path d="M…" fill="#b8452e" stroke="#fbf7ee" stroke-width="4" paint-order="stroke" />
```

`paint-order: stroke` 让描边画在填充**下面**，露出外圈的宽度正好是 `stroke-width / 2`。

**B. 双层元素**

```html
<div class="cut">
  <div class="cut-inner"></div>
</div>
```

```css
.cut { background: #fbf7ee; padding: 4px; }
.cut-inner { background: #b8452e; }
```

缺点：只能做矩形/圆角矩形，异形要靠裁剪路径。

**C. 撕纸毛边**

```css
.torn {
  background: #b8452e;
  clip-path: polygon(
    0% 4%, 8% 0%, 22% 3%, 35% 0%, 51% 4%, 66% 1%, 80% 4%, 93% 1%, 100% 5%,
    100% 96%, 91% 100%, 76% 97%, 60% 100%, 44% 96%, 28% 100%, 12% 97%, 0% 100%
  );
}
```

顶点坐标手写死，不要用 `Math.random()` 生成 —— 渲染逐帧 seek 会每帧都不一样。要随机就预生成为常量。

## 纸底纹（纯 CSS）

```css
.paper {
  background-color: #d8c9a8;
  background-image:
    repeating-linear-gradient(90deg, rgba(0,0,0,.035) 0 1px, transparent 1px 3px),   /* 纤维 */
    repeating-linear-gradient(0deg, rgba(0,0,0,.02) 0 1px, transparent 1px 4px),     /* 报纸行线 */
    radial-gradient(circle at 30% 20%, rgba(255,255,255,.35), transparent 60%);      /* 受光 */
  box-shadow: inset 0 0 160px rgba(80,60,30,.22);                                    /* 纸边压暗 */
}
```

旧报纸版：把 `repeating-linear-gradient(0deg, rgba(0,0,0,.05) 0 2px, transparent 2px 14px)` 当行距，模拟铅字行。

## 8~12 fps 抖动的实现

关键：**抖动频率低于 24fps 才有定格动画感**，高于 24 就变成"手抖"。抖动要和渲染帧率解耦。

```js
// composition 里，用 GSAP 的 ticker 换成"帧号阶梯"，不要用 requestAnimationFrame
const FPS_ANIM = 10;                       // 每秒更新 10 次
const t = timeline.time();                 // 由 hf-seek 提供
const frame = Math.floor(t * FPS_ANIM);    // 阶梯化
const jx = (hash(frame, 1) - 0.5) * 2;     // -1 ~ +1 px
const jy = (hash(frame, 2) - 0.5) * 2;
root.style.transform = `translate(${jx.toFixed(2)}px, ${jy.toFixed(2)}px)`;

// 确定性哈希：同一帧号永远同一个偏移
function hash(n, salt) {
  let x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
```

> 整个画面一起抖 1~2px = 定格动画。只有角色抖 = 画面在抽动，很廉价。

## composition 骨架

```html
<template>
  <style>
    #root { position: absolute; inset: 0; background: #d8c9a8; overflow: hidden; }
    #stage { position: absolute; inset: -4px; }              /* 留 4px 给抖动 */
    .layer { position: absolute; inset: 0; }
    .paper {
      background-color: #d8c9a8;
      background-image:
        repeating-linear-gradient(90deg, rgba(0,0,0,.035) 0 1px, transparent 1px 3px),
        repeating-linear-gradient(0deg, rgba(0,0,0,.02) 0 1px, transparent 1px 4px);
    }
    .cut { filter: drop-shadow(2px 3px 2px rgba(0,0,0,.35)) drop-shadow(0 18px 26px rgba(0,0,0,.10)); }
  </style>
  <div id="root" data-composition-id="pp-scene-01" data-width="1920" data-height="1080">
    <div id="stage">
      <div class="layer paper" id="sky"></div>
      <div class="layer" id="far"></div>
      <div class="layer" id="mid"></div>
      <div class="layer" id="char"></div>
    </div>
  </div>
  <script>
    // … 抖动 + 视差 + character.js 的 svgPaper()
  </script>
</template>
```

## 视差（推镜时层与层速度不同）

```js
// 推镜：从 1.00 推到 1.08，前景推得快，背景几乎不动
tl.fromTo("#sky",  { scale: 1.00 }, { scale: 1.02, duration: 4, ease: "none" }, 0);
tl.fromTo("#far",  { scale: 1.02 }, { scale: 1.05, duration: 4, ease: "none" }, 0);
tl.fromTo("#mid",  { scale: 1.04 }, { scale: 1.10, duration: 4, ease: "none" }, 0);
tl.fromTo("#char", { scale: 1.06 }, { scale: 1.14, duration: 4, ease: "none" }, 0);
```

**必须**用 `transform: scale`，不要改 `width/height`（会重排、会糊）。

## 常见坑

| 现象 | 原因 | 修法 |
|---|---|---|
| 白边不出现 | `paint-order` 写在 CSS 类里但被 SVG 默认值覆盖 | 写成 SVG 属性 `paint-order="stroke"` |
| 投影很脏 | 一层大模糊 `drop-shadow` | 拆成两层：硬边长距离短 + 软边短距离长 |
| 抖动像发癫痫 | 每帧都换偏移（30fps） | 阶梯到 8~12fps |
| 撕纸边每帧都在变 | 用了 `Math.random()` | 预生成常量 polygon |
| 一推镜就露底 | 层没留出血 | 每层 `inset: -4%` 或 `scale: 1.06` 起步 |
| 文字发糊 | 抖动加在含文字的层上 | 文字层单独放在 `#stage` 外，不参与抖动 |

## 适合什么歌

**适合**：叙事型、童年/回忆、民谣、有具体物件的歌（信、旧照片、伞、路灯）。纸艺对「旧」有天然的适应力。

**不适合**：需要连续运动（奔跑、跳舞）的歌 —— 定格抖动会让动作看起来卡顿；电子/舞曲。
