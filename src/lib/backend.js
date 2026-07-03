// Storage backend. Two implementations behind one interface:
//  - SupabaseBackend: production (RLS on, single user)
//  - LocalBackend: localStorage, used automatically when Supabase env vars are
//    absent or with ?local=1 — so the app is fully usable before deploy.

import { createClient } from '@supabase/supabase-js';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FORCE_LOCAL = new URLSearchParams(location.search).has('local');

export const isLocalMode = FORCE_LOCAL || !SUPA_URL || !SUPA_KEY;

// ---------------------------------------------------------------------------
// LocalBackend
// ---------------------------------------------------------------------------

const LS_KEY = 'plot_twist_v1';

class LocalBackend {
  constructor() {
    this.data = JSON.parse(localStorage.getItem(LS_KEY) || 'null') || {
      titles: [],
      ratings: [],
      settings: {},
    };
  }
  _save() {
    localStorage.setItem(LS_KEY, JSON.stringify(this.data));
  }
  async getSession() {
    return { user: { id: 'local' } };
  }
  async signIn() {
    return { user: { id: 'local' } };
  }
  async signOut() {}

  async upsertTitle(t) {
    const existing = this.data.titles.find(
      (x) =>
        (t.external_id &&
          x.external_source === t.external_source &&
          x.external_id === t.external_id &&
          x.media_type === t.media_type) ||
        (!t.external_id &&
          x.title.toLowerCase() === t.title.toLowerCase() &&
          x.media_type === t.media_type)
    );
    if (existing) {
      Object.assign(existing, t, { id: existing.id });
      this._save();
      return existing;
    }
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...t };
    this.data.titles.push(row);
    this._save();
    return row;
  }
  async getTitles() {
    return [...this.data.titles];
  }
  async rate(title_id, media_type, verdict, note = '') {
    this.data.ratings = this.data.ratings.filter((r) => r.title_id !== title_id);
    const row = {
      id: crypto.randomUUID(),
      title_id,
      media_type,
      verdict,
      note,
      created_at: new Date().toISOString(),
    };
    this.data.ratings.push(row);
    this._save();
    return row;
  }
  async unrate(rating_id) {
    this.data.ratings = this.data.ratings.filter((r) => r.id !== rating_id);
    this._save();
  }
  async getRatings() {
    return [...this.data.ratings];
  }
  async getSetting(key) {
    return this.data.settings[key] ?? null;
  }
  async setSetting(key, value) {
    this.data.settings[key] = value;
    this._save();
  }
}

// ---------------------------------------------------------------------------
// SupabaseBackend
// ---------------------------------------------------------------------------

const EMAIL_DOMAIN = 'plottwist.local';

class SupabaseBackend {
  constructor() {
    this.sb = createClient(SUPA_URL, SUPA_KEY);
  }
  async getSession() {
    const { data } = await this.sb.auth.getSession();
    return data.session ? { user: data.session.user } : null;
  }
  // Username + password, synthetic email — no magic links.
  async signIn(username, password) {
    const email = `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { user: data.user };
  }
  async signOut() {
    await this.sb.auth.signOut();
  }

  async upsertTitle(t) {
    if (t.external_id) {
      const { data, error } = await this.sb
        .from('titles')
        .upsert(t, { onConflict: 'external_source,external_id,media_type' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
    // manual titles: match on title+type
    const { data: existing } = await this.sb
      .from('titles')
      .select()
      .eq('media_type', t.media_type)
      .ilike('title', t.title)
      .maybeSingle();
    if (existing) {
      const { data, error } = await this.sb
        .from('titles')
        .update(t)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
    const { data, error } = await this.sb.from('titles').insert(t).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  async getTitles() {
    const { data, error } = await this.sb.from('titles').select();
    if (error) throw new Error(error.message);
    return data;
  }
  async rate(title_id, media_type, verdict, note = '') {
    await this.sb.from('ratings').delete().eq('title_id', title_id);
    const { data, error } = await this.sb
      .from('ratings')
      .insert({ title_id, media_type, verdict, note })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  async unrate(rating_id) {
    const { error } = await this.sb.from('ratings').delete().eq('id', rating_id);
    if (error) throw new Error(error.message);
  }
  async getRatings() {
    const { data, error } = await this.sb.from('ratings').select();
    if (error) throw new Error(error.message);
    return data;
  }
  async getSetting(key) {
    const { data } = await this.sb.from('settings').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
  }
  async setSetting(key, value) {
    const { error } = await this.sb.from('settings').upsert({ key, value });
    if (error) throw new Error(error.message);
  }
}

export const backend = isLocalMode ? new LocalBackend() : new SupabaseBackend();
