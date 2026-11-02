// Built-in templates, modelled on edit styles trending on Reels / TikTok / CapCut:
// velocity speed-ramps, beat-synced reveals, 3D photo zoom, photo flash, POV captions,
// glow-up reveals, cinematic travel, countdowns, glitch hype and soft aesthetic.
//
// moves:       camera motion inside a shot (picked per shot)
// transitions: how one shot hands over to the next (picked per cut, never twice in a row)
// pulse:       zoom/shake bump on the beat
// fx:          bloom, grain, vignette, glow, leak, rgb (constant RGB split), rgbMotion (RGB split
//              on fast moves), glitch (beat glitches)
// clipSpeed:   ramp (slow-mo then fast), slow (0.5x) for video clips
window.TEMPLATES = [
  {
    id: 'velocity', name: 'Velocity Edit', emoji: '🏎️',
    desc: 'Slow-mo creep, then a hard speed-ramp zoom into every cut.',
    bpm: 130, beats: 2, videoBeats: 4,
    moves: ['velocity'], pulse: { amp: 0.04, shake: 8, every: 1 },
    transitions: ['zoom', 'spin', 'zoom', 'shake'], clipSpeed: 'ramp',
    grade: 'contrast(1.25) saturate(1.3)', tone: 'cool',
    fx: ['rgbMotion', 'grain', 'vignette'],
    textStyle: 'outline', hook: 'this one hits *different*', hookMode: 'intro', hookAnim: 'words',
    music: 'phonk',
  },
  {
    id: 'beatdrop', name: 'Beat Drop', emoji: '💥',
    desc: '3D tease with a build-up, then a cut on every beat.',
    bpm: 128, introBeats: 8, beats: 1, videoBeats: 2,
    introMove: 'drift', moves: ['punch', 'punch', 'tilt'], depth: 'intro',
    pulse: { amp: 0.07, shake: 12, every: 1, fromDrop: true },
    transitions: ['zoom', 'whip', 'glitch', 'flash', 'spin'], dropTransition: 'flash',
    grade: 'contrast(1.18) saturate(1.3)',
    fx: ['bloom', 'rgbMotion', 'grain'],
    textStyle: 'outline', hook: 'wait for the *drop* 👀', hookMode: 'intro', hookAnim: 'words',
    music: 'drop',
  },
  {
    id: 'depth3d', name: '3D Photo Zoom', emoji: '🌀',
    desc: 'Photos pop out in fake 3D with smooth zoom-through cuts.',
    bpm: 96, beats: 4, videoBeats: 4,
    moves: ['drift', 'pullback', 'rise'], depth: 'all', pulse: { amp: 0.015, every: 4 },
    transitions: ['zoom', 'zoom', 'dissolve', 'spin'],
    grade: 'contrast(1.1) saturate(1.2)', tone: 'warm',
    fx: ['bloom', 'grain', 'vignette'],
    textStyle: 'minimal', hook: 'core memories unlocked', hookMode: 'intro', hookAnim: 'words',
    music: 'cinematic',
  },
  {
    id: 'flash', name: 'Photo Flash', emoji: '📸',
    desc: 'Rapid-fire polaroids with a camera flash on every beat.',
    bpm: 120, beats: 1, videoBeats: 2,
    moves: ['punch', 'tilt'], pulse: { amp: 0.03, every: 1 },
    transitions: ['flash'], layout: 'polaroid',
    grade: 'contrast(1.08) saturate(1.15)',
    fx: ['grain'],
    textStyle: 'outline', hook: 'photo dump 📸', hookMode: 'intro', hookAnim: 'pop',
    music: 'pop',
  },
  {
    id: 'pov', name: 'POV Story', emoji: '🎥',
    desc: '"POV:" caption typed word-by-word over snappy whip cuts.',
    bpm: 100, beats: 2, videoBeats: 4,
    moves: ['drift', 'pan', 'rise'], pulse: { amp: 0.02, every: 2 },
    transitions: ['whip', 'whipUp', 'zoom'],
    grade: 'contrast(1.06) saturate(1.12)',
    fx: ['grain'],
    textStyle: 'box', hook: 'POV: you finally said *yes* to the plan', hookMode: 'always', hookAnim: 'words',
    music: 'pop',
  },
  {
    id: 'beforeafter', name: 'Glow Up', emoji: '🔁',
    desc: 'Washed-out "before", then a spin into the full-colour reveal.',
    bpm: 110, introBeats: 6, beats: 3, videoBeats: 4,
    introMove: 'drift', moves: ['punch', 'pullback'],
    pulse: { amp: 0.05, shake: 10, every: 1, fromDrop: true },
    transitions: ['spin', 'zoom'], dropTransition: 'spin',
    grade: 'contrast(1.12) saturate(1.3)',
    fx: ['bloom', 'grain'],
    textStyle: 'big', hook: 'the glow up is *real*', hookMode: 'always', hookAnim: 'words',
    labels: 'beforeafter', music: 'drop',
  },
  {
    id: 'travel', name: 'Cinematic', emoji: '🎬',
    desc: 'Bars slide open, teal-orange grade, light-leak transitions.',
    bpm: 90, beats: 4, videoBeats: 6,
    moves: ['drift', 'pan', 'pullback', 'rise'],
    transitions: ['flare', 'dissolve', 'whip'], clipSpeed: 'slow',
    grade: 'contrast(1.12) saturate(1.15)', tone: 'tealorange', layout: 'letterbox',
    fx: ['grain', 'vignette', 'bloom'],
    textStyle: 'cinema', hook: 'take me back', hookMode: 'intro', hookAnim: 'fade',
    music: 'cinematic',
  },
  {
    id: 'countdown', name: 'Top List', emoji: '🔢',
    desc: 'Numbered countdown, #N slams in, whip to the next.',
    bpm: 115, beats: 4, videoBeats: 4,
    moves: ['punch', 'drift'], pulse: { amp: 0.03, every: 2 },
    transitions: ['whip', 'zoom', 'whipUp'],
    grade: 'contrast(1.1) saturate(1.15)',
    fx: ['grain'],
    textStyle: 'box', hook: 'my top {n} moments this year', hookMode: 'always', hookAnim: 'words',
    labels: 'countdown', music: 'pop',
  },
  {
    id: 'glitch', name: 'Glitch Hype', emoji: '👾',
    desc: 'RGB-split, beat glitches, shake on every hit.',
    bpm: 140, beats: 1, videoBeats: 2,
    moves: ['punch', 'tilt'], pulse: { amp: 0.08, shake: 18, every: 1 },
    transitions: ['glitch', 'zoom', 'flash', 'glitch'],
    grade: 'contrast(1.35) saturate(1.45)', tone: 'cool',
    fx: ['glitch', 'rgb', 'grain', 'vignette'],
    textStyle: 'outline', hook: 'no thoughts just *vibes* ⚡', hookMode: 'intro', hookAnim: 'words',
    music: 'phonk',
  },
  {
    id: 'aesthetic', name: 'Soft Aesthetic', emoji: '🌸',
    desc: 'Dreamy bloom, film grain, slow dissolves (memory-rewind feel).',
    bpm: 80, beats: 4, videoBeats: 4,
    moves: ['pullback', 'drift', 'rise'],
    transitions: ['dissolve', 'zoom'], clipSpeed: 'slow',
    grade: 'brightness(1.06) saturate(0.85) contrast(0.94)', tone: 'warm',
    fx: ['bloom', 'glow', 'grain'],
    textStyle: 'minimal', hook: 'little moments lately', hookMode: 'intro', hookAnim: 'fade',
    music: 'dreamy',
  },
];

// Extra hook lines so every Remix can say something different.
const ALT_HOOKS = {
  velocity: ['POV: you hit the *perfect* angle', 'speed was *never* the problem', 'watch till the *end*'],
  beatdrop: ['it gets *better* every second', 'turn your *sound* on 🔊', 'this beat >>> *everything*'],
  depth3d: ['this felt like a *movie*', 'pov: you live here *now*', 'save this for *later* 📌'],
  flash: ['recent *favourites* 📸', 'camera roll *cleanout*', 'no context, just *vibes*'],
  pov: ['POV: the plan *actually* worked', 'POV: you said *one* more trip', 'POV: main character *energy*'],
  beforeafter: ['wait for the *after*', 'day 1 vs *now*', 'the *transformation* 😮'],
  travel: ["tell me this isn't *real*", 'somewhere *worth* remembering', "i'd go back in a *heartbeat*"],
  countdown: ['ranking my top {n} *ever*', 'number 1 will *shock* you', 'top {n}, no *skips*'],
  glitch: ['main character *mode* ⚡', 'system *overload*', 'too much *aura* ⚡'],
  aesthetic: ['soft days, slow *moments*', 'a quiet kind of *happy*', 'romanticise the *little* things'],
};
TEMPLATES.forEach((t) => { t.hooks = [t.hook].concat(ALT_HOOKS[t.id] || []); });

window.Director = (function () {
  const DEFAULTS = {
    introBeats: 0, introMove: null, depth: false, pulse: null, dropTransition: null, clipSpeed: null,
    tone: null, layout: 'full', fx: [], hookAnim: 'pop', labels: null, outro: '',
  };
  const byId = (id) => TEMPLATES.find((t) => t.id === id);
  const clone = (t) => Object.assign({}, DEFAULTS, JSON.parse(JSON.stringify(t)));

  // Looks at the uploaded media and picks the template that fits best.
  // `exclude` lets Remix skip the template it used last time.
  function autoPick(stats, exclude = []) {
    const score = {};
    const why = {};
    TEMPLATES.forEach((t) => { score[t.id] = 1 + Math.random() * 1.2; why[t.id] = []; });
    const add = (id, pts, reason) => { score[id] += pts; if (reason) why[id].push(reason); };
    const { count, videos, landscape, bright, sat } = stats;

    if (count === 1) {
      add('depth3d', 2.5, 'One photo, so a slow 3D zoom makes it feel alive.');
      add('aesthetic', 2, 'One item, so a dreamy edit lets it breathe.');
    }
    if (count === 2) add('beforeafter', 6, 'Exactly 2 items is perfect for a glow-up reveal.');
    if (count >= 3 && count <= 7) {
      add('velocity', 2, `${count} items is the sweet spot for a velocity edit.`);
      add('depth3d', 1.5, `${count} items gives each photo time for a 3D zoom.`);
      add('countdown', 1.5, `${count} items makes a tight "top ${count}" countdown.`);
      add('pov', 1, `${count} items is a good length for a POV story.`);
    }
    if (count >= 8) {
      add('beatdrop', 3, `${count} items gives plenty of beat-synced cuts after the drop.`);
      add('flash', 2.5, `${count} items is a classic rapid-fire photo dump.`);
    }
    if (videos / count >= 0.5) {
      add('velocity', 2, 'Mostly video clips, perfect for slow-mo speed ramps.');
      add('glitch', 1.5, 'Mostly video clips, which suit high-energy glitch cuts.');
    }
    if (landscape / count >= 0.5) add('travel', 3, 'Mostly wide/landscape shots, which look great with cinematic bars.');
    if (sat > 0.42) {
      add('beatdrop', 1, 'Very colourful media pops on fast cuts.');
      add('travel', 1, 'Rich colours suit a teal-orange cinematic grade.');
      add('depth3d', 1, 'Colourful photos look great with a 3D pop-out.');
    }
    if (sat < 0.25 && bright > 0.5) add('aesthetic', 3, 'Soft, light, muted colours match the dreamy aesthetic look.');
    if (bright < 0.35) {
      add('glitch', 1.5, 'Darker footage suits a moody glitch edit.');
      add('velocity', 1.5, 'Darker footage suits a moody velocity edit.');
    }

    const ranked = TEMPLATES.slice().sort((a, b) => score[b.id] - score[a.id]);
    const best = ranked.find((t) => !exclude.includes(t.id)) || ranked[0];
    const reasons = why[best.id].length ? why[best.id] : ['A solid all-rounder for this mix of media.'];
    return { template: clone(best), reasons };
  }

  // Free, offline "describe a style" matcher: keywords → base template + tweaks.
  const BASE_WORDS = {
    velocity: ['velocity', 'speed ramp', 'speedramp', 'slow mo', 'slowmo', 'slow-mo', 'phonk', 'car', 'gym', 'sport'],
    beatdrop: ['drop', 'beat', 'build up', 'buildup', 'hype', 'party'],
    depth3d: ['3d', 'parallax', 'depth', 'pop out', 'memories'],
    flash: ['dump', 'polaroid', 'scrapbook', 'recap', 'flash', 'rapid'],
    pov: ['pov', 'story', 'relatable', 'storytime'],
    beforeafter: ['before', 'after', 'glow up', 'glowup', 'transformation', 'reveal', 'makeover'],
    travel: ['travel', 'cinematic', 'movie', 'film', 'trip', 'vacation', 'holiday', 'vlog', 'adventure'],
    countdown: ['top', 'countdown', 'ranking', 'ranked', 'list', 'best of', 'favorite', 'favourite'],
    glitch: ['glitch', 'gaming', 'chaos', 'chaotic', 'crazy', 'insane', 'y2k'],
    aesthetic: ['aesthetic', 'soft', 'dreamy', 'pastel', 'cozy', 'cosy', 'calm', 'chill', 'romantic', 'wedding', 'rewind'],
  };

  // ---------- custom edits (no format picked: built only from what the user describes) ----------

  const LOOKS = {
    natural: { grade: 'contrast(1.06) saturate(1.1)' },
    vivid: { grade: 'contrast(1.15) saturate(1.45)' },
    dark: { grade: 'brightness(0.78) contrast(1.2) saturate(0.75)', tone: 'cool' },
    bw: { grade: 'grayscale(1) contrast(1.25)' },
    vintage: { grade: 'sepia(0.45) contrast(1.1) saturate(0.9)', tone: 'warm' },
    warm: { grade: 'saturate(1.3) contrast(1.05)', tone: 'warm' },
    cool: { grade: 'saturate(0.9) contrast(1.2) brightness(0.92)', tone: 'cool' },
    cinematic: { grade: 'contrast(1.12) saturate(1.15)', tone: 'tealorange' },
    dreamy: { grade: 'brightness(1.06) saturate(0.85) contrast(0.94)', tone: 'warm' },
  };
  const MOVES = ['drift', 'pullback', 'pan', 'rise', 'tilt', 'velocity', 'punch', 'still'];
  const TRANS = ['cut', 'zoom', 'spin', 'whip', 'whipUp', 'flash', 'flare', 'shake', 'glitch', 'dissolve'];
  const FX = ['bloom', 'grain', 'vignette', 'glow', 'rgb', 'rgbMotion', 'glitch'];
  const MUSIC = ['drop', 'phonk', 'pop', 'cinematic', 'dreamy'];
  const TEXT_STYLES = ['outline', 'box', 'minimal', 'big', 'cinema'];
  const BY_ENERGY = {
    low: { bpm: 84, music: 'dreamy', moves: ['drift', 'pullback', 'rise'], transitions: ['dissolve', 'flare'], fx: ['grain', 'vignette'], pulse: null },
    medium: { bpm: 108, music: 'pop', moves: ['drift', 'pan', 'punch'], transitions: ['zoom', 'whip', 'cut'], fx: ['grain', 'vignette'], pulse: { amp: 0.02, every: 2 } },
    high: { bpm: 130, music: 'drop', moves: ['punch', 'velocity', 'tilt'], transitions: ['zoom', 'whip', 'flash', 'shake'], fx: ['rgbMotion', 'grain', 'vignette'], pulse: { amp: 0.05, shake: 10, every: 1, fromDrop: true } },
  };
  const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
  const someOf = (v, list) => { const a = (Array.isArray(v) ? v : []).filter((x) => list.includes(x)); return a.length ? a : null; };
  const rand = (a) => a[Math.floor(Math.random() * a.length)];

  // Colour filter for one shot, e.g. a dark "before" shot then a vivid reveal.
  const look = (name) => (LOOKS[name] ? LOOKS[name].grade : null);

  // edit: the AI's design ({energy, music, bpm, look, layout, textStyle, transitions, moves, fx, hook}).
  // story: shots keep their order and their own timing / move / transition (for "Just describe it").
  // remix: same story and timing, but a fresh camera, transitions, look and music.
  function custom(edit = {}, { story = false, remix = false } = {}) {
    const energy = oneOf(edit.energy, ['low', 'medium', 'high'], 'medium');
    const E = BY_ENERGY[energy];
    const lookName = remix ? rand(Object.keys(LOOKS)) : oneOf(edit.look, Object.keys(LOOKS), 'natural');
    const tpl = clone({
      id: 'custom', name: 'Custom edit', emoji: '✨', desc: 'Designed only from your description.',
      story, followShots: !remix,
      bpm: Math.max(70, Math.min(150, Math.round(+edit.bpm || E.bpm))), beats: 2, videoBeats: 4,
      moves: (!remix && someOf(edit.moves, MOVES)) || E.moves,
      transitions: (!remix && someOf(edit.transitions, TRANS)) || E.transitions,
      dropTransition: 'flash',
      pulse: E.pulse,
      grade: LOOKS[lookName].grade, tone: LOOKS[lookName].tone || null,
      layout: edit.layout === 'letterbox' ? 'letterbox' : 'full',
      fx: someOf(edit.fx, FX) || E.fx,
      textStyle: remix ? rand(TEXT_STYLES) : oneOf(edit.textStyle, TEXT_STYLES, 'box'),
      hook: edit.hook || '', hookMode: edit.hook ? 'intro' : 'none', hookAnim: 'words',
      music: remix ? rand(MUSIC) : oneOf(edit.music, MUSIC, E.music),
      musicPrompt: !remix && typeof edit.musicPrompt === 'string' ? edit.musicPrompt.slice(0, 300) : null,
    });
    tpl.hooks = tpl.hook ? [tpl.hook] : [];
    tpl.energy = energy; tpl.lookName = lookName;
    return tpl;
  }

  // Offline guess at a custom edit from the words in a description (when the AI is unavailable).
  function guess(text) {
    const s = ' ' + text.toLowerCase() + ' ';
    const any = (words) => words.some((w) => s.includes(w));
    const energy = any(['fast', 'hype', 'energetic', 'gym', 'workout', 'jacked', 'sport', 'party', 'intense', 'epic', 'crazy', 'glow up', 'transformation', 'fight', 'race'])
      ? 'high'
      : any(['calm', 'chill', 'sad', 'soft', 'slow', 'cozy', 'cosy', 'peaceful', 'dreamy', 'romantic', 'lonely', 'quiet', 'relax'])
        ? 'low' : 'medium';
    const lookName = any(['black and white', 'b&w', 'monochrome']) ? 'bw'
      : any(['vintage', 'retro', '90s', '80s', 'nostalgic']) ? 'vintage'
        : any(['cinematic', 'movie', 'film']) ? 'cinematic'
          : any(['dark', 'night', 'sad', 'moody', 'horror', 'scary']) ? 'dark'
            : any(['dreamy', 'soft', 'pastel']) ? 'dreamy'
              : any(['warm', 'sunset', 'summer', 'golden']) ? 'warm'
                : any(['vibrant', 'colorful', 'colourful', 'neon']) ? 'vivid' : 'natural';
    return { energy, look: lookName, layout: any(['cinematic', 'movie', 'widescreen']) ? 'letterbox' : 'full' };
  }

  // fallback: template id (e.g. the AI's suggestion) or a template object to use when the text
  // names no format.
  function parseStyle(text, stats, fallback) {
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
    } else if (fallback && typeof fallback === 'object') {
      tpl = fallback;
      notes.push('No format named, so this edit is built only from what you described.');
    } else if (fallback && byId(fallback)) {
      tpl = clone(byId(fallback));
      notes.push(`The AI director chose a "${tpl.name}" edit for this idea.`);
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
      tpl.moves = ['drift', 'pullback', 'pan'];
      tpl.transitions = ['dissolve', 'zoom'];
      notes.push('Slowed it down: longer shots and softer transitions.');
    }

    // Look
    if (['black and white', 'black & white', 'b&w', 'monochrome', 'grayscale', 'greyscale'].some(has)) {
      tpl.grade = 'grayscale(1) contrast(1.25)'; tpl.tone = null; notes.push('Black & white grade.');
    } else if (['vintage', 'retro', '90s', '80s', 'old school', 'nostalgic'].some(has)) {
      tpl.grade = 'sepia(0.45) contrast(1.1) saturate(0.9)'; tpl.tone = 'warm'; notes.push('Vintage film grade.');
    } else if (['warm', 'golden', 'sunset', 'summer'].some(has)) {
      tpl.grade = 'saturate(1.3) contrast(1.05)'; tpl.tone = 'warm'; notes.push('Warm golden grade.');
    } else if (['cool', 'blue', 'winter', 'cold', 'moody', 'dark'].some(has)) {
      tpl.grade = 'saturate(0.9) contrast(1.2) brightness(0.92)'; tpl.tone = 'cool'; notes.push('Cool, moody grade.');
    } else if (['vibrant', 'colorful', 'colourful', 'bright', 'saturated'].some(has)) {
      tpl.grade = 'contrast(1.15) saturate(1.5)'; notes.push('Extra-vibrant colours.');
    }
    const addFx = (f) => { if (!tpl.fx.includes(f)) tpl.fx.push(f); };
    if (['grain', 'film', 'vintage', 'retro'].some(has)) addFx('grain');

    // Layout & motion
    if (['polaroid', 'scrapbook'].some(has)) { tpl.layout = 'polaroid'; notes.push('Polaroid card layout.'); }
    if (['cinematic', 'movie', 'widescreen'].some(has)) { tpl.layout = 'letterbox'; notes.push('Cinematic letterbox bars.'); }
    if (['3d', 'parallax', 'depth'].some(has)) { tpl.depth = 'all'; notes.push('Fake 3D pop-out on every photo.'); }
    if (['shake', 'shaky', 'chaos', 'chaotic'].some(has)) {
      tpl.pulse = Object.assign({ amp: 0.05, every: 1 }, tpl.pulse, { shake: 18 });
      notes.push('Camera shake on every beat.');
    }
    if (has('glitch')) { addFx('glitch'); addFx('rgb'); }
    if (['speed ramp', 'velocity', 'slow mo', 'slowmo', 'slow-mo'].some(has)) {
      tpl.moves = ['velocity']; tpl.clipSpeed = 'ramp'; notes.push('Speed-ramp zooms into every cut.');
    }

    // Transitions
    if (['smooth', 'fade', 'dissolve'].some(has)) { tpl.transitions = ['dissolve', 'zoom']; notes.push('Smooth dissolve/zoom transitions.'); }
    if (['flash', 'strobe'].some(has)) { tpl.transitions = ['flash', 'zoom']; notes.push('Flash transitions.'); }
    if (['swipe', 'whip', 'slide'].some(has)) { tpl.transitions = ['whip', 'whipUp']; notes.push('Whip-pan transitions.'); }
    if (['spin', 'rotate'].some(has)) { tpl.transitions = ['spin', 'zoom']; notes.push('Spin transitions.'); }
    if (['zoom'].some(has)) { tpl.transitions = ['zoom']; notes.push('Zoom-through transitions.'); }

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

  return { autoPick, parseStyle, byId, clone, custom, guess, look };
})();
