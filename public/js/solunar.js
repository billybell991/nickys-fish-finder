/* ================================================
   Solunar Module — Moon phase & fishing times
   Uses SunCalc algorithm (no API calls)
   ================================================ */

const Solunar = (() => {
  // Simplified SunCalc — moon phase calculation
  // Based on Jean Meeus "Astronomical Algorithms"

  const DAY_MS = 1000 * 60 * 60 * 24;
  const J1970 = 2440588;
  const J2000 = 2451545;

  function toJulian(date) {
    return date.valueOf() / DAY_MS - 0.5 + J1970;
  }

  function toDays(date) {
    return toJulian(date) - J2000;
  }

  // Sun calculations
  function solarMeanAnomaly(d) {
    return (357.5291 + 0.98560028 * d) * Math.PI / 180;
  }

  function eclipticLongitude(M) {
    const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * Math.PI / 180;
    const P = 102.9372 * Math.PI / 180;
    return M + C + P + Math.PI;
  }

  function sunCoords(d) {
    const M = solarMeanAnomaly(d);
    const L = eclipticLongitude(M);
    return {
      dec: Math.asin(Math.sin(0) * Math.cos(23.4397 * Math.PI / 180) + Math.cos(0) * Math.sin(23.4397 * Math.PI / 180) * Math.sin(L)),
      ra: Math.atan2(Math.sin(L) * Math.cos(23.4397 * Math.PI / 180), Math.cos(L))
    };
  }

  // Moon phase (0-1)
  // 0 = new moon, 0.25 = first quarter, 0.5 = full moon, 0.75 = last quarter
  function getMoonPhase(date = new Date()) {
    const d = toDays(date);

    const sunAnom = solarMeanAnomaly(d);
    const sunLon = eclipticLongitude(sunAnom);

    // Moon coordinates (simplified)
    const moonLon = (218.316 + 13.176396 * d) * Math.PI / 180;
    const moonAnom = (134.963 + 13.064993 * d) * Math.PI / 180;
    const moonDist = (93.272 + 13.229350 * d) * Math.PI / 180;

    const lng = moonLon + 6.289 * Math.PI / 180 * Math.sin(moonAnom);

    // Phase angle
    const inc = Math.atan2(
      Math.sin(sunLon - lng),
      Math.cos(sunLon - lng)
    );

    // Normalize to 0-1
    let phase = 0.5 + 0.5 * inc / Math.PI;
    if (phase < 0) phase += 1;
    if (phase > 1) phase -= 1;

    return phase;
  }

  function getPhaseName(phase) {
    if (phase < 0.0625) return 'New Moon';
    if (phase < 0.1875) return 'Waxing Crescent';
    if (phase < 0.3125) return 'First Quarter';
    if (phase < 0.4375) return 'Waxing Gibbous';
    if (phase < 0.5625) return 'Full Moon';
    if (phase < 0.6875) return 'Waning Gibbous';
    if (phase < 0.8125) return 'Last Quarter';
    if (phase < 0.9375) return 'Waning Crescent';
    return 'New Moon';
  }

  function getPhaseEmoji(phase) {
    if (phase < 0.0625) return '🌑';
    if (phase < 0.1875) return '🌒';
    if (phase < 0.3125) return '🌓';
    if (phase < 0.4375) return '🌔';
    if (phase < 0.5625) return '🌕';
    if (phase < 0.6875) return '🌖';
    if (phase < 0.8125) return '🌗';
    if (phase < 0.9375) return '🌘';
    return '🌑';
  }

  // Simple sunrise/sunset approximation for fishing time windows
  function getSunTimes(date = new Date(), lat = 43.27, lon = -77.63) {
    const d = toDays(date);
    const lw = -lon * Math.PI / 180;
    const phi = lat * Math.PI / 180;

    const sc = sunCoords(d);
    const H = -0.0145; // sunrise/sunset angle

    const cosH = (Math.sin(H) - Math.sin(phi) * Math.sin(sc.dec)) /
                 (Math.cos(phi) * Math.cos(sc.dec));

    // No sunrise/sunset at this latitude today
    if (cosH > 1 || cosH < -1) return null;

    const hourAngle = Math.acos(cosH);

    // Julian transit (solar noon)
    const Jnoon = J2000 + (0.0009 + lw / (2 * Math.PI) + Math.round(d - 0.0009 - lw / (2 * Math.PI)));

    const Jset = Jnoon + hourAngle / (2 * Math.PI);
    const Jrise = Jnoon - hourAngle / (2 * Math.PI);

    return {
      sunrise: new Date((Jrise - J1970 + 0.5) * DAY_MS),
      sunset: new Date((Jset - J1970 + 0.5) * DAY_MS),
      solarNoon: new Date((Jnoon - J1970 + 0.5) * DAY_MS)
    };
  }

  // Solunar fishing quality rating
  function getFishingRating(date = new Date()) {
    const phase = getMoonPhase(date);

    // New moon and full moon = major periods (best fishing)
    // Quarter moons = minor periods
    const distFromMajor = Math.min(
      phase,
      Math.abs(phase - 0.5),
      1 - phase
    );

    // Score from 0-1 (1 = best solunar conditions)
    // Best during new/full moon, worst during quarters
    const score = 1 - (distFromMajor / 0.25);
    return Math.max(0, Math.min(1, score));
  }

  function getInfo(date = new Date()) {
    const phase = getMoonPhase(date);
    const sunTimes = getSunTimes(date);
    const fishingScore = getFishingRating(date);

    return {
      phase,
      phaseName: getPhaseName(phase),
      phaseEmoji: getPhaseEmoji(phase),
      sunTimes,
      fishingScore,
      fishingQuality: fishingScore > 0.7 ? 'Major' : fishingScore > 0.3 ? 'Minor' : 'Neutral'
    };
  }

  return { getInfo, getMoonPhase, getPhaseName, getPhaseEmoji, getSunTimes, getFishingRating };
})();
