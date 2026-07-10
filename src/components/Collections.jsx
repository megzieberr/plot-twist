import React, { useState, useMemo } from 'react';
import TitleRow from './TitleRow.jsx';

const VERDICT_TABS = ['liked', 'watchlist', 'interested', 'meh', 'skipped', 'disliked', 'avoid'];

export default function Collections({ media, ratedTitles, onPick }) {
  const [verdict, setVerdict] = useState('liked');
  // "Why it ranks" is meaningful for titles she hasn't watched yet.
  const showRank = verdict === 'watchlist' || verdict === 'interested';

  const counts = useMemo(() => {
    const c = {};
    for (const t of ratedTitles) {
      if (t.media_type !== media) continue;
      c[t.verdict] = (c[t.verdict] || 0) + 1;
    }
    return c;
  }, [ratedTitles, media]);

  const items = ratedTitles
    .filter((t) => t.media_type === media && t.verdict === verdict)
    .sort((a, b) => (b.rated_at || '').localeCompare(a.rated_at || ''));

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
      {items.length === 0 && <div className="empty">Nothing in “{verdict}” for this section yet.</div>}
      {items.map((t) => (
        <TitleRow key={t.id} item={t} onClick={() => onPick(t, { rank: showRank })} />
      ))}
    </div>
  );
}
