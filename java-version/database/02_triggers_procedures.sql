-- =====================================================================
--  File 02 : TRIGGERS, STORED PROCEDURES, FUNCTION
--  (uses DELIMITER, so run it with the mysql command line or Workbench)
-- =====================================================================
USE marvel_tracker;

DELIMITER $$

-- ---------------------------------------------------------------------
-- TRIGGER 1 : when a title is marked 'watched', fill watched_on automatically
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_watchlist_before_insert
BEFORE INSERT ON watchlist
FOR EACH ROW
BEGIN
    IF NEW.status = 'watched' AND NEW.watched_on IS NULL THEN
        SET NEW.watched_on = CURRENT_DATE;
    END IF;
END$$

CREATE TRIGGER trg_watchlist_before_update
BEFORE UPDATE ON watchlist
FOR EACH ROW
BEGIN
    IF NEW.status = 'watched' AND NEW.watched_on IS NULL THEN
        SET NEW.watched_on = CURRENT_DATE;
    END IF;
    IF NEW.status = 'want_to_watch' THEN
        SET NEW.watched_on = NULL;
    END IF;
END$$

-- ---------------------------------------------------------------------
-- TRIGGER 2 : after a review is added, the title is automatically 'watched'
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_review_marks_watched
AFTER INSERT ON reviews
FOR EACH ROW
BEGIN
    INSERT INTO watchlist (user_id, title_id, status, watched_on)
    VALUES (NEW.user_id, NEW.title_id, 'watched', NEW.reviewed_on)
    ON DUPLICATE KEY UPDATE status = 'watched',
                            watched_on = COALESCE(watched_on, NEW.reviewed_on);
END$$

-- ---------------------------------------------------------------------
-- TRIGGERS 3-5 : keep titles.avg_rating / rating_count correct (INSERT, UPDATE, DELETE)
--                and write an audit row in review_log
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_review_after_insert
AFTER INSERT ON reviews
FOR EACH ROW
BEGIN
    UPDATE titles
       SET avg_rating   = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE title_id = NEW.title_id),
           rating_count = (SELECT COUNT(*)              FROM reviews WHERE title_id = NEW.title_id)
     WHERE title_id = NEW.title_id;
    INSERT INTO review_log (user_id, title_id, action, old_rating, new_rating)
    VALUES (NEW.user_id, NEW.title_id, 'INSERT', NULL, NEW.rating);
END$$

CREATE TRIGGER trg_review_after_update
AFTER UPDATE ON reviews
FOR EACH ROW
BEGIN
    UPDATE titles
       SET avg_rating   = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE title_id = NEW.title_id),
           rating_count = (SELECT COUNT(*)              FROM reviews WHERE title_id = NEW.title_id)
     WHERE title_id = NEW.title_id;
    INSERT INTO review_log (user_id, title_id, action, old_rating, new_rating)
    VALUES (NEW.user_id, NEW.title_id, 'UPDATE', OLD.rating, NEW.rating);
END$$

CREATE TRIGGER trg_review_after_delete
AFTER DELETE ON reviews
FOR EACH ROW
BEGIN
    UPDATE titles
       SET avg_rating   = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews WHERE title_id = OLD.title_id), 0),
           rating_count = (SELECT COUNT(*) FROM reviews WHERE title_id = OLD.title_id)
     WHERE title_id = OLD.title_id;
    INSERT INTO review_log (user_id, title_id, action, old_rating, new_rating)
    VALUES (OLD.user_id, OLD.title_id, 'DELETE', OLD.rating, NULL);
END$$

-- ---------------------------------------------------------------------
-- FUNCTION : percentage of a type ('movie' / 'series') a user has watched
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_progress_percent(p_user_id INT UNSIGNED, p_type VARCHAR(10))
RETURNS DECIMAL(5,2)
READS SQL DATA
BEGIN
    DECLARE v_total   INT;
    DECLARE v_watched INT;

    SELECT COUNT(*) INTO v_total FROM titles WHERE title_type = p_type;

    SELECT COUNT(*) INTO v_watched
      FROM watchlist w JOIN titles t ON t.title_id = w.title_id
     WHERE w.user_id = p_user_id AND w.status = 'watched' AND t.title_type = p_type;

    IF v_total = 0 THEN
        RETURN 0;
    END IF;
    RETURN ROUND(v_watched * 100 / v_total, 2);
END$$

-- ---------------------------------------------------------------------
-- PROCEDURE 1 : mark_watched  (insert OR update the checklist row)
-- ---------------------------------------------------------------------
CREATE PROCEDURE mark_watched(IN p_user_id INT UNSIGNED, IN p_title_id INT UNSIGNED)
BEGIN
    INSERT INTO watchlist (user_id, title_id, status, watched_on)
    VALUES (p_user_id, p_title_id, 'watched', CURRENT_DATE)
    ON DUPLICATE KEY UPDATE status = 'watched',
                            watched_on = COALESCE(watched_on, CURRENT_DATE);
END$$

-- ---------------------------------------------------------------------
-- PROCEDURE 2 : add_to_watchlist  (want to watch)
-- ---------------------------------------------------------------------
CREATE PROCEDURE add_to_watchlist(IN p_user_id INT UNSIGNED, IN p_title_id INT UNSIGNED)
BEGIN
    INSERT INTO watchlist (user_id, title_id, status)
    VALUES (p_user_id, p_title_id, 'want_to_watch')
    ON DUPLICATE KEY UPDATE status = 'want_to_watch';
END$$

-- ---------------------------------------------------------------------
-- PROCEDURE 3 : add_review  (insert a new review or update the old one)
-- ---------------------------------------------------------------------
CREATE PROCEDURE add_review(IN p_user_id INT UNSIGNED, IN p_title_id INT UNSIGNED,
                            IN p_rating TINYINT UNSIGNED, IN p_text VARCHAR(500))
BEGIN
    IF p_rating < 1 OR p_rating > 5 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Rating must be between 1 and 5';
    END IF;

    IF EXISTS (SELECT 1 FROM reviews WHERE user_id = p_user_id AND title_id = p_title_id) THEN
        UPDATE reviews
           SET rating = p_rating, review_text = p_text, reviewed_on = CURRENT_DATE
         WHERE user_id = p_user_id AND title_id = p_title_id;
    ELSE
        INSERT INTO reviews (user_id, title_id, rating, review_text)
        VALUES (p_user_id, p_title_id, p_rating, p_text);
    END IF;
END$$

-- ---------------------------------------------------------------------
-- PROCEDURE 4 : user_progress  (summary for one user, 2 rows: movie + series)
-- ---------------------------------------------------------------------
CREATE PROCEDURE user_progress(IN p_user_id INT UNSIGNED)
BEGIN
    SELECT t.title_type,
           COUNT(*)                                              AS total_titles,
           SUM(w.status = 'watched')                             AS watched,
           SUM(w.status = 'want_to_watch')                       AS want_to_watch,
           fn_progress_percent(p_user_id, t.title_type)          AS percent_watched
      FROM titles t
      LEFT JOIN watchlist w ON w.title_id = t.title_id AND w.user_id = p_user_id
     GROUP BY t.title_type;
END$$

DELIMITER ;
