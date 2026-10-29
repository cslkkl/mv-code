# 音源获取 — musicdl

用户只给了歌名，没有文件。用 [musicdl](https://github.com/CharlesPikachu/musicdl)（纯 Python，支持网易云 / QQ / 酷狗 / 酷我 / 咪咕 / 千千 / 汽水 / B站 / 街声 / 喜马拉雅 / YouTube / Apple Music / Spotify / TIDAL / Qobuz / SoundCloud / Deezer 等几十个平台）。

> **实测版本 2.14.2，57 个平台客户端。**

## ★ 最重要的一条：musicdl 会顺带给你官方歌词

下载时会同时落一个 `.lrc` —— 平台提供的歌词，**与演唱精确对齐**。

这直接省掉了 Whisper 转写，而且准确率高一个数量级。实测同一首歌同一段：

| | 内容 |
|---|---|
| 官方 LRC | 桌垫下的老照片 / 笨拙系上红色领带的结 / 等会儿见你一定比想象美 |
| Whisper small | 捉点下的老照片 / 奔着西沙 红色零带的街 / 等会儿见你一听 |
| Whisper medium | 桌垫下的老照片 / 笨拙细杀红色领带的街 / 等会儿见你一定 |

**所以流程是：先看有没有 `.lrc`，有就转 SRT（`assets/scripts/lrc2srt.py`），没有才用 Whisper。**

## 安装（已实测可装通）

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/Scripts/python.exe musicdl
```

Windows 上 CLI 在 `.venv\Scripts\musicdl.exe`。验证：

```bash
.venv/Scripts/python.exe -c "import musicdl; from musicdl.modules import MusicClientBuilder; print(len(MusicClientBuilder.REGISTERED_MODULES))"
# → 57
```

## 找歌

### 交互式（推荐）

```bash
.venv/Scripts/musicdl.exe -k "歌名 歌手" -m NeteaseMusicClient,QQMusicClient,KuwoMusicClient
```

交互键：`↑/↓` 移动、`Space` 勾选、`a` 全选、`i` 反选、`Enter` 下载、`Esc`/`q` 取消、`r` 重来。

### 脚本化（无人值守，也是写进 skill 的方式）

```python
from musicdl import musicdl

SOURCES = ["NeteaseMusicClient", "QQMusicClient", "KuwoMusicClient"]
client = musicdl.MusicClient(
    music_sources=SOURCES,
    init_music_clients_cfg={s: {"work_dir": "assets/audio", "search_size_per_source": 5} for s in SOURCES},
)

res = client.search(keyword="歌名 歌手")
picked = []
for source, infos in res.items():
    for s in infos:                      # infos 是 SongInfo 对象，不是 dict
        if s.with_valid_download_url and "歌手名" in (s.singers or ""):
            picked.append(s)
            break
client.download(song_infos=picked)
```

### `SongInfo` 的字段（实测，不是 dict）

`musicdl` 现在返回的是 `SongInfo` 对象，**不能用 `info["songname"]`**，要用属性：

| 属性 | 说明 |
|---|---|
| `song_name` | 歌名 |
| `singers` | 歌手 |
| `album` | 专辑 |
| `ext` | `flac` / `mp3` / `m4a` |
| `file_size` / `file_size_bytes` | 可读大小 / 字节数 |
| `duration` / `duration_s` | `00:05:32` / `332.73` |
| `download_url` | 直链 |
| `with_valid_download_url` | **先判这个**，False 的下了也白下 |
| `lyric` | **官方歌词文本（LRC 格式）** |
| `save_path` / `work_dir` | 落盘路径 |
| `raw_data` | 平台原始 JSON |

`infos[0].keys()` 会报 `AttributeError` —— 这是最容易踩的一脚。

### 已知参数

| 参数 | 用途 |
|---|---|
| `music_sources` | 平台列表，默认 `MiguMusicClient,NeteaseMusicClient,QQMusicClient,KuwoMusicClient,QianqianMusicClient` |
| `init_music_clients_cfg` | 每平台的 `work_dir`、`search_size_per_source`、`auto_set_proxies` |
| `requests_overrides` | 补 `headers` / `proxies` / `timeout` / `verify` |
| `clients_threadings` | 每平台并发数 |
| `search_rules` | 平台特有搜索选项（如 5sing 的 `sort/filter/type`） |

海外源要显式指定：`-m QobuzMusicClient,JamendoMusicClient,YouTubeMusicClient`。
歌单：`-p "https://music.163.com/#/playlist?id=..."`。

## 拿到之后必须做的四件事

```bash
# 1. 看落了什么（.flac/.mp3 + .lrc + 两个 .pkl 缓存）
ls assets/audio/<平台>/<时间戳> */

# 2. 统一命名（目录名带时间戳和中文，别让后续脚本去猜）
mv <下载的音频> assets/audio/song.mp3
mv <下载的歌词> assets/audio/song.lrc      # 有就留下，它比转写准

# 3. 确认时长/采样率 —— 后面所有时间轴都以这个为准
ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels \
  -of default=nw=1 assets/audio/song.mp3

# 4. 量原曲响度 —— 渲染完要拿它对比（见 08-review 第 7 项）
ffmpeg -hide_banner -nostats -i assets/audio/song.mp3 \
  -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+I:|Peak:"
```

> 实测拿到的是 **FLAC 192kHz / 245 MB**。MV 用不上这个规格，降到 48kHz MP3 后只有 **9.9 MB**，差 25 倍：
> ```bash
> ffmpeg -i song.flac -ar 48000 -ac 2 -codec:a libmp3lame -q:a 2 assets/audio/song.mp3
> ```

## 坑

| 现象 | 原因 | 修法 |
|---|---|---|
| `info["songname"]` KeyError/TypeError | 返回 `SongInfo` 对象不是 dict | 用 `info.song_name` |
| 下载"成功"但文件是 0 字节 | 该条 `with_valid_download_url=False` | 先过滤，或换平台 |
| 下载慢 / 失败 | 平台限流 | 换平台（酷我通常最松），或加代理 `-r '{"NeteaseMusicClient":{"proxies":{"https":"http://127.0.0.1:7890"}}}'` |
| 只有 128kbps 试听 | 版权限制 | 看 `file_size`，4 分钟低于 3 MB 基本是试听 |
| 文件名带一堆前缀 / 目录名带时间戳 | musicdl 命名不统一 | 统一改名，别让后续脚本猜 |
| 拿不到 | 冷门/下架 | 让用户给本地文件，或用 yt-dlp 抽 B 站/YouTube 音轨 |

```bash
# 兜底：从视频链接抽音频
yt-dlp -x --audio-format mp3 -o "assets/audio/song.%(ext)s" "URL"
```

## 转歌词：LRC → SRT

```bash
python assets/scripts/lrc2srt.py assets/audio/song.lrc lyrics.srt --audio-duration 371.08 --merge
```

- **LRC 只有开始时间、没有结束时间** —— 每句的 `t1` 由下一句的 `t0` 推出，最后一句用 `--audio-duration` 兜住
- `--merge`：LRC 的换行跟着换气走（「我们终于 / 来到了这一天」是两行）。做**字幕**可以不合并（跟着唱更准），做**分镜**要合并（一句一镜）
- 头部「作词/作曲/编曲」那几行默认丢掉（它们是制作人员，不是唱词），`--keep-header` 保留

实测：一首 5:32 的歌 → **79 行 LRC → 72 条 SRT**，时间轴单调无重叠。

> musicdl 的许可证是 PolyForm Noncommercial（非商用）。个人做 MV 没问题，商用要另行处理。
