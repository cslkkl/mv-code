# ③ 角色设计 — character.js + 三视图设定图

**目的**：把主角做**一次**，之后每个镜头只改参数，不重画。这是全片造型一致性的唯一保障。

## 两个产出

1. `compositions/character.js` —— 统一绘制接口
2. `character-sheet.png` —— 正面/侧面/背面三视图 + 表情表，等用户确认

## 接口设计（必须这几个参数）

```js
MVChar.draw   /  MVChar.drawPixel   /  MVChar.svgPaper   /  MVChar.drawCrayon
```

参数：

| 参数 | 取值 | 说明 |
|---|---|---|
| `x, y` | 数字 | 脚底中心点的坐标 |
| `scale` | 数字 | 缩放 |
| `facing` | `left` / `right` / `front` / `back` | 朝向，决定脸可不可见、身体镜像 |
| `expression` | `neutral` / `happy` / `shy` / `sad` / `surprised` | 表情，最少要有开心/害羞/难过 |
| `action` | `idle` / `walk` / `run` / `jump` / `hug` / `hold` / `sit` / `turn` | 动作，最少要有走/跳/拥抱/手持 |
| `prop` | `null` / `cup` / `letter` / `lantern` / `umbrella` | 手持道具 |
| `t` | 秒 | 当前时间，驱动循环动画 |
| `dt` | 秒 | 时间偏移，让不同镜头的循环错开 |
| `style` | `pixel` / `paper` / `crayon` | 交给哪个渲染函数 |
| `palette` | 5 色数组 | 从 `tests/style-choice.md` 抄 |

模板在 `assets/templates/character.js`，直接复制到你工程的 `compositions/character.js` 再改配色和身材比例。

## 核心机制：pose 与 render 分离

```
pose(o)  →  { x, y, bob, armL, armR, legL, legR, eye, mouth, hand:{l,r}, headTop, … }
                     ↓
        drawPixel / svgPaper / drawCrayon
```

**为什么要分两层**：同一个 pose 能被三种画风渲染，所以换画风不用重做动画；而且 pose 是纯函数，逐帧 seek 时结果稳定。

## 三条硬规则（导演原话）

1. **每个镜头不要重新画角色** —— 只改 `pose()` 的参数
2. **手持道具必须贴合手部** —— 道具坐标取自 `pose().hand.r`，不许手写
3. **道具不得遮挡面部** —— 道具 y 坐标 `Math.max(hand.y, headTop + 2)`

这三条直接对应 08 质检的第 4 项。

## 手部的坐标必须由 pose 给出

```js
hand: {
  l: { x: o.x + fx * (-6 - armL * 0.18), y: o.y - 14 + armL * 0.16 + bob },
  r: { x: o.x + fx * ( 6 + armR * 0.18), y: o.y - 14 + armR * 0.16 + bob },
}
```

手臂角度 `armL/armR` 变化时手的位置自动跟着走。道具只要 `translate(hand.r.x, hand.r.y)` 就贴合了。

反面写法（会出现道具和手分离）：

```js
const propX = charX + 20;      // ❌ 写死偏移，一旦手臂摆动就飘了
```

## 表情的最小集

32px 宽的角色画不出微表情，只有三件套可辨：**眼睛形状 / 嘴形 / 眉（或腮红）**。

| 表情 | 眼 | 嘴 | 附加 |
|---|---|---|---|
| neutral | 两点 | 横线 | — |
| happy | `^^` 弧 | 上弧 | — |
| shy | 下视（横线） | 小 × | 腮红 |
| sad | 下视 | 下弧 | 眉向下 |
| surprised | 竖线（睁大） | `○` | 眉抬高 |

纸艺/蜡笔风可以把「弧」画得明显些；像素风就靠 1~2 像素的差别。

## 尺度：角色按 320x180 设计，靠 scale 放大

`character.js` 里的坐标全部按 **320x180** 的尺度写（脚底 `y` 处、身高约 60 单位）。放进 1920x1080 的画布时传 `scale`：

```js
MVChar.svgPaper({
  x: 760, y: 900,
  scale: 12,          // 60 单位 × 12 ≈ 720px 高，占画面 2/3
  vbw: 1920, vbh: 1080,   // SVG 视口要跟画布一致
  ...
});
```

`scale` 是**绕脚底中心**缩放的（`translate(bx,by) scale(S) translate(-bx,-by)`），所以放大后角色不会飘走，`x/y` 始终是脚底位置。

> 忽略 `vbw/vbh` 的后果：SVG 默认 `viewBox="0 0 320 180"`，在 1920x1080 容器里会被 `slice` 裁切放大 6 倍，角色跑到画面外。

## 三视图 + 表情表怎么出

写一个临时 composition（`compositions/_sheet.html`），用 `MVChar` 把 3 个朝向 × 5 个表情 × 5 个动作摆成网格，然后：

```bash
npx hyperframes snapshot --at 0 --no-end -o tests/sheet
# 得到 tests/sheet/frame-00-at-0s.png → 重命名为 character-sheet.png
```

版式：

```
┌──────────────────────────────────────────────┐
│ 正面        侧面          背面                │  ← 三个全身，同高同比例，间距一致
├──────────────────────────────────────────────┤
│ 开心  害羞  难过  惊讶  平静                   │  ← 五个头部特写，同一大小
├──────────────────────────────────────────────┤
│ 走    跳    拥抱   手持(杯子)  转身            │  ← 五个动作，同一位置
└──────────────────────────────────────────────┘
```

背景用画风的纸底，不要纯白 —— 白底上看不出白边的效果。

## 确认之后

- 把用户的口头修改落进 `character.js` 的参数表（不是改某一个镜头）
- 在 `storyboard.md` 顶部记一行：`character: compositions/character.js @ v1`（改版本号就说明造型变了）

## 检查单

- [ ] `character.js` 提供 `draw` 入口，参数覆盖朝向/表情/动作/道具
- [ ] 表情 ≥ 3 种（含开心/害羞/难过），动作 ≥ 4 种（含走/跳/拥抱/手持）
- [ ] 道具挂在 `pose().hand.*` 上，手臂摆动时跟手
- [ ] 道具最高点 ≥ `headTop + 2`，遮不住脸
- [ ] `character-sheet.png` 三视图 + 表情表齐全，等用户点头
- [ ] 同一个 `t` 两次渲染结果一致（无 `Math.random`）
