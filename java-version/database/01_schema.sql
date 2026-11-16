-- =====================================================================
--  MARVEL TRACKER  -  RDBMS PROJECT
--  File 01 : SCHEMA  (database, tables, keys, constraints, indexes)
-- =====================================================================

DROP DATABASE IF EXISTS marvel_tracker;
CREATE DATABASE marvel_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE marvel_tracker;

-- ---------------------------------------------------------------------
-- 1. PHASES  (Phase 1..6, grouped into Sagas)
--    1 phase  ->  many titles                          (1 : N)
-- ---------------------------------------------------------------------
CREATE TABLE phases (
    phase_id      TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    phase_number  TINYINT UNSIGNED NOT NULL UNIQUE,
    saga          VARCHAR(30)      NOT NULL,
    CONSTRAINT chk_phase_number CHECK (phase_number BETWEEN 1 AND 10)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. DIRECTORS
--    1 director  ->  many movies                       (1 : N)
-- ---------------------------------------------------------------------
CREATE TABLE directors (
    director_id  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name         VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. PLATFORMS  (where a series streams)
-- ---------------------------------------------------------------------
CREATE TABLE platforms (
    platform_id  TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name         VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. USERS
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id    INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    username   VARCHAR(40)  NOT NULL UNIQUE,
    email      VARCHAR(100) NOT NULL UNIQUE,
    join_date  DATE         NOT NULL DEFAULT (CURRENT_DATE),
    CONSTRAINT chk_email CHECK (email LIKE '%_@_%._%')
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. TITLES  (SUPERTYPE : every movie AND every series is one row here)
--    avg_rating / rating_count are kept up to date by TRIGGERS.
-- ---------------------------------------------------------------------
CREATE TABLE titles (
    title_id      INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name          VARCHAR(120)  NOT NULL,
    title_type    ENUM('movie','series') NOT NULL,
    release_year  SMALLINT UNSIGNED NOT NULL,
    phase_id      TINYINT UNSIGNED  NOT NULL,
    synopsis      VARCHAR(500),
    poster_url    VARCHAR(200) NULL,                -- e.g. posters/iron-man-2008.jpg
    avg_rating    DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    rating_count  INT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT uq_title UNIQUE (name, release_year),
    CONSTRAINT chk_release_year CHECK (release_year BETWEEN 2008 AND 2100),
    CONSTRAINT fk_titles_phase FOREIGN KEY (phase_id)
        REFERENCES phases(phase_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_titles_type_phase ON titles(title_type, phase_id);

-- ---------------------------------------------------------------------
-- 6. MOVIE_DETAILS  (SUBTYPE : only for title_type = 'movie')
--    1 : 1 with titles  (PK is also the FK)
-- ---------------------------------------------------------------------
CREATE TABLE movie_details (
    title_id            INT UNSIGNED PRIMARY KEY,
    runtime_min         SMALLINT UNSIGNED NOT NULL,
    box_office_million  DECIMAL(8,1),               -- approx. worldwide, in USD millions
    director_id         INT UNSIGNED NOT NULL,
    CONSTRAINT chk_runtime CHECK (runtime_min BETWEEN 30 AND 300),
    CONSTRAINT fk_movie_title FOREIGN KEY (title_id)
        REFERENCES titles(title_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_movie_director FOREIGN KEY (director_id)
        REFERENCES directors(director_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. SERIES_DETAILS  (SUBTYPE : only for title_type = 'series')
-- ---------------------------------------------------------------------
CREATE TABLE series_details (
    title_id     INT UNSIGNED PRIMARY KEY,
    seasons      TINYINT UNSIGNED NOT NULL,
    episodes     SMALLINT UNSIGNED NOT NULL,
    platform_id  TINYINT UNSIGNED NOT NULL,
    CONSTRAINT chk_seasons  CHECK (seasons  >= 1),
    CONSTRAINT chk_episodes CHECK (episodes >= seasons),
    CONSTRAINT fk_series_title FOREIGN KEY (title_id)
        REFERENCES titles(title_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_series_platform FOREIGN KEY (platform_id)
        REFERENCES platforms(platform_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. GENRES  +  TITLE_GENRES   (M : N)
-- ---------------------------------------------------------------------
CREATE TABLE genres (
    genre_id  TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name      VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE title_genres (
    title_id  INT UNSIGNED     NOT NULL,
    genre_id  TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (title_id, genre_id),                -- composite primary key
    CONSTRAINT fk_tg_title FOREIGN KEY (title_id)
        REFERENCES titles(title_id) ON DELETE CASCADE,
    CONSTRAINT fk_tg_genre FOREIGN KEY (genre_id)
        REFERENCES genres(genre_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. CHARACTERS  +  TITLE_CHARACTERS   (M : N with an extra attribute)
-- ---------------------------------------------------------------------
CREATE TABLE characters (
    character_id  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    hero_name     VARCHAR(60) NOT NULL UNIQUE,
    real_name     VARCHAR(80),
    affiliation   VARCHAR(60)
) ENGINE=InnoDB;

CREATE TABLE title_characters (
    title_id      INT UNSIGNED NOT NULL,
    character_id  INT UNSIGNED NOT NULL,
    role_type     ENUM('lead','supporting','cameo') NOT NULL DEFAULT 'supporting',
    PRIMARY KEY (title_id, character_id),            -- composite primary key
    CONSTRAINT fk_tc_title FOREIGN KEY (title_id)
        REFERENCES titles(title_id) ON DELETE CASCADE,
    CONSTRAINT fk_tc_character FOREIGN KEY (character_id)
        REFERENCES characters(character_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. WATCHLIST  -  THE CHECKLIST  (users  M : N  titles)
--     status = 'want_to_watch'  or  'watched'
-- ---------------------------------------------------------------------
CREATE TABLE watchlist (
    user_id     INT UNSIGNED NOT NULL,
    title_id    INT UNSIGNED NOT NULL,
    status      ENUM('want_to_watch','watched') NOT NULL DEFAULT 'want_to_watch',
    added_on    DATE NOT NULL DEFAULT (CURRENT_DATE),
    watched_on  DATE NULL,
    PRIMARY KEY (user_id, title_id),                 -- a user can't add a title twice
    CONSTRAINT fk_wl_user  FOREIGN KEY (user_id)
        REFERENCES users(user_id)   ON DELETE CASCADE,
    CONSTRAINT fk_wl_title FOREIGN KEY (title_id)
        REFERENCES titles(title_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_watchlist_status ON watchlist(user_id, status);

-- ---------------------------------------------------------------------
-- 11. REVIEWS  (one review per user per title, rating 1-5)
-- ---------------------------------------------------------------------
CREATE TABLE reviews (
    review_id    INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id      INT UNSIGNED NOT NULL,
    title_id     INT UNSIGNED NOT NULL,
    rating       TINYINT UNSIGNED NOT NULL,
    review_text  VARCHAR(500),
    reviewed_on  DATE NOT NULL DEFAULT (CURRENT_DATE),
    CONSTRAINT uq_review UNIQUE (user_id, title_id),
    CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT fk_rv_user  FOREIGN KEY (user_id)
        REFERENCES users(user_id)   ON DELETE CASCADE,
    CONSTRAINT fk_rv_title FOREIGN KEY (title_id)
        REFERENCES titles(title_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 12. REVIEW_LOG  (audit table, filled automatically by a TRIGGER)
-- ---------------------------------------------------------------------
CREATE TABLE review_log (
    log_id      INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id     INT UNSIGNED NOT NULL,
    title_id    INT UNSIGNED NOT NULL,
    action      ENUM('INSERT','UPDATE','DELETE') NOT NULL,
    old_rating  TINYINT UNSIGNED NULL,
    new_rating  TINYINT UNSIGNED NULL,
    logged_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
