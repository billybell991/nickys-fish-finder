/* ================================================
   Seasonal Hot Spots — Curated Lake Ontario
   fishing knowledge by month/season
   ================================================
   
   Data compiled from:
   - NYSDEC fishing reports & creel surveys
   - OMNRF (Ontario Ministry of Natural Resources) reports
   - Lake Ontario charter captain patterns (both shores)
   - Great Lakes Fishery Commission reports
   - Tributary run timing data (US & Canadian tributaries)
   
   Each spot has lat/lon, species, seasonal intensity,
   and depth/technique tips.
   ================================================ */

const HotSpots = (() => {

  // Intensity: 0.0 (inactive) to 1.0 (peak fishing)
  // Months are 0-indexed (0=Jan, 11=Dec)

  const SPOTS = [
    // ---- Salmon River / Port Ontario ----
    {
      id: 'salmon-river-mouth',
      name: 'Salmon River Mouth',
      lat: 43.650, lon: -76.210,
      radius: 1500,
      species: ['Chinook', 'Coho', 'Steelhead', 'Brown Trout'],
      months: { 0: 0.5, 1: 0.4, 2: 0.5, 3: 0.7, 4: 0.8, 5: 0.6, 6: 0.5, 7: 0.6, 8: 1.0, 9: 1.0, 10: 0.8, 11: 0.5 },
      tip: 'Premier salmon river on the lake. Kings stage here Aug-Sep, run Oct. Steelhead follow Nov-Apr. Fish the thermal plume at the mouth for staging fish.',
      depth: '15-60 ft offshore, river itself for runs'
    },
    // ---- Oswego Harbor ----
    {
      id: 'oswego-harbor',
      name: 'Oswego Harbor',
      lat: 43.500, lon: -76.510,
      radius: 1800,
      species: ['Chinook', 'Coho', 'Brown Trout', 'Steelhead'],
      months: { 0: 0.3, 1: 0.3, 2: 0.4, 3: 0.7, 4: 0.8, 5: 0.7, 6: 0.6, 7: 0.7, 8: 0.9, 9: 0.9, 10: 0.6, 11: 0.4 },
      tip: 'Oswego River attracts fall runs. Spring brown trout cruising the harbor walls. Warm water discharge holds fish in winter.',
      depth: '20-50 ft near harbor, deeper offshore'
    },
    // ---- Mexico Bay / Little Salmon River ----
    {
      id: 'mexico-bay',
      name: 'Mexico Bay',
      lat: 43.555, lon: -76.260,
      radius: 2500,
      species: ['Chinook', 'Coho', 'Brown Trout'],
      months: { 0: 0.2, 1: 0.2, 2: 0.3, 3: 0.6, 4: 0.7, 5: 0.6, 6: 0.5, 7: 0.6, 8: 0.9, 9: 0.8, 10: 0.5, 11: 0.3 },
      tip: 'Shallow bay warms early in spring — browns stack here April-May. Fall staging for kings heading to Salmon River and tributaries.',
      depth: '15-40 ft, structure along the shoals'
    },
    // ---- Sodus Bay ----
    {
      id: 'sodus-bay',
      name: 'Sodus Bay / Point',
      lat: 43.300, lon: -76.978,
      radius: 2000,
      species: ['Brown Trout', 'Chinook', 'Steelhead'],
      months: { 0: 0.3, 1: 0.3, 2: 0.5, 3: 0.8, 4: 0.9, 5: 0.7, 6: 0.5, 7: 0.5, 8: 0.7, 9: 0.8, 10: 0.7, 11: 0.4 },
      tip: 'Outstanding spring brown trout fishery. Stickbaits along the 20-ft contour in April-May. Kings move through in summer. Protected bay for rough weather days.',
      depth: '15-35 ft for browns, 40-80 ft for salmon'
    },
    // ---- Rochester / Irondequoit Bay ----
    {
      id: 'rochester-port',
      name: 'Port of Rochester',
      lat: 43.285, lon: -77.600,
      radius: 2000,
      species: ['Chinook', 'Coho', 'Brown Trout', 'Steelhead'],
      months: { 0: 0.3, 1: 0.3, 2: 0.5, 3: 0.7, 4: 0.8, 5: 0.7, 6: 0.6, 7: 0.7, 8: 0.8, 9: 0.8, 10: 0.6, 11: 0.4 },
      tip: 'Genesee River mouth — major tributary. Browns cruise the piers spring & fall. Salmon staging late summer. Steelhead Nov-Apr in the river.',
      depth: '20-60 ft near shore, 80-150 ft offshore'
    },
    // ---- Niagara Bar ----
    {
      id: 'niagara-bar',
      name: 'Niagara Bar',
      lat: 43.320, lon: -79.060,
      radius: 2500,
      species: ['Chinook', 'Coho', 'Steelhead', 'Lake Trout'],
      months: { 0: 0.3, 1: 0.3, 2: 0.4, 3: 0.7, 4: 0.8, 5: 0.8, 6: 0.7, 7: 0.8, 8: 0.9, 9: 0.9, 10: 0.6, 11: 0.4 },
      tip: 'Where the Niagara River enters the lake. Massive baitfish concentrations. Fish stack on the current seam. One of the most productive spots on the entire lake.',
      depth: '30-80 ft on the bar, drops to 200+ ft'
    },
    // ---- Wilson / Olcott / 30-Mile Bank ----
    {
      id: 'wilson-olcott',
      name: 'Wilson / Olcott',
      lat: 43.360, lon: -78.810,
      radius: 2500,
      species: ['Chinook', 'Coho', 'Steelhead', 'Lake Trout'],
      months: { 0: 0.2, 1: 0.2, 2: 0.3, 3: 0.6, 4: 0.7, 5: 0.8, 6: 0.8, 7: 0.9, 8: 0.9, 9: 0.7, 10: 0.4, 11: 0.3 },
      tip: 'Access point for the 30-mile bank — one of the lake\'s best summer trolling zones. Deep structure holds kings all summer. Run north to the temperature break.',
      depth: '60-200 ft, targeting thermocline at 50-90 ft'
    },
    // ---- Henderson Harbor / Eastern Basin ----
    {
      id: 'henderson-harbor',
      name: 'Henderson Harbor',
      lat: 43.910, lon: -76.210,
      radius: 2000,
      species: ['Smallmouth Bass', 'Walleye', 'Chinook', 'Brown Trout'],
      months: { 0: 0.1, 1: 0.1, 2: 0.2, 3: 0.5, 4: 0.8, 5: 0.9, 6: 0.8, 7: 0.7, 8: 0.6, 9: 0.5, 10: 0.3, 11: 0.1 },
      tip: 'Eastern basin — shallower and warmer. World-class smallmouth bass in May-Jun. Walleye on the shoals. Some salmon action offshore.',
      depth: '10-40 ft for bass/walleye, deeper for salmon'
    },
    // ---- Stony Point / Galloo Island ----
    {
      id: 'stony-point',
      name: 'Stony Point / Galloo Island',
      lat: 43.880, lon: -76.380,
      radius: 3500,
      species: ['Chinook', 'Lake Trout', 'Walleye'],
      months: { 0: 0.1, 1: 0.1, 2: 0.2, 3: 0.4, 4: 0.6, 5: 0.7, 6: 0.8, 7: 0.8, 8: 0.7, 9: 0.5, 10: 0.3, 11: 0.1 },
      tip: 'Island structure creates current breaks. Lake trout year-round on deep structure. Kings pass through in summer migration. Walleye on the shoals.',
      depth: '40-120 ft around the islands'
    },
    // ---- Fair Haven / Sterling ----
    {
      id: 'fair-haven',
      name: 'Fair Haven / Little Sodus Bay',
      lat: 43.355, lon: -76.715,
      radius: 1800,
      species: ['Brown Trout', 'Chinook', 'Steelhead'],
      months: { 0: 0.3, 1: 0.3, 2: 0.4, 3: 0.7, 4: 0.8, 5: 0.6, 6: 0.5, 7: 0.5, 8: 0.7, 9: 0.7, 10: 0.6, 11: 0.3 },
      tip: 'Protected bay for small boat anglers. Sterling Creek draws fall steelhead. Browns along the rocky shoreline spring and fall.',
      depth: '15-45 ft nearshore'
    },
    // ---- Sandy Pond / North Sandy Creek ----
    {
      id: 'sandy-pond',
      name: 'Sandy Pond',
      lat: 43.685, lon: -76.240,
      radius: 1500,
      species: ['Chinook', 'Coho', 'Brown Trout'],
      months: { 0: 0.2, 1: 0.2, 2: 0.3, 3: 0.5, 4: 0.6, 5: 0.5, 6: 0.4, 7: 0.5, 8: 0.8, 9: 0.8, 10: 0.5, 11: 0.2 },
      tip: 'Barrier bar creates a warm-water pocket that attracts bait in spring. Fall staging area as fish move toward Salmon River.',
      depth: '10-30 ft in the pond, deeper offshore'
    },
    // ---- Mid-Lake Thermal Break Zone ----
    {
      id: 'mid-lake-thermal',
      name: 'Mid-Lake Thermal Zone',
      lat: 43.650, lon: -77.400,
      radius: 8000,
      species: ['Chinook', 'Coho', 'Lake Trout'],
      months: { 0: 0.0, 1: 0.0, 2: 0.1, 3: 0.3, 4: 0.5, 5: 0.7, 6: 0.9, 7: 1.0, 8: 0.8, 9: 0.4, 10: 0.1, 11: 0.0 },
      tip: 'Open water thermal breaks — the summer salmon highway. Find the SST color transition on the map and troll along it. Kings stack where warm surface meets cold upwelling.',
      depth: '100-300 ft water, fish at 40-90 ft on the thermocline'
    },
    // ---- Oak Orchard Creek ----
    {
      id: 'oak-orchard',
      name: 'Oak Orchard Creek',
      lat: 43.395, lon: -78.263,
      radius: 1800,
      species: ['Chinook', 'Coho', 'Steelhead', 'Brown Trout'],
      months: { 0: 0.3, 1: 0.3, 2: 0.4, 3: 0.7, 4: 0.8, 5: 0.6, 6: 0.5, 7: 0.6, 8: 0.8, 9: 0.8, 10: 0.7, 11: 0.4 },
      tip: 'Major south shore tributary. Known for excellent steelhead runs. Spring browns cruise the creek mouth. Fall salmon staging.',
      depth: '15-50 ft offshore, creek for tributray fishing'
    },
    // ---- 18 Mile Creek / Olcott ----
    {
      id: '18-mile-creek',
      name: '18 Mile Creek',
      lat: 43.365, lon: -78.715,
      radius: 1500,
      species: ['Steelhead', 'Brown Trout', 'Chinook'],
      months: { 0: 0.4, 1: 0.4, 2: 0.5, 3: 0.7, 4: 0.7, 5: 0.5, 6: 0.4, 7: 0.4, 8: 0.6, 9: 0.7, 10: 0.7, 11: 0.5 },
      tip: 'One of the best steelhead streams on the south shore. Fish runs through winter. Brown trout in spring/fall along the lakeshore.',
      depth: '10-30 ft nearshore, creek for steelhead'
    },
    // ---- Pultneyville / Bear Creek ----
    {
      id: 'pultneyville',
      name: 'Pultneyville',
      lat: 43.305, lon: -77.160,
      radius: 1800,
      species: ['Brown Trout', 'Chinook', 'Lake Trout'],
      months: { 0: 0.2, 1: 0.2, 2: 0.4, 3: 0.7, 4: 0.8, 5: 0.6, 6: 0.5, 7: 0.5, 8: 0.6, 9: 0.7, 10: 0.5, 11: 0.3 },
      tip: 'Rocky structure draws spring browns. Troll the 20-ft shelf with stickbaits. Lake trout on deep structure year-round.',
      depth: '20-80 ft, sharp drop-off close to shore'
    },
    // ---- Point Breeze ----
    {
      id: 'point-breeze',
      name: 'Point Breeze / Oak Orchard',
      lat: 43.405, lon: -78.260,
      radius: 2000,
      species: ['Chinook', 'Coho', 'Brown Trout', 'Lake Trout'],
      months: { 0: 0.2, 1: 0.2, 2: 0.4, 3: 0.7, 4: 0.8, 5: 0.7, 6: 0.7, 7: 0.8, 8: 0.8, 9: 0.7, 10: 0.5, 11: 0.3 },
      tip: 'Launch point for offshore salmon trolling. The 30–90 m contour north of here is prime summer king water. Brown trout in spring along the shore break.',
      depth: '12–45 m, work the contours north'
    },

    // ======== CANADIAN NORTH SHORE ========

    // ---- Toronto (Port Credit / Outer Harbour) ----
    {
      id: 'toronto-waterfront',
      name: 'Toronto Waterfront',
      lat: 43.620, lon: -79.384,
      radius: 3000,
      species: ['Chinook', 'Coho', 'Brown Trout', 'Steelhead'],
      months: { 0: 0.3, 1: 0.3, 2: 0.5, 3: 0.7, 4: 0.8, 5: 0.7, 6: 0.7, 7: 0.8, 8: 0.8, 9: 0.7, 10: 0.6, 11: 0.4 },
      tip: 'Urban salmon fishery right off Toronto. Spring browns cruise the piers and breakwalls. Summer kings found north of the 20 m line. Steelhead staging in Humber and Don rivers fall–winter.',
      depth: '10–50 m nearshore, deeper offshore'
    },
    // ---- Port Credit / Credit River ----
    {
      id: 'port-credit',
      name: 'Port Credit / Credit River',
      lat: 43.549, lon: -79.580,
      radius: 2000,
      species: ['Chinook', 'Coho', 'Steelhead', 'Brown Trout'],
      months: { 0: 0.3, 1: 0.3, 2: 0.5, 3: 0.7, 4: 0.8, 5: 0.7, 6: 0.6, 7: 0.7, 8: 0.9, 9: 0.9, 10: 0.7, 11: 0.5 },
      tip: 'Credit River is one of the top Ontario tributaries. Kings and Coho stage off the mouth Aug–Sep, run Oct. Steelhead through winter and spring. Browns along the pier heads.',
      depth: '8–40 m offshore, river for tributary fishing'
    },
    // ---- Oakville / Bronte Creek ----
    {
      id: 'oakville-bronte',
      name: 'Oakville / Bronte Creek',
      lat: 43.490, lon: -79.700,
      radius: 1800,
      species: ['Chinook', 'Steelhead', 'Brown Trout'],
      months: { 0: 0.3, 1: 0.3, 2: 0.5, 3: 0.7, 4: 0.7, 5: 0.6, 6: 0.5, 7: 0.6, 8: 0.8, 9: 0.9, 10: 0.7, 11: 0.4 },
      tip: 'Bronte Creek draws strong fall Chinook and Coho runs. Spring steelhead fishery is excellent. Brown trout along the breakwall year-round.',
      depth: '8–35 m nearshore'
    },
    // ---- Burlington / Hamilton Harbour ----
    {
      id: 'burlington-hamilton',
      name: 'Burlington / Hamilton Harbour',
      lat: 43.310, lon: -79.790,
      radius: 2500,
      species: ['Chinook', 'Coho', 'Steelhead', 'Lake Trout'],
      months: { 0: 0.2, 1: 0.2, 2: 0.4, 3: 0.6, 4: 0.7, 5: 0.7, 6: 0.7, 7: 0.8, 8: 0.8, 9: 0.7, 10: 0.5, 11: 0.3 },
      tip: 'Niagara Bar current sweeps baitfish eastward toward Burlington–Hamilton. Fish the drop-offs adjacent to the harbour entrance. Lake trout on deep structure year-round.',
      depth: '20–100 m'
    },
    // ---- Whitby / Oshawa ----
    {
      id: 'whitby-oshawa',
      name: 'Whitby / Oshawa Harbour',
      lat: 43.840, lon: -78.910,
      radius: 2200,
      species: ['Chinook', 'Coho', 'Brown Trout', 'Steelhead'],
      months: { 0: 0.2, 1: 0.2, 2: 0.4, 3: 0.6, 4: 0.7, 5: 0.7, 6: 0.7, 7: 0.8, 8: 0.9, 9: 0.8, 10: 0.6, 11: 0.3 },
      tip: 'Consistent producers east of Toronto. Fish the mid-lake thermal axis north of Whitby in summer. Oshawa Harbour pier draws browns in spring. Ganaraska River (nearby) is a top steelhead river.',
      depth: '15–70 m offshore'
    },
    // ---- Port Hope / Ganaraska River ----
    {
      id: 'port-hope',
      name: 'Port Hope / Ganaraska River',
      lat: 43.960, lon: -78.300,
      radius: 2000,
      species: ['Chinook', 'Coho', 'Steelhead', 'Brown Trout'],
      months: { 0: 0.4, 1: 0.4, 2: 0.6, 3: 0.8, 4: 0.8, 5: 0.6, 6: 0.5, 7: 0.7, 8: 1.0, 9: 1.0, 10: 0.8, 11: 0.5 },
      tip: 'The Ganaraska is one of Ontario’s premier salmon and steelhead rivers. Kings stack off the harbour mouth Aug–Sep. Phenomenal river fishing Oct–Nov for Chinook & Coho. Steelhead Nov through April.',
      depth: '10–45 m offshore, river for runs'
    },
    // ---- Cobourg / Presquile ----
    {
      id: 'cobourg-presquile',
      name: 'Cobourg / Presquile',
      lat: 43.970, lon: -77.840,
      radius: 2500,
      species: ['Chinook', 'Coho', 'Brown Trout', 'Walleye'],
      months: { 0: 0.2, 1: 0.2, 2: 0.3, 3: 0.6, 4: 0.7, 5: 0.7, 6: 0.7, 7: 0.8, 8: 0.9, 9: 0.8, 10: 0.5, 11: 0.2 },
      tip: 'Presquile Bay and Point create structure that concentrates bait. Excellent brown trout spring fishery along the shoreline. Mid-summer kings staging on the thermal axis nearby.',
      depth: '12–60 m'
    }
  ];

  // Get spots active for a given month (0-indexed)
  function getActiveSpots(month) {
    return SPOTS.filter(s => (s.months[month] || 0) > 0)
      .map(s => ({
        ...s,
        intensity: s.months[month] || 0
      }))
      .sort((a, b) => b.intensity - a.intensity);
  }

  // Get the top N spots for a given month
  function getTopSpots(month, n = 5) {
    return getActiveSpots(month).slice(0, n);
  }

  // Get nearby hot spots for a given lat/lon (within radiusKm)
  function getNearby(lat, lon, month, radiusKm = 25) {
    const R = 6371; // Earth radius in km
    return getActiveSpots(month)
      .map(s => {
        const dLat = (s.lat - lat) * Math.PI / 180;
        const dLon = (s.lon - lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat * Math.PI / 180) * Math.cos(s.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return { ...s, dist };
      })
      .filter(s => s.dist <= radiusKm)
      .sort((a, b) => a.dist - b.dist);
  }

  // Get all spots (for heat map rendering)
  function getAllSpots() {
    return SPOTS;
  }

  // Get species active at this location/month
  function getSpeciesAtSpot(lat, lon, month) {
    const nearby = getNearby(lat, lon, month, 8); // 8 km
    if (nearby.length === 0) return null;
    const speciesSet = new Set();
    nearby.forEach(s => s.species.forEach(sp => speciesSet.add(sp)));
    return {
      species: Array.from(speciesSet),
      bestSpot: nearby[0],
      allNearby: nearby
    };
  }

  return { getActiveSpots, getTopSpots, getNearby, getAllSpots, getSpeciesAtSpot };
})();
