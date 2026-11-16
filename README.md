# Marvel Tracker

A free checklist for every Marvel movie and series. Tick off what you have watched, rate it, keep notes and see how far through the universe you are.

- **Movies and Series** tabs with phase filters, search, sorting and a "Surprise me" button
- **Contact sheet** on the home screen: one tile per title in release order, coloured by what you have watched
- **My checklist** (up next, want to watch, watched) and **Stats** (progress by phase, favourite genres and heroes, your ratings)
- **Doomsday countdown** to *Avengers: Doomsday* (18 December 2026)
- **No account and no server.** Your checklist is saved in your browser. Use **Backup** to download it or move it to another device.
- **57 released titles** (38 movies, 19 series) plus *Avengers: Doomsday*, up to November 2026

It is a plain HTML, CSS and JavaScript site. There is nothing to build.

## Run it on your computer

```bash
npx serve .          # or: python -m http.server 8000
```

Open the address it prints. (Opening `index.html` directly does not work because the browser blocks loading the data files.)

## Put it online with Vercel

1. Push this folder to a GitHub repository.
2. On [vercel.com](https://vercel.com) choose **Add New > Project** and import the repository.
3. Framework preset: **Other**. Leave the build command and output directory empty. Click **Deploy**.

Every push to GitHub then updates the site automatically.

## Posters

Posters come from [TMDB](https://www.themoviedb.org) (free). The repository stores only each poster's file name in `data/posters.json`; visitors' browsers load the images from TMDB. Until you add them, every title shows a coloured title card instead.

1. Make a free TMDB account and copy your **API Key** from <https://www.themoviedb.org/settings/api>.
2. Pick one way to run the poster lookup:
   - **On GitHub (no install):** in your repository go to *Settings > Secrets and variables > Actions*, add a secret named `TMDB_API_KEY`, then open the *Actions* tab, choose **Update posters** and click **Run workflow**. It commits `data/posters.json` and Vercel redeploys.
   - **On your computer** (needs Node 18 or newer):
     ```bash
     TMDB_API_KEY=your_key node scripts/fetch-posters.mjs
     ```
     On Windows PowerShell: `$env:TMDB_API_KEY="your_key"; node scripts/fetch-posters.mjs`
3. Titles the lookup could not match are listed in its output. Fix one by adding its correct path to `data/poster-overrides.json`, for example `{ "thor-2011": "/abc123.jpg" }`, and run it again.

## Add a new movie or series

Edit `data/catalog.json` and add an entry (copy an existing one). `type` is `movie` or `series`, `phase` is 1 to 6, `month` is the release month (it orders titles inside a year), and `slug` must be unique. For something not out yet set `"upcoming": true` and a `releaseDate`. Then run the poster lookup again.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css`, `js/app.js` | The site |
| `data/catalog.json` | All titles with synopsis, genres, cast, runtime, seasons and so on |
| `data/posters.json` | Poster file names from TMDB |
| `scripts/fetch-posters.mjs` | Poster lookup script |
| `.github/workflows/posters.yml` | Runs the lookup on GitHub |
| `vercel.json` | Security headers for Vercel |
| `java-version/` | The original college RDBMS project: MySQL schema, triggers, procedures, views, queries and a Java (JDBC) backend |

## Notes

- Release dates, runtimes and box office figures are approximate. Corrections are welcome.
- Marvel Tracker is an unofficial fan project. It is not affiliated with, endorsed by or sponsored by Marvel, Marvel Studios or The Walt Disney Company. All titles, characters and artwork belong to their owners.
- This product uses the TMDB API but is not endorsed or certified by TMDB.
- The code is MIT licensed (see `LICENSE`). That does not cover Marvel's or TMDB's material.
