/* ================================================
   Weather Module — NOAA NWS API (free, no key)
   ================================================ */

const Weather = (() => {
  let currentConditions = null;
  let forecast = null;

  // Rochester, NY area — center of Lake Ontario south shore fishing
  const DEFAULT_LAT = 43.27;
  const DEFAULT_LON = -77.63;

  // NWS API is two-step: first get the grid endpoint for coords, then fetch data
  async function load(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
    try {
      // Step 1: Get grid point metadata
      const pointResp = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
        headers: { 'User-Agent': 'NickysFishFinder/1.0' }
      });
      if (!pointResp.ok) throw new Error(`NWS points returned ${pointResp.status}`);
      const pointData = await pointResp.json();

      const forecastUrl = pointData.properties.forecast;
      const stationsUrl = pointData.properties.observationStations;

      // Step 2: Fetch current conditions + forecast in parallel
      const [condResp, fcstResp] = await Promise.all([
        fetch(stationsUrl, { headers: { 'User-Agent': 'NickysFishFinder/1.0' } })
          .then(r => r.json())
          .then(data => {
            // Get the nearest station's latest observation
            const stationId = data.features?.[0]?.properties?.stationIdentifier;
            if (!stationId) return null;
            return fetch(`https://api.weather.gov/stations/${stationId}/observations/latest`, {
              headers: { 'User-Agent': 'NickysFishFinder/1.0' }
            }).then(r => r.json());
          }),
        fetch(forecastUrl, { headers: { 'User-Agent': 'NickysFishFinder/1.0' } })
          .then(r => r.json())
      ]);

      // Parse current conditions
      if (condResp?.properties) {
        const p = condResp.properties;
        currentConditions = {
          description: p.textDescription || '',
          tempC: p.temperature?.value,
          tempF: p.temperature?.value != null ? (p.temperature.value * 9 / 5 + 32).toFixed(1) : null,
          windSpeedKmh: p.windSpeed?.value,
          windSpeedMph: p.windSpeed?.value != null ? (p.windSpeed.value * 0.621371).toFixed(1) : null,
          windDirection: p.windDirection?.value,
          windDirectionText: p.windDirection?.value != null ? degToCompass(p.windDirection.value) : null,
          gustKmh: p.windGust?.value,
          gustMph: p.windGust?.value != null ? (p.windGust.value * 0.621371).toFixed(1) : null,
          pressureHpa: p.barometricPressure?.value != null ? (p.barometricPressure.value / 100).toFixed(1) : null,
          humidity: p.relativeHumidity?.value?.toFixed(0),
          dewPointC: p.dewpoint?.value,
          visibility: p.visibility?.value != null ? (p.visibility.value / 1609.34).toFixed(1) : null, // to miles
          icon: p.icon,
          timestamp: p.timestamp
        };
      }

      // Parse forecast
      if (fcstResp?.properties?.periods) {
        forecast = fcstResp.properties.periods.map(p => ({
          name: p.name,
          tempF: p.temperature,
          tempUnit: p.temperatureUnit,
          windSpeed: p.windSpeed,
          windDirection: p.windDirection,
          shortForecast: p.shortForecast,
          detailedForecast: p.detailedForecast,
          isDaytime: p.isDaytime,
          icon: p.icon
        }));
      }

      return { currentConditions, forecast };
    } catch (err) {
      console.error('Weather load failed:', err);
      return { currentConditions: null, forecast: null };
    }
  }

  function getCurrent() {
    return currentConditions;
  }

  function getForecast() {
    return forecast;
  }

  // Wind direction compass (local copy to avoid coupling to FishMap)
  function degToCompass(deg) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  // Determine barometric trend from forecast text
  function getBaroTrend() {
    if (!currentConditions?.pressureHpa) return 'unknown';
    const p = parseFloat(currentConditions.pressureHpa);
    // Standard pressure ~1013.25 hPa
    if (p > 1020) return 'high';
    if (p > 1013) return 'rising';
    if (p > 1005) return 'falling';
    return 'low';
  }

  return { load, getCurrent, getForecast, getBaroTrend };
})();
