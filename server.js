const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON request bodies
app.use(express.json());

// Serve static frontend (no-cache for dev)
app.use((req, res, next) => {
  if (req.path.match(/\.(js|css|html)$/)) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// --------------- NDBC Buoy Proxy ---------------
// NDBC text feeds don't have CORS headers, so we proxy them

const LAKE_ONTARIO_BUOYS = {
  // NOAA NDBC shore stations (US side) — the numbered 45xxx buoys are seasonal
  // and often offline; these NWLON stations are the reliable year-round feeds
  'RPRN6': { name: 'Rochester, NY', lat: 43.269, lon: -77.596 },
  'OSGN6': { name: 'Oswego, NY', lat: 43.464, lon: -76.512 },
  'YGNN6': { name: 'Youngstown, NY', lat: 43.267, lon: -79.053 },
  // Seasonal offshore buoys (active May–Nov typically)
  '45012': { name: 'Mid-Lake Ontario', lat: 43.623, lon: -77.398 },
  '45135': { name: 'West Lake Ontario', lat: 43.426, lon: -77.649 },
  '45139': { name: 'West End (Niagara)', lat: 43.252, lon: -79.529 }
};

// Proxy a single buoy's latest observation
app.get('/api/buoy/:stationId', async (req, res) => {
  const stationId = req.params.stationId.replace(/[^a-zA-Z0-9]/g, '');
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NDBC returned ${response.status}`);
    const text = await response.text();
    const parsed = parseNdbcData(text, stationId);
    res.json(parsed);
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch buoy ${stationId}`, detail: err.message });
  }
});

// Get all Lake Ontario buoy data at once
app.get('/api/buoys', async (req, res) => {
  const results = {};
  const fetches = Object.keys(LAKE_ONTARIO_BUOYS).map(async (id) => {
    try {
      const url = `https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status}`);
      const text = await response.text();
      results[id] = parseNdbcData(text, id);
    } catch {
      results[id] = { station: id, ...LAKE_ONTARIO_BUOYS[id], error: true };
    }
  });
  await Promise.all(fetches);
  res.json(results);
});

// List known buoy stations
app.get('/api/buoys/stations', (_req, res) => {
  res.json(LAKE_ONTARIO_BUOYS);
});

// --------------- NDBC Parser ---------------

function parseNdbcData(text, stationId) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 3) return { station: stationId, error: true };

  // Line 0 = headers, Line 1 = units, Line 2+ = data (newest first)
  const headers = lines[0].replace(/^#/, '').trim().split(/\s+/);
  const dataLine = lines[2].trim().split(/\s+/);

  // Rename duplicate headers: NDBC has both MM (month) and mm (minute)
  const seen = {};
  const safeHeaders = headers.map(h => {
    const key = h.toLowerCase();
    if (seen[key]) return h + '_2';
    seen[key] = true;
    return h;
  });

  const record = {};
  safeHeaders.forEach((h, i) => {
    const val = dataLine[i];
    record[h] = val === 'MM' ? null : isNaN(val) ? val : parseFloat(val);
  });

  const meta = LAKE_ONTARIO_BUOYS[stationId] || {};

  // Convert water temp from Celsius to Fahrenheit if present
  const waterTempC = record.WTMP;
  const waterTempF = waterTempC != null ? (waterTempC * 9 / 5 + 32).toFixed(1) : null;

  // Convert air temp
  const airTempC = record.ATMP;
  const airTempF = airTempC != null ? (airTempC * 9 / 5 + 32).toFixed(1) : null;

  // Wind speed from m/s to mph
  const windSpeedMph = record.WSPD != null ? (record.WSPD * 2.237).toFixed(1) : null;
  const gustMph = record.GST != null ? (record.GST * 2.237).toFixed(1) : null;

  return {
    station: stationId,
    name: meta.name || stationId,
    lat: meta.lat,
    lon: meta.lon,
    timestamp: record.YY ? `${record.YY}-${String(record.MM).padStart(2, '0')}-${String(record.DD).padStart(2, '0')} ${String(record.hh).padStart(2, '0')}:${String(record.mm_2 || record.mm || 0).padStart(2, '0')} UTC` : null,
    waterTemp: { c: waterTempC, f: waterTempF != null ? parseFloat(waterTempF) : null },
    airTemp: { c: airTempC, f: airTempF != null ? parseFloat(airTempF) : null },
    wind: {
      speed: { ms: record.WSPD, mph: windSpeedMph != null ? parseFloat(windSpeedMph) : null },
      gust: { ms: record.GST, mph: gustMph != null ? parseFloat(gustMph) : null },
      direction: record.WDIR
    },
    pressure: record.PRES, // hPa (millibars)
    waveHeight: record.WVHT, // meters
    dewPoint: record.DEWP,
    visibility: record.VIS,
    raw: record
  };
}

// --------------- Open-Meteo Marine Proxy ---------------
// Fetches wave height / direction / period for key lake positions
// Open-Meteo Marine API is free, no key, CORS-restricted so we proxy it

const MARINE_STATIONS = [
  { id: 'toronto',   name: 'Toronto / North Shore', lat: 43.65, lon: -79.38, flag: '🇨🇦' },
  { id: 'cobourg',   name: 'Cobourg / Presquile',   lat: 43.96, lon: -77.83, flag: '🇨🇦' },
  { id: 'kingston',  name: 'Kingston Approach',     lat: 44.10, lon: -76.80, flag: '🇨🇦' },
  { id: 'midlake',   name: 'Mid-Lake',              lat: 43.70, lon: -77.40, flag: '🌊' },
  { id: 'rochester', name: 'Rochester Area',        lat: 43.28, lon: -77.60, flag: '🇺🇸' },
  { id: 'niagara',   name: 'Niagara / West End',    lat: 43.27, lon: -79.05, flag: '🇺🇸' }
];

app.get('/api/marine', async (req, res) => {
  try {
    // Fetch wave data for all stations in parallel
    const fetches = MARINE_STATIONS.map(async (s) => {
      const url = `https://marine-api.open-meteo.com/v1/marine` +
        `?latitude=${s.lat}&longitude=${s.lon}` +
        `&current=wave_height,wave_direction,wave_period` +
        `&daily=wave_height_max&forecast_days=8&timezone=America/Toronto`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { ...s, error: true };
        const data = await r.json();
        return {
          ...s,
          waveHeight:    data.current?.wave_height    ?? null,
          waveDirection: data.current?.wave_direction ?? null,
          wavePeriod:    data.current?.wave_period    ?? null,
          dailyMaxWave:  data.daily?.wave_height_max  ?? []
        };
      } catch {
        return { ...s, error: true };
      }
    });
    const results = await Promise.all(fetches);
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: 'Marine data unavailable', detail: err.message });
  }
});

// --------------- GLERL SST Proxy ---------------
// Proxy GLERL Great Lakes SST WMS requests to avoid CORS issues
// Tries multiple GLERL/NOAA endpoints for reliability

const SST_ENDPOINTS = [
  // GLERL CoastWatch - Great Lakes Surface Environmental Analysis
  (params) => `https://coastwatch.glerl.noaa.gov/erddap/wms/GLSEA_GCS/request?${params}`,
  // GLERL ArcGIS WMS 
  (params) => `https://apps.glerl.noaa.gov/erddap/wms/GLSEA_GCS/request?${params}`,
];

app.get('/api/sst/wms', async (req, res) => {
  const params = new URLSearchParams(req.query);
  
  for (const buildUrl of SST_ENDPOINTS) {
    const url = buildUrl(params.toString());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=1800');

      const buffer = Buffer.from(await response.arrayBuffer());
      return res.send(buffer);
    } catch {
      continue; // try next endpoint
    }
  }

  // All endpoints failed — return transparent 1x1 PNG (graceful degradation)
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=300');
  // 1x1 transparent PNG
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  res.send(transparentPng);
});

// --------------- Depth / Bathymetry Proxy ---------------
// NOAA NCEI DEM ImageServer — ETOPO 2022 15-arc-sec bed elevation (OID 2530)
// Locked to ETOPO layer for accurate near-shore depths; the default
// greatlakes_lakedatum layer has 3-arc-sec grid that jumps to mid-depth
// values at the first water pixel, grossly over-reporting near-shore depth.
// Lake Ontario surface ≈ 75m above sea level (MSL)
const LAKE_ONTARIO_SURFACE_M = 75;
const ETOPO_MOSAIC_RULE = encodeURIComponent(JSON.stringify({
  mosaicMethod: 'esriMosaicLockRaster',
  lockRasterIds: [2530]   // ETOPO_2022_v1_15s_bed_elev
}));

app.get('/api/depth', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon) || lat < 42 || lat > 45 || lon < -80 || lon > -75) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  const url = `https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/identify?geometry=%7B%22x%22%3A${lon}%2C%22y%22%3A${lat}%7D&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=false&mosaicRule=${ETOPO_MOSAIC_RULE}&f=json`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NOAA returned ${response.status}`);
    const data = await response.json();
    const elevM = parseFloat(data.value);
    if (isNaN(elevM)) {
      return res.json({ depth: null, onLand: true });
    }
    if (elevM >= LAKE_ONTARIO_SURFACE_M) {
      return res.json({ depth: null, onLand: true, elevationM: elevM });
    }
    const depthM = LAKE_ONTARIO_SURFACE_M - elevM;
    const depthFt = depthM * 3.281;
    res.json({ depthM: Math.round(depthM), depthFt: Math.round(depthFt), onLand: false });
  } catch (err) {
    res.status(502).json({ error: 'Depth lookup failed', detail: err.message });
  }
});

// --------------- Gemini Chat Proxy ---------------
// API key lives server-side in GEMINI_API_KEY env var — never exposed to the client
// Set it in your Render dashboard (Environment → Add Environment Variable)
// or locally in a .env file (add .env to .gitignore)

const GEMINI_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Chat service not configured. Set GEMINI_API_KEY on the server.' });
  }

  const { messages, systemPrompt } = req.body;

  // Validate messages array
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return res.status(400).json({ error: 'Invalid messages array.' });
  }
  for (const msg of messages) {
    if (!['user', 'model'].includes(msg.role)) return res.status(400).json({ error: 'Invalid message role.' });
    if (!Array.isArray(msg.parts) || typeof msg.parts[0]?.text !== 'string') return res.status(400).json({ error: 'Invalid message parts.' });
    if (msg.parts[0].text.length > 4000) return res.status(400).json({ error: 'Message too long.' });
  }
  if (systemPrompt !== undefined && (typeof systemPrompt !== 'string' || systemPrompt.length > 12000)) {
    return res.status(400).json({ error: 'Invalid system prompt.' });
  }

  const body = {
    contents: messages,
    generationConfig: { temperature: 0.85, maxOutputTokens: 1024 }
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  try {
    const response = await fetch(`${GEMINI_CHAT_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok) {
      const msg = data?.error?.message || `Gemini API error ${response.status}`;
      return res.status(502).json({ error: msg });
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini.');
    res.json({ text });
  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'Gemini API timed out.' });
    res.status(502).json({ error: 'Chat service error.', detail: err.message });
  }
});

// --------------- Start ---------------

app.listen(PORT, () => {
  console.log(`🐟 Nicky's Fish Finder running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
});
