// Machine-learning music: MusicGen composes a real instrumental track from a text description
// (free, runs in the browser; big one-time download). The result plays like an uploaded song.
window.Composer = (function () {
  const MAX_SEC = 30; // MusicGen-small makes up to ~30 s; longer videos loop it
  const TOKENS_PER_SEC = 50;
  const WORKER_URL = new URL('composer-worker.js', document.currentScript.src).href;
  const cache = new Map();
  let worker = null;

  // Fallback descriptions when the AI didn't write one.
  const STYLE = {
    drop: 'energetic EDM, punchy four on the floor kick, supersaw synth chords, big build up and drop, festival energy',
    phonk: 'dark drift phonk, heavy distorted 808 bass, cowbell melody, hard trap drums, aggressive',
    pop: 'upbeat modern pop instrumental, bright synths, clap on the backbeat, catchy plucked melody, feel good',
    cinematic: 'epic cinematic trailer music, huge drums, strings and brass, rising tension, emotional',
    dreamy: 'lofi chill beat, warm rhodes piano, soft swung drums, vinyl crackle, nostalgic and calm',
  };
  const promptFor = (tpl) => `${tpl.musicPrompt || STYLE[tpl.music] || STYLE.pop}, ${tpl.bpm} bpm, instrumental, high quality`;

  function wav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    const gain = peak > 0 ? 0.9 / peak : 1; // normalise loudness
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * gain)) * 32767, true);
    return new Blob([buf], { type: 'audio/wav' });
  }

  // Resolves to a "song" ({ el: Audio, offset }) for the player.
  function compose(tpl, seconds, onStatus) {
    const prompt = promptFor(tpl);
    const sec = Math.min(MAX_SEC, Math.ceil(seconds) + 1);
    const key = `${prompt}|${sec}`;
    if (cache.has(key)) return cache.get(key);
    const job = new Promise((resolve, reject) => {
      if (!worker) worker = new Worker(WORKER_URL, { type: 'module' });
      const tokens = sec * TOKENS_PER_SEC;
      const t0 = Date.now();
      onStatus('🎵 Loading the AI composer…');
      worker.onmessage = ({ data: m }) => {
        if (m.type === 'download') onStatus(`🎵 Downloading the AI composer (first time only, ~600 MB) ${Math.floor((m.loaded / m.total) * 100)}%…`);
        if (m.type === 'step') onStatus(`🎵 AI is composing your music ${Math.min(99, Math.floor((m.step / m.tokens) * 100))}% (${Math.round((Date.now() - t0) / 1000)}s)…`);
        if (m.type === 'error') reject(new Error(m.message));
        if (m.type === 'done') {
          const el = new Audio(URL.createObjectURL(wav(m.samples, m.rate)));
          el.loop = true;
          resolve({ el, offset: 0, ai: true });
        }
      };
      worker.onerror = (e) => reject(new Error(e.message || 'worker failed'));
      worker.postMessage({ prompt, tokens });
    });
    cache.set(key, job);
    job.catch(() => { cache.delete(key); worker && worker.terminate(); worker = null; });
    return job;
  }

  return { compose, promptFor };
})();
