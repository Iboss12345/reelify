// Built-in templates, modelled on formats that regularly go viral on Instagram Reels / TikTok.
// Each template is just a recipe: tempo, how many beats each clip lasts, motion, transitions,
// colour grade, layout, text style and music style.
window.TEMPLATES = [
  {
    id: 'beatdrop', name: 'Beat Drop', emoji: '💥',
    desc: 'Slow tease, then a rapid cut on every beat.',
    bpm: 128, introBeats: 8, beats: 1, videoBeats: 2,
    introEffect: 'kenburns', effect: 'punch', transition: 'flash',
    grade: 'contrast(1.15) saturate(1.25)', layout: 'full', fx: null,
    textStyle: 'outline', hook: 'wait for the drop 👀', hookMode: 'intro',
    labels: null, outro: '', music: 'drop',
  },
  {
    id: 'pov', name: 'POV Story', emoji: '🎥',
    desc: 'A "POV:" caption over quick, relatable cuts.',
    bpm: 100, introBeats: 0, beats: 2, videoBeats: 4,
    effect: 'kenburns', transition: 'cut',
    grade: 'contrast(1.05) saturate(1.1)', layout: 'full', fx: null,
    textStyle: 'box', hook: 'POV: you finally said yes to the plan', hookMode: 'always',
    labels: null, outro: '', music: 'pop',
  },
  {
    id: 'photodump', name: 'Photo Dump', emoji: '📸',
    desc: 'Polaroid-style cards flicking by fast.',
    bpm: 120, introBeats: 0, beats: 1, videoBeats: 2,
    effect: 'punch', transition: 'cut',
    grade: 'contrast(1.05) saturate(1.1)', layout: 'polaroid', fx: null,
    textStyle: 'outline', hook: 'photo dump 📸', hookMode: 'intro',
    labels: null, outro: '', music: 'pop',
  },
  {
    id: 'beforeafter', name: 'Before / After', emoji: '🔁',
    desc: 'Show the "before", then whip into the reveal.',
    bpm: 110, introBeats: 6, beats: 3, videoBeats: 4,
    introEffect: 'kenburns', effect: 'punch', transition: 'whip',
    grade: 'contrast(1.1) saturate(1.2)', layout: 'full', fx: null,
    textStyle: 'big', hook: 'the glow up is real', hookMode: 'always',
    labels: 'beforeafter', outro: '', music: 'drop',
  },
  {
    id: 'travel', name: 'Cinematic', emoji: '🎬',
    desc: 'Movie bars, warm grade, slow drifting shots.',
    bpm: 90, introBeats: 0, beats: 4, videoBeats: 6,
    effect: 'kenburns', transition: 'fade',
    grade: 'sepia(0.15) saturate(1.2) contrast(1.1)', layout: 'letterbox', fx: 'vignette',
    textStyle: 'cinema', hook: 'take me back', hookMode: 'intro',
    labels: null, outro: '', music: 'cinematic',
  },
  {
    id: 'countdown', name: 'Top List', emoji: '🔢',
    desc: 'Numbered countdown, #N down to #1.',
    bpm: 115, introBeats: 0, beats: 4, videoBeats: 4,
    effect: 'punch', transition: 'zoom',
    grade: 'contrast(1.1) saturate(1.15)', layout: 'full', fx: null,
    textStyle: 'box', hook: 'my top {n} moments this year', hookMode: 'always',
    labels: 'countdown', outro: '', music: 'pop',
  },
  {
    id: 'glitch', name: 'Glitch Hype', emoji: '⚡',
    desc: 'Shaky, glitchy, high-energy cuts.',
    bpm: 140, introBeats: 0, beats: 1, videoBeats: 2,
    effect: 'shake', transition: 'flash',
    grade: 'contrast(1.3) saturate(1.4)', layout: 'full', fx: 'glitch',
    textStyle: 'outline', hook: 'no thoughts just vibes ⚡', hookMode: 'intro',
    labels: null, outro: '', music: 'glitch',
  },
  {
    id: 'aesthetic', name: 'Soft Aesthetic', emoji: '🌸',
    desc: 'Dreamy pastel grade, slow blur transitions.',
    bpm: 80, introBeats: 0, beats: 4, videoBeats: 4,
    effect: 'zoomout', transition: 'blur',
    grade: 'brightness(1.08) saturate(0.85) contrast(0.92) sepia(0.12)', layout: 'full', fx: 'glow',
    textStyle: 'minimal', hook: 'little moments lately', hookMode: 'intro',
    labels: null, outro: '', music: 'dreamy',
  },
];

window.Director = (function () {
  const byId = (id) => TEMPLATES.find((t) => t.id === id);
  const clone = (t) => JSON.parse(JSON.stringify(t));

  // Looks at the uploaded media and picks the template that fits best.
  function autoPick(stats) {
    const score = {};
    const why = {};
    TEMPLATES.forEach((t) => { score[t.id] = 1 + Math.random() * 0.8; why[t.id] = []; });
    const add = (id, pts, reason) => { score[id] += pts; if (reason) why[id].push(reason); };
    const { count, videos, landscape, bright, sat } = stats;

    if (count === 1) {
      add('aesthetic', 2, 'Only one item, so a slow, dreamy edit lets it breathe.');
      add('pov', 2, 'Only one item, so a POV caption carries the story.');
    }
    if (count === 2) add('beforeafter', 6, 'Exactly 2 items is perfect for a before/after reveal.');
    if (count >= 3 && count <= 6) {
      add('countdown', 2, `${count} items makes a tight "top ${count}" countdown.`);
      add('pov', 1.5, `${count} items is a good length for a POV story.`);
    }
    if (count >= 8) {
      add('photodump', 3, `${count} items is a classic photo dump.`);
      add('beatdrop', 2.5, `${count} items gives plenty of beat-synced cuts after the drop.`);
    }
    if (videos / count >= 0.5) {
      add('glitch', 1.5, 'Mostly video clips, which suit high-energy cuts.');
      add('beatdrop', 1.5, 'Mostly video clips, which hit hard on a beat drop.');
    }
    if (landscape / count >= 0.5) add('travel', 3, 'Mostly wide/landscape shots, which look great with cinematic bars.');
    if (sat > 0.42) {
      add('glitch', 1, 'Very colourful media, so we can push the contrast.');
      add('beatdrop', 1, 'Very colourful media pops on fast cuts.');
      add('travel', 1, 'Rich colours suit a warm cinematic grade.');
    }
    if (sat < 0.25 && bright > 0.5) add('aesthetic', 3, 'Soft, light, muted colours match the pastel aesthetic look.');
    if (bright < 0.35) {
      add('glitch', 1.5, 'Darker footage suits a moody glitch edit.');
      add('travel', 1, 'Darker footage suits a moody cinematic grade.');
    }

    const best = TEMPLATES.slice().sort((a, b) => score[b.id] - score[a.id])[0];
    const reasons = why[best.id].length ? why[best.id] : ['A solid all-rounder for this mix of media.'];
    return { template: clone(best), reasons };
  }

  // Free, offline "describe a style" matcher: keywords → base template + tweaks.
  const BASE_WORDS = {
    beatdrop: ['drop', 'beat', 'build up', 'buildup', 'hype'],
    pov: ['pov', 'story', 'relatable', 'storytime'],
    photodump: ['dump', 'polaroid', 'scrapbook', 'recap', 'collage'],
    beforeafter: ['before', 'after', 'glow up', 'glowup', 'transformation', 'reveal', 'makeover'],
    travel: ['travel', 'cinematic', 'movie', 'film', 'trip', 'vacation', 'holiday', 'vlog', 'adventure'],
    countdown: ['top', 'countdown', 'ranking', 'ranked', 'list', 'best of', 'favorite', 'favourite'],
    glitch: ['glitch', 'gaming', 'chaos', 'chaotic', 'crazy', 'insane', 'phonk', 'gym', 'sport'],
    aesthetic: ['aesthetic', 'soft', 'dreamy', 'pastel', 'cozy', 'cosy', 'calm', 'chill', 'romantic', 'wedding'],
  };

  function parseStyle(text, stats) {
    const s = ' ' + text.toLowerCase() + ' ';
    // "no glitch" / "don't add shaky stuff" shouldn't count as asking for it.
    const negated = (w) => new RegExp(`\\b(no|not|don'?t|without|less)\\s+(\\w+\\s+){0,2}${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(s);
    const has = (w) => s.includes(w) && (w.startsWith('no ') || w.startsWith('without ') || !negated(w));
    const notes = [];

    let bestId = null, bestHits = 0;
    for (const [id, words] of Object.entries(BASE_WORDS)) {
      const hits = words.filter(has).length;
      if (hits > bestHits) { bestHits = hits; bestId = id; }
    }
    let tpl, reasons = [];
    if (bestId) {
      tpl = clone(byId(bestId));
      notes.push(`Your description sounds like a "${tpl.name}" edit, so I used that as the base.`);
    } else {
      const pick = autoPick(stats);
      tpl = pick.template;
      reasons = pick.reasons;
      notes.push(`No specific format mentioned, so I based it on "${tpl.name}" from your media.`);
    }

    // Speed
    if (['fast', 'quick', 'energetic', 'hype', 'rapid', 'intense'].some(has)) {
      tpl.bpm = Math.min(150, Math.round(tpl.bpm * 1.15));
      tpl.beats = Math.max(1, Math.floor(tpl.beats / 2));
      tpl.videoBeats = Math.max(2, Math.floor(tpl.videoBeats / 2));
      notes.push('Sped it up: faster tempo and quicker cuts.');
    }
    if (['slow', 'calm', 'chill', 'relaxed', 'gentle', 'peaceful'].some(has)) {
      tpl.bpm = Math.max(70, Math.round(tpl.bpm * 0.85));
      tpl.beats = Math.max(tpl.beats, 4);
      tpl.videoBeats = Math.max(tpl.videoBeats, 6);
      tpl.transition = tpl.transition === 'cut' || tpl.transition === 'flash' ? 'fade' : tpl.transition;
      notes.push('Slowed it down: longer shots and softer transitions.');
    }

    // Look
    if (['black and white', 'black & white', 'b&w', 'monochrome', 'grayscale', 'greyscale'].some(has)) {
      tpl.grade = 'grayscale(1) contrast(1.25)'; notes.push('Black & white grade.');
    } else if (['vintage', 'retro', '90s', '80s', 'old school', 'nostalgic'].some(has)) {
      tpl.grade = 'sepia(0.45) contrast(1.1) saturate(0.9)'; notes.push('Vintage film grade.');
    } else if (['warm', 'golden', 'sunset', 'summer'].some(has)) {
      tpl.grade = 'sepia(0.25) saturate(1.35) contrast(1.05)'; notes.push('Warm golden grade.');
    } else if (['cool', 'blue', 'winter', 'cold', 'moody', 'dark'].some(has)) {
      tpl.grade = 'hue-rotate(-12deg) saturate(0.9) contrast(1.2) brightness(0.92)'; notes.push('Cool, moody grade.');
    } else if (['vibrant', 'colorful', 'colourful', 'bright', 'saturated'].some(has)) {
      tpl.grade = 'contrast(1.15) saturate(1.5)'; notes.push('Extra-vibrant colours.');
    }

    // Layout & motion
    if (['polaroid', 'scrapbook'].some(has)) { tpl.layout = 'polaroid'; notes.push('Polaroid card layout.'); }
    if (['cinematic', 'movie', 'film', 'widescreen'].some(has)) { tpl.layout = 'letterbox'; notes.push('Cinematic letterbox bars.'); }
    if (['shake', 'shaky', 'chaos', 'chaotic'].some(has)) { tpl.effect = 'shake'; notes.push('Camera-shake on every beat.'); }
    if (has('glitch')) { tpl.fx = 'glitch'; }
    if (['smooth', 'fade', 'dissolve'].some(has)) { tpl.transition = 'fade'; notes.push('Smooth fade transitions.'); }
    if (['flash', 'strobe'].some(has)) { tpl.transition = 'flash'; notes.push('Flash transitions.'); }
    if (['swipe', 'whip', 'slide'].some(has)) { tpl.transition = 'whip'; notes.push('Whip-pan transitions.'); }
    if (['zoom'].some(has)) { tpl.transition = 'zoom'; notes.push('Zoom transitions.'); }

    // Text
    if (['no text', 'no caption', 'without text', 'no words'].some(has)) {
      tpl.hookMode = 'none'; tpl.labels = null; notes.push('No on-screen text.');
    }
    const quoted = text.match(/["“”]([^"“”]{2,80})["“”]/);
    if (quoted) {
      tpl.hook = quoted[1]; if (tpl.hookMode === 'none') tpl.hookMode = 'intro';
      notes.push(`Using your caption: "${quoted[1]}".`);
    }

    return { template: tpl, reasons: notes.concat(reasons) };
  }

  return { autoPick, parseStyle, byId, clone };
})();
