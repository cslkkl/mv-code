# QA — <歌名> MV

成片：`out/终版.mp4` · 1920x1080 · 30fps · mm:ss · H.264 + AAC

## 八项结论

| # | 项目 | 结论 | 证据 |
|---|---|---|---|
| 1 | 像幻灯片 | | `qa/framediff.txt`：最长静止段 __s |
| 2 | 运镜晃 | | 全片 __ 镜，`#camera` tween 均为 __ 个 |
| 3 | 表现力 | | `qa/peak.png`（__:__，`moments.peak`）vs `qa/verse.png` |
| 4 | 道具 | | `qa/prop-*.png`，断言 hand/headTop |
| 5 | 歌词演出 | | `qa/lyric-*.png`，逐句对照 __/__ 可读 |
| 6 | 歌词对齐 | | 最大偏差 __ s（阈值 0.15s） |
| 7 | 响度 | | 源 __ LUFS / 成片 __ LUFS，差 __ LU |
| 8 | 静态检查 | | `check --json`：lint/runtime/layout/contrast 全 ok，无 dead_stretch |

## 修过的项

| 项 | 改前 | 改后 |
|---|---|---|
| | | |

## 未解决

- （没有就写「无」）

## 抽帧证据

`qa/`：

- `frames/` —— 全片 0.5s 间隔抽帧（校验静止段与整体）
- `lyric-NN.png` —— 每句歌词中点帧
- `peak.png` / `verse.png` —— 情绪对比
- `prop-*.png` —— 有道具的镜头
- `framediff.txt` —— YAVG 逐帧差值原始数据

## 交付清单

- [ ] `out/终版.mp4`（时长 = 音频时长，有音轨，LUFS 差 ≤ 1.0）
- [ ] `storyboard.png`（关键帧总览，用户已确认）
- [ ] `character-sheet.png`（三视图 + 表情表，用户已确认）
- [ ] `song.md` / `lyrics.srt` / `storyboard.md`
- [ ] `QA.md` + `qa/`
- [ ] 一句话说明：哪些靠代码画、哪些是妥协
