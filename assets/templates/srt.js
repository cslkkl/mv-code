// srt.js — 解析 SRT，按时间取当前该显示的字幕。
// 纯函数，无 DOM 依赖（除了 fetch），可被 composition 直接 import。
//
//   const subs = await MVSrt.load("assets/lyrics.srt");
//   const line = MVSrt.at(subs, t);      // 返回 {text} 或 null
//
// 渲染约定（见 07-build）：
//   - 字幕放在最上层，位置固定，不随镜头运动
//   - 一条字幕在 [t0, t1) 内显示；t1 已按「下一句开始 - 0.12s」对齐
//   - 只在整句边界切换，不做逐字动效（逐字会让观众读字幕而不是看画面）

(function (global) {
  function parseTime(s) {
    // 00:01:23,456 或 00:01:23.456
    const m = s.trim().match(/(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})/);
    if (!m) return null;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, "0")) / 1000;
  }

  function parse(text) {
    // 统一换行，按空行切块
    const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split("\n").filter((l) => l.trim() !== "");
      if (!lines.length) continue;
      const timeIdx = lines.findIndex((l) => l.includes("-->"));
      if (timeIdx < 0) continue;
      const [a, b] = lines[timeIdx].split("-->");
      const t0 = parseTime(a);
      const t1 = parseTime(b);
      if (t0 == null || t1 == null) continue;
      const body = lines.slice(timeIdx + 1).join(" ").trim();
      if (!body) continue;
      cues.push({ t0, t1, text: body });
    }
    cues.sort((x, y) => x.t0 - y.t0);
    return cues;
  }

  // 收尾对齐：每句结束拉到下一句开始前 gap 秒，避免字幕闪空
  // 相接（t1 === next.t0）和重叠（t1 > next.t0）都收 —— 否则相邻句会硬切，视觉上没换气
  function tighten(cues, gap = 0.12) {
    for (let i = 0; i < cues.length; i++) {
      const next = cues[i + 1];
      if (next && cues[i].t1 >= next.t0) {
        cues[i].t1 = Math.max(cues[i].t0 + 0.5, next.t0 - gap);
      }
    }
    return cues;
  }

  function at(cues, t) {
    // 线性扫（字幕量小，二分没必要，且逐帧 seek 时顺序读更快）
    for (let i = 0; i < cues.length; i++) {
      if (t >= cues[i].t0 && t < cues[i].t1) return cues[i];
      if (t < cues[i].t0) break;
    }
    return null;
  }

  async function load(url, opts = {}) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("SRT 读取失败: " + url);
    return tighten(parse(await res.text()), opts.gap ?? 0.12);
  }

  global.MVSrt = { parse, tighten, at, load, parseTime };
})(window);
