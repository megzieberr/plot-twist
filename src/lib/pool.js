// Shared candidate-pool helpers, extracted verbatim from Discover.jsx so the
// new surfaces (Tonight, More like this) filter and diversify EXACTLY like the
// Discover deck. Discover imports the primitives below; its output is unchanged.

import { isExcluded } from './scorer.js';

// Everything already rated (any verdict, incl. avoid) is excluded by source:id.
export function ratedKeySet(ratedTitles) {
  return new Set(ratedTitles.map((t) => `${t.external_source}:${t.external_id}`));
}

// ...and by title name within the current media, so the same show arriving from
// a different source (AniList vs Kitsu) is still recognised as already-rated.
export function ratedNameSet(ratedTitles, media) {
  return new Set(
    ratedTitles.filter((t) => t.media_type === media).map((t) => t.title.toLowerCase())
  );
}

// Seasons/sequels of an already-rated show are not new discoveries:
// "Attack on Titan Season 3 Part 2" should not resurface when "Attack on Titan"
// is already rated. A bare prefix is not enough ("From" must not swallow
// "Frozen"), so require a sequel-ish separator.
export function isSequelOf(candidateTitle, ratedName) {
  const c = candidateTitle.toLowerCase();
  if (!c.startsWith(ratedName)) return false;
  const rest = c.slice(ratedName.length);
  return /^[\s:–-]+(season|part|movie|final|the movie|\d|ii|iii|iv)/i.test(rest) || /^:\s/.test(rest);
}

// Combined eligibility for the NEW surfaces (Tonight, More like this): drop
// anything already rated (by key or by name), any sequel of a rated title, and
// any hard-excluded title (addiction-central).
//
// NOTE: Discover deliberately does NOT call this. It applies isExcluded AFTER
// its keyword-enrichment step, because keywords can push a title over the
// addiction threshold; folding isExcluded in here (pre-enrichment) would change
// which titles get enriched and therefore change Discover's output. Discover
// keeps its own two-step filter and only borrows the primitives above.
export function filterEligible(pool, ratedTitles, media) {
  const keys = ratedKeySet(ratedTitles);
  const names = ratedNameSet(ratedTitles, media);
  const nameList = [...names];
  return pool.filter(
    (c) =>
      !keys.has(`${c.external_source}:${c.external_id}`) &&
      !names.has((c.title || '').toLowerCase()) &&
      !nameList.some((n) => isSequelOf(c.title || '', n)) &&
      !isExcluded(c)
  );
}

// Greedy genre-diversity pick. A flat top-N by value echo-chambers: the top
// axes correlate heavily with thriller/mystery, so the deck went wall-to-wall
// thriller. Each already-picked card sharing a (primary) genre applies a growing
// penalty when choosing the next card — strong matches still lead, but the list
// mixes in the rest of her taste. `valueOf` defaults to `.score` so Discover's
// call is unchanged; Tonight passes its own blended value.
export function diversifyByGenre(sorted, n, penalty = 0.04, valueOf = (x) => x.score) {
  const picked = [];
  const genreCount = {};
  const pool = [...sorted];
  while (picked.length < n && pool.length > 0) {
    let bestI = 0;
    let bestV = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      let v = valueOf(pool[i]);
      for (const g of (pool[i].genres || []).slice(0, 2)) v -= penalty * (genreCount[g] || 0);
      if (v > bestV) {
        bestV = v;
        bestI = i;
      }
    }
    const c = pool.splice(bestI, 1)[0];
    for (const g of (c.genres || []).slice(0, 2)) genreCount[g] = (genreCount[g] || 0) + 1;
    picked.push(c);
  }
  return picked;
}
