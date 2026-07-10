import React from 'react';
import { AXES } from '../lib/axes.js';

const TYPE_EMOJI = { movie: '🎬', series: '📺', anime: '⛩️' };

export default function TitleRow({ item, onClick, showAxes = true, match = null, matchLabel }) {
  const axes = Array.isArray(item.axes) ? item.axes : Object.keys(item.axes || {});
  return (
    <div className="title-row" onClick={onClick}>
      {item.poster_url ? (
        <img src={item.poster_url} alt="" loading="lazy" />
      ) : (
        <div className="poster-fallback">{TYPE_EMOJI[item.media_type] || '🎞️'}</div>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="t-name">{item.title}</div>
        <div className="t-meta">
          {item.year || '—'} · {item.media_type}
          {item.genres?.length ? ` · ${item.genres.slice(0, 2).join(', ')}` : ''}
        </div>
        {showAxes && axes.length > 0 && (
          <div className="t-axes">
            {axes.slice(0, 3).map((a) => (
              <span key={a} className="axis-chip">{AXES[a]?.label || a}</span>
            ))}
          </div>
        )}
      </div>
      <div className="t-right">
        {match != null && (
          <span className="match-chip" title={matchLabel || 'match'}>{match}%</span>
        )}
        {item.verdict && <span className={`verdict-pill v-${item.verdict}`}>{item.verdict}</span>}
      </div>
    </div>
  );
}
