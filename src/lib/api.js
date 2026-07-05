// Client-side API layer. Everything goes through /api/* (Netlify functions in
// production, Vite dev middleware locally) so no keys ship in the bundle.

import { inferAxes } from './axes.js';

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

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
