// TMDB proxy — the API key lives here (Netlify env var TMDB_API_KEY),
// never in the client bundle. Only whitelisted read paths are allowed.

const ALLOWED = [
  /^discover\/(movie|tv)$/,
  /^search\/(movie|tv|multi)$/,
  /^(movie|tv)\/\d+$/,
  /^(movie|tv)\/\d+\/(keywords|recommendations|similar)$/,
  /^genre\/(movie|tv)\/list$/,
  /^trending\/(movie|tv)\/(day|week)$/,
];

export default async (req) => {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') || '';
  if (!ALLOWED.some((re) => re.test(path))) {
    return json({ error: `path not allowed: ${path}` }, 400);
  }
  const key = process.env.TMDB_API_KEY;
  if (!key) return json({ error: 'TMDB_API_KEY is not configured' }, 500);

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
    },
  });
};

export const config = { path: '/api/tmdb' };

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
