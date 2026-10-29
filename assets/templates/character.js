// character.js — MV 主角的统一绘制接口。全片每个镜头的角色都从这里画，保证造型一致。
//
// 设计：两段式
//   1) pose()  把「动作 + 表情 + 时间」变成一组数值参数（纯函数，确定性）
//   2) draw*() 把参数交给对应画风的渲染器画出来
//
// 用法：
//   <script src="compositions/character.js"></script>
//   MVChar.draw(ctx, {
//     x: 90, y: 130, scale: 1,
//     facing: "right",                 // left | right | front | back
//     action: "walk",                  // idle | walk | run | jump | hug | hold | sit | turn
//     expression: "happy",             // neutral | happy | shy | sad | surprised
//     prop: "cup",                     // null | cup | letter | lantern | umbrella
//     t: 3.42,
//     style: "pixel",                  // pixel | paper | crayon
//     palette: PALETTE,
//   });
//
// 三条硬规则（来自导演要求）：
//   - 每个镜头不要重新画角色，只改参数
//   - 手持道具必须贴合手部（prop 的坐标由 handAt() 给出，不要手写）
//   - 道具不得遮挡面部（prop 的 y 永远在 headTop 之下）

(function (global) {
  // ---------- 参数表 ----------

  // 各动作的关键帧：用归一化时间 u∈[0,1) 取插值，全部整数化到「帧」
  const ACTIONS = {
    idle: { arms: [10, 10], legs: [0, 0], bob: 1, loop: 2.0 },
    walk: { arms: [16, -16], legs: [7, -7], bob: 1, loop: 0.5 },
    run: { arms: [26, -26], legs: [12, -12], bob: 2, loop: 0.32 },
    jump: { arms: [34, 34], legs: [-6, -6], bob: 4, loop: 0.9 },
    hug: { arms: [72, 72], legs: [0, 0], bob: 1, loop: 1.6 },
    hold: { arms: [40, 14], legs: [0, 0], bob: 1, loop: 1.4 },
    sit: { arms: [12, 12], legs: [26, 26], bob: 0, loop: 2.4 },
    turn: { arms: [8, 8], legs: [0, 0], bob: 1, loop: 1.2 },
  };

  const FACING_X = { right: 1, left: -1, front: 0, back: 0 };
  const SHOW_FACE = { right: true, left: true, front: true, back: false };

  // ---------- pose ----------

  function pose(o) {
    const a = ACTIONS[o.action] || ACTIONS.idle;
    const t = o.t || 0;
    const dt = o.dt || 0; // 全局时间偏移，用来让不同镜头的循环错开
    const u = ((t + dt) % a.loop) / a.loop;
    const s = Math.sin(u * Math.PI * 2);
    const fx = FACING_X[o.facing] ?? 1;

    // 逐帧风格：把连续量压到整数像素，避免亚像素发糊
    const step = o.style === "pixel" ? 1 : 0.5;
    const q = (v) => Math.round(v / step) * step;

    const bob = q(a.bob * (a === ACTIONS.jump ? Math.abs(s) * 3 : s));
    const armL = q(a.arms[0] + (a.arms[0] ? s * 6 : 0));
    const armR = q(a.arms[1] - (a.arms[1] ? s * 6 : 0));
    const legL = q(a.legs[0] * s);
    const legR = q(a.legs[1] * s);

    // 表情：眼睛 / 嘴 / 眉 三件套，用枚举而不是画细节（32px 宽能分辨的极限）
    const EMO = {
      neutral: { eye: "open", mouth: "flat", brow: 0 },
      happy: { eye: "arc", mouth: "smile", brow: -1 },
      shy: { eye: "down", mouth: "small", brow: 1, blush: true },
      sad: { eye: "down", mouth: "frown", brow: 1 },
      surprised: { eye: "wide", mouth: "o", brow: -2 },
    };
    const emo = EMO[o.expression] || EMO.neutral;

    return {
      x: o.x, y: o.y, fx, bob,
      armL, armR, legL, legR,
      facing: o.facing, faceVisible: SHOW_FACE[o.facing] !== false,
      eye: emo.eye, mouth: emo.mouth, brow: emo.brow, blush: !!emo.blush,
      prop: o.prop || null,
      // 手的位置（道具必须挂这里，不许手写坐标）
      hand: {
        l: { x: o.x + fx * (-6 - armL * 0.18), y: o.y - 14 + armL * 0.16 + bob },
        r: { x: o.x + fx * (6 + armR * 0.18), y: o.y - 14 + armR * 0.16 + bob },
      },
      headTop: o.y - 34 + bob,   // 面部上沿：道具最高只能到这里
    };
  }

  // ---------- 画风 A：像素 ----------

  function drawPixel(ctx, o) {
    const p = pose(o);
    const C = o.palette || ["#0d0b0a", "#2b1d16", "#7a3b1e", "#e0693a", "#f2e8d5"];
    const [ink, dark, cloth, skin, light] = C;

    const S = o.scale || 1;
    const R = (x, y, w, h, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };

    const bx = p.x, by = p.y + p.bob;

    // 腿：用最深的 ink，不要用和地面同色（否则腿会"消失"在背景里）
    R(bx - 5, by - 12, 3, 12 + p.legL * 0.3, ink);
    R(bx + 2, by - 12, 3, 12 + p.legR * 0.3, ink);
    // 身体
    R(bx - 7, by - 34, 14, 22, cloth);
    // 手臂（从肩膀往下画）
    R(bx - 10 - p.armL * 0.06, by - 32, 3, 11 + p.armL * 0.05, cloth);
    R(bx + 7 + p.armR * 0.06, by - 32, 3, 11 + p.armR * 0.05, cloth);
    // 头
    R(bx - 5, by - 46, 10, 12, skin);
    // 头发（朝向决定遮盖侧）
    R(bx - 5, by - 46, 10, 3, ink);

    // 脸
    if (p.faceVisible) {
      const eyeY = by - 41;
      const eyeX = bx + (p.fx || 1) * 1;
      const eye = (x, y) => {
        if (p.eye === "open") R(x, y, 1, 2, ink);
        else if (p.eye === "arc") R(x, y + 1, 2, 1, ink);
        else if (p.eye === "wide") R(x, y, 1, 3, ink);
        else R(x, y + 1, 2, 1, ink); // down
      };
      eye(eyeX - 2, eyeY);
      eye(eyeX + 1, eyeY);
      // 嘴
      if (p.mouth === "smile") R(eyeX - 1, eyeY + 3, 3, 1, ink);
      else if (p.mouth === "frown") R(eyeX - 1, eyeY + 4, 3, 1, ink);
      else if (p.mouth === "o") R(eyeX, eyeY + 3, 2, 2, ink);
      else R(eyeX - 1, eyeY + 3, 2, 1, ink);
      // 腮红
      if (p.blush) {
        ctx.globalAlpha = 0.5; // 像素风里唯一的半透明允许：腮红独立色层
        R(bx - 5, eyeY + 2, 2, 1, skin);
        R(bx + 3, eyeY + 2, 2, 1, skin);
        ctx.globalAlpha = 1;
      }
    }

    // 道具：挂右手，永远不高于 headTop+2
    if (p.prop) {
      const hx = p.hand.r.x, hy = Math.max(p.hand.r.y, p.headTop + 2);
      drawPixelProp(ctx, p.prop, hx, hy, C);
    }
    return p;
  }

  function drawPixelProp(ctx, prop, x, y, C) {
    const R = (a, b, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(a), Math.round(b), w, h); };
    if (prop === "cup") { R(x - 1, y - 4, 4, 5, C[4]); R(x + 3, y - 3, 1, 2, C[4]); }
    else if (prop === "letter") { R(x - 1, y - 5, 6, 4, C[4]); R(x, y - 4, 1, 1, C[2]); }
    else if (prop === "lantern") { R(x - 2, y - 7, 5, 5, C[3]); R(x, y - 8, 1, 2, C[1]); }
    else if (prop === "umbrella") { R(x - 4, y - 10, 9, 2, C[2]); R(x, y - 8, 1, 8, C[1]); }
  }

  // ---------- 画风 B：纸艺拼贴（DOM/SVG 版）----------
  // 返回一个 SVG 字符串，调用方塞进容器。参数同上。

  function svgPaper(o) {
    const p = pose(o);
    const C = o.palette || ["#2a2622", "#8a7f6d", "#b8452e", "#e8dcc4", "#d8c9a8"];
    const [ink, mid, main, paper, ground] = C;
    const bx = p.x, by = p.y + p.bob;
    const shadow = `<filter id="ps" x="-30%" y="-30%" width="180%" height="180%">
        <feDropShadow dx="1.6" dy="2.4" stdDeviation="1.6" flood-color="${ink}" flood-opacity=".38"/></filter>`;
    const edge = `stroke="#fbf7ee" stroke-width="3" paint-order="stroke"`; // 剪纸白边
    const cut = (d, fill) => `<path d="${d}" fill="${fill}" ${edge} filter="url(#ps)"/>`;

    // 尺度：角色总高约 60 单位（脚底 y=0，头顶 y=-60），头部占 1/3 —— 绘本式的头身比
    const HEAD_R = 9, HEAD_CY = by - 48;     // 头心
    const NECK_Y = by - 39;                   // 头底
    const SHOULDER_Y = by - 37;
    const HIP_Y = by - 15;
    const FOOT_Y = by;

    // 手臂：由 armL/armR 决定下垂角度。起点在肩内侧，不贴轮廓，避免看起来"脱体"。
    const armPath = (side, ang) => {
      const sx = bx + side * 7.2, sy = SHOULDER_Y + 1.2;
      const rad = (ang * Math.PI) / 180;
      const ex = sx + side * (1.2 + Math.sin(rad) * 10);
      const ey = sy + Math.cos(rad) * 13;
      return `M${sx} ${sy} Q${sx + side * 2.4} ${sy + 7.4} ${ex} ${ey}`;
    };
    // 先画白边（粗），再画本体（细）—— 剪纸的白圈不能只靠 paint-order（圆头线帽不支持）
    const armSvg = (side, ang) =>
      `<path d="${armPath(side, ang)}" stroke="#fbf7ee" stroke-width="7.2" stroke-linecap="round" fill="none" filter="url(#ps)"/>
       <path d="${armPath(side, ang)}" stroke="${main}" stroke-width="4" stroke-linecap="round" fill="none"/>`;

    // 腿：由 legL/legR 决定前后摆动
    const legPath = (side, sw) => {
      const hx = bx + side * 3.4, hy = HIP_Y;
      const fx = hx + sw * 0.55, fy = FOOT_Y;
      return `M${hx} ${hy} L${fx} ${fy}`;
    };

    let face = "";
    if (p.faceVisible) {
      const ex = bx + (p.fx || 1) * 1.6;
      const eyeY = HEAD_CY - 1;
      const eyes =
        p.eye === "arc"
          ? `<path d="M${ex - 5} ${eyeY} q2.4 -3 4.8 0" stroke="${ink}" fill="none" stroke-width="1.7" stroke-linecap="round"/>
             <path d="M${ex + 2} ${eyeY} q2.4 -3 4.8 0" stroke="${ink}" fill="none" stroke-width="1.7" stroke-linecap="round"/>`
          : p.eye === "wide"
          ? `<ellipse cx="${ex - 3.4}" cy="${eyeY}" rx="1.5" ry="2.4" fill="${ink}"/>
             <ellipse cx="${ex + 3.4}" cy="${eyeY}" rx="1.5" ry="2.4" fill="${ink}"/>`
          : p.eye === "down"
          ? `<path d="M${ex - 5} ${eyeY + 1} h3.2" stroke="${ink}" stroke-width="1.7" stroke-linecap="round"/>
             <path d="M${ex + 2} ${eyeY + 1} h3.2" stroke="${ink}" stroke-width="1.7" stroke-linecap="round"/>`
          : `<circle cx="${ex - 3.4}" cy="${eyeY}" r="1.6" fill="${ink}"/>
             <circle cx="${ex + 3.4}" cy="${eyeY}" r="1.6" fill="${ink}"/>`;

      const mouthY = HEAD_CY + 5;
      const mouth =
        p.mouth === "smile"
          ? `<path d="M${ex - 3} ${mouthY} q3 2.6 6 0" stroke="${ink}" fill="none" stroke-width="1.6" stroke-linecap="round"/>`
          : p.mouth === "frown"
          ? `<path d="M${ex - 3} ${mouthY + 1} q3 -2.6 6 0" stroke="${ink}" fill="none" stroke-width="1.6" stroke-linecap="round"/>`
          : p.mouth === "o"
          ? `<ellipse cx="${ex}" cy="${mouthY + 0.5}" rx="1.4" ry="2" fill="${ink}"/>`
          : p.mouth === "small"
          ? `<path d="M${ex - 1.4} ${mouthY} h2.8" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`
          : `<path d="M${ex - 2.6} ${mouthY} h5.2" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`;

      const brow =
        p.brow === 0
          ? ""
          : `<path d="M${ex - 5} ${eyeY - 4 + p.brow * 0.6} h3" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>
             <path d="M${ex + 2} ${eyeY - 4 + p.brow * 0.6} h3" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>`;

      const blush = p.blush
        ? `<ellipse cx="${ex - 6.4}" cy="${HEAD_CY + 2.4}" rx="2.2" ry="1.3" fill="${main}" opacity=".45"/>
           <ellipse cx="${ex + 6.4}" cy="${HEAD_CY + 2.4}" rx="2.2" ry="1.3" fill="${main}" opacity=".45"/>`
        : "";

      face = eyes + mouth + brow + blush;
    }

    // 道具：位置来自 pose().hand.r，高度下限是 headTop + 2，天然遮不住脸
    let propSvg = "";
    if (p.prop) {
      const px = p.hand.r.x;
      const py = Math.max(p.hand.r.y, p.headTop + 2);
      const shapes = {
        cup:      `<path d="M${px - 2.6} ${py - 5} h5.2 v5.2 h-5.2 z" fill="${paper}" ${edge}/><path d="M${px + 2.6} ${py - 4} q2.4 0 2.4 1.8 q0 1.8 -2.4 1.8" fill="none" stroke="${paper}" stroke-width="1.3"/>`,
        letter:   `<rect x="${px - 3}" y="${py - 6}" width="9" height="6.5" rx=".6" fill="${paper}" ${edge}/><path d="M${px - 3} ${py - 6} l4.5 3.4 l4.5 -3.4" fill="none" stroke="${mid}" stroke-width=".7"/>`,
        lantern:  `<ellipse cx="${px}" cy="${py - 4.6}" rx="3.4" ry="4.2" fill="${main}" ${edge}/><path d="M${px} ${py - 9} v1.8" stroke="${ink}" stroke-width=".9"/>`,
        umbrella: `<path d="M${px - 7} ${py - 9} q7 -6 14 0 z" fill="${main}" ${edge}/><path d="M${px} ${py - 9} v9" stroke="${ink}" stroke-width="1"/>`,
      };
      propSvg = `<g filter="url(#ps)">${shapes[p.prop] || shapes.cup}</g>`;
    }

    // 角色按 320x180 尺度设计；放进 1920x1080 用 scale 放大。
    // 绕「脚底中心」缩放，位置不变 —— 否则放大后整体飘走。
    const S = o.scale || 1;

    return `<svg viewBox="0 0 ${o.vbw || 320} ${o.vbh || 180}" width="100%" height="100%"
        preserveAspectRatio="xMidYMid slice" style="overflow:visible">
      <defs>${shadow}</defs>
      <g transform="translate(${bx} ${by}) scale(${S}) translate(${-bx} ${-by})">
        <!-- 腿 -->
        <path d="${legPath(-1, p.legL)}" stroke="${ink}" stroke-width="4.2" stroke-linecap="round" fill="none"/>
        <path d="${legPath( 1, p.legR)}" stroke="${ink}" stroke-width="4.2" stroke-linecap="round" fill="none"/>
        <!-- 手臂先画（压在身体后面，只露出外侧那半条） -->
        ${armSvg(-1, p.armL)}
        ${armSvg( 1, p.armR)}
        <!-- 身体（梯形裙摆） -->
        ${cut(`M${bx - 7} ${SHOULDER_Y} L${bx + 7} ${SHOULDER_Y} L${bx + 8.4} ${HIP_Y} L${bx - 8.4} ${HIP_Y} Z`, main)}
        <!-- 脖子 -->
        <rect x="${bx - 2}" y="${NECK_Y - 1}" width="4" height="3.4" fill="${paper}" ${edge}/>
        <!-- 头 -->
        <circle cx="${bx}" cy="${HEAD_CY}" r="${HEAD_R}" fill="${paper}" ${edge} filter="url(#ps)"/>
        <!-- 头发：一撮压在头顶 -->
        ${cut(`M${bx - 9} ${HEAD_CY - 4} q4 -8.6 9.6 -6.4 q5.6 -2.2 8.4 6.4 q-9 -3.2 -18 0 Z`, ink)}
        ${face}
        ${propSvg}
      </g>
    </svg>`;
  }

  // ---------- 画风 C：蜡笔（p5.brush 版）----------
  // 需要在 p5 环境里调用；brush 是全局的 window.brush

  function drawCrayon(p, o) {
    const pose0 = pose(o);
    const brush = global.brush;
    if (!brush) throw new Error("character.js: 蜡笔风需要先加载 p5.brush");
    const C = o.palette || ["#2a2622", "#8a7f6d", "#b8452e", "#e8dcc4", "#d8c9a8"];
    const [ink, mid, main, paper] = C;
    const bx = pose0.x - (o.vbw || 320) / 2;   // p5 WEBGL 原点在中心
    const by = pose0.y - (o.vbh || 180) / 2;

    // 线画 2 遍，每次随机偏移 1~2px —— 蜡笔的「抖」来自这里
    for (let pass = 0; pass < 2; pass++) {
      brush.set("crayon", ink, 1.4 - pass * 0.4);
      brush.noFill();
      brush.beginShape();
      brush.vertex(bx - 9 + p.random(-1.5, 1.5), by + p.random(-1.5, 1.5));
      brush.vertex(bx - 7 + p.random(-1.5, 1.5), by - 22 + p.random(-1.5, 1.5));
      brush.vertex(bx + 7 + p.random(-1.5, 1.5), by - 22 + p.random(-1.5, 1.5));
      brush.vertex(bx + 9 + p.random(-1.5, 1.5), by + p.random(-1.5, 1.5));
      brush.endShape();
    }
    // 头
    brush.noStroke();
    brush.fill(paper, 240);
    brush.circle(bx, by - 36, 22);
    // 身体填色
    brush.fill(main, 235);
    brush.rect(bx - 8, by - 22, 16, 22);

    return pose0;
  }

  // ---------- 三视图 & 表情表（给 03-character 出设定图用）----------

  function sheetSpec() {
    // 交给 composition 排版：3 个朝向 × 6 个表情格子
    const facings = ["front", "right", "back"];
    const expressions = ["neutral", "happy", "shy", "sad", "surprised"];
    const actions = ["idle", "walk", "jump", "hug", "hold"];
    return { facings, expressions, actions };
  }

  global.MVChar = { pose, drawPixel, svgPaper, drawCrayon, sheetSpec, ACTIONS };
})(window);
