# 实测记录

本文件记录这套 skill 在真实环境里跑到了什么程度，**包括没跑通的部分**。写文档时按官方资料给命令、但没在本机验证的地方，都在下面如实标出。

## 环境

| 项 | 版本 |
|---|---|
| HyperFrames CLI | 0.8.214 |
| Node.js | v24.15.0 |
| npm | 11.x |
| FFmpeg / FFprobe | 9.0.2 (gyan.dev essentials) |
| Chrome | chrome-headless-shell 148.0.7778.167 |
| Python | 3.12.10 / 3.14.4 |
| 平台 | Windows 11，Ryzen 9 7940H（16 核），RTX 4060 Laptop |
| p5 / p5.brush | 2.3.4 / 3.0.0 |
| GSAP | 3.14.2 |

## 跑通的

### 0. musicdl：装通、搜到、下到

```bash
uv pip install --python _env/py312/Scripts/python.exe musicdl
→ musicdl, version 2.14.2
→ 57 clients
```

真实搜索 + 下载（《那些年》胡夏，网易云）：

```
PICK: 那些年 胡夏 flac 233.92 MB 00:05:32
NeteaseMusicClient._download >>> 那些年 (Success) -- 100%
```

落盘：

```
那些年 - 97357.flac   245,528,453 bytes   (flac, 192000 Hz, 2ch, 371.08s)
那些年 - 97357.lrc        2,921 bytes
```

**★ 关键发现：musicdl 顺带给了官方 LRC。** 这比 Whisper 准一个数量级，直接成了首选路线。

音频规格过高（192kHz/245MB），转 48kHz MP3 后 **9.87 MB**，差 25 倍，MV 完全够用。

### 0.5 LRC → SRT

```bash
python assets/scripts/lrc2srt.py 那些年.lrc lyrics.srt --audio-duration 371.08 --merge
→ 完成：72 条字幕
```

```
18.100 → 20.890  又回到最初的起点
20.890 → 24.240  记忆中你青涩的脸
24.240 → 30.330  我们终于来到了这一天      ← 「我们终于 / 来到了这一天」已合并
30.330 → 33.460  桌垫下的老照片
```

`srt.js` 解析验证：72 条、首条 `t0=18.1`、**重叠 0**。

### 0.6 Whisper 兜底路线

```
faster_whisper 1.2.1 / ctranslate2 4.8.4
```

装通、跑通。中文默认输出**繁体**，用 `initial_prompt` 压回简体后正常。

三档准确率实测（同一段 45 秒）：

| 模型 | 输出 |
|---|---|
| small | 捉点下的老照片 / 奔着西沙 红色零带的街 / 将头发竖尘大人模样 |
| **medium** | 桌垫下的老照片 / 笨拙细杀红色领带的街 / 将头发梳成大人模样 |
| 官方 LRC | 桌垫下的老照片 / 笨拙系上红色领带的结 / 将头发梳成大人模样 |

**结论：中文用 medium，别用 small；能用 LRC 就别用 Whisper。**

`--split comma`（按标点切成一句一条）实测：8 条 → 12 条，时间按字数比例分配，`srt.js` 解析无重叠。

### 1. 模板 → 工程 → check

从 `assets/templates/` 复制出来的工程，`npx hyperframes check`：

```
"ok": true
  lint     ok  errors 0  warnings 0
  runtime  ok  errors 0
  layout   ok  errors 0  warnings 2  (canvas_overflow / container_overflow，均为 info)
  motion   ok  errors 0  warnings 0
  contrast ok  errors 0
```

### 2. 模板 → 渲染

```bash
npx hyperframes render -o out/demo-template.mp4 -q draft
```

```
video: h264 1920x1080, 6.000000s
audio: aac 6.000000s
文件大小 2.24 MB
```

### 3. 三种画风

| 画风 | 实现 | 结果 |
|---|---|---|
| 像素 | Canvas 2D 320×180，CSS 放大 6 倍，`image-rendering: pixelated` | 抖动点阵渐变、逐帧行走、整数像素滚动均正常 |
| 纸艺 | DOM + 内联 SVG，`paint-order: stroke` 白边 + 双层 `drop-shadow` | 剪纸白边、投影、纸纹正常（见 `docs/frame-paper.png`） |
| 蜡笔 | p5 2.3.4 + p5.brush 3.0.0，`createCanvas(1920,1080,WEBGL)` | 笔触毛边、纸纹擦笔正常；`brush.instance(p)` 必需 |

### 4. 音频分析

```bash
npx hyperframes audio assets/audio/song.mp3 --only bpm,beats,sections,onsets,moments,loudness --json
```

120 BPM 节拍器样本的输出：

```json
"bpm": { "value": 120, "curve": [...] },
"beats": { "times": [0.505, 1.005, ...], "confidence": 0.991 },   // 119 个点
"moments": { "peak": 4.114, "tailEnd": 60 },
"loudness": { "lufsIntegrated": -34.1, "truePeakDb": -17.9 }
```

**真实歌曲**（《那些年》，5:32）的输出 —— 这条更能说明问题：

```json
"bpm": { "value": 157.9 },
"beats": { "confidence": 0.194, "times": [ ... 955 个点 ] },
"sections": { "spans": [ 17 段 A..P ] },
"moments": { "peak": 304.084, "tailEnd": 367.776 },
"loudness": { "lufsIntegrated": -9.4 }
```

⚠ 这首歌实际约 78 BPM，工具报 **157.9** —— 正好双倍。`confidence` 只有 **0.194** 就是在说
「这个数不可信」。文档里 `confidence < 0.4 改看 onset` 的规则就是照这个写的。

4.5 秒的短样本会返回 `bpm.value: null` + `beats.reason: "too short for a steady beat"` —— 同理。

### 5. 节拍点落盘

`npx hyperframes beats` 必须先有 `<audio data-timeline-role="music">`：

```
# 没加属性
{"ok":false,"error":{"code":"runtime_error","message":"No music track found. Add data-timeline-role=\"music\" ..."}}

# 加上之后
{"ok": true, "file": "beats/assets/audio/song.mp3.json", "count": 119}
```

### 6. 字幕时间轴

`assets/templates/srt.js` 的 `MVSrt.parse / tighten / at`，用一份 4 句 SRT 实测：

```
0.00-2.88  我把故事都写在风里
3.00-5.88  风把它吹到你窗前
6.00-8.88  你没有抬头
9.00-12.00 我便学着不再写
句间空档: 0.12, 0.12, 0.12
```

### 7. 静止段检测（质检第 1 项）

```bash
ffmpeg -i x.mp4 -vf "fps=2,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null -
```

校准：

| 素材 | YAVG |
|---|---|
| 纯静态色块 | 0.0000 |
| 缓慢推镜的正常画面 | 7.2 ~ 13.7 |
| 本例成片（含角色动作） | 2.6 ~ 4.1，均值 3.06 |

文档里定的阈值 `连续 6 帧 < 0.5 判静止` 就是照这个校准的。

### 8. 响度比对（质检第 7 项）

```
源曲  I: -34.1 LUFS   True peak: -17.9 dBFS
成片  I: -31.1 LUFS   True peak: -17.9 dBFS   → 差 3.0 LU，超标
```

用重封装方案修：

```bash
ffmpeg -y -i out/终版.mp4 -i assets/audio/song.mp3 -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k -shortest out/fixed.mp4
→ I: -34.1 LUFS（与原曲一致）
```

### 9. 关键帧总览拼图

`ffmpeg -pattern_type glob` 在本机 libavformat 构建里不可用（`globbing is not supported`）。
可靠做法是先按序号重命名再喂 `%03d.png`：

```bash
# 用序号目录
ffmpeg -y -i 'seq/%03d.png' -vf "scale=640:360,tile=2x2:margin=14:padding=8:color=0x1b1a17" -frames:v 1 storyboard.png
```

（本机也可以用 `npx hyperframes snapshot` 自带的 `contact-sheet.jpg`。）

## 没跑通的

### `hyperframes transcribe`（Whisper 路径）

```
$ npx hyperframes transcribe assets/audio/song.mp3 --engine whisper --model tiny.en --to srt
Transcribing with tiny.en...
Captions skipped — whisper-cpp not found.
```

`npx hyperframes doctor` 同样报：

```
whisper-cpp  ok: false  Not found (optional — needed for transcription)
```

需要按 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) 自编译二进制。
**已在 skill 内用 `assets/scripts/transcribe.py`（faster-whisper）绕开**，实测可用，见上文第 0.6 节。

### （已解决）musicdl 之前的安装失败

第一轮 `pip install musicdl` / `uv pip install faster-whisper` 卡在
`Failed to acquire lock on the client cache`（scipy / onnxruntime 的缓存锁）。

**根因是两个 uv 进程并发 + 残留锁**，不是包本身装不上。清理后换独立
`UV_CACHE_DIR`，两个包都装通了：

```
+ musicdl-2.14.2
+ faster-whisper-1.2.1
+ ctranslate2-4.8.4
+ onnxruntime-1.31.1
```

### `huggingface_hub` 下模型 401（已解决）

```
RuntimeError: CAS Client Error: HTTP status client error (401 Unauthorized),
domain: https://cas-server.xethub.hf.co/v2/reconstructions/...
```

xet 加速端点被拒。设 `HF_HUB_DISABLE_XET=1`（配合 `HF_ENDPOINT=https://hf-mirror.com`）
后正常下载。这条已写进 `00-setup.md`。

## 文档里标注为「官方资料、本机未验证」的清单

- `hyperframes publish` / `cloud` / `lambda` 等部署命令（本 skill 不用，未测）
- `librosa` 的 `beat_track` 交叉验证（`hyperframes audio` 已够用，没装）
- macOS / Linux 上的表现（本次全部在 Windows 11 上做）
- 3 分钟以上、40+ 镜头的长片渲染耗时（只有 6 秒样本的实测数）
