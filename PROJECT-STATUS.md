# Project status — updated 2026-07-12

## Where we are
Fully live (GitHub Pages app + Netlify `plot-twist-api` proxies, see DEPLOYMENT.md
before ANY change). Phases 1–4 of the watchlist upgrade shipped 2026-07-09/10:
Overview sheet, smart watchlist ordering + match chips + genre filter, and the
mood pad on both watchlist and Discover.
2026-07-11: mood pad v2 SHIPPED (commit 99e6ac6, Pages deploy verified live) —
visual redesign (quadrant colour washes, ghost dots, quadrant-tinted handle,
live readout), mood ranking rebuilt so the dot actually reorders (was: The
Dark Knight anchored #1 regardless), Discover deck diversified by genre
(was: wall-to-wall thriller/mystery).

## Mood pad v2 / ranking notes (2026-07-11)
- `moodFinals()` in mood.js is the one shared ranker (watchlist + Discover).
  Both taste and mood affinity are min-max normalised per displayed list; mood
  weight scales with dot distance from centre (0.35 → 0.85 at a corner).
- `titleMoodPos()` = 0.55 × taste-axis centre + 0.45 × genre-tone centre
  (GENRE_COORDS). Genre anchors warmth; axes alone put Comedy/Family titles in
  the mind-bender corner (The Sheep Detectives lesson).
- Discover deck: greedy genre-diversity pick (penalty 0.04 per repeat of a
  title's first two genres) instead of flat top-40. Dark-genre share of the
  deck measured 73% → 34%.
- Bare "Thriller" genre word no longer fires mystery_no_spoonfeed on its own
  (rule confidence 0.3 → 0.18, below the 0.25 axis threshold).

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
- 2026-07-11: mood must be able to WIN. Fixed 60/40 taste/mood with raw
  (unnormalised) affinity could never dethrone a strong-taste #1; now both
  signals normalise per list and dragging the dot further from centre gives
  mood more weight (up to 85/15). "Re-ranks, never hides" still holds.
- 2026-07-11: a title's mood position blends genre tone with taste axes —
  axes alone are structural and mis-place warm titles.
- 2026-07-11: Discover deck picks for genre diversity instead of flat top-40;
  the taste weights correlate with thriller/mystery, and a pure top-N was an
  echo chamber that filled the watchlist with thrillers.
- 2026-07-11: mood pad centre axis labels removed (they overlapped the dot);
  the four corner pills carry the meaning. Ghost dots show where the list's
  titles sit; handle glow blends toward the nearest corner's colour.

## Pending on Megan
Sanity-check mood pad v2 on the phone with real data: close and reopen the
PWA, drag the dot around the watchlist, and load a fresh Discover deck to
feel the new genre mix.

## Next up
**Implement PLAN-tonight-and-more-like-this.md** (approved by Megan 2026-07-12,
branch `claude/plot-twist-watchlist-ideas-te0xic`): a "Tonight" view (mood pad +
occasion chips → exactly 5 picks, all public-rated > 6/10, mix of watchlist +
new, rate-on-the-spot with hole-filling) and a "More like this" sheet (same
vibe / same genre / same director-or-creator). Division of labour agreed with
Megan: Opus writes the code from the plan, a separate session audits against
the plan's §9 checklist afterwards. Phase 0 of the plan touches the Netlify
proxy whitelist — two-target deploy trap applies; the deploy command will land
in "Pending on Megan" if the implementing session can't run it.

After that (unscheduled): Megan noticed 4.4/10 titles in Discover — consider
applying a public-rating floor to the Discover deck too (deliberately left out
of the plan's scope; her ask was Tonight-only).
