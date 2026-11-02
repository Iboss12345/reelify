// "Just describe it" mode: turns a text idea into a shot list with story captions, then makes a
// picture for every shot: AI-generated through Puter.js (free for us; each user signs in to their
// own free Puter account), or free stock photos from Wikimedia Commons as a backup.
window.Creator = (function () {
  const TEXT_API = 'https://text.pollinations.ai/openai';
  const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
  const IMAGE_OPTS = { provider: 'cloudflare', width: 768, height: 1344 };

  const hasPuter = () => !!(window.puter && puter.ai && puter.auth);

  function timeout(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }

  // Must be called straight from a click, or the browser blocks the sign-in popup.
  function signIn() {
    if (!hasPuter()) return Promise.reject(new Error('Puter.js did not load'));
    if (puter.auth.isSignedIn()) return Promise.resolve();
    return puter.auth.signIn();
  }

  // ---------- shot list ----------

  // The AI designs the whole edit from the description (no preset template): pacing, camera,
  // transitions, colour, music and where the beat drops.
  function shotPrompt(idea, nShots, lengthSec) {
    const timing = lengthSec
      ? `The shot "seconds" must add up to about ${lengthSec}.`
      : 'Pick "seconds" to fit the mood: 0.4-0.8 for fast montage moments, 1.5-3 for moments that need to land.';
    return `You are a professional short-form video editor making a vertical Instagram Reel from ${nShots} still images.
Video idea: "${idea}"
Design the edit ONLY from this idea: pacing, camera, transitions, colour and music must follow its story and mood.
1. "hook": scroll-stopping opening text (max 8 words, wrap the key word in *stars*), or "" if text would hurt it.
2. "edit": the overall style:
   - "energy": low | medium | high
   - "music": drop (EDM build and drop) | phonk (dark, hard) | pop (upbeat) | cinematic (epic drums) | dreamy (lo-fi)
   - "bpm": 70-150
   - "look": natural | vivid | dark | bw | vintage | warm | cool | cinematic | dreamy
   - "layout": full | letterbox
   - "textStyle": outline | box | minimal | big | cinema
   - "fx": any of bloom, grain, vignette, glow, rgb, rgbMotion, glitch
3. If there is a main character, describe them once in detail (age, build, hair, clothes) and repeat that exact description inside every image prompt so they look the same in every shot.
4. "shots": exactly ${nShots} shots that tell the story in order. For each shot:
   - "prompt": a detailed image-generation prompt (subject, action, setting, lighting, camera angle), ending with "photorealistic, vertical 9:16 photo"
   - "search": 2-4 plain words to find a similar stock photo
   - "caption": on-screen story text, max 6 words (e.g. "day 1", "they laughed at me"), or "" for none
   - "seconds": how long the shot stays on screen. ${timing}
   - "move": camera move: drift | pullback | pan | rise | tilt | velocity (slow creep then hard zoom) | punch (impact zoom) | still
   - "transition": how this shot comes in: cut | zoom | spin | whip | whipUp | flash | flare | shake | glitch | dissolve
   - "look": colour for this shot, same options as above (e.g. dark for sad moments, vivid for the payoff)
   - "drop": true on the ONE shot where the story turns or pays off (the beat drops there), otherwise false
Reply with JSON only: {"hook":"...","edit":{...},"shots":[{"prompt":"...","search":"...","caption":"...","seconds":1.5,"move":"...","transition":"...","look":"...","drop":false}]}`;
  }

  function parseShotList(txt, nShots) {
    const json = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const shots = (json.shots || []).map((s) => (typeof s === 'string' ? { prompt: s, search: s } : s))
      .filter((s) => s && (s.prompt || s.search))
      .slice(0, nShots)
      .map((s) => ({
        prompt: String(s.prompt || s.search),
        search: String(s.search || s.prompt).split(/\s+/).slice(0, 5).join(' '),
        caption: s.caption ? String(s.caption).slice(0, 60) : '',
        sec: +s.seconds > 0 ? Math.max(0.3, Math.min(6, +s.seconds)) : null,
        move: s.move || null,
        trans: s.transition || null,
        look: s.look || null,
        drop: s.drop === true,
      }));
    if (!shots.length) throw new Error('empty shot list');
    // Only one drop, and never on the first shot.
    let dropped = false;
    shots.forEach((s, i) => { s.drop = s.drop && i > 0 && !dropped; dropped = dropped || s.drop; });
    return {
      edit: json.edit && typeof json.edit === 'object' ? json.edit : {},
      hook: typeof json.hook === 'string' ? json.hook.slice(0, 80) : null,
      shots,
    };
  }

  async function puterShotList(idea, nShots, lengthSec) {
    const res = await puter.ai.chat(shotPrompt(idea, nShots, lengthSec));
    let content = res && res.message ? res.message.content : res;
    if (Array.isArray(content)) content = content.map((c) => c.text || '').join('');
    return parseShotList(String(content), nShots);
  }

  async function pollinationsShotList(idea, nShots, lengthSec) {
    const res = await fetch(TEXT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [{ role: 'user', content: shotPrompt(idea, nShots, lengthSec) }],
        response_format: { type: 'json_object' },
      }),
      signal: timeout(35000),
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    return parseShotList((await res.json()).choices[0].message.content, nShots);
  }

  // Offline fallback: split the idea into phrases and strip style words.
  const FILLER = /\b(fast|slow|quick|hype|cinematic|aesthetic|velocity|glitch|edit|video|reel|tiktok|instagram|viral|vibes?|style|transitions?|music|beat|drop|vintage|retro|warm|cool|make|i|want|wnat|to|show|a|an|the|of|my|me|about|showing|that|is|in|on|for|some|lots|it)\b/gi;
  function localShotList(idea, nShots) {
    const text = idea.replace(/["“”][^"“”]*["“”]/g, ' ');
    let parts = text.split(/[,.;\n]|\band\b|\bthen\b|\bhten\b|\bwith\b/i)
      .map((p) => p.replace(FILLER, ' ').replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 2);
    if (!parts.length) parts = ['city skyline'];
    const variants = ['', ' close up', ' wide shot', ' at night', ' detail', ' people'];
    const shots = [];
    for (let i = 0; shots.length < nShots; i++) {
      const s = (parts[i % parts.length] + variants[Math.floor(i / parts.length) % variants.length]).trim();
      shots.push({ prompt: `${s}, photorealistic, vertical 9:16 photo`, search: s, caption: '' });
    }
    return { edit: null, hook: null, shots };
  }

  // ---------- pictures ----------

  function loadImage(url, cors = true) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  // The canvas recorder needs pictures it's allowed to read, so re-load them safely.
  async function canvasSafe(src) {
    if (src.startsWith('data:') || src.startsWith('blob:')) return loadImage(src, false);
    try { return await loadImage(src); } catch (e) { /* no CORS, try fetching */ }
    const blob = await (await fetch(src)).blob();
    return loadImage(URL.createObjectURL(blob), false);
  }

  async function aiImage(prompt) {
    let img;
    try {
      img = await puter.ai.txt2img(prompt, IMAGE_OPTS);
    } catch (e) {
      if (/insufficient_funds|402/i.test(JSON.stringify(e))) throw Object.assign(new Error('out of credits'), { credits: true });
      img = await puter.ai.txt2img(prompt, { width: 768, height: 1344 }); // any provider
    }
    return canvasSafe(img.src);
  }

  // Image-to-video: the AI picture for the shot becomes the first frame of a real moving clip.
  async function aiClip(prompt, still, seconds) {
    const c = document.createElement('canvas');
    c.width = still.naturalWidth; c.height = still.naturalHeight;
    c.getContext('2d').drawImage(still, 0, 0);
    const opts = { seconds: Math.max(5, Math.ceil(seconds || 5)), size: '720x1280', input_reference: c.toDataURL('image/jpeg', 0.9) };
    let vid;
    try {
      vid = await puter.ai.txt2vid(prompt, opts);
    } catch (e) {
      if (/insufficient_funds|402/i.test(JSON.stringify(e))) throw Object.assign(new Error('out of credits'), { credits: true });
      throw e;
    }
    // Re-load from our own blob so the recorder is allowed to read the frames.
    const blob = await (await fetch(String(vid.src || vid))).blob();
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    await new Promise((resolve, reject) => { v.onloadeddata = resolve; v.onerror = reject; v.src = URL.createObjectURL(blob); });
    document.getElementById('media-pool').appendChild(v);
    return v;
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

  async function stockPhoto(query, used, fallback) {
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
        try { return { el: await loadImage(c.url), credit: c }; } catch (e) { /* try next */ }
      }
    }
    return null;
  }

  // Runs jobs a few at a time.
  async function pool(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  // images: 'video' | 'ai' | 'stock'
  async function create(idea, nShots, onStatus, images, lengthSec) {
    const useAI = (images === 'ai' || images === 'video') && hasPuter() && puter.auth.isSignedIn();
    let clipsOk = useAI && images === 'video';
    onStatus('✍️ AI is writing and editing the story…');
    let plan = null;
    for (const attempt of [useAI && puterShotList, pollinationsShotList]) {
      if (!attempt) continue;
      try { plan = await attempt(idea, nShots, lengthSec); plan.byAI = true; break; } catch (e) { /* next */ }
    }
    if (!plan) { plan = localShotList(idea, nShots); plan.byAI = false; }

    const used = new Set();
    const fallback = localShotList(idea, 1).shots[0].search;
    let done = 0, aiOk = useAI;
    const total = plan.shots.length;
    const label = clipsOk ? '🎬 Creating AI video clips (a few minutes)' : useAI ? '🎨 Creating AI images' : '🔎 Finding photos';
    onStatus(`${label} 0/${total}…`);
    const results = await pool(plan.shots, useAI ? 3 : 6, async (shot) => {
      let r = null;
      if (aiOk) {
        try { r = { el: await aiImage(shot.prompt), ai: true }; } catch (e) { if (e.credits) aiOk = false; }
      }
      if (r && clipsOk) {
        try {
          r = { el: await aiClip(shot.prompt, r.el, shot.sec), ai: true, video: true };
        } catch (e) { if (e.credits) clipsOk = false; }
      }
      if (!r) r = await stockPhoto(shot.search, used, fallback);
      onStatus(`${label} ${++done}/${total}…`);
      return r && Object.assign(r, {
        caption: shot.caption, query: shot.search,
        shot: { sec: shot.sec, move: shot.move, trans: shot.trans, look: shot.look, drop: !!shot.drop },
      });
    });
    plan.photos = results.filter(Boolean);
    plan.creditsRanOut = useAI && (!aiOk || (images === 'video' && !clipsOk));
    plan.usedClips = plan.photos.some((p) => p.video);
    plan.usedAIImages = plan.photos.some((p) => p.ai);
    return plan;
  }

  return { create, signIn, hasPuter };
})();
