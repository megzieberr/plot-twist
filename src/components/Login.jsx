import React, { useState } from 'react';
import { backend } from '../lib/backend.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('megzieberr');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const session = await backend.signIn(username, password);
      onLogin(session);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1 className="logo" style={{ textAlign: 'center' }}>
          Plot<span className="tw">Twist</span>
        </h1>
        <div className="logo-sub" style={{ textAlign: 'center', marginBottom: 10 }}>
          your taste, decoded
        </div>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          autoComplete="username"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
        />
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="hint">
          Single-user app. Username + password only — no magic links.
        </div>
      </form>
    </div>
  );
}
