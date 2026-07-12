import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RecCard from './RecCard.jsx';
import RateSheet from './RateSheet.jsx';
import MoodPad from './MoodPad.jsx';
import {
  discoverTmdb,
  discoverAnilist,
  enrichTmdb,
  discoverOccasionTmdb,
  resolveKeywordId,
  getDetails,
} from '../lib/api.js';
import { scoreCandidate, scoreStoredTitle, whyLine } from '../lib/scorer.js';
import { filterEligible, diversifyByGenre } from '../lib/pool.js';
import { titleMoodPos, moodFinals } from '../lib/mood.js';
import { qualityMap, getCachedDetail } from '../lib/detailCache.js';
import { isLocalMode } from '../lib/backend.js';
import { OCCASIONS } from '../lib/occasions.js';
import { keyOf, occasionRank, pickFive, tooSimilar } from '../lib/tonight.js';

// Judgment verdicts — a title with one of these has been "dealt with" and its
// replacement after a Seen-it should not feel like more of the same.
const NEGATIVE = new Set(['disliked', 'meh', 'skipped', 'avoid']);
// Public rating > 6/10 is the promise of this view (0.6 on the 0..1 quality).
const QUALITY_GATE = 0.6;

// Occasion-fresh pool. TMDB resolves keyword names -> ids (needs the widened
// proxy; falls back to genres); anime filters the popular pool client-side.
async function buildOccasionFresh(media, occ) {
  if (media === 'anime') {
    const pool = await discoverAnilist(3);
    return pool.filter((c) => occ.match(c));
  }
  const kwIds = [];
  for (const name of occ.tmdb.keywords || []) {
    const id = await resolveKeywordId(name);
    if (id) kwIds.push(id);
  }
  return discoverOccasionTmdb(media, {
    keywordIds: kwIds,
    genreNames: occ.tmdb.genres || [],
    sort: occ.tmdb.sort,
  });
}

// Tonight: exactly five picks, all rated above 6/10, mixing her watchlist with
// brand-new finds, shaped by the mood pad or an occasion chip. "Seen it" rates
// on the spot and swaps in a fresh pick.
export default function Tonight({ media, ready, ratedTitles, weights, likedGenres, onRate, onPick }) {
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodDot, setMoodDot] = useState(null);
  const [occasionKey, setOccasionKey] = useState(null);
  const [rawPool, setRawPool] = useState(null); // null = loading, [] = built-but-empty
  const [err, setErr] = useState('');
  const [note, setNote] = useState(''); // degraded-proxy note
  const [picks, setPicks] = useState([]);
  const [rateTarget, setRateTarget] = useState(null);
  const [pending, setPending] = useState(null); // refill request awaiting the post-rate weight refresh

  const shownRef = useRef(new Set()); // keys shown this session (never resurface)
  const excludeRef = useRef(new Set()); // keys rated inside Tonight this session

  const occasion = useMemo(() => OCCASIONS.find((o) => o.key === occasionKey) || null, [occasionKey]);
  const moodUsable = !occasion; // one mental model at a time: chip disables the pad
  const activeDot = moodUsable ? moodDot : null;

  // Chips offered on this tab (anime hides the movie-night occasions).
  const chips = useMemo(() => OCCASIONS.filter((o) => (media === 'anime' ? o.anime : true)), [media]);

  // Fresh media = fresh session: neutral mood, no chip, clear session memory.
  useEffect(() => {
    setMoodOpen(false);
    setMoodDot(null);
    setOccasionKey(null);
    shownRef.current = new Set();
    excludeRef.current = new Set();
  }, [media]);

  // ---- build the raw candidate pool for (media, occasion) ----
  const buildPool = useCallback(async () => {
    if (!ready) return; // ratings still loading — scoring now would be unpersonalised
    setRawPool(null);
    setErr('');
    setNote('');
    try {
      const occ = OCCASIONS.find((o) => o.key === occasionKey) || null;

      // Watchlist sub-pool: "want to watch" verdicts for this media with a known
      // public rating. (Titles with a judgment verdict — liked/disliked/meh/
      // skipped/avoid — are never here; those never reappear in Tonight.)
      const wl = ratedTitles.filter(
        (t) =>
          t.media_type === media &&
          (t.verdict === 'watchlist' || t.verdict === 'interested') &&
          t.external_id
      );
      // Warm the detail cache for the top contenders that lack a cached rating,
      // so the 6/10 gate has real numbers to judge. Unknown-after-fetch is
      // excluded — "above 6/10" is the promise, and "unknown" does not qualify.
      const qm0 = qualityMap();
      const need = wl
        .map((t) => ({ t, base: scoreStoredTitle(t, weights, likedGenres, qm0).score }))
        .sort((a, b) => b.base - a.base)
        .filter(({ t }) => typeof getCachedDetail(t)?.quality !== 'number')
        .slice(0, 12);
      if (!isLocalMode) await Promise.all(need.map(({ t }) => getDetails(t).catch(() => null)));

      const qm = qualityMap();
      let wlPool = wl
        .map((t) => {
          const q = qm[`${t.external_source}:${t.external_id}`];
          return { ...t, origin: 'watchlist', quality: typeof q === 'number' ? q : null };
        })
        .filter((c) => typeof c.quality === 'number');
      if (occ) wlPool = wlPool.filter((c) => occ.match(c));

      // Fresh sub-pool.
      let freshRaw = [];
      let occUnavailable = false;
      if (occ) {
        try {
          freshRaw = await buildOccasionFresh(media, occ);
        } catch (ex) {
          if (ex.code === 'OCCASION_UNAVAILABLE') occUnavailable = true;
          else throw ex;
        }
      } else {
        freshRaw = media === 'anime' ? await discoverAnilist(3) : await discoverTmdb(media, 4);
      }

      let freshPool = filterEligible(freshRaw, ratedTitles, media);
      if (media !== 'anime' && freshPool.length) {
        // Enrich the most promising slice with keywords (better axis inference),
        // exactly as Discover does.
        freshPool.sort(
          (a, b) =>
            scoreCandidate(b, weights, likedGenres).score - scoreCandidate(a, weights, likedGenres).score
        );
        const top = freshPool.slice(0, 40);
        const enriched = await Promise.all(top.map(enrichTmdb));
        freshPool = [...enriched, ...freshPool.slice(40)];
      }
      freshPool = freshPool.map((c) => ({ ...c, origin: 'fresh' }));

      // Quality gate on BOTH sub-pools — public rating strictly above 6/10.
      const gate = (c) => typeof c.quality === 'number' && c.quality > QUALITY_GATE;
      const pool = [...wlPool.filter(gate), ...freshPool.filter(gate)];

      if (occUnavailable) {
        setNote(
          `The “${occ.emoji} ${occ.label}” fresh picks need the updated proxy — run the Netlify deploy from DEPLOYMENT.md §2. Showing what matches from your watchlist for now.`
        );
      }
      setRawPool(pool);
    } catch (ex) {
      setErr(ex.message || String(ex));
      setRawPool([]);
    }
  }, [media, occasionKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    buildPool();
  }, [buildPool]);

  // Attach base score + why-line. Recomputes when weights change (after a rate).
  const scored = useMemo(() => {
    if (!rawPool) return null;
    const qm = qualityMap();
    return rawPool.map((c) => {
      const r =
        c.origin === 'watchlist'
          ? scoreStoredTitle(c, weights, likedGenres, qm)
          : scoreCandidate(c, weights, likedGenres);
      return { ...c, base: r.score, why: whyLine(r, c) };
    });
  }, [rawPool, weights, likedGenres]);

  // Fresh handle for the async handlers (they must not close over a stale pool).
  const scoredRef = useRef([]);
  scoredRef.current = scored || [];

  // Rank the whole pool: occasion = quality-led (taste tiebreak); else mood/taste
  // blend, then genre-diversify so five slots aren't five thrillers.
  const rankAll = useCallback(
    (list) => {
      if (!list || list.length === 0) return [];
      if (occasion) return occasionRank(list);
      let ranked;
      if (activeDot) {
        const finals = moodFinals(list, activeDot, (c) => c.base);
        ranked = list.map((c, i) => ({ ...c, rank: finals[i] })).sort((a, b) => b.rank - a.rank);
      } else {
        ranked = list.map((c) => ({ ...c, rank: c.base })).sort((a, b) => b.rank - a.rank);
      }
      return diversifyByGenre(ranked, ranked.length, 0.04, (x) => x.rank);
    },
    [occasion, activeDot]
  );

  const repick = useCallback(() => {
    setPicks(pickFive(rankAll(scoredRef.current), { shownKeys: shownRef.current }));
  }, [rankAll]);

  // Re-pick from scratch when the pool (re)loads or the mood/occasion changes.
  // Keyed on rawPool (not `scored`) so a post-rate weight refresh does NOT wipe
  // the current five — the hole-fill handles that single swap instead.
  useEffect(() => {
    if (scored) repick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPool, activeDot, occasionKey]);

  // Ghost dots on the pad — where this pool's titles sit in mood space.
  const moodPoints = useMemo(
    () => (moodUsable ? (scored || []).map(titleMoodPos).filter(Boolean) : []),
    [scored, moodUsable]
  );

  function showMore() {
    for (const p of picks) shownRef.current.add(keyOf(p));
    setPicks(pickFive(rankAll(scoredRef.current), { shownKeys: shownRef.current }));
  }

  async function onVerdict(verdict) {
    const item = rateTarget;
    setRateTarget(null);
    const res = await onRate(item, verdict); // the one and only rating write path
    if (!res) return; // save failed — App already toasted; keep the card
    const k = keyOf(item);
    shownRef.current.add(k);
    excludeRef.current.add(k);
    setPicks((cur) => cur.filter((p) => keyOf(p) !== k)); // drop the rated card now
    setPending({ after: item, negative: NEGATIVE.has(verdict), wBefore: weights });
  }

  // Hole-fill: after the rate lands and weights refresh, drop in one replacement.
  useEffect(() => {
    if (!pending) return;
    if (pending.wBefore === weights) return; // wait for the post-rate weight refresh
    const { after, negative } = pending;
    setPending(null);
    const ranked = rankAll(scoredRef.current);
    setPicks((cur) => {
      const taken = new Set(cur.map(keyOf));
      const cand = ranked.find((c) => {
        const k = keyOf(c);
        if (taken.has(k) || shownRef.current.has(k) || excludeRef.current.has(k)) return false;
        if (negative && tooSimilar(after, c)) return false; // don't refill with more of what she disliked
        return true;
      });
      if (!cand) return cur;
      shownRef.current.add(keyOf(cand));
      return [...cur, cand];
    });
  }, [weights, pending, rankAll]);

  const badgeFor = (p) =>
    occasion
      ? { label: `${occasion.emoji} ${occasion.label}`, cls: 'occ' }
      : p.origin === 'watchlist'
        ? { label: '🔖 From your watchlist', cls: 'wl' }
        : { label: '✨ New find', cls: 'fresh' };

  return (
    <div className="tonight">
      <div className="filter-row occasion-row">
        {chips.map((o) => (
          <button
            key={o.key}
            className={`filter-chip ${occasionKey === o.key ? 'active' : ''}`}
            onClick={() => setOccasionKey(occasionKey === o.key ? null : o.key)}
          >
            {o.emoji} {o.label}
          </button>
        ))}
      </div>

      <div className={occasion ? 'moodpad-disabled' : ''}>
        <MoodPad
          open={moodOpen}
          dot={activeDot}
          points={moodPoints}
          onToggle={() => !occasion && setMoodOpen((o) => !o)}
          onChange={(p) => !occasion && setMoodDot(p)}
          onReset={() => setMoodDot(null)}
        />
      </div>
      {occasion && (
        <div className="tonight-occ-note">
          {occasion.emoji} <strong>{occasion.label}</strong> — all rated above 6/10. The mood pad
          pauses while a chip is on.
        </div>
      )}

      {note && <div className="ov-note">{note}</div>}

      {rawPool === null ? (
        <div className="spinner" />
      ) : err ? (
        <div className="empty">
          Could not build Tonight.
          <br />
          <span className="hint">{err}</span>
          <div>
            <button className="btn ghost" style={{ marginTop: 14 }} onClick={buildPool}>
              Retry
            </button>
          </div>
        </div>
      ) : picks.length === 0 ? (
        <div className="empty">
          {rawPool.length === 0
            ? 'Nothing above 6/10 for this mood yet — try a different chip, nudge the mood dot, or rate a few more titles.'
            : 'That’s everything above 6/10 for this mood.'}
          <div>
            <button className="btn ghost" style={{ marginTop: 14 }} onClick={buildPool}>
              Reload
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="tonight-list">
            {picks.map((p) => (
              <RecCard
                key={keyOf(p)}
                item={p}
                reason={p.why}
                badge={badgeFor(p)}
                onOpen={() => onPick(p, { rank: p.origin === 'watchlist' })}
                onSeen={() => setRateTarget(p)}
              />
            ))}
          </div>
          <button className="btn ghost tonight-more" onClick={showMore}>
            None of these — show me 5 more
          </button>
        </>
      )}

      {rateTarget && (
        <RateSheet item={rateTarget} onClose={() => setRateTarget(null)} onRate={onVerdict} />
      )}
    </div>
  );
}
