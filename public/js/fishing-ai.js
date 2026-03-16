/* ================================================
   Fishing AI — Rule-Based Expert System
   Lake Ontario Salmon (Chinook, Coho, Steelhead)
   ================================================
   
   All rules distilled from Lake Ontario fishing knowledge:
   - Optimal Chinook salmon temp: 48-55°F (9-13°C)
   - Coho prefer slightly cooler: 45-55°F
   - Steelhead/Rainbow: 50-60°F
   - Thermal breaks concentrate baitfish → salmon follow
   - Barometric pressure trends affect feeding activity
   - Wind direction affects current & baitfish distribution
   - Dawn/dusk are prime feeding windows
   ================================================ */

const FishingAI = (() => {

  // Analyze all available data and produce recommendations
  function analyze(data) {
    const { buoys, weather, solunar } = data;
    const analysisDate = solunar?.sunTimes?.sunrise || new Date();

    const factors = [];
    let overallScore = 50; // 0-100 baseline

    // ---- WATER TEMPERATURE ----
    const waterTemps = getWaterTemps(buoys);
    if (waterTemps.length > 0) {
      const avgTemp = waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length;
      const tempAnalysis = analyzeWaterTemp(avgTemp);
      factors.push(tempAnalysis);
      overallScore += tempAnalysis.scoreImpact;
    }

    // ---- BAROMETRIC PRESSURE ----
    const pressure = getPressure(buoys, weather);
    if (pressure) {
      const pressureAnalysis = analyzePressure(pressure);
      factors.push(pressureAnalysis);
      overallScore += pressureAnalysis.scoreImpact;
    }

    // ---- WIND ----
    const wind = getWind(buoys, weather);
    if (wind) {
      const windAnalysis = analyzeWind(wind);
      factors.push(windAnalysis);
      overallScore += windAnalysis.scoreImpact;
    }

    // ---- TIME OF DAY ----
    const timeAnalysis = analyzeTimeOfDay(solunar);
    factors.push(timeAnalysis);
    overallScore += timeAnalysis.scoreImpact;

    // ---- MOON / SOLUNAR ----
    if (solunar) {
      const moonAnalysis = analyzeMoon(solunar);
      factors.push(moonAnalysis);
      overallScore += moonAnalysis.scoreImpact;
    }

    // ---- SEASON ----
    const seasonAnalysis = analyzeSeason(analysisDate);
    factors.push(seasonAnalysis);
    overallScore += seasonAnalysis.scoreImpact;

    // Clamp score
    overallScore = Math.max(5, Math.min(100, overallScore));

    // Generate recommendations
    const recommendations = generateRecommendations(waterTemps, pressure, wind, solunar, seasonAnalysis);
    const spotAdvice = generateSpotAdvice(waterTemps, wind, buoys, analysisDate);

    return {
      score: Math.round(overallScore),
      rating: getRating(overallScore),
      ratingClass: getRatingClass(overallScore),
      summary: generateSummary(overallScore, factors),
      factors,
      recommendations,
      spotAdvice
    };
  }

  // ---- Data Extractors ----

  function getWaterTemps(buoys) {
    if (!buoys) return [];
    return Object.values(buoys)
      .map(b => b.waterTemp?.f)
      .filter(t => t != null && !isNaN(t));
  }

  function getPressure(buoys, weather) {
    // Prefer buoy pressure, fall back to weather
    if (buoys) {
      const pressures = Object.values(buoys).map(b => b.pressure).filter(p => p != null && !isNaN(p));
      if (pressures.length > 0) return pressures[0];
    }
    if (weather?.pressureHpa) return parseFloat(weather.pressureHpa);
    return null;
  }

  function getWind(buoys, weather) {
    // Prefer buoy wind (on-water), fall back to weather
    if (buoys) {
      for (const b of Object.values(buoys)) {
        if (b.wind?.speed?.mph != null) {
          return {
            speed: b.wind.speed.mph,
            gust: b.wind.gust?.mph,
            direction: b.wind.direction
          };
        }
      }
    }
    if (weather?.windSpeedMph) {
      return {
        speed: parseFloat(weather.windSpeedMph),
        gust: weather.gustMph ? parseFloat(weather.gustMph) : null,
        direction: weather.windDirection
      };
    }
    return null;
  }

  // ---- Analysis Functions ----

  function analyzeWaterTemp(avgTempF) {
    let scoreImpact = 0;
    let icon, title, detail;

    if (avgTempF >= 48 && avgTempF <= 55) {
      scoreImpact = 20;
      icon = '🔥';
      title = 'Optimal Salmon Temp';
      detail = `Water at ${avgTempF.toFixed(1)}°F — right in the Chinook sweet spot (48-55°F). Fish should be active and feeding aggressively.`;
    } else if (avgTempF >= 45 && avgTempF < 48) {
      scoreImpact = 10;
      icon = '👍';
      title = 'Good Water Temp';
      detail = `Water at ${avgTempF.toFixed(1)}°F — cool side but Coho love this range. Chinook may be slightly deeper. Slow your presentation.`;
    } else if (avgTempF > 55 && avgTempF <= 60) {
      scoreImpact = 5;
      icon = '👍';
      title = 'Decent Water Temp';
      detail = `Water at ${avgTempF.toFixed(1)}°F — above optimal salmon range. Fish will be seeking cooler water at depth. Steelhead still active.`;
    } else if (avgTempF > 60 && avgTempF <= 68) {
      scoreImpact = -10;
      icon = '⚠️';
      title = 'Warm Surface Water';
      detail = `Water at ${avgTempF.toFixed(1)}°F — too warm for surface salmon. Look for the thermocline — fish will be stacked at depth where temp drops to 48-55°F range.`;
    } else if (avgTempF < 40) {
      scoreImpact = -10;
      icon = '🥶';
      title = 'Very Cold Water';
      detail = `Water at ${avgTempF.toFixed(1)}°F — extremely cold. Metabolism is slow. Fish deeper, use natural presentations, very slow trolling speeds.`;
    } else if (avgTempF >= 40 && avgTempF < 45) {
      scoreImpact = 0;
      icon = '❄️';
      title = 'Cold Water';
      detail = `Water at ${avgTempF.toFixed(1)}°F — cold but fishable. Salmon will be sluggish. Slower trolling speeds, smaller profiles, stick to structure.`;
    } else {
      scoreImpact = -20;
      icon = '🌡️';
      title = 'Extreme Temperature';
      detail = `Water at ${avgTempF.toFixed(1)}°F — outside productive range. Fish deep structure or wait for conditions to change.`;
    }

    return { icon, title, detail, scoreImpact, factor: 'waterTemp', value: avgTempF };
  }

  function analyzePressure(pressureHpa) {
    let scoreImpact = 0;
    let icon, title, detail;

    if (pressureHpa > 1020) {
      scoreImpact = 10;
      icon = '📈';
      title = 'High Pressure — Stable';
      detail = `Barometer at ${pressureHpa} mb — high and stable. Fish tend to feed consistently in these conditions. Good day to be on the water.`;
    } else if (pressureHpa >= 1013) {
      scoreImpact = 5;
      icon = '📊';
      title = 'Normal Pressure';
      detail = `Barometer at ${pressureHpa} mb — steady conditions. Normal feeding patterns expected.`;
    } else if (pressureHpa >= 1005) {
      scoreImpact = -5;
      icon = '📉';
      title = 'Falling Pressure';
      detail = `Barometer at ${pressureHpa} mb — pressure dropping. Storm approach possible. Fish often feed heavily before a front passes — this could be a hot bite window!`;
    } else {
      scoreImpact = -10;
      icon = '🌀';
      title = 'Low Pressure — Storm';
      detail = `Barometer at ${pressureHpa} mb — very low. Post-frontal conditions can shut down the bite. If you're heading out, fish slow and deep.`;
    }

    return { icon, title, detail, scoreImpact, factor: 'pressure', value: pressureHpa };
  }

  function analyzeWind(wind) {
    let scoreImpact = 0;
    let icon, title, detail;
    const speed = wind.speed;
    const dir = wind.direction != null ? FishMap.degToCompass(wind.direction) : '';

    if (speed < 5) {
      scoreImpact = 5;
      icon = '🍃';
      title = 'Calm Winds';
      detail = `Wind ${dir} at ${speed} mph — slick conditions. Fish can be spooky in flat calm. Consider deeper lines and subtle presentations.`;
    } else if (speed <= 12) {
      scoreImpact = 10;
      icon = '💨';
      title = 'Light-Moderate Wind';
      detail = `Wind ${dir} at ${speed} mph — ideal conditions. Enough chop to mask topside noise, pushes baitfish and creates productive current seams.`;
    } else if (speed <= 20) {
      scoreImpact = 0;
      icon = '🌬️';
      title = 'Moderate Wind';
      detail = `Wind ${dir} at ${speed} mph — fishable but rough. Waves will concentrate baitfish on the lee side. Fish the downwind shore.`;
    } else {
      scoreImpact = -15;
      icon = '⛈️';
      title = 'Strong Wind — Dangerous';
      detail = `Wind ${dir} at ${speed} mph — heavy seas likely. Safety first! If going out, stay close to port and fish protected areas.`;
    }

    // Directional advice for Lake Ontario
    if (wind.direction != null) {
      const dirDeg = wind.direction;
      // North wind pushes warm surface water south (toward shore) → potential upwelling offshore
      if (dirDeg >= 315 || dirDeg < 45) {
        detail += ' North wind can push warm surface water toward the south shore.';
      } else if (dirDeg >= 135 && dirDeg < 225) {
        detail += ' South wind can cause offshore upwelling, pulling cool water toward the surface — check for temp breaks.';
      }
    }

    return { icon, title, detail, scoreImpact, factor: 'wind', value: speed };
  }

  function analyzeTimeOfDay(solunar) {
    const now = new Date();
    const hour = now.getHours();
    let scoreImpact = 0;
    let icon, title, detail;

    if (hour >= 5 && hour < 8) {
      scoreImpact = 15;
      icon = '🌅';
      title = 'Prime Time — Dawn';
      detail = 'Dawn is one of the best windows for salmon. Low light triggers aggressive feeding. Hit the water now!';
    } else if (hour >= 8 && hour < 11) {
      scoreImpact = 8;
      icon = '☀️';
      title = 'Morning — Still Good';
      detail = 'Morning bite can remain strong, especially if overcast. Fish may start going deeper as sun gets higher.';
    } else if (hour >= 11 && hour < 15) {
      scoreImpact = -5;
      icon = '☀️';
      title = 'Midday — Slow Period';
      detail = 'Bright overhead sun pushes fish deep. Fish deeper lines and thermocline edges. Not the most productive window.';
    } else if (hour >= 15 && hour < 17) {
      scoreImpact = 5;
      icon = '🌤️';
      title = 'Afternoon — Building';
      detail = 'Conditions improving as sun angle drops. Fish may start moving shallower. Good time to set up for the evening bite.';
    } else if (hour >= 17 && hour < 20) {
      scoreImpact = 12;
      icon = '🌇';
      title = 'Prime Time — Dusk';
      detail = 'Evening is the other prime feeding window. Salmon become aggressive in fading light. Run your best lures now!';
    } else {
      scoreImpact = 0;
      icon = '🌙';
      title = 'Night';
      detail = 'Night fishing can produce, especially around the full moon. Use glow or UV lures. Watch for surface activity.';
    }

    return { icon, title, detail, scoreImpact, factor: 'time' };
  }

  function analyzeMoon(solunar) {
    let scoreImpact = 0;
    let icon = solunar.phaseEmoji;
    let title = `Moon: ${solunar.phaseName}`;
    let detail;

    if (solunar.fishingQuality === 'Major') {
      scoreImpact = 8;
      detail = `${solunar.phaseName} — major solunar period. Historically correlated with more active fish and better bites. Plan your trip around dawn/dusk today.`;
    } else if (solunar.fishingQuality === 'Minor') {
      scoreImpact = 3;
      detail = `${solunar.phaseName} — minor solunar period. Moderate lunar influence on feeding. Normal conditions expected.`;
    } else {
      scoreImpact = 0;
      detail = `${solunar.phaseName} — neutral solunar phase. Moon has minimal impact today. Other factors matter more.`;
    }

    return { icon, title, detail, scoreImpact, factor: 'moon' };
  }

  function analyzeSeason(date) {
    const month = (date || new Date()).getMonth(); // 0-indexed
    let scoreImpact = 0;
    let icon, title, detail;

    if (month >= 3 && month <= 5) { // April-June
      scoreImpact = 10;
      icon = '🌱';
      title = 'Spring — Brown Trout & Early Salmon';
      detail = 'Spring fishing ON. Browns cruising the south shore. Chinook and Coho starting to push offshore as water warms. Stickbaits and spoons near shore.';
    } else if (month >= 6 && month <= 7) { // July-August
      scoreImpact = 15;
      icon = '☀️';
      title = 'Peak Summer — Open Water Salmon';
      detail = 'Prime salmon season! Fish the thermocline — often 50-100ft down. Downriggers and copper/leadcore essential. Flasher-fly combos and spoons produce.';
    } else if (month === 8) { // September
      scoreImpact = 15;
      icon = '🍂';
      title = 'Fall Transition — Kings Staging';
      detail = 'Chinook staging near river mouths! Look for concentrations off the Salmon River, Oswego, and Niagara bar. Fish are getting aggressive pre-spawn.';
    } else if (month >= 9 && month <= 10) { // October-November
      scoreImpact = 10;
      icon = '🍁';
      title = 'Fall Run — River Salmon + Steelhead';
      detail = 'Kings running the rivers. Tributaries light up. Steelhead following. Brown trout nearshore bite heats up. Shore fishing can be phenomenal.';
    } else if (month >= 11 || month <= 1) { // December-February
      scoreImpact = -10;
      icon = '❄️';
      title = 'Winter — Steelhead & Browns';
      detail = 'Cold water season. Steelhead in tributaries, browns nearshore. Slow presentations, small profiles. Check ice conditions before launching.';
    } else { // March
      scoreImpact = 5;
      icon = '🌤️';
      title = 'Early Spring — Warming Up';
      detail = 'Lake starting to turn over. Browns active nearshore. Watch for early warming near creek mouths — baitfish stack there.';
    }

    return { icon, title, detail, scoreImpact, factor: 'season' };
  }

  // ---- Recommendation Generator ----

  function generateRecommendations(waterTemps, pressure, wind, solunar, seasonAnalysis) {
    const recs = [];
    const month = new Date().getMonth();
    const avgTemp = waterTemps.length > 0
      ? waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length
      : null;

    // Lure recommendation based on season + conditions
    const lureRec = getLureRec(month, avgTemp, wind);
    recs.push(lureRec);

    // Depth recommendation
    const depthRec = getDepthRec(avgTemp, month);
    recs.push(depthRec);

    // Speed/technique recommendation
    const techniqueRec = getTechniqueRec(avgTemp, pressure, wind);
    recs.push(techniqueRec);

    // Best time window
    const timeRec = getTimeRec(solunar);
    recs.push(timeRec);

    return recs;
  }

  function getLureRec(month, avgTemp, wind) {
    let title = '🎣 Lure Selection';
    let detail = '';

    if (month >= 6 && month <= 8) {
      // Summer — open water
      detail = 'Flasher/fly combos (green/white, blue/silver), flutter spoons (silver/blue), and J-plugs. ';
      if (avgTemp != null && avgTemp > 55) {
        detail += 'Warm surface — run deeper with downriggers. Meat rigs and cut bait produce at depth.';
      } else {
        detail += 'Run a spread at multiple depths to find the active zone.';
      }
    } else if (month >= 3 && month <= 5) {
      // Spring
      detail = 'Stickbaits (Rapalas, Rogues) for browns nearshore. Spoons (silver/gold) for early salmon. ';
      detail += 'Body baits trolled at 2-3 mph along the 15-30ft contour.';
    } else if (month >= 9 && month <= 10) {
      // Fall
      detail = 'Orange/chartreuse spoons and plugs for staging kings. Skein and egg sacs in tributaries. ';
      detail += 'Flasher/fly still producing offshore. Switch to spinners near river mouths.';
    } else {
      // Winter/early spring
      detail = 'Small stickbaits, jerkbaits, and spoons in natural colors (silver, blue, olive). ';
      detail += 'Egg patterns and nymphs for steelhead in tributaries. Slow and subtle.';
    }

    return { title, detail };
  }

  function getDepthRec(avgTemp, month) {
    let title = '📐 Depth Strategy';
    let detail = '';

    if (avgTemp == null) {
      detail = 'No water temp data available. General rule: early season (spring) fish 15-40ft. Summer fish 40-100ft on the thermocline. Fall — follow the bait.';
    } else if (avgTemp >= 48 && avgTemp <= 55) {
      detail = `Surface temp is optimal (${avgTemp.toFixed(1)}°F) — salmon could be anywhere from 20-80ft. Start mid-column and adjust. Set a spread at staggered depths.`;
    } else if (avgTemp > 60) {
      detail = `Surface too warm (${avgTemp.toFixed(1)}°F). Salmon will be below the thermocline — typically 60-120ft. Use downriggers or copper line to get deep. Look for the temp break on your sonar.`;
    } else if (avgTemp < 45) {
      detail = `Water cold (${avgTemp.toFixed(1)}°F) — fish will be sluggish but may suspend shallow. Try 20-50ft range. Browns often cruise the 15-25ft contour in cold water.`;
    } else {
      detail = `Water at ${avgTemp.toFixed(1)}°F — transitional. Fish 30-70ft range, targeting structure and current seams. Adjust based on marks on sonar.`;
    }

    return { title, detail };
  }

  function getTechniqueRec(avgTemp, pressure, wind) {
    let title = '⚡ Technique & Speed';
    let detail = '';

    const trollSpeed = avgTemp != null && avgTemp < 48 ? '1.5-2.2 mph' :
                       avgTemp != null && avgTemp > 58 ? '2.5-3.5 mph' :
                       '2.0-2.8 mph';

    detail = `Trolling speed: ${trollSpeed}. `;

    if (avgTemp != null && avgTemp < 45) {
      detail += 'Cold water — slow everything down. Longer leads, subtle action. Let the lure sit in the zone.';
    } else if (pressure != null && pressure < 1005) {
      detail += 'Low pressure front — erratic presentations can trigger reactionary strikes. Try speed bursts and direction changes.';
    } else if (pressure != null && pressure >= 1005 && pressure < 1013) {
      detail += 'Dropping pressure — fish may feed aggressively before the front. Work your best spots hard while the window is open.';
    } else if (wind && wind.speed > 12) {
      detail += 'Rough water — S-curves while trolling create speed changes that trigger bites. Work with the waves, not against them.';
    } else {
      detail += 'Steady conditions — cover water. Long troll runs along thermal breaks and depth contours. Mix your spread: shallow, mid, and deep.';
    }

    return { title, detail };
  }

  function getTimeRec(solunar) {
    let title = '⏰ Best Time Windows';
    let detail = '';

    if (solunar?.sunTimes) {
      const sunrise = formatTime(solunar.sunTimes.sunrise);
      const sunset = formatTime(solunar.sunTimes.sunset);
      detail = `Dawn window: ${sunrise} ± 1 hour. Dusk window: ${sunset} ± 1 hour. `;
    } else {
      detail = 'Dawn (roughly 6-8 AM) and dusk (roughly 6-8 PM) are prime windows. ';
    }

    if (solunar?.fishingQuality === 'Major') {
      detail += 'Strong solunar influence today — expect extended feeding periods beyond the normal windows.';
    } else {
      detail += 'Focus your best effort around these low-light periods for the highest probability of action.';
    }

    return { title, detail };
  }

  // ---- Spot Advice ----

  function generateSpotAdvice(waterTemps, wind, buoys, analysisDate) {
    const parts = [];

    if (waterTemps.length > 0) {
      const avgTemp = waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length;

      if (avgTemp >= 48 && avgTemp <= 55) {
        parts.push('Surface temps are in the salmon zone — look for thermal breaks on the SST overlay where color transitions sharply. Fish concentrate on the warm side of these breaks.');
      } else if (avgTemp > 58) {
        parts.push('Surface is warm — look for the SST overlay to show cooler patches (blue/green tones). These cooler upwellings or thermocline edges are where salmon will stack.');
      } else if (avgTemp < 45) {
        parts.push('Cold water everywhere — look for any warm patches on SST (creek mouths, power plant outflows). Even 2-3° warmer than surroundings will concentrate baitfish and predators.');
      }
    }

    if (wind && wind.direction != null) {
      const dir = FishMap.degToCompass(wind.direction);
      if (wind.speed > 8) {
        parts.push(`Wind from the ${dir} at ${wind.speed} mph — baitfish will be pushed toward the downwind shore. Focus on that shoreline and adjacent structure.`);
      }
    }

    // Check for temp differentials between buoys
    if (buoys) {
      const temps = Object.entries(buoys)
        .filter(([, b]) => b.waterTemp?.f != null)
        .map(([id, b]) => ({ id, name: b.name, temp: b.waterTemp.f }));

      if (temps.length >= 2) {
        temps.sort((a, b) => b.temp - a.temp);
        const warmest = temps[0];
        const coldest = temps[temps.length - 1];
        const diff = warmest.temp - coldest.temp;

        if (diff > 3) {
          parts.push(`Temperature spread of ${diff.toFixed(1)}°F across the lake! Warmest near ${warmest.name} (${warmest.temp}°F), coldest near ${coldest.name} (${coldest.temp}°F). The transition zone between these areas likely holds fish.`);
        }
      }
    }

    parts.push('Toggle the SST layer on the map to see thermal imagery. Areas where colors change rapidly indicate thermal breaks — these are your high-probability zones.');

    // Seasonal hot spots
    if (typeof HotSpots !== 'undefined') {
      const month = (analysisDate || new Date()).getMonth();
      const topSpots = HotSpots.getTopSpots(month, 3);
      if (topSpots.length > 0) {
        const spotList = topSpots.map(s =>
          `${s.name} (${Math.round(s.intensity * 100)}% — ${s.species.slice(0, 2).join(', ')})`
        ).join('; ');
        parts.push(`🔥 Top hot spots this month: ${spotList}. Toggle the Hot Spots layer on the map to see all seasonal zones.`);
      }
    }

    return parts.join('\n\n');
  }

  // ---- Helpers ----

  function getRating(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  }

  function getRatingClass(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  function generateSummary(score, factors) {
    const positives = factors.filter(f => f.scoreImpact > 5);
    const negatives = factors.filter(f => f.scoreImpact < -5);

    let summary = '';
    if (score >= 75) {
      summary = 'Conditions look excellent for Lake Ontario salmon today! ';
    } else if (score >= 55) {
      summary = 'Decent conditions out there. ';
    } else if (score >= 35) {
      summary = 'Conditions are marginal today. ';
    } else {
      summary = 'Tough conditions. Consider waiting for better weather. ';
    }

    if (positives.length > 0) {
      summary += 'Working in your favor: ' + positives.map(f => f.title.toLowerCase()).join(', ') + '. ';
    }
    if (negatives.length > 0) {
      summary += 'Working against you: ' + negatives.map(f => f.title.toLowerCase()).join(', ') + '.';
    }

    return summary;
  }

  function formatTime(date) {
    if (!date) return '--:--';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  return { analyze };
})();
