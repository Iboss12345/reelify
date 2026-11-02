// Tiny synth that generates a royalty-free beat in the browser, in time with the edit.
window.Music = (function () {
  let ctx = null;
  let noise = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function noiseBuffer(c) {
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Chord progressions (MIDI notes), one chord per bar.
  const PROG = {
    minor: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G
    major: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
    dreamy: [[53, 57, 60, 64], [57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65]],
  };

  const PRESETS = {
    drop: { kick: 1, snare: true, hats: 2, bass: true, pad: true, prog: 'minor', introStrip: true },
    pop: { kick: 1, snare: true, hats: 2, bass: true, pad: true, prog: 'major' },
    glitch: { kick: 1, snare: true, hats: 4, bass: true, pad: false, prog: 'minor' },
    cinematic: { kick: 0, boom: true, snare: false, hats: 0, bass: true, pad: true, prog: 'minor' },
    dreamy: { kick: 2, snare: false, hats: 1, bass: false, pad: true, prog: 'dreamy' },
  };

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function kick(c, out, t, vol = 1, long = false) {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(long ? 32 : 45, t + (long ? 0.4 : 0.12));
    env(g, t, 0.9 * vol, 0.003, long ? 1.4 : 0.35);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + (long ? 1.6 : 0.5));
  }

  function noiseHit(c, out, t, type, freq, vol, decay) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuffer(c);
    f.type = type; f.frequency.value = freq;
    env(g, t, vol, 0.002, decay);
    s.connect(f).connect(g).connect(out);
    s.start(t); s.stop(t + decay + 0.05);
  }

  function snare(c, out, t) {
    noiseHit(c, out, t, 'bandpass', 1800, 0.45, 0.18);
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = 185;
    env(g, t, 0.3, 0.002, 0.1);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
  }

  const hat = (c, out, t, vol) => noiseHit(c, out, t, 'highpass', 7500, vol, 0.045);

  function bass(c, out, t, midi, dur, vol = 0.22) {
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = midiHz(midi);
    f.type = 'lowpass'; f.frequency.value = 420;
    env(g, t, vol, 0.01, dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.1);
  }

  function pad(c, out, t, notes, dur, cutoff) {
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + Math.min(0.4, dur / 3));
    g.gain.setValueAtTime(0.06, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(out);
    notes.forEach((n) => {
      [-6, 6].forEach((detune) => {
        const o = c.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = midiHz(n); o.detune.value = detune;
        o.connect(f); o.start(t); o.stop(t + dur + 0.05);
      });
    });
  }

  function riser(c, out, t, dur) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuffer(c); s.loop = true;
    f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + dur);
    g.gain.setValueAtTime(0.0001, t + dur + 0.01);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.05);
  }

  // Schedules the whole track up front. Returns a handle with stop().
  function start(c, dest, plan, t0) {
    const p = PRESETS[plan.tpl.music] || PRESETS.pop;
    const prog = PROG[p.prog];
    const spb = plan.spb;
    const master = c.createGain();
    master.gain.setValueAtTime(0.7, t0);
    master.gain.setValueAtTime(0.7, t0 + Math.max(0, plan.total - 0.8));
    master.gain.linearRampToValueAtTime(0.0001, t0 + plan.total);
    master.connect(dest);

    const intro = p.introStrip ? plan.introBeats : 0;
    const nBeats = Math.ceil(plan.total / spb);
    if (intro > 0) riser(c, master, t0, intro * spb);

    for (let b = 0; b < nBeats; b++) {
      const t = t0 + b * spb;
      const chord = prog[Math.floor(b / 4) % prog.length];
      const inIntro = b < intro;

      if (p.pad && b % 4 === 0) pad(c, master, t, chord, 4 * spb, inIntro ? 600 : 1400);
      if (inIntro) { hat(c, master, t, 0.06); continue; }

      if (p.kick === 1) kick(c, master, t);
      if (p.kick === 2 && b % 2 === 0) kick(c, master, t, 0.6);
      if (p.boom && b % 4 === 0) kick(c, master, t, 1, true);
      if (p.snare && b % 2 === 1) snare(c, master, t);
      if (p.bass) {
        if (p.boom) { if (b % 4 === 0) bass(c, master, t, chord[0] - 24, 4 * spb * 0.9, 0.18); }
        else bass(c, master, t, chord[0] - 12, spb * 0.8);
      }
      for (let h = 0; h < p.hats; h++) {
        hat(c, master, t + (h * spb) / p.hats, h % 2 ? 0.08 : 0.12);
      }
    }
    return { stop() { try { master.disconnect(); } catch (e) {} } };
  }

  return { getCtx, start };
})();
