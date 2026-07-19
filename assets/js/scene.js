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

// Moon: an abstract counterweight, opposite the sun's azimuth on deep nights.
// Its altitude is kept high enough to clear the content block, since near
// midnight "opposite the sun" lands at the horizontal centre of the screen.
function moonFrom(sun) {
	return {
		az: (sun.az + 180) % 360,
		alt: clamp(24 - sun.alt * 1.25, 24, 52),
		vis: clamp((-5 - sun.alt) / 6, 0, 1)
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
   altitude 0..66 maps from the horizon line (60% height) up to 8%. */

function toScreen(alt, az, W, H) {
	return {
		x: W * (0.06 + 0.88 * clamp((az - 60) / 240, 0, 1)),
		y: 0.60 * H - (0.60 - 0.08) * H * (alt / 66)
	};
}

/* ---------- renderers ---------- */

var canvas = document.getElementById('scene');
var ctx = canvas.getContext('2d');
var W = 0, H = 0;

function resize() {
	var dpr = Math.min(window.devicePixelRatio || 1, 2);
	W = window.innerWidth;
	H = window.innerHeight;
	canvas.width = Math.round(W * dpr);
	canvas.height = Math.round(H * dpr);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Five wave layers; i = 0 is the back layer. Broad wavelengths only:
// each sweep keeps at most one crest on screen. Phases are accumulated
// per frame so the sea's tempo can change smoothly with the time of day.
var LAYERS = [];
for (var li = 0; li < 5; li++) {
	LAYERS.push({
		i: li,
		base: 0.64 + 0.06 * li,
		tilt: (0.055 - 0.006 * li) * (li % 2 ? -1 : 1),
		A1: 54 - 8 * li,
		f1: 0.5 + 0.11 * li,
		A2: (54 - 8 * li) * 0.38,
		f2: (0.5 + 0.11 * li) * 2.3,
		ph1: li * 1.7,
		ph2: li * 2.9 + 1.1,
		sp1: (0.10 + 0.02 * li) * (li % 2 ? -1 : 1),
		sp2: -(0.16 + 0.02 * li) * (li % 2 ? -1 : 1)
	});
}

var CLOUDS = [
	{ x0: 0.22, y: 0.20, rx: 0.30, ry: 0.055, sp: 4.0, off: 0 },
	{ x0: 0.68, y: 0.32, rx: 0.24, ry: 0.045, sp: -2.6, off: 0 }
];

// Sea state follows the sun the way a real day on the water does:
// glassy and slow at night and dawn, waking through the morning,
// choppiest with the afternoon breeze, settling again at dusk.
function seaState(sun) {
	var daylight = clamp((sun.alt + 6) / 26, 0, 1);
	var afternoon = clamp(sun.H / 55, 0, 1) * daylight;
	return {
		energy: 0.72 + 0.30 * daylight + 0.16 * afternoon, // primary swell height
		chop: 0.50 + 0.55 * daylight + 0.40 * afternoon,   // secondary ripple
		tempo: 0.60 + 0.50 * daylight + 0.30 * afternoon   // how fast it all moves
	};
}

function surfaceY(L, x, sea) {
	return L.base * H
		+ L.tilt * (x - W / 2)
		+ L.A1 * sea.energy * Math.sin(TAU * L.f1 * x / W + L.ph1)
		+ L.A2 * sea.chop * Math.sin(TAU * L.f2 * x / W + L.ph2);
}

function radial(x, y, r, stops) {
	var g = ctx.createRadialGradient(x, y, 0, x, y, r);
	for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
	return g;
}

function draw(dt, sun, pal) {
	var p = toScreen(sun.alt, sun.az, W, H);
	var sea = seaState(sun);

	// advance the scene's clocks (dt = 0 renders a static frame)
	for (var pi = 0; pi < LAYERS.length; pi++) {
		LAYERS[pi].ph1 += LAYERS[pi].sp1 * sea.tempo * dt;
		LAYERS[pi].ph2 += LAYERS[pi].sp2 * sea.tempo * dt;
	}
	for (var co = 0; co < CLOUDS.length; co++) CLOUDS[co].off += CLOUDS[co].sp * dt;

	// 1. sky — one radial gradient rooted at the sun (the one-light-source rule)
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = radial(p.x, p.y, Math.max(W, H) * 1.25, [
		[0, css(pal.skyN)], [0.45, css(pal.skyM)], [1, css(pal.skyF)]
	]);
	ctx.fillRect(0, 0, W, H);

	// 2. moon — deep nights only: a crisp pale disc with a shaded limb
	// falling away from the sun's side of the sky, inside a soft halo
	var moon = moonFrom(sun);
	var mp = null;
	if (moon.vis > 0) {
		mp = toScreen(moon.alt, moon.az, W, H);
		ctx.fillStyle = radial(mp.x, mp.y, 80, [
			[0, css(pal.halo, 0.13 * moon.vis)], [1, css(pal.halo, 0)]
		]);
		ctx.fillRect(mp.x - 80, mp.y - 80, 160, 160);
		var disc = new Path2D();
		disc.arc(mp.x, mp.y, 15, 0, TAU);
		ctx.fillStyle = css(mix(pal.halo, WHITE, 0.85), 0.95 * moon.vis);
		ctx.fill(disc);
		ctx.save();
		ctx.clip(disc);
		var away = p.x > mp.x ? -1 : 1;
		var shade = new Path2D();
		shade.arc(mp.x + away * 7, mp.y - 4, 14, 0, TAU);
		ctx.fillStyle = css(mix(pal.skyM, pal.halo, 0.4), 0.55 * moon.vis);
		ctx.fill(shade);
		ctx.restore();
	}

	// 3. sun halo — carries the brightness; doubles as the twilight horizon glow
	var hr = Math.max(W, H) * 0.55;
	ctx.fillStyle = radial(p.x, p.y, hr, [
		[0, css(pal.halo, pal.haloA)], [0.35, css(pal.halo, pal.haloA * 0.45)], [1, css(pal.halo, 0)]
	]);
	ctx.fillRect(0, 0, W, H);

	// 4. sun core — intentionally modest
	if (pal.coreA > 0.002) {
		var cr = 72 * clamp(W / 1100, 0.62, 1);
		ctx.fillStyle = radial(p.x, p.y, cr, [
			[0, css(WHITE, pal.coreA)],
			[0.32, css(mix(pal.halo, WHITE, 0.55), pal.coreA * 0.5)],
			[1, css(pal.halo, 0)]
		]);
		ctx.fillRect(p.x - cr, p.y - cr, cr * 2, cr * 2);
	}

	// 5. clouds — two deliberately vague drifting shapes
	for (var ci = 0; ci < CLOUDS.length; ci++) {
		var cl = CLOUDS[ci];
		var rx = cl.rx * W, ry = cl.ry * H;
		var cx = ((cl.x0 * W + cl.off) % (W + rx * 2) + (W + rx * 2)) % (W + rx * 2) - rx;
		ctx.save();
		ctx.translate(cx, cl.y * H);
		ctx.scale(rx, ry);
		ctx.fillStyle = radial(0, 0, 1, [[0, css(WHITE, pal.cloudA)], [1, css(WHITE, 0)]]);
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
	if (mp) sources.push({
		x: mp.x,
		amb: 0.10 * moon.vis,
		spec: pal.poolA * 1.5 * moon.vis,
		sigma: W * 0.10
	});

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
				var facing = clamp(slope * (S.x >= xs[k] ? 7 : -7), -1, 1);
				var dxn = (xs[k] - S.x) / S.sigma;
				lit += S.amb * facing
				     + S.spec * Math.exp(-dxn * dxn) * (0.35 + 0.65 * Math.max(0, facing));
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

var cachedSun = null, cachedPal = null, cachedMinute = -1;

function refreshSun() {
	cachedSun = computeSun();
	cachedPal = paletteAt(cachedSun.alt);
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
	place: function (lat, lon) { mode.precise = true; mode.lat = lat; mode.lon = lon; refreshSun(); if (reduced) drawOnce(); }
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

if (!reduced) {
	typeEl(document.getElementById('name'), 550, 85);
	scrambleEl(document.getElementById('roles'), 350, 1700, 'abcdef0123456789');
	var groups = document.querySelectorAll('#fp .g');
	for (var gi = 0; gi < groups.length; gi++) {
		scrambleEl(groups[gi], 500 + gi * 100, 1100, 'ABCDEF0123456789');
	}
}

function drawOnce() { draw(0, cachedSun, cachedPal); }

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
		draw(dt, cachedSun, cachedPal);
		requestAnimationFrame(frame);
	});
}
})();
