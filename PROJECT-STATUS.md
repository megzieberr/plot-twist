# Project status — updated 2026-07-05

## Where we are
Complete and fully live: app on GitHub Pages (megzieberr.github.io/plot-twist),
TMDB/AniList proxies on the separate CLI-deployed Netlify site `plot-twist-api`.
The two-target deploy workflow and the seed.json↔taste-brief sync are now written
down in DEPLOYMENT.md (read that before ANY change to this project).

## Decisions
- 2026-07-03: `.upsert()` replaced with find-then-write + error toasts after the
  silent rating-loss bug (origin of the portfolio-wide rule).
- 2026-07-05: deploy/ops knowledge captured in DEPLOYMENT.md rather than relying
  on memory — key traps: Netlify site is NOT git-connected (function changes need
  `npx netlify-cli deploy --prod --dir dist` AND a git commit), ALLOWED_ORIGINS is
  hardcoded in both functions, re-seeding never updates already-rated titles.

## Pending on Megan
Nothing.

## Next up
Nothing planned. On the next change: follow DEPLOYMENT.md so neither deploy
target gets missed.
