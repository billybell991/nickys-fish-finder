/* ================================================
   Map Module — Leaflet + SST + Buoys
   ================================================ */

const FishMap = (() => {
  let map;
  let sstLayer;
  let bathyLayer;
  let buoyLayerGroup;
  let hotspotLayerGroup;
  let buoyData = {};
  let activeBasemap = null;
  let currentHotspotMonth = new Date().getMonth();

  const ESRI_BASE = 'https://services.arcgisonline.com/ArcGIS/rest/services';

  const BASEMAPS = {
    topo: () => L.tileLayer(`${ESRI_BASE}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, {
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
      maxZoom: 19
    }),
    satellite: () => L.layerGroup([
      L.tileLayer(`${ESRI_BASE}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>', maxZoom: 18
      }),
      L.tileLayer(`${ESRI_BASE}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 18
      })
    ]),
    ocean: () => L.layerGroup([
      L.tileLayer(`${ESRI_BASE}/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}`, {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>', maxZoom: 13
      }),
      L.tileLayer(`${ESRI_BASE}/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 13
      })
    ]),
    natgeo: () => L.tileLayer(`${ESRI_BASE}/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}`, {
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &copy; National Geographic',
      maxZoom: 16
    }),
    dark: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19
    })
  };

  // Lake Ontario bounds — centred on the Canadian north shore (Toronto area)
  const LAKE_CENTER = [43.80, -78.50];
  const LAKE_BOUNDS = [[43.1, -79.9], [44.3, -76.0]];

  function init() {
    map = L.map('map', {
      center: LAKE_CENTER,
      zoom: 8,
      minZoom: 7,
      maxZoom: 13,
      maxBounds: [[42.5, -80.5], [44.8, -75.0]],
      maxBoundsViscosity: 1.0,
      zoomControl: true,
      attributionControl: true
    });

    // Custom panes for z-order control
    map.createPane('sstPane');
    map.getPane('sstPane').style.zIndex = 250;        // below overlays
    map.createPane('bathyPane');
    map.getPane('bathyPane').style.zIndex = 300;       // above SST
    map.createPane('buoyPane');
    map.getPane('buoyPane').style.zIndex = 450;        // above everything
    map.createPane('hotspotPane');
    map.getPane('hotspotPane').style.zIndex = 400;     // above bathymetry, below buoys

    // Default basemap — satellite view
    setBasemap('satellite');

    // Basemap picker buttons
    document.querySelectorAll('.basemap-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.basemap-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setBasemap(btn.dataset.basemap);
      });
    });

    // SST layer — try GLERL GLSEA (Great Lakes specific, no land bleed)
    // Falls back to NASA GIBS if GLERL unavailable
    sstLayer = L.tileLayer.wms(
      '/api/sst/wms', {
        layers: 'GLSEA_GCS:sst',
        styles: '',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        opacity: 0.7,
        attribution: 'SST: NOAA GLERL',
        pane: 'sstPane',
        maxZoom: 13
      }
    );

    // NASA GIBS as primary (reliable) — shown under the GLERL if both load
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const gibsLayer = L.tileLayer(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/' +
      yesterday + '/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png', {
        tileSize: 256,
        opacity: 0.7,
        attribution: 'SST: NASA EOSDIS GIBS',
        pane: 'sstPane',
        maxNativeZoom: 7,
        maxZoom: 13
      }
    );

    // Start with SST layers OFF (not added to map)
    // They get added when user toggles the SST overlay button

    // If GLERL loads successfully, remove GIBS to avoid double-overlay
    let glerl_loaded = false;
    sstLayer.on('tileload', function onLoad() {
      if (!glerl_loaded) {
        glerl_loaded = true;
        map.removeLayer(gibsLayer);
      }
    });
    // If GLERL fails, GIBS is already showing — just clean up the dead layer
    sstLayer.on('tileerror', function onErr() {
      if (!glerl_loaded) {
        sstLayer.off('tileload');
        sstLayer.off('tileerror');
        map.removeLayer(sstLayer);
        sstLayer = gibsLayer; // swap reference so toggle still works
      }
    });

    // Esri Ocean bathymetry — depth contours, soundings, underwater terrain
    const oceanBase = L.tileLayer('https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Depth: &copy; <a href="https://www.esri.com/">Esri</a>',
      opacity: 0.7,
      pane: 'bathyPane',
      maxZoom: 13
    });
    const oceanRef = L.tileLayer('https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}', {
      attribution: '',
      opacity: 0.9,
      pane: 'bathyPane',
      maxZoom: 13
    });
    bathyLayer = L.layerGroup([oceanBase, oceanRef]); // NOT added by default — user toggles

    // Buoy layer group (markers get pane individually) — starts OFF
    buoyLayerGroup = L.layerGroup();

    // Hot spots layer group — starts OFF
    hotspotLayerGroup = L.layerGroup();

    // Overlay toggle buttons
    document.getElementById('layer-sst').addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('active');
      if (e.currentTarget.classList.contains('active')) {
        gibsLayer.addTo(map);
        sstLayer.addTo(map);
      } else {
        map.removeLayer(sstLayer);
        map.removeLayer(gibsLayer);
      }
    });
    document.getElementById('layer-buoys').addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('active');
      e.currentTarget.classList.contains('active') ? map.addLayer(buoyLayerGroup) : map.removeLayer(buoyLayerGroup);
    });
    document.getElementById('layer-bathymetry').addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('active');
      e.currentTarget.classList.contains('active') ? map.addLayer(bathyLayer) : map.removeLayer(bathyLayer);
    });
    document.getElementById('layer-hotspots').addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('active');
      if (e.currentTarget.classList.contains('active')) {
        renderHotSpots(currentHotspotMonth);
        map.addLayer(hotspotLayerGroup);
      } else {
        map.removeLayer(hotspotLayerGroup);
      }
    });

    // SST opacity slider
    const opacitySlider = document.getElementById('sst-opacity');
    const opacityVal = document.getElementById('sst-opacity-val');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value) / 100;
        if (sstLayer) sstLayer.setOpacity(val);
        if (opacityVal) opacityVal.textContent = e.target.value + '%';
      });
    }

    // Tap-on-lake → spot report popup (async for depth fetch)
    map.on('click', async (e) => {
      const { lat, lng } = e.latlng;
      // Only trigger on the lake area (rough bounding box)
      if (lat < 43.15 || lat > 44.25 || lng < -79.85 || lng > -76.05) return;

      // Show popup immediately with loading state for depth
      const popup = L.popup({ className: 'spot-popup', maxWidth: 280 })
        .setLatLng(e.latlng)
        .setContent(buildSpotPopup(lat, lng, null))
        .openOn(map);

      // Fetch depth in background, then update popup
      try {
        const resp = await fetch(`/api/depth?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}`);
        const depthData = await resp.json();
        if (popup.isOpen()) {
          popup.setContent(buildSpotPopup(lat, lng, depthData));
        }
      } catch (err) {
        // Depth unavailable — popup already shows without it
      }
    });

    return map;
  }

  // ---- Spot Report (tap on lake) ----

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function haversine(lat1, lon1, lat2, lon2) {
    return haversineKm(lat1, lon1, lat2, lon2) * 0.621371; // miles for internal temp IDW
  }

  function getNearestBuoys(lat, lon) {
    return Object.entries(buoyData)
      .filter(([, b]) => b.lat && b.lon && !b.error)
      .map(([id, b]) => ({ id, ...b, dist: haversineKm(lat, lon, b.lat, b.lon) }))
      .sort((a, b) => a.dist - b.dist);
  }

  function estimateWaterTemp(lat, lon) {
    const readings = Object.values(buoyData)
      .filter(b => b.lat && b.lon && b.waterTemp?.f != null && !isNaN(b.waterTemp.f))
      .map(b => ({ temp: b.waterTemp.f, dist: haversine(lat, lon, b.lat, b.lon), name: b.name }));

    if (readings.length === 0) return null;
    readings.sort((a, b) => a.dist - b.dist);
    if (readings[0].dist < 1) return { temp: readings[0].temp, confidence: 'High (near buoy)' };

    // Inverse-distance weighting
    let wSum = 0, tSum = 0;
    readings.forEach(r => { const w = 1 / (r.dist * r.dist); wSum += w; tSum += w * r.temp; });
    const confidence = readings[0].dist < 10 ? 'Moderate' : 'Low (far from buoys)';
    return { temp: tSum / wSum, confidence };
  }

  function buildSpotPopup(lat, lng, depthData) {
    const rows = [];
    rows.push('<h4>📍 Spot Report</h4>');
    rows.push(popupRow('Position', `${lat.toFixed(4)}°N, ${Math.abs(lng).toFixed(4)}°W`));

    // Depth
    if (depthData === null) {
      rows.push(popupRow('Depth', '⏳ Loading...'));
    } else if (depthData && !depthData.onLand && depthData.depthFt) {
      const depthClass = getDepthClass(depthData.depthFt);
      rows.push(`<div class="popup-row"><span class="popup-label">Depth</span><span class="popup-value depth-val ${depthClass}">${depthData.depthM} m (${depthData.depthFt} ft)</span></div>`);
      const depthTip = getDepthTip(depthData.depthFt);
      if (depthTip) rows.push(`<div class="spot-tip">${esc(depthTip)}</div>`);
    } else if (depthData && depthData.onLand) {
      rows.push(popupRow('Depth', 'On land'));
    }

    // Estimated water temp
    const tempEst = estimateWaterTemp(lat, lng);
    if (tempEst) {
      const tempC = ((tempEst.temp - 32) * 5 / 9);
      const color = getTempColor(tempEst.temp);
      rows.push(`<div class="popup-row"><span class="popup-label">Est. Water Temp</span><span class="popup-value" style="color:${esc(color)};font-size:15px">${tempC.toFixed(1)}°C</span></div>`);
      rows.push(popupRow('Confidence', tempEst.confidence));

      // Quick fishing tip based on temp
      const tip = getSpotTip(tempEst.temp);
      rows.push(`<div class="spot-tip">${esc(tip)}</div>`);
    }

    // Nearest buoys
    const nearby = getNearestBuoys(lat, lng).slice(0, 3);
    if (nearby.length > 0) {
      rows.push('<div class="popup-section">📡 Nearest Buoys</div>');
      nearby.forEach(b => {
        let info = `${(b.dist * 1.60934).toFixed(1)} km`;
        if (b.waterTemp?.f != null && !isNaN(b.waterTemp.f)) {
          const c = ((b.waterTemp.f - 32) * 5 / 9).toFixed(1);
          info += ` · ${c}°C`;
        }
        if (b.wind?.speed?.mph != null && !isNaN(b.wind.speed.mph)) {
          const kmh = (b.wind.speed.mph * 1.60934).toFixed(0);
          const dir = b.wind.direction != null ? degToCompass(b.wind.direction) + ' ' : '';
          info += ` · ${dir}${kmh} km/h`;
        }
        if (b.waveHeight != null && !isNaN(b.waveHeight)) {
          info += ` · ${b.waveHeight.toFixed(1)}m waves`;
        }
        rows.push(popupRow(esc(b.name || b.id), info));
      });
    }

    // Solunar
    const sol = Solunar.getInfo();
    if (sol) {
      rows.push('<div class="popup-section">🌅 Sun & Moon</div>');
      if (sol.sunTimes) {
        const rise = sol.sunTimes.sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const set = sol.sunTimes.sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        rows.push(popupRow('Sunrise / Sunset', `${rise} / ${set}`));
      }
      rows.push(popupRow('Moon', `${sol.phaseEmoji} ${sol.phaseName}`));
      rows.push(popupRow('Solunar Rating', sol.fishingQuality));
    }

    // Nearby hot spots
    if (typeof HotSpots !== 'undefined') {
      const month = currentHotspotMonth;
      const nearbySpots = HotSpots.getNearby(lat, lng, month, 16); // 16 km
      if (nearbySpots.length > 0) {
        rows.push('<div class="popup-section">🔥 Nearby Hot Spots</div>');
        nearbySpots.slice(0, 3).forEach(hs => {
          const pct = Math.round(hs.intensity * 100);
          const speciesBrief = hs.species.slice(0, 3).join(', ');
          rows.push(popupRow(esc(hs.name), `${pct}% · ${hs.dist.toFixed(1)} km`));
          rows.push(`<div class="spot-tip" style="margin:2px 0 4px">${esc(speciesBrief)} — ${esc(hs.depth)}</div>`);
        });
      }
    }

    return rows.join('');
  }

  function getSpotTip(tempF) {
    const tempC = ((tempF - 32) * 5 / 9).toFixed(1);
    if (tempF >= 48 && tempF <= 55) return `🔥 Prime salmon zone! (${tempC}°C) Fish here — the thermocline is active.`;
    if (tempF >= 45 && tempF < 48) return `👍 Cool but productive. (${tempC}°C) Coho territory. Slow your presentation.`;
    if (tempF > 55 && tempF <= 60) return `⬇️ Warm surface — (${tempC}°C) fish are deeper. Drop below the thermocline.`;
    if (tempF > 60) return `🌡️ Too warm at surface (${tempC}°C). Target 18–30m depth for salmon.`;
    if (tempF >= 40 && tempF < 45) return `❄️ Cold water (${tempC}°C). Fish slow, stay near structure and creek mouths.`;
    if (tempF < 40) return `🥶 Very cold (${tempC}°C). Slow trolling, small baits, stick to warmer pockets.`;
    return '';
  }

  function getDepthClass(depthFt) {
    if (depthFt < 30) return 'depth-shallow';
    if (depthFt < 80) return 'depth-mid';
    if (depthFt < 200) return 'depth-deep';
    return 'depth-abyss';
  }

  function getDepthTip(depthFt) {
    const depthM = Math.round(depthFt * 0.3048);
    if (depthFt < 20) return `🏖️ Very shallow (~${depthM} m) — browns cruise here in spring/fall. Stickbaits & spoons.`;
    if (depthFt < 50) return `🎯 Nearshore zone (~${depthM} m) — great for brown trout and early-season staging salmon.`;
    if (depthFt < 100) return `🐟 Mid-depth (~${depthM} m) — productive for downrigger fishing. Set lines at 12–25 m.`;
    if (depthFt < 200) return `⬇️ Deep water (~${depthM} m) — use downriggers or copper/lead core. Thermocline fishing territory.`;
    if (depthFt < 500) return `🏔️ Very deep (~${depthM} m) — salmon stack on thermocline breaks. Fish 15–36 m down.`;
    return `🌊 Open abyss (~${depthM} m) — deepest water. Fish suspend at thermocline depth, not the bottom.`;
  }

  // Fetch buoy data from our proxy and display on map
  async function loadBuoys() {
    try {
      const resp = await fetch('/api/buoys');
      buoyData = await resp.json();
      renderBuoyMarkers();
      return buoyData;
    } catch (err) {
      console.error('Failed to load buoy data:', err);
      return {};
    }
  }

  function renderBuoyMarkers() {
    buoyLayerGroup.clearLayers();

    Object.entries(buoyData).forEach(([id, buoy]) => {
      if (!buoy.lat || !buoy.lon || buoy.error) return;

      const waterTemp = buoy.waterTemp?.f;
      const color = getTempColor(waterTemp);

      // Custom circular marker with temp label
      const icon = L.divIcon({
        className: 'buoy-marker',
        html: `<div style="
          background: ${color};
          color: #000;
          font-weight: 700;
          font-size: 11px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(255,255,255,0.8);
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          font-family: -apple-system, sans-serif;
        ">${waterTemp != null && !isNaN(waterTemp) ? Math.round(waterTemp) + '°' : '?'}</div>`,

        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker([buoy.lat, buoy.lon], { icon, pane: 'buoyPane' });

      // Popup with details
      const popupHtml = buildBuoyPopup(buoy);
      marker.bindPopup(popupHtml, {
        className: 'buoy-popup',
        maxWidth: 220
      });

      buoyLayerGroup.addLayer(marker);
    });
  }

  function buildBuoyPopup(buoy) {
    const rows = [];
    rows.push(`<h4>${esc(buoy.name || buoy.station)}</h4>`);

    if (buoy.waterTemp?.f != null && !isNaN(buoy.waterTemp.f)) {
      const c = ((buoy.waterTemp.f - 32) * 5 / 9).toFixed(1);
      rows.push(popupRow('Water Temp', `${c}°C`));
    }
    if (buoy.airTemp?.f != null && !isNaN(buoy.airTemp.f)) {
      const c = ((buoy.airTemp.f - 32) * 5 / 9).toFixed(1);
      rows.push(popupRow('Air Temp', `${c}°C`));
    }
    if (buoy.wind?.speed?.mph != null && !isNaN(buoy.wind.speed.mph)) {
      const kmh = (buoy.wind.speed.mph * 1.60934).toFixed(1);
      const dir = buoy.wind.direction != null ? degToCompass(buoy.wind.direction) + ' ' : '';
      const gust = buoy.wind.gust?.mph && !isNaN(buoy.wind.gust.mph) ? ` (gusts ${(buoy.wind.gust.mph * 1.60934).toFixed(1)} km/h)` : '';
      rows.push(popupRow('Wind', `${dir}${kmh} km/h${gust}`));
    }
    if (buoy.pressure != null && !isNaN(buoy.pressure)) {
      rows.push(popupRow('Pressure', `${buoy.pressure} mb`));
    }
    if (buoy.waveHeight != null && !isNaN(buoy.waveHeight)) {
      rows.push(popupRow('Waves', `${buoy.waveHeight.toFixed(1)} m`));
    }
    if (buoy.timestamp) {
      rows.push(popupRow('Updated', esc(buoy.timestamp)));
    }

    return rows.join('');
  }

  function popupRow(label, value) {
    return `<div class="popup-row"><span class="popup-label">${esc(label)}</span><span class="popup-value">${esc(value)}</span></div>`;
  }

  // HTML-escape for safe DOM insertion
  function esc(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  // Color based on water temp (°F) — optimized for salmon
  function getTempColor(tempF) {
    if (tempF == null) return '#888';
    if (tempF < 40) return '#0066ff';    // frigid
    if (tempF < 45) return '#00aacc';    // cold
    if (tempF < 48) return '#00cc88';    // cool
    if (tempF < 55) return '#00e676';    // OPTIMAL for salmon
    if (tempF < 60) return '#aacc00';    // warm
    if (tempF < 65) return '#ffcc00';    // too warm
    if (tempF < 70) return '#ff9900';    // hot
    return '#ff3300';                     // very hot
  }

  function getTempClass(tempF) {
    if (tempF == null) return '';
    if (tempF < 45) return 'temp-cold';
    if (tempF < 48) return 'temp-cool';
    if (tempF < 56) return 'temp-optimal';
    if (tempF < 65) return 'temp-warm';
    return 'temp-hot';
  }

  function degToCompass(deg) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  function getBuoyData() {
    return buoyData;
  }

  function setBasemap(name) {
    if (activeBasemap) map.removeLayer(activeBasemap);
    activeBasemap = BASEMAPS[name]();
    activeBasemap.addTo(map);
    // bringToBack only works on TileLayer, not LayerGroup (satellite, ocean)
    if (typeof activeBasemap.bringToBack === 'function') {
      activeBasemap.bringToBack();
    } else if (activeBasemap.eachLayer) {
      activeBasemap.eachLayer(l => { if (typeof l.bringToBack === 'function') l.bringToBack(); });
    }
    // Toggle body class for light/dark text adaptation
    document.body.classList.toggle('light-basemap', name !== 'dark');
  }

  function getMap() {
    return map;
  }

  // ---- Hot Spots Heat Map Layer ----

  function renderHotSpots(month) {
    hotspotLayerGroup.clearLayers();
    if (typeof HotSpots === 'undefined') return;

    const spots = HotSpots.getActiveSpots(month);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    spots.forEach(spot => {
      const intensity = spot.intensity;
      if (intensity <= 0) return;

      // Color from green (low) to red (peak)
      const r = Math.round(255 * Math.min(1, intensity * 2));
      const g = Math.round(255 * Math.max(0, 1 - intensity));
      const color = `rgb(${r}, ${g}, 40)`;
      const fillOpacity = 0.12 + intensity * 0.28;

      // Circle sized by radius from data
      const circle = L.circle([spot.lat, spot.lon], {
        radius: spot.radius,
        color: color,
        weight: 2,
        opacity: 0.7,
        fillColor: color,
        fillOpacity: fillOpacity,
        pane: 'hotspotPane'
      });

      // Label marker in center
      const label = L.marker([spot.lat, spot.lon], {
        icon: L.divIcon({
          className: 'hotspot-label',
          html: `<div class="hotspot-marker" style="border-color: ${esc(color)}">
            <span class="hotspot-name">${esc(spot.name)}</span>
            <span class="hotspot-intensity">${Math.round(intensity * 100)}%</span>
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        }),
        pane: 'hotspotPane',
        interactive: true
      });

      // Popup with spot details
      const speciesList = spot.species.join(', ');
      const popupHtml = `
        <h4>🔥 ${esc(spot.name)}</h4>
        ${popupRow('Activity', `${Math.round(intensity * 100)}% — ${intensity >= 0.8 ? 'Peak' : intensity >= 0.5 ? 'Good' : 'Moderate'}`)}
        ${popupRow('Month', esc(monthNames[month]))}
        ${popupRow('Species', esc(speciesList))}
        ${popupRow('Depth', esc(spot.depth))}
        <div class="spot-tip">${esc(spot.tip)}</div>
      `;

      label.bindPopup(popupHtml, { className: 'spot-popup', maxWidth: 280 });

      hotspotLayerGroup.addLayer(circle);
      hotspotLayerGroup.addLayer(label);
    });
  }

  function updateHotSpots(month) {
    currentHotspotMonth = month;
    // Only re-render if layer is currently active
    const btn = document.getElementById('layer-hotspots');
    if (btn && btn.classList.contains('active')) {
      renderHotSpots(month);
    }
  }

  return { init, loadBuoys, getBuoyData, getMap, getTempClass, degToCompass, updateHotSpots };
})();
