// Client-side API layer. Everything goes through /api/* (Netlify functions in
// production, Vite dev middleware locally) so no keys ship in the bundle.

import { inferAxes } from './axes.js';
import { getCachedDetail, putCachedDetail } from './detailCache.js';

const IMG = 'https://image.tmdb.org/t/p/w342';

// Where the serverless functions live. Empty = same origin (Netlify, dev).
// On GitHub Pages this points at the functions-only Netlify site.
const API_BASE = import.meta.env.VITE_API_BASE || '';

// ---------------------------------------------------------------------------
// TMDB (movies + series)
// ---------------------------------------------------------------------------

let genreCache = {};

async function tmdb(path, params = {}) {
  const qs = new URLSearchParams({ path, ...params });
  let res;
  try {
    res = await fetch(`${API_BASE}/api/tmdb?${qs}`);
  } catch {
    // Proxy unreachable (not deployed yet / offline) — key must stay server-side.
    throw new Error(
      'Movies & Series need the TMDB proxy — it looks like the Netlify API site is not up yet. Anime works right here!'
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (!body) {
      throw new Error(
        'Movies & Series need the TMDB proxy — they activate with the Netlify deployment. Anime works right here!'
      );
    }
    throw new Error(body.error || `TMDB error ${res.status}`);
  }
  return res.json();
}

async function tmdbGenres(kind) {
  if (!genreCache[kind]) {
    const data = await tmdb(`genre/${kind}/list`);
    genreCache[kind] = Object.fromEntries(data.genres.map((g) => [g.id, g.name]));
  }
  return genreCache[kind];
}

function normalizeTmdb(item, kind, genreMap, extra = {}) {
  const isMovie = kind === 'movie';
  const genres = (item.genre_ids || (item.genres || []).map((g) => g.id))
    .map((id) => genreMap[id])
    .filter(Boolean);
  const keywords = extra.keywords || [];
  const signals = [...genres, ...keywords, item.overview || ''];
  const { axes, flags } = inferAxes(signals);
  return {
    external_source: 'tmdb',
    external_id: String(item.id),
    media_type: isMovie ? 'movie' : 'series',
    title: isMovie ? item.title : item.name,
    year: parseInt((isMovie ? item.release_date : item.first_air_date) || '') || null,
    poster_url: item.poster_path ? IMG + item.poster_path : null,
    overview: item.overview || '',
    genres,
    keywords,
    axes,
    flags,
    quality: Math.min(1, (item.vote_average || 5) / 10),
    popularity: item.popularity || 0,
  };
}

export async function searchTmdb(kind, query) {
  const [genreMap, data] = await Promise.all([
    tmdbGenres(kind === 'movie' ? 'movie' : 'tv'),
    tmdb(`search/${kind === 'movie' ? 'movie' : 'tv'}`, { query, include_adult: 'false' }),
  ]);
  return (data.results || []).slice(0, 12).map((r) => normalizeTmdb(r, kind === 'movie' ? 'movie' : 'tv', genreMap));
}

// Candidate pool for Discover: trending + top-rated-ish discover pages,
// then keywords fetched for the survivors so axis inference has real signal.
export async function discoverTmdb(kind, pages = 3) {
  const tv = kind !== 'movie';
  const api = tv ? 'tv' : 'movie';
  const genreMap = await tmdbGenres(api);
  const requests = [];
  for (let p = 1; p <= pages; p++) {
    requests.push(tmdb(`discover/${api}`, {
      page: String(p),
      sort_by: 'popularity.desc',
      'vote_count.gte': '200',
      include_adult: 'false',
    }));
  }
  requests.push(tmdb(`trending/${api}/week`));
  // Popularity skews family/franchise; make sure the content axes have
  // candidates to fire on: thriller/mystery/sci-fi pages + an acclaimed page.
  const contentGenres = api === 'movie' ? '53,9648,878' : '9648,80,10765';
  for (let p = 1; p <= 2; p++) {
    requests.push(tmdb(`discover/${api}`, {
      page: String(p),
      sort_by: 'popularity.desc',
      with_genres: contentGenres,
      'vote_count.gte': '200',
      include_adult: 'false',
    }));
  }
  requests.push(tmdb(`discover/${api}`, {
    sort_by: 'vote_average.desc',
    'vote_count.gte': '2000',
    include_adult: 'false',
  }));
  const results = (await Promise.all(requests)).flatMap((d) => d.results || []);
  const seen = new Set();
  const unique = results.filter((r) => !seen.has(r.id) && seen.add(r.id));
  return unique.map((r) => normalizeTmdb(r, api, genreMap));
}

// Enrich one TMDB candidate with its keyword list (better axis inference).
export async function enrichTmdb(candidate) {
  const api = candidate.media_type === 'movie' ? 'movie' : 'tv';
  try {
    const data = await tmdb(`${api}/${candidate.external_id}/keywords`);
    const list = data.keywords || data.results || [];
    const keywords = list.map((k) => k.name);
    return { ...candidate, keywords, ...recomputeAxes(candidate, keywords) };
  } catch {
    return candidate; // keywords are an enhancement, not a requirement
  }
}

function recomputeAxes(candidate, keywords) {
  const signals = [...candidate.genres, ...keywords, candidate.overview || ''];
  const { axes, flags } = inferAxes(signals);
  return { axes, flags };
}

// ---------------------------------------------------------------------------
// Occasion support (Tonight chips) — resolve a keyword NAME to a TMDB keyword
// id (cached forever locally, one request per name), and pull an occasion-
// filtered, quality-led candidate pool.
// ---------------------------------------------------------------------------

const KW_KEY = 'plot_twist_kw_ids';

function kwCache() {
  try {
    return JSON.parse(localStorage.getItem(KW_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

// Returns the keyword id (string) or null. Only successful resolutions are
// cached, so a null from a not-yet-deployed proxy is retried after the deploy.
export async function resolveKeywordId(name) {
  const key = String(name).toLowerCase();
  const cache = kwCache();
  if (cache[key]) return cache[key];
  try {
    const data = await tmdb('search/keyword', { query: name });
    const results = data.results || [];
    const exact = results.find((r) => (r.name || '').toLowerCase() === key);
    const id = (exact || results[0])?.id;
    if (id != null) {
      cache[key] = String(id);
      try {
        localStorage.setItem(KW_KEY, JSON.stringify(cache));
      } catch {
        // best-effort cache
      }
      return String(id);
    }
    return null;
  } catch {
    return null; // proxy not deployed / offline — caller falls back to genres
  }
}

// TV uses combined genre names for a few that movies split out.
const TV_GENRE_ALIAS = {
  action: 'action & adventure',
  adventure: 'action & adventure',
  'sci-fi': 'sci-fi & fantasy',
  'science fiction': 'sci-fi & fantasy',
  fantasy: 'sci-fi & fantasy',
  war: 'war & politics',
};

function genreNameToId(genreMap, name, tv) {
  const inv = {};
  for (const [id, n] of Object.entries(genreMap)) inv[n.toLowerCase()] = id;
  let key = String(name).toLowerCase();
  if (tv && TV_GENRE_ALIAS[key] && inv[TV_GENRE_ALIAS[key]]) key = TV_GENRE_ALIAS[key];
  return inv[key] || null;
}

// Occasion-specific candidate pool. Hard-filtered by keyword/genre (OR within
// each), quality-led. vote_count floor is lower than Discover's 200 — occasion
// niches are small. Two pages by rating + one by popularity, merged + deduped.
// Throws OCCASION_UNAVAILABLE when neither a keyword id nor a genre id could be
// applied (e.g. a keyword-only chip before the proxy redeploy) so the caller
// can show the friendly "needs the updated proxy" message.
export async function discoverOccasionTmdb(media, { keywordIds = [], genreNames = [], sort } = {}) {
  const tv = media !== 'movie';
  const api = tv ? 'tv' : 'movie';
  const genreMap = await tmdbGenres(api);
  const genreIds = genreNames.map((n) => genreNameToId(genreMap, n, tv)).filter(Boolean);

  if (keywordIds.length === 0 && genreIds.length === 0) {
    const err = new Error('OCCASION_UNAVAILABLE');
    err.code = 'OCCASION_UNAVAILABLE';
    throw err;
  }

  const base = { include_adult: 'false', 'vote_count.gte': '100' };
  if (keywordIds.length) base.with_keywords = keywordIds.join('|'); // OR
  if (genreIds.length) base.with_genres = genreIds.join('|'); // OR (any of them)

  const requests = [
    tmdb(`discover/${api}`, { ...base, page: '1', sort_by: 'vote_average.desc' }),
    tmdb(`discover/${api}`, { ...base, page: '2', sort_by: 'vote_average.desc' }),
    tmdb(`discover/${api}`, { ...base, page: '1', sort_by: sort || 'popularity.desc' }),
  ];
  const results = (await Promise.all(requests)).flatMap((d) => d.results || []);
  const seen = new Set();
  const unique = results.filter((r) => !seen.has(r.id) && seen.add(r.id));
  return unique.map((r) => normalizeTmdb(r, api, genreMap));
}

// ---------------------------------------------------------------------------
// "More like this" (TMDB) — recommendations/similar (Same vibe), a genre pool
// (Same genre), and a person's filmography (Same director / Same creator).
// The person paths need the widened proxy (Phase 0); until it deploys the proxy
// returns "path not allowed" and the caller shows a friendly message.
// ---------------------------------------------------------------------------

function dedupeById(list) {
  const seen = new Set();
  return list.filter((r) => r && r.id != null && !seen.has(r.id) && seen.add(r.id));
}

// Same vibe: recommendations + similar, merged, normalised, top slice enriched.
export async function similarTmdb(item) {
  const api = item.media_type === 'movie' ? 'movie' : 'tv';
  const id = item.external_id;
  const genreMap = await tmdbGenres(api);
  const [rec, sim] = await Promise.all([
    tmdb(`${api}/${id}/recommendations`).catch(() => ({ results: [] })),
    tmdb(`${api}/${id}/similar`).catch(() => ({ results: [] })),
  ]);
  const unique = dedupeById([...(rec.results || []), ...(sim.results || [])]);
  const normalized = unique.map((r) => normalizeTmdb(r, api, genreMap));
  const enriched = await Promise.all(normalized.slice(0, 20).map(enrichTmdb));
  return [...enriched, ...normalized.slice(20)];
}

// Same genre: high-rated titles sharing any of the source's genres.
export async function sameGenreTmdb(item) {
  const api = item.media_type === 'movie' ? 'movie' : 'tv';
  const genreMap = await tmdbGenres(api);
  const inv = {};
  for (const [gid, n] of Object.entries(genreMap)) inv[n.toLowerCase()] = gid;
  const ids = (item.genres || []).map((g) => inv[String(g).toLowerCase()]).filter(Boolean);
  if (!ids.length) return [];
  const base = {
    with_genres: ids.slice(0, 3).join('|'), // OR — share any of its genres
    sort_by: 'vote_average.desc',
    'vote_count.gte': '300',
    include_adult: 'false',
  };
  const [p1, p2] = await Promise.all([
    tmdb(`discover/${api}`, { ...base, page: '1' }),
    tmdb(`discover/${api}`, { ...base, page: '2' }),
  ]);
  const unique = dedupeById([...(p1.results || []), ...(p2.results || [])]);
  return unique.map((r) => normalizeTmdb(r, api, genreMap));
}

// Same director (movies) / Same creator (series). Returns sections, one per
// person: [{ person, role, items }]. Needs the Phase-0 person-credits path.
export async function peopleWorksTmdb(item) {
  const id = item.external_id;
  if (item.media_type === 'movie') {
    const genreMap = await tmdbGenres('movie');
    const credits = await tmdb(`movie/${id}/credits`);
    const directors = dedupeById((credits.crew || []).filter((c) => c.job === 'Director'));
    const sections = [];
    for (const d of directors.slice(0, 3)) {
      const filmo = await tmdb(`person/${d.id}/movie_credits`);
      const films = dedupeById(
        (filmo.crew || []).filter((c) => c.job === 'Director' && String(c.id) !== String(id))
      );
      sections.push({ person: d.name, role: 'Directed by', items: films.map((f) => normalizeTmdb(f, 'movie', genreMap)) });
    }
    return sections;
  }
  // series — created_by lives in the already-allowed tv/{id} detail
  const genreMap = await tmdbGenres('tv');
  const detail = await tmdb(`tv/${id}`);
  const creators = detail.created_by || [];
  const sections = [];
  for (const c of creators.slice(0, 3)) {
    const filmo = await tmdb(`person/${c.id}/tv_credits`);
    const shows = dedupeById(
      [...(filmo.crew || []), ...(filmo.cast || [])].filter((s) => String(s.id) !== String(id))
    );
    sections.push({ person: c.name, role: 'Created by', items: shows.map((s) => normalizeTmdb(s, 'tv', genreMap)) });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// AniList (anime) — tags come back with a 0-100 rank, perfect for confidence.
// ---------------------------------------------------------------------------

async function anilist(query, variables) {
  const payload = JSON.stringify({ query, variables });
  const opts = {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: payload,
  };
  // Prefer the proxy; fall back to AniList directly (key-free, CORS-open)
  // if the proxy is unreachable.
  let res = await fetch(`${API_BASE}/api/anilist`, opts).catch(() => null);
  if (!res || !res.headers.get('content-type')?.includes('json')) {
    res = await fetch('https://graphql.anilist.co', opts);
  }
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

const ANI_FIELDS = `
  id
  title { romaji english }
  startDate { year }
  coverImage { large }
  description(asHtml: false)
  genres
  tags { name rank }
  averageScore
  popularity
  episodes
  format
`;

function normalizeAnilist(m) {
  const tags = m.tags || [];
  const tagNames = tags.map((t) => t.name);
  const tagRanks = Object.fromEntries(tags.map((t) => [t.name, (t.rank || 50) / 100]));
  const signals = [...(m.genres || []), ...tagNames, stripHtml(m.description || '')];
  const { axes, flags } = inferAxes(signals, tagRanks);
  // One Piece lesson: very long runners get a soft slow_pacing flag.
  if ((m.episodes || 0) > 120) flags.slow_pacing = Math.max(flags.slow_pacing || 0, 0.7);
  return {
    external_source: 'anilist',
    external_id: String(m.id),
    media_type: 'anime',
    title: m.title.english || m.title.romaji,
    year: m.startDate?.year || null,
    poster_url: m.coverImage?.large || null,
    overview: stripHtml(m.description || '').slice(0, 400),
    genres: m.genres || [],
    keywords: tagNames,
    axes,
    flags,
    quality: Math.min(1, (m.averageScore || 60) / 100),
    popularity: m.popularity || 0,
  };
}

export async function searchAnilist(query) {
  let data;
  try {
    data = await anilist(
      `query ($q: String) { Page(perPage: 12) { media(search: $q, type: ANIME) { ${ANI_FIELDS} } } }`,
      { q: query }
    );
  } catch (ex) {
    // AniList periodically switches its whole public API off during
    // instability ("temporarily disabled…"). Kitsu keeps anime working.
    try {
      return await searchKitsu(query);
    } catch {
      throw ex; // both down — AniList's message is the informative one
    }
  }
  return data.Page.media.map(normalizeAnilist);
}

export async function discoverAnilist(pages = 3) {
  const out = [];
  try {
    for (let p = 1; p <= pages; p++) {
      const data = await anilist(
        `query ($p: Int) { Page(page: $p, perPage: 50) {
          media(type: ANIME, sort: POPULARITY_DESC, format_in: [TV, ONA, MOVIE]) { ${ANI_FIELDS} }
        } }`,
        { p }
      );
      out.push(...data.Page.media.map(normalizeAnilist));
    }
  } catch (ex) {
    try {
      return await discoverKitsu(pages);
    } catch {
      throw ex;
    }
  }
  return out;
}

// Same vibe (anime): AniList's own recommendations for a title.
const ANI_REC_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    recommendations(perPage: 20, sort: RATING_DESC) {
      nodes { mediaRecommendation { ${ANI_FIELDS} } }
    }
  }
}`;

export async function similarAnilist(id) {
  const data = await anilist(ANI_REC_QUERY, { id: Number(id) });
  const nodes = data.Media?.recommendations?.nodes || [];
  return nodes.map((n) => n.mediaRecommendation).filter(Boolean).map(normalizeAnilist);
}

// Same genre (anime): highest-scored titles sharing the source's genres.
export async function sameGenreAnilist(genres) {
  const g = (genres || []).slice(0, 3);
  if (!g.length) return [];
  const data = await anilist(
    `query ($g: [String]) { Page(perPage: 25) { media(genre_in: $g, type: ANIME, sort: SCORE_DESC) { ${ANI_FIELDS} } } }`,
    { g }
  );
  return (data.Page?.media || []).map(normalizeAnilist);
}

// ---------------------------------------------------------------------------
// Kitsu (anime fallback) — key-free and CORS-open like AniList. Categories
// stand in for AniList tags (no 0-100 ranks, so inference runs unweighted).
// Rated-title dedup in Discover still holds across sources because it also
// matches on title name, not just source:id.
// ---------------------------------------------------------------------------

async function kitsu(path) {
  const res = await fetch(`https://kitsu.io/api/edge/${path}`, {
    headers: { accept: 'application/vnd.api+json' },
  });
  if (!res.ok) throw new Error(`Kitsu error ${res.status}`);
  return res.json();
}

function kitsuCategoryMap(included) {
  return Object.fromEntries(
    (included || [])
      .filter((x) => x.type === 'categories')
      .map((x) => [x.id, x.attributes.title])
  );
}

function normalizeKitsu(item, catMap) {
  const a = item.attributes;
  const categories = (item.relationships?.categories?.data || [])
    .map((c) => catMap[c.id])
    .filter(Boolean);
  const signals = [...categories, a.synopsis || ''];
  const { axes, flags } = inferAxes(signals);
  if ((a.episodeCount || 0) > 120) flags.slow_pacing = Math.max(flags.slow_pacing || 0, 0.7);
  return {
    external_source: 'kitsu',
    external_id: String(item.id),
    media_type: 'anime',
    title: a.titles?.en || a.canonicalTitle,
    year: parseInt(a.startDate || '') || null,
    poster_url: a.posterImage?.large || a.posterImage?.medium || null,
    overview: (a.synopsis || '').slice(0, 400),
    genres: categories.slice(0, 4),
    keywords: categories,
    axes,
    flags,
    quality: Math.min(1, (parseFloat(a.averageRating) || 60) / 100),
    popularity: a.userCount || 0,
  };
}

async function searchKitsu(query) {
  const data = await kitsu(
    `anime?filter[text]=${encodeURIComponent(query)}&page[limit]=12&include=categories&fields[categories]=title`
  );
  const catMap = kitsuCategoryMap(data.included);
  return (data.data || []).map((m) => normalizeKitsu(m, catMap));
}

async function discoverKitsu(pages = 3) {
  const out = [];
  // Kitsu caps page size at 20 (AniList allows 50), so fetch more pages.
  for (let p = 0; p < pages * 2; p++) {
    const data = await kitsu(
      `anime?sort=-userCount&filter[subtype]=TV,ONA,movie&page[limit]=20&page[offset]=${p * 20}&include=categories&fields[categories]=title`
    );
    const catMap = kitsuCategoryMap(data.included);
    out.push(...(data.data || []).map((m) => normalizeKitsu(m, catMap)));
  }
  return out;
}

export async function searchAny(mediaType, query) {
  if (mediaType === 'anime') return searchAnilist(query);
  return searchTmdb(mediaType, query);
}

// ---------------------------------------------------------------------------
// Title details (Overview sheet + watchlist quality) — the live facts the
// stored rows drop: public rating, vote count, release date, runtime, full
// overview, top reviews. Normalised across TMDB / AniList / Kitsu into one
// shape. Manual rows and proxy-down both degrade to stored data (never blank).
//
//   { source, note, quality (0..1|null), rating10 (0..10|null), vote_count,
//     release_date, runtime, episodes, overview, moreUrl,
//     reviews: [{ author, score (0..10|null), excerpt, url }] }
// ---------------------------------------------------------------------------

export async function getDetails(item) {
  const src = item.external_source;
  if (!item.external_id || !src || src === 'manual') {
    return storedDetail(item, 'manual', 'Manual entry — no live data.');
  }
  try {
    if (src === 'tmdb') return await tmdbDetails(item);
    if (src === 'anilist') return await anilistDetails(item);
    if (src === 'kitsu') return await kitsuDetails(item);
  } catch (ex) {
    return storedDetail(item, 'stored', friendlyOffline(ex));
  }
  return storedDetail(item, 'stored', null);
}

function friendlyOffline(ex) {
  const m = ex?.message || '';
  if (/proxy|Netlify/i.test(m)) return 'Live data unavailable right now — showing what we have.';
  return 'Could not reach the live source — showing what we have.';
}

// Fallback: render whatever the stored row + cache already hold.
function storedDetail(item, source, note) {
  const c = getCachedDetail(item) || {};
  return {
    source,
    note,
    quality: typeof item.quality === 'number' ? item.quality : c.quality ?? null,
    rating10: c.rating10 ?? null,
    vote_count: c.vote_count ?? null,
    release_date: c.release_date ?? (item.year ? String(item.year) : null),
    runtime: c.runtime ?? null,
    episodes: c.episodes ?? null,
    overview: item.overview || '',
    reviews: [],
    moreUrl: publicUrl(item),
  };
}

function publicUrl(item) {
  const id = item.external_id;
  if (!id) return null;
  if (item.external_source === 'tmdb') {
    return `https://www.themoviedb.org/${item.media_type === 'movie' ? 'movie' : 'tv'}/${id}`;
  }
  if (item.external_source === 'anilist') return `https://anilist.co/anime/${id}`;
  if (item.external_source === 'kitsu') return `https://kitsu.io/anime/${id}`;
  return null;
}

function clip(s, n) {
  const t = (s || '').trim();
  return t.length > n ? t.slice(0, n).trimEnd() + '…' : t;
}

async function tmdbDetails(item) {
  const api = item.media_type === 'movie' ? 'movie' : 'tv';
  const id = item.external_id;
  const [detail, rev] = await Promise.all([
    tmdb(`${api}/${id}`),
    tmdb(`${api}/${id}/reviews`).catch(() => ({ results: [] })),
  ]);
  const isMovie = api === 'movie';
  const rating10 = detail.vote_average || null;
  const quality = rating10 != null ? Math.min(1, rating10 / 10) : null;
  const release_date = (isMovie ? detail.release_date : detail.first_air_date) || null;
  const runtime = isMovie ? detail.runtime || null : detail.episode_run_time?.[0] ?? null;
  const episodes = isMovie ? null : detail.number_of_episodes ?? null;
  const reviews = (rev.results || []).slice(0, 3).map((r) => ({
    author: r.author || r.author_details?.username || 'TMDB reviewer',
    score: r.author_details?.rating ?? null, // already 0..10
    excerpt: clip(r.content, 220),
    url: r.url || null,
  }));
  const out = {
    source: 'tmdb',
    note: null,
    quality,
    rating10,
    vote_count: detail.vote_count ?? null,
    release_date: release_date || (item.year ? String(item.year) : null),
    runtime,
    episodes,
    overview: detail.overview || item.overview || '',
    reviews,
    moreUrl: publicUrl(item),
  };
  cacheFacts(item, out);
  return out;
}

const ANI_DETAIL_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    averageScore
    episodes
    duration
    startDate { year month day }
    description(asHtml: false)
    siteUrl
    reviews(sort: RATING_DESC, perPage: 3) {
      nodes { summary score user { name } }
    }
  }
}`;

async function anilistDetails(item) {
  const data = await anilist(ANI_DETAIL_QUERY, { id: Number(item.external_id) });
  const m = data.Media || {};
  const rating10 = m.averageScore != null ? m.averageScore / 10 : null;
  const quality = m.averageScore != null ? Math.min(1, m.averageScore / 100) : null;
  const d = m.startDate;
  const release_date = d?.year
    ? [d.year, d.month, d.day].filter((x) => x != null).map(pad2).join('-')
    : item.year
      ? String(item.year)
      : null;
  const reviews = (m.reviews?.nodes || []).slice(0, 3).map((r) => ({
    author: r.user?.name || 'AniList reviewer',
    score: r.score != null ? r.score / 10 : null, // AniList review score is /100
    excerpt: clip(stripHtml(r.summary || ''), 220),
    url: null,
  }));
  const out = {
    source: 'anilist',
    note: null,
    quality,
    rating10,
    vote_count: null,
    release_date,
    runtime: m.duration ?? null,
    episodes: m.episodes ?? null,
    overview: stripHtml(m.description || '') || item.overview || '',
    reviews,
    moreUrl: m.siteUrl || publicUrl(item),
  };
  cacheFacts(item, out);
  return out;
}

async function kitsuDetails(item) {
  const data = await kitsu(`anime/${item.external_id}`);
  const a = data.data?.attributes || {};
  const avg = parseFloat(a.averageRating); // Kitsu is 0..100
  const rating10 = isFinite(avg) ? avg / 10 : null;
  const quality = isFinite(avg) ? Math.min(1, avg / 100) : null;
  const out = {
    source: 'kitsu',
    note: 'Reviews unavailable for Kitsu titles.',
    quality,
    rating10,
    vote_count: a.userCount ?? null,
    release_date: a.startDate || (item.year ? String(item.year) : null),
    runtime: a.episodeLength ?? null,
    episodes: a.episodeCount ?? null,
    overview: a.synopsis || item.overview || '',
    reviews: [],
    moreUrl: a.slug ? `https://kitsu.io/anime/${a.slug}` : publicUrl(item),
  };
  cacheFacts(item, out);
  return out;
}

function cacheFacts(item, out) {
  putCachedDetail(item, {
    quality: out.quality,
    rating10: out.rating10,
    vote_count: out.vote_count,
    release_date: out.release_date,
    runtime: out.runtime,
    episodes: out.episodes,
  });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
