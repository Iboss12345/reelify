// Turns uploaded media + a template into a timed edit, and draws/records it frame by frame.
window.Renderer = (function () {
  const W = 720, H = 1280, FPS = 30;
  const FONT = '"Montserrat", "Arial Black", Arial, sans-serif';
  const MIN_LEN = 6, MAX_LEN = 40;

  // ---------- planning ----------

  function buildPlan(media, tpl, opts = {}) {
    const items = media.slice();
    // Strongest hook first: open on the most eye-catching item.
    if (opts.aiOrder && tpl.labels !== 'beforeafter' && items.length > 2) {
      let best = 0;
      items.forEach((m, i) => { if (m.score > items[best].score) best = i; });
      if (best > 0) items.unshift(items.splice(best, 1)[0]);
    }

    const spb = 60 / tpl.bpm;
    const segs = [];
    let t = 0;
    const canLoop = !tpl.labels && items.length > 2;
    for (let i = 0; i < items.length || (canLoop && t < MIN_LEN); i++) {
      if (t >= MAX_LEN) break;
      const m = items[i % items.length];
      const first = i === 0;
      const beats = first && tpl.introBeats ? tpl.introBeats : m.type === 'video' ? tpl.videoBeats : tpl.beats;
      const dur = beats * spb;
      let offset = 0;
      if (m.type === 'video' && m.duration > dur + 0.3) offset = Math.min(m.duration * 0.15, m.duration - dur - 0.1);
      segs.push({
        m, start: t, dur, idx: i, offset, seed: Math.random(),
        effect: first && tpl.introEffect ? tpl.introEffect : tpl.effect,
      });
      t += dur;
    }
    // Too short and can't loop (e.g. 1–2 items): stretch the last shot to whole beats.
    if (t < MIN_LEN && segs.length) {
      const extra = Math.ceil((MIN_LEN - t) / spb) * spb;
      segs[segs.length - 1].dur += extra;
      t += extra;
    }

    return {
      tpl, segs, spb, total: t, count: items.length,
      introBeats: tpl.introBeats || 0,
      hook: (opts.hook || tpl.hook || '').replace('{n}', items.length),
      outro: opts.outro != null ? opts.outro : tpl.outro,
    };
  }

  // ---------- drawing helpers ----------

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

  function motion(seg, lt, t, spb) {
    const p = Math.min(1, lt / seg.dur);
    const dir = seg.seed > 0.5 ? 1 : -1;
    switch (seg.effect) {
      case 'kenburns': return { s: 1.04 + 0.1 * p, x: dir * 28 * p, y: 0, r: 0 };
      case 'zoomout': return { s: 1.16 - 0.14 * p, x: 0, y: 0, r: 0 };
      case 'punch': return { s: 1 + 0.18 * Math.exp(-lt * 9) + 0.04 * p, x: 0, y: 0, r: 0 };
      case 'shake': {
        const bt = t % spb, a = 22 * Math.exp(-bt * 12);
        return { s: 1.08 + 0.1 * Math.exp(-bt * 10), x: a * Math.sin(t * 93), y: a * Math.cos(t * 71), r: a * 0.0015 * Math.sin(t * 50) };
      }
      default: return { s: 1, x: 0, y: 0, r: 0 };
    }
  }

  function drawSegment(c, seg, lt, t, plan) {
    const tpl = plan.tpl, m = seg.m, mo = motion(seg, lt, t, plan.spb);
    const grade = tpl.grade || '';
    const [sw, sh] = dims(m);
    c.save();
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);

    if (tpl.layout === 'polaroid') {
      c.filter = `blur(28px) brightness(0.55) ${grade}`;
      drawFit(c, m, -60, -60, W + 120, H + 120, true);
      c.filter = 'none';
      const cw = W * 0.8, pad = 20, innerW = cw - pad * 2;
      const innerH = Math.min(innerW * (sh / (sw || 1)), H * 0.55);
      const ch = innerH + pad + 110;
      c.translate(W / 2 + mo.x, H / 2 + mo.y);
      c.rotate((seg.seed - 0.5) * 0.14 + mo.r);
      c.scale(mo.s, mo.s);
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 40; c.shadowOffsetY = 12;
      c.fillStyle = '#fbfaf6';
      c.fillRect(-cw / 2, -ch / 2, cw, ch);
      c.shadowColor = 'transparent';
      c.beginPath();
      c.rect(-innerW / 2, -ch / 2 + pad, innerW, innerH);
      c.clip();
      c.filter = grade || 'none';
      drawFit(c, m, -innerW / 2, -ch / 2 + pad, innerW, innerH, true);
    } else {
      c.translate(W / 2 + mo.x, H / 2 + mo.y);
      c.rotate(mo.r);
      c.scale(mo.s, mo.s);
      c.translate(-W / 2, -H / 2);
      if (sw > sh * 1.1) {
        // Landscape media: blurred fill behind, whole shot in front.
        c.filter = `blur(30px) brightness(0.5) ${grade}`;
        drawFit(c, m, -80, -80, W + 160, H + 160, true);
        c.filter = grade || 'none';
        drawFit(c, m, 0, 0, W, H, false);
      } else {
        c.filter = grade || 'none';
        drawFit(c, m, 0, 0, W, H, true);
      }
    }
    c.restore();
  }

  const ease = (q) => (q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2);
  function popIn(dt) {
    if (dt < 0) return 0;
    const x = Math.min(1, dt / 0.28) - 1, c1 = 1.70158;
    return 1 + (c1 + 1) * x * x * x + c1 * x * x;
  }
  function zoomAt(ctx, s) { ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); }

  const TEXT = {
    outline: { weight: 800, size: 60, stroke: 12 },
    box: { weight: 700, size: 44, box: true, lh: 1.45 },
    big: { weight: 900, size: 74, stroke: 14, upper: true },
    cinema: { weight: 600, size: 42, family: 'Georgia, "Times New Roman", serif', shadow: 18, upper: true, spacing: '6px' },
    minimal: { weight: 500, size: 42, shadow: 16, lower: true },
  };

  function wrap(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawText(ctx, text, y, styleName, scale = 1, size) {
    if (!text || scale <= 0) return;
    const st = TEXT[styleName] || TEXT.outline;
    const px = size || st.size;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(scale, scale);
    ctx.font = `${st.weight} ${px}px ${st.family || FONT}`;
    if (st.spacing && 'letterSpacing' in ctx) ctx.letterSpacing = st.spacing;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const txt = st.upper ? text.toUpperCase() : st.lower ? text.toLowerCase() : text;
    const lines = wrap(ctx, txt, W * 0.82);
    const lh = px * (st.lh || 1.2);
    const top = (-(lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => {
      const ly = top + i * lh;
      if (st.box) {
        const w = ctx.measureText(ln).width + 36;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-w / 2, ly - lh / 2, w, lh, 14); else ctx.rect(-w / 2, ly - lh / 2, w, lh);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.fillText(ln, 0, ly + 2);
      } else {
        if (st.stroke) {
          ctx.lineWidth = st.stroke; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
          ctx.strokeText(ln, 0, ly);
        }
        if (st.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = st.shadow; }
        ctx.fillStyle = '#fff';
        ctx.fillText(ln, 0, ly);
        ctx.shadowBlur = 0;
      }
    });
    ctx.restore();
  }

  function segIndexAt(plan, t) {
    const k = plan.segs.findIndex((s) => t < s.start + s.dur);
    return k < 0 ? plan.segs.length - 1 : k;
  }

  function renderFrame(p, plan, t) {
    const ctx = p.ctx, A = p.A, B = p.B, tpl = plan.tpl, segs = plan.segs;
    t = Math.max(0, Math.min(t, plan.total - 0.001));
    const k = segIndexAt(plan, t), seg = segs[k], lt = t - seg.start;
    const tr = tpl.transition, tt = Math.min(0.32, seg.dur * 0.45);

    drawSegment(A.ctx, seg, lt, t, plan);
    ctx.save();
    if (k > 0 && lt < tt && ['fade', 'zoom', 'whip', 'blur'].includes(tr)) {
      const prev = segs[k - 1];
      drawSegment(B.ctx, prev, t - prev.start, t, plan);
      const q = ease(lt / tt);
      if (tr === 'fade') {
        ctx.drawImage(B.canvas, 0, 0);
        ctx.globalAlpha = q; ctx.drawImage(A.canvas, 0, 0);
      } else if (tr === 'zoom') {
        ctx.save(); zoomAt(ctx, 1 + 0.5 * q); ctx.drawImage(B.canvas, 0, 0); ctx.restore();
        zoomAt(ctx, 1.4 - 0.4 * q); ctx.globalAlpha = q; ctx.drawImage(A.canvas, 0, 0);
      } else if (tr === 'whip') {
        ctx.filter = `blur(${(18 * Math.sin(Math.PI * q)).toFixed(1)}px)`;
        ctx.drawImage(B.canvas, -W * q, 0);
        ctx.drawImage(A.canvas, W * (1 - q), 0);
      } else {
        ctx.filter = `blur(${(16 * q).toFixed(1)}px)`; ctx.drawImage(B.canvas, 0, 0);
        ctx.filter = `blur(${(16 * (1 - q)).toFixed(1)}px)`; ctx.globalAlpha = q; ctx.drawImage(A.canvas, 0, 0);
      }
    } else {
      ctx.drawImage(A.canvas, 0, 0);
    }
    ctx.restore();

    if (tr === 'flash' && k > 0 && lt < 0.18) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - lt / 0.18)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Overlay effects
    if (tpl.fx === 'vignette') {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (tpl.fx === 'glow') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const gx = W * (0.2 + 0.15 * Math.sin(t * 0.7)), gy = H * (0.2 + 0.1 * Math.cos(t * 0.5));
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, H * 0.6);
      g.addColorStop(0, 'rgba(255,170,190,0.35)'); g.addColorStop(1, 'rgba(255,170,190,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } else if (tpl.fx === 'glitch' && (t % plan.spb < 0.1 || Math.random() < 0.04)) {
      B.ctx.drawImage(p.canvas, 0, 0);
      for (let i = 0; i < 7; i++) {
        const y = Math.random() * H, h = 10 + Math.random() * 70, dx = (Math.random() - 0.5) * 80;
        ctx.drawImage(B.canvas, 0, y, W, h, dx, y, W, h);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,0,90,0.12)' : 'rgba(0,255,230,0.12)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (tpl.layout === 'letterbox') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H * 0.11);
      ctx.fillRect(0, H * 0.89, W, H * 0.11);
    }

    // Text
    const style = tpl.textStyle;
    if (tpl.hookMode !== 'none' && plan.hook) {
      const hookEnd = tpl.hookMode === 'always' ? Infinity : plan.introBeats ? segs[0].dur : Math.min(2.6, plan.total * 0.5);
      if (t < hookEnd) drawText(ctx, plan.hook, tpl.layout === 'polaroid' ? H * 0.09 : H * 0.2, style, popIn(t));
    }
    if (tpl.labels === 'countdown') {
      drawText(ctx, '#' + (plan.count - (seg.idx % plan.count)), H * 0.74, 'big', popIn(lt), 150);
    } else if (tpl.labels === 'beforeafter') {
      drawText(ctx, seg.idx === 0 ? 'before' : 'after', H * 0.78, 'big', popIn(lt), 90);
    }
    if (plan.outro && t > plan.total - 2) drawText(ctx, plan.outro, H * 0.5, 'outline', popIn(t - (plan.total - 2)));
  }

  // ---------- playback / recording ----------

  function pickMime() {
    const types = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4',
      'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
    ];
    return types.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  function layer() {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    return { canvas, ctx: canvas.getContext('2d') };
  }

  class Player {
    constructor(canvas) {
      this.canvas = canvas;
      canvas.width = W; canvas.height = H;
      this.ctx = canvas.getContext('2d');
      this.A = layer(); this.B = layer();
      this.plan = null; this.running = false;
    }

    load(plan) {
      this.stop();
      this.plan = plan;
      this.prime();
      this.draw(0);
    }

    prime() {
      this.activeK = -1;
      this.plan.segs.forEach((s) => { if (s.m.type === 'video') s.m.el.pause(); });
      const first = this.plan.segs[0];
      if (first && first.m.type === 'video') first.m.el.currentTime = first.offset;
    }

    draw(t) { if (this.plan) renderFrame(this, this.plan, t); }

    // Starts the clip for the current shot and pre-seeks the next one.
    syncVideos(t) {
      const segs = this.plan.segs, k = segIndexAt(this.plan, t);
      if (k === this.activeK) return;
      this.activeK = k;
      const seg = segs[k], prev = segs[k - 1], next = segs[k + 1];
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
        recorder = new MediaRecorder(stream, { mimeType: pickMime(), videoBitsPerSecond: 6000000 });
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
          plan.segs.forEach((s) => { if (s.m.type === 'video') s.m.el.pause(); });
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
