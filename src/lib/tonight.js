// Tonight — pure pick logic, no React. Everything here is unit-testable with
// plain objects (see the ad-hoc node checks in the verification pass).

import { titleMoodPos } from './mood.js';

export const keyOf = (c) => `${c.external_source}:${c.external_id}`;

// Min-max normalise a list of numbers to 0..1. All-equal / empty -> all 1.
export function normalize(nums) {
  if (nums.length === 0) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return nums.map((n) => (max > min ? (n - min) / (max - min) : 1));
}

// Occasion ranking: public rating LEADS, taste is the tiebreak. This is the
// "Christmas movies despite my profile" requirement — a well-rated on-occasion
// pick is never vetoed by taste. Both signals normalised within the pool.
// Returns the list sorted best-first, each item carrying `.rank` (0..1).
export function occasionRank(list) {
  const nq = normalize(list.map((c) => (typeof c.quality === 'number' ? c.quality : 0.5)));
  const nt = normalize(list.map((c) => c.base ?? 0));
  return list
    .map((c, i) => ({ ...c, rank: 0.6 * nq[i] + 0.4 * nt[i] }))
    .sort((a, b) => b.rank - a.rank);
}

// Pick exactly five from an already-ranked (+ diversified) pool, skipping the
// keys already shown this session. Mix rule: when BOTH sub-pools have eligible
// candidates, the five must contain >=1 watchlist item AND >=2 fresh items;
// enforce by swapping the lowest-ranked pick of the over-represented origin for
// the best available of the missing one. If a sub-pool is empty/short, fill
// entirely from the other — never return fewer than 5 while eligible items
// remain. Each returned pick keeps its `origin` tag for the card badge.
export function pickFive(ranked, { shownKeys = new Set() } = {}) {
  const avail = ranked.filter((c) => !shownKeys.has(keyOf(c)));
  const picks = avail.slice(0, 5);
  const rest = avail.slice(5);
  const bothSources =
    avail.some((c) => c.origin === 'watchlist') && avail.some((c) => c.origin === 'fresh');

  if (bothSources && picks.length === 5) {
    const countOf = (origin) => picks.filter((p) => p.origin === origin).length;
    const ensure = (origin, min, dropFrom) => {
      while (countOf(origin) < min) {
        const inIdx = rest.findIndex((c) => c.origin === origin); // best available (rest is ranked)
        if (inIdx === -1) break;
        let outIdx = -1; // lowest-ranked pick of the over-represented origin
        for (let i = picks.length - 1; i >= 0; i--) {
          if (picks[i].origin === dropFrom) {
            outIdx = i;
            break;
          }
        }
        if (outIdx === -1) break;
        const swappedIn = rest.splice(inIdx, 1)[0];
        const swappedOut = picks.splice(outIdx, 1, swappedIn)[0];
        rest.push(swappedOut);
      }
    };
    ensure('watchlist', 1, 'fresh'); // at least one from the watchlist
    ensure('fresh', 2, 'watchlist'); // at least two brand-new finds
  }
  return picks.slice(0, 5);
}

// Negative-verdict guard: after she rates a Tonight card badly, its replacement
// must not feel like more of the same. Two titles are "too similar" if they
// share >=2 taste axes, OR share their primary genre AND sit close in mood
// space. Thresholds are starting points — tune by feel like the diversity
// penalty. Only applied to the single refill after a negative verdict; the
// skipped candidates stay in the pool for later picks (one bad Christmas movie
// must not ban all of Christmas — the lasting effect is the axis weights
// shifting from the rating).
const SHARED_AXES_MIN = 2; // TUNABLE
const MOOD_DIST_MAX = 0.35; // TUNABLE

export function tooSimilar(a, b) {
  const axesOf = (t) => (Array.isArray(t.axes) ? t.axes : Object.keys(t.axes || {}));
  const setA = new Set(axesOf(a));
  const shared = axesOf(b).filter((x) => setA.has(x)).length;
  if (shared >= SHARED_AXES_MIN) return true;

  const pa = (a.genres || [])[0];
  const pb = (b.genres || [])[0];
  if (pa && pb && String(pa).toLowerCase() === String(pb).toLowerCase()) {
    const ma = titleMoodPos(a);
    const mb = titleMoodPos(b);
    if (ma && mb && Math.hypot(ma[0] - mb[0], ma[1] - mb[1]) < MOOD_DIST_MAX) return true;
  }
  return false;
}
