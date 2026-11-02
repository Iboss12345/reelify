// Small synth that generates a royalty-free track in the browser, locked to the edit's beat.
// Styles: drop (EDM build + drop), phonk (808 + cowbell), pop, cinematic, dreamy (lo-fi).
window.Music = (function () {
  let ctx = null, noise = null, impulse = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function noiseBuffer(c) {
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  function reverbImpulse(c) {
    if (!impulse) {
      const len = Math.floor(c.sampleRate * 2.6);
      impulse = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
    }
    return impulse;
  }

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const PROG = {
    minor: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G
    major: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
    dark: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]], // Dm Bb C A
    dreamy: [[53, 57, 60, 64], [57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65]],
  };

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function osc(c, type, freq, t, dur, out) {
    const o = c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.connect(out); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  function noiseHit(c, out, t, type, freq, vol, decay, q = 1) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuffer(c);
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, vol, 0.002, decay);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random()); s.stop(t + decay + 0.05);
  }

  // ---------- instruments ----------

  function kick(c, out, t, vol = 1, boom = false) {
    const g = c.createGain();
    g.connect(out);
    env(g, t, vol, 0.002, boom ? 1.5 : 0.4);
    const o = osc(c, 'sine', 160, t, boom ? 1.6 : 0.5, g);
    o.frequency.exponentialRampToValueAtTime(boom ? 30 : 48, t + (boom ? 0.5 : 0.11));
    noiseHit(c, out, t, 'highpass', 3000, 0.12 * vol, 0.012);
  }

  function clap(c, out, t, vol = 0.5) {
    for (let i = 0; i < 3; i++) noiseHit(c, out, t + i * 0.011, 'bandpass', 1400, vol * 0.7, 0.03, 1.5);
    noiseHit(c, out, t + 0.033, 'bandpass', 1200, vol, 0.18, 1.2);
  }

  const hat = (c, out, t, vol, open) => noiseHit(c, out, t, 'highpass', 8000, vol, open ? 0.22 : 0.04);
  const crash = (c, out, t) => noiseHit(c, out, t, 'highpass', 4500, 0.35, 2.2);

  function tom(c, out, t, vol = 0.8) {
    const g = c.createGain(); g.connect(out);
    env(g, t, vol, 0.003, 0.6);
    const o = osc(c, 'sine', 120, t, 0.7, g);
    o.frequency.exponentialRampToValueAtTime(65, t + 0.4);
    noiseHit(c, out, t, 'lowpass', 600, 0.3 * vol, 0.15);
  }

  function bass(c, out, t, midi, dur, vol = 0.22) {
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 380;
    f.connect(g).connect(out);
    env(g, t, vol, 0.008, dur);
    osc(c, 'sawtooth', hz(midi), t, dur, f);
    osc(c, 'sine', hz(midi - 12), t, dur, g);
  }

  // 808: long sine with a slight pitch dip and soft saturation.
  function bass808(c, out, t, midi, dur, vol = 0.5) {
    const g = c.createGain(), sh = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 2.5); }
    sh.curve = curve;
    sh.connect(g).connect(out);
    env(g, t, vol, 0.004, dur);
    const o = osc(c, 'sine', hz(midi + 5), t, dur, sh);
    o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.06);
  }

  function cowbell(c, out, t, midi, vol = 0.16) {
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = hz(midi) * 1.4; f.Q.value = 1.2;
    f.connect(g).connect(out);
    env(g, t, vol, 0.002, 0.28);
    osc(c, 'square', hz(midi), t, 0.3, f);
    osc(c, 'square', hz(midi) * 1.48, t, 0.3, f);
  }

  function pluck(c, out, t, notes, vol = 0.07) {
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3800, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    f.connect(g).connect(out);
    env(g, t, vol, 0.004, 0.32);
    notes.forEach((n) => [-9, 9].forEach((det) => { osc(c, 'sawtooth', hz(n + 12), t, 0.35, f).detune.value = det; }));
  }

  function pad(c, out, t, notes, dur, cutoff, vol = 0.05) {
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.5, dur / 3));
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(out);
    notes.forEach((n) => [-7, 0, 7].forEach((det) => { osc(c, 'sawtooth', hz(n), t, dur, f).detune.value = det; }));
  }

  function keys(c, out, t, notes, dur, vol = 0.07) {
    const g = c.createGain(); g.connect(out);
    env(g, t, vol, 0.01, dur);
    notes.forEach((n) => { osc(c, 'sine', hz(n), t, dur, g); osc(c, 'triangle', hz(n + 12), t, dur * 0.5, g); });
  }

  function riser(c, out, t, dur) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuffer(c); s.loop = true;
    f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur);
    g.gain.setValueAtTime(0.0001, t + dur + 0.01);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.05);
  }

  // ---------- arrangement ----------

  function start(c, dest, plan, t0) {
    const spb = plan.spb, total = plan.total, style = plan.tpl.music;
    const nBeats = Math.ceil(total / spb) + 1;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    const master = c.createGain();
    master.gain.setValueAtTime(0.8, t0);
    master.gain.setValueAtTime(0.8, t0 + Math.max(0, total - 0.8));
    master.gain.linearRampToValueAtTime(0.0001, t0 + total);
    master.connect(comp).connect(dest);

    const verb = c.createConvolver();
    verb.buffer = reverbImpulse(c);
    const verbOut = c.createGain();
    verbOut.gain.value = style === 'cinematic' || style === 'dreamy' ? 0.5 : 0.25;
    verb.connect(verbOut).connect(master);
    const send = c.createGain(); send.connect(verb);

    const drums = c.createGain(); drums.connect(master);
    // Everything melodic goes through "duck", which dips on each kick (sidechain pump).
    const duck = c.createGain(); duck.connect(master); duck.connect(send);
    duck.gain.setValueAtTime(1, t0);
    const pump = (t, depth = 0.3) => {
      duck.gain.setValueAtTime(depth, t);
      duck.gain.linearRampToValueAtTime(1, t + spb * 0.55);
    };

    const intro = plan.dropTime != null ? plan.introBeats : 0;
    const prog = PROG[{ drop: 'minor', phonk: 'dark', pop: 'major', cinematic: 'dark', dreamy: 'dreamy' }[style] || 'major'];

    if (intro > 0) {
      riser(c, drums, t0, intro * spb);
      crash(c, send, t0 + intro * spb);
      crash(c, drums, t0 + intro * spb);
    }

    for (let b = 0; b < nBeats; b++) {
      const t = t0 + b * spb;
      if (t > t0 + total) break;
      const chord = prog[Math.floor(b / 4) % prog.length];
      const inIntro = b < intro;
      const bar = b % 4;

      if (inIntro) {
        if (bar === 0) pad(c, duck, t, chord, 4 * spb, 700);
        hat(c, drums, t, 0.05);
        // Snare roll that speeds up into the drop.
        if (b >= intro - 4) {
          const left = intro - b, hits = left <= 1 ? 8 : left <= 2 ? 4 : 2;
          for (let h = 0; h < hits; h++) clap(c, drums, t + (h * spb) / hits, 0.15 + 0.3 * (1 - left / 4));
        }
        continue;
      }

      switch (style) {
        case 'drop':
          kick(c, drums, t); pump(t);
          if (bar % 2 === 1) clap(c, drums, t);
          hat(c, drums, t + spb / 2, 0.1, true);
          pluck(c, duck, t + spb / 2, chord);
          bass(c, duck, t + spb / 2, chord[0] - 12, spb * 0.45);
          if (bar === 0) pad(c, duck, t, chord, 4 * spb, 2200, 0.035);
          break;
        case 'phonk': {
          // Half-time: kick on 1 and the "and" of 2, clap on 3, rolling hats, cowbell riff.
          if (bar === 0 || bar === 2) { kick(c, drums, t, 0.9); bass808(c, duck, t, chord[0] - 24, spb * 1.8); pump(t, 0.5); }
          if (bar === 1) kick(c, drums, t + spb / 2, 0.7);
          if (bar === 2) clap(c, drums, t, 0.6);
          for (let h = 0; h < 4; h++) hat(c, drums, t + (h * spb) / 4, h % 2 ? 0.05 : 0.09);
          const riff = [0, 3, 7, 10, 12, 10, 7, 3];
          for (let h = 0; h < 2; h++) cowbell(c, duck, t + (h * spb) / 2, chord[0] + 12 + riff[(bar * 2 + h) % riff.length]);
          break;
        }
        case 'pop':
          if (bar === 0 || bar === 2) { kick(c, drums, t); pump(t, 0.5); }
          if (bar === 2) kick(c, drums, t + spb / 2, 0.7);
          if (bar % 2 === 1) clap(c, drums, t);
          hat(c, drums, t, 0.08); hat(c, drums, t + spb / 2, 0.06);
          pluck(c, duck, t, chord, 0.05); pluck(c, duck, t + spb * 0.75, chord, 0.04);
          bass(c, duck, t, chord[0] - 12, spb * 0.8);
          break;
        case 'cinematic':
          if (bar === 0) { kick(c, drums, t, 1, true); pad(c, duck, t, chord, 4 * spb, 1600, 0.06); bass(c, duck, t, chord[0] - 24, 4 * spb * 0.9, 0.16); }
          if (Math.floor(b / 4) % 2 === 1 && bar >= 2) { tom(c, drums, t); tom(c, send, t, 0.4); tom(c, drums, t + spb / 2, 0.6); }
          for (let h = 0; h < 4; h++) hat(c, drums, t + (h * spb) / 4, 0.025);
          break;
        case 'dreamy':
        default: {
          // Lo-fi: swung, soft drums, warm keys and vinyl crackle.
          const swing = spb * 0.58;
          if (bar === 0) kick(c, drums, t, 0.55);
          if (bar === 2) kick(c, drums, t + swing, 0.45);
          if (bar % 2 === 1) clap(c, drums, t, 0.25);
          hat(c, drums, t, 0.04); hat(c, drums, t + swing, 0.03);
          if (bar === 0) { keys(c, duck, t, chord, 4 * spb); pad(c, duck, t, chord, 4 * spb, 900, 0.025); }
          noiseHit(c, drums, t + Math.random() * spb, 'highpass', 2500, 0.03, 0.01);
          break;
        }
      }
    }
    return { stop() { try { master.disconnect(); verbOut.disconnect(); } catch (e) {} } };
  }

  return { getCtx, start };
})();
