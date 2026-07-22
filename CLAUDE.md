# raphael.karger.is — procedural solar dreamscape

Personal landing page. A soft, abstract periwinkle world of layered wave
curves under a sky lit by a simulated sun whose position is computed from
real solar astronomy, and a moon with its real phase. Deliberately
non-representational: the layers may read as hills, water, or snow, and
that ambiguity is intentional.

Deployed via GitHub Pages (branch `main`, domain raphael.karger.is,
Cloudflare in front, HTML cache max-age 600 — expect ~10 min of stale/mixed
cache after a push; hard-refresh when checking).

## Files

- `index.html` — markup only (~50 lines)
- `assets/css/main.css` — all styles
- `assets/js/scene.js` — solar/lunar engine, palette, canvas renderers, UI
- `assets/fonts/` — self-hosted WOFF2 (Bricolage Grotesque variable,
  IBM Plex Mono 400/500)
- `favicon.svg` (+ `favicon.png`/`favicon.ico` renders of it) — a miniature
  of the scene using the daytime palette stops; regenerate the raster
  fallbacks from the SVG if it changes
- `key.asc`, `robots.txt`, `CNAME`

## The core invariant (do not break)

Two numbers drive everything: **solar altitude and azimuth**. One palette
function (`paletteAt(alt)` over the `STOPS` table) is the only place colors
live. Every visual element — sky, sun core/halo, moon, cirrus, five wave
layers, water light, the chip's orb — samples its color from the palette
and, where positional, derives its position from the sun. If a new element
hardcodes a color or a light direction, the holism breaks and the design
regresses to the disjointed look this project exists to avoid. Plain white
participating in mixes is allowed; new hex values outside `STOPS` are not.

The `STOPS` values are tuned so the daytime sun does not glare. Do not
brighten them without the owner's approval.

## Architecture (pipeline order)

1. **Solar engine** — two modes. Approximate (default): hour angle from the
   visitor's clock, latitude 40N, seasonal declination; zero permissions.
   Precise: SunCalc formulation from geolocation, strictly opt-in via the
   panel button. NEVER auto-prompt for geolocation.
2. **Lunar engine** — low-precision ephemeris (SunCalc formulation) for real
   position; phase from sun–moon separation. The moon shows only on a dark
   sky (sun < −5°): at its real position when actually up, otherwise on a
   **phase-honest fallback arc** — crescents hug the horizon on the sun's
   side (west after dusk, east before dawn), only fuller moons ride high.
   A crescent high at midnight is astronomically impossible; keep it that way.
   While the real moon crosses alt 2°–12° the arc stand-in and the real
   disc genuinely crossfade — both discs drawn with complementary alphas —
   so total moonlight never dips and the moon never vanishes mid-night or
   teleports. Dissolve, never slide: the two spots are unrelated, so a
   position lerp would swing the moon across the sky (rejected). Each disc
   lights its own water column in proportion to its alpha.
3. **Palette lookup** — smoothstep-interpolated stops keyed to altitude:
   skyN/skyM/skyF, halo+haloA, coreA, waveHi/waveLo, cloudA, poolA.
4. **Renderers** — one full-viewport canvas, drawn per frame in this order:
   sky (radial gradient rooted at the sun — the one-light-source rule),
   moon (earthshine disc + two-arc lit region: limb semicircle + elliptical
   terminator so the horns taper; halo alpha scales with illuminated
   fraction), sun halo, sun core (modest — brightness lives in the halo and
   sky response, not the disc), green flash (when active), cirrus, wave
   layers, with per-slope lighting.

### Green flash

The setting sun's last sliver can wink emerald: a ~1.6 s squashed gleam
perched on the horizon line at the sun's spot, drawn between sun core and
cirrus. Triggers 1-in-1000 when a live sunset's upper limb crosses alt
−0.8° (never while scrubbing), and on demand from the panel's
"green flash" button (below the scrubber), which parks the scrubber at
today's sunset and plays it. Its color is the palette's own sunset halo
with the red and green channels traded — the one sanctioned green; do not
introduce a literal green hex. No flash under prefers-reduced-motion (it
is an animation; the button still parks the scrubber at sunset).

### Waves

Five layers, back (i=0) to front (i=4): baseY 0.64+0.06i of viewport height,
alternating gentle tilt (±(0.032−0.004i)) for the crisscross composition,
broad wavelengths only (≤1 crest on screen per sweep). Amplitudes grow
front-ward (24+9i px) — perspective: the far swell stays small, the near
water rolls big; the owner rejected a large back swell as "way too big".
Amplitudes are tuned for a 1600px viewport and scaled by
`AMP = clamp(W/1600, 0.32, 1)` so phones don't get distorted churn. Surfaces are lit
per-sample from slope vs. light direction: crests facing the light take its
color, away-slopes shade toward skyF, and a specular column stands on the
water below each source (tight/golden at low sun, wide/faint at high sun,
cool/narrow under the moon — scaled by phase). The light direction eases
through zero beneath each source (a hard sign flip there used to draw a
vertical seam down the water) and every slope glitters directly under it,
so the column center stays solid. There is no separate "pool" overlay;
light lives in the wave fill so it can never disagree with the shapes.

**Sea state** (`seaState`) is a real-ocean abstraction the owner cares
about: glassy at dawn, chop building through the afternoon breeze, settling
at dusk; spring tides at syzygy (new AND full moon), neap at quarters,
feeding swell and tempo; drift direction reverses day/night like coastal
sea/land breezes (west by day, east by night, slack at twilight). Phases
accumulate per-frame (`ph1/ph2 += sp·tempo·flow·dt`) so tempo changes stay
smooth. Speed was tuned by feel: owner rejected both "stagnant" and "a bit
fast" — current sp values are the agreed middle; change only on request.

### Cirrus

Three thin bands spread across distinct sky heights (y 0.09/0.21/0.14)
that blush with the palette's warm color at sunrise/sunset (`golden`
factor peaks near alt≈2°) and stay plainly visible at every hour
(baseline 2.4× of the palette's cloudA, golden adds +0.2×; gradient body
holds 0.6× to r=0.62 so the band has substance, not just a bright core).
The baseline was raised twice — 0.25× then 0.65× both read as invisible
to the owner — and a third band was added for the same reason; don't
quietly dial any of it back. Bands drift slowly and each bobs (±0.008H)
and breathes (±8% alpha) on its own long phase — barely perceptible,
per the owner's ask for "very slight animation". A band is thinned near
the sun's disc so it can't smear across the glow (tight radius, 0.12 of
viewport, so the band dodges the disc rather than vanishing from a whole
quadrant). They replaced puffy ellipses whose wide flat
shapes read as smudgy banding on the night sky. The film grain overlay
(SVG turbulence data URI on `.grain`) is verified working; if someone
reports banding, suspect cloud geometry first, not the grain.

## Content & interaction rules

- Links are plain text labels in frosted pills. **No brand logos or icon
  fonts anywhere** (logos rot; this site once shipped a Twitter bird).
- PGP fingerprint: bare mono groups, alternating opacity, the line itself
  is a copy button (clipboard API + execCommand fallback + a timeout race —
  writeText can hang unsettled) showing a check-icon "copied" pill.
- Status chip (top right): phase word + palette-tinted orb; expands on
  hover/focus/open with time, day, and basis; click opens the panel with
  the time scrubber (0–1439 step 5), green-flash button, live button,
  precise-location button, and mode line.
- Hovering the sun or moon shows a card: identity/phase/position plus the
  live sea impact (swell/chop multipliers, tide factor, drift direction).
  `main` has `pointer-events: none` with links/buttons re-enabled so hovers
  reach the sky — keep that wiring. The card is desktop-only: gated on
  `(hover: hover) and (pointer: fine)` plus pointerType — never show it on
  touch. The chip's hover-expansion is likewise wrapped in
  `@media (hover: hover)` so sticky mobile :hover can't pin it open.
- The moon is kept clear of the content on every viewport via two gates:
  inside the centered content band it is always lifted above the measured
  top of the name (`contentTop`); a second, wider gate (scales with W)
  also lifts mid-sky moons that would park at pill height beside the
  content on wide/ultrawide screens, but exempts low moons (y ≥ 0.54H) so
  horizon-hugging crescents stay phase-honest. On very short screens with
  no sky left (landscape phones) it tucks into the free upper-left corner.
  Gate strength (`moonGate`) ramps over ~5% of the viewport at each
  boundary (and over an altitude band at the wide gate's horizon
  exemption) — hard on/off gates used to snap the moon a couple hundred
  px in one frame as it drifted across them; keep the easing.
- Cirrus band heights are calibrated: too thin renders as hairline streaks
  on large screens, too fat bands the night sky (current ry
  0.036/0.030/0.024 across the three bands).
- Entrance: canvas fade + staggered rises + name typing + hex scramble on
  pills and fingerprint. Everything is held by `body.ready` (added on load
  + one rAF) so refreshes replay identical choreography. Pacing was slowed
  twice at the owner's request (now ~4.5s total, typing at 180ms/char) —
  don't speed it up.
- Text protection (do not remove): shadow tokens on all type and the fixed
  radial scrim, so the sun can pass directly behind the content at any hour.
- No copyright footer — removed at the owner's explicit request.
- `prefers-reduced-motion`: single static frame of correct lighting, no
  animation loop, no typing/scramble.

## Longevity rules

Zero JS dependencies, no CDN anything (Google Analytics was deliberately
removed), self-hosted fonts, all colors through the palette, no content
that stales. Keep it that way.

## Testing

- `?t=<decimal hours>` simulates any time of day (e.g. `?t=19.2` sunset).
- `window.__sim`: `set(minutes)`, `live()`, `place(lat, lon)`,
  `state()` → `{sun, moon}`.
- Headless rendering from WSL uses Windows Chrome:
  `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless
  --disable-gpu --hide-scrollbars --window-size=1600,900
  --virtual-time-budget=10000 --screenshot='C:\...\out.png'
  'file:///C:/Users/rekar/Documents/programming/sitestaging.github.io/index.html?t=12.75'`
- **Gotcha 1**: headless virtual time only advances through pending timer
  tasks; this page is rAF/CSS-animation driven, so the animation clock
  freezes and everything with an entrance animation screenshots at
  opacity 0. For visual tests, screenshot a debug copy with
  `<style>*{animation-duration:0.01s!important;animation-delay:0s!important;}</style>`
  injected, or use `--force-prefers-reduced-motion` (also validates that
  path). This is a headless artifact only. The same freeze stops
  `dt`-driven canvas transients (the green flash) from advancing, and
  wall-clock `--timeout` captures race ahead of `load`-scheduled timers —
  to screenshot the flash, sed a debug copy of scene.js that pins its
  envelope (`fe = 1`, expiry `9e9`) and click `#flash-btn` from an
  injected DOMContentLoaded script.
- **Gotcha 2**: new headless Chrome enforces a ~500px minimum window width.
  For mobile-width tests, wrap the page in an `<iframe style="width:390px">`
  harness page.
- Interaction checks: `document.elementFromPoint` hit-testing via injected
  probe scripts + `--dump-dom` (grep a unique marker; the injected script
  text itself also matches, so match on the serialized output).
- Acceptance sweep: scrub night/sunrise/midday/sunset/night, confirm the
  sky's brightest point coincides with the sun, chip expansion, fingerprint
  copy note, 390px layout, reduced-motion static frame, zero console errors.
