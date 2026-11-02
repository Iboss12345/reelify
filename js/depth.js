// Machine learning: a depth-estimation model (Depth Anything V2, runs free in the browser via
// Transformers.js) works out how far away every pixel of a photo is. The photo is then cut into
// depth layers so the renderer can move them at different speeds: a real 3D parallax shot.
window.Depth = (function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1';
  const MODEL = 'onnx-community/depth-anything-v2-small';
  const N_LAYERS = 4, MAX_SIDE = 900;
  let estimator = null;

  async function load(onStatus) {
    if (!estimator) {
      estimator = (async () => {
        const { pipeline } = await import(LIB);
        const gpu = !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
        let lastPct = -1;
        const progress_callback = (p) => {
          if (p.status !== 'progress' || !p.total || p.total < 5e6) return;
          const pct = Math.floor((p.loaded / p.total) * 100);
          if (pct !== lastPct) { lastPct = pct; onStatus(`🧠 Downloading the 3D depth AI (first time only) ${pct}%…`); }
        };
        try {
          return await pipeline('depth-estimation', MODEL, gpu ? { device: 'webgpu', dtype: 'fp16', progress_callback } : { dtype: 'q8', progress_callback });
        } catch (e) {
          return pipeline('depth-estimation', MODEL, { dtype: 'q8', progress_callback });
        }
      })();
      estimator.catch(() => { estimator = null; });
    }
    return estimator;
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Splits the photo into layers, far to near. Layer 0 is the whole picture with the near things
  // smeared out (so moving the foreground never shows a "ghost" of itself behind).
  async function layersFor(m, run, RawImage) {
    const sw = m.el.naturalWidth, sh = m.el.naturalHeight;
    const s = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const w = Math.round(sw * s), h = Math.round(sh * s);
    const src = canvas(w, h);
    src.getContext('2d').drawImage(m.el, 0, 0, w, h);

    const out = await run(RawImage.fromCanvas(src));
    const depth = out.depth || out[0].depth;
    const dc = canvas(w, h), dctx = dc.getContext('2d', { willReadFrequently: true });
    dctx.filter = 'blur(3px)'; // soft layer edges
    dctx.drawImage(depth.toCanvas(), 0, 0, w, h);
    const d = dctx.getImageData(0, 0, w, h).data;

    // Layer cut points at depth quantiles, so every layer has some of the picture.
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
    const cuts = [];
    for (let k = 1, acc = 0, v = 0; k < N_LAYERS; k++) {
      const goal = (w * h * (0.35 + 0.2 * k)); // far layers bigger: 55%, 75%, 95%
      while (v < 255 && acc + hist[v] < goal) acc += hist[v++];
      cuts.push(v);
    }

    const pix = src.getContext('2d').getImageData(0, 0, w, h);
    const layers = [];
    // Background: the picture with the nearest stuff blurred away.
    const bg = canvas(w, h), bctx = bg.getContext('2d');
    bctx.drawImage(src, 0, 0);
    bctx.filter = 'blur(18px)';
    bctx.globalCompositeOperation = 'source-atop';
    bctx.drawImage(src, 0, 0);
    bctx.filter = 'none';
    bctx.globalCompositeOperation = 'source-over';
    const bgPix = bctx.getImageData(0, 0, w, h);
    const sharp = pix.data, soft = bgPix.data, far = cuts[0];
    for (let i = 0; i < sharp.length; i += 4) {
      const a = Math.max(0, Math.min(1, (d[i] - far + 12) / 24)); // 0 = far (keep sharp), 1 = near (blur)
      for (let c = 0; c < 3; c++) soft[i + c] = sharp[i + c] * (1 - a) + soft[i + c] * a;
    }
    bctx.putImageData(bgPix, 0, 0);
    layers.push(bg);

    for (const cut of cuts) {
      const L = canvas(w, h), lctx = L.getContext('2d');
      const img = lctx.createImageData(w, h), o = img.data;
      for (let i = 0; i < o.length; i += 4) {
        o[i] = sharp[i]; o[i + 1] = sharp[i + 1]; o[i + 2] = sharp[i + 2];
        o[i + 3] = 255 * Math.max(0, Math.min(1, (d[i] - cut + 6) / 12));
      }
      lctx.putImageData(img, 0, 0);
      layers.push(L);
    }
    return layers;
  }

  // Adds m.layers to every still photo in the list that doesn't have them yet.
  async function prepare(list, onStatus) {
    const todo = list.filter((m) => m.type === 'image' && !m.layers && !m.noDepth);
    if (!todo.length) return true;
    try {
      onStatus('🧠 Loading the 3D depth AI…');
      const run = await load(onStatus);
      const { RawImage } = await import(LIB);
      for (let i = 0; i < todo.length; i++) {
        onStatus(`🧠 Machine learning: finding depth in photo ${i + 1}/${todo.length}…`);
        try { todo[i].layers = await layersFor(todo[i], run, RawImage); } catch (e) { todo[i].noDepth = true; }
      }
      return true;
    } catch (e) {
      console.warn('Depth AI unavailable', e);
      return false;
    }
  }

  return { prepare };
})();
