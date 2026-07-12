# Build plan: "Tonight" view + "More like this"

**Status: approved by Megan 2026-07-12 — ready to implement.**

This plan was written by one Claude session (discussion + design with Megan), will be
**implemented by another session (Opus)**, and **audited afterwards** by a third pass.
Implementer: read `CLAUDE.md`, `PROJECT-STATUS.md`, and `DEPLOYMENT.md` in full before
touching anything. Everything in those files applies; this plan adds to them, never
overrides them.

---

## 1. What Megan asked for (product spec, in her words + agreed details)

### Feature A — "Tonight" view
> "The app looks at my loved and disliked lists, uses the databases we linked, gives me
> a moodpad to choose what I am in the mood for, then gives me 5 recommendations for
> movies or shows that match that. Only 5, not more. And those 5 have to be rated above
> a 6/10."

Agreed details:
1. The 5 picks come from a **mix of her watchlist and brand-new titles** (both, when
   both have eligible candidates).
2. **Occasion picks** must work even against her usual taste: *"if I pick something
   like 'christmas movie', something that I don't usually watch, I still want 5 great
   recommendations."* → occasion chips alongside the mood pad; when a chip is active,
   the occasion is a hard filter and public rating leads the ranking (taste is the
   tiebreak, never the gatekeeper).
3. **Rate-on-the-spot with hole-filling**: if one of the 5 is something she has already
   watched, she gives it a verdict right there; the card is replaced with a new pick.
   *"If I hated it, it shouldn't fill the hole with something similar."*
4. "Above 6/10" = the **public rating** from the databases (TMDB vote average / AniList
   average score / Kitsu average rating), strictly greater than 6.0 out of 10.
5. It lives in a new **Tonight** view (4th bottom-nav tab).

### Feature B — "More like this"
> "Pick a show or movie I liked and then the app recommends other movies and shows with
> a similar feel. Like let's say I liked Hannibal … categories like same director or
> same genre or same storyline."

Agreed details:
1. Entry point: a **"More like this" button on the Overview sheet** of any title.
2. Categories (tabs): **Same vibe** (storyline/feel — the default), **Same genre**,
   **Same director** (movies) / **Same creator** (series). She explicitly wants same
   director ("Curry Barker makes masterpieces").
3. Same rules as Tonight: public rating > 6/10, never something already rated, every
   card explains itself.

---

## 2. Non-negotiable guardrails (checked in the audit — violating any of these fails it)

1. **Every recommendation explains itself.** Each card in both features shows a
   `whyLine` (or an equivalent human-readable reason, e.g. shared-axes line in "Same
   vibe"). No unexplained cards.
2. **`avoid` is not a taste signal** and `addiction_central > 0.5` is a hard exclude
   (`isExcluded` in `scorer.js`). Both features must run every candidate through
   `isExcluded` and must exclude ALL rated titles (any verdict, including `avoid`) —
   reuse the key/name/sequel exclusion exactly as Discover does.
3. **No `.upsert()` for ratings, ever** (silent-loss bug 2026-07-03). All rating writes
   go through the existing `rate()` callback in `App.jsx` — do not build a second write
   path. `rate()` already surfaces failures in the toast and returns `null` on failure;
   the Tonight hole-fill must NOT remove a card when the save failed.
4. **Ratings → weights → deck ordering.** Tonight must not fetch/score until the
   `ready` (dataReady) prop is true, exactly like Discover.
5. **Do not change scoring behaviour** in `scorer.js` / `axes.js`. The named
   calibration lessons (Gone Girl, Edgerunners, Attack on Titan, Demon Slayer) and the
   deliberately-weak generic keywords stay true. The 6/10 gate is a FILTER in the new
   features, not a scorer change, and it must NOT be applied to the existing Discover
   deck (possible future change, explicitly out of scope here).
6. **"Re-ranks, never hides" still holds for the existing mood pad surfaces**
   (watchlist + Discover). Tonight is a NEW surface whose whole job is a shortlist —
   hiding is deliberate there, and that's the only place.
7. **The TMDB path whitelist lives in TWO places** and they must stay identical:
   `netlify/functions/tmdb.mjs` (`ALLOWED`) and the dev mirror in `vite.config.js`
   (`devApiPlugin` → `ALLOWED`). Any path added to one is added to the other in the
   same commit.
8. **Two-target deploy trap:** the Netlify site is NOT git-connected. The proxy change
   in Phase 0 needs BOTH a git commit AND a manual Netlify CLI deploy (DEPLOYMENT.md
   §2). This remote session likely cannot run the Netlify deploy (auth lives on
   Megan's machine) — see Phase 0 step 4 for how to hand that off cleanly.
9. **No secrets in the repo.** `TMDB_API_KEY` stays in the Netlify env UI / local
   `.env` only.
10. **Both modes:** everything must work in local mode (`?local=1`) and Supabase mode.
    No feature may assume one backend.

---

## 3. Phase 0 — expand the TMDB proxy whitelist (one Netlify deploy for the whole plan)

New TMDB paths needed by Phases 1–2. Add these three regexes to **both** whitelists
(guardrail 7):

```js
/^(movie|tv)\/\d+\/credits$/,                              // director lookup (movies)
/^person\/\d+\/(movie_credits|tv_credits|combined_credits)$/, // a person's filmography
/^search\/keyword$/,                                       // occasion keyword → TMDB keyword id
```

Steps:
1. Edit `netlify/functions/tmdb.mjs` AND `vite.config.js` (same commit).
2. Update DEPLOYMENT.md: §2 gains a note that the whitelist exists in both files and
   they must be edited together (new ops knowledge — belongs there, not just here).
3. Commit with a why-message; push.
4. **Netlify deploy hand-off:** attempt `npm run build` then
   `npx netlify-cli deploy --prod --dir dist` (per DEPLOYMENT.md §2). If this
   environment has no Netlify auth (expected), do NOT fake it or skip silently:
   add a "Pending on Megan" entry to PROJECT-STATUS.md with the exact command to run
   on her machine, and tell her in the end-of-session summary in plain English.
5. **Graceful degradation is mandatory:** until the deploy happens, the new paths
   return `400 path not allowed` from the live proxy. Every feature that uses a new
   path (same-director tab, occasion keyword resolution) must catch this and show a
   friendly message ("This part needs the updated proxy — run the Netlify deploy
   from DEPLOYMENT.md §2"), while everything that uses existing paths (the whole
   Tonight core, Same vibe, Same genre, Same creator for series) keeps working.

Note which new paths each feature needs — build so that only the dependent parts wait
for the deploy:
- Occasion chips: `search/keyword` (with a genre-only fallback per occasion, so most
  chips work even before the deploy).
- Same director (movies): `credits` + `person/…/movie_credits`.
- Same creator (series): NONE — `created_by` is already in the allowed `tv/{id}`
  detail response, and `person/…/tv_credits` is only needed to list the creator's
  other shows (degrade to `discover/tv` + `with_crew={personId}` — `discover/tv` is
  already allowed and passes arbitrary params — if that returns enough, you may not
  need `tv_credits` at all; implementer's choice, keep whichever is simpler and
  document it).

---

## 4. Phase 1 — the Tonight view

### 4.1 New/changed files

| File | Change |
|---|---|
| `src/lib/pool.js` (new) | Shared candidate-pool helpers extracted from `Discover.jsx`: `ratedKeySet`, `ratedNameSet`, `isSequelOf`, `diversifyByGenre`, and a combined `filterEligible(pool, ratedTitles, media)` that applies rated-key, rated-name, sequel, and `isExcluded` filters. Discover.jsx switches to importing these — pure refactor, zero behaviour change (audit will diff Discover's output logic). |
| `src/lib/occasions.js` (new) | The occasion definitions (see 4.4). |
| `src/lib/tonight.js` (new) | Pure pick logic: `pickFive(pool, opts)` — testable without React (see 4.5). |
| `src/components/Tonight.jsx` (new) | The view. |
| `src/App.jsx` | 4th nav tab `🌙 Tonight` (`mode === 'tonight'`), renders `<Tonight media={media} ready={dataReady} ratedTitles={ratedTitles} weights={weights} likedGenres={likedGenres} onRate={rate} onPick={openOverview} />`. |

### 4.2 Candidate pool (per media tab, like every other view)

Two sub-pools, built once per (media, occasion) and cached in component state:

- **Watchlist pool**: `ratedTitles` with verdict `watchlist` or `interested` for the
  current media. These are stored rows → score with `scoreStoredTitle`. Their public
  rating comes from the detail cache; for the top ~12 contenders without a cached
  rating, fetch `getDetails` concurrently (`Promise.all`, individual failures caught).
  **A watchlist item whose public rating is still unknown after that fetch attempt is
  excluded from Tonight** (the 6/10 promise is the feature; "unknown" doesn't qualify).
  This also means manual entries without an external id won't appear — acceptable.
- **Fresh pool**: `discoverTmdb(media, 4)` / `discoverAnilist(3)` (same as Discover),
  through `filterEligible`, keyword-enriched for the top slice exactly as Discover
  does (reuse, don't re-implement).

Both sub-pools then pass the **quality gate: `quality > 0.6`** (this is the stored
0–1 normalisation of the public rating: TMDB `vote_average/10`, AniList
`averageScore/100`, Kitsu `averageRating/100` — the gate is therefore source-uniform).

### 4.3 Ranking (no occasion chip)

1. Base score: `scoreCandidate` (fresh) / `scoreStoredTitle` (watchlist), with
   `weights` + `likedGenres` from props.
2. Mood dot set → blend with `moodFinals(list, dot, baseOf)` over the merged pool
   (one list, so normalisation is shared — do NOT normalise the two sub-pools
   separately or the blend is meaningless). Dot null/centred → base score only.
3. Genre-diversify the ranked pool with `diversifyByGenre` (penalty 0.04, same value
   as Discover) before taking picks, so 5 slots aren't 5 thrillers.

### 4.4 Occasion chips

A horizontally scrollable chip row above/beside the mood pad. One active at a time;
tap again to clear. **While a chip is active the mood pad is disabled/dimmed** (the
chip IS the mood — one mental model at a time).

`src/lib/occasions.js` exports an ordered list; starter set (easy to extend later):

```js
{ key, label, emoji,
  tmdb:    { keywords: ['christmas'], genres: [] },   // names, not ids — see resolution
  anilist: { tag: 'Christmas' } | null,               // null = chip hidden on anime tab
  match(title) {}                                     // client-side predicate for watchlist rows:
                                                      // keyword/genre text match, case-insensitive
}
```

Starter chips: 🎄 Christmas · 🎃 Spooky night (keyword `halloween` + genre horror) ·
🥰 Feel-good (genres comedy/romance/family) · 😭 Tearjerker (genre drama + keyword
`tearjerker`) · 💘 Date night (romance + comedy) · 🍿 Big-night blockbuster
(genres action/adventure, high popularity). For each, the implementer picks sensible
TMDB genre/keyword combos; keep the list SMALL and each chip's definition on one line.
Anime mappings: only add `anilist` where a genuinely matching AniList tag exists
(verify against the API, don't guess); chips without one are hidden on the anime tab.

**Keyword → id resolution:** TMDB `discover` takes `with_keywords=<id>`, not names.
Resolve at runtime via the Phase 0 path `search/keyword?query=<name>` (take the top
exact/first result), cache name→id in `localStorage` (`plot_twist_kw_ids`) so it's one
request ever per keyword. If resolution fails (proxy not yet deployed / no match),
fall back to the chip's genre filter alone; if the chip has neither, show the friendly
proxy message from Phase 0 step 5.

**Occasion pool + ranking:** fresh pool comes from occasion-specific
`discover/{movie|tv}` calls (`with_keywords`/`with_genres`, `vote_count.gte=100` —
lower floor than Discover's 200, occasion niches are small; 2 pages, sorted by
`vote_average.desc` and by `popularity.desc`, merged + deduped). Watchlist items join
via the chip's `match()` predicate. Then the standard eligibility filters + the 6/10
gate. Ranking flips to **occasion-first**: `0.6 × normalisedQuality + 0.4 ×
normalisedTasteScore` (min-max normalised within the pool, same style as
`moodFinals`). Taste is a tiebreak here by design — this is the "Christmas movies
despite my profile" requirement. Hard excludes (rated / avoid / `isExcluded`) still
apply unconditionally.

For anime occasions, filter `discoverAnilist` results by tag name client-side (tags
are already in `keywords`), or use an AniList GraphQL tag query — implementer's
choice; the proxy passes any GraphQL through.

### 4.5 Picking exactly 5 (`pickFive` in `src/lib/tonight.js` — pure, unit-testable)

```
pickFive(rankedPool, { shownKeys, mixTarget })
```
- Walk the (already ranked + diversified) pool top-down, skipping anything in
  `shownKeys` (this session's already-shown cards).
- **Mix rule:** if both sub-pools have eligible candidates, the 5 must contain at
  least 1 watchlist item AND at least 2 fresh items. Enforce by swap: take the top 5,
  then if a source is missing/short, replace the lowest-ranked pick(s) of the
  over-represented source with the best available of the missing one. If a sub-pool
  is empty or runs dry, fill entirely from the other — never return fewer than 5
  while the pool has eligible items.
- Tag each pick `origin: 'watchlist' | 'fresh'` for the card badge.

### 4.6 The cards + interactions

Five compact cards in a vertical list (NOT a swipe deck — this is a shortlist to read,
not triage). Each card shows: poster, title, year, genres, **public rating badge**
(e.g. `★ 7.8` — from `quality × 10`, one decimal), the `whyLine`, and an origin badge
("🔖 From your watchlist" / "✨ New find"). Card actions:

- Tap card → `openOverview(item)` (existing Overview sheet).
- **"Seen it"** → opens the existing `RateSheet` for that item (reuse the component
  and the App-level `rate()`; in Tonight, render RateSheet locally or lift via a
  callback — implementer's choice, but ONE rating path, guardrail 3).
- Below the 5: **"None of these — show me 5 more"** → adds current picks to
  `shownKeys`, re-picks. Pool exhausted → friendly empty state ("That's everything
  above 6/10 for this mood — try nudging the dot") + a reload option.

**Hole-filling after "Seen it":**
1. `await onRate(item, verdict)` — if it returned `null` (save failed), keep the card
   and stop (the toast already told her).
2. On success: add the rated key to `shownKeys` and local exclusions, remove the card.
3. Weights arrive updated via props (App reloads after every rate) — re-rank the
   remaining pool with the new weights automatically (`useMemo` on `weights`).
4. Pick 1 replacement with `pickFive`'s walker (respecting the mix rule loosely — a
   single refill just takes the best eligible).
5. **Negative-verdict guard** (`disliked`, `meh`, `skipped`, `avoid`): the replacement
   must not be similar to the just-rated title. Add `tooSimilar(a, b)` to
   `src/lib/tonight.js`:
   - shares ≥ 2 taste axes with it, OR
   - same primary genre (first listed) AND mood-space distance
     (`titleMoodPos`) < 0.35.
   Skip candidates failing this for THIS refill only (they stay in the pool for later
   re-picks — one bad Christmas movie doesn't ban all of Christmas; the axis weights
   updating from the rating is the lasting effect). Thresholds are starting points —
   comment them as tunable, like the diversity penalty.

### 4.7 Loading/error states

Mirror Discover's patterns: spinner while `ready` is false or pool loading; error box
with the caught message + Retry. All new fetch failures show real messages — never
swallow (guardrail 3 spirit).

---

## 5. Phase 2 — "More like this"

### 5.1 Entry + shell

- `OverviewSheet.jsx`: add a "🧬 More like this" button (next to the rate button).
- New `src/components/MoreLikeThis.jsx`, rendered from `App.jsx` as a sheet/full view
  over state `mlt: { item }` (same pattern as `overview`).
- Tabs across the top; content = up to **8 cards** per tab, same card layout as
  Tonight (poster, rating badge, reason line), actions: tap → Overview sheet,
  "Seen it" → RateSheet (rated cards just disappear from the list — no hole-filling
  needed here). All tabs: `filterEligible` + exclude the source title itself +
  quality gate > 0.6.

### 5.2 Tabs

**Same vibe (default).**
- TMDB titles: fetch `{movie|tv}/{id}/recommendations` AND `/similar` (1 page each —
  both paths already allowed), merge + dedup, `normalizeTmdb` (fetch the genre map via
  the existing cached `tmdbGenres`), `enrichTmdb` the survivors (axes need keywords).
- Anime: AniList GraphQL — `Media(id:$id){ recommendations(perPage:20, sort:RATING_DESC)
  { nodes { mediaRecommendation { …ANI_FIELDS } } } }` → `normalizeAnilist`. (No proxy
  change needed; passthrough.) If AniList is down, show its error — Kitsu has no good
  equivalent; don't fake one.
- Ranking: `0.5 × axisSimilarity(source, candidate) + 0.3 × normalisedTasteScore +
  0.2 × normalisedQuality`, where `axisSimilarity` = Jaccard overlap of the two axis
  sets (stored rows have axes as arrays; candidates as objects — normalise with the
  same `arr()` trick `scoreStoredTitle` uses).
- Reason line: name the overlap — `Shares: Unreliable narrator, Deep villain` using
  `AXES[key].label`, falling back to `whyLine` when there's no axis overlap.
  (Explainability is guardrail 1 — this line is the feature.)

**Same genre.**
- `discover/{movie|tv}` with `with_genres=<ids of the source's genres>`,
  `sort_by=vote_average.desc`, `vote_count.gte=300`, 2 pages. Genre names → ids by
  inverting the `tmdbGenres` map. Anime: AniList genre query (`genre_in`) sorted by
  score. Reason line: `Also <Genre1> / <Genre2>` + whyLine if axes fired.

**Same director (movies) / Same creator (series).**
- Movie: `movie/{id}/credits` → crew entries with `job === 'Director'` (may be
  several) → for each, their directed films via `person/{personId}/movie_credits`
  (crew, job Director). Section per director if more than one, header = director's
  name. Reason line: `Directed by <Name>`.
- Series: `created_by` from the `tv/{id}` detail (already-allowed path) → the
  creator's other shows (see Phase 0 note for the two implementation options).
  Reason line: `Created by <Name>`. Tab label switches on media type.
- Anime: hide this tab (same-studio is the real analog — noted as a future idea,
  out of scope).
- These are the only parts needing Phase 0's deploy — apply the graceful-degradation
  message if the proxy 400s.

---

## 6. Verification (do this, not just code-reading)

Run `npm run dev` → **port 5201** (README's 5199 is wrong; trust `vite.config.js`).
NOTE: local `.env` has no `TMDB_API_KEY`; TMDB calls go to the DEPLOYED proxy via
`VITE_API_BASE` — so new-path features stay in their degraded state until Megan's
Netlify deploy, and that degraded state is itself a thing to verify.

In **both** `?local=1` and Supabase mode (guardrail 10; in local mode, seed via
Settings first so weights exist):

1. Tonight tab appears; loads only after ratings load; shows exactly 5 cards; every
   card's public rating badge is > 6.0; mix of origin badges when the watchlist has
   eligible items; every card has a why-line.
2. Drag the mood dot to a corner → "Show me 5" produces a visibly different, mood-true
   five. Dead centre → taste-driven five.
3. Tap a chip (one that works genre-only, e.g. Feel-good) → 5 on-occasion picks even
   though her taste profile is dark (the Christmas requirement) — all > 6/10.
4. "Seen it" → rate `liked` → card replaced, toast shown, new card obeys all gates.
   Rate `disliked` → replacement is not same-primary-genre/nearby-mood (spot-check
   `tooSimilar` with a unit test too — it's pure).
5. Kill the network (devtools offline) → rate from Tonight → card STAYS, toast shows
   the failure (guardrail 3).
6. "None of these" twice → 10 distinct new picks, no repeats within the session.
7. More like this from a rated series (e.g. Hannibal if seeded): Same vibe cards with
   shared-axes reasons; Same creator resolves via `created_by`; Same genre list is
   high-rated. Movies: Same director degraded-message until deploy, correct after.
8. Discover + watchlist behave EXACTLY as before (the pool.js refactor changed
   nothing; mood pad there still re-ranks-never-hides, no 6/10 gate appeared).
9. Anime tab: Tonight works off AniList/Kitsu pools; hidden chips/tabs are hidden.

Unit tests: if the repo has no test runner, don't add one for this — verify the pure
functions (`pickFive`, `tooSimilar`, occasion ranking) with a quick node script run
ad-hoc and delete it, or inline assertions during dev. Do not install new
dependencies for this plan; none are needed.

---

## 7. Documentation + hand-off duties (same session as the code)

1. `PROJECT-STATUS.md`: what shipped, what's pending on Megan (the Netlify deploy
   command verbatim, if not run), tunable knobs added (similarity thresholds,
   occasion ranking split, vote-count floors).
2. `DEPLOYMENT.md`: the two-place whitelist note (Phase 0 step 2).
3. Commit messages state the WHY (see repo history for tone). Push to the designated
   branch only.
4. End-of-session summary to Megan in plain English: what changed, what she'll notice
   in the app, and exactly what she must run on her machine (the Netlify command),
   per CLAUDE.md's communication rules.

## 8. Explicitly out of scope (do not do these, even if tempting)

- Applying the 6/10 gate to the existing Discover deck (Megan noticed 4.4/10 cards
  there; a possible follow-up, but she asked for it on Tonight's five only).
- Any change to scorer weights/lessons, seed data, or the mood-pad maths.
- Same-studio for anime; "surprise me" randomiser; trailer embeds.
- New npm dependencies.

## 9. Audit checklist (for the reviewing session — how this work gets judged)

- [ ] Every guardrail in §2, individually verified against the diff.
- [ ] `pool.js` refactor left Discover byte-for-byte behaviour-identical.
- [ ] Quality gate is `> 0.6` on the normalised 0–1 quality across all three sources,
      and unknown-rating watchlist items are excluded from Tonight.
- [ ] Mix rule, hole-fill, negative-verdict `tooSimilar` guard match §4.5–4.6.
- [ ] Occasion mode: hard filter + quality-led ranking; taste never vetoes an
      on-occasion, well-rated pick; mood pad disabled while a chip is active.
- [ ] The two TMDB whitelists are identical; DEPLOYMENT.md documents the trap.
- [ ] Graceful degradation messages for undeployed proxy paths.
- [ ] Rated titles (all verdicts) can never appear in Tonight or More-like-this.
- [ ] No new rating write path; failed saves keep the card and show the toast.
- [ ] PROJECT-STATUS.md / DEPLOYMENT.md updated; no secrets anywhere in the diff.
