// Turns uploaded media + a template into a timed, beat-synced edit and draws/records it.
//
// Each frame: every shot on screen is drawn once into a "layer", then a virtual camera
// (zoom / pan / spin / whip) moves the layers. Fast camera moves are sampled several times
// and averaged, which gives real motion blur. Grading, light leaks, RGB split, grain and
// text go on top.
window.Renderer = (function () {
  const W = 720, H = 1280, FPS = 30;
  const FONT = '"Montserrat", "Arial Black", Arial, sans-serif';
  const MIN_LEN = 6, MAX_LEN = 60;
  const SHUTTER = 1 / 40;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeIn3 = (x) => x * x * x;
  const easeOut3 = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (q) => (q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { canvas: c, ctx: c.getContext('2d') };
  }

  // ---------- planning ----------

  // opts: aiOrder, shuffle (remix), lengthSec (total video length), shotSec (time per photo),
  //       hook, outro
  // A "story" template (custom edit) keeps the shot order and uses each item's own m.shot
  // { sec, move, trans, grade, drop } as planned by the AI.
  function buildPlan(media, tpl, opts = {}) {
    const items = media.slice();
    const story = !!tpl.story;
    if (opts.shuffle && !story && tpl.labels !== 'beforeafter') {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
    }
    // Strongest hook first: open on the most eye-catching item.
    if (opts.aiOrder && !story && tpl.labels !== 'beforeafter' && items.length > 2) {
      let best = 0;
      items.forEach((m, i) => { if (m.score > items[best].score) best = i; });
      if (best > 0) items.unshift(items.splice(best, 1)[0]);
    }

    const spb = 60 / tpl.bpm;
    const intro = tpl.introBeats || 0;
    const target = opts.lengthSec || null;
    const canLoop = !story && (target ? !tpl.labels : !tpl.labels && items.length > 2) && items.length > 0;
    // Shot lengths stay on a half-beat grid so cuts still land on the music.
    const toBeats = (sec) => Math.max(0.5, Math.round((sec / spb) * 2) / 2);
    let shotBeats = opts.shotSec ? toBeats(opts.shotSec) : null;
    // Story: each shot's own length (or the chosen per-photo time), stretched to fit the chosen length.
    const storySec = (m) => opts.shotSec || (m.shot && m.shot.sec) || tpl.beats * spb;
    const storyScale = story && target ? target / items.reduce((a, m) => a + storySec(m), 0) : 1;
    const shotOf = (m) => (story && m.shot) || {};
    if (target && !story && (!shotBeats || !canLoop)) {
      const n = Math.max(1, items.length - (intro ? 1 : 0));
      shotBeats = toBeats(Math.max(spb, target - intro * spb) / n);
    }
    const minLen = target || MIN_LEN, maxLen = target || MAX_LEN;

    const segs = [];
    let t = 0, lastTrans = null;
    for (let i = 0; i < items.length || (canLoop && t < minLen); i++) {
      if (t >= maxLen - 0.05) break;
      const m = items[i % items.length];
      const first = i === 0;
      const shot = shotOf(m);
      const beats = story ? toBeats(storySec(m) * storyScale)
        : first && intro ? intro : shotBeats || (m.type === 'video' ? tpl.videoBeats : tpl.beats);
      const dur = beats * spb;
      let offset = 0;
      if (m.type === 'video' && m.duration > dur + 0.3) offset = Math.min(m.duration * 0.15, m.duration - dur - 0.1);

      let trans = null;
      if (!first) {
        if (shot.drop && tpl.dropTransition) trans = tpl.dropTransition;
        else if (shot.trans && tpl.followShots) trans = shot.trans;
        else if (i === 1 && tpl.introBeats && tpl.dropTransition) trans = tpl.dropTransition;
        else trans = pick(tpl.transitions.filter((x) => x !== lastTrans).concat(tpl.transitions.length === 1 ? tpl.transitions : []));
        lastTrans = trans;
      }
      segs.push({
        m, start: t, dur, idx: i, offset, seed: Math.random(), trans,
        move: shot.move && tpl.followShots ? shot.move : first && tpl.introMove ? tpl.introMove : pick(tpl.moves),
        depth: tpl.depth === 'all' || (tpl.depth === 'intro' && first),
        grade: shot.grade || (tpl.labels === 'beforeafter' && first ? 'grayscale(0.75) brightness(0.9) contrast(0.95)' : tpl.grade),
        drop: !first && !!shot.drop,
      });
      t += dur;
    }
    if (target && segs.length) {
      // Hit the chosen length exactly: drop slivers, then stretch or trim the last shot.
      while (segs.length > 1 && segs[segs.length - 1].dur + (target - t) < 0.3) t -= segs.pop().dur;
      segs[segs.length - 1].dur += target - t;
      t = target;
    } else if (t < MIN_LEN && segs.length) {
      // Too short and can't loop (e.g. 1–2 items): stretch the last shot to whole beats.
      const extra = Math.ceil((MIN_LEN - t) / spb) * spb;
      segs[segs.length - 1].dur += extra;
      t += extra;
    }

    // Story beat drop: the music builds up and hits on the shot the AI marked (e.g. the reveal).
    const dropSeg = segs.find((s) => s.drop);
    return {
      tpl, segs, spb, total: t, count: items.length,
      introBeats: dropSeg ? dropSeg.start / spb : tpl.introBeats || 0,
      dropTime: dropSeg ? dropSeg.start : tpl.introBeats && segs.length > 1 ? segs[1].start : null,
      hook: (opts.hook || tpl.hook || '').replace('{n}', items.length),
      outro: opts.outro != null ? opts.outro : tpl.outro,
    };
  }

  function segIndexAt(plan, t) {
    const k = plan.segs.findIndex((s) => t < s.start + s.dur);
    return k < 0 ? plan.segs.length - 1 : k;
  }

  // ---------- drawing a shot's content ----------

  function dims(m) {
    return m.type === 'video' ? [m.el.videoWidth, m.el.videoHeight] : [m.el.naturalWidth, m.el.naturalHeight];
  }

  function drawFit(ctx, m, x, y, w, h, cover) {
    const [sw, sh] = dims(m);
    if (!sw || !sh) return;
    const s = cover ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    const dw = sw * s, dh = sh * s;
    ctx.drawImage(m.el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  // Cheap, smooth blur: shrink to a tiny canvas and scale back up.
  const tiny = canvas(36, 64), mid = canvas(144, 256);
  function softBlur(draw) {
    tiny.ctx.fillStyle = '#000';
    tiny.ctx.fillRect(0, 0, 36, 64);
    draw(tiny.ctx, 36, 64);
    mid.ctx.imageSmoothingQuality = 'high';
    mid.ctx.drawImage(tiny.canvas, 0, 0, 144, 256);
    return mid.canvas;
  }
  function blurredBackdrop(c, m, grade, dim, alpha = 1) {
    const img = softBlur((tc, w, h) => { tc.filter = grade || 'none'; drawFit(tc, m, 0, 0, w, h, true); tc.filter = 'none'; });
    c.save();
    c.globalAlpha = alpha;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, -30, -30, W + 60, H + 60);
    if (dim) { c.fillStyle = `rgba(0,0,0,${dim})`; c.fillRect(0, 0, W, H); }
    c.restore();
  }

  const fg = canvas(W, H);
  function drawContent(c, seg, lt, plan) {
    const tpl = plan.tpl, m = seg.m, grade = seg.grade || 'none';
    const [sw, sh] = dims(m);
    const p = clamp01(lt / seg.dur), dir = seg.seed > 0.5 ? 1 : -1;
    c.save();
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);

    if (tpl.layout === 'polaroid') {
      blurredBackdrop(c, m, grade, 0.45);
      const cw = W * 0.8, pad = 20, innerW = cw - pad * 2;
      const innerH = Math.min(innerW * (sh / (sw || 1)), H * 0.55);
      const ch = innerH + pad + 110;
      c.translate(W / 2, H / 2);
      c.rotate((seg.seed - 0.5) * 0.14);
      c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
      c.fillStyle = '#fbfaf6';
      c.fillRect(-cw / 2, -ch / 2, cw, ch);
      c.shadowColor = 'transparent';
      c.beginPath();
      c.rect(-innerW / 2, -ch / 2 + pad, innerW, innerH);
      c.clip();
      c.filter = grade;
      drawFit(c, m, -innerW / 2, -ch / 2 + pad, innerW, innerH, true);
    } else if (sw > sh * 1.1 && !m.cover) {
      // Landscape media: blurred fill behind, whole shot in front.
      blurredBackdrop(c, m, grade, 0.3);
      c.filter = grade;
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 30;
      drawFit(c, m, 0, 0, W, H, false);
    } else if (seg.depth) {
      // Fake 3D: soft background drifts one way, sharp centre pops forward the other way.
      c.save();
      const bs = 1.1 + 0.05 * p;
      c.translate(W / 2 - dir * 22 * p, H / 2); c.scale(bs, bs); c.translate(-W / 2, -H / 2);
      c.filter = grade;
      drawFit(c, m, 0, 0, W, H, true);
      c.filter = 'none';
      c.restore();
      blurredBackdrop(c, m, grade, 0.12, 0.8);

      const f = fg.ctx;
      f.save();
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, W, H);
      const fs = 1.12 + 0.12 * easeOut3(p);
      f.translate(W / 2 + dir * 22 * p, H / 2); f.scale(fs, fs); f.translate(-W / 2, -H / 2);
      f.filter = grade;
      drawFit(f, m, 0, 0, W, H, true);
      f.restore();
      f.save();
      f.globalCompositeOperation = 'destination-in';
      f.translate(W / 2, H * 0.47); f.scale(1, 1.55);
      const g = f.createRadialGradient(0, 0, W * 0.18, 0, 0, W * 0.5);
      g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = g;
      f.fillRect(-W, -H, W * 2, H * 2);
      f.restore();
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 40;
      c.drawImage(fg.canvas, 0, 0);
    } else {
      c.filter = grade;
      drawFit(c, m, 0, 0, W, H, true);
    }
    c.restore();
  }

  // ---------- virtual camera ----------

  function moveT(seg, p, lt) {
    const dir = seg.seed > 0.5 ? 1 : -1;
    switch (seg.move) {
      case 'drift': return { s: 1.06 + 0.1 * p, x: dir * 24 * p, y: 0, r: 0 };
      case 'pullback': return { s: 1.22 - 0.14 * easeOut3(p), x: 0, y: 0, r: 0 };
      case 'pan': return { s: 1.18, x: dir * (100 * p - 50), y: 0, r: 0 };
      case 'rise': return { s: 1.16, x: 0, y: 45 - 90 * p, r: 0 };
      case 'tilt': return { s: 1.12 + 0.05 * p, x: 0, y: 0, r: dir * (0.045 * p - 0.02) };
      // Speed ramp: slow creep, then a hard acceleration into the cut.
      case 'velocity': return { s: p < 0.6 ? 1.05 + 0.05 * (p / 0.6) : 1.1 + 0.55 * easeIn3((p - 0.6) / 0.4), x: 0, y: 0, r: 0 };
      case 'punch': return { s: 1.06 + 0.16 * Math.exp(-lt * 8) + 0.03 * p, x: 0, y: 0, r: 0 };
      default: return { s: 1.04, x: 0, y: 0, r: 0 };
    }
  }

  const transDur = (seg) => Math.min(0.24, seg.dur * 0.35);

  function applyEnter(T, type, q) {
    const r = 1 - q, r3 = r * r * r;
    switch (type) {
      case 'zoom': T.s *= 1 + 0.9 * r3; break;
      case 'spin': T.r -= 0.85 * r3; T.s *= 1 + 0.45 * r3; break;
      case 'whip': T.x += W * r3; T.tileX = true; break;
      case 'whipUp': T.y += H * 0.9 * r3; T.tileY = true; break;
      case 'flash': case 'flare': T.s *= 1 + 0.12 * r * r; break;
      case 'shake': { const a = 45 * r * r; T.x += a * Math.sin(q * 60); T.y += a * Math.cos(q * 47); T.s *= 1 + 0.12 * r; break; }
      default: break;
    }
  }

  function applyExit(T, type, e) {
    const e3 = e * e * e;
    switch (type) {
      case 'zoom': T.s *= 1 + 1.2 * e3; break;
      case 'spin': T.r += 0.85 * e3; T.s *= 1 + 0.45 * e3; break;
      case 'whip': T.x -= W * e3; T.tileX = true; break;
      case 'whipUp': T.y -= H * 0.9 * e3; T.tileY = true; break;
      case 'flash': case 'shake': T.s *= 1 + 0.06 * e3; break;
      default: break;
    }
  }

  function shotT(plan, k, t) {
    const seg = plan.segs[k], tpl = plan.tpl, lt = t - seg.start;
    const T = Object.assign({ tileX: false, tileY: false }, moveT(seg, clamp01(lt / seg.dur), Math.max(0, lt)));

    const pulse = tpl.pulse;
    const pulseFrom = pulse && pulse.fromDrop && plan.dropTime != null ? plan.dropTime : 0;
    if (pulse && t >= pulseFrom) {
      const bt = (t - pulseFrom) % (plan.spb * (pulse.every || 1));
      T.s *= 1 + pulse.amp * Math.exp(-bt * 14);
      if (pulse.shake) {
        const a = pulse.shake * Math.exp(-bt * 10);
        T.x += a * Math.sin(t * 97); T.y += a * Math.cos(t * 73);
      }
    }
    if (plan.dropTime != null) {
      const dt = t - plan.dropTime;
      if (dt >= 0 && dt < 0.7) {
        const a = 34 * Math.exp(-dt * 6);
        T.x += a * Math.sin(t * 91); T.y += a * Math.cos(t * 67);
      }
    }

    const d = transDur(seg);
    if (k > 0 && seg.trans && lt >= 0 && lt < d) applyEnter(T, seg.trans, lt / d);
    const next = plan.segs[k + 1];
    if (next && next.trans && lt > seg.dur - d) applyExit(T, next.trans, clamp01((lt - (seg.dur - d)) / d));
    return T;
  }

  function cameraOps(plan, t) {
    const k = segIndexAt(plan, t), seg = plan.segs[k], lt = t - seg.start;
    const fadeD = Math.min(0.5, seg.dur * 0.5);
    if (k > 0 && seg.trans === 'dissolve' && lt < fadeD) {
      return [{ k: k - 1, T: shotT(plan, k - 1, t), a: 1 }, { k, T: shotT(plan, k, t), a: easeInOut(lt / fadeD) }];
    }
    return [{ k, T: shotT(plan, k, t), a: 1 }];
  }

  function drawOps(ctx, ops, layers) {
    for (const op of ops) {
      const L = layers.get(op.k);
      if (!L) continue;
      const T = op.T;
      ctx.save();
      ctx.globalAlpha = op.a;
      ctx.translate(W / 2 + T.x, H / 2 + T.y);
      ctx.rotate(T.r);
      ctx.scale(T.s, T.s);
      ctx.translate(-W / 2, -H / 2);
      ctx.drawImage(L, 0, 0);
      // Mirrored copies so whip pans never show black edges.
      if (T.tileX) {
        ctx.save(); ctx.scale(-1, 1); ctx.drawImage(L, 0, 0); ctx.restore();
        ctx.save(); ctx.translate(2 * W, 0); ctx.scale(-1, 1); ctx.drawImage(L, 0, 0); ctx.restore();
      }
      if (T.tileY) {
        ctx.save(); ctx.scale(1, -1); ctx.drawImage(L, 0, 0); ctx.restore();
        ctx.save(); ctx.translate(0, 2 * H); ctx.scale(1, -1); ctx.drawImage(L, 0, 0); ctx.restore();
      }
      ctx.restore();
    }
  }

  // True when the bottom shot fills the whole frame, so no backdrop is needed.
  function covers(ops) {
    const { T, a } = ops[0];
    if (a < 1) return false;
    if (T.tileX || T.tileY) return !T.r && T.s >= 1;
    return !T.r && T.s >= 1 && Math.abs(T.x) <= ((T.s - 1) * W) / 2 && Math.abs(T.y) <= ((T.s - 1) * H) / 2;
  }

  function speedOf(a, b) {
    return Math.abs(a.s - b.s) * H * 0.6 + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.r - b.r) * H * 0.6;
  }

  // ---------- overlays ----------

  const grain = (() => {
    const g = canvas(160, 160);
    const img = g.ctx.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.ctx.putImageData(img, 0, 0);
    return g.canvas;
  })();

  function tone(ctx, kind) {
    if (!kind) return;
    ctx.save();
    if (kind === 'tealorange') {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = 'rgba(0,150,170,0.35)'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'overlay';
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,150,60,0.18)'); g.addColorStop(1, 'rgba(255,120,40,0.08)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = kind === 'warm' ? 'rgba(255,150,70,0.35)' : 'rgba(70,120,255,0.3)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function lightLeak(ctx, t, strength) {
    if (strength <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const x = W * (0.5 + 0.6 * Math.sin(t * 1.7)), y = H * (0.3 + 0.3 * Math.cos(t * 1.1));
    const g = ctx.createRadialGradient(x, y, 0, x, y, H * 0.7);
    g.addColorStop(0, `rgba(255,190,120,${0.9 * strength})`);
    g.addColorStop(0.4, `rgba(255,80,40,${0.45 * strength})`);
    g.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---------- text ----------

  const TEXT = {
    outline: { weight: 800, size: 60, stroke: 12, hi: '#ffe14d', autoHi: true },
    box: { weight: 700, size: 44, box: true, lh: 1.45, hi: '#ff2d6f' },
    big: { weight: 900, size: 74, stroke: 14, upper: true, hi: '#ffe14d', autoHi: true },
    cinema: { weight: 600, size: 42, family: 'Georgia, "Times New Roman", serif', shadow: 18, upper: true, spacing: '6px' },
    minimal: { weight: 500, size: 42, shadow: 16, lower: true },
  };

  // *word* or *several words* get the highlight colour.
  function parseWords(text, st) {
    let inHi = false;
    const words = text.split(/\s+/).filter(Boolean).map((raw) => {
      if (raw.startsWith('*')) inHi = true;
      const hi = inHi;
      if (raw.endsWith('*')) inHi = false;
      let w = raw.replace(/\*/g, '');
      if (st.upper) w = w.toUpperCase();
      if (st.lower) w = w.toLowerCase();
      return { t: w, hi };
    }).filter((w) => w.t);
    if (st.autoHi && words.length > 2 && !words.some((w) => w.hi)) words[words.length - 1].hi = true;
    return words;
  }

  function popIn(dt) {
    if (dt <= 0) return 0;
    const x = Math.min(1, dt / 0.26) - 1, c1 = 1.70158;
    return 1 + (c1 + 1) * x * x * x + c1 * x * x;
  }

  // anim: 'pop' (all at once), 'words' (word-by-word), 'fade'
  function drawText(ctx, text, y, styleName, age, anim = 'pop', size) {
    if (!text || age <= 0) return;
    const st = TEXT[styleName] || TEXT.outline;
    const px = size || st.size;
    ctx.save();
    ctx.font = `${st.weight} ${px}px ${st.family || FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = st.spacing || '0px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const words = parseWords(text, st);
    const space = ctx.measureText(' ').width;
    words.forEach((w) => { w.w = ctx.measureText(w.t).width; });
    const lines = [];
    let cur = { words: [], width: 0 };
    for (const w of words) {
      const add = cur.words.length ? space + w.w : w.w;
      if (cur.words.length && cur.width + add > W * 0.84) { lines.push(cur); cur = { words: [], width: 0 }; }
      cur.width += cur.words.length ? space + w.w : w.w;
      cur.words.push(w);
    }
    if (cur.words.length) lines.push(cur);

    const lh = px * (st.lh || 1.18);
    const top = y - ((lines.length - 1) * lh) / 2;
    let wi = 0;
    const fadeA = anim === 'fade' ? clamp01(age / 0.6) : 1;
    lines.forEach((line, li) => {
      const ly = top + li * lh;
      let x = W / 2 - line.width / 2;
      if (st.box) {
        const sc = anim === 'fade' ? 1 : popIn(anim === 'words' ? age - wi * 0.1 : age);
        if (sc > 0) {
          ctx.save();
          ctx.globalAlpha = fadeA;
          ctx.translate(W / 2, ly); ctx.scale(sc, sc);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          const bw = line.width + 36;
          if (ctx.roundRect) ctx.roundRect(-bw / 2, -lh / 2, bw, lh, 14); else ctx.rect(-bw / 2, -lh / 2, bw, lh);
          ctx.fill();
          ctx.restore();
        }
      }
      for (const w of line.words) {
        const sc = anim === 'fade' ? 1 : popIn(anim === 'words' ? age - wi * 0.1 : age);
        wi++;
        if (sc > 0) {
          ctx.save();
          ctx.globalAlpha = fadeA;
          ctx.translate(x + w.w / 2, ly);
          ctx.scale(sc, sc);
          if (st.box) {
            ctx.fillStyle = w.hi ? st.hi : '#111';
            ctx.fillText(w.t, 0, 2);
          } else {
            if (st.stroke) { ctx.lineWidth = st.stroke; ctx.strokeStyle = '#000'; ctx.strokeText(w.t, 0, 0); }
            if (st.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = st.shadow; }
            ctx.fillStyle = w.hi && st.hi ? st.hi : '#fff';
            ctx.fillText(w.t, 0, 0);
          }
          ctx.restore();
        }
        x += w.w + space;
      }
    });
    ctx.restore();
  }

  // ---------- frame ----------

  function renderFrame(P, plan, t) {
    const ctx = P.ctx, tpl = plan.tpl, segs = plan.segs, fx = tpl.fx || [];
    t = Math.max(0, Math.min(t, plan.total - 0.001));
    const k = segIndexAt(plan, t), seg = segs[k], lt = t - seg.start;

    // Draw each shot that can appear this frame into its own layer.
    const layers = new Map();
    let free = 0;
    const ensure = (j) => {
      if (j < 0 || j >= segs.length || layers.has(j) || free >= P.layers.length) return;
      const L = P.layers[free++];
      drawContent(L.ctx, segs[j], Math.max(0, Math.min(t - segs[j].start, segs[j].dur)), plan);
      layers.set(j, L.canvas);
    };

    const ops = cameraOps(plan, t);
    ops.forEach((o) => ensure(o.k));
    const before = shotT(plan, k, t - SHUTTER);
    const speed = speedOf(ops[ops.length - 1].T, before);
    const samples = Math.max(1, Math.min(6, Math.ceil(speed / 10)));

    // Backdrop so spins / zoom-outs never show black.
    P.back.ctx.drawImage(softBlur((tc, w, h) => tc.drawImage(layers.get(k), 0, 0, w, h)), 0, 0);
    const back = P.back.canvas;

    if (samples === 1) {
      if (!covers(ops)) ctx.drawImage(back, 0, 0, W, H);
      drawOps(ctx, ops, layers);
    } else {
      // Motion blur: average several camera positions across the shutter.
      const acc = P.acc.ctx;
      for (let i = 0; i < samples; i++) {
        const ts = t - (SHUTTER * i) / (samples - 1);
        const sOps = cameraOps(plan, Math.max(0, ts));
        sOps.forEach((o) => ensure(o.k));
        acc.globalAlpha = 1;
        if (!covers(sOps)) acc.drawImage(back, 0, 0, W, H);
        drawOps(acc, sOps, layers);
        ctx.globalAlpha = 1 / (i + 1);
        ctx.drawImage(P.acc.canvas, 0, 0);
      }
      ctx.globalAlpha = 1;
    }

    tone(ctx, tpl.tone);

    if (fx.includes('bloom')) {
      const b = softBlur((tc, w, h) => tc.drawImage(P.canvas, 0, 0, w, h));
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.28;
      ctx.drawImage(b, 0, 0, W, H);
      ctx.restore();
    }
    if (fx.includes('glow')) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const gx = W * (0.2 + 0.15 * Math.sin(t * 0.7)), gy = H * (0.2 + 0.1 * Math.cos(t * 0.5));
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, H * 0.6);
      g.addColorStop(0, 'rgba(255,170,190,0.32)'); g.addColorStop(1, 'rgba(255,170,190,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Transition overlays (light leak / flash / glitch) around each cut.
    const next = segs[k + 1], d = transDur(seg);
    const nearIn = k > 0 && lt < d ? 1 - lt / d : 0;
    const nearOut = next && lt > seg.dur - d ? (lt - (seg.dur - d)) / d : 0;
    const inT = seg.trans, outT = next && next.trans;
    let leak = 0;
    if (inT === 'flare') leak = Math.max(leak, nearIn);
    if (outT === 'flare') leak = Math.max(leak, nearOut);
    lightLeak(ctx, t, leak);

    if (fx.includes('vignette')) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    let flash = 0;
    if (inT === 'flash') flash = Math.max(flash, nearIn * nearIn * 0.95);
    if (plan.dropTime != null && t >= plan.dropTime && t - plan.dropTime < 0.3) flash = Math.max(flash, 1 - (t - plan.dropTime) / 0.3);
    if (flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }

    let rgb = 0;
    const beatT = t % plan.spb;
    if (fx.includes('rgb')) rgb = 12 * Math.exp(-beatT * 12);
    if (fx.includes('rgbMotion')) rgb = Math.max(rgb, Math.min(16, speed * 0.12));
    const glitchNow = (inT === 'glitch' && nearIn > 0) || (outT === 'glitch' && nearOut > 0.5) ||
      (fx.includes('glitch') && (beatT < 0.09 || Math.random() < 0.03));
    if (glitchNow) rgb = Math.max(rgb, 14);
    if (rgb >= 2) rgbSplit(P, Math.round(rgb));
    if (glitchNow) glitchSlices(P);

    if (fx.includes('grain')) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.09;
      ctx.translate(-Math.random() * 160, -Math.random() * 160);
      ctx.fillStyle = P.grainPattern;
      ctx.fillRect(0, 0, W + 160, H + 160);
      ctx.restore();
    }

    if (tpl.layout === 'letterbox') {
      const bar = H * 0.11 + H * 0.39 * (1 - easeOut3(clamp01(t / 1.1)));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
    }

    // Text
    const style = tpl.textStyle;
    if (tpl.hookMode !== 'none' && plan.hook) {
      const hookEnd = tpl.hookMode === 'always' ? Infinity : plan.introBeats ? segs[0].dur : Math.min(2.8, plan.total * 0.5);
      const start = tpl.layout === 'letterbox' ? 0.6 : 0.05;
      if (t < hookEnd) drawText(ctx, plan.hook, tpl.layout === 'polaroid' ? H * 0.09 : H * 0.2, style, t - start, tpl.hookAnim);
    }
    if (seg.m.caption) {
      // Story caption for this shot (from "Just describe it").
      drawText(ctx, seg.m.caption, H * 0.78, style === 'cinema' || style === 'minimal' ? style : 'box', lt - 0.05, 'words');
    } else if (tpl.labels === 'countdown') {
      drawText(ctx, '#' + (plan.count - (seg.idx % plan.count)), H * 0.74, 'big', lt, 'pop', 150);
    } else if (tpl.labels === 'beforeafter') {
      drawText(ctx, seg.idx === 0 ? 'before' : 'after', H * 0.78, 'big', lt, 'pop', 90);
    }
    if (plan.outro && t > plan.total - 2.2) drawText(ctx, plan.outro, H * 0.5, 'outline', t - (plan.total - 2.2), 'words');
  }

  // Splits the frame into red / green / blue and offsets them.
  function rgbSplit(P, amt) {
    const ctx = P.ctx, tmp = P.tmp, ch = P.ch;
    tmp.ctx.drawImage(P.canvas, 0, 0);
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    [['#f00', -amt], ['#0f0', 0], ['#00f', amt]].forEach(([color, dx]) => {
      ch.ctx.globalCompositeOperation = 'copy';
      ch.ctx.drawImage(tmp.canvas, 0, 0);
      ch.ctx.globalCompositeOperation = 'multiply';
      ch.ctx.fillStyle = color;
      ch.ctx.fillRect(0, 0, W, H);
      ctx.drawImage(ch.canvas, dx, 0);
    });
    ctx.restore();
  }

  function glitchSlices(P) {
    const ctx = P.ctx;
    P.tmp.ctx.drawImage(P.canvas, 0, 0);
    for (let i = 0; i < 8; i++) {
      const y = Math.random() * H, h = 8 + Math.random() * 70, dx = (Math.random() - 0.5) * 90;
      ctx.drawImage(P.tmp.canvas, 0, y, W, h, dx, y, W, h);
    }
  }

  // ---------- playback / recording ----------

  function pickMime() {
    const types = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4',
      'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
    ];
    return types.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  class Player {
    constructor(el) {
      this.canvas = el;
      el.width = W; el.height = H;
      this.ctx = el.getContext('2d');
      this.layers = [canvas(W, H), canvas(W, H), canvas(W, H)];
      this.acc = canvas(W, H);
      this.tmp = canvas(W, H);
      this.ch = canvas(W, H);
      this.back = canvas(144, 256);
      this.grainPattern = this.ctx.createPattern(grain, 'repeat');
      this.plan = null; this.running = false;
    }

    load(plan) {
      this.stop();
      this.plan = plan;
      this.prime();
      this.draw(0.05);
    }

    prime() {
      this.activeK = -1;
      this.plan.segs.forEach((s) => { if (s.m.type === 'video') { s.m.el.pause(); s.m.el.playbackRate = 1; } });
      const first = this.plan.segs[0];
      if (first && first.m.type === 'video') first.m.el.currentTime = first.offset;
    }

    draw(t) { if (this.plan) renderFrame(this, this.plan, t); }

    // Starts the clip for the current shot, pre-seeks the next one, applies speed ramps.
    syncVideos(t) {
      const plan = this.plan, segs = plan.segs, k = segIndexAt(plan, t), seg = segs[k];
      if (k !== this.activeK) {
        this.activeK = k;
        const prev = segs[k - 1], next = segs[k + 1];
        segs.forEach((s) => {
          if (s.m.type === 'video' && s.m !== seg.m && (!prev || s.m !== prev.m)) s.m.el.pause();
        });
        if (seg.m.type === 'video') {
          const v = seg.m.el;
          if (Math.abs(v.currentTime - seg.offset) > 0.25) v.currentTime = seg.offset;
          v.play().catch(() => {});
        }
        if (next && next.m.type === 'video' && next.m !== seg.m && (!prev || next.m !== prev.m)) {
          next.m.el.currentTime = next.offset;
        }
      }
      if (seg.m.type === 'video' && plan.tpl.clipSpeed) {
        const p = (t - seg.start) / seg.dur;
        const rate = plan.tpl.clipSpeed === 'ramp' ? (p < 0.6 ? 0.35 : 2) : 0.5;
        if (seg.m.el.playbackRate !== rate) seg.m.el.playbackRate = rate;
      }
    }

    async play(opts = {}) {
      this.stop();
      const plan = this.plan;
      const c = Music.getCtx();
      await c.resume();
      const out = c.createGain();
      out.connect(c.destination);
      let streamDest = null;
      if (opts.record) { streamDest = c.createMediaStreamDestination(); out.connect(streamDest); }
      const t0 = c.currentTime + 0.25;
      this.prime();

      let music = null, song = opts.song, songTimer = null;
      if (song) {
        song.el.currentTime = song.offset || 0;
        if (!song.node) song.node = c.createMediaElementSource(song.el);
        song.node.disconnect();
        song.node.connect(out);
        songTimer = setTimeout(() => song.el.play().catch(() => {}), 250);
      } else if (opts.music !== false) {
        music = Music.start(c, out, plan, t0);
      }

      let recorder = null;
      const chunks = [];
      if (opts.record) {
        const stream = this.canvas.captureStream(FPS);
        streamDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
        recorder = new MediaRecorder(stream, { mimeType: pickMime(), videoBitsPerSecond: 8000000 });
        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        recorder.start(250);
      }

      this.running = true;
      return new Promise((resolve) => {
        const end = () => {
          if (!this.running) return;
          this.running = false;
          cancelAnimationFrame(this.raf);
          clearTimeout(songTimer);
          if (music) music.stop();
          if (song) song.el.pause();
          plan.segs.forEach((s) => { if (s.m.type === 'video') { s.m.el.pause(); s.m.el.playbackRate = 1; } });
          const finish = () => { try { out.disconnect(); } catch (e) {} };
          if (recorder) {
            recorder.onstop = () => { finish(); resolve(new Blob(chunks, { type: recorder.mimeType })); };
            recorder.stop();
          } else { finish(); resolve(null); }
        };
        this._end = end;
        const tick = () => {
          if (!this.running) return;
          const t = c.currentTime - t0;
          if (t >= plan.total) { this.draw(plan.total); end(); return; }
          const tc = Math.max(0, t);
          this.syncVideos(tc);
          this.draw(tc);
          if (opts.onProgress) opts.onProgress(tc / plan.total);
          this.raf = requestAnimationFrame(tick);
        };
        tick();
      });
    }

    stop() { if (this.running && this._end) this._end(); }
  }

  return { buildPlan, Player, pickMime };
})();
