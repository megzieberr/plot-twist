// Client-side API layer. Everything goes through /api/* (Netlify functions in
// production, Vite dev middleware locally) so no keys ship in the bundle.

import { inferAxes } from './axes.js';

const IMG = 'https://image.tmdb.org/t/p/w342';

// ---------------------------------------------------------------------------
// TMDB (movies + series)
// ---------------------------------------------------------------------------

let genreCache = {};

async function tmdb(path, params = {}) {
  const qs = new URLSearchParams({ path, ...params });
  const res = await fetch(`/api/tmdb?${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
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
  const res = await fetch('/api/anilist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
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
  const data = await anilist(
    `query ($q: String) { Page(perPage: 12) { media(search: $q, type: ANIME) { ${ANI_FIELDS} } } }`,
    { q: query }
  );
  return data.Page.media.map(normalizeAnilist);
}

export async function discoverAnilist(pages = 3) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const data = await anilist(
      `query ($p: Int) { Page(page: $p, perPage: 50) {
        media(type: ANIME, sort: POPULARITY_DESC, format_in: [TV, ONA, MOVIE]) { ${ANI_FIELDS} }
      } }`,
      { p }
    );
    out.push(...data.Page.media.map(normalizeAnilist));
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
