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

		return {
			el: el,
			x: 50 + 44 * clamp(((H % 360 + 540) % 360 - 180) / Math.max(H0, 1), -1, 1),
			elNoon: Math.max(90 - Math.abs(lat - decl), 1)
		};
	}

	// Sky and sun colours keyed by solar elevation, blended linearly.
	// The 25°+ entries are the site's original daytime gradient.
	var SKY = [
		[-18, [24, 26, 58],    [3, 3, 26]],
		[-6,  [52, 46, 100],   [8, 7, 48]],
		[0,   [216, 134, 116], [24, 18, 96]],
		[8,   [225, 172, 152], [15, 13, 110]],
		[25,  [194, 194, 225], [12, 10, 133]],
		[90,  [194, 194, 225], [12, 10, 133]]
	];
	var SUN = [
		[-10, [255, 147, 92]],
		[0,   [255, 170, 110]],
		[10,  [255, 214, 160]],
		[30,  [255, 244, 220]],
		[90,  [255, 250, 235]]
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

	function render() {
		var bg = document.getElementById('bg');
		var sun = document.getElementById('sun');
		if (!bg || !sun) return;

		var s = sunState(new Date());
		var sky = blend(SKY, s.el);
		bg.style.background = 'linear-gradient(45deg, rgb(' + sky[0] + ') 0%, rgb(' + sky[1] + ') 100%)';

		// Horizon (top of the waves) sits at ~72% of the viewport height.
		var y = s.el >= 0
			? 72 - 56 * (s.el / s.elNoon)
			: 72 + 3.5 * -s.el;
		var c = blend(SUN, s.el)[0];
		sun.style.left = s.x + '%';
		sun.style.top = clamp(y, 8, 110) + '%';
		sun.style.opacity = s.el > 0 ? 1 : clamp(1 + s.el / 9, 0, 1);
		sun.style.background = 'rgb(' + c + ')';
		sun.style.boxShadow = '0 0 4.5vmin 1.5vmin rgba(' + c + ',0.4), 0 0 18vmin 7vmin rgba(' + c + ',0.18)';
	}

	render();
	setInterval(render, 60000);
})();
