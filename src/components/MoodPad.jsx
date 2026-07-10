import React, { useEffect, useRef, useState } from 'react';
import { MOOD_CORNERS } from '../lib/mood.js';

const REMEMBER_KEY = 'pt_mood_dot';

// XY mood pad. Collapsed by default; expanding reveals a square with a draggable
// neon dot. Reports the dot position up so the list re-ranks. `dot` is the active
// position (or null = inactive / pure Phase-2 order). It re-ranks, never hides.
export default function MoodPad({ open, onToggle, dot, onChange, onReset }) {
  const padRef = useRef(null);
  const active = dot != null;
  // Handle position for rendering: the active dot, else last remembered spot
  // (dim) so she can see where she left it — but it doesn't reorder until touched.
  const [handle, setHandle] = useState(() => dot || readRemembered() || [0, 0]);

  useEffect(() => {
    setHandle(dot || readRemembered() || [0, 0]);
  }, [dot]);

  function fromEvent(e) {
    const r = padRef.current.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
    const y = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1)); // screen-y is inverted
    return [round2(x), round2(y)];
  }

  function onDown(e) {
    padRef.current.setPointerCapture(e.pointerId);
    move(e);
  }
  function move(e) {
    if (e.buttons === 0 && e.type === 'pointermove') return;
    const p = fromEvent(e);
    setHandle(p);
    onChange(p);
  }
  function onUp(e) {
    const p = fromEvent(e);
    remember(p);
    navigator.vibrate?.(5);
  }

  // Convert [-1,1] -> CSS % (y flipped back for the screen).
  const left = `${((handle[0] + 1) / 2) * 100}%`;
  const top = `${((1 - handle[1]) / 2) * 100}%`;

  return (
    <div className="moodpad">
      <button className="moodpad-head" onClick={onToggle}>
        <span>🎭 What are you in the mood for?</span>
        <span className="moodpad-caret">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="moodpad-body">
          <div
            ref={padRef}
            className={`moodpad-square ${active ? 'active' : ''}`}
            onPointerDown={onDown}
            onPointerMove={move}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <span className="mp-corner tl">{MOOD_CORNERS.tl}</span>
            <span className="mp-corner tr">{MOOD_CORNERS.tr}</span>
            <span className="mp-corner bl">{MOOD_CORNERS.bl}</span>
            <span className="mp-corner br">{MOOD_CORNERS.br}</span>
            <span className="mp-axis mp-axis-x">Cozy ⟷ Dark</span>
            <span className="mp-axis mp-axis-y">Easy ⟷ Mind-bending</span>
            <span className={`mp-dot ${active ? '' : 'idle'}`} style={{ left, top }} />
          </div>
          <div className="moodpad-foot">
            <span className="hint">
              {active ? 'Re-ranking by mood — worst fit sinks, nothing hides.' : 'Drag the dot to set your mood.'}
            </span>
            {active && (
              <button className="mp-reset" onClick={onReset}>Reset</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function clamp(v) {
  return Math.max(-1, Math.min(1, v));
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
function readRemembered() {
  try {
    const v = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
    return Array.isArray(v) && v.length === 2 ? v : null;
  } catch {
    return null;
  }
}
function remember(p) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(p));
  } catch {
    // best-effort
  }
}
