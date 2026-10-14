# landing-flyover

[![skills.sh](https://skills.sh/b/arjunkshah12345-hash/landing-flyover)](https://skills.sh/arjunkshah12345-hash/landing-flyover)

**Your landing page, as a film.** An agent skill that turns any landing page into a 14.5-second 3D fly-over: one continuous camera glides down the page with razor-thin depth of field, cards and photos lift off and stand up toward the lens, it rises overhead to show the whole page, then dives into the hero and lands it as a card under your closing line. Made with code, rendered on your own GPU.

https://github.com/arjunkshah12345-hash/landing-flyover/raw/main/docs/media/flyover.mp4

Site: **https://arjunkshah12345-hash.github.io/landing-flyover/**

## Install

```bash
npx skills add arjunkshah12345-hash/landing-flyover
```

Then ask your agent (Claude Code, Codex, Cursor, …):

> Make a landing flyover of https://your.site

It asks for your brand and logo, a two-part closing line and an optional track, captures the page, shows you seven stills, checks the motion with optical flow, then renders the MP4.

## Requirements

- Node 18+ and Playwright (`npx playwright install chromium`; an installed Chrome is preferred automatically)
- `ffmpeg` on PATH
- Python 3 with `numpy` (score) and `opencv-python-headless` (optional flow check)
- A GPU. The renderer uses ANGLE Metal on macOS, D3D11 on Windows, Vulkan on Linux. About 0.1–0.2 s per frame on an Apple M-series chip.

## How it works

| Script | Does |
|---|---|
| `inspect.mjs` | Dumps the page's section tree with positions so the agent can choose what lifts |
| `capture.mjs` | Scrolls once, finishes animations, freezes video, collapses scroll-pinned sections, saves the base plate in 4096px chunks and every lifted piece on transparency |
| `film.html` / `film.js` | WebGL2 film: every frame is `seek(t)`. One integrated speed curve, per-pixel depth of field, shadows, the rise, the dive and the title card |
| `render.mjs` | Stills + contact sheet, 30fps preview, final 60fps render with 16 motion-blur subframes, muxes the score |
| `flow.py` | Optical-flow check: the glide never stalls, the flight never zooms in |
| `score.py` | Finds your track's drop and lands it on 9.97s, adds whooshes at 8.66s and 9.80s |

The full direction (timings, lens, banned moves) is in [`SKILL.md`](skills/landing-flyover/SKILL.md).

## Credits

The example film is [supercompress.dev](https://supercompress.dev), scored with "Uplifting Bass" from [Mixkit](https://mixkit.co/free-stock-music/) (Mixkit free license). Fonts: Geist, Instrument Serif. MIT licensed.
