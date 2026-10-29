# 00 环境准备 — 一次装好，之后每首歌都只跑自检

## 1. 自检（每次都跑，10 秒）

```bash
npx hyperframes doctor
```

要看到这几项 `ok: true`：

| 检查项 | 期望 | 不 ok 怎么办 |
|---|---|---|
| Node.js | ≥ 22 | 装 Node 22+ |
| FFmpeg / FFprobe | 有 | Windows 装 gyan.dev 的 essentials build，加进 PATH |
| Chrome | 有（`~/.cache/puppeteer` 或内置） | `npx hyperframes browser` 自动下载 |
| whisper-cpp | 可选，转写用 | 见第 3 节；不装就走 SRT 手输/外部转写 |
| Docker | 不需要 | 忽略 |

`doctor` 报 `whisper-cpp: Not found` **不影响渲染**，只影响「没歌词时自动转写」。

## 2. HyperFrames 两种用法

**A. 项目内 npx（推荐）**：每个 MV 工程自带 `package.json`，pin 死版本，几个月后还能一模一样重渲。模板里已经写好了：

```json
{
  "scripts": {
    "dev": "npx --yes hyperframes@0.8.214 preview",
    "check": "npx --yes hyperframes@0.8.214 check",
    "render": "npx --yes hyperframes@0.8.214 render"
  }
}
```

**B. 全局装**：`npm i -g hyperframes`，然后直接 `hyperframes <cmd>`。省每次 npx 的解析时间，但版本会漂。

### 它自带的 skill 要不要装

HyperFrames 会尝试往 `~/.agents/skills` 灌它自己的 `hyperframes` / `hyperframes-cli` / `media-use` 三个 skill。

- **本 skill 已经把这些的关键部分抽进 `references/hyperframes.md`**，日常不需要装。
- 想要更全的参考（`story.md` 的三幕结构、`motion.md` 的缓动表、`registry` 的现成组件），再装：
  ```bash
  npx hyperframes skills            # 装到所有支持的 AI 工具
  npx hyperframes skills update     # 更新已有的
  ```
- **注意**：装完要重启会话它们才会被加载；而且 `hyperframes` 这个 skill 名与本 skill 不同，不冲突。但 `npx hyperframes init` 默认会自动装 —— 所以初始化工程时加 `--skip-skills`（本 skill 干脆不走 init，直接复制模板）。

## 3. GSAP 必须本地内置，不要 CDN

`hyperframes init` 生成的模板引用的是 `https://cdn.jsdelivr.net/npm/gsap@...`。在中文网络下这条 CDN 会 `ERR_CONNECTION_RESET`，表现为**渲染出全空的黑帧**，`check` 报 `request_failed` + `Cannot read properties of undefined (reading 'timeline')`。

一次修好：把 gsap 拉下来放进工程，所有 HTML 用相对路径引用。

```bash
# 在工程根执行
npm pack gsap@3.14.2
tar -xzf gsap-3.14.2.tgz
mkdir -p assets/lib
cp package/dist/gsap.min.js assets/lib/gsap.min.js
rm -rf package gsap-3.14.2.tgz
```

然后每个 composition：

```html
<script src="assets/lib/gsap.min.js"></script>
```

> 子 composition（`compositions/*.html`）里**不要**再引 gsap —— 它们寄生在 `index.html` 的页面上，引第二次会重复定义。

## 4. 中文字体

HyperFrames 只自动解析内置的拉丁字体（Inter / Montserrat / … / Noto Sans JP），**没有中文字体**。用 `font-family: "Noto Sans SC"` 会被 lint 拦下（`font_family_without_font_face`），而且渲染时掉回默认字体，中文字形会变。

两条路：

**A. 用系统字体，加一行 @font-face 声明**（最省事，跨机器一致性别指望）

```css
@font-face { font-family: "Noto Sans SC"; src: local("Microsoft YaHei"); }
```

Windows 上 `local("Microsoft YaHei")`（微软雅黑）基本都有。

**B. 项目内嵌 woff2**（要发出去给别人用就走这条）

```css
@font-face {
  font-family: "MVHan";
  src: url("assets/fonts/MVHan-400.woff2") format("woff2");
  font-weight: 400;
}
```

字体文件放 `assets/fonts/`，`.woff2` 比 `.ttf` 小一个量级，中文常用字子集化后 2~4 MB。

## 5. Python 侧（转写 + 可选 librosa）

**主力方案**：`npx hyperframes audio` 已经用纯 JS 信号分析算出 BPM、节拍点、onset、段落、响度，**不需要 librosa**。第一版别装 Python。

**只在下列情况才装 Python**：

| 需求 | 装什么 |
|---|---|
| 没有 SRT，要转写歌词 | `faster-whisper`（比 openai-whisper 快 4 倍，CPU 可跑） |
| 要 librosa 的 `beat_track` 交叉验证 BPM | `librosa` |
| 要画波形图/频谱图做参考 | `librosa` + `matplotlib` |

```bash
# 用 uv（快），不要污染系统 python
uv venv --python 3.12 .venv
uv pip install --python .venv/Scripts/python.exe faster-whisper
```

> Windows 上 `uv` 偶发卡在 `scipy`/`onnxruntime` 的缓存锁（报 `Failed to acquire lock on the client cache`）。救法：`Get-Process uv | Stop-Process -Force` 后重试，或直接换 `pip`：
> ```bash
> .venv/Scripts/python.exe -m ensurepip --upgrade
> .venv/Scripts/python.exe -m pip install faster-whisper
> ```

## 6. 目录初始化（每首歌跑一次）

```bash
mkdir -p mv-<name>/{assets/{audio,lib,fonts},compositions,tests,out,qa,boards/stills}
```

工程骨架**不要用 `npx hyperframes init` 生成**（它会灌自己的 skills、写一堆用不到的示例）。直接从本 skill 的 `assets/templates/` 复制：

| 模板 | 复制到 | 作用 |
|---|---|---|
| `index.html` | 工程根 | 根 composition：挂场景、放字幕层、放音轨 |
| `hyperframes.json` | 工程根 | 工程配置 |
| `package.json` | 工程根 | pin 死 CLI 版本，`npm run check/render` |
| `scene.html` | `compositions/s01.html` | 单场骨架（相机 + 分层 + 唯一运镜） |
| `character.js` | `compositions/` | 角色模块 |
| `srt.js` | `assets/lib/` | SRT 解析（逐帧取当前句） |
| `song.md` | 工程根 | 分析结果模板 |
| `storyboard.md` | 工程根 | 分镜表模板 |
| `style-choice.md` | `tests/` | 画风选定模板 |
| `QA.md` | 工程根 | 质检模板 |

> 真要 `init` 就必须加 `--skip-skills`，否则它会往 `~/.agents/skills` 里灌它自己的 hyperframes 系列 skill，与本 skill 重名冲突。

## 7. 一次跑通验收

```bash
cd mv-<name>
npm run check                        # 期望 ok: true
npx hyperframes snapshot --at 1 --no-end -o tests/snaps
npm run render -- -o out/smoke.mp4 -q draft
```

三行都过了，环境才算就绪。`render` 出黑屏就是第 3 节那个 CDN 问题。
