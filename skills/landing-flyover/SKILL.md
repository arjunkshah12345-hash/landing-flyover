---
name: landing-flyover
description: Turn any landing page URL into a 14.5-second 3D fly-over film (1440x1152, 60fps MP4) made entirely with code. The page lies on a bright studio floor; one continuous camera glides down it with razor-thin depth of field while cards, photos and chips lift off and stand up, rises overhead to show the whole page, then dives into the hero and lands it as a card under a two-line title, scored to a track whose drop hits on the title. Use when someone wants a launch video, promo, site tour, or "fly-over" of their website, or pastes a landing page link and asks for a video of it.
---

# Landing fly-over

A fixed, art-directed film of a landing page. Every frame is a pure function of time (`seek(t)` in WebGL2), captured with Playwright, rendered on the real GPU with 16-subframe motion blur, encoded with ffmpeg. No video editor, no timeline, no cuts.

**You need to run code on the user's machine.** If you can't (a chat-only surface), say so straight away: you can describe the film, but the MP4 needs a coding agent with a shell (Claude Code, Codex, Cursor…).

## 0. Ask for the inputs

Ask once, in one message:
1. **Landing page link.**
2. **Brand name and logo mark** (a square PNG/SVG path; look in the repo first: `logo*`, `favicon*`, `brand*`).
3. **A two-part closing line**: a short statement, then a short italic tail. Keep line 1 under ~22 characters (it is set at 74px across a 1440px frame). Offer 2–3 options drawn from the page's own copy.
4. **A 15-second track** (optional). If they have none, offer to find a royalty-free one (Mixkit's free license allows commercial use without attribution; download from `https://assets.mixkit.co/music/<id>/<id>.mp3`). Never commit a downloaded track to a repo; only the rendered MP4.

## 1. Set up

```bash
cp -R <this-skill-dir>/engine ./flyover && cd flyover
npm install && npx playwright install chromium   # installed Chrome is preferred automatically when present
cp config.example.json config.json
```
Needs Node 18+, `ffmpeg` on PATH, and Python 3 with `numpy` for the score (`opencv-python-headless` for the flow check). Put the logo next to `config.json` and set `url`, `brand`, `logo`, `title`.

## 2. Inspect, then pick what lifts

```bash
node inspect.mjs        # → dom.txt (section tree with page positions) + inspect.png
```
Read `dom.txt` and fill `config.json`:
- `hero.section`: the hero section. `hero.mockup`: the phone/product/video frame in the hero (the film starts focused on it and the end card crops just below it). `hero.tileAnchor`: the hero's last button (the four logo tiles start beside it). `hero.footerTitle`: the last big heading before the footer (it is sharp at 8.0s).
- `layers`: pieces that lift, as `{ "sel", "role" }`, optionally overriding `z` (resting lift), `zMax` (lift when the camera passes) and `stand` (degrees it stands up toward the lens). Roles and defaults:

| role | use for | z → zMax · stand |
|---|---|---|
| `button` | hero / CTA buttons | 6 → 28 · 0° |
| `chip` | badges, pills, tabs, small logos | 4 → 64 · 30° |
| `mockup` | the hero phone / product / video frame | 10 → 24 · 0° |
| `card` | feature cards, tables, terminals, metric cells | 6 → 30 · 0° |
| `photo` | images inside cards, screenshots, code samples | 8 → 115 · 46° |
| `flychip` | 1–2 small chips that fly past the frame edges | 4 → 200 · 54° |
| `testimonial` | one quote/terminal card; shows a 34px white edge | 22 → 112 · 30° |

Keep most lifts tiny (20–40px). Aim for 15–35 pieces across the whole page, a few per section. Nested pieces are fine: list the inner one (`photo`) **before** its card.
- `hide`: cookie banners, chat widgets, popups. `css`: any extra CSS to force the final state of scroll-driven effects (e.g. words that light up on scroll). `routes`: `[{ "match": "**/broken.jpg*", "file": "/abs/local/copy.jpg" }]` for assets the live site fails to serve.

## 3. Capture and lock the page

```bash
node capture.mjs
```
This scrolls to the bottom once (lazy images, counters, reveals), finishes animations, freezes videos on a frame (or their poster), **collapses scroll-pinned "runway" sections** (sticky + 200vh scroll spacers would otherwise film as blank stretches), unfixes fixed bars, then saves the base plate in 4096px chunks (Chrome caps one capture at 16384 device px: larger captures silently repeat the top of the page) plus every lifted piece alone on transparency with 28px padding, and `capture/layers.json` with every position.

Look at the capture before timing anything: open `capture/page_*.png` and a few `layer_*.png`. Check for blank video frames, half-revealed text, duplicated regions, popups. Fix with `css`/`hide`/`routes` and re-capture. **Lock the page before timing**: any change in a section's height shifts everything after it.

## 4. Stills for approval

```bash
node render.mjs stills 0,1.6,2.5,5,6.5,9.3,11      # → stills/contact_sheet.png
```
Show the user the contact sheet and wait for a yes before the final render. What each still should show:
- **0s**: low over the hero, mockup sharp, four 32px logo tiles beside the button.
- **1.6s**: hero falling behind, the second section's title crossing the centre, near content melting.
- **2.5s**: that section's photos stood up and blurred near the lens; a flychip leaving an edge.
- **5s / 6.5s**: steady glide; one section sharp at the centre, soft below; the testimonial raised with its white edge.
- **9.3s**: straight overhead, the whole page as one centred strip.
- **11s**: the end card: badge pill, line 1 in Geist 500, grey Instrument Serif italic tail, the hero as a 1018px card, logo tiles on its corners, two soft blurs at the bottom.

## 5. Check the motion

```bash
node render.mjs video preview30.mp4 30 1 && node render.mjs cam
python3 flow.py preview30.mp4     # PASS = the glide never stalls or reverses, the flight never zooms in
```

## 6. Score and render

```bash
python3 score.py track.mp3 auto     # finds the drop, lands it on 9.97s; whooshes at 8.66s and 9.80s → audio/score.wav
node render.mjs video flyover.mp4 60 16   # → flyover.mp4, plus flyover-audio.mp4 when audio/score.wav exists
```
About 0.1–0.2s per frame on an Apple M-series GPU (870 frames). The harness picks ANGLE Metal on macOS, D3D11 on Windows, Vulkan on Linux; if it reports SwiftShader/llvmpipe you are on a software rasterizer and it will be slow.

## The film (fixed: don't re-time it per page)

- 14.5s at 60fps, 1440x1152. Flight 0–8.2s · rise 7.75–9.25s · overhead 9.25–9.47s · dive 9.47–9.97s · title card 9.97–14.5s.
- One camera, never a cut. Focal length 1880px, 56° tilt, distance easing out 1360→1700px, never turning. Speed down the page is one integrated curve (share of cruise): 0 → 0.5 by 0.6s, held to 1.25s, 1.0 by 1.6s, held to 7.3s, easing to 0.12 by 8.3s. Cruise is solved so the footer title is sharp at 8.0s, so long pages glide faster.
- Depth of field per pixel: blur = 75·(focus−depth)/depth in front, 6·(depth−focus)/depth behind, capped at 120px; 40 golden-angle taps from mip levels, rotated per motion-blur subframe; near-field blur dilated so out-of-focus foreground spills over sharp background.
- Lifted pieces stand up about their own middle (top edge toward the lens) and cast a shadow: the same picture in flat #1a2133, offset (0.10z, 4+0.36z), blurred 7+0.5z, 26%.
- Rise: log-scale zoom on a trapezoid speed, tilt flattening 8.15–8.95s, handing over to a camera that pins the page's bottom edge 42px above the frame. Dive: quadratic ease in-out in log scale with the top edge pinned, then dropped to y 283; a rounded-rect mask morphs 24px → 38px corners. Content below the hero fades into the haze colour first, then cuts to transparent.
- Title: badge pill fades in at 10.02s (y 44); line 1 from 10.12s one word every 0.06s; tail from 10.36s one word every 0.05s; each word rises 16px out of a 12px blur in 0.34s. Hold with a 2% creep.

Banned: cuts, crossfades, stops or surges in the glide, the camera turning or swinging sideways, zooming in during the flight, glows, any text over the page before the end card.

## Gotchas

- **Huge pages**: the base plate is chunked, never one screenshot. If you see the hero repeated halfway down, a capture went over 16384 device px.
- **Scroll-driven sites**: sticky runways are collapsed automatically; word-by-word scroll highlights need a `css` rule forcing full opacity.
- **Videos**: they are frozen at `videoTime` seconds. If the live site's video 404s you get a black card; serve a local poster via `routes`.
- **Fading cards** show whatever is behind them, so fade to the haze colour first (the engine does this for everything below the hero).
- **Line 1 too long**: words run off the frame at 74px. Shorten the line rather than shrinking the type.
- **Licensing**: the music stays the user's responsibility; prefer tracks whose license covers commercial video.
