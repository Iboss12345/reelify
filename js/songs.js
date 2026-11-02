// Soundtracks: free meme songs that ship with the site (Kevin MacLeod, CC BY 4.0), plus songs the
// user adds (saved in this browser). Every song's tempo and first beat are detected so the video's
// cuts land on the music.
window.Songs = (function () {
  const CREDIT = 'Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0';
  // tags: words in a video idea that suit the song
  const LIBRARY = [
    { id: 'monkeys-spinning-monkeys', title: 'Monkeys Spinning Monkeys', mood: '🤪 Goofy', tags: 'funny goofy silly happy kid kids cute pet dog cat fail chaos fun' },
    { id: 'sneaky-snitch', title: 'Sneaky Snitch', mood: '🕵️ Sneaky', tags: 'sneaky prank sneak mischief secret steal snack trick' },
    { id: 'fluffing-a-duck', title: 'Fluffing a Duck', mood: '🦆 Silly', tags: 'silly cute duck animal pet clumsy fail cooking baby' },
    { id: 'amazing-plan', title: 'Amazing Plan', mood: '😈 Scheming', tags: 'plan scheme plotting villain evil revenge idea' },
    { id: 'investigations', title: 'Investigations', mood: '🔍 Mystery', tags: 'mystery detective investigate clue suspicious who' },
    { id: 'awkward-meeting', title: 'Awkward Meeting', mood: '😬 Awkward', tags: 'awkward cringe embarrassing date crush meeting fail' },
    { id: 'local-forecast-elevator', title: 'Local Forecast (Elevator)', mood: '😌 Chill', tags: 'chill waiting boring calm relax elevator morning routine cozy' },
    { id: 'wallpaper', title: 'Wallpaper', mood: '🎈 Quirky', tags: 'quirky fun diy craft cooking recipe day life vlog' },
    { id: 'pixel-peeker-polka', title: 'Pixel Peeker Polka', mood: '🌀 Chaotic', tags: 'chaotic crazy party dance fast random' },
    { id: 'run-amok', title: 'Run Amok', mood: '🏃 Chase', tags: 'chase run running escape chaos late hurry' },
    { id: 'hall-of-the-mountain-king', title: 'In the Hall of the Mountain King', mood: '😰 Building tension', tags: 'tension build suspense sneaking exam test countdown' },
    { id: 'anguish', title: 'Anguish', mood: '😢 Sad', tags: 'sad cry lonely bullied heartbreak breakup lost alone depressed miss' },
    { id: 'aces-high', title: 'Aces High', mood: '🏆 Epic win', tags: 'epic victory win hero champion transformation glow jacked proud graduation' },
    { id: 'big-rock', title: 'Big Rock', mood: '🔥 Hype', tags: 'hype gym workout sport sports jacked football basketball car rock training' },
    { id: '8bit-dungeon-boss', title: '8bit Dungeon Boss', mood: '🎮 Gaming', tags: 'gaming game games video gamer boss level retro pixel minecraft fortnite' },
    { id: 'beach-party', title: 'Beach Party', mood: '🏖️ Summer', tags: 'summer beach party vacation holiday trip travel pool sun' },
  ].map((s) => Object.assign(s, { url: `music/${s.id}.mp3`, credit: `"${s.title}" ${CREDIT}` }));

  const byId = (id) => LIBRARY.find((s) => s.id === id);

  // ---------- picking a song for an idea ----------

  const ENERGY_PICK = { high: ['big-rock', 'aces-high'], low: ['local-forecast-elevator', 'anguish'], medium: ['monkeys-spinning-monkeys', 'wallpaper'] };
  // Ranked songs for a description (best first).
  function rank(text, energy) {
    const words = (text || '').toLowerCase();
    return LIBRARY.map((s, i) => {
      let score = -i * 0.001;
      for (const tag of s.tags.split(' ')) if (new RegExp(`\\b${tag}`).test(words)) score += 1;
      if ((ENERGY_PICK[energy] || []).includes(s.id)) score += 0.5;
      return { s, score };
    }).sort((a, b) => b.score - a.score).map((x) => x.s);
  }

  // ---------- user songs (saved in IndexedDB) ----------

  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('reelify', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('songs', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function store(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('songs', mode), r = fn(tx.objectStore('songs'));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function saved() {
    try {
      const rows = await store('readonly', (s) => s.getAll());
      return (rows || []).map((r) => ({ id: r.id, title: r.title, mine: true, url: URL.createObjectURL(r.blob) }));
    } catch (e) { return []; }
  }
  async function add(file) {
    const song = { id: `mine-${Date.now()}`, title: file.name.replace(/\.[a-z0-9]+$/i, ''), blob: file };
    try { await store('readwrite', (s) => s.put(song)); } catch (e) { /* private window: keep for this visit only */ }
    return { id: song.id, title: song.title, mine: true, url: URL.createObjectURL(file) };
  }
  async function remove(id) {
    try { await store('readwrite', (s) => s.delete(id)); } catch (e) { /* ignore */ }
  }

  // ---------- beat detection ----------

  // Finds tempo and the first beat: onset strength every 5 ms, autocorrelation for the rough
  // beat length, then a fine comb search for the exact period and phase.
  async function analyse(song) {
    if (song.beat) return song.beat;
    song.beat = (async () => {
      const ab = await (await fetch(song.url)).arrayBuffer();
      const buf = await Music.getCtx().decodeAudioData(ab);
      const sr = buf.sampleRate, ch = buf.getChannelData(0), hop = Math.round(sr / 200);
      const frames = Math.min(Math.floor(ch.length / hop), 200 * 45); // first 45 s
      const env = new Float32Array(frames);
      for (let f = 0; f < frames; f++) {
        let e = 0;
        for (let i = f * hop, end = i + hop; i < end; i++) e += ch[i] * ch[i];
        env[f] = Math.log(1e-6 + e);
      }
      const onset = new Float32Array(frames);
      for (let f = 1; f < frames; f++) onset[f] = Math.max(0, env[f] - env[f - 1]);

      // 70–180 BPM → beat length 66–171 frames
      let best = 100, bestScore = -1;
      for (let lag = 66; lag <= 171; lag++) {
        let s = 0;
        for (let f = 0; f + lag < frames; f++) s += onset[f] * onset[f + lag];
        if (s > bestScore) { bestScore = s; best = lag; }
      }
      let period = best, phase = 0; bestScore = -1;
      for (let p = best - 1.5; p <= best + 1.5; p += 0.05) {
        for (let ph = 0; ph < p; ph += 1) {
          let s = 0;
          for (let x = ph; x < frames; x += p) s += onset[Math.round(x)];
          if (s > bestScore) { bestScore = s; period = p; phase = ph; }
        }
      }
      return { bpm: (60 * 200) / period, first: phase / 200, duration: buf.duration };
    })();
    song.beat.catch(() => { song.beat = null; });
    return song.beat;
  }

  // Player-ready song: { el, offset, credit }. The edit's tempo is matched to the song.
  async function prepare(song, startAt, tpl) {
    const beat = await analyse(song);
    let bpm = beat.bpm;
    while (bpm < tpl.bpm * 0.75 && bpm * 2 <= 180) bpm *= 2; // double/half time to stay near the edit's speed
    while (bpm > tpl.bpm * 1.5 && bpm / 2 >= 60) bpm /= 2;
    tpl.bpm = bpm;
    const spb = 60 / bpm;
    const offset = Math.max(0, beat.first + Math.round(((startAt || 0) - beat.first) / spb) * spb);
    // Same object every time: the player attaches its audio node to it once.
    if (!song.player) { const el = new Audio(song.url); el.loop = true; song.player = { el }; }
    return Object.assign(song.player, { offset, credit: song.credit, title: song.title, bpm });
  }

  return { LIBRARY, byId, rank, saved, add, remove, prepare };
})();
