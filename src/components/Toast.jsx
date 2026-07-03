import React, { useEffect } from 'react';

export default function Toast({ toast, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  return (
    <div className="toast">
      <span>{toast.msg}</span>
      {toast.undo && (
        <button
          onClick={async () => {
            await toast.undo();
            onDone();
          }}
        >
          UNDO
        </button>
      )}
    </div>
  );
}
