# Project status — updated 2026-07-05

## Where we are
Complete and fully live: app on GitHub Pages (megzieberr.github.io/plot-twist),
TMDB/AniList proxies on the separate CLI-deployed Netlify site `plot-twist-api`.
The two-target deploy workflow and the seed.json↔taste-brief sync are now written
down in DEPLOYMENT.md (read that before ANY change to this project).
Anime now survives AniList outages: search + Discover fall back to Kitsu
(key-free, CORS-open) whenever AniList errors, switching back automatically
when AniList recovers.

## Decisions
- 2026-07-03: `.upsert()` replaced with find-then-write + error toasts after the
  silent rating-loss bug (origin of the portfolio-wide rule).
- 2026-07-05: deploy/ops knowledge captured in DEPLOYMENT.md rather than relying
  on memory — key traps: Netlify site is NOT git-connected (function changes need
  `npx netlify-cli deploy --prod --dir dist` AND a git commit), ALLOWED_ORIGINS is
  hardcoded in both functions, re-seeding never updates already-rated titles.
- 2026-07-05: AniList disabled its whole public API mid-outage (403 "temporarily
  disabled…"), killing anime search/Discover. Added Kitsu as automatic fallback
  in src/lib/api.js — AniList stays primary (better tag ranks), Kitsu items get
  external_source 'kitsu' so IDs never collide; Discover's title-name dedup
  keeps rated shows out of the deck across both sources. If both APIs fail,
  AniList's (more informative) error is the one shown.

## Pending on Megan
Nothing.

## Next up
Nothing planned. On the next change: follow DEPLOYMENT.md so neither deploy
target gets missed.
