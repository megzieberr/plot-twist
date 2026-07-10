import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only middleware that mirrors the two Netlify functions, so `npm run dev`
// works without netlify-cli. TMDB_API_KEY comes from .env (no VITE_ prefix,
// so it is never exposed to the client bundle).
function devApiPlugin(env) {
  const ALLOWED = [
    /^discover\/(movie|tv)$/,
    /^search\/(movie|tv|multi)$/,
    /^(movie|tv)\/\d+$/,
    /^(movie|tv)\/\d+\/(keywords|recommendations|similar|reviews)$/,
    /^genre\/(movie|tv)\/list$/,
    /^trending\/(movie|tv)\/(day|week)$/,
  ];
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/tmdb', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://x');
          const path = url.searchParams.get('path') || '';
          if (!ALLOWED.some((re) => re.test(path))) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: `path not allowed: ${path}` }));
          }
          if (!env.TMDB_API_KEY) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: 'TMDB_API_KEY missing in .env' }));
          }
          const upstream = new URL(`https://api.themoviedb.org/3/${path}`);
          for (const [k, v] of url.searchParams) {
            if (k !== 'path') upstream.searchParams.set(k, v);
          }
          upstream.searchParams.set('api_key', env.TMDB_API_KEY);
          const r = await fetch(upstream);
          res.statusCode = r.status;
          res.setHeader('content-type', 'application/json');
          res.end(await r.text());
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      server.middlewares.use('/api/anilist', async (req, res) => {
        try {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const r = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: Buffer.concat(chunks),
          });
          res.statusCode = r.status;
          res.setHeader('content-type', 'application/json');
          res.end(await r.text());
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // GitHub Pages serves from /plot-twist/; Netlify and dev serve from /.
    base: process.env.GHPAGES_BASE || '/',
    plugins: [react(), devApiPlugin(env)],
    server: { port: 5201 },
  };
});
