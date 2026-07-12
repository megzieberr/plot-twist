import React from 'react';

const TYPE_EMOJI = { movie: '🎬', series: '📺', anime: '⛩️' };

// A compact recommendation card (Tonight + More like this). Reads a shortlist,
// not a swipe deck: poster, title, public-rating badge, a self-explaining reason
// line, an origin/reason badge, and a "Seen it" action that opens the rate sheet.
export default function RecCard({ item, reason, badge, onOpen, onSeen }) {
  const rating = typeof item.quality === 'number' ? (item.quality * 10).toFixed(1) : null;
  return (
    <div className="rec-card" onClick={onOpen}>
      {item.poster_url ? (
        <img className="rec-poster" src={item.poster_url} alt="" loading="lazy" />
      ) : (
        <div className="rec-poster rec-poster-fb">{TYPE_EMOJI[item.media_type] || '🎞️'}</div>
      )}
      <div className="rec-body">
        <div className="rec-top">
          <div className="rec-name">{item.title}</div>
          {rating != null && <span className="rec-rating">★ {rating}</span>}
        </div>
        <div className="rec-meta">
          {item.year || '—'}
          {item.genres?.length ? ` · ${item.genres.slice(0, 2).join(' / ')}` : ''}
        </div>
        {badge && <span className={`rec-badge ${badge.cls || ''}`}>{badge.label}</span>}
        {reason && <div className="rec-why">✨ {reason}</div>}
        {onSeen && (
          <button
            className="rec-seen"
            onClick={(e) => {
              e.stopPropagation();
              onSeen(item);
            }}
          >
            👁 Seen it
          </button>
        )}
      </div>
    </div>
  );
}
