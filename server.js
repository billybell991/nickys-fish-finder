const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
  '45012': { name: 'Mid-Lake Ontario', lat: 43.623, lon: -77.398 },
  '45135': { name: 'Rochester (West)', lat: 43.426, lon: -77.649 },
  '45139': { name: 'West Lake Ontario', lat: 43.252, lon: -79.529 },
  'RPRN6': { name: 'Rochester, NY', lat: 43.269, lon: -77.596 },
  'OSGN6': { name: 'Oswego, NY', lat: 43.464, lon: -76.512 },
  'YGNN6': { name: 'Youngstown, NY', lat: 43.267, lon: -79.053 }
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
// NOAA NCEI DEM ImageServer — returns elevation (negative = below sea level)
// Lake Ontario surface ≈ 75m above sea level
const LAKE_ONTARIO_SURFACE_M = 75;

app.get('/api/depth', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon) || lat < 42 || lat > 45 || lon < -80 || lon > -75) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  const url = `https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/identify?geometry=%7B%22x%22%3A${lon}%2C%22y%22%3A${lat}%7D&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=false&f=json`;
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

// --------------- Start ---------------

app.listen(PORT, () => {
  console.log(`🐟 Nicky's Fish Finder running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
});
