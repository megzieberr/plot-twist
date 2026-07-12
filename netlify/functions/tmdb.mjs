// TMDB proxy — the API key lives here (Netlify env var TMDB_API_KEY),
// never in the client bundle. Only whitelisted read paths are allowed.
// CORS: the app is served from GitHub Pages, so cross-origin calls from it
// (and local dev) are allowed; other origins are not, to keep the proxy
// from being borrowed by strangers.

// NOTE: this whitelist is duplicated in vite.config.js (devApiPlugin → ALLOWED).
// The dev mirror and this proxy MUST stay identical — add any path to BOTH in
// the same commit, or a path works locally but 400s in production (see
// DEPLOYMENT.md §2).
const ALLOWED = [
  /^discover\/(movie|tv)$/,
  /^search\/(movie|tv|multi)$/,
  /^(movie|tv)\/\d+$/,
  /^(movie|tv)\/\d+\/(keywords|recommendations|similar|reviews)$/,
  /^(movie|tv)\/\d+\/credits$/, // director / creator lookup ("More like this")
  /^person\/\d+\/(movie_credits|tv_credits|combined_credits)$/, // a person's filmography
  /^search\/keyword$/, // occasion keyword name → TMDB keyword id (Tonight chips)
  /^genre\/(movie|tv)\/list$/,
  /^trending\/(movie|tv)\/(day|week)$/,
];

const ALLOWED_ORIGINS = [
  'https://megzieberr.github.io',
  'http://localhost:5201',
];

function cors(req) {
  const origin = req.headers.get('origin');
  if (!origin) return {}; // same-origin request, no CORS needed
  if (!ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}

export default async (req) => {
  const corsHeaders = cors(req);
  if (corsHeaders === null) return json({ error: 'origin not allowed' }, 403, {});
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.searchParams.get('path') || '';
  if (!ALLOWED.some((re) => re.test(path))) {
    return json({ error: `path not allowed: ${path}` }, 400, corsHeaders);
  }
  const key = process.env.TMDB_API_KEY;
  if (!key) return json({ error: 'TMDB_API_KEY is not configured' }, 500, corsHeaders);

  const upstream = new URL(`https://api.themoviedb.org/3/${path}`);
  for (const [k, v] of url.searchParams) {
    if (k !== 'path') upstream.searchParams.set(k, v);
  }
  upstream.searchParams.set('api_key', key);

  const res = await fetch(upstream);
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
      ...corsHeaders,
    },
  });
};

export const config = { path: '/api/tmdb' };

function json(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...(corsHeaders || {}) },
  });
}
