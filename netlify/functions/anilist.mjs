// AniList GraphQL proxy. AniList's public API needs no key, but routing it
// through a function keeps the client API-agnostic and lets us add caching.
// CORS mirrors the TMDB function (app lives on GitHub Pages).

const ALLOWED_ORIGINS = [
  'https://megzieberr.github.io',
  'http://localhost:5201',
];

function cors(req) {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  if (!ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}

export default async (req) => {
  const corsHeaders = cors(req);
  if (corsHeaders === null) {
    return new Response(JSON.stringify({ error: 'origin not allowed' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'content-type': 'application/json', ...corsHeaders },
    });
  }
  const payload = await req.text();
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: payload,
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
};

export const config = { path: '/api/anilist' };
