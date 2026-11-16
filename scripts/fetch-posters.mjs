// Fills data/posters.json with a poster path for every title, using the free TMDB API.
// Usage:   TMDB_API_KEY=your_key node scripts/fetch-posters.mjs          (only fills missing posters)
//          TMDB_API_KEY=your_key node scripts/fetch-posters.mjs --refresh (look everything up again)
// Windows PowerShell:   $env:TMDB_API_KEY="your_key"; node scripts/fetch-posters.mjs
// The key can be the short "API Key" (v3) or the long "API Read Access Token" (v4) from
// https://www.themoviedb.org/settings/api (free account).
// Only the poster PATH is saved. The website loads the image from image.tmdb.org in the visitor's browser.
// To fix a wrong match, put the right path in data/poster-overrides.json, e.g. { "thor-2011": "/abc123.jpg" }.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

process.on('uncaughtException', e => { console.error('Error: ' + e.message); process.exit(1); });

const KEY = process.env.TMDB_API_KEY;
const BASE = process.env.TMDB_BASE || 'https://api.themoviedb.org/3';
const REFRESH = process.argv.includes('--refresh');
if (!KEY) { console.error('Set TMDB_API_KEY first (see the comment at the top of this file).'); process.exit(1); }

const headers = KEY.length > 40 ? { Authorization: `Bearer ${KEY}` } : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function search(kind, name, year) {
  const p = new URLSearchParams({ query: name, include_adult: 'false', language: 'en-US' });
  if (KEY.length <= 40) p.set('api_key', KEY);
  if (year) p.set(kind === 'movie' ? 'year' : 'first_air_date_year', String(year));
  const res = await fetch(`${BASE}/search/${kind}?${p}`, { headers });
  if (res.status === 401) throw new Error('TMDB rejected the key (401). Check TMDB_API_KEY.');
  if (!res.ok) throw new Error(`TMDB error ${res.status} for "${name}"`);
  const data = await res.json();
  return (data.results || []).find(r => r.poster_path) || null;
}

const catalog = JSON.parse(await readFile('data/catalog.json', 'utf8'));
const postersFile = 'data/posters.json';
const posters = existsSync(postersFile) && !REFRESH ? JSON.parse(await readFile(postersFile, 'utf8')) : {};
const missing = [];
let added = 0;

for (const t of catalog.titles) {
  if (posters[t.slug]) continue;
  const name = t.name.replace(/\*$/, '');                       // "Thunderbolts*" -> "Thunderbolts"
  const kind = t.type === 'movie' ? 'movie' : 'tv';
  let hit = await search(kind, name, t.year);
  if (!hit) hit = await search(kind, name, null);                // retry without the year
  if (hit) { posters[t.slug] = hit.poster_path; added++; console.log('ok      ', t.name); }
  else { missing.push(t.name); console.log('no match', t.name); }
  await sleep(150);
}

if (existsSync('data/poster-overrides.json')) Object.assign(posters, JSON.parse(await readFile('data/poster-overrides.json', 'utf8')));
await writeFile(postersFile, JSON.stringify(posters, null, 1) + '\n');
console.log(`\nSaved ${Object.keys(posters).length} posters (${added} new).`);
if (missing.length) console.log('No poster found for:', missing.join(', '));
