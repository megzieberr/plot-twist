import React from 'react';

const VERDICTS = [
  { key: 'liked', label: 'Liked', emoji: '💚' },
  { key: 'disliked', label: 'Disliked', emoji: '💔' },
  { key: 'meh', label: 'Meh', emoji: '😐' },
  { key: 'watchlist', label: 'Watchlist', emoji: '🔖' },
  { key: 'interested', label: 'Interested', emoji: '👀' },
  // Same verdict as a Discover left-swipe — lets watchlist pruning land in
  // the "skipped" tab instead of abusing "meh" (which is a taste signal).
  { key: 'skipped', label: 'Not for me', emoji: '✖️' },
];

export default function RateSheet({ item, onClose, onRate }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <strong>{item.title}</strong>
        <span style={{ color: 'var(--ink-faint)' }}> {item.year ? `(${item.year})` : ''}</span>
        <div className="verdict-grid">
          {VERDICTS.map((v) => (
            <button key={v.key} className="verdict-btn" onClick={() => onRate(v.key)}>
              <span>{v.emoji}</span>
              {v.label}
            </button>
          ))}
        </div>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => onRate('avoid')}>
          🚫 Avoid (never recommend)
        </button>
      </div>
    </div>
  );
}
