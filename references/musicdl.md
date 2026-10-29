# 音源获取 — musicdl

用户只给了歌名，没有文件。用 [musicdl](https://github.com/CharlesPikachu/musicdl)（纯 Python，支持网易云 / QQ / 酷狗 / 酷我 / 咪咕 / 千千 / 汽水 / B站 / 街声 / 喜马拉雅 / YouTube / Apple Music / Spotify / TIDAL / Qobuz / SoundCloud / Deezer 等几十个平台）。

## 顺序

1. 先问一次：**「本地有 mp3/flac 吗？有链接吗？」** —— 用户手上的比爬来的干净（无损、完整）。
2. 没有，按歌名搜。

## 安装

```bash
uv pip install --python .venv/Scripts/python.exe musicdl
# 或
pip install musicdl
```

CLI：`.venv/Scripts/musicdl.exe`（当前版本 2.14.2）。

## 找歌

### 交互式（推荐，先看清结果再挑）

```bash
.venv/Scripts/musicdl.exe -k "歌名 歌手" -m NeteaseMusicClient,QQMusicClient,KuwoMusicClient
```

交互键：`↑/↓` 移动、`Space` 勾选、`a` 全选、`i` 反选、`Enter` 下载、`Esc`/`q` 取消、`r` 重来。

### 脚本化（无人值守）

```python
from musicdl import musicdl

SOURCES = ["NeteaseMusicClient", "QQMusicClient", "KuwoMusicClient"]
client = musicdl.MusicClient(
    music_sources=SOURCES,
    init_music_clients_cfg={s: {"work_dir": "assets/audio"} for s in SOURCES},
)

results = client.search(keyword="歌名 歌手")
picked = []
for source, infos in results.items():
    for info in infos[:3]:
        print(source, info.get("songname"), info.get("singers"), info.get("filesize"))
    # 挑第一条名称+歌手都对上的
    for info in infos:
        if "歌手" in (info.get("singers") or "") and len(picked) < 1:
            picked.append(info)
client.download(song_infos=picked)
```

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

## 拿到之后必须做三件事

```bash
# 1. 统一命名
mv <下载的文件> assets/audio/song.mp3

# 2. 确认时长/采样率/声道 —— 后面所有时间轴都以这个为准
ffprobe -v error -show_entries format=duration:stream=sample_rate,channels \
  -of default=nw=1 assets/audio/song.mp3

# 3. 量原曲响度 —— 渲染完要拿它对比（见 08-review 第 7 项）
ffmpeg -hide_banner -nostats -i assets/audio/song.mp3 \
  -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+I:|Peak:"
```

三条结果记进 `song.md` 的「基本事实」。

## 坑

| 现象 | 原因 | 修法 |
|---|---|---|
| 下载慢 / 失败 | 平台限流 | 换平台（酷我通常最松），或加代理 `-r '{"NeteaseMusicClient":{"proxies":{"https":"http://127.0.0.1:7890"}}}'` |
| 只有 128kbps 试听 | 版权限制 | 看 `filesize`，4 分钟低于 3 MB 基本是试听，换平台 |
| 文件名带一堆前缀 | musicdl 命名不统一 | 统一改 `song.mp3`，别让后续脚本猜 |
| 拿不到 | 冷门/下架 | 让用户给本地文件，或用 yt-dlp 抽 B 站/YouTube 音轨 |

```bash
# 兜底：从视频链接抽音频
yt-dlp -x --audio-format mp3 -o "assets/audio/song.%(ext)s" "URL"
```

> musicdl 的许可证是 PolyForm Noncommercial（非商用）。个人做 MV 没问题，商用要另行处理。
