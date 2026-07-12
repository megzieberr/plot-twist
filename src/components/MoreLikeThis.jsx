import React, { useEffect, useMemo, useState } from 'react';
import RecCard from './RecCard.jsx';
import RateSheet from './RateSheet.jsx';
import {
  similarTmdb,
  sameGenreTmdb,
  peopleWorksTmdb,
  similarAnilist,
  sameGenreAnilist,
} from '../lib/api.js';
import { scoreCandidate, whyLine } from '../lib/scorer.js';
import { filterEligible } from '../lib/pool.js';
import { keyOf, normalize, axisSimilarity, sharedAxisKeys } from '../lib/tonight.js';
import { AXES } from '../lib/axes.js';

const QUALITY_GATE = 0.6; // public rating > 6/10, same promise as Tonight
const MAX_CARDS = 8;

// "More like this": similar titles to one she liked, in three lenses — Same
// vibe (storyline/feel), Same genre, Same director/creator. Same rules as
// Tonight: > 6/10, never something already rated, every card explains itself.
export default function MoreLikeThis({ item, ratedTitles, weights, likedGenres, onClose, onOpen, onRate }) {
  const isAnime = item.media_type === 'anime';
  const personLabel = item.media_type === 'movie' ? 'Same director' : 'Same creator';
  const TABS = useMemo(
    () => [
      { key: 'vibe', label: 'Same vibe' },
      { key: 'genre', label: 'Same genre' },
      ...(isAnime ? [] : [{ key: 'person', label: personLabel }]),
    ],
    [isAnime, personLabel]
  );

  const [tab, setTab] = useState('vibe');
  const [cache, setCache] = useState({}); // { tabKey: { loading?, err?, degraded?, flat?, sections? } }
  const [rateTarget, setRateTarget] = useState(null);
  const [rated, setRated] = useState(() => new Set()); // rated here -> disappears

  const gate = (c) => typeof c.quality === 'number' && c.quality > QUALITY_GATE;
  // Eligible = not already rated, not the source title itself, above 6/10.
  const eligible = (list) =>
    filterEligible(list, ratedTitles, item.media_type).filter(
      (c) => keyOf(c) !== keyOf(item) && gate(c)
    );

  async function buildTab(t) {
    if (t === 'vibe') {
      const raw = isAnime ? await similarAnilist(item.external_id) : await similarTmdb(item);
      const cands = eligible(raw);
      const nt = normalize(cands.map((c) => scoreCandidate(c, weights, likedGenres).score));
      const nq = normalize(cands.map((c) => c.quality ?? 0.5));
      const ranked = cands
        .map((c, i) => {
          const sim = axisSimilarity(item, c);
          return { ...c, rank: 0.5 * sim + 0.3 * nt[i] + 0.2 * nq[i], why: reasonVibe(c) };
        })
        .sort((a, b) => b.rank - a.rank)
        .slice(0, MAX_CARDS);
      return { flat: ranked };
    }
    if (t === 'genre') {
      const raw = isAnime ? await sameGenreAnilist(item.genres) : await sameGenreTmdb(item);
      const cands = eligible(raw).slice(0, MAX_CARDS).map((c) => ({ ...c, why: reasonGenre(c) }));
      return { flat: cands };
    }
    // person (movie/series only)
    const sections = await peopleWorksTmdb(item);
    const shaped = sections
      .map((s) => ({
        person: s.person,
        role: s.role,
        items: eligible(s.items)
          .slice(0, MAX_CARDS)
          .map((c) => ({ ...c, why: `${s.role} ${s.person}` })),
      }))
      .filter((s) => s.items.length);
    return { sections: shaped };
  }

  function reasonVibe(c) {
    const shared = sharedAxisKeys(item, c);
    if (shared.length) return `Shares: ${shared.slice(0, 3).map((k) => AXES[k]?.label || k).join(', ')}`;
    return whyLine(scoreCandidate(c, weights, likedGenres), c);
  }
  function reasonGenre(c) {
    const gs = (c.genres || []).slice(0, 2).join(' / ');
    return gs ? `Also ${gs}` : whyLine(scoreCandidate(c, weights, likedGenres), c);
  }

  useEffect(() => {
    let alive = true;
    if (cache[tab] && !cache[tab].err) return; // already loaded
    setCache((c) => ({ ...c, [tab]: { loading: true } }));
    buildTab(tab)
      .then((data) => alive && setCache((c) => ({ ...c, [tab]: data })))
      .catch((ex) => {
        const degraded = /not allowed|proxy|Netlify/i.test(ex?.message || '');
        alive && setCache((c) => ({ ...c, [tab]: { err: ex?.message || String(ex), degraded } }));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function onVerdict(verdict) {
    const it = rateTarget;
    setRateTarget(null);
    const res = await onRate(it, verdict);
    if (res) setRated((prev) => new Set(prev).add(keyOf(it))); // save ok — card leaves
  }

  const state = cache[tab] || { loading: true };
  const visible = (list) => (list || []).filter((c) => !rated.has(keyOf(c)));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet ov mlt" onClick={(e) => e.stopPropagation()}>
        <div className="mlt-head">
          <div style={{ minWidth: 0 }}>
            <div className="ov-label" style={{ margin: 0 }}>More like</div>
            <h2 className="ov-title">{item.title}</h2>
          </div>
          <button className="hdr-btn" onClick={onClose}>✕</button>
        </div>

        <div className="filter-row mlt-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`filter-chip ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {state.loading ? (
          <div className="spinner" />
        ) : state.err ? (
          <div className="empty">
            {state.degraded ? (
              <>
                This part needs the updated proxy.
                <br />
                <span className="hint">Run the Netlify deploy from DEPLOYMENT.md §2, then reopen.</span>
              </>
            ) : (
              <>
                Could not load these.
                <br />
                <span className="hint">{state.err}</span>
              </>
            )}
          </div>
        ) : state.sections ? (
          state.sections.length === 0 ? (
            <div className="empty">No matches above 6/10 yet.</div>
          ) : (
            state.sections.map((s) => {
              const items = visible(s.items);
              if (!items.length) return null;
              return (
                <div key={s.person} className="mlt-section">
                  <div className="section-label">{s.role} {s.person}</div>
                  <div className="mlt-list">
                    {items.map((c) => (
                      <RecCard
                        key={keyOf(c)}
                        item={c}
                        reason={c.why}
                        onOpen={() => onOpen(c)}
                        onSeen={() => setRateTarget(c)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )
        ) : visible(state.flat).length === 0 ? (
          <div className="empty">No matches above 6/10 yet.</div>
        ) : (
          <div className="mlt-list">
            {visible(state.flat).map((c) => (
              <RecCard
                key={keyOf(c)}
                item={c}
                reason={c.why}
                onOpen={() => onOpen(c)}
                onSeen={() => setRateTarget(c)}
              />
            ))}
          </div>
        )}

        {rateTarget && (
          <RateSheet item={rateTarget} onClose={() => setRateTarget(null)} onRate={onVerdict} />
        )}
      </div>
    </div>
  );
}
