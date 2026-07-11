import React, { useState, useMemo, useEffect } from 'react';
import TitleRow from './TitleRow.jsx';
import MoodPad from './MoodPad.jsx';
import { scoreStoredTitle } from '../lib/scorer.js';
import { qualityMap, getCachedDetail } from '../lib/detailCache.js';
import { getDetails } from '../lib/api.js';
import { isLocalMode } from '../lib/backend.js';
import { titleMoodPos, moodFinals } from '../lib/mood.js';

const VERDICT_TABS = ['liked', 'watchlist', 'interested', 'meh', 'skipped', 'disliked', 'avoid'];
// Verdict tabs where match-based ordering is meaningful (unwatched taste signal).
const RANKABLE = new Set(['watchlist', 'interested']);
const SORT_KEY = 'pt_watchlist_sort';

export default function Collections({ media, ratedTitles, onPick, weights, likedGenres }) {
  const [verdict, setVerdict] = useState('liked');
  const [sort, setSort] = useState(() => localStorage.getItem(SORT_KEY) || 'best');
  const [genre, setGenre] = useState(null); // selected genre filter (watchlist only)
  const [tick, setTick] = useState(0); // bumps when background hydration caches new quality
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodDot, setMoodDot] = useState(null); // null = neutral / inactive

  const rankable = RANKABLE.has(verdict);
  const showGenres = verdict === 'watchlist';
  const moodActive = showGenres && moodDot != null;

  useEffect(() => {
    localStorage.setItem(SORT_KEY, sort);
  }, [sort]);

  // Genre filter is per-(tab, section) — reset it when either changes.
  useEffect(() => {
    setGenre(null);
  }, [verdict, media]);

  // Start each section collapsed + neutral: yesterday's mood must not silently
  // shape a different list.
  useEffect(() => {
    setMoodOpen(false);
    setMoodDot(null);
  }, [media]);

  const counts = useMemo(() => {
    const c = {};
    for (const t of ratedTitles) {
      if (t.media_type !== media) continue;
      c[t.verdict] = (c[t.verdict] || 0) + 1;
    }
    return c;
  }, [ratedTitles, media]);

  // Everything in this section, before the genre filter — score attached.
  const scored = useMemo(() => {
    const qm = qualityMap(); // tick keeps this fresh after hydration
    return ratedTitles
      .filter((t) => t.media_type === media && t.verdict === verdict)
      .map((t) => ({ ...t, _score: scoreStoredTitle(t, weights, likedGenres, qm).score }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratedTitles, media, verdict, weights, likedGenres, tick]);

  // Genre chips: genres actually present in this section, with counts.
  const genreChips = useMemo(() => {
    if (!showGenres) return [];
    const c = {};
    for (const t of scored) for (const g of t.genres || []) c[g] = (c[g] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [scored, showGenres]);

  // Filter -> (optionally blend mood) -> sort, and derive the match %. Match %
  // is min-max normalised within the *displayed* list, so it is honestly
  // relative (top of this list = 100%). All-equal / single item -> 100%.
  const { items, matchPct } = useMemo(() => {
    const list = genre ? scored.filter((t) => (t.genres || []).includes(genre)) : scored;
    const byRecency = (a, b) => (b.rated_at || '').localeCompare(a.rated_at || '');
    if (list.length === 0) return { items: [], matchPct: null };

    // Normalise base match score across this filtered list (0..1).
    const scores = list.map((t) => t._score);
    const sMin = Math.min(...scores);
    const sMax = Math.max(...scores);
    const normBase = (s) => (sMax > sMin ? (s - sMin) / (sMax - sMin) : 1);

    const finals = moodActive ? moodFinals(list, moodDot, (t) => t._score) : null;
    const ranked = list.map((t, i) => ({ t, final: finals ? finals[i] : normBase(t._score) }));

    if (moodActive) {
      ranked.sort((a, b) => b.final - a.final || byRecency(a.t, b.t));
    } else if (rankable && sort === 'best') {
      ranked.sort((a, b) => b.t._score - a.t._score || byRecency(a.t, b.t));
    } else {
      ranked.sort((a, b) => byRecency(a.t, b.t));
    }

    const outItems = ranked.map((r) => r.t);

    let map = null;
    if (moodActive) {
      const fs = ranked.map((r) => r.final);
      const fMin = Math.min(...fs);
      const fMax = Math.max(...fs);
      map = new Map(
        ranked.map((r) => [r.t.id, fMax > fMin ? Math.round(((r.final - fMin) / (fMax - fMin)) * 100) : 100])
      );
    } else if (rankable) {
      map = new Map(
        outItems.map((t) => [t.id, sMax > sMin ? Math.round(((t._score - sMin) / (sMax - sMin)) * 100) : 100])
      );
    }
    return { items: outItems, matchPct: map };
  }, [scored, genre, rankable, sort, moodActive, moodDot]);

  // Where the displayed titles sit in mood space — ghost dots on the pad.
  const moodPoints = useMemo(
    () => (showGenres ? items.map(titleMoodPos).filter(Boolean) : []),
    [items, showGenres]
  );

  // Quietly warm the detail cache for the top of the watchlist so match scores
  // pick up real vote averages without her opening each title. Skip in local
  // mode (offline dev). Sequential + throttled so it never floods the proxy.
  useEffect(() => {
    if (verdict !== 'watchlist' || isLocalMode) return;
    let cancelled = false;
    const targets = scored.filter((t) => t.external_id && !getCachedDetail(t)).slice(0, 10);
    (async () => {
      for (const t of targets) {
        if (cancelled) break;
        try {
          await getDetails(t);
        } catch {
          // hydration is best-effort
        }
        if (cancelled) break;
        await new Promise((r) => setTimeout(r, 250));
        if (!cancelled) setTick((x) => x + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict, media]);

  return (
    <div>
      <div className="filter-row">
        {VERDICT_TABS.map((v) => (
          <button
            key={v}
            className={`filter-chip ${verdict === v ? 'active' : ''}`}
            onClick={() => setVerdict(v)}
          >
            {v} {counts[v] ? `· ${counts[v]}` : ''}
          </button>
        ))}
      </div>

      {showGenres && (
        <MoodPad
          open={moodOpen}
          dot={moodDot}
          points={moodPoints}
          onToggle={() => setMoodOpen((o) => !o)}
          onChange={setMoodDot}
          onReset={() => setMoodDot(null)}
        />
      )}

      {rankable && (
        <div className="sort-row">
          <button
            className={`sort-toggle ${sort === 'best' ? 'active' : ''}`}
            onClick={() => setSort('best')}
          >
            ✨ Best match
          </button>
          <button
            className={`sort-toggle ${sort === 'recent' ? 'active' : ''}`}
            onClick={() => setSort('recent')}
          >
            🕐 Recent
          </button>
        </div>
      )}

      {showGenres && genreChips.length > 0 && (
        <div className="filter-row genre-row">
          <button
            className={`filter-chip ${genre == null ? 'active' : ''}`}
            onClick={() => setGenre(null)}
          >
            All · {scored.length}
          </button>
          {genreChips.map(([g, n]) => (
            <button
              key={g}
              className={`filter-chip ${genre === g ? 'active' : ''}`}
              onClick={() => setGenre(genre === g ? null : g)}
            >
              {g} {n}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="empty">Nothing in “{verdict}” for this section yet.</div>
      )}
      {items.map((t) => (
        <TitleRow
          key={t.id}
          item={t}
          match={matchPct ? matchPct.get(t.id) : null}
          matchLabel={moodActive ? 'mood match' : 'match'}
          onClick={() => onPick(t, { rank: rankable })}
        />
      ))}
    </div>
  );
}
