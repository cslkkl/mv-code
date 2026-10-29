---
format: 1920x1080
duration: 00s
message: 一句话主题（从 song.md 的主题抄）
arc: 悬停 → 低语 → 撑开 → 回撤 → 收束
audience: 听众
mode: collaborative
character: compositions/character.js @ v1
style: paper
palette: ["#2a2622", "#8a7f6d", "#b8452e", "#e8dcc4", "#d8c9a8"]
---

<!--
填法见 references/04-storyboard.md。
硬规则：
  - 一句歌词一个 Frame，start/duration 严格衔接，总和 = 音频时长
  - beat_anchor 必须能在 song.md 的节拍表里找到
  - reads 的时间窗口不重叠
  - 抽象句换成具体动作（对照 04-storyboard 的「抽象 → 具体」表）
-->

## Frame 1 — 标题

- scene: 一句话画面描述
- start: 0.00
- duration: 0.00
- transition_in: cut
- beat_anchor: 0.00
- reads: 观众必须看懂的东西（t0-t1s）；第二件事（t1-t2s）
- sound: 底噪 / 音效 / 静音
- src: compositions/frames/01.html
- status: outline

> 歌词原文

这一镜为什么存在（一句）。镜头语言：景别 + 运镜 + 角色动作。

---

<!-- 下面两节在 05 步填 -->

## 转场总表

方案：方案 __（一镜到底 / 卡点切换 / 拼贴快切）；理由：一句。

| 从 → 到 | 时间 | 方式 | 承接物 | 对齐节拍 |
|---|---|---|---|---|
| 01 → 02 | | cut / whip / match / card | | |

### 衔接帧一致性

| 边界 | 角色位置 | 角色大小 | 姿态参数 |
|---|---|---|---|
| 01/02 | → | → | → |

## 用户指定口径

- 「某句歌词」→ 用户要求的具体表现

## 低置信度歌词（待确认）

| # | 时间 | 我听到的 | 可能是什么 |
|---|---|---|---|
