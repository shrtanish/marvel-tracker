# Marvel Tracker

A free checklist for every Marvel movie and series. Tick off what you have watched, rate it, keep notes and see how far through the universe you are.

- **Movies and Series** tabs with phase filters, search, sorting and a "Surprise me" button
- **Contact sheet** on the home screen: one tile per title in release order, coloured by what you have watched
- **My checklist** (up next, want to watch, watched) and **Stats** (progress by phase, favourite genres and heroes, your ratings)
- **Doomsday countdown** to *Avengers: Doomsday* (18 December 2026)
- **Works without an account.** Guests browse and tick titles freely; the checklist is saved in the browser. Use **Backup** to download it or move it to another device.
- **Optional accounts** (sign up, log in, forgot password): the checklist is saved to the account and follows you to any device. The first account becomes the **admin**, who gets an **Admin** tab to block, unblock, promote or delete users.
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

## Accounts (login, sign up and the admin panel)

Accounts use [Supabase](https://supabase.com) (free plan). Until you fill in `js/config.js` the site works as a plain checklist and shows no login buttons.

1. Create a free project at supabase.com. Pick any name and region and save the database password somewhere.
2. Open **SQL Editor > New query**, paste the whole of `supabase/setup.sql`, and click **Run**. It creates the tables, the privacy rules and the admin functions.
3. Open **Authentication > Providers > Email** and switch **Confirm email** off. (Leave it on if you want people to confirm by email first; the site handles both.)
4. Open **Authentication > URL Configuration**. Set **Site URL** to your website address, for example `https://marvel-tracker-brown.vercel.app`, and add the same address under **Redirect URLs**. Password-reset emails use it.
5. Open **Project Settings > API** and copy the **Project URL** and the **anon public** key.
6. Paste them into `js/config.js`:
   ```js
   window.MT_CONFIG = { supabaseUrl: 'https://xxxx.supabase.co', supabaseKey: 'eyJ...' };
   ```
   Commit the file. Both values are meant to be public. The rules in `setup.sql` decide who can see what, and the `service_role` key must never be put in the site.
7. Open your site and **sign up first**. The first account is the admin.

How it behaves:
- Guests can browse and tick titles. When they log in for the first time, the checklist from that browser moves into their account.
- A signed-in checklist is saved a moment after every change, and loads on any device.
- Admins see all accounts with their progress. **Block** signs a person out and stops them logging in, **Make admin** and **Remove admin** change the role, **Delete** removes the account and its checklist. You cannot change your own account.
- Supabase's free plan sends only a few auth emails an hour. For a real launch, add your own email sender under **Authentication > SMTP**.

## Posters

Posters show up on their own: when the page loads, the browser asks Wikipedia for each title's poster and remembers the answer for 30 days. Nothing is stored in this repository and no key is needed. A title Wikipedia has no poster for shows a coloured title card.

For higher quality, or to fix a wrong poster, you can also use [TMDB](https://www.themoviedb.org) (free). Posters listed in `data/posters.json` are used first. The repository stores only each poster's file name there; visitors' browsers load the images from TMDB.

1. Make a free TMDB account and copy your **API Key** from <https://www.themoviedb.org/settings/api>.
2. Pick one way to run the poster lookup:
   - **On GitHub (no install):** in your repository go to *Settings > Secrets and variables > Actions*, add a secret named `TMDB_API_KEY`, then open the *Actions* tab, choose **Update posters** and click **Run workflow**. It commits `data/posters.json` and Vercel redeploys.
   - **On your computer** (needs Node 18 or newer):
     ```bash
     TMDB_API_KEY=your_key node scripts/fetch-posters.mjs
     ```
     On Windows PowerShell: `$env:TMDB_API_KEY="your_key"; node scripts/fetch-posters.mjs`
3. Titles the lookup could not match are listed in its output. Fix one by adding its correct path to `data/poster-overrides.json`, for example `{ "thor-2011": "/abc123.jpg" }`, and run it again.

To point a title at a different Wikipedia article, add a `"wiki": "Article title"` field to its entry in `data/catalog.json`.

## Add a new movie or series

Edit `data/catalog.json` and add an entry (copy an existing one). `type` is `movie` or `series`, `phase` is 1 to 6, `month` is the release month (it orders titles inside a year), and `slug` must be unique. For something not out yet set `"upcoming": true` and a `releaseDate`. Then run the poster lookup again.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css`, `js/app.js` | The site |
| `img/` | Marvel Studios logo and the Avengers artwork used on the first screen |
| `data/catalog.json` | All titles with synopsis, genres, cast, runtime, seasons and so on |
| `js/auth.js`, `js/account.js`, `js/config.js` | Login, saving to an account, the admin tab and the two Supabase settings |
| `supabase/setup.sql` | Database tables, privacy rules and admin functions (run once in Supabase) |
| `data/posters.json` | Optional poster file names from TMDB |
| `scripts/fetch-posters.mjs` | Poster lookup script |
| `.github/workflows/posters.yml` | Runs the lookup on GitHub |
| `vercel.json` | Security headers for Vercel |
| `java-version/` | The original college RDBMS project: MySQL schema, triggers, procedures, views, queries and a Java (JDBC) backend |

## Notes

- Release dates, runtimes and box office figures are approximate. Corrections are welcome.
- Marvel Tracker is an unofficial fan project. It is not affiliated with, endorsed by or sponsored by Marvel, Marvel Studios or The Walt Disney Company. All titles, characters and artwork belong to their owners.
- Poster images come from Wikipedia and TMDB; the Marvel Studios logo and the background artwork (by Ryan Meinerding) belong to Marvel.
- This product uses the TMDB API but is not endorsed or certified by TMDB.
- The code is MIT licensed (see `LICENSE`). That does not cover Marvel's or TMDB's material.
