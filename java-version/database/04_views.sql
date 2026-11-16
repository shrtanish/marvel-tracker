-- =====================================================================
--  File 04 : VIEWS
-- =====================================================================
USE marvel_tracker;

-- 1. Full catalogue: one row per title with every detail joined together
CREATE OR REPLACE VIEW v_catalog AS
SELECT t.title_id, t.name, t.title_type, t.release_year,
       p.phase_number, p.saga,
       m.runtime_min,
       m.box_office_million,
       d.name                               AS director,
       s.seasons, s.episodes,
       pl.name                              AS platform,
       t.avg_rating, t.rating_count, t.synopsis, t.poster_url
FROM titles t
JOIN phases p              ON p.phase_id    = t.phase_id
LEFT JOIN movie_details m  ON m.title_id    = t.title_id
LEFT JOIN directors d      ON d.director_id = m.director_id
LEFT JOIN series_details s ON s.title_id    = t.title_id
LEFT JOIN platforms pl     ON pl.platform_id = s.platform_id;

-- 2. Movies only / Series only  (these feed the two sections of the frontend)
CREATE OR REPLACE VIEW v_movies AS
SELECT * FROM v_catalog WHERE title_type = 'movie';

CREATE OR REPLACE VIEW v_series AS
SELECT * FROM v_catalog WHERE title_type = 'series';

-- 3. Per-user progress, split by movies and series
CREATE OR REPLACE VIEW v_user_progress AS
SELECT u.user_id, u.username, t.title_type,
       COUNT(DISTINCT t.title_id)                         AS total_titles,
       COUNT(DISTINCT CASE WHEN w.status = 'watched' THEN w.title_id END) AS watched,
       ROUND(COUNT(DISTINCT CASE WHEN w.status = 'watched' THEN w.title_id END)
             * 100 / COUNT(DISTINCT t.title_id), 1)      AS percent_watched
FROM users u
CROSS JOIN titles t
LEFT JOIN watchlist w ON w.user_id = u.user_id AND w.title_id = t.title_id
GROUP BY u.user_id, u.username, t.title_type;

-- 4. Top rated titles (at least 2 reviews)
CREATE OR REPLACE VIEW v_top_rated AS
SELECT title_id, name, title_type, release_year, avg_rating, rating_count
FROM titles
WHERE rating_count >= 2
ORDER BY avg_rating DESC, rating_count DESC;

-- 5. Phase statistics
CREATE OR REPLACE VIEW v_phase_stats AS
SELECT p.phase_number, p.saga,
       COUNT(t.title_id)                    AS total_titles,
       SUM(t.title_type = 'movie')          AS movies,
       SUM(t.title_type = 'series')         AS series,
       ROUND(AVG(NULLIF(t.avg_rating, 0)), 2) AS avg_rating
FROM phases p
LEFT JOIN titles t ON t.phase_id = p.phase_id
GROUP BY p.phase_number, p.saga;

-- 6. Character appearance count
CREATE OR REPLACE VIEW v_character_appearances AS
SELECT c.character_id, c.hero_name, c.real_name,
       COUNT(tc.title_id)                       AS appearances,
       SUM(t.title_type = 'movie')              AS in_movies,
       SUM(t.title_type = 'series')             AS in_series
FROM characters c
LEFT JOIN title_characters tc ON tc.character_id = c.character_id
LEFT JOIN titles t            ON t.title_id = tc.title_id
GROUP BY c.character_id, c.hero_name, c.real_name;
