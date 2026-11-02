# Reelify

Upload photos and video clips and get a viral-style vertical reel (9:16) you can post on Instagram/TikTok.

Everything runs in the browser: no server, no account, no cost.

## How to use
1. Double-click `index.html` (open it in **Chrome or Edge**).
2. Drop in photos/clips.
3. Pick a style: **AI picks**, **Describe it** (e.g. `fast hype edit, vintage, "summer was unreal"`), or a **Template**.
4. Press **Generate**, then **Download**. Keep the tab open while it records (it records in real time).

## How it works
- `js/templates.js`: 10 templates based on trending CapCut/Reels edit styles (Velocity, Beat Drop, 3D Photo Zoom, Photo Flash, POV, Glow Up, Cinematic, Top List, Glitch, Soft Aesthetic), the "AI director" that picks one from your media, and the free keyword-based style matcher.
- `js/renderer.js`: plans the edit on the beat and draws it with a virtual camera: speed-ramp zooms, spin/whip/zoom transitions with real motion blur, fake 3D depth, beat pulses and shake, RGB split, glitch, light leaks, bloom, film grain, word-by-word captions. Then records the video.
- `js/music.js`: generates a royalty-free track (EDM build + drop, phonk, pop, cinematic, lo-fi) with reverb and sidechain, locked to the cuts.
- `js/app.js`: page controls.

## Notes
- Instagram doesn't allow apps to search for or download trending videos, so the templates are built in instead of scraped.
- Chrome/Edge save `.mp4`. Some other browsers only save `.webm`.
- iPhone HEIC photos need to be saved as JPG first.
