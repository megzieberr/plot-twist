import React, { useState, useMemo, useEffect } from 'react';
import TitleRow from './TitleRow.jsx';
import { scoreStoredTitle } from '../lib/scorer.js';
import { qualityMap, getCachedDetail } from '../lib/detailCache.js';
import { getDetails } from '../lib/api.js';
import { isLocalMode } from '../lib/backend.js';

const VERDICT_TABS = ['liked', 'watchlist', 'interested', 'meh', 'skipped', 'disliked', 'avoid'];
// Verdict tabs where match-based ordering is meaningful (unwatched taste signal).
const RANKABLE = new Set(['watchlist', 'interested']);
const SORT_KEY = 'pt_watchlist_sort';

export default function Collections({ media, ratedTitles, onPick, weights, likedGenres }) {
  const [verdict, setVerdict] = useState('liked');
  const [sort, setSort] = useState(() => localStorage.getItem(SORT_KEY) || 'best');
  const [genre, setGenre] = useState(null); // selected genre filter (watchlist only)
  const [tick, setTick] = useState(0); // bumps when background hydration caches new quality

  const rankable = RANKABLE.has(verdict);
  const showGenres = verdict === 'watchlist';

  useEffect(() => {
    localStorage.setItem(SORT_KEY, sort);
  }, [sort]);

  // Genre filter is per-(tab, section) — reset it when either changes.
  useEffect(() => {
    setGenre(null);
  }, [verdict, media]);

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

  // Filter -> sort. Best-match uses score (ties: newer first); Recent uses date.
  const items = useMemo(() => {
    let list = genre ? scored.filter((t) => (t.genres || []).includes(genre)) : scored;
    const byRecency = (a, b) => (b.rated_at || '').localeCompare(a.rated_at || '');
    if (rankable && sort === 'best') {
      list = [...list].sort((a, b) => b._score - a._score || byRecency(a, b));
    } else {
      list = [...list].sort(byRecency);
    }
    return list;
  }, [scored, genre, rankable, sort]);

  // Match % — min-max normalised within the *displayed* list, so it is honestly
  // relative (top of this list = 100%). All-equal or single item -> 100%.
  const matchPct = useMemo(() => {
    if (!rankable || items.length === 0) return null;
    const scores = items.map((t) => t._score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const map = new Map();
    for (const t of items) {
      map.set(t.id, max > min ? Math.round(((t._score - min) / (max - min)) * 100) : 100);
    }
    return map;
  }, [items, rankable]);

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
          onClick={() => onPick(t, { rank: rankable })}
        />
      ))}
    </div>
  );
}
