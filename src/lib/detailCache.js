// Detail cache — the live facts (public rating, votes, release date, runtime)
// that the stored title rows drop. Populated by getDetails() in api.js when the
// Overview sheet opens a title, and read by the watchlist scorer so match scores
// pick up real quality without re-fetching. localStorage, ~30-day TTL, capped so
// it can't grow unbounded.

const KEY = 'pt_detail_cache_v1';
const TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const CAP = 300;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function save(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // quota / private mode — the cache is an optimisation, never load-bearing
  }
}

// Manual rows (no external_id) are never cacheable — nothing to key on.
export function cacheKey(item) {
  if (!item || !item.external_source || !item.external_id) return null;
  return `${item.external_source}:${item.external_id}`;
}

export function getCachedDetail(item) {
  const k = cacheKey(item);
  if (!k) return null;
  const entry = load()[k];
  if (!entry) return null;
  if (Date.now() - (entry.fetched_at || 0) > TTL) return null;
  return entry;
}

export function putCachedDetail(item, detail) {
  const k = cacheKey(item);
  if (!k) return;
  const map = load();
  map[k] = { ...detail, fetched_at: Date.now() };
  const keys = Object.keys(map);
  if (keys.length > CAP) {
    keys.sort((a, b) => (map[a].fetched_at || 0) - (map[b].fetched_at || 0));
    for (const old of keys.slice(0, keys.length - CAP)) delete map[old];
  }
  save(map);
}

// {`source:id` -> quality 0..1} for the whole (non-expired) cache — used by the
// Phase-2 watchlist scorer to fold real vote averages into match scores.
export function qualityMap() {
  const map = load();
  const now = Date.now();
  const out = {};
  for (const [k, e] of Object.entries(map)) {
    if (now - (e.fetched_at || 0) <= TTL && typeof e.quality === 'number') {
      out[k] = e.quality;
    }
  }
  return out;
}
