import React, { useEffect, useMemo, useState } from 'react';
import { getDetails } from '../lib/api.js';
import { AXES } from '../lib/axes.js';
import { scoreStoredTitle, whyLine } from '../lib/scorer.js';
import { qualityMap } from '../lib/detailCache.js';

const TYPE_EMOJI = { movie: '🎬', series: '📺', anime: '⛩️' };
const SOURCE_LABEL = { tmdb: 'TMDB', anilist: 'AniList', kitsu: 'Kitsu' };

// The detail view: tap a title anywhere (Library / Collections) and see the
// public rating, release facts, full plot, why it ranks, and top reviews —
// so a long watchlist becomes a "where do I start" instead of a wall of posters.
export default function OverviewSheet({ item, onClose, onRate, onMore, weights, likedGenres, showRank }) {
  const [detail, setDetail] = useState(null); // null = still fetching

  useEffect(() => {
    let alive = true;
    setDetail(null);
    getDetails(item).then((d) => alive && setDetail(d));
    return () => {
      alive = false;
    };
  }, [item]);

  const axes = Array.isArray(item.axes) ? item.axes : Object.keys(item.axes || {});

  // "Why it ranks" — the app's soul. Only on the watchlist, only with weights.
  // detail in the deps so it recomputes once a fresh fetch caches real quality.
  const rank = useMemo(() => {
    if (!showRank || !weights) return null;
    const res = scoreStoredTitle(item, weights, likedGenres || new Set(), qualityMap());
    return { line: whyLine(res) };
  }, [item, weights, likedGenres, showRank, detail]);

  const typeLine = [item.year || '—', item.media_type, ...(item.genres || []).slice(0, 2)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet ov" onClick={(e) => e.stopPropagation()}>
        {/* 1 — poster + heading */}
        <div className="ov-head">
          {item.poster_url ? (
            <img className="ov-poster" src={item.poster_url} alt="" />
          ) : (
            <div className="ov-poster ov-poster-fb">{TYPE_EMOJI[item.media_type] || '🎞️'}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <h2 className="ov-title">{item.title}</h2>
            <div className="ov-type">{typeLine}</div>
            {item.verdict && (
              <span className={`verdict-pill v-${item.verdict}`} style={{ marginLeft: 0 }}>
                {item.verdict}
              </span>
            )}
          </div>
        </div>

        {/* 2 — fact chips */}
        <FactRow item={item} detail={detail} />

        {/* 3 — plot */}
        <div className="ov-section">
          <div className="ov-label">Plot</div>
          <p className="ov-plot">
            {detail?.overview || item.overview || 'No description available.'}
          </p>
        </div>

        {/* 4 — why it ranks */}
        {rank && (
          <div className="ov-section">
            <div className="ov-label">Why it ranks here</div>
            <div className="why-line">✨ {rank.line}</div>
            {axes.length > 0 && (
              <div className="ov-axes">
                {axes.slice(0, 4).map((a) => (
                  <span key={a} className="axis-chip">{AXES[a]?.label || a}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5 — reviews */}
        <div className="ov-section">
          <div className="ov-label">Reviews</div>
          <Reviews detail={detail} />
          {detail?.moreUrl && (
            <a className="ov-more" href={detail.moreUrl} target="_blank" rel="noreferrer">
              More on {SOURCE_LABEL[item.external_source] || 'the web'} ↗
            </a>
          )}
        </div>

        {detail?.note && <div className="ov-note">{detail.note}</div>}

        {/* 6 — actions */}
        <div className="ov-actions">
          <button className="btn" onClick={() => onRate(item)}>
            {item.verdict ? '✍️ Change verdict' : '⭐ Rate this'}
          </button>
          {onMore && item.external_id && (
            <button className="btn ghost" onClick={() => onMore(item)}>🧬 More like this</button>
          )}
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function FactRow({ item, detail }) {
  const chips = [];
  const rating = detail?.rating10;
  if (rating != null) {
    const votes = detail.vote_count ? ` · ${fmtVotes(detail.vote_count)}` : '';
    chips.push(`⭐ ${rating.toFixed(1)}${votes}`);
  }
  const rd = detail?.release_date || (item.year ? String(item.year) : null);
  if (rd) chips.push(`📅 ${fmtDate(rd)}`);
  if (detail?.episodes) chips.push(`⏱ ${detail.episodes} eps`);
  else if (detail?.runtime) chips.push(`⏱ ${detail.runtime} min`);

  if (detail === null) {
    return (
      <div className="ov-facts">
        <span className="ov-chip ov-chip-load">loading facts…</span>
      </div>
    );
  }
  if (chips.length === 0) {
    return (
      <div className="ov-facts">
        <span className="ov-chip ov-chip-dim">no public ratings yet</span>
      </div>
    );
  }
  return (
    <div className="ov-facts">
      {chips.map((c) => (
        <span key={c} className="ov-chip">{c}</span>
      ))}
    </div>
  );
}

function Reviews({ detail }) {
  if (detail === null) return <div className="ov-review-empty">loading reviews…</div>;
  if (!detail.reviews || detail.reviews.length === 0) {
    return <div className="ov-review-empty">No reviews to show.</div>;
  }
  return (
    <>
      {detail.reviews.map((r, i) => (
        <div key={i} className="ov-review">
          <div className="ov-review-head">
            <strong>{r.author}</strong>
            {r.score != null && <span className="ov-review-score">⭐ {r.score.toFixed(1)}</span>}
          </div>
          <div className="ov-review-body">{r.excerpt || '—'}</div>
        </div>
      ))}
    </>
  );
}

function fmtVotes(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k votes`;
  return `${n} votes`;
}

function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[+m[2] - 1] || ''} ${+m[3]}, ${m[1]}`.trim();
}
