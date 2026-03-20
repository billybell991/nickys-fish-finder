/* ================================================
   App Orchestrator — Ties everything together
   ================================================ */

(function () {
  'use strict';

  // ---- State ----
  let buoyData = null;
  let weatherData = null;
  let solunarData = null;
  let aiResult = null;
  let marineData = null;
  let panelExpanded = false;
  let selectedDate = new Date(); // currently selected forecast date

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      // Initialize map
      FishMap.init();

      // Wire up UI controls
      initUI();

      // Load all data
      await refreshAllData();

      // Auto-refresh every 15 minutes
      setInterval(refreshAllData, 15 * 60 * 1000);
    } catch (err) {
      console.error('App init failed:', err);
      document.getElementById('ai-summary-text').textContent = 'Error: ' + err.message;
    }
  });

  // ---- UI Setup ----

  function initUI() {
    // Date picker strip
    buildDateStrip();

    // Bottom panel toggle
    const handle = document.getElementById('panel-handle');
    handle.addEventListener('click', togglePanel);

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Layer panel toggle (slide down from top)
    const layerPanel = document.getElementById('layer-panel');
    const layerPeek = document.getElementById('layer-peek');
    layerPeek.addEventListener('click', () => {
      const expanding = !layerPanel.classList.contains('expanded');
      layerPanel.classList.toggle('expanded');
      layerPeek.querySelector('span').textContent = expanding
        ? '▲ Tap to close layers'
        : '🗺️ Tap for map layers';
      if (expanding) collapseBottomPanel();
    });
    document.getElementById('layer-handle').addEventListener('click', () => {
      layerPanel.classList.remove('expanded');
      layerPeek.querySelector('span').textContent = '🗺️ Tap for map layers';
    });

    // Auto-dismiss: tap on the map closes both panels
    document.getElementById('map').addEventListener('click', () => {
      layerPanel.classList.remove('expanded');
      layerPeek.querySelector('span').textContent = '🗺️ Tap for map layers';
      collapseBottomPanel();
    });

    // Refresh button
    document.getElementById('btn-refresh').addEventListener('click', () => {
      refreshAllData();
    });

    // Location button
    const locBtn = document.getElementById('btn-location');
    if (locBtn) {
      locBtn.addEventListener('click', () => FishMap.requestUserLocation());
    }

    // Refresh the favorites tab whenever a spot is saved/removed
    window.addEventListener('favorites-changed', () => {
      if (document.getElementById('tab-favorites')?.classList.contains('active')) {
        renderFavoritesTab();
      }
    });

    // Help modal
    const helpOverlay = document.getElementById('help-overlay');
    document.getElementById('btn-help').addEventListener('click', () => {
      helpOverlay.classList.remove('hidden');
    });
    document.getElementById('help-close').addEventListener('click', () => {
      helpOverlay.classList.add('hidden');
    });
    helpOverlay.addEventListener('click', (e) => {
      if (e.target === helpOverlay) helpOverlay.classList.add('hidden');
    });
    document.querySelectorAll('.help-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.parentElement;
        section.classList.toggle('open');
      });
    });
  }

  function buildDateStrip() {
    const container = document.getElementById('date-scroll');
    container.innerHTML = '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const btn = document.createElement('button');
      btn.className = 'date-btn' + (i === 0 ? ' active' : '');
      btn.dataset.offset = i;
      const label = i === 0 ? 'Today' : dayNames[d.getDay()];
      btn.innerHTML = `<span class="date-day">${sanitize(label)}</span><span class="date-num">${monthNames[d.getMonth()]} ${d.getDate()}</span>`;
      btn.addEventListener('click', () => selectDate(i));
      container.appendChild(btn);
    }
  }

  function selectDate(dayOffset) {
    // Update active button
    document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.date-btn[data-offset="${dayOffset}"]`).classList.add('active');

    // Set the selected date
    selectedDate = new Date();
    selectedDate.setDate(selectedDate.getDate() + dayOffset);

    // Update assessment title
    const title = document.getElementById('ai-assessment-title');
    if (dayOffset === 0) {
      title.textContent = '🐟 Today\'s Assessment';
    } else {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      title.textContent = `🐟 ${dayNames[selectedDate.getDay()]} Forecast`;
    }

    // Recalculate solunar for selected date
    solunarData = Solunar.getInfo(selectedDate);
    updateMoonStrip(solunarData);

    // Build forecast weather conditions for the selected day
    const forecastConditions = getForecastForDate(dayOffset);

    // Re-run AI with forecast data
    runAI(dayOffset, forecastConditions);

    // Update weather strip and detail tab for this day
    updateWeatherStrip(weatherData?.currentConditions, buoyData, dayOffset > 0 ? forecastConditions : null);
    renderWeatherTab(weatherData, dayOffset);

    // Update hot spots layer if active
    if (typeof FishMap !== 'undefined' && FishMap.updateHotSpots) {
      FishMap.updateHotSpots(selectedDate.getMonth());
    }
  }

  function getForecastForDate(dayOffset) {
    if (dayOffset === 0 || !weatherData?.forecast) return null;

    // Open-Meteo forecast is day-indexed: index 0 = today, 1 = tomorrow, etc.
    const period = weatherData.forecast[dayOffset];
    if (!period) return null;

    return {
      tempF: period.tempF,
      tempC: period.tempC,
      description: period.shortForecast,
      windSpeedKmh: period.windSpeedKmh,
      windSpeedMph: period.windSpeedKmh != null ? parseFloat((period.windSpeedKmh * 0.621371).toFixed(1)) : null,
      windDirectionText: period.windDirection || null,
      forecastDetail: period.detailedForecast,
      isForecast: true
    };
  }

  function scoreDateButtons() {
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);

      const sol = Solunar.getInfo(d);
      const fc = i === 0 ? weatherData?.currentConditions : getForecastForDate(i);

      const result = FishingAI.analyze({
        buoys: i === 0 ? buoyData : null,
        weather: fc,
        solunar: sol
      });

      const btn = document.querySelector(`.date-btn[data-offset="${i}"]`);
      if (!btn) continue;

      // Remove old level classes
      btn.classList.remove('date-lvl-1', 'date-lvl-2', 'date-lvl-3', 'date-lvl-4', 'date-lvl-5');

      // 5 levels: 1=poor(red) 2=below-avg(orange) 3=fair(yellow) 4=good(yellow-green) 5=great(green)
      let lvl;
      if (result.score >= 70) lvl = 5;
      else if (result.score >= 55) lvl = 4;
      else if (result.score >= 40) lvl = 3;
      else if (result.score >= 25) lvl = 2;
      else lvl = 1;

      btn.classList.add(`date-lvl-${lvl}`);
    }
  }

  function togglePanel() {
    panelExpanded = !panelExpanded;
    document.getElementById('bottom-panel').classList.toggle('expanded', panelExpanded);
    document.getElementById('panel-peek').textContent = panelExpanded
      ? '▼ Tap to minimize'
      : '📊 Tap for fishing intel';
    // Close layer panel when opening bottom panel
    if (panelExpanded) document.getElementById('layer-panel').classList.remove('expanded');
  }

  function collapseBottomPanel() {
    if (panelExpanded) {
      panelExpanded = false;
      document.getElementById('bottom-panel').classList.remove('expanded');
      document.getElementById('panel-peek').textContent = '📊 Tap for fishing intel';
    }
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'tab-favorites') renderFavoritesTab();
  }

  // ---- Data Loading ----

  async function refreshAllData() {
    // Show loading state
    document.getElementById('ai-summary-text').textContent = 'Refreshing data...';

    // Load solunar immediately (no network needed)
    solunarData = Solunar.getInfo();
    updateMoonStrip(solunarData);

    // Load buoys, weather, and marine data in parallel
    const weatherTimeout = new Promise(resolve =>
      setTimeout(() => resolve({ currentConditions: null, forecast: null }), 12000)
    );
    const [buoys, weather, marine] = await Promise.all([
      FishMap.loadBuoys().catch(() => ({})),
      Promise.race([Weather.load(), weatherTimeout]),
      fetch('/api/marine').then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    buoyData = buoys;
    weatherData = weather || { currentConditions: null, forecast: null };
    marineData = marine;

    // Update weather strip (wave height from marine data if no buoy waves)
    updateWeatherStrip(weatherData.currentConditions, buoys, null);

    // Update weather detail tab
    renderWeatherTab(weatherData);

    // Update buoys tab
    renderBuoysTab(buoys);

    // Run AI analysis (also renders lake conditions card)
    runAI();

    // Color-code date buttons by fishing score
    scoreDateButtons();
  }

  // ---- Weather Strip (top bar) ----

  function updateWeatherStrip(conditions, buoys, forecastConditions) {
    const fc = forecastConditions; // non-null when a future day is selected

    // Air temp — forecast day overrides current; prefer °C
    if (fc?.tempC != null) {
      document.getElementById('ws-temp-val').textContent = `${Math.round(fc.tempC)}°C`;
    } else if (fc?.tempF != null) {
      const c = ((parseFloat(fc.tempF) - 32) * 5 / 9).toFixed(0);
      document.getElementById('ws-temp-val').textContent = `${c}°C`;
    } else if (conditions?.tempC != null) {
      document.getElementById('ws-temp-val').textContent = `${Math.round(conditions.tempC)}°C`;
    } else if (conditions?.tempF) {
      const c = ((parseFloat(conditions.tempF) - 32) * 5 / 9).toFixed(0);
      document.getElementById('ws-temp-val').textContent = `${c}°C`;
    } else if (buoys && !fc) {
      const airT = Object.values(buoys).map(b => b.airTemp?.c).filter(t => t != null && !isNaN(t));
      if (airT.length > 0) document.getElementById('ws-temp-val').textContent = `${Math.round(airT[0])}°C`;
    }

    // Water temp — buoy average in °C (not shown for forecast days — no buoy data)
    if (!fc && buoys) {
      const waterTempsF = Object.values(buoys)
        .map(b => b.waterTemp?.f)
        .filter(t => t != null && !isNaN(t));
      if (waterTempsF.length > 0) {
        const avgF = waterTempsF.reduce((a, b) => a + b, 0) / waterTempsF.length;
        const avgC = ((avgF - 32) * 5 / 9);
        const el = document.getElementById('ws-water-val');
        el.textContent = `${avgC.toFixed(1)}°C`;
        el.className = 'ws-value ' + FishMap.getTempClass(avgF);
      } else {
        document.getElementById('ws-water-val').textContent = 'N/A';
      }
    } else if (fc) {
      document.getElementById('ws-water-val').textContent = 'N/A';
    }

    // Wind — km/h; forecast day overrides
    if (fc?.windSpeedKmh != null) {
      const dir = fc.windDirectionText || '';
      document.getElementById('ws-wind-val').textContent = `${dir} ${Math.round(fc.windSpeedKmh)}`;
    } else if (fc?.windSpeedMph != null) {
      const kmh = Math.round(parseFloat(fc.windSpeedMph) * 1.60934);
      const dir = fc.windDirectionText || '';
      document.getElementById('ws-wind-val').textContent = `${dir} ${kmh}`;
    } else if (conditions?.windSpeedKmh != null) {
      const dir = conditions.windDirectionText || '';
      document.getElementById('ws-wind-val').textContent = `${dir} ${Math.round(conditions.windSpeedKmh)}`;
    } else if (buoys && !fc) {
      for (const b of Object.values(buoys)) {
        if (b.wind?.speed?.mph != null && !isNaN(b.wind.speed.mph)) {
          const kmh = Math.round(b.wind.speed.mph * 1.60934);
          const dir = b.wind.direction != null ? FishMap.degToCompass(b.wind.direction) + ' ' : '';
          document.getElementById('ws-wind-val').textContent = `${dir}${kmh}`;
          break;
        }
      }
    }

    // Pressure — mb (same in metric)
    if (conditions?.pressureHpa) {
      document.getElementById('ws-pressure-val').textContent = `${parseFloat(conditions.pressureHpa).toFixed(0)} mb`;
    } else if (buoys && !fc) {
      for (const b of Object.values(buoys)) {
        if (b.pressure != null && !isNaN(b.pressure)) {
          document.getElementById('ws-pressure-val').textContent = `${b.pressure.toFixed(0)} mb`;
          break;
        }
      }
    }

    // Wave height — prefer buoy data, fall back to marine model data
    const waveEl = document.getElementById('ws-wave-val');
    if (waveEl) {
      const buoyWaves = (!fc && buoys)
        ? Object.values(buoys).map(b => b.waveHeight).filter(w => w != null && !isNaN(w))
        : [];
      if (buoyWaves.length > 0) {
        const avg = buoyWaves.reduce((a, b) => a + b, 0) / buoyWaves.length;
        waveEl.textContent = `${avg.toFixed(1)} m`;
      } else if (marineData) {
        // Use midlake station for strip, or first station with data
        const midlake = marineData.find(s => s.id === 'midlake' && !s.error && s.waveHeight != null)
          || marineData.find(s => !s.error && s.waveHeight != null);
        if (midlake) waveEl.textContent = `${midlake.waveHeight.toFixed(1)} m`;
      }
    }
  }

  function updateMoonStrip(solunar) {
    if (solunar) {
      document.getElementById('ws-moon-val').textContent = solunar.phaseEmoji;
    }
  }

  // ---- AI Tab ----

  function runAI(dayOffset = 0, forecastConditions = null) {
    const weatherForAI = (dayOffset === 0 || !forecastConditions)
      ? weatherData?.currentConditions
      : forecastConditions;

    aiResult = FishingAI.analyze({
      buoys: dayOffset === 0 ? buoyData : null, // buoy data only valid for today
      weather: weatherForAI,
      solunar: solunarData
    });

    // Rating badge
    const ratingEl = document.getElementById('ai-rating-val');
    ratingEl.textContent = `${aiResult.rating} (${aiResult.score}/100)`;
    ratingEl.className = `rating-value ${aiResult.ratingClass}`;

    // Summary
    document.getElementById('ai-summary-text').textContent = aiResult.summary;

    // Recommendations
    const recsEl = document.getElementById('ai-recs-list');
    recsEl.innerHTML = '';
    aiResult.recommendations.forEach(rec => {
      const card = document.createElement('div');
      card.className = 'rec-card';
      card.innerHTML = `<h4>${sanitize(rec.title)}</h4><p>${sanitize(rec.detail)}</p>`;
      recsEl.appendChild(card);
    });

    // Spot advice
    document.getElementById('ai-spots-text').textContent = aiResult.spotAdvice;

    // Update panel peek text with rating
    if (!panelExpanded) {
      document.getElementById('panel-peek').textContent = `📊 ${aiResult.rating} conditions — tap for intel`;
    }

    // Render lake conditions card in intel tab
    renderLakeConditions();
  }

  function renderLakeConditions() {
    const grid = document.getElementById('lake-conditions-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!marineData || marineData.error) {
      grid.innerHTML = '<p class="error-msg">Lake conditions unavailable</p>';
      return;
    }

    marineData.forEach(station => {
      const card = document.createElement('div');
      card.className = 'marine-card';

      let waveText = '--';
      let periodText = '';
      let dirText = '';

      if (!station.error) {
        if (station.waveHeight != null) waveText = `${station.waveHeight.toFixed(1)} m`;
        if (station.wavePeriod != null) periodText = `${station.wavePeriod.toFixed(0)}s period`;
        if (station.waveDirection != null) {
          const compass = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
          dirText = compass[Math.round(station.waveDirection / 22.5) % 16];
        }
      }

      card.innerHTML =
        `<div class="marine-flag">${sanitize(station.flag || '')}</div>` +
        `<div class="marine-name">${sanitize(station.name)}</div>` +
        `<div class="marine-wave">${sanitize(waveText)}</div>` +
        (periodText || dirText
          ? `<div class="marine-detail">${sanitize([dirText, periodText].filter(Boolean).join(' · '))}</div>`
          : '');

      grid.appendChild(card);
    });
  }

  // ---- Weather Tab ----

  function renderWeatherTab(data, dayOffset = 0) {
    const grid = document.getElementById('weather-grid');
    const title = document.querySelector('#weather-detail h3');

    // For future days, use forecast conditions in the grid
    const fc = dayOffset > 0 ? getForecastForDate(dayOffset) : null;
    const conditions = data?.currentConditions;

    if (!conditions && !fc) {
      grid.innerHTML = '<p class="error-msg">Weather data unavailable</p>';
      return;
    }

    // Update section heading
    if (title) {
      title.textContent = dayOffset === 0 ? '🌤️ Current Conditions' : '🌤️ Forecast Conditions';
    }

    grid.innerHTML = '';

    let cells;
    if (fc) {
      // Forecast day — build from forecast period data
      const windKmh = fc.windSpeedMph != null ? Math.round(parseFloat(fc.windSpeedMph) * 1.60934) : null;
      const tempC = fc.tempF != null ? ((parseFloat(fc.tempF) - 32) * 5 / 9).toFixed(1) : null;
      cells = [
        { label: 'Temperature', value: tempC != null ? `${tempC}°C` : '--', detail: fc.description || '' },
        { label: 'Wind', value: windKmh != null ? `${windKmh} km/h` : '--', detail: fc.windDirectionText || '' },
        { label: 'Pressure', value: conditions?.pressureHpa ? `${parseFloat(conditions.pressureHpa).toFixed(0)} mb` : '--', detail: Weather.getBaroTrend() },
        { label: 'Humidity', value: '--', detail: 'Forecast' },
        { label: 'Visibility', value: '--', detail: 'Forecast' },
        { label: 'Dew Point', value: '--', detail: 'Forecast' }
      ];
    } else {
      // Today — live conditions
      const windKmh = conditions.windSpeedKmh != null ? `${Math.round(conditions.windSpeedKmh)} km/h` :
                      conditions.windSpeedMph != null ? `${Math.round(conditions.windSpeedMph * 1.60934)} km/h` : '--';
      // Wave height from buoys
      const waves = buoyData ? Object.values(buoyData).map(b => b.waveHeight).filter(w => w != null && !isNaN(w)) : [];
      const avgWaveM = waves.length > 0 ? (waves.reduce((a, b) => a + b, 0) / waves.length).toFixed(1) : null;
      cells = [
        { label: 'Temperature', value: conditions.tempC != null ? `${Math.round(conditions.tempC)}°C` : conditions.tempF ? `${((parseFloat(conditions.tempF)-32)*5/9).toFixed(0)}°C` : '--', detail: conditions.description },
        { label: 'Wind', value: windKmh, detail: conditions.windDirectionText || '' },
        { label: 'Pressure', value: conditions.pressureHpa ? `${parseFloat(conditions.pressureHpa).toFixed(0)} mb` : '--', detail: Weather.getBaroTrend() },
        { label: 'Humidity', value: conditions.humidity ? `${conditions.humidity}%` : '--', detail: '' },
        { label: 'Visibility', value: conditions.visibility ? `${conditions.visibility} km` : '--', detail: '' },
        { label: 'Dew Point', value: conditions.dewPointC != null ? `${conditions.dewPointC.toFixed(1)}°C` : '--', detail: '' },
        { label: 'Wave Height', value: avgWaveM != null ? `${avgWaveM} m` : '--', detail: 'Lake avg' }
      ];
    }

    cells.forEach(c => {
      const div = document.createElement('div');
      div.className = 'weather-cell';
      div.innerHTML = `
        <span class="wc-label">${sanitize(c.label)}</span>
        <span class="wc-value">${sanitize(c.value)}</span>
        ${c.detail ? `<span class="wc-detail">${sanitize(c.detail)}</span>` : ''}
      `;
      grid.appendChild(div);
    });

    // Forecast
    const forecastEl = document.getElementById('forecast-list');
    forecastEl.innerHTML = '';
    if (data?.forecast) {
      // For future dates, show the selected day's detailed forecast at top
      if (dayOffset > 0) {
        const period = data.forecast[dayOffset];
        if (period?.detailedForecast) {
          const detail = document.createElement('div');
          detail.className = 'forecast-detail-card';
          detail.innerHTML = `<div class="forecast-detail-period"><strong>${sanitize(period.name)}</strong>: ${sanitize(period.detailedForecast)}</div>`;
          forecastEl.appendChild(detail);
        }
      }

      data.forecast.slice(0, 8).forEach(period => {
        const item = document.createElement('div');
        item.className = 'forecast-item';
        const tempHi = period.tempC != null ? `${Math.round(period.tempC)}°C` : '--';
        const tempLo = period.tempCMin != null ? ` / ${Math.round(period.tempCMin)}°C` : '';
        item.innerHTML = `
          <span class="forecast-name">${sanitize(period.name)}</span>
          <span class="forecast-temp">${sanitize(tempHi + tempLo)}</span>
          <span class="forecast-short">${sanitize(period.shortForecast)}</span>
        `;
        forecastEl.appendChild(item);
      });
    }
  }

  // ---- Buoys Tab ----

  function renderBuoysTab(buoys) {
    const list = document.getElementById('buoy-list');
    list.innerHTML = '';

    if (!buoys || Object.keys(buoys).length === 0) {
      list.innerHTML = '<p class="error-msg">Buoy data unavailable</p>';
      return;
    }

    Object.entries(buoys).forEach(([id, buoy]) => {
      if (buoy.error) return;

      const card = document.createElement('div');
      card.className = 'buoy-card';

      let rows = `<h4>${sanitize(buoy.name || id)}</h4>`;

      if (buoy.waterTemp?.f != null && !isNaN(buoy.waterTemp.f)) {
        const cls = FishMap.getTempClass(buoy.waterTemp.f);
        const c = ((buoy.waterTemp.f - 32) * 5 / 9).toFixed(1);
        rows += buoyRow('Water Temp', `${c}°C`, cls);
      }
      if (buoy.airTemp?.f != null && !isNaN(buoy.airTemp.f)) {
        const c = ((buoy.airTemp.f - 32) * 5 / 9).toFixed(1);
        rows += buoyRow('Air Temp', `${c}°C`);
      }
      if (buoy.wind?.speed?.mph != null && !isNaN(buoy.wind.speed.mph)) {
        const kmh = (buoy.wind.speed.mph * 1.60934).toFixed(1);
        const dir = buoy.wind.direction != null ? FishMap.degToCompass(buoy.wind.direction) + ' ' : '';
        rows += buoyRow('Wind', `${dir}${kmh} km/h`);
      }
      if (buoy.pressure != null && !isNaN(buoy.pressure)) {
        rows += buoyRow('Pressure', `${buoy.pressure} mb`);
      }
      if (buoy.waveHeight != null && !isNaN(buoy.waveHeight)) {
        rows += buoyRow('Waves', `${buoy.waveHeight.toFixed(1)} m`);
      }
      if (buoy.timestamp) {
        rows += buoyRow('Updated', buoy.timestamp);
      }

      card.innerHTML = rows;
      list.appendChild(card);
    });
  }

  function buoyRow(label, value, cssClass) {
    const cls = cssClass ? ` class="buoy-val ${sanitize(cssClass)}"` : ' class="buoy-val"';
    return `<div class="buoy-row"><span class="buoy-label">${sanitize(label)}</span><span${cls}>${sanitize(value)}</span></div>`;
  }

  // ---- Favorites Tab ----

  function buildFavConditions(fav) {
    const lines = [];

    // Estimated current water temp from buoy IDW
    if (buoyData && typeof FishMap.estimateWaterTemp === 'function') {
      const tempEst = FishMap.estimateWaterTemp(fav.lat, fav.lng);
      if (tempEst) {
        const tempC = ((tempEst.temp - 32) * 5 / 9).toFixed(1);
        lines.push(`🌡️ Est. water: ${tempC}°C`);
      }
    }

    // Depth saved at time of heart-tap
    if (fav.depthM) {
      lines.push(`⬇️ Depth: ~${fav.depthM}m (${Math.round(fav.depthM * 3.281)}ft)`);
    }

    // Current solunar rating
    const sol = Solunar.getInfo();
    if (sol) lines.push(`🌙 Solunar: ${sol.fishingQuality}`);

    // Nearest buoy reading
    if (buoyData && typeof FishMap.getNearestBuoys === 'function') {
      const nearest = FishMap.getNearestBuoys(fav.lat, fav.lng)[0];
      if (nearest && !nearest.error) {
        let line = `📡 ${nearest.name || nearest.id} (${nearest.dist.toFixed(0)} km)`;
        if (nearest.waterTemp?.f != null && !isNaN(nearest.waterTemp.f)) {
          line += ` — ${((nearest.waterTemp.f - 32) * 5 / 9).toFixed(1)}°C`;
        }
        if (nearest.wind?.speed?.mph != null && !isNaN(nearest.wind.speed.mph)) {
          line += `, ${(nearest.wind.speed.mph * 1.60934).toFixed(0)} km/h winds`;
        }
        lines.push(line);
      }
    }

    return lines;
  }

  function renderFavoritesTab() {
    const list = document.getElementById('favorites-list');
    if (!list) return;

    if (typeof FishFavorites === 'undefined') {
      list.innerHTML = '<p id="favorites-empty">Favorites unavailable.</p>';
      return;
    }

    const favs = FishFavorites.getAll();

    if (favs.length === 0) {
      list.innerHTML =
        '<p id="favorites-empty">No favorite spots saved yet.<br>' +
        'Tap anywhere on the lake and press <strong>🤍 Save Spot</strong> to pin a location!</p>';
      return;
    }

    list.innerHTML = '';

    // Show newest first
    favs.slice().reverse().forEach(fav => {
      const card = document.createElement('div');
      card.className = 'fav-card';

      const spotName = fav.name || `${fav.lat.toFixed(4)}°N, ${Math.abs(fav.lng).toFixed(4)}°W`;
      const savedDate = new Date(fav.savedAt).toLocaleDateString('en-CA', {
        year: 'numeric', month: 'short', day: 'numeric'
      });

      const conditions = buildFavConditions(fav);
      const condRows = conditions
        .map(c => `<div class="fav-condition-row">${sanitize(c)}</div>`)
        .join('');

      card.innerHTML =
        '<div class="fav-card-header">' +
          `<div class="fav-name">${sanitize(spotName)}</div>` +
          `<button class="fav-remove" data-lat="${fav.lat}" data-lng="${fav.lng}" title="Remove">🗑️</button>` +
        '</div>' +
        `<div class="fav-saved">Saved ${sanitize(savedDate)}</div>` +
        (condRows ? `<div class="fav-conditions">${condRows}</div>` : '') +
        `<button class="fav-go-btn" data-lat="${fav.lat}" data-lng="${fav.lng}">📍 Show on Map</button>`;

      list.appendChild(card);
    });

    // Wire up buttons
    list.querySelectorAll('.fav-go-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lat = parseFloat(btn.dataset.lat);
        const lng = parseFloat(btn.dataset.lng);
        // Close layer panel
        document.getElementById('layer-panel')?.classList.remove('expanded');
        const peekSpan = document.querySelector('#layer-peek span');
        if (peekSpan) peekSpan.textContent = '🗺️ Tap for map layers';
        // Collapse bottom panel and navigate
        collapseBottomPanel();
        FishMap.showSpotAt(lat, lng);
      });
    });

    list.querySelectorAll('.fav-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        FishFavorites.remove(parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lng));
        renderFavoritesTab();
      });
    });
  }

  // ---- Utility ----

  function sanitize(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
})();
