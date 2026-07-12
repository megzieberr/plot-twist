// Occasion chips for the Tonight view. An occasion is a "hard filter" mood:
// while a chip is active, the public rating LEADS the ranking and taste is only
// a tiebreak, so an out-of-character pick (a Christmas film for a dark-taste
// profile) still surfaces five great options.
//
// Field shapes:
//   tmdb.keywords — NAMES, resolved to TMDB keyword ids at runtime (search/keyword,
//                   then cached). Needs the widened proxy (Phase 0) to work; falls
//                   back to tmdb.genres alone until then.
//   tmdb.genres   — NAMES, mapped to ids against the live genre list. A chip with
//                   genres works even before the proxy redeploy.
//   tmdb.sort     — optional discover sort override (blockbusters lead on buzz).
//   anime         — true if the chip is offered on the Anime tab (filtered
//                   client-side by match()); false = hidden there.
//   match(title)  — client-side predicate for watchlist rows (and anime),
//                   checked against the title's genres + keywords + overview.

function textOf(t) {
  return [...(t.genres || []), ...(t.keywords || []), t.overview || '']
    .join(' ')
    .toLowerCase();
}
function hasGenre(t, names) {
  const g = (t.genres || []).map((x) => String(x).toLowerCase());
  return names.some((n) => g.includes(n.toLowerCase()));
}

export const OCCASIONS = [
  {
    key: 'christmas',
    label: 'Christmas',
    emoji: '🎄',
    tmdb: { keywords: ['christmas'], genres: ['Family'] },
    anime: false,
    match: (t) => /christmas|santa|yuletide|holiday season|nativity/.test(textOf(t)),
  },
  {
    key: 'spooky',
    label: 'Spooky night',
    emoji: '🎃',
    tmdb: { keywords: ['halloween'], genres: ['Horror'] },
    anime: true,
    match: (t) =>
      hasGenre(t, ['Horror']) || /halloween|haunt|ghost|slasher|supernatural horror|zombie/.test(textOf(t)),
  },
  {
    key: 'feelgood',
    label: 'Feel-good',
    emoji: '🥰',
    tmdb: { keywords: [], genres: ['Comedy', 'Family', 'Romance'] },
    anime: true,
    match: (t) =>
      hasGenre(t, ['Comedy', 'Family', 'Romance', 'Slice of Life']) ||
      /feel-good|heartwarming|wholesome|iyashikei/.test(textOf(t)),
  },
  {
    key: 'tearjerker',
    label: 'Tearjerker',
    emoji: '😭',
    tmdb: { keywords: ['tearjerker'], genres: ['Drama'] },
    anime: true,
    match: (t) => /tearjerker|tragedy|grief|terminal illness|emotional|makes you cry/.test(textOf(t)),
  },
  {
    key: 'datenight',
    label: 'Date night',
    emoji: '💘',
    tmdb: { keywords: [], genres: ['Romance', 'Comedy'] },
    anime: true,
    match: (t) => hasGenre(t, ['Romance']) || /romance|romantic|love story/.test(textOf(t)),
  },
  {
    key: 'blockbuster',
    label: 'Big-night blockbuster',
    emoji: '🍿',
    tmdb: { keywords: [], genres: ['Action', 'Adventure'], sort: 'popularity.desc' },
    anime: false,
    match: (t) => hasGenre(t, ['Action', 'Adventure', 'Action & Adventure', 'Science Fiction']),
  },
];

export function occasionByKey(key) {
  return OCCASIONS.find((o) => o.key === key) || null;
}
