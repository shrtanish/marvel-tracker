/* Marvel Tracker: static site, no backend.
   The catalogue is data/catalog.json. Posters are looked up in data/posters.json (filled by scripts/fetch-posters.mjs).
   Your checklist is saved in this browser (localStorage) and can be backed up with the Backup menu. */
(() => {
  'use strict';

  const KEY = 'marvel-tracker-v1';
  const DOOMSDAY = new Date('2026-12-18T05:00:00Z');   // Avengers: Doomsday, 05:00 UTC
  const IMG = 'https://image.tmdb.org/t/p/';
  const WIKI_API = 'https://en.wikipedia.org/w/api.php';
  const WIKI_KEY = 'marvel-tracker-wiki-v2';   // v2: older saved answers were empty
  const WIKI_DAYS = 30;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
  const fmtRun = min => min ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : '';

  /* ---------------- data ---------------- */
  let T = [];            // all titles, in release order
  let BY = {};           // slug -> title
  let posters = {};      // slug -> TMDB poster path (data/posters.json, optional)
  let wikiPosters = {};  // slug -> Wikipedia poster URL (looked up in the browser, cached)
  let wikiMiss = [];     // slugs Wikipedia had no poster for (not asked again until the cache expires)
  let store = emptyStore();
  let memoryCopy = null; // used if the browser blocks localStorage
  let account = null;    // { id, name, role } while someone is logged in (js/account.js); otherwise the guest checklist is used
  const hooks = {};      // hooks.onSave(store) is called after every change while logged in
  const views = {};      // extra tabs registered by js/account.js (the admin panel)

  function emptyStore() { return { watched: {}, want: {}, rating: {}, note: {} }; }

  function clean(o) {    // keep only valid entries (used for localStorage and for imported files)
    const s = emptyStore();
    if (!o || typeof o !== 'object') return s;
    const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    for (const [k, v] of Object.entries(o.watched || {})) if (BY[k] && !BY[k].upcoming && isDate(v)) s.watched[k] = v;
    for (const [k, v] of Object.entries(o.want || {})) if (BY[k] && v && !s.watched[k]) s.want[k] = true;
    for (const [k, v] of Object.entries(o.rating || {})) if (BY[k] && Number.isInteger(v) && v >= 1 && v <= 5) s.rating[k] = v;
    for (const [k, v] of Object.entries(o.note || {})) if (BY[k] && typeof v === 'string' && v.trim()) s.note[k] = v.slice(0, 1000);
    return s;
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return clean(JSON.parse(raw)); } catch (e) { /* blocked or damaged */ }
    return memoryCopy ? clean(memoryCopy) : emptyStore();
  }
  function save() {
    if (account) {   // logged in: keep a copy here and let js/account.js send it to the account
      try { localStorage.setItem(KEY + '-u-' + account.id, JSON.stringify(store)); } catch (e) { /* ignore */ }
      if (hooks.onSave) hooks.onSave(store);
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { memoryCopy = JSON.parse(JSON.stringify(store)); }
  }

  const released = () => T.filter(t => !t.upcoming);
  const stateOf = t => store.watched[t.slug] ? 'watched' : store.want[t.slug] ? 'want' : t.upcoming ? 'soon' : 'todo';

  /* ---------------- small pieces ---------------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function wireImages(root) {
    root.querySelectorAll('img').forEach(i => i.addEventListener('error', () => { const w = i.parentElement; i.remove(); if (w) w.classList.remove('tc'); }, { once: true }));
  }
  // Wikipedia's picture for a series is usually its wide title card, not a poster, so it is shown whole on a dark card
  const isTitleCard = t => t.type === 'series' && !posters[t.slug];
  function posterUrl(slug, big) {
    if (posters[slug]) return `${IMG}${big ? 'w500' : 'w342'}${posters[slug]}`;
    return wikiPosters[slug] || '';
  }
  function posterHtml(t, big) {
    const u = posterUrl(t.slug, big);
    return `<div class="pw${u && isTitleCard(t) ? ' tc' : ''}" data-pslug="${t.slug}" data-big="${big ? 1 : ''}">
      <div class="fallback phase-${t.phase}"><b>${esc(t.name)}</b><span>${t.year}</span></div>
      ${u ? `<img src="${esc(u)}" alt="${big ? esc(t.name) + ' poster' : ''}" loading="lazy" decoding="async">` : ''}</div>`;
  }
  function applyPosters() {   // add posters that arrived after the page was drawn
    document.querySelectorAll('.pw').forEach(w => {
      if (w.querySelector('img')) return;
      const t = BY[w.dataset.pslug], u = t && posterUrl(t.slug, w.dataset.big);
      if (!u) return;
      const i = new Image(); i.alt = w.dataset.big ? t.name + ' poster' : ''; i.decoding = 'async'; i.src = u;
      i.addEventListener('error', () => { i.remove(); w.classList.remove('tc'); }, { once: true });
      if (isTitleCard(t)) w.classList.add('tc');
      w.appendChild(i);
    });
  }

  /* ---------------- posters from Wikipedia (no key needed; used when data/posters.json has none) ---------------- */
  function wikiCache() {
    try {
      const o = JSON.parse(localStorage.getItem(WIKI_KEY));
      if (o && typeof o.p === 'object' && Date.now() - o.t < WIKI_DAYS * 864e5) { wikiMiss = Array.isArray(o.m) ? o.m : []; return o.p; }
    } catch (e) { /* none yet */ }
    return {};
  }
  function wikiSave(t0) { try { localStorage.setItem(WIKI_KEY, JSON.stringify({ t: t0 || Date.now(), p: wikiPosters, m: wikiMiss })); } catch (e) { /* ignore */ } }
  const wikiOk = u => typeof u === 'string' && /^https:\/\/upload\.wikimedia\.org\//.test(u);
  async function wikiQuery(extra) {
    const qs = new URLSearchParams({ action: 'query', format: 'json', origin: '*', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '500', pilicense: 'any', ...extra });
    const r = await fetch(`${WIKI_API}?${qs}`);
    if (!r.ok) throw new Error('wiki ' + r.status);
    return (await r.json()).query || {};
  }
  async function loadWikiPosters() {
    wikiPosters = wikiCache();
    const stamp = (() => { try { return JSON.parse(localStorage.getItem(WIKI_KEY)).t; } catch (e) { return 0; } })() || Date.now();
    for (const k of Object.keys(wikiPosters)) if (!wikiOk(wikiPosters[k]) || posters[k]) delete wikiPosters[k];
    applyPosters();
    const need = () => T.filter(t => !posters[t.slug] && !wikiPosters[t.slug] && !wikiMiss.includes(t.slug));
    if (!need().length) return;
    try {
      // step 1: look up the article titles in batches of 50
      const todo = need();
      for (let i = 0; i < todo.length; i += 50) {
        const part = todo.slice(i, i + 50), titles = part.map(t => t.wiki || t.name);
        const q = await wikiQuery({ redirects: '1', titles: titles.join('|') });
        const hop = {};   // title as sent -> title as stored (normalised, then redirected)
        [...(q.normalized || []), ...(q.redirects || [])].forEach(x => { hop[x.from] = x.to; });
        const byTitle = {}; Object.values(q.pages || {}).forEach(pg => { byTitle[pg.title] = pg; });
        part.forEach(t => {
          let k = t.wiki || t.name; for (let n = 0; n < 4 && hop[k]; n++) k = hop[k];
          const u = byTitle[k] && byTitle[k].thumbnail && byTitle[k].thumbnail.source;
          if (wikiOk(u)) wikiPosters[t.slug] = u;
        });
      }
      applyPosters(); wikiSave(stamp);
      // step 2: search for the ones that did not match (a few at a time)
      for (const t of need()) {
        const kind = t.type === 'movie' ? 'film' : 'TV series';
        const q = await wikiQuery({ generator: 'search', gsrsearch: `${t.name} ${t.year} Marvel ${kind}`, gsrnamespace: '0', gsrlimit: '1' });
        const pg = Object.values(q.pages || {})[0], u = pg && pg.thumbnail && pg.thumbnail.source;
        if (wikiOk(u)) { wikiPosters[t.slug] = u; applyPosters(); } else wikiMiss.push(t.slug);
      }
      wikiSave(stamp);
    } catch (e) { /* offline or blocked: the title cards stay */ }
  }
  function stars(n) { return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : ''; }

  /* ---------------- hero: contact sheet and summary ---------------- */
  function renderSheet() {
    const groups = {};
    T.forEach(t => (groups[t.phase] = groups[t.phase] || []).push(t));
    $('#sheet').innerHTML = Object.keys(groups).sort((a, b) => a - b).map(p => `
      <div class="group">
        <div class="tiles">${groups[p].map(t => {
          const s = stateOf(t), label = { watched: 'watched', want: 'on your want-to-watch list', todo: 'not watched yet', soon: 'coming soon' }[s];
          return `<button class="tile ${t.type} ${s}" data-slug="${t.slug}" title="${esc(t.name)} (${t.year})" aria-label="${esc(t.name)}, ${label}"></button>`;
        }).join('')}</div>
        <div class="gl">Phase ${p}</div>
      </div>`).join('');
  }
  function counts(type) {
    const all = released().filter(t => t.type === type);
    return { done: all.filter(t => store.watched[t.slug]).length, total: all.length };
  }
  function renderSummary() {
    const m = counts('movie'), s = counts('series'), el = $('#summary');
    if (!m.done && !s.done) {
      el.innerHTML = `Nothing ticked yet. Pick a tile above or open <a href="#movies"><b>Movies</b></a> to start. There are <b>${m.total}</b> movies and <b>${s.total}</b> series so far.`;
    } else if (m.done === m.total && s.done === s.total) {
      el.innerHTML = `You have seen <b>everything released so far</b>. Doomsday is next.`;
    } else {
      el.innerHTML = `You have watched <b>${m.done} of ${m.total}</b> movies and <b>${s.done} of ${s.total}</b> series.`;
    }
  }

  /* ---------------- views ---------------- */
  const ui = { tab: 'movies', phase: 0, status: '', sort: 'release', q: '' };
  const view = () => $('#view');

  function card(t) {
    const s = stateOf(t), r = store.rating[t.slug];
    const dot = s === 'watched' ? '<span class="status-dot watched">✓ Watched</span>' : s === 'want' ? '<span class="status-dot want">★ Want</span>' : '';
    const soon = t.upcoming ? `<span class="soon-tag">In cinemas ${fmtDate(t.releaseDate)}</span>` : '';
    const info = t.type === 'movie' ? [t.year, t.runtime ? fmtRun(t.runtime) : ''] : [t.year, t.seasons ? t.seasons + (t.seasons > 1 ? ' seasons' : ' season') : ''];
    return `<article class="card g${t.phase}">
      <button class="card-top" data-slug="${t.slug}" aria-label="Open ${esc(t.name)}">${posterHtml(t)}<span class="badges"><span class="badge">Phase ${t.phase}</span>${dot}</span>${soon}</button>
      <div class="card-body">
        <button class="card-title" data-slug="${t.slug}">${esc(t.name)}</button>
        <div class="meta">${info.filter(Boolean).join(' · ')}</div>
        ${r ? `<div class="rating" aria-label="Your rating ${r} of 5">${stars(r)}</div>` : ''}
        <div class="actions">
          <button class="qbtn ${s === 'watched' ? 'on-watched' : ''}" data-q="watch" data-slug="${t.slug}" ${t.upcoming ? 'disabled' : ''}>${s === 'watched' ? '✓ Watched' : 'Watched'}</button>
          <button class="qbtn ${s === 'want' ? 'on-want' : ''}" data-q="want" data-slug="${t.slug}" ${s === 'watched' ? 'disabled' : ''}>${s === 'want' ? '✓ Want' : '+ Want'}</button>
        </div>
      </div>
    </article>`;
  }

  function renderBrowse(type) {
    const all = T.filter(t => t.type === type);
    const phases = [...new Set(all.map(t => t.phase))].sort();
    view().innerHTML = `
      <div class="filters">
        <div class="chips" role="group" aria-label="Phase">
          <button class="chip" data-phase="0">All phases</button>
          ${phases.map(p => `<button class="chip" data-phase="${p}">Phase ${p}</button>`).join('')}
        </div>
        <div class="controls">
          <input id="q" type="search" placeholder="Search by title, hero, director or genre" aria-label="Search" autocomplete="off">
          <select id="status" aria-label="Show">
            <option value="">All titles</option><option value="watched">Watched</option>
            <option value="want">Want to watch</option><option value="todo">Not watched yet</option>
          </select>
          <select id="sort" aria-label="Sort by">
            <option value="release">Release order</option><option value="newest">Newest first</option>
            <option value="az">A to Z</option><option value="rating">My rating</option>
            <option value="length">${type === 'movie' ? 'Longest runtime' : 'Most episodes'}</option>
          </select>
        </div>
      </div>
      <div class="count-row"><p class="count" id="count"></p><button type="button" class="phase-btn" id="phaseBtn"></button></div>
      <div class="grid" id="grid"></div>`;
    $('#q').value = ui.q; $('#status').value = ui.status; $('#sort').value = ui.sort;
    view().querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => { ui.phase = +c.dataset.phase; fillGrid(); }));
    $('#q').addEventListener('input', e => { ui.q = e.target.value; fillGrid(); });
    $('#status').addEventListener('change', e => { ui.status = e.target.value; fillGrid(); });
    $('#sort').addEventListener('change', e => { ui.sort = e.target.value; fillGrid(); });
    $('#phaseBtn').addEventListener('click', markScope);
    fillGrid();
  }

  /* Mark a whole phase (movies and series together) as watched, or clear it again */
  const scopeTitles = () => released().filter(t => !ui.phase || t.phase === ui.phase);
  const scopeName = () => ui.phase ? `Phase ${ui.phase}` : 'every phase';
  function updatePhaseBtn() {
    const b = $('#phaseBtn'); if (!b) return;
    const left = scopeTitles().filter(t => !store.watched[t.slug]).length;
    b.classList.toggle('done', !left);
    b.textContent = left ? `✓ Mark ${ui.phase ? 'Phase ' + ui.phase : 'everything'} as watched (${left})` : `${ui.phase ? 'Phase ' + ui.phase : 'Everything'} complete · Undo`;
    b.title = 'Applies to movies and series together';
  }
  function markScope() {
    const scope = scopeTitles(), left = scope.filter(t => !store.watched[t.slug]), on = left.length > 0;
    const todo = on ? left : scope.filter(t => store.watched[t.slug]); if (!todo.length) return;
    const mv = todo.filter(t => t.type === 'movie').length, sr = todo.length - mv;
    const msg = on ? `Mark ${todo.length} titles in ${scopeName()} as watched (${mv} movies and ${sr} series)? Titles you already watched keep their dates.`
                   : `Mark all ${todo.length} watched titles in ${scopeName()} as not watched? Your ratings and notes stay.`;
    if (!confirm(msg)) return;
    const d = today();
    todo.forEach(t => { if (on) { store.watched[t.slug] = d; delete store.want[t.slug]; } else delete store.watched[t.slug]; });
    afterChange(); toast(on ? `${scopeName()} marked as watched` : `${scopeName()} cleared`);
  }

  function fillGrid() {
    const type = ui.tab === 'series' ? 'series' : 'movie';
    const all = T.filter(t => t.type === type);
    const q = ui.q.trim().toLowerCase();
    let items = all.filter(t => {
      if (ui.phase && t.phase !== ui.phase) return false;
      if (ui.status && stateOf(t) !== ui.status && !(ui.status === 'todo' && stateOf(t) === 'soon')) return false;
      if (q) {
        const hay = [t.name, t.director, t.platform, ...t.genres, ...t.characters.map(c => c.name + ' ' + c.real)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const idx = new Map(T.map((t, i) => [t.slug, i]));
    const by = {
      release: (a, b) => idx.get(a.slug) - idx.get(b.slug),
      newest: (a, b) => idx.get(b.slug) - idx.get(a.slug),
      az: (a, b) => a.name.localeCompare(b.name),
      rating: (a, b) => (store.rating[b.slug] || 0) - (store.rating[a.slug] || 0) || idx.get(a.slug) - idx.get(b.slug),
      length: (a, b) => ((b.runtime || b.episodes || 0) - (a.runtime || a.episodes || 0))
    };
    items.sort(by[ui.sort] || by.release);
    view().querySelectorAll('.chip').forEach(c => c.classList.toggle('on', +c.dataset.phase === ui.phase));
    $('#count').textContent = `${items.length} of ${all.length} ${type === 'movie' ? 'movies' : 'series'}`;
    updatePhaseBtn();
    const grid = $('#grid');
    grid.innerHTML = items.length ? items.map(card).join('') :
      `<div class="empty" style="grid-column:1/-1"><b>Nothing matches</b>Clear the search or pick another phase or status.</div>`;
    wireImages(grid);
  }

  function row(t, when) {
    return `<button class="row" data-slug="${t.slug}">
      <div class="th">${posterHtml(t)}</div>
      <div><b>${esc(t.name)}</b><small>${t.type === 'movie' ? 'Movie' : 'Series'}, ${t.year}, Phase ${t.phase}${store.rating[t.slug] ? ' &nbsp; <span class="stars">' + stars(store.rating[t.slug]) + '</span>' : ''}</small></div>
      <div class="when">${when || ''}</div></button>`;
  }
  function renderChecklist() {
    const next = released().filter(t => !store.watched[t.slug]).slice(0, 4);
    const want = T.filter(t => store.want[t.slug]);
    const done = released().filter(t => store.watched[t.slug]).sort((a, b) => store.watched[b.slug].localeCompare(store.watched[a.slug]));
    view().innerHTML = `
      <h2 class="section-h">Up next<small>earliest releases you have not watched</small></h2>
      <div class="rows">${next.length ? next.map(t => row(t)).join('') : `<div class="empty"><b>All caught up</b>You have watched everything released so far.</div>`}</div>
      <h2 class="section-h">Want to watch<small>${want.length}</small></h2>
      <div class="rows">${want.length ? want.map(t => row(t, t.upcoming ? 'Out ' + fmtDate(t.releaseDate) : '')).join('') : `<div class="empty"><b>Nothing saved</b>Open a title and choose Want to watch to keep it here.</div>`}</div>
      <h2 class="section-h">Watched<small>${done.length}</small></h2>
      <div class="rows">${done.length ? done.map(t => row(t, fmtDate(store.watched[t.slug]))).join('') : `<div class="empty"><b>No titles yet</b>Tick something off from Movies or Series and it shows up here.</div>`}</div>`;
    wireImages(view());
  }

  function bars(rows, gold) {
    const max = Math.max(1, ...rows.map(r => r.max ?? r.n));
    return `<div class="bars">${rows.map(r => `
      <div class="bar-row"><span class="n">${esc(r.label)}</span>
        <span class="track"><span class="fill${gold ? ' gold' : ''}" style="display:block;width:${Math.round(r.n / max * 100)}%"></span></span>
        <span class="v">${r.text ?? r.n}</span></div>`).join('')}</div>`;
  }
  function renderStats() {
    const rel = released(), watched = rel.filter(t => store.watched[t.slug]);
    const pct = rel.length ? Math.round(watched.length / rel.length * 100) : 0;
    const mWatched = watched.filter(t => t.type === 'movie'), mLeft = rel.filter(t => t.type === 'movie' && !store.watched[t.slug]);
    const sum = a => a.reduce((n, t) => n + (t.runtime || 0), 0);
    const phaseRows = [1, 2, 3, 4, 5, 6].map(p => {
      const all = rel.filter(t => t.phase === p), d = all.filter(t => store.watched[t.slug]).length;
      return { label: `Phase ${p}`, n: d, max: all.length, text: `${d} / ${all.length}` };
    });
    const tally = (fn) => { const m = {}; watched.forEach(t => fn(t).forEach(k => m[k] = (m[k] || 0) + 1)); return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
    const genres = tally(t => t.genres).slice(0, 6).map(([label, n]) => ({ label, n }));
    const chars = tally(t => [...new Set(t.characters.map(c => c.name))]).slice(0, 8).map(([label, n]) => ({ label, n }));
    const rated = Object.entries(store.rating);
    const avg = rated.length ? (rated.reduce((n, [, v]) => n + v, 0) / rated.length).toFixed(1) : null;
    const dist = [5, 4, 3, 2, 1].map(s => ({ label: '★'.repeat(s), n: rated.filter(([, v]) => v === s).length }));
    const empty = txt => `<p>${txt}</p>`;
    view().innerHTML = `<div class="stats-grid">
      <div class="panel"><h3>Overall</h3><div class="big">${pct}%<small>${watched.length} of ${rel.length} titles</small></div>
        <p>${mWatched.length ? `${fmtRun(sum(mWatched))} of movies watched. ` : ''}${mLeft.length ? `${fmtRun(sum(mLeft))} of movies still to go.` : 'No movies left to watch.'}</p></div>
      <div class="panel"><h3>By phase</h3>${bars(phaseRows)}</div>
      <div class="panel"><h3>Your ratings</h3>${rated.length ? `<div class="big">${avg}<small>average from ${rated.length} rating${rated.length > 1 ? 's' : ''}</small></div><div style="margin-top:14px">${bars(dist, true)}</div>` : empty('Rate a title with the stars and your average shows up here.')}</div>
      <div class="panel"><h3>Favourite genres</h3>${genres.length ? bars(genres) : empty('Watch something to see which genres you lean towards.')}</div>
      <div class="panel"><h3>Heroes you have seen most</h3>${chars.length ? bars(chars) : empty('Characters you meet across the titles you watch will appear here.')}</div>
    </div>`;
  }

  /* ---------------- detail dialog ---------------- */
  let openSlug = null;
  function openDetail(slug) {
    const t = BY[slug]; if (!t) return;
    openSlug = slug; drawDetail();
    const dlg = $('#detail'); if (!dlg.open) dlg.showModal();
  }
  function drawDetail() {
    const t = BY[openSlug], s = stateOf(t), r = store.rating[t.slug] || 0;
    const lead = t.characters.filter(c => c.role === 'lead').map(c => c.name);
    const more = t.characters.filter(c => c.role !== 'lead').map(c => c.name);
    const meta = [`${t.type === 'movie' ? 'Movie' : 'Series'}, ${t.year}`, `Phase ${t.phase}`,
      t.runtime ? fmtRun(t.runtime) : '', t.seasons ? `${t.seasons} season${t.seasons > 1 ? 's' : ''}, ${t.episodes} episodes` : '',
      t.director ? 'Directed by ' + t.director : '', t.platform ? 'On ' + t.platform : '',
      t.box ? `About $${t.box >= 1000 ? (t.box / 1000).toFixed(2) + ' billion' : Math.round(t.box) + ' million'} worldwide` : ''].filter(Boolean);
    $('#detail').innerHTML = `<div class="d">
      <button class="x" data-act="close" aria-label="Close">×</button>
      <div><div class="poster">${posterHtml(t, true)}</div></div>
      <div>
        <h2 id="dTitle">${esc(t.name)}</h2>
        <div class="meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>
        <p class="syn">${esc(t.synopsis)}</p>
        <div class="tags">${t.genres.map(g => `<span class="tag">${esc(g)}</span>`).join('')}</div>
        ${lead.length || more.length ? `<p class="cast">${lead.length ? `<b>Leads:</b> ${esc(lead.join(', '))}. ` : ''}${more.length ? `<b>Also in it:</b> ${esc(more.join(', '))}.` : ''}</p>` : ''}
        <div class="actions">
          <button class="btn ${s === 'watched' ? 'on' : 'primary'}" data-act="watch" ${t.upcoming ? 'disabled' : ''}>${s === 'watched' ? '✓ Watched' : 'Mark as watched'}</button>
          <button class="btn ${s === 'want' ? 'gold-on' : ''}" data-act="want" ${s === 'watched' ? 'disabled' : ''}>${s === 'want' ? '✓ On my list' : 'Want to watch'}</button>
        </div>
        ${t.upcoming ? '<p class="cast">Not out yet. Save it to your list and the countdown at the top keeps time.</p>' : `
        <div class="rate" role="group" aria-label="Your rating"><span>Your rating</span>
          ${[1, 2, 3, 4, 5].map(n => `<button class="star ${n <= r ? 'on' : ''}" data-act="rate" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}" aria-pressed="${n === r}">★</button>`).join('')}
        </div>
        ${s === 'watched' ? `<label class="field">Watched on<input type="date" id="wdate" value="${store.watched[t.slug]}" max="${today()}"></label>` : ''}
        <label class="field">Your notes<textarea id="note" maxlength="1000" placeholder="What did you think?">${esc(store.note[t.slug] || '')}</textarea></label>`}
      </div></div>`;
    wireImages($('#detail'));
  }
  function afterChange() { save(); renderSheet(); renderSummary(); if (ui.tab === 'movies' || ui.tab === 'series') fillGrid(); else route(true); }

  function setWatched(slug, on) {
    if (on) { store.watched[slug] = today(); delete store.want[slug]; toast('Marked as watched'); }
    else { delete store.watched[slug]; toast('Removed from watched'); }
  }
  function quickAction(b) {   // the Watched / Want buttons on a card
    const slug = b.dataset.slug, t = BY[slug]; if (!t) return;
    if (b.dataset.q === 'watch') setWatched(slug, !store.watched[slug]);
    else if (store.want[slug]) { delete store.want[slug]; toast('Removed from your list'); }
    else { store.want[slug] = true; toast('Added to your list'); }
    afterChange();
    const again = $(`[data-q="${b.dataset.q}"][data-slug="${slug}"]`); if (again) again.focus({ preventScroll: true });
  }
  function onDetailClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const t = BY[openSlug], act = b.dataset.act;
    if (act === 'close') { $('#detail').close(); return; }
    if (act === 'watch') setWatched(t.slug, !store.watched[t.slug]);
    if (act === 'want') { if (store.want[t.slug]) { delete store.want[t.slug]; toast('Removed from your list'); } else { store.want[t.slug] = true; toast('Added to your list'); } }
    if (act === 'rate') {
      const n = +b.dataset.n;
      if (store.rating[t.slug] === n) delete store.rating[t.slug];
      else { store.rating[t.slug] = n; if (!store.watched[t.slug]) { setWatched(t.slug, true); } }
    }
    afterChange(); drawDetail();
    const again = $(`#detail [data-act="${act}"]` + (act === 'rate' ? `[data-n="${b.dataset.n}"]` : ''));
    if (again) again.focus();
  }

  /* ---------------- routing ---------------- */
  function toTabs() {   // bring the tab bar up under the red header when the first screen is still showing
    const y = $('.hero').getBoundingClientRect().bottom + window.scrollY - $('.top').offsetHeight;
    if (window.scrollY < y - 4) window.scrollTo({ top: y, behavior: 'smooth' });
  }
  function route(keepFilters, scroll) {
    const tab = (location.hash || '#movies').slice(1);
    ui.tab = ['movies', 'series', 'checklist', 'stats', 'admin'].includes(tab) ? tab : 'movies';
    if (ui.tab === 'admin' && !(account && account.role === 'admin' && views.admin)) ui.tab = 'movies';
    if (!keepFilters) { ui.phase = 0; ui.status = ''; ui.q = ''; }
    document.querySelectorAll('#tabs a').forEach(a => { if (a.dataset.tab === ui.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (ui.tab === 'movies') renderBrowse('movie');
    else if (ui.tab === 'series') renderBrowse('series');
    else if (ui.tab === 'checklist') renderChecklist();
    else if (ui.tab === 'admin') views.admin(view());
    else renderStats();
    if (scroll) toTabs();
  }

  /* ---------------- logo fades as you scroll ---------------- */
  function fadeLogo() {
    const t = Math.min(window.scrollY / (window.innerHeight * 0.75), 1);   // 0 at the top .. 1 after 75% of a screen
    $('#bgLogo').style.opacity = String(1 - t * 0.93);                      // ends slightly visible (7%)
  }

  /* ---------------- countdown ---------------- */
  function addMonths(d, m) { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; }
  function tick() {
    const now = new Date(), doom = $('.doom');
    if (now >= DOOMSDAY) { doom.classList.add('live'); $('#doomTitle').textContent = 'DOOMSDAY IS HERE'; return; }
    let m = (DOOMSDAY.getUTCFullYear() - now.getUTCFullYear()) * 12 + DOOMSDAY.getUTCMonth() - now.getUTCMonth();
    let a = addMonths(now, m); if (a > DOOMSDAY) { m--; a = addMonths(now, m); }
    let s = Math.floor((DOOMSDAY - a) / 1000);
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const set = (id, v) => { $('#' + id).textContent = String(v).padStart(2, '0'); };
    set('cdMonths', m); set('cdDays', d); set('cdHours', h); set('cdMinutes', Math.floor(s / 60)); set('cdSeconds', s % 60);
  }

  /* ---------------- backup ---------------- */
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: 'marvel-tracker', version: 1, saved: new Date().toISOString(), ...store }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `marvel-tracker-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloaded');
  }
  function importBackup(file) {
    const rd = new FileReader();
    rd.onload = () => {
      let data; try { data = JSON.parse(rd.result); } catch (e) { toast('That file is not a Marvel Tracker backup'); return; }
      if (!data || data.app !== 'marvel-tracker') { toast('That file is not a Marvel Tracker backup'); return; }
      const next = clean(data), n = Object.keys(next.watched).length;
      const hasData = Object.keys(store.watched).length + Object.keys(store.want).length + Object.keys(store.rating).length > 0;
      if (hasData && !confirm(`Replace your current checklist with this backup (${n} watched titles)?`)) return;
      store = next; afterChange(); toast(`Restored ${n} watched titles`);
    };
    rd.readAsText(file);
  }

  /* ---------------- start ---------------- */
  function wire() {
    document.addEventListener('click', e => {
      const q = e.target.closest('[data-q]');
      if (q) { quickAction(q); return; }
      const t = e.target.closest('.tile, .row, .card-top, .card-title'); if (t && t.dataset.slug) openDetail(t.dataset.slug);
      document.querySelectorAll('details.menu[open]').forEach(m => { if (!m.contains(e.target)) m.open = false; });
    });
    $('#detail').addEventListener('click', e => { if (e.target === $('#detail')) $('#detail').close(); else onDetailClick(e); });
    $('#detail').addEventListener('input', e => {
      if (e.target.id === 'note') { const v = e.target.value; if (v.trim()) store.note[openSlug] = v; else delete store.note[openSlug]; save(); }
    });
    $('#detail').addEventListener('change', e => {
      if (e.target.id === 'wdate' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value <= today()) { store.watched[openSlug] = e.target.value; save(); if (ui.tab === 'checklist') route(true); }
    });
    $('#detail').addEventListener('close', () => { if (ui.tab === 'checklist') route(true); });
    $('#btnExport').addEventListener('click', () => { $('#menu').open = false; exportBackup(); });
    $('#btnImport').addEventListener('click', () => { $('#menu').open = false; $('#importFile').click(); });
    $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
    $('#btnReset').addEventListener('click', () => {
      $('#menu').open = false;
      if (confirm('Clear your whole checklist, ratings and notes from this browser? Download a backup first if you might want it back.')) { store = emptyStore(); afterChange(); toast('Checklist cleared'); }
    });
    $('#btnNext').addEventListener('click', () => {
      const t = released().find(x => !store.watched[x.slug]);
      if (t) openDetail(t.slug); else toast('You are all caught up');
    });
    $('#btnSurprise').addEventListener('click', () => {
      const pool = released().filter(x => !store.watched[x.slug]);
      if (pool.length) openDetail(pool[Math.floor(Math.random() * pool.length)].slug); else toast('You are all caught up');
    });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('#detail').open) {
        const q = $('#q'); if (q) { e.preventDefault(); q.focus(); }
      }
    });
    window.addEventListener('hashchange', () => route(false, true));
    window.addEventListener('scroll', fadeLogo, { passive: true }); fadeLogo();
  }

  async function start() {
    tick(); setInterval(tick, 1000);
    try {
      const [c, p] = await Promise.all([
        fetch('data/catalog.json').then(r => r.json()),
        fetch('data/posters.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
      ]);
      T = c.titles; BY = Object.fromEntries(T.map(t => [t.slug, t])); posters = p || {};
    } catch (e) {
      view().innerHTML = '<div class="empty"><b>Could not load the catalogue</b>Check your connection and reload the page.</div>';
      return;
    }
    store = load();
    wire(); renderSheet(); renderSummary(); route(false, /^#(movies|series|checklist|stats|admin)$/.test(location.hash));
    loadWikiPosters();
    window.MTApp.isReady = true; document.dispatchEvent(new Event('mt-ready'));
  }

  /* ---------------- hooks for js/account.js (login, saving to an account, admin tab) ---------------- */
  const redraw = () => { const d = $('#detail'); if (d.open) d.close(); renderSheet(); renderSummary(); route(true); };
  window.MTApp = {
    isReady: false, toast, esc, hooks,
    registerView: (name, fn) => { views[name] = fn; },
    guestStore: () => load(),                                   // the checklist kept in this browser by someone who is not logged in
    cachedStore: id => { try { return JSON.parse(localStorage.getItem(KEY + '-u-' + id)); } catch (e) { return null; } },
    isEmpty: o => !o || !Object.keys(clean(o).watched).length && !Object.keys(clean(o).want).length && !Object.keys(clean(o).rating).length && !Object.keys(clean(o).note).length,
    setAccount(acc, data, push) { account = acc; store = clean(data); if (push) save(); redraw(); },
    setRole(role) { if (account) account.role = role; },
    clearAccount() {   // logged out: forget the account's copy on this device and go back to the guest checklist
      if (account) { try { localStorage.removeItem(KEY + '-u-' + account.id); } catch (e) { /* ignore */ } }
      account = null; store = load(); redraw();
    },
    dropGuest() { memoryCopy = null; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },   // the guest checklist now lives in the account
    currentStore: () => store,
    redraw
  };
  start();
})();
