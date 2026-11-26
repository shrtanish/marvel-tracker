/* Log in, sign up, saving the checklist to an account, and the admin panel.
   Does nothing unless js/config.js is filled in (see "Accounts" in README.md). Talks to Supabase through js/auth.js. */
(() => {
  'use strict';
  const A = window.MTAuth;
  const $ = (s, el = document) => el.querySelector(s);
  let app, me = null;                       // me = { id, email, name, role } while logged in
  let saveTimer = null, pending = null, dirty = false, saving = false, saveState = 'saved', lastCheck = 0;

  const esc = s => app.esc(s);
  const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };

  /* ---------------- header and the note under the summary ---------------- */
  function paint() {
    $('#acct').hidden = false;
    $('#btnLogin').hidden = $('#btnSignup').hidden = !!me;
    $('#userMenu').hidden = !me;
    $('#adminTab').hidden = !(me && me.role === 'admin');
    if (me) { $('#meName').textContent = me.name; $('#meRole').hidden = me.role !== 'admin'; }
    const note = $('#acctNote'); note.hidden = false;
    note.innerHTML = me
      ? `Signed in as <b>${esc(me.name)}</b>. <span id="saveState">${stateText()}</span>`
      : `<button type="button" class="linkbtn" data-a="login">Log in</button> or <button type="button" class="linkbtn" data-a="signup">sign up</button> to keep your checklist on every device.`;
  }
  const stateText = () => ({ saving: 'Saving…', saved: 'All changes saved to your account.', error: 'Could not save yet. Retrying…' }[saveState]);
  function setSave(s) { saveState = s; const el = $('#saveState'); if (el) el.textContent = stateText(); }

  /* ---------------- sign in: load the account's checklist ---------------- */
  async function enter() {
    const u = A.user();
    const prof = await A.profile();
    if (!prof) { const e = new Error('Your account is not set up yet. The site owner needs to run supabase/setup.sql.'); e.status = 404; throw e; }
    if (prof.blocked) { await A.signOut(); me = null; app.clearAccount(); paint(); app.toast('This account has been blocked by the admin.'); return false; }
    let cloud = null, offline = false;
    try { cloud = await A.getChecklist(); } catch (e) { if (!e.network) throw e; cloud = app.cachedStore(u.id); offline = true; }
    const guest = app.guestStore();
    let data = cloud, push = false;
    if (app.isEmpty(cloud) && !app.isEmpty(guest)) { data = guest; push = true; }   // first login: bring the checklist from this browser along
    me = { id: u.id, email: prof.email, name: prof.display_name || prof.email.split('@')[0], role: prof.role };
    saveState = 'saved'; dirty = false;
    app.setAccount({ id: me.id, name: me.name, role: me.role }, data || {}, push);
    paint();
    if (push) { app.dropGuest(); app.toast('Moved your checklist from this browser into your account'); }
    if (offline) app.toast('You appear to be offline. Showing your last saved checklist.');
    return true;
  }

  /* ---------------- saving ---------------- */
  function queueSave(store) {
    pending = store; dirty = true; setSave('saving');
    clearTimeout(saveTimer); saveTimer = setTimeout(() => flush(), 700);
  }
  async function flush(keepalive) {
    clearTimeout(saveTimer);
    if (!me || !dirty) return;
    if (saving) { saveTimer = setTimeout(() => flush(), 400); return; }
    const snapshot = JSON.parse(JSON.stringify(pending));
    dirty = false; saving = true;
    try { await A.putChecklist(snapshot, keepalive); if (!dirty) setSave('saved'); }
    catch (e) {
      dirty = true; setSave('error');
      if (e.status === 401 || e.status === 403) verify(true); else saveTimer = setTimeout(() => flush(), 8000);
    } finally { saving = false; }
  }

  /* ---------------- keep in step with the account (blocked? changed role? edited on another device?) ---------------- */
  async function verify(force) {
    if (!me || (!force && Date.now() - lastCheck < 60000)) return;
    lastCheck = Date.now();
    try {
      const prof = await A.profile();
      if (!prof || prof.blocked) { await A.signOut(); me = null; app.clearAccount(); paint(); leaveAdmin(); app.toast('This account has been blocked by the admin.'); return; }
      if (prof.role !== me.role) { me.role = prof.role; app.setRole(prof.role); paint(); if (prof.role !== 'admin') leaveAdmin(); }
      if (!dirty && !saving) {
        const cloud = await A.getChecklist();
        if (cloud && !dirty && !saving && JSON.stringify(app.currentStore()) !== JSON.stringify(cloud) && !app.isEmpty(cloud)) {
          app.setAccount({ id: me.id, name: me.name, role: me.role }, cloud);
        }
      }
    } catch (e) { /* offline: try again later */ }
  }
  const leaveAdmin = () => { if (location.hash === '#admin') location.hash = '#movies'; };

  /* ---------------- the login / sign-up dialog ---------------- */
  let mode = 'login', draft = { name: '', email: '' }, busy = false;
  const dlg = () => $('#authDlg');
  const TITLES = { login: 'Log in', signup: 'Create your account', forgot: 'Reset your password', setpw: 'Choose a new password', changepw: 'Change password' };
  const GO = { login: 'Log in', signup: 'Create account', forgot: 'Send reset link', setpw: 'Save password', changepw: 'Save password' };

  function render() {
    const needsEmail = ['login', 'signup', 'forgot'].includes(mode), needsPass = mode !== 'forgot';
    dlg().innerHTML = `<form class="auth" novalidate>
      <button class="x" type="button" data-a="close" aria-label="Close">×</button>
      <h2 id="aTitle">${TITLES[mode]}</h2>
      ${mode === 'login' || mode === 'signup' ? `<div class="auth-tabs">
        <button type="button" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-a="login">Log in</button>
        <button type="button" class="auth-tab ${mode === 'signup' ? 'active' : ''}" data-a="signup">Sign up</button></div>` : ''}
      ${mode === 'forgot' ? '<p class="auth-note">Enter your email and we will send you a link to choose a new password.</p>' : ''}
      ${mode === 'signup' ? `<label>Name<input id="aName" maxlength="40" autocomplete="name" value="${esc(draft.name)}"></label>` : ''}
      ${needsEmail ? `<label>Email<input id="aEmail" type="email" autocomplete="email" value="${esc(draft.email)}"></label>` : ''}
      ${needsPass ? `<label>${mode === 'setpw' || mode === 'changepw' ? 'New password' : 'Password'}
        <input id="aPass" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
        <label class="show"><input type="checkbox" id="aShow"> Show password</label>` : ''}
      ${mode === 'signup' || mode === 'setpw' || mode === 'changepw' ? '<p class="auth-note">Use at least 8 characters.</p>' : ''}
      <p class="form-error" id="aErr" role="alert"></p>
      <button class="btn primary wide" id="aGo" type="submit">${GO[mode]}</button>
      ${mode === 'login' ? '<button type="button" class="linkbtn" data-a="forgot">Forgot password?</button>' : ''}
      ${mode === 'forgot' ? '<button type="button" class="linkbtn" data-a="login">Back to log in</button>' : ''}
    </form>`;
  }
  function openAuth(m) {
    mode = m; busy = false; render();
    if (!dlg().open) dlg().showModal();
    const first = $('#aName') || $('#aEmail') || $('#aPass'); if (first) first.focus();
  }
  function keepDraft() { const n = $('#aName'), e = $('#aEmail'); if (n) draft.name = n.value; if (e) draft.email = e.value.trim(); }
  function showErr(msg, good) { const el = $('#aErr'); if (!el) return; el.textContent = msg; el.className = 'form-error' + (good ? ' ok' : ''); }
  function friendly(e) {
    const m = String(e.message || '');
    if (/schema cache|does not exist|PGRST20/i.test(m) || e.status === 404) return 'Accounts are not set up yet. The site owner needs to run supabase/setup.sql.';
    if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link we sent.';
    if (/already registered|already been registered/i.test(m)) return 'That email already has an account. Log in instead.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
    if (/same password|different from the old/i.test(m)) return 'Choose a password you have not used before.';
    if (/weak|at least/i.test(m)) return m;
    return m || 'Something went wrong. Try again.';
  }

  async function submit() {
    if (busy) return;
    keepDraft();
    const email = draft.email, name = draft.name.trim(), pass = ($('#aPass') || {}).value || '';
    if (mode === 'signup' && !name) return showErr('Enter your name.');
    if (['login', 'signup', 'forgot'].includes(mode) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr('Enter a valid email address.');
    if (mode === 'login' && !pass) return showErr('Enter your password.');
    if (['signup', 'setpw', 'changepw'].includes(mode) && pass.length < 8) return showErr('Your password needs at least 8 characters.');
    busy = true; $('#aGo').disabled = true; showErr('');
    try {
      if (mode === 'login') {
        await A.signIn(email, pass);
        if (await enter()) { dlg().close(); app.toast(`Welcome back, ${me.name}`); }
        else dlg().close();
      } else if (mode === 'signup') {
        const r = await A.signUp(name, email, pass);
        if (r.signedIn) { if (await enter()) { dlg().close(); app.toast(`Welcome, ${me.name}`); } else dlg().close(); }
        else { showErr('Almost done. We sent a link to your email. Open it to confirm your account, then log in.', true); $('#aGo').hidden = true; }
      } else if (mode === 'forgot') {
        await A.recover(email);
        showErr('If that email has an account, a reset link is on its way.', true); $('#aGo').hidden = true;
      } else {
        await A.changePassword(pass);
        dlg().close(); app.toast('Password updated');
      }
    } catch (e) {
      if (A.hasSession() && !me) await A.signOut();   // signed in at the login service but no usable account: do not stay half signed in
      showErr(friendly(e));
    } finally { busy = false; const g = $('#aGo'); if (g) g.disabled = false; }
  }

  async function logout() {
    $('#userMenu').open = false;
    await flush(); clearTimeout(saveTimer);
    await A.signOut(); me = null; dirty = false;
    app.clearAccount(); paint(); leaveAdmin(); app.toast('Logged out');
  }

  /* ---------------- admin panel ---------------- */
  let adminData = { users: [], q: '' };
  async function loadAdmin(el) {
    el.innerHTML = '<p class="count">Loading users…</p>';
    try {
      adminData.users = (await A.listUsers()) || []; drawAdmin(el);
    } catch (e) {
      el.innerHTML = `<div class="empty"><b>Could not load the users</b>${esc(friendly(e))}<br><br><button type="button" class="btn" data-aa="retry">Try again</button></div>`;
    }
  }
  function drawAdmin(el) {
    const { users } = adminData;
    const q = adminData.q.trim().toLowerCase();
    const shown = users.filter(u => !q || (u.email + ' ' + u.display_name).toLowerCase().includes(q));
    const admins = users.filter(u => u.role === 'admin').length, blocked = users.filter(u => u.blocked).length;
    const totalWatched = users.reduce((n, u) => n + (u.watched || 0), 0);
    el.innerHTML = `<div class="admin">
      <div class="admin-head">
        <div class="admin-stats">
          <div class="astat"><b>${users.length}</b>users</div><div class="astat"><b>${admins}</b>admins</div>
          <div class="astat"><b>${blocked}</b>blocked</div><div class="astat"><b>${totalWatched}</b>titles watched</div>
        </div>
        <input id="adminSearch" type="search" placeholder="Search name or email" aria-label="Search users" autocomplete="off" value="${esc(adminData.q)}">
      </div>
      <div class="table-wrap"><table class="admin-table">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Watched</th><th>Last login</th><th></th></tr></thead>
        <tbody>${shown.length ? shown.map(u => {
          const self = me && u.id === me.id;
          return `<tr><td><b>${esc(u.display_name || '(no name)')}</b><br><small class="muted">${esc(u.email)}</small></td>
            <td><span class="pill ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? 'Admin' : 'User'}</span></td>
            <td><span class="pill ${u.blocked ? 'bad' : 'ok'}">${u.blocked ? 'Blocked' : 'Active'}</span></td>
            <td>${esc(fmtDay(u.created_at))}</td><td>${u.watched || 0}</td><td>${u.last_sign_in_at ? esc(fmtDay(u.last_sign_in_at)) : '<span class="muted">never</span>'}</td>
            <td class="actions-cell">${self ? '<span class="muted">You</span>' : `
              <button type="button" class="mini" data-aa="${u.blocked ? 'unblock' : 'block'}" data-id="${esc(u.id)}">${u.blocked ? 'Unblock' : 'Block'}</button>
              <button type="button" class="mini" data-aa="${u.role === 'admin' ? 'demote' : 'promote'}" data-id="${esc(u.id)}">${u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>
              <button type="button" class="mini danger" data-aa="delete" data-id="${esc(u.id)}">Delete</button>`}</td></tr>`;
        }).join('') : '<tr><td colspan="7" class="muted">No users match.</td></tr>'}</tbody></table></div>
      <p class="admin-note">Blocking signs a person out and stops them logging in. Deleting removes the account and its checklist for good.</p>
    </div>`;
  }
  async function adminAct(btn) {
    const act = btn.dataset.aa, id = btn.dataset.id, u = adminData.users.find(x => x.id === id), el = $('#view');
    if (act === 'retry') return loadAdmin(el);
    if (!u) return;
    if (act === 'delete' && !confirm(`Delete ${u.email}? Their account and checklist are removed for good.`)) return;
    if (act === 'promote' && !confirm(`Make ${u.email} an admin? They will be able to block and delete users.`)) return;
    btn.disabled = true;
    try {
      if (act === 'block') await A.setBlocked(id, true);
      else if (act === 'unblock') await A.setBlocked(id, false);
      else if (act === 'promote') await A.setRole(id, 'admin');
      else if (act === 'demote') await A.setRole(id, 'user');
      else if (act === 'delete') await A.deleteUser(id);
      app.toast({ block: 'User blocked', unblock: 'User unblocked', promote: 'Now an admin', demote: 'No longer an admin', delete: 'User deleted' }[act]);
      if (location.hash === '#admin') loadAdmin(el);
    } catch (e) { btn.disabled = false; app.toast(friendly(e)); }
  }

  /* ---------------- start ---------------- */
  async function boot() {
    A.restore();
    let from = null;
    try { from = await A.fromHash(); } catch (e) { app.toast('That link did not work. Try logging in.'); }
    paint();
    if (A.hasSession()) {
      try { await enter(); }
      catch (e) {
        if (e.network) app.toast('Could not reach your account. Showing the checklist from this browser.');
        else if (e.status === 404 || /relation|schema cache/i.test(e.message)) { await A.signOut(); app.toast('Accounts are not set up yet. The site owner needs to run supabase/setup.sql.'); }
        else if (e.status === 401 || e.status === 403) { await A.signOut(); app.toast('Please log in again.'); }
        else app.toast(friendly(e));
      }
    }
    paint();
    if (from) {
      if (from.error) app.toast(from.error);
      else if (from.type === 'recovery' && me) openAuth('setpw');
      else if (from.type === 'signup' && me) app.toast('Email confirmed. Welcome!');
    }
    if (location.hash === '#admin') app.redraw();   // opened straight onto the admin tab
  }

  function init() {
    app = window.MTApp;
    if (!A || !A.enabled) return;   // no config: the site stays a plain static checklist
    app.hooks.onSave = queueSave;
    app.registerView('admin', loadAdmin);

    document.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if (a) {
        const act = a.dataset.a;
        if (act === 'close') { dlg().close(); return; }
        if (a.closest('#authDlg')) { keepDraft(); openAuth(act); } else openAuth(act);
        return;
      }
      const aa = e.target.closest('[data-aa]'); if (aa) adminAct(aa);
    });
    $('#btnLogin').addEventListener('click', () => openAuth('login'));
    $('#btnSignup').addEventListener('click', () => openAuth('signup'));
    $('#menuPw').addEventListener('click', () => { $('#userMenu').open = false; openAuth('changepw'); });
    $('#menuOut').addEventListener('click', logout);
    dlg().addEventListener('submit', e => { e.preventDefault(); submit(); });
    dlg().addEventListener('change', e => { if (e.target.id === 'aShow') { const p = $('#aPass'); if (p) p.type = e.target.checked ? 'text' : 'password'; } });
    dlg().addEventListener('click', e => { if (e.target === dlg()) dlg().close(); });
    document.addEventListener('input', e => { if (e.target.id === 'adminSearch') { adminData.q = e.target.value; drawAdmin($('#view')); const s = $('#adminSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); else verify(); });
    window.addEventListener('pagehide', () => flush(true));
    boot();
  }

  if (window.MTApp && window.MTApp.isReady) init(); else document.addEventListener('mt-ready', init, { once: true });
})();
