// AniList GraphQL proxy. AniList's public API needs no key, but routing it
// through a function keeps the client API-agnostic and lets us add caching.

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
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
    headers: { 'content-type': 'application/json' },
  });
};

export const config = { path: '/api/anilist' };
