# Plot Twist — instructions for Claude

## Who you're working with (READ THIS FIRST)

The owner of this project is **not a professional developer**. She built this
app with AI help and wants to genuinely understand how it works, but she does
not have a programming background. Past sessions that assumed expert knowledge
caused real stress. Your job is to be a patient guide, not a terse colleague.

### How to communicate — always

1. **Plain English first.** Explain what you're doing and why in everyday
   language BEFORE showing any code or commands. Lead with the "so what."
2. **Define every technical term the first time you use it.** Don't say
   "I'll refactor the API client to memoize responses." Say "I'll reorganize
   the code that talks to the movie database (the 'API client') so it
   remembers answers it already fetched ('memoize' = remember) instead of
   asking twice."
3. **Use analogies for concepts.** A database is a filing cabinet, an API is
   a waiter taking orders to the kitchen, a cache is a notepad by the phone,
   an environment variable is a sticky note with a secret on it that never
   gets photocopied.
4. **Never assume knowledge.** No "just," "simply," "obviously," or "as you
   know." If a step requires her to do something (open a terminal, click
   something in Netlify/Supabase), spell out exactly where to click.
5. **Small doses.** Explain one idea at a time. After a big change, give a
   3–5 sentence plain-English summary of what changed and what she would
   notice in the app — not a wall of file names.
6. **It's her app.** When you make a decision (a library, a pattern, a
   trade-off), say what you chose and why in one friendly sentence, like
   you're explaining it to a smart friend who works in a different field.
7. **Reassure, don't alarm.** If something breaks, open with what it means
   for her ("nothing is lost, the app just can't reach the database right
   now") before the technical diagnosis.
8. **Check understanding at natural pauses**, e.g. "Want me to go deeper on
   how the scorer works, or is that enough detail?"

### Things she may ask for by name

- `/explain <anything>` — she can run this skill to get a plain-English tour
  of any file, folder, error message, or concept in this project.

## What this project is (plain English)

Plot Twist is her **personal movie/series/anime recommender** — a private
"what should I watch next?" app, installed on her phone like a normal app
(a PWA). It learns her taste from titles she rates and suggests new ones,
each with a one-line reason why it matched.

## Technical map (for you, Claude — translate when discussing)

- **Frontend**: Vite + **React 18** in `src/` (`App.jsx`, `components/*.jsx`).
  Entry `index.html` → `src/main.jsx`.
- **Taste model**: `src/lib/axes.js` (10 hand-defined taste axes + negative
  flags + keyword→axis inference rules), `src/lib/scorer.js` (pure scoring:
  `computeWeights` from ratings, `scoreCandidate`, `whyLine`, hard content
  filter).
- **Data layer**: `src/lib/backend.js` — Supabase (auth + ratings) OR
  LocalBackend (localStorage key `plot_twist_v1`) when `?local=1` or Supabase
  env vars are missing. **Local and cloud data never merge.**
- **APIs**: `src/lib/api.js` → TMDB (films/series) and AniList (anime) via
  the Netlify function proxies in `netlify/functions/` (keeps the TMDB key
  secret). AniList has a direct fallback (no key needed).
- **Seed data**: `src/data/seed.json`, generated from her taste brief — see
  DEPLOYMENT.md §3 for the sync rules.
- **Deploy — TWO INDEPENDENT TARGETS, read DEPLOYMENT.md before ANY change**:
  - App → **GitHub Pages** (auto on push to `main` via
    `.github/workflows/deploy.yml`). Live: megzieberr.github.io/plot-twist
  - Functions → Netlify site `plot-twist-api`, **NOT git-connected**, manual
    CLI deploy only.
- **Dev**: `npm install`, copy `.env.example` → `.env`, `npm run dev` →
  port **5201** (a Vite middleware mirrors both Netlify functions locally).
- **Session hand-off**: PROJECT-STATUS.md — read it at session start, update
  it before ending a session that changed anything.

## Decision log — what was chosen and WHY (do not silently reverse these)

- **Hand-set, readable scorer instead of a black-box model.** Every
  recommendation must be able to explain itself (`whyLine`). The scorer is a
  pure function (`scoreCandidate(features, weights)`) precisely so the
  hand-set weights can later be swapped for logistic-regression weights
  without touching callers. Calibration lessons are baked in and documented
  in comments in `scorer.js` — Gone Girl (axis saturation via tanh),
  Edgerunners (genre overlap ≤ 0.12), Attack on Titan (slow_pacing penalty,
  >120-episode anime auto-flag), Demon Slayer (prestige_high_craft × 0.45).
  If you change scoring behaviour, keep those named lessons true.
- **`avoid` is NOT a taste signal.** It's a personal-reasons filter (e.g.
  Mr. Robot / addiction themes). Never let it influence weights; rated
  titles never reappear in Discover; `addiction_central > 0.5` is a hard
  exclude.
- **Find-then-write instead of `.upsert()` for ratings (2026-07-03).**
  Supabase upsert failed with error 42P10 on the partial unique index and
  ratings were LOST SILENTLY. Every save now surfaces errors in the toast.
  Do not reintroduce upsert; do not swallow write errors.
- **Discover waits for ratings to load before scoring.** There was a race
  where the deck rendered unpersonalized on cold start. Keep the ordering:
  ratings → weights → deck.
- **Generic keywords are deliberately weak.** "family" (0.15), "friendship"
  (0.12), bare "comedy" (0.25) — raising them makes every animated
  blockbuster top the deck. There's a reason each low number is low.
- **Two-target deploy is a known trap, not an accident** (Netlify site
  predates GitHub Pages). Function changes need BOTH a CLI deploy AND a git
  commit, or repo and production silently drift.

## Gotchas that already caused real bugs (check before planning)

1. Pushing to git does NOT update the Netlify functions (site not
   git-connected). DEPLOYMENT.md §2 has the exact commands.
2. `ALLOWED_ORIGINS` is hardcoded in BOTH `tmdb.mjs` and `anilist.mjs` — an
   app-URL change without updating both breaks the app with CORS errors.
3. Re-seeding is idempotent: it never updates already-rated titles. Verdict
   changes in the brief must also be changed in the app.
4. README says dev port 5199 — the real port is **5201** (`vite.config.js`).
   Trust the code over the README when they disagree.
5. `TMDB_API_KEY` exists only in the Netlify environment UI. Never in the
   repo, never in the workflow file, never in the bundle.
6. Local mode and Supabase mode are separate universes; test data rated in
   `?local=1` will not appear after login.

## How to plan any change here (walk this checklist, in order)

1. Read PROJECT-STATUS.md (current state) and DEPLOYMENT.md (which deploy
   target your change touches).
2. Say the plan to Megan in plain English first — what will change in HER
   app experience — and get a nod before large changes.
3. Locate the change: scoring behaviour → `scorer.js`/`axes.js` (respect the
   decision log above); data/saving → `backend.js` (errors must surface in
   the toast); external data → `api.js` + possibly the Netlify functions
   (two-target trap!); UI → `src/components/`.
4. Check both modes: does this behave correctly in local mode AND Supabase
   mode?
5. If `seed.json` or the taste brief is touched, re-sync per DEPLOYMENT.md §3.
6. Verify in the running app (`npm run dev`, port 5201), not only by reading
   code.
7. Update PROJECT-STATUS.md (and DEPLOYMENT.md if ops knowledge changed),
   commit with a message that states the WHY, push, confirm the right deploy
   target updated.
8. End with the plain-English "what changed and what you'll notice" summary.

## Working rules

- Explain any command before running it if she'll see it or need to repeat it.
- Never put secrets (API keys, Supabase keys) in committed files.
- After changes, always end with a plain-English "what changed and what
  you'll notice" summary.
