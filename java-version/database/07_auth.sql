-- =====================================================================
--  File 07 : LOGIN SYSTEM  (passwords, roles, sessions, admin control)
--
--  Adds, on top of files 01-04:
--    * users  : password_hash, role (user/admin), is_active, failed_logins,
--               locked_until, last_login
--    * sessions table      (one row per logged-in browser)
--    * 2 triggers          (the last active admin can never be removed)
--    * procedure           sp_delete_user
--    * view                v_admin_users
--
--  - Your existing data is kept. Safe to run more than once.
--  - Passwords are NEVER stored as text: the Java backend stores a salted
--    PBKDF2 hash. The 5 demo users start without a password (they cannot log in).
-- =====================================================================
USE marvel_tracker;

-- ---------------------------------------------------------------------
-- 1. New columns on users  (added only if they are not there yet)
-- ---------------------------------------------------------------------
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_add_column$$
CREATE PROCEDURE sp_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition VARCHAR(255))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

CALL sp_add_column('users', 'password_hash', 'VARCHAR(200) NULL AFTER email');
CALL sp_add_column('users', 'role',          'ENUM(''user'',''admin'') NOT NULL DEFAULT ''user'' AFTER password_hash');
CALL sp_add_column('users', 'is_active',     'TINYINT(1) NOT NULL DEFAULT 1 AFTER role');
CALL sp_add_column('users', 'failed_logins', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
CALL sp_add_column('users', 'locked_until',  'DATETIME NULL');
CALL sp_add_column('users', 'last_login',    'DATETIME NULL');

DROP PROCEDURE sp_add_column;

-- ---------------------------------------------------------------------
-- 2. SESSIONS  (users 1 : N sessions)
--    The browser keeps a random token in a cookie; only its SHA-256 hash
--    is stored here, so a leaked database cannot be used to log in.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  CHAR(64)     NOT NULL PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME     NOT NULL,
    CONSTRAINT fk_sess_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_sessions_user (user_id),
    INDEX idx_sessions_expiry (expires_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. TRIGGERS : the database itself refuses to leave the site without an admin
-- ---------------------------------------------------------------------
DELIMITER $$

DROP TRIGGER IF EXISTS trg_users_keep_admin_update$$
CREATE TRIGGER trg_users_keep_admin_update
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    IF OLD.role = 'admin' AND OLD.is_active = 1
       AND (NEW.role <> 'admin' OR NEW.is_active = 0) THEN
        IF (SELECT COUNT(*) FROM users
             WHERE role = 'admin' AND is_active = 1 AND user_id <> OLD.user_id) = 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Cannot remove or suspend the last active admin';
        END IF;
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_users_keep_admin_delete$$
CREATE TRIGGER trg_users_keep_admin_delete
BEFORE DELETE ON users
FOR EACH ROW
BEGIN
    IF OLD.role = 'admin' AND OLD.is_active = 1 THEN
        IF (SELECT COUNT(*) FROM users
             WHERE role = 'admin' AND is_active = 1 AND user_id <> OLD.user_id) = 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Cannot delete the last active admin';
        END IF;
    END IF;
END$$

-- ---------------------------------------------------------------------
-- 4. PROCEDURE : delete a user completely
--    The reviews are deleted FIRST on purpose: MySQL does not run triggers for
--    rows removed by ON DELETE CASCADE, so deleting reviews explicitly is what
--    makes the rating triggers recalculate each title's average.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_delete_user$$
CREATE PROCEDURE sp_delete_user(IN p_user_id INT UNSIGNED)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;
    DELETE FROM reviews WHERE user_id = p_user_id;   -- fires the rating triggers
    DELETE FROM users   WHERE user_id = p_user_id;   -- watchlist + sessions cascade
    COMMIT;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- 5. VIEW : what the Admin tab shows
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_admin_users AS
SELECT u.user_id, u.username, u.email, u.role, u.is_active, u.join_date, u.last_login,
       (u.password_hash IS NOT NULL)                                   AS has_password,
       (u.locked_until IS NOT NULL AND u.locked_until > NOW())         AS is_locked,
       (SELECT COUNT(*) FROM watchlist w WHERE w.user_id = u.user_id AND w.status = 'watched')       AS watched,
       (SELECT COUNT(*) FROM watchlist w WHERE w.user_id = u.user_id AND w.status = 'want_to_watch') AS want_to_watch,
       (SELECT COUNT(*) FROM reviews   r WHERE r.user_id = u.user_id)                                AS reviews
FROM users u;

-- To make someone an admin by hand (in MySQL Workbench) you can also run:
--     UPDATE users SET role = 'admin' WHERE username = 'your_username';
