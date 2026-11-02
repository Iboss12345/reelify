// "Describe it" mode: turns a text idea into a shot list (free AI, with an offline fallback)
// and finds a free photo on Wikimedia Commons for every shot.
window.Creator = (function () {
  const TEXT_API = 'https://text.pollinations.ai/openai';
  const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

  function timeout(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }

  // The free AI allows about one reply per 45s per person: wait once if it asks us to.
  async function aiShotList(idea, nShots, onStatus, retried = false) {
    try {
      return await askAI(idea, nShots);
    } catch (e) {
      const wait = e.retryAfter;
      if (retried || !wait || wait > 25) throw e;
      onStatus(`✍️ AI is busy, retrying in ${wait}s…`);
      await new Promise((r) => setTimeout(r, wait * 1000 + 500));
      onStatus('✍️ AI is writing the shot list…');
      return aiShotList(idea, nShots, onStatus, true);
    }
  }

  async function askAI(idea, nShots) {
    const templates = TEMPLATES.map((t) => `${t.id}: ${t.desc}`).join('\n');
    const prompt = `You are directing a viral vertical Instagram Reel.
Video idea: "${idea}"
Pick the best template id from:
${templates}
Write a scroll-stopping hook (max 8 words, wrap the key word in *stars*) and exactly ${nShots} shots in story order.
For each shot give a photo search query for Wikimedia Commons: 2-4 plain words naming concrete things you can photograph (no style words like cinematic or aesthetic).
Reply with JSON only: {"template":"id","hook":"...","shots":[{"search":"..."}]}`;
    const res = await fetch(TEXT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
      signal: timeout(35000),
    });
    if (!res.ok) {
      const err = new Error(`AI ${res.status}`);
      const m = (await res.text().catch(() => '')).match(/Retry after (\d+)s/i);
      if (m) err.retryAfter = +m[1];
      throw err;
    }
    const txt = (await res.json()).choices[0].message.content;
    const json = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const shots = (json.shots || []).map((s) => String(s.search || s).trim()).filter(Boolean).slice(0, nShots);
    if (!shots.length) throw new Error('empty shot list');
    return {
      templateId: TEMPLATES.some((t) => t.id === json.template) ? json.template : null,
      hook: typeof json.hook === 'string' ? json.hook.slice(0, 80) : null,
      shots,
    };
  }

  // Offline fallback: split the idea into phrases and strip style words.
  const FILLER = /\b(fast|slow|quick|hype|cinematic|aesthetic|velocity|glitch|edit|video|reel|tiktok|instagram|viral|vibes?|style|transitions?|music|beat|drop|vintage|retro|warm|cool|make|a|an|the|of|my|me|about|showing|that|is|in|on|to|for|some|lots|it)\b/gi;
  function localShotList(idea, nShots) {
    const text = idea.replace(/["“”][^"“”]*["“”]/g, ' ');
    let parts = text.split(/[,.;\n]|\band\b|\bthen\b|\bwith\b/i)
      .map((p) => p.replace(FILLER, ' ').replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 2);
    if (!parts.length) parts = ['city skyline'];
    const variants = ['', ' close up', ' landscape', ' night', ' detail', ' people'];
    const shots = [];
    for (let i = 0; shots.length < nShots; i++) {
      shots.push((parts[i % parts.length] + variants[Math.floor(i / parts.length) % variants.length]).trim());
    }
    return { templateId: null, hook: null, shots };
  }

  async function searchCommons(query) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', origin: '*',
      generator: 'search', gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6', gsrlimit: '15',
      prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '1080',
    });
    const res = await fetch(`${COMMONS_API}?${params}`, { signal: timeout(20000) });
    const data = await res.json();
    const pages = Object.values((data.query && data.query.pages) || {}).sort((a, b) => a.index - b.index);
    const found = pages
      .map((p, i) => ({ p, i, ii: p.imageinfo && p.imageinfo[0] }))
      .filter(({ ii }) => ii && ii.mime === 'image/jpeg' && ii.width >= 900 && ii.height >= 700 && ii.thumburl);
    // Prefer taller pictures (better for vertical video), then search rank.
    found.forEach((f) => { f.score = f.i - Math.min(f.ii.height / f.ii.width, 1.3) * 4; });
    found.sort((a, b) => a.score - b.score);
    return found.map((f) => ({
      id: f.p.pageid, url: f.ii.thumburl, link: f.ii.descriptionurl,
      title: f.p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
    }));
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function findPhoto(query, used, fallback) {
    // Wikimedia's reviewed "Quality images" first, then everything.
    // (Single words are too ambiguous for the small quality set, e.g. "ramen" is Dutch for windows.)
    const tries = [query, query.split(' ').slice(0, 2).join(' '), fallback];
    if (query.includes(' ')) tries.unshift(`${query} incategory:"Quality_images"`);
    for (const q of tries) {
      if (!q) continue;
      let candidates = [];
      try { candidates = await searchCommons(q); } catch (e) { continue; }
      for (const c of candidates.slice(0, 5)) {
        if (used.has(c.id)) continue;
        used.add(c.id);
        try { return { el: await loadImage(c.url), credit: c, query }; } catch (e) { /* try next */ }
      }
    }
    return null;
  }

  async function create(idea, nShots, onStatus) {
    onStatus('✍️ AI is writing the shot list…');
    let plan;
    try {
      plan = await aiShotList(idea, nShots, onStatus);
      plan.byAI = true;
    } catch (e) {
      plan = localShotList(idea, nShots);
      plan.byAI = false;
    }
    const used = new Set();
    const fallback = localShotList(idea, 1).shots[0];
    let done = 0;
    onStatus(`🔎 Finding photos 0/${plan.shots.length}…`);
    const results = await Promise.all(plan.shots.map((q) => findPhoto(q, used, fallback).then((r) => {
      onStatus(`🔎 Finding photos ${++done}/${plan.shots.length}…`);
      return r;
    })));
    plan.photos = results.filter(Boolean);
    return plan;
  }

  return { create };
})();
