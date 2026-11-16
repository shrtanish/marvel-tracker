-- =====================================================================
--  File 05 : QUERIES  (for the project report - run them one by one)
--  Covers: SELECT/WHERE, JOINs, GROUP BY/HAVING, subqueries, set ops,
--          window functions, views, procedures, function, transactions.
-- =====================================================================
USE marvel_tracker;

-- ============================ BASIC ================================

-- Q1. All movies, oldest first
SELECT name, release_year FROM titles WHERE title_type = 'movie' ORDER BY release_year, title_id;

-- Q2. All series
SELECT name, release_year FROM titles WHERE title_type = 'series' ORDER BY release_year;

-- Q3. Titles whose name contains the word 'Man'  (LIKE)
SELECT name, title_type FROM titles WHERE name LIKE '%Man%';

-- Q4. Titles released between 2015 and 2019  (BETWEEN)
SELECT name, release_year FROM titles WHERE release_year BETWEEN 2015 AND 2019 ORDER BY release_year;

-- Q5. Movies longer than 150 minutes  (JOIN subtype)
SELECT t.name, m.runtime_min
FROM titles t JOIN movie_details m ON m.title_id = t.title_id
WHERE m.runtime_min > 150
ORDER BY m.runtime_min DESC;

-- ============================ JOINS ================================

-- Q6. Movies with phase and director  (3-table INNER JOIN)
SELECT t.name, p.phase_number, d.name AS director
FROM titles t
JOIN phases p        ON p.phase_id = t.phase_id
JOIN movie_details m ON m.title_id = t.title_id
JOIN directors d     ON d.director_id = m.director_id
ORDER BY p.phase_number, t.release_year;

-- Q7. Series with their platform, seasons and episodes
SELECT t.name, pl.name AS platform, s.seasons, s.episodes
FROM titles t
JOIN series_details s ON s.title_id = t.title_id
JOIN platforms pl     ON pl.platform_id = s.platform_id;

-- Q8. Every character with the titles they appear in  (M:N join)
SELECT c.hero_name, t.name AS title, tc.role_type
FROM characters c
JOIN title_characters tc ON tc.character_id = c.character_id
JOIN titles t            ON t.title_id = tc.title_id
ORDER BY c.hero_name, t.release_year;

-- Q9. LEFT JOIN : titles that nobody has reviewed yet
SELECT t.name, t.title_type
FROM titles t
LEFT JOIN reviews r ON r.title_id = t.title_id
WHERE r.review_id IS NULL
ORDER BY t.title_type, t.name;

-- Q10. SELF JOIN : pairs of movies by the same director
SELECT a.name AS movie_1, b.name AS movie_2, d.name AS director
FROM movie_details ma
JOIN movie_details mb ON ma.director_id = mb.director_id AND ma.title_id < mb.title_id
JOIN titles a ON a.title_id = ma.title_id
JOIN titles b ON b.title_id = mb.title_id
JOIN directors d ON d.director_id = ma.director_id
ORDER BY d.name;

-- Q11. A user's checklist  (user 1 = tanish)
SELECT u.username, t.name, t.title_type, w.status, w.watched_on
FROM watchlist w
JOIN users u  ON u.user_id  = w.user_id
JOIN titles t ON t.title_id = w.title_id
WHERE u.username = 'tanish'
ORDER BY w.status, t.title_type, t.release_year;

-- ====================== GROUP BY / HAVING ==========================

-- Q12. Number of titles per phase, split by type
SELECT p.phase_number,
       SUM(t.title_type = 'movie')  AS movies,
       SUM(t.title_type = 'series') AS series,
       COUNT(*)                     AS total
FROM titles t JOIN phases p ON p.phase_id = t.phase_id
GROUP BY p.phase_number
ORDER BY p.phase_number;

-- Q13. Average rating per phase
SELECT p.phase_number, ROUND(AVG(r.rating), 2) AS avg_rating, COUNT(*) AS reviews
FROM reviews r
JOIN titles t ON t.title_id = r.title_id
JOIN phases p ON p.phase_id = t.phase_id
GROUP BY p.phase_number
ORDER BY avg_rating DESC;

-- Q14. Directors who made more than one movie  (HAVING)
SELECT d.name, COUNT(*) AS movies_directed
FROM directors d JOIN movie_details m ON m.director_id = d.director_id
GROUP BY d.name
HAVING COUNT(*) > 1
ORDER BY movies_directed DESC;

-- Q15. Characters appearing in 8 or more titles
SELECT c.hero_name, COUNT(*) AS appearances
FROM characters c JOIN title_characters tc ON tc.character_id = c.character_id
GROUP BY c.hero_name
HAVING COUNT(*) >= 8
ORDER BY appearances DESC;

-- Q16. Total and average box office per saga
SELECT p.saga, COUNT(*) AS movies,
       SUM(m.box_office_million) AS total_million,
       ROUND(AVG(m.box_office_million), 1) AS avg_million
FROM movie_details m
JOIN titles t ON t.title_id = m.title_id
JOIN phases p ON p.phase_id = t.phase_id
GROUP BY p.saga;

-- Q17. Number of titles per genre
SELECT g.name AS genre, COUNT(*) AS titles
FROM genres g JOIN title_genres tg ON tg.genre_id = g.genre_id
GROUP BY g.name
ORDER BY titles DESC;

-- ========================== SUBQUERIES =============================

-- Q18. Highest-grossing movie
SELECT t.name, m.box_office_million
FROM movie_details m JOIN titles t ON t.title_id = m.title_id
WHERE m.box_office_million = (SELECT MAX(box_office_million) FROM movie_details);

-- Q19. Movies that earned more than the average box office
SELECT t.name, m.box_office_million
FROM movie_details m JOIN titles t ON t.title_id = m.title_id
WHERE m.box_office_million > (SELECT AVG(box_office_million) FROM movie_details)
ORDER BY m.box_office_million DESC;

-- Q20. Users who watched EVERY Phase 1 movie  (double NOT EXISTS = relational division)
SELECT u.username
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM titles t
    JOIN phases p ON p.phase_id = t.phase_id
    WHERE p.phase_number = 1 AND t.title_type = 'movie'
      AND NOT EXISTS (
          SELECT 1 FROM watchlist w
          WHERE w.user_id = u.user_id AND w.title_id = t.title_id AND w.status = 'watched'));

-- Q21. Titles rated above the overall average rating (IN / scalar subquery)
SELECT name, avg_rating FROM titles
WHERE rating_count > 0 AND avg_rating > (SELECT AVG(rating) FROM reviews)
ORDER BY avg_rating DESC;

-- Q22. Users who have never written a review  (NOT IN)
SELECT username FROM users WHERE user_id NOT IN (SELECT DISTINCT user_id FROM reviews);

-- Q23. Characters that appear in both a movie AND a series
SELECT hero_name FROM v_character_appearances WHERE in_movies > 0 AND in_series > 0;

-- ======================== SET OPERATIONS ===========================

-- Q24. UNION : titles that are either Phase 1 or have a 5-star average
SELECT name FROM titles WHERE phase_id = (SELECT phase_id FROM phases WHERE phase_number = 1)
UNION
SELECT name FROM titles WHERE avg_rating = 5;

-- Q25. Titles watched by tanish AND by wanda_m (INTERSECT-style with IN)
SELECT t.name FROM titles t
WHERE t.title_id IN (SELECT title_id FROM watchlist WHERE user_id = 1 AND status = 'watched')
  AND t.title_id IN (SELECT title_id FROM watchlist WHERE user_id = 3 AND status = 'watched');

-- ===================== WINDOW FUNCTIONS / CTE ======================

-- Q26. Rank movies by box office inside each phase
SELECT p.phase_number, t.name, m.box_office_million,
       RANK() OVER (PARTITION BY p.phase_number ORDER BY m.box_office_million DESC) AS rank_in_phase
FROM movie_details m
JOIN titles t ON t.title_id = m.title_id
JOIN phases p ON p.phase_id = t.phase_id;

-- Q27. Running total of movies by release year  (CTE + window)
WITH per_year AS (
    SELECT release_year, COUNT(*) AS n FROM titles GROUP BY release_year
)
SELECT release_year, n, SUM(n) OVER (ORDER BY release_year) AS running_total FROM per_year;

-- Q28. Leaderboard : who has watched the most titles?
SELECT u.username, COUNT(*) AS watched,
       DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS position
FROM watchlist w JOIN users u ON u.user_id = w.user_id
WHERE w.status = 'watched'
GROUP BY u.username;

-- ===================== VIEWS / PROCEDURES / FUNCTION ================

-- Q29. Use the views
SELECT * FROM v_movies   LIMIT 5;
SELECT * FROM v_series;
SELECT * FROM v_user_progress WHERE username = 'tanish';
SELECT * FROM v_top_rated LIMIT 5;
SELECT * FROM v_phase_stats;
SELECT * FROM v_character_appearances ORDER BY appearances DESC LIMIT 5;

-- Q30. Stored procedures + function
CALL user_progress(1);
SELECT fn_progress_percent(1, 'movie')  AS movie_percent,
       fn_progress_percent(1, 'series') AS series_percent;

-- Q31. TRIGGER DEMO  : add a review and watch avg_rating + watchlist change by themselves
SELECT title_id, name, avg_rating, rating_count FROM titles WHERE name = 'Black Widow';
CALL add_review(5, (SELECT title_id FROM titles WHERE name = 'Black Widow'), 4, 'Good send-off for Natasha');
SELECT title_id, name, avg_rating, rating_count FROM titles WHERE name = 'Black Widow';
SELECT * FROM watchlist WHERE user_id = 5 AND title_id = (SELECT title_id FROM titles WHERE name = 'Black Widow');
SELECT * FROM review_log ORDER BY log_id DESC LIMIT 3;

-- Q32. CONSTRAINT DEMO : this must FAIL (rating 9 is outside 1..5)
-- INSERT INTO reviews (user_id, title_id, rating) VALUES (1, 1, 9);
-- CALL add_review(1, 1, 9, 'too high');

-- Q33. TRANSACTION DEMO : add a user and give them a checklist atomically
START TRANSACTION;
INSERT INTO users (username, email) VALUES ('demo_user', 'demo@example.com');
SET @new_user = LAST_INSERT_ID();
CALL mark_watched(@new_user, 1);
CALL add_to_watchlist(@new_user, 6);
SELECT * FROM watchlist WHERE user_id = @new_user;
ROLLBACK;     -- change to COMMIT to keep it
SELECT COUNT(*) AS demo_user_exists FROM users WHERE username = 'demo_user';

-- ============== LOGIN SYSTEM  (needs 07_auth.sql) ==================

-- Q34. Users grouped by role and status
SELECT role, is_active, COUNT(*) AS users FROM users GROUP BY role, is_active;

-- Q35. What the admin panel shows (a view joining users, watchlist and reviews)
SELECT username, role, is_active, has_password, watched, want_to_watch, reviews, last_login
FROM v_admin_users
ORDER BY (role = 'admin') DESC, user_id;

-- Q36. Who is logged in right now?  (sessions that have not expired)
SELECT u.username, COUNT(*) AS active_sessions, MAX(s.created_at) AS last_login_at
FROM sessions s JOIN users u ON u.user_id = s.user_id
WHERE s.expires_at > NOW()
GROUP BY u.username;

-- Q37. PROCEDURE DEMO : deleting a user also fixes the average ratings
--      (watch the rating of title 1 go up and down again)
INSERT INTO users (username, email) VALUES ('temp_user', 'temp@example.com');
SET @t = LAST_INSERT_ID();
SELECT name, avg_rating, rating_count FROM titles WHERE title_id = 1;
CALL add_review(@t, 1, 1, 'temporary review');
SELECT name, avg_rating, rating_count FROM titles WHERE title_id = 1;
CALL sp_delete_user(@t);
SELECT name, avg_rating, rating_count FROM titles WHERE title_id = 1;
SELECT COUNT(*) AS temp_user_exists FROM users WHERE username = 'temp_user';

-- Q38. TRIGGER DEMO : the last active admin cannot be demoted, suspended or deleted.
--      With exactly one admin, each of these fails with an error message:
-- UPDATE users SET role = 'user' WHERE role = 'admin';
-- UPDATE users SET is_active = 0 WHERE role = 'admin';
-- DELETE FROM users WHERE role = 'admin';
