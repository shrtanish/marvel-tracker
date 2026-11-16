-- =====================================================================
--  File 06 : UPGRADE (posters).  For a database you ALREADY created.
--  Run this ONE file in MySQL Workbench. Do not re-run 01-04 afterwards.
--  (If you rebuilt the database from the new 01-04 files, skip this file.)
-- =====================================================================
USE marvel_tracker;

ALTER TABLE titles ADD COLUMN poster_url VARCHAR(200) NULL AFTER synopsis;

UPDATE titles SET poster_url = 'posters/iron-man-2008.jpg' WHERE name = 'Iron Man' AND release_year = 2008;
UPDATE titles SET poster_url = 'posters/the-incredible-hulk-2008.jpg' WHERE name = 'The Incredible Hulk' AND release_year = 2008;
UPDATE titles SET poster_url = 'posters/iron-man-2-2010.jpg' WHERE name = 'Iron Man 2' AND release_year = 2010;
UPDATE titles SET poster_url = 'posters/thor-2011.jpg' WHERE name = 'Thor' AND release_year = 2011;
UPDATE titles SET poster_url = 'posters/captain-america-the-first-avenger-2011.jpg' WHERE name = 'Captain America: The First Avenger' AND release_year = 2011;
UPDATE titles SET poster_url = 'posters/the-avengers-2012.jpg' WHERE name = 'The Avengers' AND release_year = 2012;
UPDATE titles SET poster_url = 'posters/iron-man-3-2013.jpg' WHERE name = 'Iron Man 3' AND release_year = 2013;
UPDATE titles SET poster_url = 'posters/thor-the-dark-world-2013.jpg' WHERE name = 'Thor: The Dark World' AND release_year = 2013;
UPDATE titles SET poster_url = 'posters/captain-america-the-winter-soldier-2014.jpg' WHERE name = 'Captain America: The Winter Soldier' AND release_year = 2014;
UPDATE titles SET poster_url = 'posters/guardians-of-the-galaxy-2014.jpg' WHERE name = 'Guardians of the Galaxy' AND release_year = 2014;
UPDATE titles SET poster_url = 'posters/avengers-age-of-ultron-2015.jpg' WHERE name = 'Avengers: Age of Ultron' AND release_year = 2015;
UPDATE titles SET poster_url = 'posters/ant-man-2015.jpg' WHERE name = 'Ant-Man' AND release_year = 2015;
UPDATE titles SET poster_url = 'posters/captain-america-civil-war-2016.jpg' WHERE name = 'Captain America: Civil War' AND release_year = 2016;
UPDATE titles SET poster_url = 'posters/doctor-strange-2016.jpg' WHERE name = 'Doctor Strange' AND release_year = 2016;
UPDATE titles SET poster_url = 'posters/guardians-of-the-galaxy-vol-2-2017.jpg' WHERE name = 'Guardians of the Galaxy Vol. 2' AND release_year = 2017;
UPDATE titles SET poster_url = 'posters/spider-man-homecoming-2017.jpg' WHERE name = 'Spider-Man: Homecoming' AND release_year = 2017;
UPDATE titles SET poster_url = 'posters/thor-ragnarok-2017.jpg' WHERE name = 'Thor: Ragnarok' AND release_year = 2017;
UPDATE titles SET poster_url = 'posters/black-panther-2018.jpg' WHERE name = 'Black Panther' AND release_year = 2018;
UPDATE titles SET poster_url = 'posters/avengers-infinity-war-2018.jpg' WHERE name = 'Avengers: Infinity War' AND release_year = 2018;
UPDATE titles SET poster_url = 'posters/ant-man-and-the-wasp-2018.jpg' WHERE name = 'Ant-Man and the Wasp' AND release_year = 2018;
UPDATE titles SET poster_url = 'posters/captain-marvel-2019.jpg' WHERE name = 'Captain Marvel' AND release_year = 2019;
UPDATE titles SET poster_url = 'posters/avengers-endgame-2019.jpg' WHERE name = 'Avengers: Endgame' AND release_year = 2019;
UPDATE titles SET poster_url = 'posters/spider-man-far-from-home-2019.jpg' WHERE name = 'Spider-Man: Far From Home' AND release_year = 2019;
UPDATE titles SET poster_url = 'posters/black-widow-2021.jpg' WHERE name = 'Black Widow' AND release_year = 2021;
UPDATE titles SET poster_url = 'posters/shang-chi-and-the-legend-of-the-ten-rings-2021.jpg' WHERE name = 'Shang-Chi and the Legend of the Ten Rings' AND release_year = 2021;
UPDATE titles SET poster_url = 'posters/eternals-2021.jpg' WHERE name = 'Eternals' AND release_year = 2021;
UPDATE titles SET poster_url = 'posters/spider-man-no-way-home-2021.jpg' WHERE name = 'Spider-Man: No Way Home' AND release_year = 2021;
UPDATE titles SET poster_url = 'posters/doctor-strange-in-the-multiverse-of-madness-2022.jpg' WHERE name = 'Doctor Strange in the Multiverse of Madness' AND release_year = 2022;
UPDATE titles SET poster_url = 'posters/thor-love-and-thunder-2022.jpg' WHERE name = 'Thor: Love and Thunder' AND release_year = 2022;
UPDATE titles SET poster_url = 'posters/black-panther-wakanda-forever-2022.jpg' WHERE name = 'Black Panther: Wakanda Forever' AND release_year = 2022;
UPDATE titles SET poster_url = 'posters/ant-man-and-the-wasp-quantumania-2023.jpg' WHERE name = 'Ant-Man and the Wasp: Quantumania' AND release_year = 2023;
UPDATE titles SET poster_url = 'posters/guardians-of-the-galaxy-vol-3-2023.jpg' WHERE name = 'Guardians of the Galaxy Vol. 3' AND release_year = 2023;
UPDATE titles SET poster_url = 'posters/the-marvels-2023.jpg' WHERE name = 'The Marvels' AND release_year = 2023;
UPDATE titles SET poster_url = 'posters/deadpool-wolverine-2024.jpg' WHERE name = 'Deadpool & Wolverine' AND release_year = 2024;
UPDATE titles SET poster_url = 'posters/captain-america-brave-new-world-2025.jpg' WHERE name = 'Captain America: Brave New World' AND release_year = 2025;
UPDATE titles SET poster_url = 'posters/thunderbolts-2025.jpg' WHERE name = 'Thunderbolts*' AND release_year = 2025;
UPDATE titles SET poster_url = 'posters/the-fantastic-four-first-steps-2025.jpg' WHERE name = 'The Fantastic Four: First Steps' AND release_year = 2025;
UPDATE titles SET poster_url = 'posters/wandavision-2021.jpg' WHERE name = 'WandaVision' AND release_year = 2021;
UPDATE titles SET poster_url = 'posters/the-falcon-and-the-winter-soldier-2021.jpg' WHERE name = 'The Falcon and the Winter Soldier' AND release_year = 2021;
UPDATE titles SET poster_url = 'posters/loki-2021.jpg' WHERE name = 'Loki' AND release_year = 2021;
UPDATE titles SET poster_url = 'posters/what-if-2021.jpg' WHERE name = 'What If...?' AND release_year = 2021;
UPDATE titles SET poster_url = 'posters/hawkeye-2021.jpg' WHERE name = 'Hawkeye' AND release_year = 2021;
UPDATE titles SET poster_url = 'posters/moon-knight-2022.jpg' WHERE name = 'Moon Knight' AND release_year = 2022;
UPDATE titles SET poster_url = 'posters/ms-marvel-2022.jpg' WHERE name = 'Ms. Marvel' AND release_year = 2022;
UPDATE titles SET poster_url = 'posters/she-hulk-attorney-at-law-2022.jpg' WHERE name = 'She-Hulk: Attorney at Law' AND release_year = 2022;
UPDATE titles SET poster_url = 'posters/secret-invasion-2023.jpg' WHERE name = 'Secret Invasion' AND release_year = 2023;
UPDATE titles SET poster_url = 'posters/agatha-all-along-2024.jpg' WHERE name = 'Agatha All Along' AND release_year = 2024;
UPDATE titles SET poster_url = 'posters/ironheart-2025.jpg' WHERE name = 'Ironheart' AND release_year = 2025;
UPDATE titles SET poster_url = 'posters/eyes-of-wakanda-2025.jpg' WHERE name = 'Eyes of Wakanda' AND release_year = 2025;

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

