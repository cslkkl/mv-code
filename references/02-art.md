# ② 美术方向 — 三种画风各出一张开场样图

**目的**：让用户在看到「整片长什么样」之前，先只花三张图的成本选定画风。之后全片只按选定画风走，不混。

## 硬约束

| 必须 | 禁止 |
|---|---|
| 用代码画（Canvas 2D / p5 / DOM+CSS） | 调用任何图像生成模型（imagegen / SD / MJ / DALL·E） |
| 1920x1080 输出，三张同一个开场画面 | 深色背景配霓虹光 |
| 每张附一句「为什么适合这首歌」 | 紫色渐变 |
| 三张都基于 `song.md` 的主题与情绪 | 画面堆满文字 |

> 「同一个开场画面」是关键：三张必须画**同一时刻、同一构图**，否则用户没法比较画风，只能比较内容。

## 流程

1. 从 `song.md` 取主题、情绪、主色调倾向，定一个开场画面（例：一个人在巷口回头，逆光）。
2. 各写一个独立 composition，用 `npx hyperframes snapshot` 出图，不改全片工程。
3. 三张拼一起（可选）：
   ```bash
   ffmpeg -y -i pixel.png -i paper.png -i crayon.png \
     -filter_complex "[0][1][2]hstack=inputs=3,scale=1920:-1" tests/style-compare.png
   ```
4. **停下来等用户选。** 附一句每张的适配理由 + 一句你自己更推荐哪个（说理由，不要含糊）。

## 三种画风的技术规格

### 1. 像素游戏风 — `references/styles/pixel.md`

- Canvas 2D，逻辑画布 **320x180**，`ctx.imageSmoothingEnabled = false`
- CSS 放大 6 倍到 1920x1080，`image-rendering: pixelated`
- 全片限定 **16~32 色**，渐变一律用抖动点阵（ordered dither），不用 `createLinearGradient`
- 动画：角色逐帧换画，**不做补间**；帧号 = `Math.floor(t * fps)`，fps 取 8/10/12

### 2. 纸艺拼贴绘本 — `references/styles/paper.md`

- DOM + CSS 为主（层叠、投影、纹理），复杂形状用内联 SVG
- 每个元素：**剪纸白边或撕纸毛边** + 投影（两层阴影）
- 底纹：旧报纸或牛皮纸（用 CSS `repeating-linear-gradient` + noise 生成，不要下载图片）
- 动画：画面每秒更新 **8~12 次**，每次整体抖动 **1~2 像素**（seed 由帧号决定）

### 3. 蜡笔手绘绘本 — `references/styles/crayon.md`

- p5.js 2.x + p5.brush（`createCanvas(w, h, WEBGL)`）
- 用 p5.brush 的 `brush.stroke()` / `brush.fill()` 保留笔触与纸纹
- 线条要「抖」：同一根线重画 2~3 遍，每次偏移 1~2px（seed 固定）
- 纸纹：p5.brush 的 `brush.noise()` 或 `brush.fillTexture()`

## 三张图之后的产出

在 `tests/style-choice.md` 里记下：

```markdown
# 画风选定
- 选定：2. 纸艺拼贴绘本
- 理由（用户的）：…
- 已确定的调色板：纸底 #d8c9a8 / 主色 #b8452e / 墨色 #2a2622 / 点缀 #4a6b5a
- 已确定的帧率：10 fps 抖动画面的节奏
```

这份文件是后面所有 composition 的画风唯一来源。**改画风要回来说，不许在分镜阶段偷偷换。**

## 色彩纪律

三种画风都适用的三条：

1. **主色数量 ≤ 4**：底色、墨色、一个主色、一个点缀。多了就散。
2. **不要深底霓虹**：那是 AI 生图最常见的廉价感来源，代码画更不能救。
3. **明度优先**：缩到 200px 宽看一眼，主体和背景要还能分开。分不开就是明度没拉开。

## 开场画面怎么选

开场画面决定观众前 3 秒的判断，别选「封面式构图」。选**有动作进行中**的一帧：

- 好：手正在松开一个杯子，杯子还没落地
- 差：一个杯子静静地放在桌上

因为整片要靠「动作」撑起动态（见 08 的「像幻灯片」检查项），开场就给动作是给自己留活路。
