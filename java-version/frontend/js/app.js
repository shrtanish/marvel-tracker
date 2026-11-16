// Marvel Tracker frontend. Talks to the Java backend through /api/... (JSON).
// WHO you are comes from a login cookie that the server sets. This file never sends a user id.

const state = { me: null, needsSetup: false, tab: 'movie', phase: '', search: '', status: '', sort: 'year', rows: [] };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => { s = String(s ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); };   // tanish -> Tanish
const yes = (v) => v === true || v === 1 || v === '1' || v === 'true';   // a MySQL tinyint(1) can arrive as true/false or 1/0

async function api(path, options) {
  let res, data = {};
  try { res = await fetch('/api/' + path, options); }
  catch { throw new Error('Could not reach the server. Is the Java program running?'); }
  try { data = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401 && state.me && !path.startsWith('auth/')) { sessionExpired(); throw new Error('Please log in again.'); }
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

let toastTimer;
function toast(msg, ms = 2400) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ================================================================ logged in / logged out
function setAuthClass(cls) {
  document.body.classList.remove('auth-loading', 'logged-in', 'logged-out');
  document.body.classList.add(cls);
}

function showLoggedOut() {
  state.me = null;
  setAuthClass('logged-out');
  $('userMenu').open = false;
  $('content').innerHTML = '';
  $('pMovieText').textContent = $('pSeriesText').textContent = '–';
  $('pMovieBar').style.width = $('pSeriesBar').style.width = '0';
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  window.scrollTo(0, 0);
  fadeLogo();
}

function sessionExpired() {
  showLoggedOut();
  toast('Your session ended. Please log in again.', 3500);
  openAuth('login');
}

async function enterApp(user) {
  state.me = user;
  state.needsSetup = state.needsSetup && user.role !== 'admin';
  document.body.classList.toggle('needs-setup', state.needsSetup);
  setAuthClass('logged-in');

  $('meName').textContent = cap(user.username);
  const isAdmin = user.role === 'admin';
  $('meRole').hidden = !isAdmin;
  $('adminTab').hidden = !isAdmin;

  // fresh filters for every login
  Object.assign(state, { phase: '', search: '', status: '', sort: 'year' });
  $('search').value = ''; $('sortSelect').value = 'year'; $('statusFilter').value = '';

  const phases = await api('phases');
  $('phaseChips').innerHTML =
    `<button class="chip active" data-phase="">All phases</button>` +
    phases.map((p) => `<button class="chip" data-phase="${p.phase_number}" title="${esc(p.saga)}">Phase ${p.phase_number}</button>`).join('');

  window.scrollTo(0, 0);
  fadeLogo();
  setTab('movie');
  loadProgress();
}

async function boot() {
  try {
    const r = await api('auth/me');
    state.needsSetup = !!r.needs_setup;
    document.body.classList.toggle('needs-setup', state.needsSetup);
    if (r.user) await enterApp(r.user); else showLoggedOut();
  } catch (e) {
    showLoggedOut();
    toast(e.message, 6000);
  }
}

// ================================================================ sign up / log in dialog
const authDlg = $('authDialog'), authForm = $('authForm');

function setAuthMode(mode) {
  authForm.dataset.mode = mode;
  document.querySelectorAll('.auth-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('authTitle').textContent = mode === 'signup' ? 'Create your account' : 'Welcome back';
  $('authSubmit').textContent = mode === 'signup' ? 'Create account' : 'Log in';
  $('auPass').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('authError').textContent = '';
}

function openAuth(mode) {
  authForm.reset();
  $('auPass').type = 'password';
  setAuthMode(mode);
  if (!authDlg.open) authDlg.showModal();
  $('auUser').focus();
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const mode = authForm.dataset.mode, err = $('authError');
  const username = $('auUser').value.trim(), email = $('auEmail').value.trim(), password = $('auPass').value;
  err.textContent = '';

  if (!username || !password) { err.textContent = 'Enter your username and password.'; return; }
  if (mode === 'signup') {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) { err.textContent = 'Username: 3-20 characters, letters, numbers or underscore.'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Please enter a valid email address.'; return; }
    if (password.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
  }

  const btn = $('authSubmit'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Please wait…';
  try {
    const body = mode === 'signup'
      ? { username, email, password, setup_code: state.needsSetup ? $('auCode').value.trim() : '' }
      : { username, password };
    const r = await post('auth/' + mode, body);
    authDlg.close();
    authForm.reset();
    await enterApp(r.user);
    toast('Welcome, ' + cap(r.user.username) + (r.user.role === 'admin' ? ' (admin)' : ''));
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
});

// ================================================================ change password (user menu)
const pwDlg = $('pwDialog'), pwForm = $('pwForm');

pwForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('pwError'), cur = $('pwCurrent').value, next = $('pwNew').value, again = $('pwAgain').value;
  err.textContent = '';
  if (!cur) { err.textContent = 'Enter your current password.'; return; }
  if (next.length < 8) { err.textContent = 'The new password must be at least 8 characters.'; return; }
  if (next !== again) { err.textContent = 'The new passwords do not match.'; return; }
  const btn = $('pwSave'); btn.disabled = true;
  try {
    await post('auth/password', { current_password: cur, new_password: next });
    pwDlg.close();
    toast('Password changed. Your other devices were logged out.', 3500);
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
});

// ================================================================ wiring that never changes
function wireUi() {
  $('hdrLogin').onclick = $('ctaLogin').onclick = () => openAuth('login');
  $('hdrSignup').onclick = $('ctaSignup').onclick = () => openAuth('signup');
  document.querySelectorAll('.auth-tab').forEach((b) => { b.onclick = () => setAuthMode(b.dataset.mode); });
  $('authClose').onclick = () => authDlg.close();
  authDlg.addEventListener('click', (e) => { if (e.target === authDlg) authDlg.close(); });
  $('auShow').onchange = (e) => { $('auPass').type = e.target.checked ? 'text' : 'password'; };

  $('menuPassword').onclick = () => { $('userMenu').open = false; pwForm.reset(); $('pwError').textContent = ''; pwDlg.showModal(); $('pwCurrent').focus(); };
  $('pwClose').onclick = () => pwDlg.close();
  pwDlg.addEventListener('click', (e) => { if (e.target === pwDlg) pwDlg.close(); });
  $('menuLogout').onclick = async () => {
    try { await post('auth/logout'); } catch { /* even if the server is unreachable, leave the page */ }
    showLoggedOut();
    toast('You are logged out.');
  };
  document.addEventListener('click', (e) => { const m = $('userMenu'); if (m.open && !m.contains(e.target)) m.open = false; });

  $('tabs').onclick = (e) => { const b = e.target.closest('.tab'); if (b && !b.hidden) setTab(b.dataset.tab); };
  $('phaseChips').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.phase = b.dataset.phase;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
    loadContent();
  };
  $('sortSelect').onchange = (e) => { state.sort = e.target.value; loadContent(); };
  $('surprise').onclick = surprise;
  $('statusFilter').onchange = (e) => { state.status = e.target.value; loadContent(); };
  let timer;
  $('search').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { state.search = e.target.value.trim(); loadContent(); }, 250); };
}

function setTab(tab) {
  if (tab === 'admin' && !(state.me && state.me.role === 'admin')) tab = 'movie';
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('filters').style.display = (tab === 'stats' || tab === 'admin') ? 'none' : 'flex';
  $('statusFilter').style.display = tab === 'checklist' ? 'none' : '';
  loadContent();
}

function refresh() { loadProgress(); loadContent(); }

// ================================================================ progress bars
async function loadProgress() {
  try {
    const rows = await api('progress');
    for (const r of rows) {
      const key = r.title_type === 'movie' ? 'Movie' : 'Series';
      $('p' + key + 'Text').textContent = `${r.watched} / ${r.total_titles} watched  ·  ${Math.round(r.percent_watched)}%`;
      $('p' + key + 'Bar').style.width = r.percent_watched + '%';
    }
  } catch (e) { /* the header/login state already explains problems */ }
}

// ================================================================ list of cards
let loadSeq = 0;   // if you click tabs quickly, only the newest answer is drawn

async function loadContent() {
  const box = $('content');
  const seq = ++loadSeq;
  box.className = 'grid';
  try {
    if (state.tab === 'stats') { await loadStats(seq); return; }
    if (state.tab === 'admin') { await loadAdmin(seq); return; }

    const p = new URLSearchParams();
    if (state.tab === 'movie' || state.tab === 'series') p.set('type', state.tab);
    if (state.phase) p.set('phase', state.phase);
    if (state.search) p.set('q', state.search);
    if (state.tab !== 'checklist' && state.status) p.set('status', state.status);   // checklist shows both statuses

    let rows = await api('titles?' + p);
    if (seq !== loadSeq) return;
    if (state.tab === 'checklist') rows = rows.filter((r) => r.my_status);
    rows = sortRows(rows);
    state.rows = rows;

    if (!rows.length) {
      box.innerHTML = `<div class="empty">${state.tab === 'checklist' ? 'Your checklist is empty. Mark something from the Movies or Series tab.' : 'Nothing found.'}</div>`;
      return;
    }
    box.innerHTML = rows.map(card).join('');
  } catch (e) {
    if (seq === loadSeq && state.me) box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function sortRows(rows) {
  const by = {
    year: (a, b) => a.release_year - b.release_year || a.title_id - b.title_id,
    newest: (a, b) => b.release_year - a.release_year || b.title_id - a.title_id,
    rating: (a, b) => b.avg_rating - a.avg_rating || b.rating_count - a.rating_count,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...rows].sort(by[state.sort]);
}

// pick a random title the user hasn't watched yet from what is on screen
function surprise() {
  const pool = state.rows.filter((r) => r.my_status !== 'watched');
  if (!pool.length) return toast('Nothing left unwatched here. Nice!');
  openDetails(pool[Math.floor(Math.random() * pool.length)].title_id);
}

const poster = (t) => t.poster_url ? `<img src="${esc(t.poster_url)}" alt="" loading="lazy" onerror="this.remove()">` : '';

function card(t) {
  const isMovie = t.title_type === 'movie';
  const meta = isMovie
    ? `${t.release_year} · ${Math.round(t.runtime_min)} min · ${esc(t.director)}`
    : `${t.release_year} · ${t.seasons} season${t.seasons > 1 ? 's' : ''} · ${t.episodes} episodes`;
  const stars = t.rating_count > 0
    ? `<div class="rating">★ ${Number(t.avg_rating).toFixed(1)} <small>(${t.rating_count})</small></div>`
    : `<div class="rating"><small>No ratings yet</small></div>`;
  const mine = t.my_rating ? ` · you: ${'★'.repeat(t.my_rating)}` : '';
  const dot = t.my_status
    ? `<span class="status-dot ${t.my_status}">${t.my_status === 'watched' ? '✓ Watched' : 'Want to watch'}</span>` : '<span></span>';
  return `
  <article class="card g${t.phase_number}">
    <div class="card-top phase-${t.phase_number}" onclick="openDetails(${t.title_id})">
      <span class="ph-title">${esc(t.name)}</span>${poster(t)}
      <div class="badges"><span class="badge">Phase ${t.phase_number}</span>${dot}</div>
    </div>
    <div class="card-body">
      <div class="card-title" onclick="openDetails(${t.title_id})">${esc(t.name)}</div>
      <div class="meta">${meta}</div>
      ${stars.replace('</div>', esc(mine) + '</div>')}
      <div class="actions">
        <button class="btn ${t.my_status === 'watched' ? 'on-watched' : ''}" onclick="setStatus(${t.title_id}, 'watched', '${t.my_status || ''}')">${t.my_status === 'watched' ? '✓ Watched' : 'Watched'}</button>
        <button class="btn ${t.my_status === 'want_to_watch' ? 'on-want' : ''}" onclick="setStatus(${t.title_id}, 'want_to_watch', '${t.my_status || ''}')">${t.my_status === 'want_to_watch' ? '✓ Want' : '+ Want'}</button>
        <button class="btn" onclick="openRate(${t.title_id})">★ Rate</button>
      </div>
    </div>
  </article>`;
}

// ================================================================ actions
async function setStatus(titleId, status, current) {
  try {
    if (current === status) {            // clicking an active button removes it
      await api(`unwatch?title_id=${titleId}`, { method: 'DELETE' });
      toast('Removed from your checklist');
    } else {
      await post('watch', { title_id: titleId, status });
      toast(status === 'watched' ? 'Marked as watched' : 'Added to want-to-watch');
    }
    refresh();
  } catch (e) { toast(e.message); }
}

const dlg = $('dialog');
const closeDlg = () => dlg.close();
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

async function openDetails(id) {
  try {
    const t = await api('title?id=' + id);
    const isMovie = t.title_type === 'movie';
    const facts = isMovie
      ? `${t.release_year} · ${Math.round(t.runtime_min)} min · directed by ${esc(t.director)} · box office ≈ $${Number(t.box_office_million).toLocaleString()}M`
      : `${t.release_year} · ${t.seasons} season(s) · ${t.episodes} episodes · ${esc(t.platform)}`;
    $('dialogBody').innerHTML = `
    <div class="d-head"><h2>${esc(t.name)}</h2><button class="x" onclick="closeDlg()">×</button></div>
    ${t.poster_url ? `<img class="d-poster" src="${esc(t.poster_url)}" alt="" onerror="this.remove()">` : ''}
    <div class="d-sub">Phase ${t.phase_number} · ${esc(t.saga)} · ${isMovie ? 'Movie' : 'Series'}<br>${facts}</div>
    <p>${esc(t.synopsis)}</p>
    <div class="d-section"><h4>Genres</h4>${t.genres.map((g) => `<span class="tag">${esc(g.name)}</span>`).join('')}</div>
    <div class="d-section"><h4>Characters</h4>${t.characters.map((c) => `<span class="tag ${c.role_type}" title="${esc(c.real_name)} · ${c.role_type}">${esc(c.hero_name)}</span>`).join('')}</div>
    <div class="d-section"><h4>Reviews · ${t.rating_count ? '★ ' + Number(t.avg_rating).toFixed(1) + ' average' : 'none yet'}</h4>
      ${t.reviews.map((r) => `<div class="review"><span class="who2">${esc(cap(r.username))}</span> · <span style="color:var(--gold)">${'★'.repeat(r.rating)}</span><br>${esc(r.review_text)}</div>`).join('') || '<div class="meta">Be the first to review.</div>'}
    </div>
    <div class="row-end"><button class="btn primary" onclick="openRate(${t.title_id})">★ Rate / Review</button></div>`;
    $('dialogBody').onclick = null;
    if (!dlg.open) dlg.showModal();
  } catch (e) { toast(e.message); }
}

async function openRate(id) {
  try {
    const t = await api('title?id=' + id);
    const mine = t.reviews.find((r) => r.username === state.me.username);
    let rating = mine ? mine.rating : 0;
    $('dialogBody').innerHTML = `
    <div class="d-head"><h2>Rate: ${esc(t.name)}</h2><button class="x" onclick="closeDlg()">×</button></div>
    <div class="stars" id="stars">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}">★</button>`).join('')}</div>
    <textarea id="reviewText" maxlength="500" placeholder="Write a short review (optional)">${esc(mine ? mine.review_text : '')}</textarea>
    <div class="row-end"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="saveReview">Save</button></div>`;
    $('dialogBody').onclick = null;
    const paint = () => document.querySelectorAll('#stars button').forEach((b) => b.classList.toggle('lit', Number(b.dataset.n) <= rating));
    $('stars').onclick = (e) => { const b = e.target.closest('button'); if (b) { rating = Number(b.dataset.n); paint(); } };
    paint();
    $('saveReview').onclick = async () => {
      if (!rating) return toast('Pick a star rating first');
      try {
        await post('review', { title_id: id, rating, review_text: $('reviewText').value });
        closeDlg(); toast('Review saved. Marked as watched'); refresh();
      } catch (e) { toast(e.message); }
    };
    if (!dlg.open) dlg.showModal();
  } catch (e) { toast(e.message); }
}

// ================================================================ stats tab
async function loadStats(seq) {
  const s = await api('stats');
  if (seq !== loadSeq) return;
  const table = (head, rows) => `<table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  $('content').className = '';
  $('content').innerHTML = `<div class="stats">
    <div class="stat-card"><h3>Titles per phase</h3>${table(['Phase', 'Movies', 'Series', 'Avg ★'], s.phases.map((p) => [p.phase_number, Math.round(p.movies), Math.round(p.series), p.avg_rating ?? '–']))}</div>
    <div class="stat-card"><h3>Top rated</h3>${table(['Title', 'Type', 'Avg ★'], s.top_rated.map((t) => [t.name, t.title_type, t.avg_rating]))}</div>
    <div class="stat-card"><h3>Most appearances</h3>${table(['Character', 'Titles'], s.characters.map((c) => [c.hero_name, c.appearances]))}</div>
    <div class="stat-card"><h3>Leaderboard (watched)</h3>${table(['User', 'Watched'], s.leaderboard.map((l) => [cap(l.username), l.watched]))}</div>
  </div>`;
}

// ================================================================ admin tab (admins only; the server checks this too)
let adminUsers = [];
let adminQuery = '';

async function loadAdmin(seq) {
  const rows = await api('admin/users');
  if (seq !== loadSeq) return;
  adminUsers = rows;
  renderAdmin();
}

function fmtTime(v) { return v ? String(v).replace('T', ' ').slice(0, 16) : 'Never'; }

function renderAdmin() {
  const count = (fn) => adminUsers.filter(fn).length;
  $('content').className = '';
  $('content').innerHTML = `
  <div class="admin">
    <div class="admin-head">
      <div class="admin-stats">
        <div class="astat"><b>${adminUsers.length}</b>users</div>
        <div class="astat"><b>${count((u) => u.role === 'admin')}</b>admins</div>
        <div class="astat"><b>${count((u) => !yes(u.is_active))}</b>suspended</div>
        <div class="astat"><b>${count((u) => !yes(u.has_password))}</b>without password</div>
      </div>
      <input id="adminSearch" type="search" placeholder="Find a user…" value="${esc(adminQuery)}">
    </div>
    <div class="table-wrap">
      <table class="admin-table">
        <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Activity</th><th>Last login</th><th>Actions</th></tr></thead>
        <tbody id="adminBody"></tbody>
      </table>
    </div>
    <p class="admin-note">Passwords are stored as salted hashes, so nobody (not even you) can read them. If someone forgets theirs, use <b>Reset password</b>.</p>
  </div>`;
  $('adminSearch').oninput = (e) => { adminQuery = e.target.value; fillAdminRows(); };
  $('adminBody').onclick = (e) => {
    const b = e.target.closest('button[data-act]');
    if (b) adminAction(b.dataset.act, Number(b.dataset.id));
  };
  fillAdminRows();
}

function fillAdminRows() {
  const q = adminQuery.trim().toLowerCase();
  const list = adminUsers.filter((u) => !q || u.username.toLowerCase().includes(q) || String(u.email || '').toLowerCase().includes(q));
  $('adminBody').innerHTML = list.map(adminRow).join('') || `<tr><td colspan="7" class="empty">No users match.</td></tr>`;
}

function adminRow(u) {
  const isMe = u.user_id === state.me.user_id;
  const active = yes(u.is_active), hasPw = yes(u.has_password), locked = yes(u.is_locked);
  const role = u.role === 'admin' ? '<span class="pill admin">Admin</span>' : '<span class="pill">User</span>';
  const status = !active ? '<span class="pill bad">Suspended</span>'
    : locked ? '<span class="pill warn" title="Too many wrong passwords. Resetting the password unlocks it.">Locked</span>'
    : !hasPw ? '<span class="pill warn" title="This account has no password yet, so nobody can log in as it.">No password</span>'
    : '<span class="pill ok">Active</span>';
  const id = u.user_id;
  const actions = isMe ? '<span class="muted">This is you</span>' : `
    <button class="mini" data-act="role" data-id="${id}">${u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>
    <button class="mini" data-act="status" data-id="${id}">${active ? 'Suspend' : 'Reactivate'}</button>
    <button class="mini" data-act="password" data-id="${id}">${hasPw ? 'Reset password' : 'Set password'}</button>
    <button class="mini danger" data-act="delete" data-id="${id}">Delete</button>`;
  return `<tr>
    <td><b>${esc(cap(u.username))}</b></td>
    <td class="muted">${esc(u.email)}</td>
    <td>${role}</td>
    <td>${status}</td>
    <td class="muted">${u.watched} watched · ${u.want_to_watch} want · ${u.reviews} reviews</td>
    <td class="muted">${esc(fmtTime(u.last_login))}</td>
    <td class="actions-cell">${actions}</td>
  </tr>`;
}

async function adminAction(act, id) {
  const u = adminUsers.find((x) => x.user_id === id);
  if (!u) return;
  const name = cap(u.username), active = yes(u.is_active);
  try {
    if (act === 'role') {
      const makeAdmin = u.role !== 'admin';
      if (!await confirmDialog(makeAdmin ? `Make ${name} an admin?` : `Remove admin rights from ${name}?`,
            makeAdmin ? 'Admins can see and control every user, including you.' : `${name} will become a normal user.`,
            makeAdmin ? 'Make admin' : 'Remove admin')) return;
      await post('admin/role', { user_id: id, role: makeAdmin ? 'admin' : 'user' });
      toast(makeAdmin ? `${name} is now an admin.` : `${name} is a normal user now.`);
    } else if (act === 'status') {
      if (active && !await confirmDialog(`Suspend ${name}?`, `${name} will be logged out right away and can't log in until you reactivate the account. Their data is kept.`, 'Suspend', true)) return;
      await post('admin/status', { user_id: id, active: !active });
      toast(active ? `${name} is suspended.` : `${name} is active again.`);
    } else if (act === 'password') {
      const pw = await passwordPrompt(name);
      if (pw === null) return;
      await post('admin/password', { user_id: id, password: pw });
      toast(`Password set for ${name}. They were logged out.`, 3500);
    } else if (act === 'delete') {
      if (!await confirmDialog(`Delete ${name}?`,
            `This permanently deletes the account, ${u.watched + u.want_to_watch} checklist entries and ${u.reviews} reviews. This can't be undone.`, 'Delete', true)) return;
      await post('admin/delete', { user_id: id });
      toast(`${name} was deleted.`);
    }
    await loadAdmin(loadSeq);
  } catch (e) { toast(e.message, 4500); }
}

// ---- small dialogs that reuse the shared #dialog box (resolve when it closes)
function confirmDialog(title, message, okText = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    $('dialogBody').innerHTML = `
      <div class="d-head"><h2>${esc(title)}</h2><button class="x" data-r="0" aria-label="Close">×</button></div>
      <p class="confirm-text">${esc(message)}</p>
      <div class="row-end"><button class="btn" data-r="0">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okText)}</button></div>`;
    let result = false;
    const done = () => { dlg.removeEventListener('close', done); $('dialogBody').onclick = null; resolve(result); };
    dlg.addEventListener('close', done);
    $('dialogBody').onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { result = b.dataset.r === '1'; dlg.close(); } };
    dlg.showModal();
  });
}

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';   // no look-alike characters (0/O, 1/l/I)
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

function passwordPrompt(name) {
  return new Promise((resolve) => {
    $('dialogBody').innerHTML = `
      <div class="d-head"><h2>Set a password for ${esc(name)}</h2><button class="x" data-r="0" aria-label="Close">×</button></div>
      <p class="confirm-text">Type a new password (at least 8 characters) or generate one, then tell ${esc(name)}. They will be logged out everywhere.</p>
      <div class="pw-row"><input id="adminNewPw" type="text" maxlength="128" autocomplete="off" spellcheck="false" placeholder="New password"><button class="btn" id="adminGenPw" type="button">Generate</button></div>
      <div class="form-error" id="adminPwErr" role="alert"></div>
      <div class="row-end"><button class="btn" data-r="0">Cancel</button><button class="btn primary" id="adminSavePw">Set password</button></div>`;
    let result = null;
    const done = () => { dlg.removeEventListener('close', done); $('dialogBody').onclick = null; resolve(result); };
    dlg.addEventListener('close', done);
    $('dialogBody').onclick = (e) => { if (e.target.closest('[data-r="0"]')) dlg.close(); };
    $('adminGenPw').onclick = () => { $('adminNewPw').value = randomPassword(); $('adminPwErr').textContent = ''; };
    $('adminSavePw').onclick = () => {
      const v = $('adminNewPw').value;
      if (v.length < 8) { $('adminPwErr').textContent = 'The password must be at least 8 characters.'; return; }
      result = v; dlg.close();
    };
    dlg.showModal();
    $('adminNewPw').focus();
  });
}

// ================================================================ logo fades as you scroll
const bgLogo = document.getElementById('bgLogo');
function fadeLogo() {
  const t = Math.min(window.scrollY / (window.innerHeight * 0.75), 1);   // 0 at top .. 1 after 75% of a screen
  bgLogo.style.opacity = String(1 - t * 0.93);                         // ends slightly visible (7%)
}
window.addEventListener('scroll', fadeLogo, { passive: true });
fadeLogo();

// ================================================================ Avengers: Doomsday countdown
// Release: 18 December 2026, 05:00 UTC.  (Frontend only, no database needed.)
const DOOMSDAY = new Date('2026-12-18T05:00:00Z');

function countdownParts(now, target) {
  // whole calendar months first, then the leftover days / hours / minutes / seconds
  let months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  const addMonths = (d, m) => {
    const r = new Date(d.getFullYear(), d.getMonth() + m, 1, d.getHours(), d.getMinutes(), d.getSeconds());
    const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(d.getDate(), last));
    return r;
  };
  let anchor = addMonths(now, months);
  if (anchor > target) { months--; anchor = addMonths(now, months); }
  let rest = Math.floor((target - anchor) / 1000);
  const days = Math.floor(rest / 86400); rest %= 86400;
  const hours = Math.floor(rest / 3600); rest %= 3600;
  return { months, days, hours, minutes: Math.floor(rest / 60), seconds: rest % 60 };
}

function tickCountdown() {
  const box = document.getElementById('countdown');
  const now = new Date();
  if (now >= DOOMSDAY) {
    box.classList.add('cd-done');
    document.getElementById('cdTitle').textContent = 'DOOMSDAY IS HERE';
    return;
  }
  const p = countdownParts(now, DOOMSDAY);
  for (const k of ['months', 'days', 'hours', 'minutes', 'seconds']) {
    document.getElementById('cd' + k[0].toUpperCase() + k.slice(1)).textContent = String(p[k]).padStart(2, '0');
  }
}
tickCountdown();
setInterval(tickCountdown, 1000);

// ================================================================ go
wireUi();
boot();
