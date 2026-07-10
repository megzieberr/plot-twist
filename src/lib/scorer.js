// Content-based scorer.
//
// Structure: score(features, weights) is a pure dot-product-plus-bias so the
// hand-set weights below can later be replaced by logistic-regression weights
// fit on accumulating ratings (gradient descent on the same feature vector).
//
// Calibration lessons baked into the hand-set starting point:
//  - Gone Girl (meh): unreliable_narrator + recontextualising_twist alone are
//    necessary-not-sufficient -> axis score saturates (tanh) and is blended
//    with a quality prior, so two axes alone cannot top the deck.
//  - Cyberpunk: Edgerunners (meh): genre match is weak evidence -> raw genre
//    overlap gets a tiny weight.
//  - Attack on Titan (meh): pacing matters -> slow_pacing flag subtracts.
//  - Demon Slayer (disliked): craft is not a positive axis by itself ->
//    prestige_high_craft weight is multiplied down.

import { AXIS_KEYS, AXES } from './axes.js';

export const VERDICT_VALUE = {
  liked: 1.0,
  interested: 0.4, // swiped right in Discover (not watched yet)
  watchlist: 0.15, // wants to watch: mild positive taste signal
  meh: -0.35, // weak negative, per the brief
  skipped: -0.4, // swiped left in Discover
  disliked: -1.0,
  avoid: 0, // personal-reasons filter, NOT a taste signal
};

// Content axes carry more weight than craft/genre (calibration notes, section 5).
const AXIS_MULTIPLIER = {
  unexplained_no_resolution: 1.0,
  unreliable_narrator: 1.0,
  recontextualising_twist: 1.0,
  deep_villain: 1.0,
  mystery_no_spoonfeed: 1.0,
  survival_dystopia: 0.9,
  transformation_arc: 0.9,
  comfort_nostalgia: 0.6,
  natural_humour: 0.6,
  prestige_high_craft: 0.45, // craft alone does not win (Demon Slayer lesson)
};

const FLAG_PENALTY = {
  slow_pacing: -0.8,
  forced_humour: -0.8,
  bad_animation: -0.6,
};

// ---------------------------------------------------------------------------
// Weight fitting from ratings (v1: normalized evidence counts; later: logreg)
// ---------------------------------------------------------------------------

// ratedTitles: [{ axes: [..], verdict }]
export function computeWeights(ratedTitles) {
  const weights = {};
  for (const axis of AXIS_KEYS) {
    let evidence = 0;
    let n = 0;
    for (const t of ratedTitles) {
      if (!t.axes || !t.axes.includes(axis)) continue;
      const v = VERDICT_VALUE[t.verdict] ?? 0;
      if (t.verdict === 'avoid') continue; // not a taste signal
      evidence += v;
      n += 1;
    }
    // Laplace-style smoothing so a single liked title doesn't create a huge weight
    const raw = n > 0 ? evidence / (n + 2) : 0;
    weights[axis] = round3(raw * (AXIS_MULTIPLIER[axis] ?? 1));
  }
  return weights;
}

// ---------------------------------------------------------------------------
// Scoring a candidate
// ---------------------------------------------------------------------------

// candidate: { axes: {axis: confidence}, flags: {flag: confidence},
//              genres: [..], quality: 0..1 (normalized vote average),
//              popularity: 0..1 }
// weights: {axis: weight}
// likedGenres: Set of genre strings from the liked set (weak evidence)
export function scoreCandidate(candidate, weights, likedGenres = new Set()) {
  const contributions = [];
  let axisScore = 0;
  for (const [axis, conf] of Object.entries(candidate.axes || {})) {
    const w = weights[axis] ?? 0;
    const c = w * conf;
    if (c !== 0) contributions.push({ axis, value: c });
    axisScore += c;
  }
  // Saturate: matching two big axes is good, but cannot alone max the score
  // (Gone Girl lesson: necessary but not sufficient).
  const saturated = Math.tanh(axisScore * 1.6);

  // Weak genre-overlap evidence (Edgerunners lesson: keep this small).
  let genreScore = 0;
  for (const g of candidate.genres || []) {
    if (likedGenres.has(g.toLowerCase())) genreScore += 0.03;
  }
  genreScore = Math.min(genreScore, 0.12);

  // Quality prior: small, keeps well-made titles ahead on axis ties,
  // but craft alone cannot carry a candidate (Demon Slayer lesson).
  const quality = (candidate.quality ?? 0.5) * 0.18;

  // Negative flags.
  let flagScore = 0;
  const flagNotes = [];
  for (const [flag, conf] of Object.entries(candidate.flags || {})) {
    const p = FLAG_PENALTY[flag];
    if (p) {
      flagScore += p * conf;
      flagNotes.push(flag);
    }
  }

  const total = saturated * 0.72 + genreScore + quality + flagScore;
  return {
    score: round3(total),
    contributions: contributions.sort((a, b) => b.value - a.value),
    flagNotes,
  };
}

// Score a *stored* title row with the same machinery Discover uses on live
// candidates. Stored rows differ in two ways: axes/flags are arrays (the
// per-axis confidences were dropped at save time) and there is no quality
// (vote average) column. So: arrays -> flat {key: 0.7}, and quality is looked
// up from the detail cache (qualityMap: {`source:id` -> 0..1}) when a title has
// been opened, else scoreCandidate's neutral 0.5 default applies. Returns the
// same {score, contributions, flagNotes} shape, so whyLine() works unchanged.
export function scoreStoredTitle(t, weights, likedGenres = new Set(), qualityMap = {}) {
  const arr = (v) => (Array.isArray(v) ? v : Object.keys(v || {}));
  const toObj = (list) => Object.fromEntries(list.map((k) => [k, 0.7]));
  const key = t.external_source && t.external_id ? `${t.external_source}:${t.external_id}` : null;
  const quality = key != null && typeof qualityMap[key] === 'number' ? qualityMap[key] : undefined;
  return scoreCandidate(
    { axes: toObj(arr(t.axes)), flags: toObj(arr(t.flags)), genres: t.genres || [], quality },
    weights,
    likedGenres
  );
}

// The point of the app: name the axes a recommendation scored on.
export function whyLine(result, candidate) {
  const top = result.contributions.filter((c) => c.value > 0.02).slice(0, 3);
  if (top.length === 0) {
    return 'Broad match on genre and ratings — no strong axis signal.';
  }
  const names = top.map((c) => AXES[c.axis].label);
  let line;
  if (names.length === 1) line = `Matched: ${names[0]}`;
  else line = `Matched: ${names.slice(0, -1).join(', ')} + ${names[names.length - 1]}`;
  if (result.flagNotes.length > 0) {
    line += ` (pushed down: ${result.flagNotes.map((f) => f.replace(/_/g, ' ')).join(', ')})`;
  }
  return line;
}

// Hard content filter (section 6): addiction-central titles never reach Discover.
export function isExcluded(candidate) {
  return (candidate.flags || {}).addiction_central > 0.5;
}

export function likedGenreSet(ratedTitles) {
  const set = new Set();
  for (const t of ratedTitles) {
    if (t.verdict === 'liked' && t.genres) {
      for (const g of t.genres) set.add(String(g).toLowerCase());
    }
  }
  return set;
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}
