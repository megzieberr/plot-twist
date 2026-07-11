import React, { useEffect, useRef, useState } from 'react';
import { MOOD_CORNERS, describeMood } from '../lib/mood.js';

const REMEMBER_KEY = 'pt_mood_dot';

// The glow colours of the four corners (must stay in step with the CSS corner
// washes) — the dot's own glow is a bilinear blend of them, so dragging toward
// "Dark & gripping" literally turns the dot pink.
const CORNER_RGB = {
  bl: [255, 200, 87], // 🍿 cozy gold
  br: [255, 61, 139], // 🔪 neon pink
  tl: [33, 230, 193], // ✨ teal
  tr: [168, 85, 247], // 🌀 violet
};

function dotRgb([x, y]) {
  const u = (x + 1) / 2;
  const v = (y + 1) / 2;
  const mix = (a, b, t) => a + (b - a) * t;
  return [0, 1, 2].map((i) =>
    Math.round(mix(mix(CORNER_RGB.bl[i], CORNER_RGB.br[i], u), mix(CORNER_RGB.tl[i], CORNER_RGB.tr[i], u), v))
  );
}

// XY mood pad. Collapsed by default; expanding reveals a square with a draggable
// neon dot. Reports the dot position up so the list re-ranks. `dot` is the active
// position (or null = inactive / pure Phase-2 order). It re-ranks, never hides.
// `points` are the displayed titles' own mood positions, drawn as faint ghost
// dots so she can see where her list actually lives on the pad.
export default function MoodPad({ open, onToggle, dot, onChange, onReset, points = [] }) {
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
  const toLeft = (x) => `${((x + 1) / 2) * 100}%`;
  const toTop = (y) => `${((1 - y) / 2) * 100}%`;

  const [r, g, b] = dotRgb(handle);
  const dotStyle = active
    ? {
        left: toLeft(handle[0]),
        top: toTop(handle[1]),
        background: `rgb(${r},${g},${b})`,
        boxShadow: `0 0 18px 5px rgba(${r},${g},${b},0.55)`,
      }
    : { left: toLeft(handle[0]), top: toTop(handle[1]) };

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
            {points.map((p, i) => (
              <span key={i} className="mp-ghost" style={{ left: toLeft(p[0]), top: toTop(p[1]) }} />
            ))}
            <span className="mp-corner tl">{MOOD_CORNERS.tl}</span>
            <span className="mp-corner tr">{MOOD_CORNERS.tr}</span>
            <span className="mp-corner bl">{MOOD_CORNERS.bl}</span>
            <span className="mp-corner br">{MOOD_CORNERS.br}</span>
            <span className={`mp-dot ${active ? '' : 'idle'}`} style={dotStyle} />
          </div>
          <div className="moodpad-foot">
            <span className="hint">
              {active
                ? describeMood(handle)
                : 'Drag the dot — the further from centre, the stronger the pull.'}
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
