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

    // Update weather tab to highlight selected day
    renderWeatherTab(weatherData, dayOffset);

    // Update hot spots layer if active
    if (typeof FishMap !== 'undefined' && FishMap.updateHotSpots) {
      FishMap.updateHotSpots(selectedDate.getMonth());
    }
  }

  function getForecastForDate(dayOffset) {
    if (dayOffset === 0 || !weatherData?.forecast) return null;

    // NWS forecast periods: "Monday", "Monday Night", "Tuesday", etc.
    // Find the daytime period for the target date
    const target = new Date();
    target.setDate(target.getDate() + dayOffset);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayName = dayNames[target.getDay()];

    // Search forecast periods for this day name (daytime period)
    const period = weatherData.forecast.find(p =>
      p.name === targetDayName && p.isDaytime !== false
    );

    if (!period) return null;

    // Build a pseudo-conditions object from forecast data
    const windMatch = period.windSpeed ? period.windSpeed.match(/(\d+)/) : null;
    const windSpeed = windMatch ? parseInt(windMatch[1]) : null;

    return {
      tempF: period.tempF,
      description: period.shortForecast,
      windSpeedMph: windSpeed,
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
  }

  // ---- Data Loading ----

  async function refreshAllData() {
    // Show loading state
    document.getElementById('ai-summary-text').textContent = 'Refreshing data...';

    // Load solunar immediately (no network needed)
    solunarData = Solunar.getInfo();
    updateMoonStrip(solunarData);

    // Load buoys, weather in parallel (with timeout fallback)
    const weatherTimeout = new Promise(resolve =>
      setTimeout(() => resolve({ currentConditions: null, forecast: null }), 12000)
    );
    const [buoys, weather] = await Promise.all([
      FishMap.loadBuoys().catch(() => ({})),
      Promise.race([Weather.load(), weatherTimeout])
    ]);

    buoyData = buoys;
    weatherData = weather || { currentConditions: null, forecast: null };

    // Update weather strip
    updateWeatherStrip(weatherData.currentConditions, buoys);

    // Update weather detail tab
    renderWeatherTab(weatherData);

    // Update buoys tab
    renderBuoysTab(buoys);

    // Run AI analysis
    runAI();

    // Color-code date buttons by fishing score
    scoreDateButtons();
  }

  // ---- Weather Strip (top bar) ----

  function updateWeatherStrip(conditions, buoys) {
    // Air temp — from weather or buoys
    if (conditions?.tempF) {
      document.getElementById('ws-temp-val').textContent = `${Math.round(conditions.tempF)}°F`;
    } else if (buoys) {
      const airT = Object.values(buoys).map(b => b.airTemp?.f).filter(t => t != null && !isNaN(t));
      if (airT.length > 0) document.getElementById('ws-temp-val').textContent = `${Math.round(airT[0])}°F`;
    }

    // Water temp — best buoy reading
    if (buoys) {
      const waterTemps = Object.values(buoys)
        .map(b => b.waterTemp?.f)
        .filter(t => t != null && !isNaN(t));
      if (waterTemps.length > 0) {
        const avg = waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length;
        const el = document.getElementById('ws-water-val');
        el.textContent = `${Math.round(avg)}°F`;
        el.className = 'ws-value ' + FishMap.getTempClass(avg);
      } else {
        document.getElementById('ws-water-val').textContent = 'N/A';
      }
    }

    // Wind — from weather or buoys
    if (conditions?.windSpeedMph) {
      const dir = conditions.windDirectionText || '';
      document.getElementById('ws-wind-val').textContent = `${dir} ${Math.round(conditions.windSpeedMph)}`;
    } else if (buoys) {
      for (const b of Object.values(buoys)) {
        if (b.wind?.speed?.mph != null && !isNaN(b.wind.speed.mph)) {
          const dir = b.wind.direction != null ? FishMap.degToCompass(b.wind.direction) + ' ' : '';
          document.getElementById('ws-wind-val').textContent = `${dir}${Math.round(b.wind.speed.mph)}`;
          break;
        }
      }
    }

    // Pressure — from weather or buoys
    if (conditions?.pressureHpa) {
      document.getElementById('ws-pressure-val').textContent = `${parseFloat(conditions.pressureHpa).toFixed(0)} mb`;
    } else if (buoys) {
      for (const b of Object.values(buoys)) {
        if (b.pressure != null && !isNaN(b.pressure)) {
          document.getElementById('ws-pressure-val').textContent = `${b.pressure.toFixed(0)} mb`;
          break;
        }
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
  }

  // ---- Weather Tab ----

  function renderWeatherTab(data, dayOffset = 0) {
    const grid = document.getElementById('weather-grid');
    const conditions = data?.currentConditions;

    if (!conditions) {
      grid.innerHTML = '<p class="error-msg">Weather data unavailable</p>';
      return;
    }

    grid.innerHTML = '';

    const cells = [
      { label: 'Temperature', value: conditions.tempF ? `${Math.round(conditions.tempF)}°F` : '--', detail: conditions.description },
      { label: 'Wind', value: conditions.windSpeedMph ? `${Math.round(conditions.windSpeedMph)} mph` : '--', detail: conditions.windDirectionText || '' },
      { label: 'Pressure', value: conditions.pressureHpa ? `${parseFloat(conditions.pressureHpa).toFixed(0)} mb` : '--', detail: Weather.getBaroTrend() },
      { label: 'Humidity', value: conditions.humidity ? `${conditions.humidity}%` : '--', detail: '' },
      { label: 'Visibility', value: conditions.visibility ? `${conditions.visibility} mi` : '--', detail: '' },
      { label: 'Dew Point', value: conditions.dewPointC != null ? `${(conditions.dewPointC * 9 / 5 + 32).toFixed(0)}°F` : '--', detail: '' }
    ];

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
      // For future dates, show the selected day's detail at top
      if (dayOffset > 0) {
        const targetDay = new Date();
        targetDay.setDate(targetDay.getDate() + dayOffset);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const targetDayName = dayNames[targetDay.getDay()];

        const matchingPeriods = data.forecast.filter(p =>
          p.name === targetDayName || p.name === targetDayName + ' Night'
        );
        if (matchingPeriods.length > 0) {
          const detail = document.createElement('div');
          detail.className = 'forecast-detail-card';
          detail.innerHTML = matchingPeriods.map(p =>
            `<div class="forecast-detail-period">
              <strong>${sanitize(p.name)}</strong>: ${sanitize(p.detailedForecast)}
            </div>`
          ).join('');
          forecastEl.appendChild(detail);
        }
      }

      data.forecast.slice(0, 8).forEach(period => {
        const item = document.createElement('div');
        item.className = 'forecast-item';
        item.innerHTML = `
          <span class="forecast-name">${sanitize(period.name)}</span>
          <span class="forecast-temp">${sanitize(period.tempF)}°${sanitize(period.tempUnit)}</span>
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
        rows += buoyRow('Water Temp', `${buoy.waterTemp.f}°F`, cls);
      }
      if (buoy.airTemp?.f != null && !isNaN(buoy.airTemp.f)) {
        rows += buoyRow('Air Temp', `${buoy.airTemp.f}°F`);
      }
      if (buoy.wind?.speed?.mph != null && !isNaN(buoy.wind.speed.mph)) {
        const dir = buoy.wind.direction != null ? FishMap.degToCompass(buoy.wind.direction) + ' ' : '';
        rows += buoyRow('Wind', `${dir}${buoy.wind.speed.mph} mph`);
      }
      if (buoy.pressure != null && !isNaN(buoy.pressure)) {
        rows += buoyRow('Pressure', `${buoy.pressure} mb`);
      }
      if (buoy.waveHeight != null && !isNaN(buoy.waveHeight)) {
        rows += buoyRow('Waves', `${(buoy.waveHeight * 3.281).toFixed(1)} ft`);
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

  // ---- Utility ----

  function sanitize(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
})();
