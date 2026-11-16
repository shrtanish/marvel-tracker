# Notes for your project report

Use these as raw material when you write the report. `ER_diagram.png` is the ER diagram (source: `er.mmd`).

## 1. Problem statement
Marvel has 40+ movies and series across six phases. Fans lose track of what they have watched. This system stores the catalogue and lets users keep a checklist, rate and review titles, and see progress, using a relational database.

## 2. Tables (12) and relationships
| Table | Purpose | Key | Relationship |
|---|---|---|---|
| phases | Phase 1-6 and saga | phase_id | 1 phase : N titles |
| titles | every movie and series (supertype) | title_id | N : 1 phases |
| movie_details | movie-only data (subtype) | title_id (PK + FK) | 1 : 1 titles |
| series_details | series-only data (subtype) | title_id (PK + FK) | 1 : 1 titles |
| directors | movie directors | director_id | 1 : N movie_details |
| platforms | where series stream | platform_id | 1 : N series_details |
| genres + title_genres | genres | composite PK (title_id, genre_id) | M : N |
| characters + title_characters | characters per title, with role_type | composite PK | M : N |
| users | people using the app | user_id | |
| watchlist | the checklist (status: want_to_watch / watched) | composite PK (user_id, title_id) | users M : N titles |
| reviews | rating 1-5 + text | review_id, UNIQUE(user_id, title_id) | users M : N titles |
| review_log | audit trail filled by triggers | log_id | |

## 3. Design points worth mentioning
- **Supertype/subtype (generalisation):** shared columns live in `titles`, movie-only and series-only columns in separate tables. This avoids many NULL columns.
- **Normalisation:** 1NF (atomic values, no repeating groups: genres and characters are in their own tables), 2NF (composite-key tables have no partial dependency; `role_type` depends on the whole key), 3NF (director name, phase saga and platform name are stored once, not repeated per title).
- **Controlled redundancy:** `titles.avg_rating` and `rating_count` are derived values kept in sync by triggers for fast reads.

## 4. Constraints used
PRIMARY KEY (single and composite), FOREIGN KEY with ON DELETE CASCADE / RESTRICT, UNIQUE (username, email, title name+year, one review per user per title), CHECK (rating 1-5, runtime, year, email format, episodes >= seasons), NOT NULL, DEFAULT, ENUM.

## 5. Advanced objects
- **Triggers (6):** auto-fill `watched_on` (2), review marks title watched (1), keep avg rating + write audit log on review insert/update/delete (3).
- **Stored procedures (4):** `mark_watched`, `add_to_watchlist`, `add_review` (validates 1-5 with SIGNAL), `user_progress`.
- **Function (1):** `fn_progress_percent`.
- **Views (7):** `v_catalog`, `v_movies`, `v_series`, `v_user_progress`, `v_top_rated`, `v_phase_stats`, `v_character_appearances`.
- **Indexes:** on (title_type, phase_id) and (user_id, status).

## 6. Query coverage (`05_queries.sql`)
Q1-5 basic filters / LIKE / BETWEEN · Q6-11 joins (inner, left, self) · Q12-17 GROUP BY / HAVING / aggregates · Q18-23 subqueries (scalar, IN, NOT IN, NOT EXISTS / relational division) · Q24-25 UNION and intersection · Q26-28 window functions and CTE · Q29-30 views, procedures, function · Q31 trigger demo · Q32 constraint demo · Q33 transaction demo.

## 7. Architecture (3-tier)
Browser (HTML/CSS/JS)  ->  Java backend (HTTP server + JDBC)  ->  MySQL. The Java layer only calls SQL, procedures and views; all rules (ratings, uniqueness, averages) are enforced inside the database.

## 8. Screenshots to take
ER diagram · each table with `DESCRIBE` · a few queries with output · trigger demo (Q31 before/after) · constraint error (Q32) · app: Movies tab, Series tab, checklist, details dialog, stats.


## 9. Login and user management (07_auth.sql)
- **users** gained `password_hash`, `role` ENUM('user','admin'), `is_active`, `failed_logins`, `locked_until`, `last_login`.
- **sessions** table: `token_hash` (PK), `user_id` FK ON DELETE CASCADE, `created_at`, `expires_at`. Only the SHA-256 of the cookie token is stored.
- **Triggers** `trg_users_keep_admin_update` / `trg_users_keep_admin_delete`: SIGNAL an error if the last active admin would be demoted, suspended or deleted (business rule enforced in the database).
- **Procedure** `sp_delete_user`: deletes the user's reviews first so the rating triggers recompute averages, then the user (watchlist and sessions cascade).
- **View** `v_admin_users`: users with activity counts, has_password and is_locked for the admin screen.
- Passwords: PBKDF2-SHA256, 600,000 iterations, random salt, constant-time compare (done in Java, not SQL).
- Screenshots to add: sign-up dialog, admin tab, a rejected "last admin" delete.
