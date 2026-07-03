import React, { useState } from 'react';
import { AXES } from '../lib/axes.js';

export default function AddTitle({ media, onClose, onAdd }) {
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [axes, setAxes] = useState([]);

  function toggleAxis(a) {
    setAxes((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <strong>Add a {media} manually</strong>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <input
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
            placeholder="Year (optional)"
            inputMode="numeric"
          />
          <div>
            <div className="hint" style={{ marginBottom: 4 }}>Taste axes (optional):</div>
            <div className="axes-picker">
              {Object.entries(AXES).map(([key, a]) => (
                <span
                  key={key}
                  className={`axis-chip ${axes.includes(key) ? 'on' : ''}`}
                  onClick={() => toggleAxis(key)}
                >
                  {a.label}
                </span>
              ))}
            </div>
          </div>
          <button
            className="btn"
            disabled={!title.trim()}
            onClick={() =>
              onAdd({
                title: title.trim(),
                year: year ? parseInt(year) : null,
                media_type: media,
                external_source: 'manual',
                external_id: null,
                axes,
                genres: [],
                keywords: [],
                flags: [],
              })
            }
          >
            Add & rate
          </button>
        </div>
      </div>
    </div>
  );
}
