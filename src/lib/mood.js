// Mood pad maths — pure, testable. A title's taste axes place it in a 2D
// "mood space"; the draggable dot is a point in the same space; affinity is
// how close they are. All coordinates live in [-1, 1] on each axis.
//
//   X: Cozy (-1)  ⟶  Dark / Intense (+1)
//   Y: Easy watch (-1)  ⟶  Mind-bending (+1)
//
// Starting values — tuned by feel, safe to nudge.
export const AXIS_COORDS = {
  comfort_nostalgia: [-0.9, -0.5],
  natural_humour: [-0.7, -0.6],
  transformation_arc: [-0.2, 0.1],
  prestige_high_craft: [0.0, 0.3],
  deep_villain: [0.6, 0.4],
  survival_dystopia: [0.8, 0.0],
  mystery_no_spoonfeed: [0.3, 0.8],
  unreliable_narrator: [0.4, 0.9],
  recontextualising_twist: [0.3, 0.95],
  unexplained_no_resolution: [0.5, 0.85],
};

// Genre tone anchors (TMDB names, TV variants, AniList/Kitsu). Taste axes are
// structural (twists, narrators) but say nothing about warmth — a Comedy/Family
// film whose only mapped axis was "mystery" used to land in the mind-bender
// corner and stay bottom of a cozy-corner list. Genres fix the tone.
export const GENRE_COORDS = {
  comedy: [-0.7, -0.5],
  family: [-0.8, -0.6],
  kids: [-0.9, -0.7],
  animation: [-0.5, -0.4],
  romance: [-0.6, -0.4],
  music: [-0.6, -0.5],
  'slice of life': [-0.8, -0.55],
  sports: [-0.4, -0.3],
  reality: [-0.5, -0.3],
  adventure: [-0.3, -0.3],
  action: [0.1, -0.2],
  'action & adventure': [0, -0.25],
  fantasy: [-0.2, 0],
  'sci-fi & fantasy': [0.2, 0.35],
  'science fiction': [0.3, 0.5],
  'sci-fi': [0.3, 0.5],
  drama: [0.1, 0.05],
  history: [0.1, 0.1],
  documentary: [0, 0.15],
  western: [0.3, 0],
  war: [0.6, 0.15],
  'war & politics': [0.5, 0.2],
  crime: [0.5, 0.2],
  mystery: [0.35, 0.6],
  thriller: [0.6, 0.35],
  horror: [0.75, 0.35],
  psychological: [0.45, 0.75],
  supernatural: [0.35, 0.45],
};

// Corner-to-corner distance of the [-1,1]^2 square — the max possible gap.
const MAX_DIST = 2 * Math.SQRT2;

function mean(pts) {
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
}

// A title's position = its taste-axis centre blended with its genre-tone
// centre (axes lead, genres anchor the warmth). Titles with neither return
// null — the caller treats that as neutral (never punished for missing data).
export function titleMoodPos(item) {
  const axes = Array.isArray(item.axes) ? item.axes : Object.keys(item.axes || {});
  const aPts = axes.map((a) => AXIS_COORDS[a]).filter(Boolean);
  const gPts = (item.genres || [])
    .map((g) => GENRE_COORDS[String(g).toLowerCase()])
    .filter(Boolean);
  if (aPts.length === 0 && gPts.length === 0) return null;
  if (aPts.length === 0) return mean(gPts);
  if (gPts.length === 0) return mean(aPts);
  const a = mean(aPts);
  const g = mean(gPts);
  return [0.55 * a[0] + 0.45 * g[0], 0.55 * a[1] + 0.45 * g[1]];
}

// 0..1: 1 = dot sits exactly on the title, 0 = opposite corner. No position
// (unmapped title) -> 0.5 neutral.
export function affinity(dot, pos) {
  if (!pos || !dot) return 0.5;
  const dx = dot[0] - pos[0];
  const dy = dot[1] - pos[1];
  return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / MAX_DIST);
}

// How much the pad matters: dead centre = gentle nudge, dragged to a corner =
// mood runs the show. Intent scales with how far the dot is from centre.
export function moodWeight(dot) {
  const m = Math.min(1, Math.hypot(dot[0], dot[1]) / 1.2);
  return 0.35 + 0.5 * m; // 0.35 at centre → 0.85 at the corners
}

// Final mood-blended scores for a displayed list, aligned by index with `list`.
// BOTH signals are min-max normalised across this list before blending. Title
// positions are means of their axes' coords, so they compress toward the
// centre of the pad — raw affinities across a whole list can differ by <0.1,
// which is why a fixed 60/40 blend of normalised-base vs RAW affinity could
// never dethrone a strong-taste #1 no matter where the dot went.
// Unmapped titles (no axes) sit at 0.5 — neutral, never punished.
export function moodFinals(list, dot, baseOf) {
  const bases = list.map(baseOf);
  const bMin = Math.min(...bases);
  const bMax = Math.max(...bases);
  const nb = bases.map((b) => (bMax > bMin ? (b - bMin) / (bMax - bMin) : 1));

  const affs = list.map((t) => {
    const pos = titleMoodPos(t);
    return pos ? affinity(dot, pos) : null;
  });
  const mapped = affs.filter((a) => a != null);
  const aMin = Math.min(...mapped);
  const aMax = Math.max(...mapped);
  const na = affs.map((a) => (a == null || aMax <= aMin ? 0.5 : (a - aMin) / (aMax - aMin)));

  const w = moodWeight(dot);
  return nb.map((b, i) => (1 - w) * b + w * na[i]);
}

export const MOOD_CORNERS = {
  bl: '🍿 Cozy & easy',
  br: '🔪 Dark & gripping',
  tl: '✨ Clever comfort',
  tr: '🌀 Full mind-bender',
};

// Human line for the pad's footer, e.g. "🔪 Dark & gripping — leaning hard".
export function describeMood(dot) {
  const m = Math.hypot(dot[0], dot[1]);
  if (m < 0.18) return 'Dead centre — everything gets a fair shot';
  const corner = MOOD_CORNERS[(dot[1] >= 0 ? 't' : 'b') + (dot[0] >= 0 ? 'r' : 'l')];
  const strength = m > 0.9 ? 'all-in' : m > 0.45 ? 'leaning hard' : 'a gentle pull';
  return `${corner} — ${strength}`;
}
