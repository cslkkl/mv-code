# 画风 A — 像素游戏风

## 规格

| 项 | 值 |
|---|---|
| 逻辑分辨率 | 320x180（16:9 精确整数倍放大到 1920x1080 = 6x） |
| 颜色 | 16~32 色，写死成一个 `PALETTE` 数组 |
| 放大 | CSS `width:1920px; height:1080px; image-rendering: pixelated` |
| 抗锯齿 | `ctx.imageSmoothingEnabled = false`（**每帧都要设**，`resize` 后会被重置） |
| 渐变 | 只能用抖动点阵（ordered dither），禁止 `createLinearGradient` |
| 动画 | 逐帧换画，禁止补间；帧号 = `Math.floor(t * fps)` |
| 帧率 | 8 / 10 / 12 fps，动作快的地方 12，静景 8 |

## composition 骨架

```html
<template>
  <style>
    #root { position: absolute; inset: 0; background: #0d0b0a; }
    canvas {
      position: absolute; left: 0; top: 0;
      width: 1920px; height: 1080px;      /* 6x */
      image-rendering: pixelated;
      image-rendering: crisp-edges;       /* 兼容旧 Chrome */
    }
  </style>
  <div id="root" data-composition-id="px-scene-01" data-width="1920" data-height="1080">
    <canvas id="cv" width="320" height="180"></canvas>
  </div>
  <script>
    (function () {
      const W = 320, H = 180;
      const cv = document.getElementById("cv");
      const ctx = cv.getContext("2d", { alpha: false });
      ctx.imageSmoothingEnabled = false;

      const PALETTE = ["#0d0b0a", "#2b1d16", "#7a3b1e", "#e0693a", "#f2e8d5"];

      // 必须用确定性 PRNG，绝不用 Math.random（渲染是逐帧 seek）
      function mulberry32(a) {
        return function () {
          a |= 0; a = (a + 0x6d2b79f5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      // 4x4 Bayer 矩阵的抖动填充：唯一的"渐变"手段
      const BAYER4 = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
      function dither(x, y, w, h, colA, colB, ratio) {
        for (let yy = y; yy < y + h; yy++) {
          for (let xx = x; xx < x + w; xx++) {
            const th = BAYER4[(yy & 3) * 4 + (xx & 3)] / 16;
            ctx.fillStyle = th < ratio ? colB : colA;
            ctx.fillRect(xx, yy, 1, 1);
          }
        }
      }

      function renderAt(t) {
        const frame = Math.floor(t * 12);          // 12fps 逐帧
        const rnd = mulberry32(frame);             // 帧号做种子

        ctx.fillStyle = PALETTE[0];
        ctx.fillRect(0, 0, W, H);

        // 天空：两条抖动带充当渐变
        dither(0, 0, W, 60, PALETTE[0], PALETTE[1], 0.25);
        dither(0, 40, W, 40, PALETTE[1], PALETTE[2], 0.35);

        // 地面 + 滚动（用整数像素，避免亚像素发糊）
        ctx.fillStyle = PALETTE[1];
        ctx.fillRect(0, 130, W, 50);
        for (let i = 0; i < 8; i++) {
          const x = ((i * 40 - Math.floor(t * 30)) % 320 + 320) % 320;
          ctx.fillStyle = PALETTE[2];
          ctx.fillRect(x, 140, 10, 3);
        }

        // 角色交给 character.js（见 03-character）
        MVChar.drawPixel(ctx, PALETTE, frame, 90, 130);
      }

      window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
      renderAt(0);
    })();
  </script>
</template>
```

## 抖动写法（替代渐变）

不要这样做：

```js
const g = ctx.createLinearGradient(0, 0, 0, 60);   // ❌ 出来是平滑的，破坏像素感
```

要这样：按 Bayer 矩阵决定每个像素取 A 还是 B，`ratio` 控制混合比例。天空从上到下分 3~4 条带、`ratio` 递增，就有渐变感且保持 16 色。

## 逐帧动画写法

```js
// 6 帧行走循环
const WALK = [
  { dx: 0,  lift: 0, legA: 8, legB: 8 },
  { dx: 1,  lift: -1, legA: 9, legB: 7 },
  { dx: 2,  lift: 0, legA: 8, legB: 8 },
  { dx: 1,  lift: 0, legA: 7, legB: 9 },
  { dx: 0,  lift: -1, legA: 8, legB: 8 },
  { dx: -1, lift: 0, legA: 9, legB: 7 },
];
const f = Math.floor(t * 12) % WALK.length;
```

**禁止**：`tl.to(sprite, {x: 100, duration: 2})` —— 补间出来的中间帧在 320x180 上会落在半像素，放大 6 倍就是糊。

## 推镜会破坏像素整数倍（重要）

320x180 用 CSS 放大 6 倍 → 每个逻辑像素正好 6 个屏幕像素。一旦对 **父容器** 做 `scale: 1.06` 推镜，
每个逻辑像素变成 6.36 个屏幕像素 → 出现粗细不均的像素行。

三种选择：

| 做法 | 效果 | 何时用 |
|---|---|---|
| 相机 `scale` 只取整数（1.0 → 2.0 太大；实际用不了） | 像素完美 | 需要「画面变大」的镜头 |
| 相机只做**整数逻辑像素平移**（`translate(±N*6px)`），不缩放 | 像素完美，靠位移造运动 | **默认推荐** |
| 接受非整数缩放（`1.0 → 1.06`） | 轻微不均，肉眼多数看不出 | 需要推镜且不在意 |

推荐写法（纯平移，像素完美）：

```js
// 相机只平移，步长是 6px 的整数倍
tl.fromTo("#camera", { x: 0 }, { x: -48, duration: DUR, ease: "none" }, 0);   // -8 逻辑像素
```

需要「推近」时，改成把**角色**在逻辑画布里变大（`scale: 1 → 1`，但重画更大的 sprite），
而不是缩放画布 —— 像素风里「演员走近」永远比「镜头推近」更对。

## 常见坑

| 现象 | 原因 | 修法 |
|---|---|---|
| 放大后糊成一片 | 用了非整数倍，或漏设 `imageSmoothingEnabled` | 逻辑尺寸必须整除目标尺寸；每帧开头设一次 |
| **画面上有上一帧的残影** | 只清了天空带，地面/角色区域没清 | **每帧第一件事** `ctx.fillRect(0,0,W,H)` 铺满底色；`clearRect` 也要，但铺底更保险 |
| 画面有暗纹 | 用 `alpha: true` 且没清底层 | `getContext("2d", {alpha:false})` + 每帧全屏 `fillRect` |
| 角色腿看不见 | 腿用了和地面同色（`dark`） | 腿/轮廓一律用 `ink`（调色板第 0 色） |
| 颜色超出调色板 | 用了 `rgba()` 半透明 | 像素风里半透明=新颜色，改成在两个调色板色之间抖动 |
| 帧闪烁 | `Math.random()` | 换 `mulberry32(frame)` |
| 文字发糊 | 用系统字体画在 320 宽画布上 | 要么用像素字体（8x8 bitmap），要么把文字画在 1920 层（HTML 字幕） |

## 适合什么歌

**适合**：童年/校园/游戏感/轻快的歌、节奏在 100~140 BPM、歌词有具体场景。

**不适合**：极慢的抒情（像素的僵硬会破坏情绪）、需要细腻表情的歌（32x32 画不出微表情）。
