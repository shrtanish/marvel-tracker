import com.sun.net.httpserver.HttpExchange;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Sign up, log in, sessions and the admin tools.
 *
 *  - Passwords are never stored. We store a salted PBKDF2-SHA256 hash.
 *  - A login creates a random session token. The browser keeps it in an HttpOnly cookie,
 *    the database keeps only its SHA-256 hash (table: sessions).
 *  - 5 wrong passwords lock the account for 10 minutes (columns failed_logins / locked_until).
 *  - The first admin is created with a one-time SETUP CODE that is printed in the VS Code terminal,
 *    so only the person running the program can become admin.
 */
public class Auth {

    /** An error that is sent to the browser as {"error": "..."} with the given HTTP status. */
    static class ApiError extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final int status;
        ApiError(int status, String message) { super(message); this.status = status; }
    }

    static final SecureRandom RNG = new SecureRandom();
    static final int ITERATIONS = 600_000;           // PBKDF2 work factor (stored inside every hash)
    static final String COOKIE = "mt_session";
    static final int SESSION_DAYS = 14;
    static final int MAX_FAILS = 5, LOCK_MINUTES = 10;
    static final Pattern USERNAME = Pattern.compile("^[A-Za-z0-9_]{3,20}$");
    static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    /** Used to spend the same time on unknown usernames, so response time does not reveal who exists. */
    static final String DUMMY_HASH = hash("not-a-real-password");

    // ================================================================== passwords
    static String hash(String password) {
        byte[] salt = new byte[16];
        RNG.nextBytes(salt);
        return "pbkdf2_sha256$" + ITERATIONS + "$" + b64(salt) + "$" + b64(pbkdf2(password, salt, ITERATIONS));
    }

    static boolean verify(String password, String stored) {
        try {
            String[] p = stored.split("\\$");
            if (p.length != 4 || !p[0].equals("pbkdf2_sha256")) return false;
            int iterations = Integer.parseInt(p[1]);
            if (iterations < 1000 || iterations > 5_000_000) return false;
            byte[] salt = Base64.getDecoder().decode(p[2]);
            byte[] expected = Base64.getDecoder().decode(p[3]);
            return MessageDigest.isEqual(expected, pbkdf2(password, salt, iterations));   // constant-time compare
        } catch (Exception e) {
            return false;
        }
    }

    private static byte[] pbkdf2(String password, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, 256);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String b64(byte[] bytes) { return Base64.getEncoder().encodeToString(bytes); }

    static String sha256(String text) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static void checkPassword(String password, String username) {
        if (password.length() < 8) throw new ApiError(400, "Password must be at least 8 characters.");
        if (password.length() > 128) throw new ApiError(400, "Password is too long (128 characters max).");
        if (password.equalsIgnoreCase(username)) throw new ApiError(400, "Password can't be the same as the username.");
    }

    // ================================================================== sessions
    static void startSession(HttpExchange ex, int userId) throws SQLException {
        revokeCurrent(ex);                                          // drop an older session of this browser
        byte[] raw = new byte[32];
        RNG.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Db.update("DELETE FROM sessions WHERE expires_at < NOW()");  // tidy up old rows
        Db.update("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))",
                sha256(token), userId, SESSION_DAYS);
        setCookie(ex, token, SESSION_DAYS * 86400);
    }

    static void revokeCurrent(HttpExchange ex) throws SQLException {
        String token = cookie(ex, COOKIE);
        if (token != null) Db.update("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
    }

    /** The logged-in user of this request, or null. */
    static Map<String, Object> currentUser(HttpExchange ex) throws SQLException {
        String token = cookie(ex, COOKIE);
        if (token == null || token.length() < 20 || token.length() > 100) return null;
        var rows = Db.query(
                "SELECT u.user_id, u.username, u.email, u.role FROM sessions s " +
                "JOIN users u ON u.user_id = s.user_id " +
                "WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_active = 1", sha256(token));
        return rows.isEmpty() ? null : rows.get(0);
    }

    static String cookie(HttpExchange ex, String name) {
        List<String> headers = ex.getRequestHeaders().get("Cookie");
        if (headers == null) return null;
        for (String h : headers)
            for (String part : h.split(";")) {
                String[] kv = part.trim().split("=", 2);
                if (kv.length == 2 && kv[0].equals(name) && !kv[1].isEmpty()) return kv[1];
            }
        return null;
    }

    static void setCookie(HttpExchange ex, String value, int maxAgeSeconds) {
        String proto = ex.getRequestHeaders().getFirst("X-Forwarded-Proto");     // set by tunnels / proxies
        boolean https = proto != null && proto.toLowerCase().startsWith("https");
        ex.getResponseHeaders().add("Set-Cookie", COOKIE + "=" + value + "; Path=/; HttpOnly; SameSite=Lax; Max-Age="
                + maxAgeSeconds + (https ? "; Secure" : ""));
    }

    // ================================================================== first-admin setup code
    private static String setupCode;
    private static int wrongCodes;
    private static long codeLockedUntil;                 // epoch millis; guessing is paused until then

    /** True while there is no admin who can log in. */
    static boolean needsSetup() throws SQLException {
        var r = Db.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND password_hash IS NOT NULL");
        return ((Number) r.get(0).get("n")).intValue() == 0;
    }

    static synchronized String setupCode() {
        if (setupCode == null) setupCode = String.format("%06d", RNG.nextInt(1_000_000));
        return setupCode;
    }

    private static synchronized boolean codeMatches(String given) {
        if (System.currentTimeMillis() < codeLockedUntil)
            throw new ApiError(429, "Too many wrong setup codes. Wait 10 minutes, or restart the program to get a fresh code.");
        boolean ok = MessageDigest.isEqual(given.getBytes(StandardCharsets.UTF_8), setupCode().getBytes(StandardCharsets.UTF_8));
        if (!ok && ++wrongCodes >= 5) {            // too many guesses: new code + a 10 minute pause (nobody can brute-force 6 digits)
            wrongCodes = 0;
            setupCode = null;
            codeLockedUntil = System.currentTimeMillis() + 10 * 60_000L;
            printSetupBanner();
        }
        return ok;
    }

    static void printSetupBanner() {
        System.out.println();
        System.out.println("==============================================================");
        System.out.println("  NO ADMIN YET.  To become the admin, open the website, click");
        System.out.println("  Sign up and type this ADMIN SETUP CODE:   " + setupCode());
        System.out.println("  (Tip: sign up as 'tanish' with the code to keep that checklist.)");
        System.out.println("==============================================================");
        System.out.println();
    }

    // ================================================================== public auth routes  (/api/auth/...)
    static void handle(HttpExchange ex, String route, String method) throws Exception {
        switch (route) {
            case "me" -> {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("user", currentUser(ex));
                out.put("needs_setup", needsSetup());
                Main.send(ex, 200, Json.write(out));
            }
            case "signup" -> { post(method); signup(ex); }
            case "login" -> { post(method); login(ex); }
            case "logout" -> { post(method); revokeCurrent(ex); setCookie(ex, "", 0); ok(ex); }
            case "password" -> { post(method); changePassword(ex); }
            default -> throw new ApiError(404, "Unknown API route");
        }
    }

    static void signup(HttpExchange ex) throws Exception {
        Map<String, String> b = Json.readFlat(Main.body(ex));
        String username = text(b, "username"), email = text(b, "email"), code = text(b, "setup_code");
        String password = b.getOrDefault("password", "");

        if (!USERNAME.matcher(username).matches())
            throw new ApiError(400, "Username must be 3-20 characters: letters, numbers or underscore.");
        if (email.length() > 100 || !EMAIL.matcher(email).matches())
            throw new ApiError(400, "Please enter a valid email address.");
        checkPassword(password, username);

        boolean asAdmin = false;
        if (!code.isEmpty() && needsSetup()) {
            if (!codeMatches(code)) throw new ApiError(403, "Wrong admin setup code.");
            asAdmin = true;
        }

        Integer claimId = null;                                       // demo account being claimed by the owner
        var existing = Db.query("SELECT user_id, password_hash FROM users WHERE username = ?", username);
        if (!existing.isEmpty()) {
            boolean unclaimedDemo = existing.get(0).get("password_hash") == null;
            if (unclaimedDemo && asAdmin) claimId = ((Number) existing.get(0).get("user_id")).intValue();
            else throw new ApiError(409, "That username is already taken.");
        }
        var sameEmail = Db.query("SELECT user_id FROM users WHERE email = ?", email);
        if (!sameEmail.isEmpty() && (claimId == null || ((Number) sameEmail.get(0).get("user_id")).intValue() != claimId))
            throw new ApiError(409, "That email is already registered.");

        String hashed = hash(password);
        try {
            if (claimId != null)
                Db.update("UPDATE users SET email = ?, password_hash = ?, role = 'admin', is_active = 1 WHERE user_id = ?",
                        email, hashed, claimId);
            else
                Db.update("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
                        username, email, hashed, asAdmin ? "admin" : "user");
        } catch (SQLIntegrityConstraintViolationException e) {        // two people signing up at the very same moment
            throw new ApiError(409, "That username or email is already registered.");
        }
        int userId = ((Number) Db.query("SELECT user_id FROM users WHERE username = ?", username).get(0).get("user_id")).intValue();
        Db.update("UPDATE users SET last_login = NOW() WHERE user_id = ?", userId);
        startSession(ex, userId);
        Main.send(ex, 200, Json.write(Map.of("user", userRow(userId))));
    }

    static void login(HttpExchange ex) throws Exception {
        Map<String, String> b = Json.readFlat(Main.body(ex));
        String username = text(b, "username"), password = b.getOrDefault("password", "");
        if (username.isEmpty() || password.isEmpty()) throw new ApiError(400, "Enter your username and password.");
        if (username.length() > 40 || password.length() > 128) throw invalid();

        var rows = Db.query("SELECT user_id, password_hash, is_active, " +
                "(locked_until IS NOT NULL AND locked_until > NOW()) AS locked FROM users WHERE username = ?", username);
        if (rows.isEmpty() || rows.get(0).get("password_hash") == null) {
            verify(password, DUMMY_HASH);                              // same delay as a real check
            throw invalid();
        }
        Map<String, Object> u = rows.get(0);
        int id = ((Number) u.get("user_id")).intValue();

        if (truthy(u.get("locked")))
            throw new ApiError(429, "Too many wrong passwords. Try again in " + LOCK_MINUTES + " minutes.");

        if (!verify(password, (String) u.get("password_hash"))) {
            Db.update("UPDATE users SET failed_logins = failed_logins + 1 WHERE user_id = ?", id);
            Db.update("UPDATE users SET locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE), failed_logins = 0 " +
                    "WHERE user_id = ? AND failed_logins >= ?", LOCK_MINUTES, id, MAX_FAILS);
            throw invalid();
        }
        if (!truthy(u.get("is_active")))
            throw new ApiError(403, "This account has been suspended. Please contact the admin.");

        Db.update("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = NOW() WHERE user_id = ?", id);
        startSession(ex, id);
        Main.send(ex, 200, Json.write(Map.of("user", userRow(id))));
    }

    static void changePassword(HttpExchange ex) throws Exception {
        Map<String, Object> me = currentUser(ex);
        if (me == null) throw new ApiError(401, "Please log in.");
        Map<String, String> b = Json.readFlat(Main.body(ex));
        int id = ((Number) me.get("user_id")).intValue();
        String current = b.getOrDefault("current_password", ""), next = b.getOrDefault("new_password", "");

        String stored = (String) Db.query("SELECT password_hash FROM users WHERE user_id = ?", id).get(0).get("password_hash");
        if (stored == null || !verify(current, stored)) throw new ApiError(403, "Your current password is wrong.");
        checkPassword(next, (String) me.get("username"));

        Db.update("UPDATE users SET password_hash = ? WHERE user_id = ?", hash(next), id);
        // log out every other browser, keep this one
        Db.update("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", id, sha256(cookie(ex, COOKIE)));
        ok(ex);
    }

    // ================================================================== admin routes  (/api/admin/...)
    static void admin(HttpExchange ex, String route, String method, Map<String, Object> me) throws Exception {
        int myId = ((Number) me.get("user_id")).intValue();
        switch (route) {

            case "users" -> Main.send(ex, 200, Json.write(Db.query(
                    "SELECT * FROM v_admin_users ORDER BY (role = 'admin') DESC, user_id")));

            case "role" -> {
                post(method);
                Map<String, String> b = Json.readFlat(Main.body(ex));
                int id = intOf(b, "user_id");
                String role = b.getOrDefault("role", "");
                if (!role.equals("admin") && !role.equals("user")) throw new ApiError(400, "Role must be admin or user.");
                if (id == myId) throw new ApiError(400, "You can't change your own role.");
                requireUser(id);
                Db.update("UPDATE users SET role = ? WHERE user_id = ?", role, id);   // trigger protects the last admin
                ok(ex);
            }

            case "status" -> {
                post(method);
                Map<String, String> b = Json.readFlat(Main.body(ex));
                int id = intOf(b, "user_id");
                boolean active = "true".equals(b.get("active"));
                if (id == myId) throw new ApiError(400, "You can't suspend yourself.");
                requireUser(id);
                Db.update("UPDATE users SET is_active = ? WHERE user_id = ?", active ? 1 : 0, id);
                if (!active) Db.update("DELETE FROM sessions WHERE user_id = ?", id);   // kick them out now
                ok(ex);
            }

            case "password" -> {
                post(method);
                Map<String, String> b = Json.readFlat(Main.body(ex));
                int id = intOf(b, "user_id");
                String username = requireUser(id);
                String pw = b.getOrDefault("password", "");
                checkPassword(pw, username);
                Db.update("UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE user_id = ?", hash(pw), id);
                Db.update("DELETE FROM sessions WHERE user_id = ?", id);
                ok(ex);
            }

            case "delete" -> {
                post(method);
                Map<String, String> b = Json.readFlat(Main.body(ex));
                int id = intOf(b, "user_id");
                if (id == myId) throw new ApiError(400, "You can't delete your own account.");
                requireUser(id);
                Db.call("sp_delete_user", id);
                ok(ex);
            }

            default -> throw new ApiError(404, "Unknown API route");
        }
    }

    // ================================================================== small helpers
    static Map<String, Object> userRow(int id) throws SQLException {
        return Db.query("SELECT user_id, username, email, role FROM users WHERE user_id = ?", id).get(0);
    }

    private static String requireUser(int id) throws SQLException {
        var r = Db.query("SELECT username FROM users WHERE user_id = ?", id);
        if (r.isEmpty()) throw new ApiError(404, "User not found.");
        return (String) r.get(0).get("username");
    }

    private static void post(String method) {
        if (!method.equals("POST")) throw new ApiError(405, "Use POST for this request.");
    }

    private static void ok(HttpExchange ex) throws java.io.IOException {
        Main.send(ex, 200, Json.write(Map.of("ok", true)));
    }

    private static String text(Map<String, String> b, String key) {
        String v = b.get(key);
        return v == null ? "" : v.trim();
    }

    private static int intOf(Map<String, String> b, String key) {
        try { return Integer.parseInt(b.get(key)); }
        catch (NumberFormatException e) { throw new ApiError(400, "Bad request."); }
    }

    private static ApiError invalid() { return new ApiError(401, "Invalid username or password."); }

    /** MySQL tinyint(1) can arrive as Boolean or as a number, depending on the driver. */
    static boolean truthy(Object o) {
        if (o instanceof Boolean) return (Boolean) o;
        return o instanceof Number && ((Number) o).intValue() != 0;
    }
}
