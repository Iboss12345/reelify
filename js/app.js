// Page wiring: uploads, style choice, generate, preview and download.
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const MAX_FILES = 30;

  const state = { media: [], mode: 'auto', pickId: TEMPLATES[0].id, song: null, plan: null, busy: false };
  const player = new Renderer.Player($('#stage'));
  const pool = $('#media-pool');

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }

  // ---------- uploads ----------

  // Measures brightness / colourfulness so the AI director can choose a template.
  const probe = document.createElement('canvas');
  probe.width = probe.height = 24;
  const probeCtx = probe.getContext('2d', { willReadFrequently: true });

  function analyse(m) {
    const w = m.type === 'video' ? m.el.videoWidth : m.el.naturalWidth;
    const h = m.type === 'video' ? m.el.videoHeight : m.el.naturalHeight;
    probeCtx.drawImage(m.el, 0, 0, 24, 24);
    const d = probeCtx.getImageData(0, 0, 24, 24).data;
    let bright = 0, sat = 0;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
      bright += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      sat += max ? (max - min) / max : 0;
    }
    const n = d.length / 4;
    m.bright = bright / n;
    m.sat = sat / n;
    m.landscape = w > h * 1.1;
    m.score = m.sat * 0.7 + (1 - Math.abs(m.bright - 0.55)) * 0.3;
    return m;
  }

  function loadMedia(file) {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(analyse({ type: 'image', el: img, url, name: file.name }));
        img.onerror = reject;
        img.src = url;
      });
    }
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onloadeddata = () => {
        v.onloadeddata = null;
        const duration = isFinite(v.duration) ? v.duration : 10;
        resolve(analyse({ type: 'video', el: v, url, name: file.name, duration }));
      };
      v.onerror = reject;
      v.src = url;
      pool.appendChild(v);
    });
  }

  async function addFiles(files) {
    for (const f of files) {
      if (state.media.length >= MAX_FILES) { toast(`Max ${MAX_FILES} files.`); break; }
      if (!/^(image|video)\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) continue;
      try {
        state.media.push(await loadMedia(f));
      } catch (e) {
        toast(/\.(heic|heif)$/i.test(f.name)
          ? `${f.name}: iPhone HEIC photos don't work in this browser. Save them as JPG first.`
          : `Couldn't read ${f.name}.`);
      }
    }
    renderThumbs();
  }

  function removeMedia(i) {
    const [m] = state.media.splice(i, 1);
    if (m.type === 'video') m.el.remove();
    renderThumbs();
  }

  let dragIdx = null;
  function renderThumbs() {
    const ul = $('#thumbs');
    ul.innerHTML = '';
    state.media.forEach((m, i) => {
      const li = document.createElement('li');
      li.draggable = true;
      const vis = document.createElement(m.type === 'video' ? 'video' : 'img');
      vis.src = m.type === 'video' ? `${m.url}#t=0.1` : m.url;
      if (m.type === 'video') vis.muted = true;
      li.appendChild(vis);
      if (m.type === 'video') {
        const b = document.createElement('span');
        b.className = 'badge'; b.textContent = `▶ ${m.duration.toFixed(1)}s`;
        li.appendChild(b);
      }
      const rm = document.createElement('button');
      rm.className = 'rm'; rm.textContent = '×'; rm.title = 'Remove';
      rm.onclick = () => removeMedia(i);
      li.appendChild(rm);
      li.ondragstart = () => { dragIdx = i; li.classList.add('dragging'); };
      li.ondragend = () => { dragIdx = null; li.classList.remove('dragging'); };
      li.ondragover = (e) => e.preventDefault();
      li.ondrop = (e) => {
        e.preventDefault();
        if (dragIdx == null || dragIdx === i) return;
        state.media.splice(i, 0, state.media.splice(dragIdx, 1)[0]);
        dragIdx = null;
        renderThumbs();
      };
      ul.appendChild(li);
    });
    $('#thumbHint').hidden = state.media.length < 2;
    updateButtons();
  }

  const drop = $('#drop');
  $('#files').onchange = (e) => { addFiles(Array.from(e.target.files)); e.target.value = ''; };
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  drop.addEventListener('dragover', () => drop.classList.add('over'));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    drop.classList.remove('over');
    if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
  });

  // ---------- style controls ----------

  $$('.tabs button').forEach((b) => {
    b.onclick = () => {
      state.mode = b.dataset.mode;
      $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $$('.tabpane').forEach((p) => { p.hidden = p.dataset.pane !== state.mode; });
    };
  });

  const grid = $('#tplGrid');
  TEMPLATES.forEach((t) => {
    const b = document.createElement('button');
    b.innerHTML = `<b>${t.emoji} ${t.name}</b><small>${t.desc}</small>`;
    b.classList.toggle('active', t.id === state.pickId);
    b.onclick = () => {
      state.pickId = t.id;
      $$('#tplGrid button').forEach((x) => x.classList.toggle('active', x === b));
    };
    grid.appendChild(b);
  });

  $$('input[name=music]').forEach((r) => {
    r.onchange = () => { $('#songRow').hidden = musicMode() !== 'song'; };
  });
  const musicMode = () => $('input[name=music]:checked').value;

  $('#songFile').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (state.song) state.song.el.pause();
    state.song = { el: new Audio(URL.createObjectURL(f)), offset: 0 };
  };

  function audioOpts() {
    const mode = musicMode();
    if (mode === 'song') {
      if (!state.song) { toast('Choose a song file, or switch music to "AI beat".'); return { music: false }; }
      state.song.offset = parseFloat($('#songOffset').value) || 0;
      return { song: state.song };
    }
    return { music: mode === 'beat' };
  }

  // ---------- generate / preview / export ----------

  function mediaStats() {
    const ms = state.media, n = ms.length;
    return {
      count: n,
      videos: ms.filter((m) => m.type === 'video').length,
      landscape: ms.filter((m) => m.landscape).length,
      bright: ms.reduce((a, m) => a + m.bright, 0) / n,
      sat: ms.reduce((a, m) => a + m.sat, 0) / n,
    };
  }

  async function generate() {
    if (!state.media.length || state.busy) return;
    let res;
    if (state.mode === 'auto') {
      res = Director.autoPick(mediaStats());
    } else if (state.mode === 'describe') {
      const text = $('#describe').value.trim();
      if (!text) { toast('Describe the style you want first.'); return; }
      res = Director.parseStyle(text, mediaStats());
    } else {
      res = { template: Director.clone(Director.byId(state.pickId)), reasons: ['You picked this template.'] };
    }

    const tpl = res.template;
    const hook = $('#hook').value.trim();
    if (hook && tpl.hookMode === 'none') tpl.hookMode = 'intro';
    await Promise.all([500, 700, 800, 900].map((w) => document.fonts.load(`${w} 40px Montserrat`))).catch(() => {});

    state.plan = Renderer.buildPlan(state.media, tpl, {
      aiOrder: state.mode !== 'pick', hook: hook || null, outro: $('#outro').value.trim(),
    });
    player.load(state.plan);
    $('#empty').hidden = true;
    renderNotes(res.reasons);
    updateButtons();
    preview();
  }

  function renderNotes(reasons) {
    const p = state.plan, t = p.tpl;
    const el = $('#notes');
    el.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = `${t.emoji} ${t.name}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${p.segs.length} shots · ${p.total.toFixed(1)}s · ${t.bpm} BPM`;
    const ul = document.createElement('ul');
    reasons.forEach((r) => { const li = document.createElement('li'); li.textContent = r; ul.appendChild(li); });
    if (p.hook && t.hookMode !== 'none') {
      const li = document.createElement('li'); li.textContent = `Hook: "${p.hook}"`; ul.appendChild(li);
    }
    el.append(h, meta, ul);
    el.hidden = false;
  }

  async function preview() {
    if (!state.plan) return;
    if (player.running) { player.stop(); return; }
    $('#play').textContent = '■ Stop';
    await player.play(audioOpts());
    $('#play').textContent = '▶ Play';
  }

  async function exportVideo() {
    if (!state.plan || state.busy) return;
    if (!window.MediaRecorder || !Renderer.pickMime()) { toast("This browser can't record video. Use Chrome or Edge."); return; }
    state.busy = true; updateButtons();
    const prog = $('#progress'), bar = prog.querySelector('.bar div');
    prog.hidden = false; bar.style.width = '0';
    const blob = await player.play({ ...audioOpts(), record: true, onProgress: (p) => { bar.style.width = `${p * 100}%`; } });
    prog.hidden = true;
    state.busy = false; updateButtons();
    if (!blob || !blob.size) { toast('Recording failed. Try again.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reelify-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
    a.click();
    toast(blob.type.includes('mp4') ? 'Downloaded! Ready to post.' : 'Downloaded as .webm. Use Chrome for an .mp4 Instagram accepts.');
  }

  function updateButtons() {
    const has = state.media.length > 0, ready = !!state.plan;
    $('#generate').disabled = !has || state.busy;
    $('#play').disabled = !ready || state.busy;
    $('#remix').disabled = !ready || state.busy || !has;
    $('#export').disabled = !ready || state.busy;
  }

  $('#generate').onclick = generate;
  $('#remix').onclick = () => { player.stop(); generate(); };
  $('#play').onclick = preview;
  $('#export').onclick = () => { player.stop(); exportVideo(); };
})();
