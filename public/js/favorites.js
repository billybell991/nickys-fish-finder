/* ================================================
   Fishing Favorites — localStorage-backed spot saves
   Shared by map.js (heart buttons) and app.js (tab)
   ================================================ */

const FishFavorites = (() => {
  'use strict';

  const STORAGE_KEY = 'fishing_favorites';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function save(favs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  }

  // ~10m tolerance for position equality
  function sameSpot(a, b) {
    return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001;
  }

  function isFavorite(lat, lng) {
    return load().some(f => sameSpot(f, { lat, lng }));
  }

  // Returns true if added, false if removed
  function toggleFavorite(lat, lng, data = {}) {
    const favs = load();
    const idx = favs.findIndex(f => sameSpot(f, { lat, lng }));
    if (idx >= 0) {
      favs.splice(idx, 1);
      save(favs);
      return false;
    }
    favs.push({ lat, lng, savedAt: Date.now(), ...data });
    save(favs);
    return true;
  }

  function getAll() {
    return load();
  }

  function remove(lat, lng) {
    save(load().filter(f => !sameSpot(f, { lat, lng })));
  }

  return { isFavorite, toggleFavorite, getAll, remove };
})();
