# Plot Twist — Watchlist Upgrade Plan

*Planned by Fable 5, 2026-07-10. For an Opus/Sonnet build session. Three features, three phases,
each independently shippable. No Supabase schema change required (v1).*

## What Megan asked for

1. **Overview window** when tapping a title in her watchlist: public rating, reviews,
   release date, plot description. (Her list is long; she can't tell where to begin.)
2. **Smart ordering** — highest-recommended at the top of the watchlist.
3. **Mood picker** — she floated two shapes: genre grouping ("mood board") OR a draggable-dot
   2D pad ("what am I in the mood for"). Build the **genre chips (cheap) in Phase 2** and the
   **mood pad (signature feature) in Phase 3**. The correct name for the dot thing is a
   *mood pad / XY pad* — use "Mood pad" in the UI.

## Current-code facts the builder needs (verified 2026-07-10)

- Tapping a `TitleRow` in Library/Collections calls `onPick` → opens **RateSheet** directly
  (`App.jsx` `setRateTarget`). There is no detail view anywhere.
- Stored title rows have: `title, year, poster_url, overview (truncated ~400 chars), genres,
  keywords, axes (ARRAY of keys), flags (ARRAY)`. They do **NOT** have `quality`
  (vote average), `vote_count`, or a full release date — `upsertTitle` in `App.jsx` drops them.
- `scoreCandidate(candidate, weights, likedGenres)` in `src/lib/scorer.js` expects
  `axes`/`flags` as **objects `{key: confidence}`** — stored rows have arrays. Feeding an array
  will silently produce garbage (Object.entries → indexes). An adapter is mandatory.
- `computeWeights(ratedTitles)` + `likedGenreSet(...)` are already computed in `App.jsx` and
  passed to Discover — reuse them, don't recompute.
- `whyLine(result, candidate)` exists — the "why this ranks here" one-liner. Use it in the sheet.
- API layer (`src/lib/api.js`): TMDB goes through the `/api/tmdb?path=...` proxy
  (Netlify functions-only site `plot-twist-api`, mirrored by vite dev middleware); AniList
  direct-fallback; Kitsu as anime fallback. `enrichTmdb` shows the pattern for a follow-up
  fetch on one candidate.
- ⚠️ **Check the Netlify `tmdb` function before building**: if it whitelists `path` values, the
  new `movie/{id}` detail + `{id}/reviews` calls may be blocked → function tweak + redeploy via
  `npx netlify-cli deploy --prod` (site is NOT git-connected; see memory `plot-twist-recommender`).
- Manual titles (`external_source: 'manual'`, no `external_id`) exist — every feature must
  degrade gracefully for them.

---

## Phase 1 — Title Overview Sheet

**New component `src/components/OverviewSheet.jsx`** (bottom sheet, same overlay pattern as
RateSheet). Opens on tap from **Collections and Library** (`onPick` → overview). Discover swipe
flow unchanged. RateSheet is reached from a button **inside** the sheet.

### Layout (top → bottom)
1. Poster (larger) + title + year + media-type/genre line.
2. **Fact row of chips:** ⭐ public rating (e.g. "7.9 · 12k votes") · 📅 release date ·
   ⏱ runtime/episodes · verdict pill if rated.
3. **Plot** — full overview (fetched fresh; the stored one is truncated to 400 chars).
4. **Why it ranks** — `whyLine()` + matched-axis chips (only when opened from the watchlist tab;
   this is the app's soul, keep it).
5. **Reviews** — top 3 excerpts (~200 chars each, author + their score if present), plus a
   "More on TMDB/AniList ↗" link to the title's public page.
6. **Actions:** `Rate / change verdict` (opens RateSheet with the same item) · close.

### Data fetching — new `getDetails(item)` in `src/lib/api.js`
- **TMDB** (`movie`/`series`): `GET {type}/{id}` (vote_average, vote_count, release_date/
  first_air_date, runtime/episodes, full overview) + `GET {type}/{id}/reviews`. Two proxy calls.
- **AniList**: one GraphQL query — `averageScore, popularity, episodes, duration, startDate,
  description, reviews(sort: RATING_DESC, perPage: 3) { nodes { summary rating score } }`.
- **Kitsu-sourced rows**: fetch the anime detail from Kitsu; show "reviews unavailable".
- **Manual rows**: no fetch — render stored fields, show a subtle "manual entry — no live data".
- **Proxy unreachable** (Pages + Netlify down): catch, render stored data + one-line notice.
  Never a blank sheet.

### Detail cache (this powers Phase 2 too)
`src/lib/detailCache.js`: localStorage map `pt_detail_cache_v1`, keyed `` `${external_source}:${external_id}` ``,
value `{ quality, vote_count, release_date, runtime, fetched_at }`. TTL ~30 days.
`getDetails()` writes it on every successful fetch. Cap ~300 entries (evict oldest) so it
can't grow unbounded.

---

## Phase 2 — Smart watchlist ordering + genre chips

All inside `Collections.jsx` (+ one helper in `scorer.js`).

### `scoreStoredTitle(t, weights, likedGenres, detailCache)` (new, in scorer.js)
Adapter over `scoreCandidate`:
- `axes` array → `{key: 0.7}` (flat confidence — stored rows lost the original confidences);
  same for `flags`.
- `quality`: from detail cache when present, else omit (scoreCandidate defaults 0.5).
- Returns the same `{score, contributions, flagNotes}` shape so `whyLine` works.

### Sorting UI
- When the **watchlist** tab is active (and it's worth also enabling for **interested**):
  a small sort toggle top-right — **`✨ Best match` (default) / `🕐 Recent`**.
  Other verdict tabs keep the current recency sort, no toggle.
- Each row gets a **match chip** (e.g. "92%"). Computed by min-max normalising scores *within
  the current list* — honest about being relative, avoids false precision. Ties → newer first.
- Persist the chosen sort in localStorage.

### Genre chips (her "mood board" — the cheap version)
- Above the list (watchlist tab only): horizontally scrollable chips built from the genres
  actually present in the current watchlist, with counts — `All · Thriller 6 · Mystery 4 · …`.
  Single-select filter. This reuses the existing `.filter-row` chip styling.

### Optional polish (builder's call, keep small)
Background hydration: when the watchlist tab opens, quietly `getDetails()` the first ~10
uncached items (sequential, throttled ~250ms) so match scores pick up real quality values
without her opening each title. Skip on `?local=1`.

---

## Phase 3 — Mood pad 🌀

**New component `src/components/MoodPad.jsx`**, rendered collapsed at the top of the watchlist
tab: a header row `🎭 What are you in the mood for? ▾`. Expanding reveals a square pad
(~min(80vw, 300px)) with a draggable neon dot. **The pad re-ranks, it never hides** — worst
mood-fit sinks to the bottom but stays visible.

### Mood space (2 axes, corner-labelled)
- **X:** Cozy ⟵⟶ Dark/Intense  **Y:** Easy watch ⟵⟶ Mind-bending
- Corner labels: BL "🍿 Cozy & easy" · BR "🔪 Dark & gripping" · TL "✨ Clever comfort" ·
  TR "🌀 Full mind-bender".

### Axis → mood-space coordinates (starting values, in `src/lib/mood.js`; tune by feel)
| taste axis | x | y |
|---|---|---|
| comfort_nostalgia | −0.9 | −0.5 |
| natural_humour | −0.7 | −0.6 |
| transformation_arc | −0.2 | +0.1 |
| prestige_high_craft | 0.0 | +0.3 |
| deep_villain | +0.6 | +0.4 |
| survival_dystopia | +0.8 | 0.0 |
| mystery_no_spoonfeed | +0.3 | +0.8 |
| unreliable_narrator | +0.4 | +0.9 |
| recontextualising_twist | +0.3 | +0.95 |
| unexplained_no_resolution | +0.5 | +0.85 |

### Maths (all in `mood.js`, pure functions — testable)
- Title mood position = mean of its axes' coordinates (flat weights; stored axes are arrays).
  Titles with **no mapped axes** get affinity 0.5 (neutral) — never punished to the bottom
  for missing data.
- `affinity = 1 − distance(dot, titlePos) / (2·√2)` → 0..1.
- Final order while pad is active: `0.6 × normalizedBaseScore + 0.4 × affinity`.
  Pad collapsed / dot untouched → pure Phase-2 order. A `Reset` link clears the dot.
- Remember last dot position in localStorage, but **start sessions collapsed+neutral** —
  yesterday's mood must not silently shape today's list.
- Match chip while active: relabel to "mood match" so the % change isn't confusing.

### Interaction notes
- Pointer events (`pointerdown/move/up` + `setPointerCapture`) — it must feel good on the
  phone, which is where she'll use it. `touch-action: none` on the pad only.
- Dot styling: cyan glow consistent with the midnight-cinema theme; light haptic
  (`navigator.vibrate?.(5)`) on drag end is a nice touch, guarded.

---

## Explicitly out of scope (v1)
- No Supabase schema change (quality lives in the localStorage cache). *Optional later:*
  migration adding `titles.quality numeric` + persisting it at rate time — only if the cache
  proves annoying across devices.
- No changes to Discover, the scorer weights, or Netlify functions (unless the tmdb function's
  path whitelist blocks detail/review paths — see Current-code facts).
- No notifications, no watch-providers ("where to stream") — could be a later ask; TMDB has
  `watch/providers` if she ever wants it.
- ~~Mood pad on Discover~~ — Megan wants this too (2026-07-10). Build it as **Phase 4**, after
  the watchlist pad works: reuse `mood.js` + `MoodPad.jsx`, blend affinity into the Discover
  deck's candidate ordering the same 0.6/0.4 way. Small, but keep it a separate commit.

## Verification (builder: run before shipping)
1. `preview_start` name `plot-twist` (port 5201) with `?local=1`, seed from Settings.
2. Overview sheet: TMDB title (live fetch), AniList title, **manual title** (no fetch, no error),
   proxy-down path (dev: kill middleware / bad API_BASE → stored-data fallback renders).
3. Watchlist sort: Best match vs Recent toggle; match chips monotonic with score; other verdict
   tabs unaffected; genre chips filter and counts correct.
4. Mood pad: drag to each corner → order shifts sensibly (BL surfaces comfort titles, TR
   surfaces twist-heavy ones); reset restores Phase-2 order; collapsed by default on reload.
5. Rate flow still works from inside the sheet (verdict change + undo toast).
6. Mobile pass: pad draggable on a phone-width viewport (`preview_resize` mobile), sheet scrolls,
   no horizontal overflow.
7. Deploy = push to main (Pages workflow). Netlify redeploy ONLY if the tmdb function changed.

## Open questions — ANSWERED by Megan 2026-07-10 ("I want them all")
1. Overview sheet on tap **everywhere** (all collections tabs + library). ✔
2. **Show the match %** chip. ✔
3. **Mood pad on Discover too** → build as Phase 4 (see out-of-scope note above). ✔

Build all phases, in order (1 → 2 → 3 → 4), committing per phase.
