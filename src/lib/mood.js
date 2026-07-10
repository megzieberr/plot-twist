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

// Corner-to-corner distance of the [-1,1]^2 square — the max possible gap.
const MAX_DIST = 2 * Math.SQRT2;

// A title's position = the mean of its mapped axes' coordinates. Titles with no
// mapped axes return null — the caller treats that as neutral (never punished
// to the bottom for missing data).
export function titleMoodPos(item) {
  const axes = Array.isArray(item.axes) ? item.axes : Object.keys(item.axes || {});
  const pts = axes.map((a) => AXIS_COORDS[a]).filter(Boolean);
  if (pts.length === 0) return null;
  const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [x, y];
}

// 0..1: 1 = dot sits exactly on the title, 0 = opposite corner. No position
// (unmapped title) -> 0.5 neutral.
export function affinity(dot, pos) {
  if (!pos || !dot) return 0.5;
  const dx = dot[0] - pos[0];
  const dy = dot[1] - pos[1];
  return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / MAX_DIST);
}

// Blend the (already 0..1 normalised) base match score with mood affinity.
// The pad nudges, it never dominates: 60% taste, 40% mood.
export function blendMood(normBaseScore, moodAffinity) {
  return 0.6 * normBaseScore + 0.4 * moodAffinity;
}

export const MOOD_CORNERS = {
  bl: '🍿 Cozy & easy',
  br: '🔪 Dark & gripping',
  tl: '✨ Clever comfort',
  tr: '🌀 Full mind-bender',
};
