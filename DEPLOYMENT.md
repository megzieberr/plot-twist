# Plot Twist — Deploy & Ops Checklist

Plot Twist has **two deploy targets** that update independently. Pushing to GitHub
updates the app only; the API proxies never update from git.

| Target | What lives there | How it deploys |
|--------|-----------------|----------------|
| GitHub Pages (`megzieberr/plot-twist`) | The React app | **Automatic** on push to `main` (`.github/workflows/deploy.yml`) |
| Netlify site `plot-twist-api` | `netlify/functions/tmdb.mjs` + `anilist.mjs` (TMDB key proxy) | **Manual** Netlify CLI deploy — the site is NOT git-connected |

Live app: https://megzieberr.github.io/plot-twist/
API base: https://plot-twist-api.netlify.app (site id `5d24ac6e-081f-47e9-8b5a-08e58b27965d`, linked in `.netlify/state.json`)

---

## 1. App change (anything under `src/`, `index.html`, styles, PWA files)

1. Commit (PowerShell 5.1: `git commit -F msg.txt`, never `-m "..."`) and push to `main`.
2. GitHub Actions builds with `GHPAGES_BASE=/plot-twist/`, the Supabase keys, and
   `VITE_API_BASE=https://plot-twist-api.netlify.app` (all set inside the workflow file).
3. Verify at the live URL. Nothing else to do — Netlify is untouched.

## 2. API / function change (anything under `netlify/functions/` or `netlify.toml`)

> **The TMDB path whitelist lives in TWO files** and they must stay identical:
> `netlify/functions/tmdb.mjs` (`ALLOWED`) and the dev mirror in `vite.config.js`
> (`devApiPlugin` → `ALLOWED`). Add any new TMDB path to **both**, in the **same
> commit** — otherwise a path works in local dev but returns `400 path not allowed`
> from the live proxy (or vice-versa). Adding a path also needs the Netlify deploy
> below before it works in production.

1. Edit the `.mjs` file(s).
2. Deploy from the repo root: `npx netlify-cli deploy --prod --dir dist`
   - Needs node/npx (node is not on the system PATH on this machine — use the same
     winget node used for budget-app, or a shell where node works).
   - The site is already linked via `.netlify/state.json`, so no `netlify link` needed.
3. **Also commit + push the change to git.** Because the Netlify site is not
   git-connected, skipping this silently lets the repo drift from production.
4. `TMDB_API_KEY` lives only in the Netlify environment UI — never in the repo or workflow.

### If the app URL ever changes
Update the hardcoded `ALLOWED_ORIGINS` list in **both** functions
(`tmdb.mjs` ~lines 16–19, `anilist.mjs` ~lines 5–8), then do a Netlify deploy (step 2).
Current whitelist: `https://megzieberr.github.io` and `http://localhost:5201`.

---

## 3. seed.json ↔ taste brief sync

- **Source of truth:** the three tables in **section 4** of
  `C:\Users\megzi\Desktop\recommender-brief-and-seed.md` (Movies 23, Series 7, Anime 14 = 52 rows).
- Whenever a table row is added or edited, regenerate `src/data/seed.json` to match.
  Per-row fields: `title`, `year`, `media_type` (`movie|series|anime` from the section),
  `verdict`, `axes` (array parsed from the Axes column), `note`.
- The "Marvel films" row in the brief is **deliberately not seeded**.
- Seeding is manual (Settings → "Seed my ratings") and **idempotent**: it skips any title
  that already has a rating and a poster. So changing a verdict for an already-seeded
  title in the brief will NOT update it on re-seed — change that rating in the app too.
- Sections 1–3 and 5–8 of the brief (axes definitions, calibration notes, filters) feed
  the scorer (`src/lib/axes.js`), not seed.json.

---

## 4. Local dev quick reference

- `npm run dev` → http://localhost:5201. A Vite middleware in `vite.config.js` mirrors
  both Netlify functions locally.
- `.env`: `TMDB_API_KEY` is currently empty locally — search still works because
  `VITE_API_BASE` points at the deployed proxy.
- `?local=1` (or missing Supabase env vars) forces LocalBackend →
  localStorage `plot_twist_v1`. **Local and cloud data never merge** — don't rate things
  in local mode expecting them to sync.
