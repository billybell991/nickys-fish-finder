/* ================================================
   Weather Module — Open-Meteo API
   Free, no API key, global coverage (Canada + US)
   https://open-meteo.com
   ================================================ */

const Weather = (() => {
  let currentConditions = null;
  let forecast = null;

  // Toronto / north shore — Canadian side of Lake Ontario
  const DEFAULT_LAT = 43.65;
  const DEFAULT_LON = -79.38;

  async function load(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,dew_point_2m,` +
        `wind_speed_10m,wind_direction_10m,wind_gusts_10m,` +
        `surface_pressure,visibility,weather_code` +
        `&daily=temperature_2m_max,temperature_2m_min,` +
        `wind_speed_10m_max,wind_direction_10m_dominant,` +
        `weather_code,precipitation_probability_max` +
        `&wind_speed_unit=kmh&temperature_unit=celsius` +
        `&forecast_days=8&timezone=auto`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Open-Meteo returned ${resp.status}`);
      const data = await resp.json();

      // Parse current conditions
      const c = data.current;
      currentConditions = {
        description: wmoDescription(c.weather_code),
        tempC: c.temperature_2m != null ? parseFloat(c.temperature_2m.toFixed(1)) : null,
        tempF: c.temperature_2m != null ? (c.temperature_2m * 9 / 5 + 32) : null,
        windSpeedKmh: c.wind_speed_10m != null ? parseFloat(c.wind_speed_10m.toFixed(1)) : null,
        windSpeedMph: c.wind_speed_10m != null ? parseFloat((c.wind_speed_10m * 0.621371).toFixed(1)) : null,
        windDirection: c.wind_direction_10m,
        windDirectionText: c.wind_direction_10m != null ? degToCompass(c.wind_direction_10m) : null,
        gustKmh: c.wind_gusts_10m != null ? parseFloat(c.wind_gusts_10m.toFixed(1)) : null,
        pressureHpa: c.surface_pressure != null ? c.surface_pressure.toFixed(1) : null,
        humidity: c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) : null,
        dewPointC: c.dew_point_2m != null ? parseFloat(c.dew_point_2m.toFixed(1)) : null,
        visibility: c.visibility != null ? (c.visibility / 1000).toFixed(1) : null, // m → km
        timestamp: c.time
      };

      // Parse 8-day daily forecast — index 0 = today, 1 = tomorrow, etc.
      if (data.daily) {
        const d = data.daily;
        const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        forecast = d.time.map((dateStr, i) => {
          const date = new Date(dateStr + 'T12:00:00');
          const maxC = d.temperature_2m_max?.[i];
          const minC = d.temperature_2m_min?.[i];
          const windKmh = d.wind_speed_10m_max?.[i];
          const windDirDeg = d.wind_direction_10m_dominant?.[i];
          const precipPct = d.precipitation_probability_max?.[i];
          const desc = wmoDescription(d.weather_code?.[i]);
          return {
            name: i === 0 ? 'Today' : DAY_NAMES[date.getDay()],
            date: dateStr,
            dayOffset: i,
            tempC: maxC != null ? parseFloat(maxC.toFixed(1)) : null,
            tempCMin: minC != null ? parseFloat(minC.toFixed(1)) : null,
            tempF: maxC != null ? (maxC * 9 / 5 + 32).toFixed(0) : null,
            tempUnit: 'C',
            windSpeedKmh: windKmh != null ? Math.round(windKmh) : null,
            windSpeed: windKmh != null ? `${Math.round(windKmh)} km/h` : null,
            windDirection: windDirDeg != null ? degToCompass(windDirDeg) : null,
            shortForecast: desc,
            detailedForecast: buildDetailedForecast(maxC, minC, windKmh, windDirDeg, precipPct, desc),
            isDaytime: true
          };
        });
      }

      return { currentConditions, forecast };
    } catch (err) {
      console.error('Weather load failed:', err);
      return { currentConditions: null, forecast: null };
    }
  }

  function buildDetailedForecast(maxC, minC, windKmh, windDirDeg, precipPct, desc) {
    const parts = [desc + '.'];
    if (maxC != null && minC != null) {
      parts.push(`High ${maxC.toFixed(0)}°C, low ${minC.toFixed(0)}°C.`);
    }
    if (windKmh != null) {
      const dir = windDirDeg != null ? degToCompass(windDirDeg) + ' ' : '';
      parts.push(`${dir}winds up to ${Math.round(windKmh)} km/h.`);
    }
    if (precipPct != null && precipPct >= 20) {
      parts.push(`${precipPct}% chance of precipitation.`);
    }
    return parts.join(' ');
  }

  function getCurrent() { return currentConditions; }
  function getForecast() { return forecast; }

  function degToCompass(deg) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  function getBaroTrend() {
    if (!currentConditions?.pressureHpa) return 'unknown';
    const p = parseFloat(currentConditions.pressureHpa);
    if (p > 1020) return 'high';
    if (p > 1013) return 'rising';
    if (p > 1005) return 'falling';
    return 'low';
  }

  // WMO weather interpretation codes → human description
  function wmoDescription(code) {
    const map = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Icy fog',
      51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
      56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
      66: 'Freezing rain', 67: 'Heavy freezing rain',
      71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
      80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
      85: 'Snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm, heavy hail'
    };
    return map[code] ?? 'Unknown';
  }

  return { load, getCurrent, getForecast, getBaroTrend };
})();
