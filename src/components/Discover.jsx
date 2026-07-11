import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { discoverTmdb, discoverAnilist, enrichTmdb } from '../lib/api.js';
import { scoreCandidate, whyLine, isExcluded } from '../lib/scorer.js';
import { titleMoodPos, moodFinals } from '../lib/mood.js';
import MoodPad from './MoodPad.jsx';

// Discover: ranked queue of unrated titles pulled live from the APIs.
// Swipe right = interested, left = not for me, up = watchlist.
export default function Discover({ media, ready, ratedTitles, weights, likedGenres, onRate }) {
  const [queue, setQueue] = useState(null); // null = loading
  const [err, setErr] = useState('');
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodDot, setMoodDot] = useState(null); // null = neutral / inactive

  // Fresh section = fresh mood (start collapsed + neutral).
  useEffect(() => {
    setMoodOpen(false);
    setMoodDot(null);
  }, [media]);

  // The dot re-ranks the deck the same taste/mood blend as the watchlist —
  // the further the dot is from centre, the more mood outweighs taste.
  const deck = useMemo(() => {
    if (!queue || !moodDot || queue.length < 2) return queue;
    const finals = moodFinals(queue, moodDot, (c) => c.score);
    return queue
      .map((c, i) => ({ c, f: finals[i] }))
      .sort((a, b) => b.f - a.f)
      .map((x) => x.c);
  }, [queue, moodDot]);

  // Where this deck's titles sit in mood space — ghost dots on the pad.
  const moodPoints = useMemo(
    () => (queue || []).map(titleMoodPos).filter(Boolean),
    [queue]
  );

  const load = useCallback(async () => {
    if (!ready) return; // ratings still loading — scoring now would be unpersonalized
    setQueue(null);
    setErr('');
    try {
      // Everything already rated (any verdict, incl. avoid) is excluded.
      const ratedKeys = new Set(
        ratedTitles.map((t) => `${t.external_source}:${t.external_id}`)
      );
      const ratedNames = new Set(
        ratedTitles.filter((t) => t.media_type === media).map((t) => t.title.toLowerCase())
      );

      let pool =
        media === 'anime' ? await discoverAnilist(3) : await discoverTmdb(media, 4);
      pool = pool.filter(
        (c) =>
          !ratedKeys.has(`${c.external_source}:${c.external_id}`) &&
          !ratedNames.has(c.title.toLowerCase()) &&
          ![...ratedNames].some((n) => isSequelOf(c.title, n))
      );

      // TMDB discover results have genres only; fetch keywords for the most
      // promising slice (pre-ranked on genre-level signal) so axis inference
      // has real signal to work with.
      if (media !== 'anime') {
        pool.sort(
          (a, b) =>
            scoreCandidate(b, weights, likedGenres).score -
            scoreCandidate(a, weights, likedGenres).score
        );
        const top = pool.slice(0, 40);
        const enriched = await Promise.all(top.map(enrichTmdb));
        pool = [...enriched, ...pool.slice(40)];
      }

      const scored = pool
        .filter((c) => !isExcluded(c)) // addiction-central: hard exclude
        .map((c) => {
          const result = scoreCandidate(c, weights, likedGenres);
          return { ...c, score: result.score, why: whyLine(result, c) };
        })
        .sort((a, b) => b.score - a.score);

      setQueue(diversifyByGenre(scored, 40));
    } catch (ex) {
      setErr(ex.message);
      setQueue([]);
    }
  }, [media, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  async function handleSwipe(candidate, direction) {
    const verdict = { right: 'interested', left: 'skipped', up: 'watchlist' }[direction];
    setQueue((q) => q.filter((c) => c.external_id !== candidate.external_id));
    await onRate(candidate, verdict);
  }

  if (queue === null) return <div className="spinner" />;
  if (err)
    return (
      <div className="empty">
        Could not load the Discover queue.<br />
        <span className="hint">{err}</span>
        <button className="btn ghost" style={{ marginTop: 14 }} onClick={load}>Retry</button>
      </div>
    );
  if (queue.length === 0)
    return (
      <div className="empty">
        Deck is empty — you have rated everything in this batch! 🎉
        <button className="btn ghost" style={{ marginTop: 14 }} onClick={load}>Load more</button>
      </div>
    );

  return (
    <>
      <MoodPad
        open={moodOpen}
        dot={moodDot}
        points={moodPoints}
        onToggle={() => setMoodOpen((o) => !o)}
        onChange={setMoodDot}
        onReset={() => setMoodDot(null)}
      />
      <SwipeDeck queue={deck} onSwipe={handleSwipe} />
    </>
  );
}

// Greedy genre-diversity pick. A flat top-N by score echo-chambers: the top
// axes correlate heavily with thriller/mystery, so the deck went wall-to-wall
// thriller and the watchlist inherited it. Each already-picked card sharing a
// (primary) genre applies a growing penalty when choosing the next card —
// strong matches still lead, but the deck mixes in the rest of her taste.
function diversifyByGenre(sorted, n, penalty = 0.04) {
  const picked = [];
  const genreCount = {};
  const pool = [...sorted];
  while (picked.length < n && pool.length > 0) {
    let bestI = 0;
    let bestV = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      let v = pool[i].score;
      for (const g of (pool[i].genres || []).slice(0, 2)) v -= penalty * (genreCount[g] || 0);
      if (v > bestV) {
        bestV = v;
        bestI = i;
      }
    }
    const c = pool.splice(bestI, 1)[0];
    for (const g of (c.genres || []).slice(0, 2)) genreCount[g] = (genreCount[g] || 0) + 1;
    picked.push(c);
  }
  return picked;
}

// Seasons/sequels of an already-rated show are not new discoveries:
// "Attack on Titan Season 3 Part 2" should not resurface when
// "Attack on Titan" is already rated. A bare prefix is not enough
// ("From" must not swallow "Frozen"), so require a sequel-ish separator.
function isSequelOf(candidateTitle, ratedName) {
  const c = candidateTitle.toLowerCase();
  if (!c.startsWith(ratedName)) return false;
  const rest = c.slice(ratedName.length);
  return /^[\s:–-]+(season|part|movie|final|the movie|\d|ii|iii|iv)/i.test(rest) || /^:\s/.test(rest);
}

// ---------------------------------------------------------------------------
// The swipeable deck (pointer events; works for touch + mouse)
// ---------------------------------------------------------------------------

function SwipeDeck({ queue, onSwipe }) {
  const top = queue[0];
  const next = queue[1];
  return (
    <>
      <div className="deck-wrap">
        {next && <StaticCard candidate={next} />}
        <SwipeCard key={top.external_source + top.external_id} candidate={top} onSwipe={onSwipe} />
      </div>
      <div className="deck-actions">
        <button className="deck-btn no" title="Not for me" onClick={() => onSwipe(top, 'left')}>✖️</button>
        <button className="deck-btn watch" title="Watchlist" onClick={() => onSwipe(top, 'up')}>🔖</button>
        <button className="deck-btn yes" title="Interested" onClick={() => onSwipe(top, 'right')}>💚</button>
      </div>
    </>
  );
}

function CardBody({ candidate }) {
  return (
    <>
      <div
        className="poster"
        style={candidate.poster_url ? { backgroundImage: `url(${candidate.poster_url})` } : {}}
      />
      <div className="card-info">
        <h2>{candidate.title}</h2>
        <div className="meta">
          {candidate.year || '—'}
          {candidate.genres?.length ? ` · ${candidate.genres.slice(0, 3).join(' / ')}` : ''}
          {` · score ${candidate.score}`}
        </div>
        <div className="why-line">✨ {candidate.why}</div>
        {candidate.overview && <div className="card-overview">{candidate.overview}</div>}
      </div>
    </>
  );
}

function StaticCard({ candidate }) {
  return (
    <div className="swipe-card" style={{ transform: 'scale(0.96) translateY(10px)', opacity: 0.6 }}>
      <CardBody candidate={candidate} />
    </div>
  );
}

function SwipeCard({ candidate, onSwipe }) {
  const ref = useRef(null);
  const drag = useRef(null);

  function onDown(e) {
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    ref.current.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current.dx = dx;
    drag.current.dy = dy;
    const rot = dx / 18;
    ref.current.style.transition = 'none';
    ref.current.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    setStamps(dx, dy);
  }
  function onUp() {
    if (!drag.current) return;
    const { dx, dy } = drag.current;
    drag.current = null;
    const H = 90;
    if (dy < -H && Math.abs(dx) < 80) return fly(0, -900, 'up');
    if (dx > H) return fly(600, dy * 2, 'right');
    if (dx < -H) return fly(-600, dy * 2, 'left');
    ref.current.style.transition = 'transform 0.25s';
    ref.current.style.transform = '';
    setStamps(0, 0);
  }
  function fly(x, y, dir) {
    ref.current.style.transition = 'transform 0.3s ease-in';
    ref.current.style.transform = `translate(${x}px, ${y}px) rotate(${x / 12}deg)`;
    setTimeout(() => onSwipe(candidate, dir), 200);
  }
  function setStamps(dx, dy) {
    const el = ref.current;
    if (!el) return;
    el.querySelector('.stamp-yes').style.opacity = dx > 30 ? Math.min(1, dx / 110) : 0;
    el.querySelector('.stamp-no').style.opacity = dx < -30 ? Math.min(1, -dx / 110) : 0;
    el.querySelector('.stamp-watch').style.opacity =
      dy < -30 && Math.abs(dx) < 80 ? Math.min(1, -dy / 110) : 0;
  }

  return (
    <div
      ref={ref}
      className="swipe-card"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="swipe-stamp stamp-yes">INTERESTED</div>
      <div className="swipe-stamp stamp-no">NOPE</div>
      <div className="swipe-stamp stamp-watch">WATCHLIST</div>
      <CardBody candidate={candidate} />
    </div>
  );
}
