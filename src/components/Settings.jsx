import React, { useState } from 'react';
import { AXES } from '../lib/axes.js';
import { runSeed } from '../lib/seed.js';
import { isLocalMode } from '../lib/backend.js';

export default function Settings({ weights, ratedCount, onClose, onSeeded, onSignOut }) {
  const [seeding, setSeeding] = useState(null); // progress text
  const [seedDone, setSeedDone] = useState(false);

  async function seed() {
    setSeeding('Starting…');
    try {
      await runSeed((done, total, title) => setSeeding(`${done}/${total} — ${title}`));
      setSeedDone(true);
      setSeeding(null);
      onSeeded();
    } catch (ex) {
      setSeeding(`Failed: ${ex.message}`);
    }
  }

  const sortedWeights = Object.entries(weights).sort((a, b) => b[1] - a[1]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85dvh', overflowY: 'auto' }}>
        <strong>⚙️ Settings</strong>
        <div className="hint" style={{ marginTop: 4 }}>
          {isLocalMode
            ? 'Local mode — everything lives in this browser. Connect Supabase to sync.'
            : 'Connected to Supabase.'}{' '}
          {ratedCount} titles rated.
        </div>

        <div className="section-label">Seed database (from the brief)</div>
        <button className="btn" onClick={seed} disabled={!!seeding}>
          {seeding ? seeding : seedDone ? 'Seeded ✓ (safe to re-run)' : '🌱 Seed my ratings'}
        </button>
        <div className="hint" style={{ marginTop: 6 }}>
          Idempotent — already-rated titles are skipped. Posters attach automatically when the
          APIs are reachable.
        </div>

        <div className="section-label">Current axis weights</div>
        <div className="hint" style={{ marginBottom: 8 }}>
          Recomputed live from your ratings. Content axes are weighted above craft and genre
          (calibration notes). Later these become logistic-regression weights.
        </div>
        {sortedWeights.map(([axis, w]) => (
          <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ flex: '0 0 46%', fontSize: '0.8rem' }}>{AXES[axis].label}</span>
            <div style={{ flex: 1, height: 8, background: 'var(--bg-2)', borderRadius: 99 }}>
              <div
                style={{
                  width: `${Math.min(100, Math.abs(w) * 300)}%`,
                  height: '100%',
                  borderRadius: 99,
                  background: w >= 0
                    ? 'linear-gradient(90deg, var(--neon), var(--neon-2))'
                    : 'var(--danger)',
                }}
              />
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', width: 42, textAlign: 'right' }}>
              {w.toFixed(2)}
            </span>
          </div>
        ))}

        <button className="btn ghost" style={{ marginTop: 16 }} onClick={onSignOut}>
          Sign out
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
