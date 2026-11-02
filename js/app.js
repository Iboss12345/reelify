// Page wiring: media (upload or describe), style choice, generate / remix, preview and download.
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const MAX_FILES = 30;

  const state = {
    source: 'upload', // 'upload' | 'describe'
    uploads: [],
    found: [], // photos found for a description
    foundFor: '', // the description they were found for
    idea: null, // AI shot-list info: { templateId, hook, byAI }
    mode: 'auto', pickId: TEMPLATES[0].id,
    song: null, plan: null, busy: false,
    lastTplId: null, lastHook: null,
  };
  const media = () => (state.source === 'upload' ? state.uploads : state.found);
  const player = new Renderer.Player($('#stage'));
  const pool = $('#media-pool');

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
  }

  function status(msg) {
    const el = $('#status');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  // ---------- media ----------

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

  // Some files (and drags from other apps) arrive without a type, so fall back to the extension.
  const IMAGE_EXT = /\.(jpe?g|jfif|png|webp|gif|bmp|avif)$/i;
  const VIDEO_EXT = /\.(mp4|mov|m4v|webm|ogv)$/i;
  const isImage = (f) => f.type.startsWith('image/') || (!f.type && IMAGE_EXT.test(f.name));
  const isVideo = (f) => f.type.startsWith('video/') || (!f.type && VIDEO_EXT.test(f.name));

  function loadMedia(file) {
    const url = URL.createObjectURL(file);
    if (isImage(file)) {
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
      if (state.uploads.length >= MAX_FILES) { toast(`Max ${MAX_FILES} files.`); break; }
      if (!isImage(f) && !isVideo(f) && !/\.(heic|heif)$/i.test(f.name)) continue;
      try {
        state.uploads.push(await loadMedia(f));
      } catch (e) {
        toast(/\.(heic|heif)$/i.test(f.name)
          ? `${f.name}: iPhone HEIC photos don't work in this browser. Save them as JPG first.`
          : `Couldn't read ${f.name}.`);
      }
    }
    renderThumbs();
  }

  // Describe mode: AI shot list + free photos.
  async function findPhotos(idea) {
    // Sign-in has to start inside the click, before anything else is awaited.
    const images = $('#imageSource').value;
    const signedIn = images === 'ai' ? Creator.signIn().then(() => true, () => false) : Promise.resolve(false);
    state.busy = true; updateButtons();
    try {
      if (images === 'ai') {
        status('🔐 Sign in to Puter (free) in the popup to make AI pictures…');
        if (!(await signedIn)) toast('No Puter sign-in, so using free stock photos instead.');
      }
      const res = await Creator.create(idea, shotCount(), status, images, +$('#lengthSec').value || null);
      if (!res.photos.length) {
        toast("Couldn't make pictures for that. Try describing it differently.");
        return false;
      }
      if (res.creditsRanOut) toast('Your free Puter AI credits ran out, so some shots use stock photos.');
      state.found = res.photos.map((p) => {
        const m = analyse({
          type: 'image', el: p.el, url: p.el.src, name: p.query, credit: p.credit, caption: p.caption, ai: p.ai,
        });
        m.cover = p.el.naturalWidth / p.el.naturalHeight < 1.7; // fill the frame instead of letterboxing
        m.shot = Object.assign({}, p.shot, { grade: Director.look(p.shot.look) });
        return m;
      });
      state.foundFor = idea;
      state.foundWith = images;
      state.idea = { edit: res.edit, hook: res.hook, byAI: res.byAI, aiImages: res.usedAIImages };
      renderThumbs();
      return true;
    } finally {
      state.busy = false; status(''); updateButtons();
    }
  }

  // How many photos to look for, based on the length settings.
  function shotCount() {
    const len = +$('#lengthSec').value || 0, shot = +$('#shotSec').value || 0;
    if (len && shot) return Math.max(3, Math.min(12, Math.ceil(len / shot)));
    if (len) return Math.max(4, Math.min(12, Math.round(len / 1.8)));
    return 7;
  }

  let dragIdx = null;
  function renderThumbs() {
    const list = media();
    const ul = $('#thumbs');
    ul.innerHTML = '';
    list.forEach((m, i) => {
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
      rm.onclick = () => {
        const [gone] = list.splice(i, 1);
        if (gone.type === 'video') gone.el.remove();
        renderThumbs();
      };
      li.appendChild(rm);
      li.ondragstart = () => { dragIdx = i; li.classList.add('dragging'); };
      li.ondragend = () => { dragIdx = null; li.classList.remove('dragging'); };
      li.ondragover = (e) => e.preventDefault();
      li.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation(); // don't let the page treat this as a new file drop
        if (dragIdx == null) { useUploadTab(); addFiles(Array.from(e.dataTransfer.files)); return; }
        if (dragIdx == null || dragIdx === i) return;
        list.splice(i, 0, list.splice(dragIdx, 1)[0]);
        dragIdx = null;
        renderThumbs();
      };
      ul.appendChild(li);
    });
    $('#thumbHint').hidden = list.length < 2;
    $('#newPhotos').hidden = state.source !== 'describe' || !state.found.length;
    updateButtons();
  }

  // Pictures dragged from another website: only works if that site allows it (CORS).
  function addFromUrl(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          state.uploads.push(analyse({ type: 'image', el: img, url, name: 'web image' }));
          renderThumbs();
        } catch (e) { img.onerror(); }
        resolve();
      };
      img.onerror = () => {
        toast("That website doesn't let other sites use its picture. Save it to your computer first, then drag it in.");
        resolve();
      };
      img.src = url;
    });
  }

  function useUploadTab() {
    if (state.source !== 'upload') $('#sourceTabs button[data-source=upload]').click();
  }

  // The whole page accepts drops, not just the dashed box.
  const drop = $('#drop');
  $('#files').onchange = (e) => { addFiles(Array.from(e.target.files)); e.target.value = ''; };
  const isExternalDrag = (e) => Array.from(e.dataTransfer.types).some((t) => t === 'Files' || t === 'text/uri-list');
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dragIdx == null && isExternalDrag(e)) drop.classList.add('over');
  });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over'); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (dragIdx != null) return; // reordering thumbnails
    const files = Array.from(e.dataTransfer.files);
    if (files.length) { useUploadTab(); addFiles(files); return; }
    const html = e.dataTransfer.getData('text/html');
    const src = (html.match(/<img[^>]+src="([^"]+)"/i) || [])[1];
    const url = src || e.dataTransfer.getData('text/uri-list').split('\n')[0].trim();
    if (/^(https?:|data:image)/.test(url)) { useUploadTab(); addFromUrl(url.replace(/&amp;/g, '&')); }
  });

  $$('#sourceTabs button').forEach((b) => {
    b.onclick = () => {
      state.source = b.dataset.source;
      $$('#sourceTabs button').forEach((x) => x.classList.toggle('active', x === b));
      $$('.srcpane').forEach((p) => { p.hidden = p.dataset.src !== state.source; });
      renderThumbs();
    };
  });
  $('#idea').oninput = updateButtons;
  $('#newPhotos').onclick = async () => {
    const idea = $('#idea').value.trim();
    if (idea && await findPhotos(idea)) generate({ remix: true });
  };

  // ---------- style controls ----------

  $$('.tabs button[data-mode]').forEach((b) => {
    b.onclick = () => {
      state.mode = b.dataset.mode;
      $$('.tabs button[data-mode]').forEach((x) => x.classList.toggle('active', x === b));
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

  const musicMode = () => $('input[name=music]:checked').value;
  $$('input[name=music]').forEach((r) => {
    r.onchange = () => { $('#songRow').hidden = musicMode() !== 'song'; };
  });

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

  // ---------- generate / remix / preview / export ----------

  function mediaStats(list) {
    const n = list.length;
    return {
      count: n,
      videos: list.filter((m) => m.type === 'video').length,
      landscape: list.filter((m) => m.landscape && !m.cover).length,
      bright: list.reduce((a, m) => a + m.bright, 0) / n,
      sat: list.reduce((a, m) => a + m.sat, 0) / n,
    };
  }

  function chooseTemplate(stats, remix) {
    const describing = state.source === 'describe';
    const exclude = remix && state.lastTplId ? [state.lastTplId] : [];
    if (state.mode === 'pick') {
      return { template: Director.clone(Director.byId(state.pickId)), reasons: ['You picked this template.'] };
    }
    // No format picked: build a custom edit only from what was described.
    const ideaEdit = () => (state.idea && state.idea.edit) || Director.guess(state.foundFor);
    if (state.mode === 'describe') {
      const text = $('#describe').value.trim();
      if (!text) { toast('Describe the style you want first.'); return null; }
      const base = describing
        ? Director.custom(ideaEdit(), { story: true, remix })
        : Director.custom(Director.guess(text), { remix });
      return Director.parseStyle(text, stats, base);
    }
    if (describing) {
      const fromAI = !!(state.idea && state.idea.edit);
      return {
        template: Director.custom(ideaEdit(), { story: true, remix }),
        reasons: [remix
          ? 'Same story and timing, with a new look, camera moves, transitions and music.'
          : fromAI
            ? 'Custom edit designed by AI only from your description: shot timing, camera moves, transitions, colour and music.'
            : 'Custom edit built from the mood words in your description.'],
      };
    }
    return Director.autoPick(stats, exclude);
  }

  async function generate({ remix = false } = {}) {
    if (state.busy) return;
    player.stop();
    if (state.source === 'describe') {
      const idea = $('#idea').value.trim();
      if (!idea) { toast('Describe your video first.'); return; }
      if (!state.found.length || state.foundFor !== idea || state.foundWith !== $('#imageSource').value) {
        if (!(await findPhotos(idea))) return;
      }
    }
    const list = media();
    if (!list.length) { toast('Add some photos or videos first.'); return; }

    const res = chooseTemplate(mediaStats(list), remix);
    if (!res) return;
    const tpl = res.template;

    // Hook: what you typed > (first time) the AI's hook for your idea > a fresh one on remix.
    let hook = $('#hook').value.trim() || null;
    if (!hook && state.source === 'describe' && (!remix || tpl.id === 'custom') && state.idea && state.idea.hook) hook = state.idea.hook;
    if (!hook && remix) {
      const options = tpl.hooks.filter((h) => h !== state.lastHook);
      hook = options[Math.floor(Math.random() * options.length)] || null;
    }
    if (hook && tpl.hookMode === 'none') tpl.hookMode = 'intro';

    await Promise.all([500, 700, 800, 900].map((w) => document.fonts.load(`${w} 40px Montserrat`))).catch(() => {});
    state.plan = Renderer.buildPlan(list, tpl, {
      // Described stories keep their order.
      aiOrder: state.mode !== 'pick' && state.source === 'upload',
      shuffle: remix && state.source === 'upload',
      hook,
      outro: $('#outro').value.trim(),
      lengthSec: +$('#lengthSec').value || null,
      shotSec: +$('#shotSec').value || null,
    });
    state.lastTplId = tpl.id;
    state.lastHook = state.plan.hook;
    player.load(state.plan);
    $('#empty').hidden = true;
    const reasons = res.reasons.slice();
    if (remix) reasons.unshift('🎲 Remixed: new template/order/transitions.');
    if (state.source === 'describe' && state.idea) {
      reasons.push(state.idea.byAI ? 'Story and captions written by AI from your description.' : 'AI was busy, so the shots came from your keywords.');
      if (state.idea.aiImages) reasons.push('Pictures generated by AI for each shot.');
    }
    if (tpl.id === 'custom') {
      reasons.push(`Music: ${tpl.music} at ${tpl.bpm} BPM · look: ${tpl.lookName} · energy: ${tpl.energy}.`);
      if (state.plan.dropTime != null) reasons.push(`The beat builds up and drops at ${state.plan.dropTime.toFixed(1)}s, where the story turns.`);
    }
    renderNotes(reasons);
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
      const li = document.createElement('li'); li.textContent = `Hook: "${p.hook.replace(/\*/g, '')}"`; ul.appendChild(li);
    }
    el.append(h, meta, ul);

    const credited = media().filter((m) => m.credit);
    if (credited.length) {
      const c = document.createElement('div');
      c.className = 'credits';
      c.append('Photos from Wikimedia Commons (free licences, credit the authors if you post): ');
      credited.forEach((m, i) => {
        const a = document.createElement('a');
        a.href = m.credit.link; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = m.credit.title;
        c.append(a, i < credited.length - 1 ? ' · ' : '');
      });
      el.append(c);
    }
    el.hidden = false;
  }

  async function preview() {
    if (!state.plan) return;
    if (player.running) { player.stop(); return; }
    $('#play').textContent = '■ Stop';
    await player.play(audioOpts());
    if (!player.running) $('#play').textContent = '▶ Play';
  }

  async function exportVideo() {
    if (!state.plan || state.busy) return;
    if (!window.MediaRecorder || !Renderer.pickMime()) { toast("This browser can't record video. Use Chrome or Edge."); return; }
    player.stop();
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

  // A 4×3 grid of frames from the video, copied to the clipboard so it can be pasted into a chat.
  async function frameSheet() {
    if (!state.plan || state.busy) return;
    player.stop();
    const plan = state.plan, cols = 4, rows = 3, tw = 270, th = 480;
    const sheet = document.createElement('canvas');
    sheet.width = cols * tw; sheet.height = rows * th;
    const sc = sheet.getContext('2d');
    sc.font = '700 22px Montserrat, sans-serif';
    for (let i = 0; i < cols * rows; i++) {
      const t = (plan.total * (i + 0.5)) / (cols * rows);
      const seg = plan.segs.find((s) => t < s.start + s.dur) || plan.segs[plan.segs.length - 1];
      if (seg.m.type === 'video') {
        const v = seg.m.el;
        await new Promise((r) => { v.onseeked = r; v.currentTime = seg.offset + (t - seg.start); setTimeout(r, 600); });
      }
      player.draw(t);
      const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
      sc.drawImage(player.canvas, x, y, tw, th);
      sc.fillStyle = 'rgba(0,0,0,.6)'; sc.fillRect(x, y, 70, 30);
      sc.fillStyle = '#fff'; sc.fillText(`${t.toFixed(1)}s`, x + 8, y + 23);
    }
    player.draw(0.05);
    const blob = await new Promise((r) => sheet.toBlob(r, 'image/png'));
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Frames copied! Click in the Claude chat and press Ctrl+V to paste them.');
    } catch (e) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'reelify-frames.png';
      a.click();
      toast('Saved reelify-frames.png. Drag it into the Claude chat.');
    }
  }

  function updateButtons() {
    const canMake = state.source === 'upload' ? state.uploads.length > 0 : $('#idea').value.trim().length > 2;
    const ready = !!state.plan;
    $('#generate').disabled = !canMake || state.busy;
    $('#play').disabled = !ready || state.busy;
    $('#remix').disabled = !ready || state.busy || !media().length;
    $('#export').disabled = !ready || state.busy;
    $('#sheet').disabled = !ready || state.busy;
    $('#newPhotos').disabled = state.busy;
  }

  $('#generate').onclick = () => generate();
  $('#remix').onclick = () => generate({ remix: true });
  $('#play').onclick = preview;
  $('#export').onclick = exportVideo;
  $('#sheet').onclick = frameSheet;
})();
