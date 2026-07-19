/*
	Abstract sun: draws the sun where it actually sits in the visitor's sky,
	computed from the device clock alone — no location permission.
	Longitude falls out of the UTC offset; latitude is a coarse guess from
	the IANA timezone name. Plenty accurate for scenery.

	Debug: append ?t=<decimal hours, local standard time> to preview a time of day.
*/
(function() {
	var RAD = Math.PI / 180;

	// Coarse latitude by IANA timezone prefix; first match wins.
	var TZ_LAT = [
		['australia', -27], ['pacific/auckland', -37],
		['america/sao_paulo', -24], ['america/argentina', -34],
		['america/santiago', -33], ['america/montevideo', -35],
		['america/lima', -12], ['america/bogota', 5],
		['america/mexico_city', 19], ['america/guatemala', 15],
		['america/panama', 9], ['america/caracas', 10],
		['africa/johannesburg', -26], ['africa/harare', -18],
		['africa/nairobi', -1], ['africa/lagos', 6], ['africa/cairo', 30],
		['africa', 8], ['europe', 48],
		['asia/kolkata', 21], ['asia/dubai', 25], ['asia/singapore', 1],
		['asia/jakarta', -6], ['asia/bangkok', 14], ['asia/hong_kong', 22],
		['asia/tokyo', 36], ['asia/seoul', 37], ['asia/shanghai', 32],
		['asia', 30], ['indian', -10], ['pacific', -15],
		['atlantic', 33], ['america', 39]
	];

	function guessLatitude() {
		var tz = '';
		try { tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase(); } catch (e) {}
		for (var i = 0; i < TZ_LAT.length; i++)
			if (tz.indexOf(TZ_LAT[i][0]) === 0) return TZ_LAT[i][1];
		return 35;
	}

	// Minutes behind UTC, ignoring DST, so solar noon stays near 12:00 standard time.
	function standardOffset(now) {
		var jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
		var jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
		return Math.max(jan, jul);
	}

	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

	function sunState(now) {
		var doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
		var decl = -23.44 * Math.cos((360 / 365) * (doy + 10) * RAD);
		var b = (360 / 364) * (doy - 81) * RAD;
		var eotMin = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

		var t = parseFloat(new URLSearchParams(location.search).get('t'));
		var hours = isNaN(t)
			? now.getUTCHours() + now.getUTCMinutes() / 60 - standardOffset(now) / 60
			: t;

		var H = (hours + eotMin / 60 - 12) * 15; // hour angle; negative = morning
		var lat = guessLatitude();

		var sinEl = Math.sin(lat * RAD) * Math.sin(decl * RAD)
		          + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(H * RAD);
		var el = Math.asin(clamp(sinEl, -1, 1)) / RAD;

		// Hour angle at sunrise/sunset, and the day's peak elevation.
		var H0 = Math.acos(clamp(-Math.tan(lat * RAD) * Math.tan(decl * RAD), -1, 1)) / RAD;

		// Azimuth: measured from south positive westward, shifted to compass
		// bearing (0 = north, 90 = east).
		var az = Math.atan2(
			Math.sin(H * RAD),
			Math.cos(H * RAD) * Math.sin(lat * RAD) - Math.tan(decl * RAD) * Math.cos(lat * RAD)
		) / RAD;

		return {
			el: el,
			az: (az + 540) % 360,
			x: 50 + 44 * clamp(((H % 360 + 540) % 360 - 180) / Math.max(H0, 1), -1, 1),
			elNoon: Math.max(90 - Math.abs(lat - decl), 1)
		};
	}

	// Colours keyed by solar elevation, blended linearly. The sky is drawn
	// as a radial wash centred on the sun: [near sun, mid, far]. The far
	// colour at 28°+ is the site's original deep indigo. The sun rows are
	// [disc, halo]: near-white with a neutral halo when high, amber and
	// warmer when low.
	var SKY = [
		[-18, [26, 28, 62],    [10, 10, 40],   [3, 3, 22]],
		[-8,  [56, 44, 96],    [22, 18, 62],   [5, 5, 30]],
		[0,   [255, 172, 124], [124, 74, 128], [16, 11, 72]],
		[10,  [244, 186, 168], [104, 90, 176], [13, 11, 96]],
		[28,  [214, 216, 244], [92, 90, 196],  [12, 10, 133]],
		[90,  [222, 224, 248], [96, 94, 200],  [12, 10, 133]]
	];
	var SUN = [
		[-10, [255, 138, 80],  [255, 150, 95]],
		[0,   [255, 158, 92],  [255, 172, 112]],
		[10,  [255, 200, 150], [255, 210, 170]],
		[26,  [255, 240, 224], [255, 246, 234]],
		[40,  [255, 255, 255], [252, 251, 250]],
		[90,  [255, 255, 255], [251, 251, 253]]
	];

	function mix(c1, c2, t) {
		return [
			Math.round(c1[0] + (c2[0] - c1[0]) * t),
			Math.round(c1[1] + (c2[1] - c1[1]) * t),
			Math.round(c1[2] + (c2[2] - c1[2]) * t)
		];
	}

	function blend(stops, el) {
		if (el <= stops[0][0]) return stops[0].slice(1);
		for (var i = 1; i < stops.length; i++) {
			if (el <= stops[i][0]) {
				var t = (el - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
				var out = [];
				for (var c = 1; c < stops[i].length; c++)
					out.push(mix(stops[i - 1][c], stops[i][c], t));
				return out;
			}
		}
		return stops[stops.length - 1].slice(1);
	}

	var COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
	               'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

	function render() {
		var bg = document.getElementById('bg');
		var sun = document.getElementById('sun');
		var refl = document.getElementById('sun-reflection');
		if (!bg || !sun || !refl) return;

		var now = new Date();
		var s = sunState(now);
		var t = clamp(s.el / 45, 0, 1); // 0 = on the horizon, 1 = high sun

		// Horizon (top of the waves) sits at ~72% of the viewport height.
		var y = s.el >= 0
			? 72 - 56 * (s.el / s.elNoon)
			: 72 + 3.5 * -s.el;
		y = clamp(y, 8, 110);

		// Sky: brightest at the sun, falling away to the deep far colour. The
		// falloff is kept tight enough that every gradient in the scene traces
		// back to the same point.
		var sky = blend(SKY, s.el);
		bg.style.background = 'radial-gradient(115% 115% at ' + s.x + '% ' + y + '%,'
			+ ' rgb(' + sky[0] + ') 0%, rgb(' + sky[1] + ') 36%, rgb(' + sky[2] + ') 95%)';

		// Disc + halo. Stop percentages are fractions of the 30vmin gradient
		// radius: the disc shrinks and blows out to white as it climbs, the
		// halo stretches far beyond it and softens.
		var c = blend(SUN, s.el);
		var disc = c[0], halo = c[1];
		var r = 12 - 4.7 * t;    // disc radius
		var e = 1.5 + 2.5 * t;   // edge softness
		sun.style.left = s.x + '%';
		sun.style.top = y + '%';
		sun.style.opacity = s.el > 0 ? 1 : clamp(1 + s.el / 9, 0, 1);
		sun.style.background = 'radial-gradient(closest-side,'
			+ ' rgb(' + disc + ') 0%,'
			+ ' rgb(' + disc + ') ' + r.toFixed(1) + '%,'
			+ ' rgba(' + halo + ',' + (0.5 + 0.3 * t).toFixed(2) + ') ' + (r + e).toFixed(1) + '%,'
			+ ' rgba(' + halo + ',0.32) ' + (r * 2.2).toFixed(1) + '%,'
			+ ' rgba(' + halo + ',0.12) ' + (r * 4.5).toFixed(1) + '%,'
			+ ' rgba(' + halo + ',0.04) 62%,'
			+ ' rgba(' + halo + ',0) 100%)';

		// Light landing on the waves (screen-blended): a high sun spreads a
		// wide, faint sheen; a low sun narrows it into a warmer, stronger
		// pool; gone once the sun is well below the horizon.
		var ra = s.el > 0
			? 0.08 + 0.3 * (1 - t)
			: 0.38 * clamp(1 + s.el / 9, 0, 1);
		var rw = 40 + 45 * t;
		refl.style.background = 'radial-gradient(' + rw.toFixed(0) + '% 120% at ' + s.x + '% 22%,'
			+ ' rgba(' + halo + ',' + ra.toFixed(2) + ') 0%,'
			+ ' rgba(' + halo + ',' + (ra * 0.4).toFixed(2) + ') 38%,'
			+ ' rgba(' + halo + ',0) 68%)';

		// Hover card: where the sun sits in the visitor's sky right now.
		var tip = sun.querySelector('.tip');
		if (tip) {
			tip.innerHTML = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
				+ ' &middot; ' + now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
				+ '<br>sun ' + Math.round(Math.abs(s.el)) + '&deg; '
				+ (s.el >= 0 ? 'above' : 'below') + ' the horizon &middot; '
				+ COMPASS[Math.round(s.az / 22.5) % 16];
		}
	}

	render();
	setInterval(render, 60000);
	var core = document.querySelector('#sun .core');
	if (core) core.addEventListener('mouseenter', render); // refresh the card's clock on hover
})();
