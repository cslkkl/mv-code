---
name: mv-code
description: 把「歌名」直接做成代码绘制的 MV（mp4）。当用户说「用代码做个 MV」「做支代码 MV」「像素风/纸艺/蜡笔风 MV」「HyperFrames 做 MV」「把这歌做成动画 MV」，或只丢一个歌名过来时使用。全流程零 AI 生图，画面全部由 Canvas / p5 / DOM+CSS 代码绘制，经 HyperFrames 渲染成片。含：找音源(musicdl) → Whisper 转 SRT → 乐评+节奏分析 → 三画风样图 → 角色模块 → 分镜 → 转场 → 关键帧总览 → 渲染 → 八项质检。
---

# mv-code — 一个歌名进去，一支代码 MV 出来

这个 skill 的核心不是「让 AI 画图」，而是**让代码画图**：

- 不允许调用任何图像生成模型。像素、纸艺、蜡笔三种画风都由 Canvas 2D / p5 / DOM+CSS 逐帧绘制。
- 角色封装成一个 `character.js` 模块，全片复用它，保证造型前后一致。
- 时间轴唯一权威是 `lyrics.srt`；节奏唯一权威是 `song.md` 里的 BPM 与节拍点。
- 渲染走 HyperFrames（HTML → MP4，逐帧 seek，结果可复现）。

## 用户只需要说这一句

> 给《歌名》做支 MV

或带偏好：

> 给《歌名》做支 MV，像素风，竖屏

收到就开工，**不要反问**。缺的参数按默认值填：

| 用户没说 | 默认值 |
|---|---|
| 画风 | 出三种样图让他选（第 2 步不可跳） |
| 画幅 | 1920x1080 @ 30fps（要竖屏就 1080x1920） |
| 时长 | 全曲；超过 4 分钟先做「精华段」（见下） |
| 音源 | 先问一句有没有本地文件/链接，同时直接开始 musicdl 搜 |
| 歌词 | 优先用 musicdl 顺带下的 `.lrc`；没有再用 Whisper |
| 工程根 | `<cwd>/mv-<歌名拼音>/` |

**全流程只允许三个问句**，其余一律自己决定：

1. 「本地有 mp3/flac 吗？有链接吗？」（找音源时，问完立刻并行去搜）
2. 「有没有哪句歌词你有具体想法？希望它是什么场景？」（分镜前）
3. 「低置信度歌词这几句对不对？」（转写有错字时）

**长曲处理**：整首歌做全片要 40~70 个镜头，实现要 2~5 小时。默认先做「精华段」（主歌 1 + 副歌 1，约 45~70 秒）出片给用户看，认可后再补全曲。这是唯一允许主动缩范围的地方，且要在开工第一句话说清楚。

## 成本与时间（跟用户讲清楚，这套流程最大的价值）

| 阶段 | 时长 | 花费 |
|---|---|---|
| 找歌 + 分析 | 15~30 分钟 | 0 |
| 三张画风样图 | 20~40 分钟 | 0 |
| 角色 + 设定图 | 20~40 分钟 | 0 |
| 分镜 + 转场 | 40~80 分钟 | 0 |
| 关键帧总览 | 30~60 分钟 | 0 |
| 全片实现 | 2~5 小时 | 0 |
| 渲染 | 10 分钟~1 小时 | 电费 |
| 质检 + 返工 | 30~90 分钟 | 0 |

**全流程 4~8 小时，零 AI 生图费用。** 对比 `mv-song`（AI 生图路线）：单价高但 40 分钟出片。选哪条路要跟用户说清楚。

## 四个停顿点（必须等用户回话）

1. 三张画风样图出来 —— 等他选
2. 角色三视图 + 表情表出来 —— 等他确认
3. `storyboard.md` 出来 —— 等他确认分镜（含抽象歌词的私人口径）
4. `storyboard.png` 关键帧总览出来 —— 等他确认后再渲染

**在他点头之前不许渲染成片。** 每一步都先说清「现在花多少钱/多少时间」，渲染前尤其要说。

## 流水线

```
① 找歌 + 分析  →  ② 三画风样图  →  ③ 角色模块  →  ④ 分镜
→ ⑤ 转场方案  →  ⑥ 关键帧总览  →  ⑦ 渲染成片  →  ⑧ 八项质检
```

### 歌词三条路，按这个顺序

1. **musicdl 下来的 `.lrc` → SRT**（首选）。下载时会顺带给你官方歌词，与演唱精确对齐。
   实测同一段：官方 LRC 全对，Whisper small 三处错字。
   ```bash
   python assets/scripts/lrc2srt.py assets/audio/song.lrc lyrics.srt --audio-duration <秒> --merge
   ```
2. **用户已有 SRT** —— 直接用，检查条数与末条时间。
3. **Whisper 兜底** —— 没有 LRC 才走，且中文必须 `--model medium`（small 错字明显）。
   ```bash
   python assets/scripts/transcribe.py assets/audio/song.mp3 lyrics.srt --model medium --split comma
   ```

每步的详细执行说明在 `references/` 下，**做哪步读哪步**：

| 步骤 | 产出 | 读这个 |
|---|---|---|
| 0 环境 | 可用的 hyperframes + python 依赖 | `references/00-setup.md` |
| 0.5 音源 | `assets/audio/song.mp3` | `references/musicdl.md` |
| ① 分析 | `song.md`、`lyrics.srt` | `references/01-song.md` |
| ② 画风 | `tests/style-{pixel,paper,crayon}.png` ×3 | `references/02-art.md` + `references/styles/*.md` |
| ③ 角色 | `character.js` + `character-sheet.png` | `references/03-character.md` |
| ④ 分镜 | `storyboard.md` | `references/04-storyboard.md` |
| ⑤ 转场 | 回填进 `storyboard.md` | `references/05-transition.md` |
| ⑥ 关键帧 | `storyboard.png` | `references/06-keyframes.md` |
| ⑦ 成片 | `out/<歌名>.mp4` | `references/07-build.md` |
| ⑧ 质检 | `QA.md` | `references/08-review.md` |

HyperFrames 的硬性契约（不遵守就渲染失败/画面空白）单独一页，**写任何 composition 前先读**：
`references/hyperframes.md`

## 工程目录（固定，不要自创）

```
mv-<name>/
  song.md               # 分析结果（主题/情绪/BPM/节拍/段落/重音点）
  lyrics.srt            # 带时间轴歌词
  storyboard.md         # 分镜表（含转场列）
  storyboard.png        # 关键帧总览
  character-sheet.png   # 三视图 + 表情表
  QA.md                 # 质检报告
  assets/
    audio/song.mp3
    audio/song.lrc      # musicdl 顺带下来的官方歌词，比转写准
    scripts/            # lrc2srt.py / transcribe.py
    lib/gsap.min.js     # 本地内置，别用 CDN（见 00-setup）
    lib/srt.js          # 从 assets/templates/srt.js 复制
    fonts/              # 中文字体若需 @font-face
  compositions/         # 一场一文件
    character.js        # 角色模块（全片共用）
  tests/                # 三张画风样图 + style-choice.md
  boards/stills/        # 关键帧抽图
  out/                  # 渲染产物
  qa/                   # 质检抽帧证据
```

## 开工：五条命令搭好工程

`assets/templates/` 里有可用的骨架，复制即可，不要从零写：

```bash
# 1. 建目录
mkdir -p mv-<name>/{assets/{audio,lib,fonts},compositions,tests,out,qa,boards/stills}

# 2. 复制模板（把 <skill> 换成这个 skill 的实际目录）
cp <skill>/assets/templates/index.html        mv-<name>/
cp <skill>/assets/templates/hyperframes.json  mv-<name>/
cp <skill>/assets/templates/package.json      mv-<name>/
cp <skill>/assets/templates/scene.html        mv-<name>/compositions/s01.html
cp <skill>/assets/templates/character.js      mv-<name>/compositions/
cp <skill>/assets/templates/srt.js            mv-<name>/assets/lib/
cp <skill>/assets/templates/song.md           mv-<name>/
cp <skill>/assets/templates/storyboard.md     mv-<name>/
cp <skill>/assets/templates/style-choice.md   mv-<name>/tests/
cp <skill>/assets/templates/QA.md             mv-<name>/

# 3. 内置 gsap（CDN 在中文网络下会渲染出全黑，见 00-setup 第 3 节）
npm pack gsap@3.14.2 && tar -xzf gsap-3.14.2.tgz
cp package/dist/gsap.min.js mv-<name>/assets/lib/
rm -rf package gsap-3.14.2.tgz

# 4. 音源
cp <本地文件> mv-<name>/assets/audio/song.mp3

# 5. 自检
cd mv-<name> && npm run check
```

> 用 `npx hyperframes init` 生成的工程**必须加 `--skip-skills`**，否则它会往 skills 目录灌自己的 hyperframes 系列，和本 skill 打架。

## 命令速查

```bash
# 环境自检
npx hyperframes doctor

# 分析音频（BPM/节拍/段落/重音/响度，全本地信号分析）
npx hyperframes audio assets/audio/song.mp3 \
  --only bpm,beats,sections,onsets,moments,loudness --json > analysis.json

# 节拍点落盘（需要 <audio data-timeline-role="music"> 才能跑）
npx hyperframes beats --json

# 看帧
npx hyperframes snapshot --at 3,7.5,12 --no-end -o tests/snaps

# 校验（lint + 运行时 + 布局 + 动效 + 对比度，一条命令）
npx hyperframes check

# 渲染
npx hyperframes render -o out/song.mp4 -q delivery
```

## 三条铁律

1. **不做补间的地方别做补间**：像素风逐帧换画，纸艺 8~12fps 抖动，蜡笔保留笔触。用「整数帧号」驱动（`Math.floor(t * 12)`），不要用 `Math.random()` —— 渲染是逐帧 seek，随机数会让每帧都不一样。
2. **背景、角色、道具画在同一张画布里**，一起随镜头推拉。一个镜头只有一个 `#camera` 容器，所有元素都在里面。
3. **字幕在最上层、固定位置**，不随镜头运动；按 `lyrics.srt` 时间显示在画面下方（`bottom: 96px`）。

## 已经踩过的坑（照这个避）

| 坑 | 症状 | 修法 |
|---|---|---|
| GSAP 走 CDN | 渲染全黑，`check` 报 `ERR_CONNECTION_RESET` + `reading 'timeline'` | 本地内置 `assets/lib/gsap.min.js` |
| 中文字体 | lint 报 `font_family_without_font_face` | `@font-face { font-family:"Noto Sans SC"; src: local("Microsoft YaHei") }` |
| scene id 三处不一致 | 每场景渲染前卡 45 秒，然后画面静止 | 宿主 div / 场景根元素 / `__timelines` 键三处同名 |
| canvas 没全屏清底 | 上一帧的角色留残影 | 每帧第一件事 `fillRect(0,0,W,H)` |
| 像素风推镜 | 逻辑像素变 6.36 屏幕像素，出现粗细不均 | 相机只做整数逻辑像素平移，不用 scale |
| `Math.random()` | 每帧画面都不一样，渲染没意义 | `mulberry32(frame)` 或 `p.randomSeed(frame)` |
| 漏 `brush.instance(p)` | `Cannot read ... 'background'` | 蜡笔风在 sketch 函数第一行调用 |
| 道具遮脸 | 质检第 4 项不达标 | 道具 `y = Math.max(hand.y, headTop + 2)` |
| 整屏叠化 | 廉价感 | 只叠局部元素，或改硬切 |
| `motion.dead_stretch` | `check` 直接告警「3 秒无变化」 | 角色 idle 也要有呼吸，相机恒定缓推 |
| musicdl 返回不是 dict | `info["songname"]` 报 KeyError | 用 `info.song_name`，先判 `with_valid_download_url` |
| HF 下模型报 401 | `CAS Client Error ... 401 Unauthorized` | `HF_HUB_DISABLE_XET=1` + `HF_ENDPOINT=https://hf-mirror.com` |
| Whisper 出繁体字 | 中文默认输出繁体 | `initial_prompt` 写简体（脚本已内置） |
| Whisper small 错字多 | 模型太小 | 中文用 `--model medium` |
| 一条字幕跨 2~3 句歌词 | Whisper 按语义分段，不是按歌词行 | `--split comma`，或改用 LRC |
| uv 卡「Failed to acquire lock」 | 并发进程残留锁 | 杀 uv 进程，换独立 `UV_CACHE_DIR` |
| 字幕一句都不出，check 却全绿 | 字幕层被加了 `class="clip"`，渲染器当片段管理、无 tween → 判不可见 | 字幕层用**纯 div**，不加 `.clip` / `data-*` |
| 首屏字幕丢失 | 用 `fetch` 异步读歌词，渲染器先抓帧 | 歌词内联成 `assets/lib/lyrics.js`（`lrc2srt.py --js-out`） |
| 字幕监听不生效 | `addEventListener` 写在 `await` 之后，事件已派发完 | 监听必须**同步注册**，再用 `tl.eventCallback("onUpdate")` 兜底 |

## 交付

- 成片 `out/<歌名>.mp4`
- `storyboard.png`、`character-sheet.png`
- `QA.md`（八项检查逐条结论 + 抽帧证据）
- 一句话说明「哪些地方是靠代码画的、哪些是妥协」，不要吹成实拍级。

## 快速索引

| 想做什么 | 读 |
|---|---|
| 第一次跑通环境 | `references/00-setup.md` |
| 不知道歌从哪来 | `references/musicdl.md` |
| 一页流程清单（打印贴墙） | `references/playbook.md` |
| 写 composition 报错 | `references/hyperframes.md`（契约 + 实测坑） |
| 定画风细节 | `references/styles/{pixel,paper,crayon}.md` |
| 八项质检怎么查 | `references/08-review.md` |
| 直接抄代码 | `assets/templates/` |
| 看能跑通的成品 | 与 skill 同级的 `_verify/example/`（本机验证时建的，不随 skill 分发） |

## 这套东西验证到什么程度

本机实测（hyperframes 0.8.214 / Node 24 / Chrome headless / Ryzen 9 7940H）：

| 项 | 结果 |
|---|---|
| 模板复制 → `check` | `ok: true`，lint / runtime / layout / motion / contrast 全绿 |
| 模板 → `snapshot` | 1920x1080 PNG 正常，纸底、剪纸白边、角色、表情都在 |
| 模板 → `render -q draft` | 6 秒成片，H.264 1920x1080 + AAC，时长与音轨一致 |
| 像素风（Canvas 320x180 放大 6 倍） | 逐帧换画、Bayer 抖动、整数像素滚动均正常 |
| 蜡笔风（p5 2.3.4 + p5.brush 3.0.0） | 笔触毛边、纸纹擦笔、`brush.instance(p)` 路径可用 |
| `hyperframes audio` 测 BPM/节拍 | 120 BPM 样本 → 120.0、confidence 0.991、119 个节拍点 |
| `hyperframes beats` | 需 `<audio data-timeline-role="music">`，加上后正常产出 `beats/*.json` |
| **musicdl 真实下载** | ✅ 装通（57 平台）、搜到、下到 FLAC 192kHz/245MB + **官方 LRC** |
| **LRC → SRT** | ✅ 5:32 的歌 → 79 行 LRC → 72 条 SRT，时间单调无重叠 |
| **Whisper 转写** | ✅ faster-whisper 1.2.1 跑通；small/medium 准确率实测对比，中文必须 medium |
| 字幕对齐 | `srt.js` 解析 + `tighten(0.12)`，逐帧取句正确，句间留 0.12s 空档 |
| 静止段检测 | `tblend=difference` 的 YAVG 法：静态画面 0.0000、正常画面 3~13 |
| 响度比对 | 源 -34.1 / 成片 -31.1 LUFS，差 3.0 LU 判超标；重封装音轨后回到 -34.1 |

**仍未在本机验证的**（文档按官方资料写，第一次用要自己确认）：

- `hyperframes transcribe` 本身：依赖 whisper-cpp 二进制，本机没有。**已用 `assets/scripts/transcribe.py` 绕开**，那条路实测可用。
- `hyperframes publish` / `cloud` / `lambda` 等部署命令（本 skill 不用）。
- macOS / Linux 上的表现（全部在 Windows 11 上做）。
- 3 分钟以上、40+ 镜头的长片渲染耗时（只有 6 秒样本的实测数）。
