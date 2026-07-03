import React, { useState, useMemo } from 'react';
import { searchAny } from '../lib/api.js';
import TitleRow from './TitleRow.jsx';
import AddTitle from './AddTitle.jsx';

// Library: search the APIs, tap a result to rate it. Below, everything already
// rated in this section. Deliberately no swiping here — fast logging of
// existing opinions.
export default function Library({ media, ratedTitles, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const mine = useMemo(
    () =>
      ratedTitles
        .filter((t) => t.media_type === media)
        .sort((a, b) => (b.rated_at || '').localeCompare(a.rated_at || '')),
    [ratedTitles, media]
  );

  async function search(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setErr('');
    try {
      setResults(await searchAny(media, query.trim()));
    } catch (ex) {
      setErr(ex.message);
      setResults(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="search-row" onSubmit={search}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${media === 'anime' ? 'AniList' : 'TMDB'}…`}
        />
        <button className="btn" style={{ width: 'auto' }} disabled={busy}>
          {busy ? '…' : '🔍'}
        </button>
      </form>
      {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}

      {results && (
        <>
          <div className="section-label">Results — tap to rate</div>
          {results.length === 0 && <div className="empty">No matches found.</div>}
          {results.map((r) => (
            <TitleRow key={r.external_source + r.external_id} item={r} onClick={() => onPick(r)} />
          ))}
          <button className="btn ghost" onClick={() => setResults(null)} style={{ marginBottom: 10 }}>
            Clear results
          </button>
        </>
      )}

      <div className="section-label">My {media} library ({mine.length})</div>
      {mine.length === 0 && (
        <div className="empty">
          Nothing rated here yet.<br />Search above, or seed the database from ⚙️ Settings.
        </div>
      )}
      {mine.map((t) => (
        <TitleRow key={t.id} item={t} onClick={() => onPick(t)} />
      ))}

      <button className="btn ghost" style={{ margin: '10px 0' }} onClick={() => setShowAdd(true)}>
        ＋ Add a title manually
      </button>
      {showAdd && (
        <AddTitle
          media={media}
          onClose={() => setShowAdd(false)}
          onAdd={(item) => {
            setShowAdd(false);
            onPick(item);
          }}
        />
      )}
    </div>
  );
}
