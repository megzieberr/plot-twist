import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { backend, isLocalMode } from './lib/backend.js';
import { computeWeights, likedGenreSet } from './lib/scorer.js';
import Login from './components/Login.jsx';
import Library from './components/Library.jsx';
import Discover from './components/Discover.jsx';
import Collections from './components/Collections.jsx';
import Settings from './components/Settings.jsx';
import RateSheet from './components/RateSheet.jsx';
import Toast from './components/Toast.jsx';

const MEDIA = [
  { key: 'movie', label: '🎬 Movies' },
  { key: 'series', label: '📺 Series' },
  { key: 'anime', label: '⛩️ Anime' },
];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking
  const [media, setMedia] = useState('movie');
  const [mode, setMode] = useState('discover');
  const [titles, setTitles] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [rateTarget, setRateTarget] = useState(null); // candidate/title being rated
  const [toast, setToast] = useState(null); // { msg, undo }
  const [showSettings, setShowSettings] = useState(false);
  const [dataReady, setDataReady] = useState(false); // first load done — Discover must wait for it

  useEffect(() => {
    backend.getSession().then(setSession);
  }, []);

  const reload = useCallback(async () => {
    const [t, r] = await Promise.all([backend.getTitles(), backend.getRatings()]);
    setTitles(t);
    setRatings(r);
    setDataReady(true);
  }, []);

  useEffect(() => {
    if (session) reload();
  }, [session, reload]);

  // Join ratings onto titles for the scorer.
  const ratedTitles = useMemo(() => {
    const byId = Object.fromEntries(titles.map((t) => [t.id, t]));
    return ratings
      .map((r) => {
        const t = byId[r.title_id];
        return t ? { ...t, verdict: r.verdict, rating_id: r.id, rated_at: r.created_at } : null;
      })
      .filter(Boolean);
  }, [titles, ratings]);

  const weights = useMemo(() => computeWeights(ratedTitles), [ratedTitles]);
  const likedGenres = useMemo(() => likedGenreSet(ratedTitles), [ratedTitles]);

  // Rate anything: candidate objects (no id yet) are upserted into titles first.
  const rate = useCallback(
    async (item, verdict, note = '') => {
      try {
        let titleRow = item;
        if (!item.id) {
          titleRow = await backend.upsertTitle({
            media_type: item.media_type,
            external_source: item.external_source || 'manual',
            external_id: item.external_id || null,
            title: item.title,
            year: item.year ?? null,
            poster_url: item.poster_url || null,
            overview: item.overview || '',
            genres: item.genres || [],
            keywords: item.keywords || [],
            axes: Array.isArray(item.axes) ? item.axes : Object.keys(item.axes || {}),
            flags: Array.isArray(item.flags) ? item.flags : Object.keys(item.flags || {}),
          });
        }
        const ratingRow = await backend.rate(titleRow.id, titleRow.media_type, verdict, note);
        await reload();
        setToast({
          msg: `${titleRow.title} → ${verdict}`,
          undo: async () => {
            await backend.unrate(ratingRow.id);
            await reload();
          },
        });
        return ratingRow;
      } catch (ex) {
        // A failed save must never be silent — that's how ratings vanish.
        setToast({ msg: `⚠️ Could not save: ${ex.message}` });
        return null;
      }
    },
    [reload]
  );

  if (session === undefined) return <div className="spinner" />;
  if (!session) return <Login onLogin={setSession} />;

  return (
    <div className="app">
      <header className="hdr">
        <div>
          <h1 className="logo">Plot<span className="tw">Twist</span></h1>
          <div className="logo-sub">your taste, decoded{isLocalMode ? ' · local mode' : ''}</div>
        </div>
        <button className="hdr-btn" onClick={() => setShowSettings(true)}>⚙️</button>
      </header>

      <nav className="media-tabs">
        {MEDIA.map((m) => (
          <button
            key={m.key}
            className={`media-tab ${m.key} ${media === m.key ? 'active' : ''}`}
            onClick={() => setMedia(m.key)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {mode === 'library' && (
        <Library media={media} ratedTitles={ratedTitles} onPick={setRateTarget} />
      )}
      {mode === 'discover' && (
        <Discover
          media={media}
          ready={dataReady}
          ratedTitles={ratedTitles}
          weights={weights}
          likedGenres={likedGenres}
          onRate={rate}
        />
      )}
      {mode === 'collections' && (
        <Collections media={media} ratedTitles={ratedTitles} onPick={setRateTarget} />
      )}

      <nav className="bottom-nav">
        <button className={mode === 'library' ? 'active' : ''} onClick={() => setMode('library')}>
          <span className="ico">📚</span>Library
        </button>
        <button className={mode === 'discover' ? 'active' : ''} onClick={() => setMode('discover')}>
          <span className="ico">🃏</span>Discover
        </button>
        <button className={mode === 'collections' ? 'active' : ''} onClick={() => setMode('collections')}>
          <span className="ico">🗂️</span>Collections
        </button>
      </nav>

      {rateTarget && (
        <RateSheet
          item={rateTarget}
          onClose={() => setRateTarget(null)}
          onRate={async (verdict) => {
            setRateTarget(null);
            await rate(rateTarget, verdict);
          }}
        />
      )}

      {showSettings && (
        <Settings
          weights={weights}
          ratedCount={ratedTitles.length}
          onClose={() => setShowSettings(false)}
          onSeeded={reload}
          onSignOut={async () => {
            await backend.signOut();
            setSession(null);
          }}
        />
      )}

      {toast && <Toast toast={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
