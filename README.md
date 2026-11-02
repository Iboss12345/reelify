# Reelify

Upload photos and video clips and get a viral-style vertical reel (9:16) you can post on Instagram/TikTok.

Everything runs in the browser: no server, no account, no cost.

## How to use
1. Double-click `index.html` (open it in **Chrome or Edge**).
2. Drop in photos/clips.
3. Pick a style: **AI picks**, **Describe it** (e.g. `fast hype edit, vintage, "summer was unreal"`), or a **Template**.
4. Press **Generate**, then **Download**. Keep the tab open while it records (it records in real time).

## How it works
- `js/templates.js`: 8 templates based on popular Reel formats (Beat Drop, POV, Photo Dump, Before/After, Cinematic, Top List, Glitch, Soft Aesthetic), the "AI director" that picks one from your media, and the free keyword-based style matcher.
- `js/renderer.js`: plans the edit on the beat, draws frames (motion, transitions, colour grade, text) and records the video.
- `js/music.js`: generates a royalty-free beat that matches the cuts.
- `js/app.js`: page controls.

## Notes
- Instagram doesn't allow apps to search for or download trending videos, so the templates are built in instead of scraped.
- Chrome/Edge save `.mp4`. Some other browsers only save `.webm`.
- iPhone HEIC photos need to be saved as JPG first.
