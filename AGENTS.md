# AGENTS.md

Instructions for coding agents working in this repo (Claude Code, Codex, Cursor, …). Humans: see [README.md](README.md).

## Repo map

- `motion/`: animation components + render pipeline. **Start here for any animation / motion-graphics request.** Read `motion/SKILL.md` first.
- `animation/`: showcase films made by AI (full source code or one prompt each). Not part of the toolkit and unrelated to `motion/`. Ignore it unless the user asks about one of these films; don't copy code from it into motion projects.
- Other modules (rough cut, BGM / SFX, covers, titles) are not released yet. Don't invent them.

## Making a video with motion/

1. `cd motion && npm install` (once).
2. `bash scripts/new_project.sh <dir>` creates `timeline.js` (all times), `scene.js` (shots), `index.html`.
3. Put every time in `timeline.js` as a `T` table, then build shots in `scene.js` from `XM.*` / `XS.*` components. Each component's doc is in `motion/docs/components/`.
4. Check stills first: `node scripts/render_frames.js <dir> --stills 1 3.5 7`. Look at the PNGs in `<dir>/qa/`.
5. Full build: `bash scripts/build.sh <dir>` (frames → sfx → mp4).

## Hard rules

- `render(t)` is a pure function of time: no `Date.now()`, no `Math.random()` without a seed, no state carried between frames. Any frame must render the same alone.
- Default spec 1920×1080, 30 fps, H.264 + AAC 48 kHz.
- One subject plus at most one text group per shot. No decorative micro-text.
- Keyword highlights are fluorescent yellow. No boxes or brackets.
- Screenshots are never scaled up more than 1.1×.
- Photosensitivity: don't alternate dark and light full frames more than 3 times per second.
- Use only images, fonts and audio the user owns or that carry a license allowing it. Never ship fonts without their license file.
- Render in the foreground and check output frame counts with `ffprobe`. Don't wait on a background job without polling it.

## Opening a PR

Follow `.github/PULL_REQUEST_TEMPLATE.md`. Anything that changes how a video looks or sounds needs full MP4 videos with sound, not stills or GIFs: a fix needs the same demo before and after (same scene, same parameters), built with `build.sh`; a new component needs its full demo video, when to use it, a minimal usage snippet and its style.

**Never tick the "Human review" box.** Leave it unticked and tell the user to watch every video start to finish, with sound, read every changed line, and tick it themselves. PRs without it are not reviewed.

## Don't

- Don't edit files in `motion/components/` for one video. Copy into the project and change the copy.
- Don't add new top-level folders or modules unless asked.
