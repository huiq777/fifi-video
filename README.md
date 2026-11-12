# fifi-video

Video tools that are just code. Every frame is HTML / Canvas / JS, rendered frame by frame in Chrome. No generative video models.

<p align="center"><b>English</b> · <a href="README.zh-CN.md">中文</a> · <a href="AGENTS.md">For AI agents</a></p>

<p align="center"><img src="assets/promo.gif" width="100%"></p>
<p align="center"><a href="https://x.com/jay187950667114/status/2116361956378460558">Full promo @ X</a> <!-- TODO: Bilibili · YouTube links --></p>

## What's open

| | Module | Status |
|---|---|---|
| <img src="assets/motion-components.jpg" width="360"> | **[motion](motion/)**<br>29 animation components + render pipeline | ✅ v0.1 |
| | Rough cut for talking-head videos | soon |
| | BGM & sound effects | soon |
| | Cover prompts | soon |
| | Titles | soon |

## Why these components

- **Hand-picked with human feedback, RLHF-style.** I built each one through rounds of render → frame-by-frame review → rating → fix. Only the ones rated A or B ship; the rest were cut. That's why they don't look AI-made.
- **Reusable.** A component is only a frame. Words, images, colors and timing are all parameters, so the same component works for any topic.
- **Any AI can use them.** The design lives in the components. The agent only fills in words and times, so you don't need the newest model. Any coding agent that can read files and run shell commands will do. Tested: given only this repo, Claude Sonnet 5.5 and Claude Haiku 5.5 each made a 15-second promo that passed every build check.

## Quick start

Point your coding agent (Claude Code, Codex, Cursor…) at this repo and say:

> Use fifi-video/motion to make a 10-second 1920×1080 intro that says "Hello, world".

Or by hand:

```bash
cd motion && npm install
bash scripts/new_project.sh ../my-video
bash scripts/build.sh ../my-video      # frames → sound → my-video.mp4
```

Needs Node 18+, Google Chrome, Python 3 (numpy), ffmpeg.

## Showcase films (separate from the toolkit)

[`animation/`](animation/) holds a few finished films made by AI, each with its full source code or the prompt behind it. They are not part of fifi-video: they don't use `motion/`, and nothing in this repo depends on them. **You don't need them to use the toolkit**, so you can clone without that folder:

```bash
git clone --filter=blob:none --sparse https://github.com/huiq777/fifi-video.git
cd fifi-video && git sparse-checkout set motion
```

## Contributing

Bug reports, fixes and new components are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Code: [MIT](LICENSE). Bundled fonts keep their own OFL / Apache licenses (`motion/components/explainer/xm-assets/fonts/`).

Made by 小火火Fifi.
