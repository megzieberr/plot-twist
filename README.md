# Plot Twist 🎬

Personal film / series / anime recommender. Single user. Content-based scoring
against custom taste axes, with a "why this matched" line on every
recommendation.

Built from `recommender-brief-and-seed.md` — the brief and seed tables live in
this repo's `src/data/seed.json` (regenerate that JSON whenever the brief's
tables are edited, so they never drift apart).

## How it works

- **Taste axes** ([src/lib/axes.js](src/lib/axes.js)): the 10 hand-defined axes
  plus negative flags. Candidates from the APIs are mapped onto axes by keyword
  /tag inference (TMDB keywords, AniList tags with their 0–100 relevance rank).
- **Scorer** ([src/lib/scorer.js](src/lib/scorer.js)): weights are computed
  from the rating set (liked +1, meh −0.35, disliked −1, avoid ignored), with
  the calibration lessons baked in:
  - axis score **saturates** and blends with a small quality prior → two big
    axes alone can't top the deck (Gone Girl),
  - genre overlap gets a tiny weight (Edgerunners),
  - `slow_pacing` subtracts, and anime > 120 episodes gets auto-flagged (AoT /
    One Piece),
  - `prestige_high_craft` is multiplied down (Demon Slayer).
  - `scoreCandidate(features, weights)` is a pure function, so the hand-set
    weights can later be swapped for logistic-regression weights fit on
    accumulating ratings.
- **Content filter**: any candidate whose keywords say addiction is the
  central subject is hard-excluded from Discover. Mr. Robot is seeded as
  `avoid` and, like every rated title, never reappears in Discover.
- **Verdicts**: `liked / disliked / meh / watchlist / avoid` from the brief,
  plus two Discover-only signals: swipe right → `interested` (weak positive),
  swipe left → `skipped` (weak negative), swipe up → `watchlist`.
- "Marvel films" from the brief is not seeded (not a discrete title, weak
  signal only).

## Modes

- **Library**: search TMDB/AniList, tap to rate. Manual add for anything the
  APIs don't have.
- **Discover**: ranked swipe deck of unrated titles, live from the APIs, each
  card with its "why this matched" line.
- **Collections**: per-verdict, per-section lists.
- **Undo** on every action via the toast.
- **⚙️ Settings**: seed the database, watch the live axis weights, sign out.

## Local dev

```
npm install
copy .env.example .env    # fill in TMDB_API_KEY (AniList needs no key)
npm run dev               # http://localhost:5199
```

Without Supabase env vars (or with `?local=1`) the app runs in **local mode** —
all data in localStorage, no login. Anime Discover works even without the TMDB
key.

## Production setup (one-time)

1. **TMDB**: create an API key at themoviedb.org → Settings → API.
2. **Supabase**: new project → SQL editor → run `supabase/schema.sql` →
   Authentication → Providers → Email → **Confirm email OFF** →
   Authentication → Users → Add user: `megzieberr@plottwist.local` + password.
3. **Netlify**: new site from this repo. Build is picked up from
   `netlify.toml`. Environment variables:
   - `TMDB_API_KEY` (functions only, never in the bundle)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Open the site, sign in, ⚙️ → **Seed my ratings**.

## Install on your phone (PWA)

Open the deployed site in Chrome (Android) → menu → **Add to Home screen**
(or Safari on iOS → Share → **Add to Home Screen**). It installs with the
Plot Twist icon and runs full-screen like a native app.
