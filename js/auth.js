/* Talks to Supabase (login service + database) with plain fetch calls. No library needed.
   Exposes window.MTAuth. Everything here is a no-op when js/config.js is empty. */
(() => {
  'use strict';
  const cfg = window.MT_CONFIG || {};
  const BASE = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
  const APIKEY = String(cfg.supabaseKey || '').trim();
  const enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(BASE) && APIKEY.length > 20;
  const SKEY = 'marvel-tracker-session';
  const nowSec = () => Math.floor(Date.now() / 1000);

  let session = null;        // { access_token, refresh_token, expires_at, user: { id, email } }
  let memorySession = null;  // used if the browser blocks localStorage
  let refreshing = null;

  function readSession() {
    try { const raw = localStorage.getItem(SKEY); if (raw) return JSON.parse(raw); } catch (e) { /* blocked */ }
    return memorySession;
  }
  function writeSession(s) {
    memorySession = s;
    try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) { /* blocked */ }
  }
  function adopt(tok) {   // tok comes from the login service
    if (!tok || !tok.access_token || !tok.user) throw new Error('Unexpected reply from the login service');
    session = {
      access_token: tok.access_token, refresh_token: tok.refresh_token || '',
      expires_at: Number(tok.expires_at) || nowSec() + (Number(tok.expires_in) || 3600),
      user: { id: tok.user.id, email: tok.user.email || '' }
    };
    writeSession(session);
    return session;
  }

  function errText(j, status) {
    const m = (j && (j.msg || j.error_description || j.message || (typeof j.error === 'string' ? j.error : ''))) || '';
    return m || `Request failed (${status})`;
  }
  async function raw(path, { method = 'GET', body, token, headers = {}, keepalive } = {}) {
    const h = { apikey: APIKEY, ...headers };
    if (token) h.Authorization = 'Bearer ' + token;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    let res;
    try { res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), keepalive }); }
    catch (e) { const err = new Error('Could not reach the server. Check your connection.'); err.network = true; throw err; }
    let j = null; const txt = await res.text(); if (txt) { try { j = JSON.parse(txt); } catch (e) { j = null; } }
    if (!res.ok) { const err = new Error(errText(j, res.status)); err.status = res.status; err.body = j; throw err; }
    return j;
  }

  async function refresh() {
    if (!session || !session.refresh_token) throw new Error('Please log in again');
    if (!refreshing) {
      refreshing = raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
        .then(adopt)
        .catch(e => { if (!e.network) { session = null; writeSession(null); } throw e; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function token() {
    if (!session) throw new Error('Please log in');
    if (session.expires_at - 60 < nowSec()) await refresh();
    return session.access_token;
  }
  async function api(path, opts = {}) {   // a call made as the logged-in user
    try { return await raw(path, { ...opts, token: await token() }); }
    catch (e) {
      if (e.status === 401 && session && session.refresh_token) { await refresh(); return raw(path, { ...opts, token: session.access_token }); }
      throw e;
    }
  }
  const eq = v => encodeURIComponent(String(v));

  window.MTAuth = {
    enabled,
    user: () => session && session.user,
    hasSession: () => !!session,

    /* ---- login service ---- */
    restore() { session = enabled ? readSession() : null; if (session && !session.user) session = null; return !!session; },
    async signUp(name, email, password) {
      const j = await raw('/auth/v1/signup', { method: 'POST', body: { email, password, data: { display_name: name } } });
      if (j && j.access_token) { adopt(j); return { signedIn: true }; }
      return { signedIn: false };   // the project asks people to confirm their email first
    },
    async signIn(email, password) { adopt(await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })); },
    async signOut() {
      const t = session && session.access_token;
      session = null; writeSession(null);
      if (t) { try { await raw('/auth/v1/logout', { method: 'POST', token: t }); } catch (e) { /* already gone */ } }
    },
    changePassword: password => api('/auth/v1/user', { method: 'PUT', body: { password } }),
    recover: email => raw('/auth/v1/recover?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { method: 'POST', body: { email } }),
    async fromHash() {   // the link in a confirmation or password-reset email lands here with a token in the address
      const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      if (!enabled || !(h.has('access_token') || h.has('error_description'))) return null;
      const out = { type: h.get('type') || '', error: h.get('error_description') || '' };
      history.replaceState(null, '', location.pathname + location.search);
      if (out.error) return out;
      const user = await raw('/auth/v1/user', { token: h.get('access_token') });
      adopt({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: h.get('expires_in'), expires_at: h.get('expires_at'), user });
      return out;
    },

    /* ---- the signed-in person's data ---- */
    async profile() {
      const rows = await api(`/rest/v1/profiles?id=eq.${eq(session.user.id)}&select=id,email,display_name,role,blocked`);
      return rows && rows[0] || null;
    },
    async getChecklist() {
      const rows = await api(`/rest/v1/checklists?user_id=eq.${eq(session.user.id)}&select=data,updated_at`);
      return rows && rows[0] ? rows[0].data : null;
    },
    putChecklist(data, keepalive) {
      return api('/rest/v1/checklists?on_conflict=user_id', {
        method: 'POST', keepalive, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: { user_id: session.user.id, data, updated_at: new Date().toISOString() }
      });
    },

    /* ---- admin (these run as database functions that check the caller is an admin: see supabase/setup.sql) ---- */
    listUsers: () => api('/rest/v1/rpc/admin_list_users', { method: 'POST', body: {} }),
    setBlocked: (id, value) => api('/rest/v1/rpc/admin_set_blocked', { method: 'POST', body: { target: id, value } }),
    setRole: (id, role) => api('/rest/v1/rpc/admin_set_role', { method: 'POST', body: { target: id, new_role: role } }),
    deleteUser: id => api('/rest/v1/rpc/admin_delete_user', { method: 'POST', body: { target: id } })
  };
})();
