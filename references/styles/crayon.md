# 画风 C — 蜡笔手绘绘本

## 规格

| 项 | 值 |
|---|---|
| 技术 | p5.js 2.x + p5.brush，`createCanvas(w, h, WEBGL)` |
| 笔刷 | `brush.set("crayon" / "charcoal" / "HB", color, weight)` |
| 纸纹 | `brush.fill()` 的低透明度擦笔，或 CSS 底纹 + canvas 透明 |
| 线条 | 同一根线重画 2~3 遍，每遍偏移 1~2px |
| 帧率 | 笔触（线条抖动）8~12fps；角色位移可以 30fps |
| 确定性 | `p.randomSeed(frame)` + `p.noiseSeed(frame)`，**绝不 `Math.random()`** |

## 安装（本地文件，不要 CDN）

```bash
npm pack p5@2.3.4 p5.brush@3.0.0
tar -xzf p5-2.3.4.tgz && tar -xzf p5.brush-3.0.0.tgz
mkdir -p assets/lib
cp package/lib/p5.min.js assets/lib/            # 第 1 个包
cp ../p5.brush-3.0.0/package/dist/p5.brush.js assets/lib/   # 第 2 个包
```

> p5.brush 3.x 要求 **p5 2.x**。p5 1.x 会静默失效（画不出东西，也没报错）。

## 必须走 instance mode + `brush.instance(p)`

p5 和 p5.brush 都是全局构建，但 HyperFrames 的页面里还有 GSAP 和别的东西。用 instance mode 最稳，代价是必须显式告诉 brush 用哪个实例：

```js
new p5((p) => {
  brush.instance(p);                    // ← 第一个调用，早于 setup
  p.setup = () => {
    const c = p.createCanvas(1920, 1080, p.WEBGL);   // 必须 WEBGL
    c.parent("sketch");
    p.pixelDensity(1);                  // 否则 retina 上多花 4 倍算力
    brush.scaleBrushes(3);              // 1920 画布上内置笔刷要放大
  };
});
```

漏掉 `brush.instance(p)` 的报错是 `Cannot read properties of undefined (reading 'background')`，看不太出来是这一句。

## 完整的 composition 骨架

```html
<template>
  <style>
    #root { position: absolute; inset: 0; background: #d8c9a8; overflow: hidden; }
    #sketch { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
    #sketch canvas { width: 1920px !important; height: 1080px !important; }
  </style>
  <div id="root" data-composition-id="cr-scene-01" data-width="1920" data-height="1080">
    <div id="sketch"></div>
  </div>
  <script>
    (function () {
      loadScript("assets/lib/p5.min.js", () =>
        loadScript("assets/lib/p5.brush.js", start));

      function loadScript(src, done) {
        const s = document.createElement("script");
        s.src = src; s.onload = done;
        document.head.appendChild(s);
      }

      function start() {
        let ready = false, T = 0;

        new p5((p) => {
          brush.instance(p);

          p.setup = () => {
            const c = p.createCanvas(1920, 1080, p.WEBGL);
            c.parent("sketch");
            p.pixelDensity(1);
            brush.scaleBrushes(3);
            ready = true;
            draw(T);
            p.redraw();
          };

          p.draw = () => draw(T);

          function draw(t) {
            if (!ready) return;
            const frame = Math.floor(t * 10);       // 笔触 10fps
            p.randomSeed(frame + 7);                // 同时 seed p5 与 brush
            p.noiseSeed(frame + 7);

            p.background("#d8c9a8");

            // 纸纹：稀疏横向擦笔
            brush.set("charcoal", "#cbb894", 2);
            for (let i = 0; i < 24; i++) {
              const y = -540 + i * 47 + p.random(-6, 6);
              brush.line(-960, y, 960, y + p.random(-10, 10));
            }

            // 抖动的蜡笔线：重画 3 遍
            for (let pass = 0; pass < 3; pass++) {
              brush.set("crayon", "#2a2622", 1.6 - pass * 0.35);
              brush.noFill();
              brush.beginShape();
              for (let i = 0; i <= 18; i++) {
                brush.vertex(
                  -700 + i * 78 + p.random(-2, 2),
                  90 + Math.sin(i * 0.45) * 70 + p.random(-2, 2)
                );
              }
              brush.endShape();
            }

            // 蜡笔填充
            brush.noStroke();
            brush.fill("#e0693a", 235);
            brush.circle(430, -230, 250);
            brush.noFill();
          }
        });

        // hf-seek 只更新时间，重绘交给 p5 的 draw 循环
        window.addEventListener("hf-seek", (e) => { T = e.detail.time; });
      }
    })();
  </script>
</template>
```

实测输出（1920x1080，10fps 笔触）：蜡笔线条带毛边、太阳有蜡笔颗粒、纸底有横向擦痕。

## 笔刷怎么挑

| 需求 | 笔刷名 | 备注 |
|---|---|---|
| 蜡笔主体线条 | `crayon` | 有颗粒，最像儿童画 |
| 炭笔/阴影 | `charcoal` | 适合大面积暗部 |
| 细线/排线 | `rotring` | 太干净，少用 |
| 铅笔草稿感 | `HB` / `2B` | 适合辅助线 |
| 马克笔填色 | `marker` | 边界硬，适合色块 |

`brush.set(name, color, weight)` 一次设完三件套；只要改粗细用 `brush.strokeWeight(x)`。

## 纸张纹理的两种做法

**A. 画在 canvas 里**（推荐，能跟着画面推拉）

```js
brush.set("charcoal", "#cbb894", 2);
for (...) brush.line(...);
```

**B. CSS 底纹**（更省算力，但推镜时纸纹不跟画面走 —— 反而更真实，纸不跟画动）

```css
#root { background: #d8c9a8; background-image: repeating-linear-gradient(90deg, rgba(0,0,0,.03) 0 1px, transparent 1px 4px); }
```

## 性能

蜡笔风是全流程最慢的一环：

- `pixelDensity(1)` 必开（不开在 2x 屏上算 4 倍）
- 每帧最多 3 条重画笔触的线；超过 5 条现场 30fps 会掉到 8fps
- `noLoop()` + 手动 `redraw()` 能省算力，但 HyperFrames 的 `hf-seek` 需要重绘，所以保留 draw 循环、把 `frame` 阶梯化更简单
- 一个 3 分钟 MV 的蜡笔风渲染约 15~40 分钟（16 核 CPU）；先渲 10 秒草稿估时间

## 常见坑

| 现象 | 原因 | 修法 |
|---|---|---|
| 全白/全空 | p5 1.x + brush 3.x | 升到 p5 2.x |
| `Cannot read ... 'background'` | 漏 `brush.instance(p)` | 在 sketch 函数第一行调用 |
| 每帧纹路都在变 | 用了 `Math.random()` 或没 seed | `p.randomSeed(frame)` 每帧重设 |
| 笔触太细/太糊 | 没 `scaleBrushes` | `brush.scaleBrushes(3)` @1920 |
| 画面只有一半 | canvas 尺寸被 CSS 拉伸 | `#sketch canvas { width:1920px !important }` |
| 渲染卡死 | `createCanvas` 用了 P2D | 必须 `p.WEBGL` |

## 适合什么歌

**适合**：抒情、叙事、童谣、民谣、有温度的歌。蜡笔的粗糙本身就是情绪。

**不适合**：需要精确几何（建筑、机械）、需要高对比夜景、快节奏舞曲（笔触跟不上）。
