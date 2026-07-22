(function () {
'use strict';

var TAU = Math.PI * 2;
var RAD = Math.PI / 180;
var WHITE = [255, 255, 255];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }
function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function css(c, a) {
	return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : +a.toFixed(3)) + ')';
}

/* ---------- palette: the only place colors live ----------
   Stops keyed to solar altitude in degrees. Tuned so the daytime sun
   does not glare; do not brighten without approval. */

function hx(s) { return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; }

var STOPS = [
	// alt   skyN      skyM      skyF      halo      haloA coreA waveHi    waveLo    cloudA poolA
	[-90, '3a3e78', '262a58', '14163a', 'aab2ff', 0.10, 0,    '7d81b8', '2e3162', 0.025, 0.06],
	[-16, '3a3e78', '262a58', '14163a', 'aab2ff', 0.10, 0,    '7d81b8', '2e3162', 0.025, 0.06],
	[-9,  '4a4788', '2f2f64', '191b42', 'ff9d78', 0.12, 0,    '9b93c8', '3a3670', 0.04,  0.08],
	[-3,  '7c62a8', '4d4488', '262754', 'ff9668', 0.28, 0.2,  'cdb8d8', '575088', 0.06,  0.12],
	[2,   'f2c0a8', '8d7cc4', '4a4a9c', 'ff9a5e', 0.28, 0.85, 'f2d8d0', '8a7cb8', 0.08,  0.2],
	[10,  'e6cdbf', '9a92dc', '5a5cb8', 'ffc088', 0.20, 0.85, 'f0e4e4', '9a94cc', 0.07,  0.16],
	[30,  'c9cdf4', '8f94e4', '575cc0', 'ffffff', 0.16, 0.78, 'f3f4fc', 'a2a6dc', 0.07,  0.10],
	[65,  'd3d7f8', '969ce8', '5b60c4', 'ffffff', 0.17, 0.78, 'f6f7fd', 'a8acde', 0.06,  0.10]
].map(function (r) {
	return { alt: r[0], skyN: hx(r[1]), skyM: hx(r[2]), skyF: hx(r[3]), halo: hx(r[4]),
	         haloA: r[5], coreA: r[6], waveHi: hx(r[7]), waveLo: hx(r[8]), cloudA: r[9], poolA: r[10] };
});

function paletteAt(alt) {
	var a = clamp(alt, STOPS[0].alt, STOPS[STOPS.length - 1].alt);
	var i = 1;
	while (i < STOPS.length - 1 && STOPS[i].alt < a) i++;
	var lo = STOPS[i - 1], hi = STOPS[i];
	var t = smooth(clamp((a - lo.alt) / (hi.alt - lo.alt), 0, 1));
	return {
		skyN: mix(lo.skyN, hi.skyN, t), skyM: mix(lo.skyM, hi.skyM, t), skyF: mix(lo.skyF, hi.skyF, t),
		halo: mix(lo.halo, hi.halo, t), haloA: lerp(lo.haloA, hi.haloA, t), coreA: lerp(lo.coreA, hi.coreA, t),
		waveHi: mix(lo.waveHi, hi.waveHi, t), waveLo: mix(lo.waveLo, hi.waveLo, t),
		cloudA: lerp(lo.cloudA, hi.cloudA, t), poolA: lerp(lo.poolA, hi.poolA, t)
	};
}

/* ---------- solar engine ---------- */

var mode = { precise: false, lat: 40, lon: 0 };
var sim = null; // minutes since midnight, or null for live

function altAz(latDeg, declDeg, hDeg) {
	var phi = latDeg * RAD, dec = declDeg * RAD, H = hDeg * RAD;
	var alt = Math.asin(clamp(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H), -1, 1)) / RAD;
	var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / RAD;
	return { alt: alt, az: (az + 540) % 360, H: ((hDeg % 360) + 540) % 360 - 180 };
}

// Approximate mode: hour angle from the visitor's clock, latitude 40N,
// seasonal declination from the date. No permissions, no prompts.
function approxSun(date) {
	var start = new Date(date.getFullYear(), 0, 0);
	var doy = Math.floor((date - start) / 864e5);
	var decl = -23.44 * Math.cos(TAU * (doy + 10) / 365);
	var mins = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
	return altAz(40, decl, mins / 4 - 180);
}

// Precise mode: the SunCalc formulation, from date + latitude + longitude.
function preciseSun(date, lat, lon) {
	var d = date.getTime() / 864e5 - 0.5 + 2440588 - 2451545;
	var M = (357.5291 + 0.98560028 * d) * RAD;
	var C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
	var L = M + C + 102.9372 * RAD + Math.PI;
	var e = 23.4397 * RAD;
	var dec = Math.asin(Math.sin(e) * Math.sin(L)) / RAD;
	var ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
	var H = ((280.16 + 360.9856235 * d) * RAD + lon * RAD - ra) / RAD;
	return altAz(lat, dec, H);
}

function simDate() {
	var d = new Date();
	if (sim != null) d.setHours(0, sim, 0, 0);
	return d;
}

function computeSun() {
	var d = simDate();
	return mode.precise ? preciseSun(d, mode.lat, mode.lon) : approxSun(d);
}

// Moon: the real one. Low-precision lunar ephemeris (the SunCalc
// formulation) gives ecliptic coordinates; the moon's hour angle is the
// sun's offset by their right-ascension difference, which keeps it
// consistent with whichever mode (clock-approximate or precise) produced
// the sun. Phase comes from the sun-moon separation angle.
var OBL = 23.4397 * RAD;

function raDec(l, b) {
	return {
		ra: Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l)),
		dec: Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l))
	};
}

function moonState(date, sun) {
	var d = date.getTime() / 864e5 - 10957.5; // days since J2000
	// sun ecliptic longitude
	var Ms = (357.5291 + 0.98560028 * d) * RAD;
	var Cs = (1.9148 * Math.sin(Ms) + 0.02 * Math.sin(2 * Ms) + 0.0003 * Math.sin(3 * Ms)) * RAD;
	var ls = Ms + Cs + (102.9372 + 180) * RAD;
	// moon ecliptic coordinates
	var L = (218.316 + 13.176396 * d) * RAD;
	var Mm = (134.963 + 13.064993 * d) * RAD;
	var F = (93.272 + 13.229350 * d) * RAD;
	var lm = L + 6.289 * RAD * Math.sin(Mm);
	var bm = 5.128 * RAD * Math.sin(F);
	var s = raDec(ls, 0), m = raDec(lm, bm);
	var pos = altAz(mode.precise ? mode.lat : 40, m.dec / RAD, sun.H + (s.ra - m.ra) / RAD);
	var phi = Math.acos(clamp(
		Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra), -1, 1));
	var frac = (1 - Math.cos(phi)) / 2;
	var waxing = Math.sin(lm - ls) > 0;
	// Fallback arc for when the real moon is below the horizon: it must stay
	// phase-honest. Crescents hug the horizon on the sun's side of the sky
	// (west after dusk, east before dawn); only fuller moons ride high.
	var anti = (sun.az + 180) % 360;
	return {
		frac: frac,
		waxing: waxing,
		vis: clamp((-5 - sun.alt) / 6, 0, 1),        // shown once the sun is well down
		w: clamp((pos.alt - 2) / 10, 0, 1),
		real: { alt: pos.alt, az: pos.az },
		arc: {
			alt: clamp(6 + 44 * frac, 6, 50),
			az: waxing ? 276 + (anti - 276) * frac : 84 + (anti - 84) * frac
		}
	};
}

function phaseName(s) {
	var rising = s.H < 0;
	if (s.alt < -12) return 'night';
	if (s.alt < -3) return rising ? 'dawn' : 'dusk';
	if (s.alt < 5) return rising ? 'sunrise' : 'sunset';
	if (s.alt < 11) return 'golden hour';
	if (Math.abs(s.H) < 20) return 'midday';
	return rising ? 'morning' : 'afternoon';
}

/* ---------- screen mapping ----------
   Azimuth 60..300 maps to 6%..94% of width (east left, west right);
   altitude 0..66 maps from the horizon line (60% height) toward 8%.
   Above ~53° a soft knee compresses the climb so a high summer sun
   (alt > 66 was previously unclamped) eases toward the 8% line instead
   of clipping the top of the canvas. */

function toScreen(alt, az, W, H) {
	var n = alt / 66;
	if (n > 0.8) n = 0.8 + 0.2 * Math.tanh((n - 0.8) / 0.2);
	return {
		x: W * (0.06 + 0.88 * clamp((az - 60) / 240, 0, 1)),
		y: 0.60 * H - (0.60 - 0.08) * H * n
	};
}

/* ---------- renderers ---------- */

var canvas = document.getElementById('scene');
var ctx = canvas.getContext('2d');
var W = 0, H = 0;
var AMP = 1; // wave amplitudes are tuned in px for a 1600px viewport; scale down on phones
var contentTop = 1e9; // top of the name, so the moon can stay clear of the content
var hoverSun = null, hoverMoon = null, lastSea = null; // for the sky hover card
var flashT = -1; // seconds into the green flash; < 0 = idle
var flashMelt = 0; // how melted-out the disc is; holds after the flash so the sun can't pop back

function measureContent() {
	var el = document.querySelector('main h1');
	if (el) contentTop = el.getBoundingClientRect().top;
}

function resize() {
	var dpr = Math.min(window.devicePixelRatio || 1, 2);
	W = window.innerWidth;
	H = window.innerHeight;
	AMP = clamp(W / 1600, 0.32, 1);
	canvas.width = Math.round(W * dpr);
	canvas.height = Math.round(H * dpr);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	measureContent();
}

// Five wave layers; i = 0 is the back layer. Broad wavelengths only:
// each sweep keeps at most one crest on screen. Phases are accumulated
// per frame so the sea's tempo can change smoothly with the time of day.
var LAYERS = [];
for (var li = 0; li < 5; li++) {
	LAYERS.push({
		i: li,
		base: 0.64 + 0.06 * li,
		tilt: (0.032 - 0.004 * li) * (li % 2 ? -1 : 1),
		// perspective: the far swell stays small, the near water rolls big
		A1: 24 + 9 * li,
		f1: 0.5 + 0.11 * li,
		A2: (24 + 9 * li) * 0.38,
		f2: (0.5 + 0.11 * li) * 2.3,
		ph1: li * 1.7,
		ph2: li * 2.9 + 1.1,
		// one shared direction, front layers rolling visibly faster (parallax)
		sp1: -(0.13 + 0.09 * li),
		sp2: -(0.30 + 0.19 * li)
	});
}

// Two soft cirrus bands, high in the sky. They catch the palette's warm
// colour at sunrise and sunset and stay faintly present through midday
// and night. Height matters: too thin and they render as hairline streaks
// on large screens, too fat and they band the night sky.
var CLOUDS = [
	{ x0: 0.18, y: 0.09, rx: 0.30, ry: 0.036, sp: 4.5, off: 0, ph: 0.0 },
	{ x0: 0.58, y: 0.21, rx: 0.24, ry: 0.030, sp: -3.4, off: 0, ph: 2.1 },
	{ x0: 0.86, y: 0.14, rx: 0.17, ry: 0.024, sp: 2.6, off: 0, ph: 4.2 }
];

// Sea state follows the sun and the moon the way real water does:
// glassy at dawn, waking through the morning, choppiest with the
// afternoon breeze, settling at dusk. The lunar term is a real tide
// abstraction — spring tides at syzygy (new AND full moon), neap tides
// at the quarters — and the drift direction reverses between day and
// night the way coastal sea/land breezes do: west by day, east by
// night, slack water at twilight.
function seaState(sun, moon) {
	var daylight = clamp((sun.alt + 6) / 26, 0, 1);
	var afternoon = clamp(sun.H / 55, 0, 1) * daylight;
	var tide = 0.15 + 0.85 * Math.abs(2 * moon.frac - 1);
	var lunar = tide * (1 - 0.6 * daylight);
	return {
		energy: 0.72 + 0.34 * daylight + 0.26 * afternoon + 0.30 * lunar, // swell height
		chop: 0.38 + 0.78 * daylight + 0.60 * afternoon,                  // secondary ripple
		tempo: 0.90 + 0.50 * daylight + 0.40 * afternoon + 0.40 * lunar,  // speed of it all
		tide: tide,
		flow: daylight * 2 - 1
	};
}

function surfaceY(L, x, sea) {
	return L.base * H
		+ L.tilt * (x - W / 2)
		+ L.A1 * AMP * sea.energy * Math.sin(TAU * L.f1 * x / W + L.ph1)
		+ L.A2 * AMP * sea.chop * Math.sin(TAU * L.f2 * x / W + L.ph2);
}

function radial(x, y, r, stops) {
	var g = ctx.createRadialGradient(x, y, 0, x, y, r);
	for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
	return g;
}

// Content clearance for the moon. Gate strength ramps over ~5% of the
// viewport (and over a band of altitude at the wide gate's horizon
// exemption) so the lift eases in as the moon drifts across a boundary —
// an on/off gate snaps the moon a couple hundred px in a single frame.
function moonGate(mp) {
	var mOff = Math.abs(mp.x - W / 2);
	var ease = W * 0.05;
	// content band: always lifts a moon that sits over the centered column
	var g = 1 - smooth(clamp((mOff - (Math.min(W * 0.45, 360) + 84)) / ease, 0, 1));
	// wider gate for mid-sky moons parked beside the content on wide
	// screens; fades out toward the horizon so low crescents keep hugging it
	var g2 = (1 - smooth(clamp((mOff - (W * 0.30 + 84)) / ease, 0, 1)))
	       * smooth(clamp((H * 0.54 - mp.y) / (H * 0.06), 0, 1));
	if (g2 > g) g = g2;
	if (g <= 0) return mp;
	var clearY = Math.min(0.24 * H, contentTop - 52);
	// no sky left (landscape phones): tuck into the free upper-left corner
	if (clearY < 30) return { x: Math.max(56, W * 0.07), y: Math.max(36, H * 0.12) };
	return { x: mp.x, y: lerp(mp.y, Math.min(mp.y, clearY), g) };
}

function moonDisc(mp, a, pal, moon) {
	var r = 19;
	// the halo must agree with the phase: a sliver barely glows,
	// a full moon earns its light (small floor so new moons exist)
	ctx.fillStyle = radial(mp.x, mp.y, 84, [
		[0, css(pal.halo, (0.03 + 0.13 * moon.frac) * a)], [1, css(pal.halo, 0)]
	]);
	ctx.fillRect(mp.x - 84, mp.y - 84, 168, 168);
	// earthshine: the whole sphere, barely there, sells the crescent
	ctx.beginPath();
	ctx.arc(mp.x, mp.y, r, 0, TAU);
	ctx.fillStyle = css(WHITE, 0.09 * a);
	ctx.fill();
	// lit side: half limb closed by an elliptical terminator, so the
	// horns taper to points; lit limb faces the sun's side of the sky
	var k = 2 * moon.frac - 1;
	var rot = moon.waxing ? 0 : Math.PI;
	var lit = new Path2D();
	lit.ellipse(mp.x, mp.y, r, r, rot, -Math.PI / 2, Math.PI / 2, false);
	lit.ellipse(mp.x, mp.y, Math.abs(k) * r, r, rot, Math.PI / 2, Math.PI * 1.5, k < 0);
	ctx.fillStyle = css(mix(pal.halo, WHITE, 0.85), 0.95 * a);
	ctx.fill(lit);
}

function draw(dt, sun, pal, moon) {
	var p = toScreen(sun.alt, sun.az, W, H);
	var sea = seaState(sun, moon);

	// advance the scene's clocks (dt = 0 renders a static frame)
	for (var pi = 0; pi < LAYERS.length; pi++) {
		LAYERS[pi].ph1 += LAYERS[pi].sp1 * sea.tempo * sea.flow * dt;
		LAYERS[pi].ph2 += LAYERS[pi].sp2 * sea.tempo * sea.flow * dt;
	}
	for (var co = 0; co < CLOUDS.length; co++) CLOUDS[co].off += CLOUDS[co].sp * dt;

	// 1. sky — one radial gradient rooted at the sun (the one-light-source rule)
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = radial(p.x, p.y, Math.max(W, H) * 1.25, [
		[0, css(pal.skyN)], [0.45, css(pal.skyM)], [1, css(pal.skyF)]
	]);
	ctx.fillRect(0, 0, W, H);

	// 2. moon — the real one: true phase for the date, lit limb toward the
	// sun (west when waxing, east when waning), drawn only when it is
	// actually above the horizon on a dark sky.
	// The fallback arc and the real position genuinely crossfade while the
	// real moon crosses alt 2°..12°: complementary alphas, so total
	// moonlight holds steady and the arc stand-in dissolves into the real
	// moon instead of the sky going moonless mid-night and the disc
	// teleporting. The two spots are unrelated, so a position lerp would
	// swing the moon across the sky — dissolve, never slide.
	var mReal = moon.vis * smooth(moon.w);
	var mArc = moon.vis - mReal;
	var moonShows = [];
	if (mArc > 0.01) moonShows.push({ p: moonGate(toScreen(moon.arc.alt, moon.arc.az, W, H)), a: mArc });
	if (mReal > 0.01) moonShows.push({ p: moonGate(toScreen(moon.real.alt, moon.real.az, W, H)), a: mReal });
	var mp = null, mBest = 0;
	for (var mi = 0; mi < moonShows.length; mi++) {
		moonDisc(moonShows[mi].p, moonShows[mi].a, pal, moon);
		if (moonShows[mi].a > mBest) { mBest = moonShows[mi].a; mp = moonShows[mi].p; }
	}

	// 3. sun halo — carries the brightness; doubles as the twilight horizon glow
	var hr = Math.max(W, H) * 0.55;
	ctx.fillStyle = radial(p.x, p.y, hr, [
		[0, css(pal.halo, pal.haloA)], [0.35, css(pal.halo, pal.haloA * 0.45)], [1, css(pal.halo, 0)]
	]);
	ctx.fillRect(0, 0, W, H);

	// 4. sun core — intentionally modest; the profile holds a short plateau
	// then falls off harder, so the disc keeps a findable edge at mid
	// altitudes without raising peak brightness (crosses the old profile's
	// value at r=0.32, dimmer skirt beyond).
	// During a green flash the core melts out as the bead brightens — the
	// flash IS the disc's last sliver, so the two must never coexist. The
	// melt then HOLDS while the sun stays set (the bead fades alone): if
	// it recovered with the envelope the disc would pop back from the
	// dead a second after its own sunset. Scrubbing anywhere else, or the
	// next sunrise, releases it.
	if (!(sun.alt <= -4.0 && sun.H > 0)) flashMelt = 0;
	var fe = 0;
	if (flashT >= 0) {
		flashT += dt;
		if (flashT > 1.4) flashT = -1;
		else fe = smooth(clamp(flashT / 0.12, 0, 1)) * (1 - smooth(clamp((flashT - 0.55) / 0.75, 0, 1)));
		flashMelt = Math.max(flashMelt, smooth(clamp(flashT / 0.12, 0, 1)));
	}
	var coreA = pal.coreA * (1 - flashMelt);
	if (coreA > 0.002) {
		var cr = 72 * clamp(W / 1100, 0.62, 1);
		ctx.fillStyle = radial(p.x, p.y, cr, [
			[0, css(WHITE, coreA)],
			[0.22, css(WHITE, coreA * 0.72)],
			[0.42, css(mix(pal.halo, WHITE, 0.55), coreA * 0.28)],
			[1, css(pal.halo, 0)]
		]);
		ctx.fillRect(p.x - cr, p.y - cr, cr * 2, cr * 2);
	}

	// 4b. green flash — the emerald wink as the disc slips behind the
	// water (the scene's true horizon is the back wave's silhouette, not
	// alt 0): a thin flattened bead hugging that surface at the sun's x,
	// drawn before the waves so the water occludes its lower half and it
	// reads as sitting ON the horizon. Emerald is recomposed from the
	// palette's own sunset-halo channels — no foreign hex — and the bead
	// shimmers slightly, the way refraction boils at the real horizon.
	if (fe > 0) {
		var gy = surfaceY(LAYERS[0], p.x, sea) - 2;
		var fg = [pal.halo[1] * 0.3, pal.halo[0], pal.halo[2] * 0.85];
		var fl = 1 + 0.08 * Math.sin(flashT * 55);
		ctx.save();
		ctx.translate(p.x, gy);
		ctx.scale(fl, 0.22);
		ctx.fillStyle = radial(0, 0, 42, [
			[0, css(mix(fg, WHITE, 0.55), 0.95 * fe)],
			[0.3, css(fg, 0.8 * fe)],
			[1, css(fg, 0)]
		]);
		ctx.fillRect(-42, -42, 84, 84);
		ctx.restore();
	}

	// 5. cirrus — thin bands, plainly visible at every hour, warmest and a
	// touch brighter at the golden hours (owner asked twice for more
	// presence: 0.25x baseline read as invisible, then 0.65x still did)
	var golden = clamp(1 - Math.abs(sun.alt - 2) / 18, 0, 1);
	var cirrusA = pal.cloudA * (2.4 + 0.2 * golden);
	var cirrusC = mix(WHITE, pal.halo, golden * 0.8);
	for (var ci = 0; ci < CLOUDS.length; ci++) {
		var cl = CLOUDS[ci];
		var rx = cl.rx * W, ry = cl.ry * H;
		var cx = ((cl.x0 * W + cl.off) % (W + rx * 2) + (W + rx * 2)) % (W + rx * 2) - rx;
		// beyond the slow drift, each band bobs and breathes on its own
		// long phase — barely perceptible, just enough to feel alive
		var cy = (cl.y + 0.008 * Math.sin(cl.off * 0.02 + cl.ph)) * H;
		// a band crossing the sun's glow reads as a smear, not a cloud —
		// thin it out near the disc (radius kept tight so a band merely
		// dodges the disc instead of vanishing from a whole sky quadrant)
		var ddx = (cx - p.x) / (W * 0.12), ddy = (cy - p.y) / (H * 0.12);
		var aBand = cirrusA * (1 - 0.65 * Math.exp(-(ddx * ddx + ddy * ddy)))
		          * (0.92 + 0.08 * Math.sin(cl.off * 0.013 + cl.ph));
		ctx.save();
		ctx.translate(cx, cy);
		ctx.scale(rx, ry);
		ctx.fillStyle = radial(0, 0, 1, [
			[0, css(cirrusC, aBand)], [0.62, css(cirrusC, aBand * 0.6)], [1, css(cirrusC, 0)]
		]);
		ctx.fillRect(-1, -1, 2, 2);
		ctx.restore();
	}

	// 6. wave layers — back to front, each surface lit by what is in the
	// sky. Slopes facing the light pick it up, and a specular column stands
	// on the water below the source: tight and golden when the sun is low,
	// wide and faint when it is high, cool and narrow under the moon.
	var t01 = clamp(sun.alt / 65, 0, 1);
	var sunUp = clamp((sun.alt + 8) / 12, 0, 1);
	var lightCol = sunUp > 0 ? mix(pal.halo, WHITE, t01 * 0.85) : pal.halo;
	var sources = [];
	if (sunUp > 0) sources.push({
		x: p.x,
		amb: 0.16 * (0.35 + 0.65 * sunUp),
		spec: pal.poolA * 2.2 * sunUp,
		sigma: W * (0.09 + 0.28 * t01)
	});
	for (var ms = 0; ms < moonShows.length; ms++) {
		// full moon lights more water; during the arc↔real crossfade each
		// disc lights it in proportion, so the total never dips
		var moonlight = moonShows[ms].a * (0.25 + 0.75 * moon.frac);
		sources.push({
			x: moonShows[ms].p.x,
			amb: 0.18 * moonlight,
			spec: pal.poolA * 5 * moonlight, // the cool pool under the moon
			sigma: W * 0.12
		});
	}

	var N = 48;
	for (var i = 0; i < LAYERS.length; i++) {
		var L = LAYERS[i];
		var base = mix(pal.waveLo, pal.waveHi, i / 4);
		var alpha = i === 4 ? 0.92 : 0.42 + 0.11 * i;
		var depth = 0.55 + 0.45 * (i / 4); // front layers catch more light
		var xs = [], ys = [];
		for (var k = 0; k <= N; k++) {
			xs.push(W * k / N);
			ys.push(surfaceY(L, W * k / N, sea));
		}
		var g = ctx.createLinearGradient(0, 0, W, 0);
		for (k = 0; k <= N; k++) {
			var k0 = Math.max(0, k - 1), k1 = Math.min(N, k + 1);
			var slope = -(ys[k1] - ys[k0]) / (xs[k1] - xs[k0]); // up = positive
			var lit = 0;
			for (var si = 0; si < sources.length; si++) {
				var S = sources[si];
				// the light direction eases through zero beneath the source —
				// a hard sign flip there drew a vertical seam down the water —
				// and directly under it every slope glitters, so the column
				// center stays solid instead of dimming
				var dir = clamp((S.x - xs[k]) / (W * 0.05), -1, 1);
				var facing = clamp(slope * 7 * dir, -1, 1);
				var dxn = (xs[k] - S.x) / S.sigma;
				var glit = Math.max(0.35 + 0.65 * Math.max(0, facing), 1 - Math.abs(dir));
				lit += S.amb * facing + S.spec * Math.exp(-dxn * dxn) * glit;
			}
			lit = clamp(lit * depth, -0.35, 0.95);
			var c = lit >= 0 ? mix(base, lightCol, lit) : mix(base, pal.skyF, -lit * 0.6);
			g.addColorStop(k / N, css(c, alpha));
		}
		var path = new Path2D();
		path.moveTo(-2, ys[0]);
		for (k = 1; k <= N; k++) path.lineTo(xs[k], ys[k]);
		path.lineTo(W + 2, H + 2);
		path.lineTo(-2, H + 2);
		path.closePath();
		ctx.fillStyle = g;
		ctx.fill(path);
	}

	// remembered for the sky hover card
	hoverSun = { x: p.x, y: p.y };
	hoverMoon = mp;
	lastSea = sea;
}

/* ---------- state + UI ---------- */

var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

var chip = document.getElementById('chip');
var chipMore = document.getElementById('chip-more');
var phaseEl = document.getElementById('phase');
var orb = chip.querySelector('.orb');
var panel = document.getElementById('panel');
var scrub = document.getElementById('scrub');
var liveBtn = document.getElementById('live-btn');
var geoBtn = document.getElementById('geo-btn');
var modeLine = document.getElementById('mode-line');

var cachedSun = null, cachedPal = null, cachedMoon = null, cachedMinute = -1;

function refreshSun() {
	var prevAlt = cachedSun ? cachedSun.alt : null;
	cachedSun = computeSun();
	cachedPal = paletteAt(cachedSun.alt);
	cachedMoon = moonState(simDate(), cachedSun);
	// green flash: 1-in-1000 chance the minute a live setting sun's disc
	// slips behind the water (alt −4.2° ≈ where the disc meets the back
	// wave's silhouette, this scene's true horizon — not alt 0)
	if (sim == null && !reduced && prevAlt != null &&
	    prevAlt > -4.2 && cachedSun.alt <= -4.2 && cachedSun.H > 0 &&
	    Math.random() < 0.001) flashT = 0;
	measureContent();
	updateChip();
}

function fmtTime(d) {
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateChip() {
	var d = simDate();
	var phase = phaseName(cachedSun);
	var day = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
	var basis = mode.precise ? mode.lat.toFixed(2) + ', ' + mode.lon.toFixed(2) : 'clock time';
	phaseEl.textContent = phase;
	chipMore.innerHTML = '&nbsp;&middot; ' + fmtTime(d) + ' &middot; ' + day + ' &middot; ' + basis;
	orb.style.background = css(cachedPal.halo);
	chip.setAttribute('aria-label', phase + ' · ' + fmtTime(d) + ' · ' + day + ' · ' + basis + (sim != null ? ' · simulated' : ' · live'));
	modeLine.textContent = (mode.precise ? 'precise · ' + basis : 'approximate · clock time') + (sim != null ? ' · simulated' : ' · live');
}

chip.addEventListener('click', function () {
	var open = panel.hidden;
	panel.hidden = !open;
	chip.classList.toggle('open', open);
	chip.setAttribute('aria-expanded', String(open));
});

scrub.addEventListener('input', function () {
	sim = +scrub.value;
	refreshSun();
	if (reduced) drawOnce();
});

liveBtn.addEventListener('click', function () {
	sim = null;
	syncScrub();
	refreshSun();
	if (reduced) drawOnce();
});

document.getElementById('flash-btn').addEventListener('click', function () {
	// walk the afternoon to the minute the disc slips behind the water,
	// park the scrubber there, and play the flash; under reduced motion
	// just park there (the flash is an animation)
	var d = simDate(), found = null, prevA = null;
	for (var m = 720; m < 1440 && found == null; m++) {
		d.setHours(0, m, 0, 0);
		var alt = (mode.precise ? preciseSun(d, mode.lat, mode.lon) : approxSun(d)).alt;
		if (prevA != null && prevA > -4.2 && alt <= -4.2) found = m;
		prevA = alt;
	}
	sim = found == null ? 1140 : found; // no sunset at this latitude today: 19:00 stands in
	scrub.value = sim;
	refreshSun();
	if (reduced) drawOnce(); else flashT = 0;
});

geoBtn.addEventListener('click', function () {
	if (!navigator.geolocation) { modeLine.textContent = 'geolocation unavailable'; return; }
	navigator.geolocation.getCurrentPosition(function (pos) {
		mode.precise = true;
		mode.lat = pos.coords.latitude;
		mode.lon = pos.coords.longitude;
		refreshSun();
		if (reduced) drawOnce();
	}, function () {
		modeLine.textContent = 'location unavailable · still approximate';
	});
});

function syncScrub() {
	var d = new Date();
	scrub.value = d.getHours() * 60 + d.getMinutes();
}

// Testing hook — keep.
window.__sim = {
	set: function (m) { sim = clamp(Math.round(m), 0, 1439); scrub.value = sim; refreshSun(); if (reduced) drawOnce(); },
	live: function () { sim = null; syncScrub(); refreshSun(); if (reduced) drawOnce(); },
	place: function (lat, lon) { mode.precise = true; mode.lat = lat; mode.lon = lon; refreshSun(); if (reduced) drawOnce(); },
	state: function () { return { sun: cachedSun, moon: cachedMoon }; }
};

/* ---------- fingerprint copy ---------- */

var FP = '15D2 F1D7 CD0C 5DDC 2293 9EE4 E647 29E1 323A 7B75';
var fpBtn = document.getElementById('fp');
var fpNote = document.getElementById('fp-note');
var fpTimer = null;

function copiedNote() {
	fpNote.classList.add('show');
	clearTimeout(fpTimer);
	fpTimer = setTimeout(function () { fpNote.classList.remove('show'); }, 1500);
}

fpBtn.addEventListener('click', function () {
	var settled = false;
	function once(fn) {
		return function () { if (!settled) { settled = true; fn(); } };
	}
	function fallback() {
		var ta = document.createElement('textarea');
		ta.value = FP;
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		try { document.execCommand('copy'); } catch (e) {}
		document.body.removeChild(ta);
		copiedNote();
	}
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(FP).then(once(copiedNote), once(fallback));
		setTimeout(once(fallback), 600); // clipboard API can hang without settling
	} else {
		fallback();
	}
});

/* ---------- sky hover card: sun and moon report on themselves ---------- */

var skyTip = document.getElementById('sky-tip');
var COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
               'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function driftWord(flow) {
	return flow > 0.05 ? 'drifting west' : flow < -0.05 ? 'drifting east' : 'slack water';
}

function moonPhaseName(frac, waxing) {
	if (frac < 0.04) return 'new moon';
	if (frac < 0.45) return waxing ? 'waxing crescent' : 'waning crescent';
	if (frac < 0.55) return waxing ? 'first quarter' : 'last quarter';
	if (frac < 0.96) return waxing ? 'waxing gibbous' : 'waning gibbous';
	return 'full moon';
}

// hover-capable, fine-pointer devices only: on touch screens the card
// would pop up on taps and just add noise
var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

window.addEventListener('pointermove', function (e) {
	if (!canHover || !skyTip || !lastSea) return;
	if (e.pointerType && e.pointerType !== 'mouse') return;
	function near(pt, rr) {
		if (!pt) return false;
		var dx = e.clientX - pt.x, dy = e.clientY - pt.y;
		return dx * dx + dy * dy < rr * rr;
	}
	var html = null, tx = 0, ty = 0;
	if (cachedMoon && near(hoverMoon, 55)) {
		html = moonPhaseName(cachedMoon.frac, cachedMoon.waxing)
			+ ' &middot; ' + Math.round(cachedMoon.frac * 100) + '% lit &middot; '
			+ (cachedMoon.w > 0.5
				? Math.round(cachedMoon.real.alt) + '&deg; up &middot; ' + COMPASS[Math.round(cachedMoon.real.az / 22.5) % 16]
				: 'set below the horizon')
			+ '<br>tide &times;' + lastSea.tide.toFixed(2) + ' on the swell &middot; ' + driftWord(lastSea.flow);
		tx = hoverMoon.x; ty = hoverMoon.y + 34;
	} else if (cachedSun && cachedSun.alt > -6 && near(hoverSun, 85)) {
		html = 'sun &middot; ' + Math.round(Math.abs(cachedSun.alt)) + '&deg; '
			+ (cachedSun.alt >= 0 ? 'up' : 'below the horizon')
			+ ' &middot; ' + COMPASS[Math.round(cachedSun.az / 22.5) % 16]
			+ '<br>swell &times;' + lastSea.energy.toFixed(2)
			+ ' &middot; chop &times;' + lastSea.chop.toFixed(2)
			+ ' &middot; ' + driftWord(lastSea.flow);
		tx = hoverSun.x; ty = hoverSun.y + 64;
	}
	if (html) {
		skyTip.innerHTML = html;
		skyTip.hidden = false;
		skyTip.style.left = clamp(tx, 160, W - 160) + 'px';
		skyTip.style.top = clamp(ty, 12, H - 80) + 'px';
		document.documentElement.style.cursor = 'help';
	} else {
		skyTip.hidden = true;
		document.documentElement.style.cursor = '';
	}
});

/* ---------- entrance: typing + hex scramble ---------- */

function typeEl(el, delay, speed) {
	var full = el.textContent;
	el.textContent = '';
	setTimeout(function step() {
		el.textContent = full.slice(0, el.textContent.length + 1);
		if (el.textContent.length < full.length) setTimeout(step, speed);
	}, delay);
}

function scrambleEl(el, delay, dur, chars) {
	var orig = el.textContent;
	var born = Date.now();
	var iv = setInterval(function () {
		var pr = (Date.now() - born - delay) / dur;
		if (pr >= 1) {
			el.textContent = orig;
			clearInterval(iv);
			return;
		}
		var reveal = Math.max(0, pr) * orig.length;
		var out = '';
		for (var i = 0; i < orig.length; i++) {
			var ch = orig.charAt(i);
			out += (i < reveal || !/[A-Za-z0-9]/.test(ch))
				? ch
				: chars.charAt(Math.floor(Math.random() * chars.length));
		}
		el.textContent = out;
	}, 45);
}

/* ---------- boot + loop ---------- */

var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

window.addEventListener('resize', function () { resize(); if (reduced) drawOnce(); });

// URL override for quick previews: ?t=<decimal hours>, e.g. ?t=19.2
var tp = parseFloat(new URLSearchParams(location.search).get('t'));
if (!isNaN(tp)) sim = clamp(Math.round(tp * 60), 0, 1439);

resize();
syncScrub();
if (sim != null) scrub.value = sim;
refreshSun();

// The entrance waits for the load event plus one painted frame, so a
// refresh replays the same choreography as a first visit.
function startEntrance() {
	document.body.classList.add('ready');
	if (reduced) return;
	typeEl(document.getElementById('name'), 1100, 180);
	var pills = document.querySelectorAll('.pill');
	for (var pi = 0; pi < pills.length; pi++) {
		scrambleEl(pills[pi], 800 + pi * 170, 2000, 'abcdef0123456789');
	}
	var groups = document.querySelectorAll('#fp .g');
	for (var gi = 0; gi < groups.length; gi++) {
		scrambleEl(groups[gi], 1100 + gi * 220, 2300, 'ABCDEF0123456789');
	}
}

if (document.readyState === 'complete') {
	requestAnimationFrame(startEntrance);
} else {
	window.addEventListener('load', function () { requestAnimationFrame(startEntrance); });
}

function drawOnce() { draw(0, cachedSun, cachedPal, cachedMoon); }

if (reduced) {
	drawOnce();
	setInterval(function () { refreshSun(); drawOnce(); }, 60000); // stays correct, never animates
} else {
	var last = 0;
	requestAnimationFrame(function frame(ms) {
		var dt = last ? Math.min((ms - last) / 1000, 0.1) : 0;
		last = ms;
		// live mode recomputes the sun once per minute
		if (sim == null) {
			var m = new Date().getMinutes();
			if (m !== cachedMinute) { cachedMinute = m; refreshSun(); }
		}
		draw(dt, cachedSun, cachedPal, cachedMoon);
		requestAnimationFrame(frame);
	});
}
})();
