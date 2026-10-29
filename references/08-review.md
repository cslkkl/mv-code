# ⑧ 八项质检 — QA.md

成片出来后逐项检查，**每项都要有证据**（抽帧图 / 命令输出 / 数字），写进 `QA.md`。查不出问题也要写"通过"和依据，不能只写"已检查"。

## 1. 像幻灯片

**症状**：画面动态不足，连续多秒画面几乎不变。

**检测**（可量化，实测可用，不需要 ImageMagick）：

```bash
# 每 0.5 秒一帧，算相邻帧的亮度绝对差（YAVG），逐帧打印
ffmpeg -hide_banner -nostats -i out/终版.mp4 \
  -vf "fps=2,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG" \
  -f null - 2>&1 | grep -E "pts_time|YAVG" > qa/framediff.txt
```

`YAVG` 是差值的亮度平均值（0~255）。**校准基准**：一段纯静态画面实测 `YAVG = 0.0000`；
有缓慢推镜的正常画面实测 `7.2 ~ 13.7`。

判据：**连续 6 帧（3 秒）`YAVG < 0.5` 就算静止段**。列出所有静止段的起止时间。

```bash
# 直接筛出可疑帧
ffmpeg -hide_banner -nostats -i out/终版.mp4 \
  -vf "fps=2,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG" \
  -f null - 2>&1 | grep 'YAVG' | awk -F= '{if ($NF+0 < 0.5) print "STATIC", $NF}'
```


**修法**（按优先级）：

1. 角色持续有动作：`idle` 状态也要有呼吸起伏、眨眼（`MVChar` 的 `bob` 已给 ±1px）
2. 镜头保持缓慢运动：整镜一个 `scale: 1.00 → 1.06` 的线性 tween
3. 每句歌词安排**一个清晰的主要动作**，不要靠运镜凑
4. 用中近景呈现（远景里的小动作看不出来）

**自带的免费告警**：`npx hyperframes check` 的 `motion.dead_stretch` 会直接告诉你从哪秒到哪秒没变化。

## 2. 运镜晃

**症状**：镜头运动过于频繁，来回推拉。

**检测**：读 `storyboard.md` 的实现，逐个镜头检查 `#camera` 上有几个 tween。**一个镜头只能有一个方向的运动。**

```bash
# 代码级检测：每个 compositions/s*.html 里 #camera 的 tween 数
grep -c '#camera' compositions/s*.html
```

判据：**一个镜头内 `#camera` 的 tween ≤ 1**（转场的甩镜除外，且甩镜不算该镜的主运动）。

**修法**：每个镜头只保留一种缓慢运动 —— 慢推、慢移、或跟随角色。删掉多余的。

## 3. 表现力不够

**症状**：情绪最强的段落和主歌看起来一样。

**检测**：找 `song.md` 里 `moments.peak` 的时间点，抽那一帧，和主歌中段抽一帧对比：

```bash
ffmpeg -y -ss <peak> -i out/终版.mp4 -frames:v 1 qa/peak.png
ffmpeg -y -ss <verse> -i out/终版.mp4 -frames:v 1 qa/verse.png
```

看两张图：**景别、光比、色温**是否不同。都一样 = 不达标。

**修法**：

- 情绪最强处改**近景/特写**（角色占画面 1/3 以上）
- 光线与色调随情绪变化：主歌冷灰、副歌暖橙；或反过来（先暖后冷）
- 只在最强的**一处**做变化，全片都变等于没变

## 4. 道具不对

**症状**：手持道具位置异常，或遮住脸。

**检测**（代码级，最可靠）：

```js
// 在 character.js 里断言，开发期打开
function assertProp(o, p) {
  const d = Math.hypot(p.propX - p.hand.r.x, p.propY - p.hand.r.y);
  if (d > 4) console.error("道具脱离手部", d);
  if (p.propY < p.headTop + 2) console.error("道具遮住面部", p.propY, p.headTop);
}
```

视觉检测：抽所有 `prop` 非空的镜头的帧，逐张看道具和手的关系。

**修法**：

- 道具坐标一律来自 `pose().hand.r`（或 `.l`），不许写死
- 道具 `y = Math.max(hand.y, headTop + 2)`，天然遮不住脸
- 手臂摆动时道具必须跟着动 —— 用同一个 `armR` 变量算

## 5. 歌词没演出来

**症状**：某句歌词的画面没有表达它的含义。

**检测**：逐句对照。抽每一句歌词中点的那一帧，和歌词文本并列：

```bash
# 从 lyrics.srt 取每句中点，批量抽帧
python - <<'PY'
import re, subprocess
cues = parse("lyrics.srt")           # 用 references/01-song.md 的解析
for i, c in enumerate(cues, 1):
    mid = (c["t0"] + c["t1"]) / 2
    subprocess.run(["ffmpeg","-y","-ss",f"{mid:.2f}","-i","out/终版.mp4",
                    "-frames:v","1",f"qa/lyric-{i:02d}.png"], check=True)
    print(i, c["text"])
PY
```

做成一张对照表（图 + 歌词并排），自己逐行过一遍。**看不出在演什么就是没演出来。**

**修法**：换一种更直观的表现方式。参考 `04-storyboard.md` 的「抽象 → 具体」对照表。核心是：用**物件的变化**和**动作的未完成**代替情绪词。

## 6. 歌词时间对齐（用户要求，ffmpeg 抽帧核对）

```bash
# 每句开头 +0.15s 抽一帧（这时候字幕应该已经出来）
for t in $(cut -d, -f1 lyrics.srt | ...); do ...; done
```

判据：**字幕出现时间与演唱起始差 ≤ 0.15s**；字幕消失时间 ≥ 该句唱完。

**修法**：调 `MVSrt.tighten()` 的 `gap`，或整体平移 SRT（`+0.08s`）。

## 7. 响度一致（用户要求，测 LUFS）

```bash
# 原曲
ffmpeg -hide_banner -nostats -i assets/audio/song.mp3 -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+I:|Peak:"
# 成片
ffmpeg -hide_banner -nostats -i out/终版.mp4      -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+I:|Peak:"
```

判据：**两者的 Integrated LUFS 差 ≤ 1.0 LU**。

实测样例（同一段音频，源 -34.1 LUFS → 成片 -31.1 LUFS，差 **3.0 LU**，超标）说明：
AAC 编码与容器增益会改变整合响度，**必须实测，不能假设一致**。

```
源曲：I: -34.1 LUFS,  True peak: -17.9 dBFS
成片：I: -31.1 LUFS,  True peak: -17.9 dBFS   ← 峰值一致，整合响度差 3 LU
```

### 怎么调回来

**A. 在工程里对齐两个元素**（推荐，可复现）

`normalize-audio` 的参数是**元素 id**，不是文件路径：

```bash
# 项目目录里跑。--reference 是响度基准元素，--target 是要被改的元素
npx hyperframes normalize-audio \
  --reference "#music" \
  --target "#sfx-bed" \
  --tolerance 0.5          # 加 --write 才真写进 index.html

# 不知道基准用绝对值也可以
npx hyperframes normalize-audio --target "#music" --lufs -14 --write
```

> 报 `Reference audio #assets/audio/song.mp3 was not found` 就是把这个参数当文件路径了 —— 它要的是 `#id`。

**B. 手工调 `data-volume` 后重渲**（对成片本身）

成片比原曲响 3 LU，就把 `<audio>` 的 `data-volume` 往下调：

```
目标增益(dB) = 源 LUFS - 成片 LUFS = -34.1 - (-31.1) = -3.0 dB
data-volume = 10^(-3.0/20) = 0.71
```

`data-volume` 的取值：`1.0` = 0 dB，上限 `3.98` = +12 dB。改完重渲再量一次。

**C. 直接重封装音轨**（不改画面，最快）

```bash
ffmpeg -y -i out/终版.mp4 -i assets/audio/song.mp3 \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest out/终版-fixed.mp4
```

把原曲音轨换进去，响度天然一致（编解码仍有 ±0.5 LU 漂移）。

## 8. 静态检查与视口

```bash
npx hyperframes check --json
```

要求：`lint` / `runtime` / `layout` / `contrast` 全 `ok: true`，`motion` 无 `dead_stretch`。

另外人工确认：

- [ ] 画面元素没有出画（`panel_out_of_canvas`）
- [ ] 字幕与背景对比度够（浅底加描边，深底加投影）
- [ ] 没有文字被裁切
- [ ] 首帧不是空白（`first_frame_empty`）

## QA.md 模板

```markdown
# QA — <歌名> MV

成片：`out/终版.mp4` · 1920x1080 · 30fps · 03:12 · H.264 + AAC

| # | 项目 | 结论 | 证据 |
|---|---|---|---|
| 1 | 像幻灯片 | 通过 / 已修 2 处 | `qa/framediff.txt`：最长静止段 1.8s（< 3s 阈值） |
| 2 | 运镜晃 | 通过 | 全片 26 镜，`#camera` tween 均为 1 个 |
| 3 | 表现力 | 已修 | 1:56.8（`moments.peak`）改为特写；`qa/peak.png` vs `qa/verse.png` |
| 4 | 道具 | 已修 1 处 | 03 镜杯子脱离手 6px → 改用 `hand.r`；`qa/prop-03.png` |
| 5 | 歌词演出 | 通过 | `qa/lyric-*.png` 逐句对照表（26/26 可读） |
| 6 | 歌词对齐 | 已修 | 整体 +0.08s；`qa/align.md` 差值表，最大 0.12s |
| 7 | 响度 | 已修 | 源 -9.8 LUFS / 成片 -10.2 LUFS，差 0.4 LU |
| 8 | 静态检查 | 通过 | `check --json` 全 ok，无 dead_stretch |

## 未解决
- （没有就写「无」）

## 抽帧证据目录
`qa/`：frames/（0.5s 全片抽帧）、lyric-*.png、peak.png、verse.png
```

## 检查单

- [ ] 八项都跑了命令，有数字或图
- [ ] 静止段、晃镜、道具、对齐、响度这五项有**量化**证据
- [ ] 修过的地方记了「改前 → 改后」
- [ ] 未解决项如实列出
- [ ] 抽帧证据留在 `qa/`，交付时一起给
