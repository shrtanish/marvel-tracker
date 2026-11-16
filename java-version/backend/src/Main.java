import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.SQLException;
import java.util.*;

/**
 * Marvel Tracker backend.
 *  - Serves the frontend files (../frontend) so everything runs from one address.
 *  - Exposes a small JSON API (/api/...) that talks to MySQL through JDBC.
 *  - Everything under /api/ needs a login, except /api/auth/... (see Auth.java).
 * Run from the backend folder:  see README.md
 */
public class Main {

    static final Path FRONTEND = Paths.get("..", "frontend").toAbsolutePath().normalize();

    public static void main(String[] args) throws Exception {
        Db.load("db.properties");
        try (var c = Db.connect()) {
            System.out.println("Connected to database OK.");
        } catch (SQLException e) {
            System.out.println("Could not connect to MySQL: " + e.getMessage());
            System.out.println("Check backend/db.properties (password!) and that MySQL is running.");
            return;
        }
        try {
            if (Auth.needsSetup()) Auth.printSetupBanner();
        } catch (SQLException e) {
            System.out.println("The database has no login tables yet.");
            System.out.println("Run database/07_auth.sql in MySQL Workbench, then start this program again.");
            return;
        }
        int port = Integer.parseInt(Db.config.getProperty("port", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", Main::handle);
        server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(8));   // logins take a moment (password hashing)
        server.start();
        System.out.println("Marvel Tracker running ->  http://localhost:" + port);
    }

    // ------------------------------------------------------------------ routing
    static void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        try {
            if (path.startsWith("/api/")) api(ex, path.substring(5));
            else staticFile(ex, path);
        } catch (Auth.ApiError e) {
            send(ex, e.status, Json.write(Map.of("error", e.getMessage())));
        } catch (NumberFormatException e) {
            send(ex, 400, Json.write(Map.of("error", "Bad request.")));
        } catch (SQLException e) {
            // SQL errors (e.g. CHECK constraint, SIGNAL from a procedure or trigger) are sent back as JSON
            send(ex, 400, Json.write(Map.of("error", cleanSql(e.getMessage()))));
        } catch (Exception e) {
            e.printStackTrace();
            send(ex, 500, Json.write(Map.of("error", "Something went wrong on the server.")));
        }
    }

    static void api(HttpExchange ex, String route) throws Exception {
        String method = ex.getRequestMethod();
        Map<String, String> q = queryParams(ex);

        if (method.equals("OPTIONS")) { send(ex, 204, ""); return; }

        // ---- sign up / log in / log out (no login needed)
        if (route.startsWith("auth/")) { Auth.handle(ex, route.substring(5), method); return; }

        // ---- everything else needs a logged-in user. WHO the user is comes from the session cookie,
        //      never from anything the browser sends in the request.
        Map<String, Object> me = Auth.currentUser(ex);
        if (me == null) { send(ex, 401, Json.write(Map.of("error", "Please log in."))); return; }
        int uid = ((Number) me.get("user_id")).intValue();

        if (route.startsWith("admin/")) {
            if (!"admin".equals(me.get("role"))) { send(ex, 403, Json.write(Map.of("error", "Admins only."))); return; }
            Auth.admin(ex, route.substring(6), method, me);
            return;
        }

        switch (route) {

            case "phases" -> send(ex, 200, Json.write(Db.query(
                    "SELECT phase_number, saga FROM phases ORDER BY phase_number")));

            // GET /api/titles?type=movie|series&phase=1&q=iron&status=watched
            case "titles" -> {
                StringBuilder sql = new StringBuilder(
                    "SELECT v.title_id, v.name, v.title_type, v.release_year, v.phase_number, v.saga, " +
                    "v.runtime_min, v.box_office_million, v.director, v.seasons, v.episodes, v.platform, " +
                    "v.avg_rating, v.rating_count, v.synopsis, v.poster_url, " +
                    "w.status AS my_status, r.rating AS my_rating " +
                    "FROM v_catalog v " +
                    "LEFT JOIN watchlist w ON w.title_id = v.title_id AND w.user_id = ? " +
                    "LEFT JOIN reviews   r ON r.title_id = v.title_id AND r.user_id = ? WHERE 1=1 ");
                List<Object> params = new ArrayList<>();
                params.add(uid); params.add(uid);
                if (q.containsKey("type"))   { sql.append("AND v.title_type = ? ");   params.add(q.get("type")); }
                if (q.containsKey("phase"))  { sql.append("AND v.phase_number = ? "); params.add(Integer.parseInt(q.get("phase"))); }
                if (q.containsKey("q"))      { sql.append("AND v.name LIKE ? ");      params.add("%" + q.get("q") + "%"); }
                if (q.containsKey("status")) { sql.append("AND w.status = ? ");       params.add(q.get("status")); }
                sql.append("ORDER BY v.release_year, v.title_id");
                send(ex, 200, Json.write(Db.query(sql.toString(), params.toArray())));
            }

            // GET /api/title?id=5  -> details + characters + genres + reviews
            case "title" -> {
                int id = Integer.parseInt(q.get("id"));
                var rows = Db.query("SELECT * FROM v_catalog WHERE title_id = ?", id);
                if (rows.isEmpty()) { send(ex, 404, Json.write(Map.of("error", "Not found"))); return; }
                Map<String, Object> t = new LinkedHashMap<>(rows.get(0));
                t.put("characters", Db.query(
                    "SELECT c.hero_name, c.real_name, tc.role_type FROM title_characters tc " +
                    "JOIN characters c ON c.character_id = tc.character_id WHERE tc.title_id = ? " +
                    "ORDER BY FIELD(tc.role_type,'lead','supporting','cameo'), c.hero_name", id));
                t.put("genres", Db.query(
                    "SELECT g.name FROM title_genres tg JOIN genres g ON g.genre_id = tg.genre_id WHERE tg.title_id = ?", id));
                t.put("reviews", Db.query(
                    "SELECT u.username, r.rating, r.review_text, r.reviewed_on FROM reviews r " +
                    "JOIN users u ON u.user_id = r.user_id WHERE r.title_id = ? ORDER BY r.reviewed_on DESC", id));
                send(ex, 200, Json.write(t));
            }

            // GET /api/progress   (progress of the logged-in user)
            case "progress" -> send(ex, 200, Json.write(Db.query(
                    "SELECT title_type, total_titles, watched, percent_watched FROM v_user_progress WHERE user_id = ?", uid)));

            // GET /api/stats  -> a few report-style queries for the Stats tab
            case "stats" -> {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("phases", Db.query("SELECT * FROM v_phase_stats ORDER BY phase_number"));
                out.put("top_rated", Db.query("SELECT name, title_type, avg_rating, rating_count FROM v_top_rated LIMIT 5"));
                out.put("characters", Db.query("SELECT hero_name, appearances FROM v_character_appearances ORDER BY appearances DESC, hero_name LIMIT 5"));
                out.put("leaderboard", Db.query(
                    "SELECT u.username, COUNT(*) AS watched FROM watchlist w JOIN users u ON u.user_id = w.user_id " +
                    "WHERE w.status = 'watched' GROUP BY u.username ORDER BY watched DESC"));
                send(ex, 200, Json.write(out));
            }

            // POST /api/watch  {title_id,status}   status = watched | want_to_watch
            case "watch" -> {
                requireMethod(method, "POST");
                Map<String, String> b = Json.readFlat(body(ex));
                int tid = Integer.parseInt(b.get("title_id"));
                if ("watched".equals(b.get("status"))) Db.call("mark_watched", uid, tid);
                else Db.call("add_to_watchlist", uid, tid);
                send(ex, 200, Json.write(Map.of("ok", true)));
            }

            // DELETE /api/unwatch?title_id=5  (remove from checklist)
            case "unwatch" -> {
                requireMethod(method, "DELETE");
                Db.update("DELETE FROM watchlist WHERE user_id = ? AND title_id = ?", uid, Integer.parseInt(q.get("title_id")));
                send(ex, 200, Json.write(Map.of("ok", true)));
            }

            // POST /api/review {title_id,rating,review_text}
            case "review" -> {
                requireMethod(method, "POST");
                Map<String, String> b = Json.readFlat(body(ex));
                Db.call("add_review", uid, Integer.parseInt(b.get("title_id")),
                        Integer.parseInt(b.get("rating")), b.getOrDefault("review_text", ""));
                send(ex, 200, Json.write(Map.of("ok", true)));
            }

            default -> send(ex, 404, Json.write(Map.of("error", "Unknown API route")));
        }
    }

    // ------------------------------------------------------------------ helpers
    /** Changing data must use POST / DELETE, never a plain GET (a GET can be triggered just by clicking a link). */
    static void requireMethod(String actual, String expected) {
        if (!actual.equals(expected)) throw new Auth.ApiError(405, "Use " + expected + " for this request.");
    }

    static void staticFile(HttpExchange ex, String path) throws IOException {
        if (path.equals("/")) path = "/index.html";
        Path file = FRONTEND.resolve(path.substring(1)).normalize();
        if (!file.startsWith(FRONTEND) || !Files.isRegularFile(file)) {
            send(ex, 404, "Not found", "text/plain");
            return;
        }
        String name = file.getFileName().toString();
        String type = name.endsWith(".html") ? "text/html; charset=utf-8"
                : name.endsWith(".css") ? "text/css; charset=utf-8"
                : name.endsWith(".js") ? "application/javascript; charset=utf-8"
                : name.endsWith(".jpg") || name.endsWith(".jpeg") ? "image/jpeg"
                : name.endsWith(".png") ? "image/png"
                : name.endsWith(".webp") ? "image/webp"
                : name.endsWith(".svg") ? "image/svg+xml"
                : "application/octet-stream";
        sendBytes(ex, 200, Files.readAllBytes(file), type);
    }

    static Map<String, String> queryParams(HttpExchange ex) {
        Map<String, String> m = new HashMap<>();
        String raw = ex.getRequestURI().getRawQuery();
        if (raw == null) return m;
        for (String pair : raw.split("&")) {
            String[] kv = pair.split("=", 2);
            String v = kv.length > 1 ? URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "";
            if (!v.isEmpty()) m.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8), v);
        }
        return m;
    }

    /** Reads the request body (at most 20 KB). */
    static String body(HttpExchange ex) throws IOException {
        try (InputStream in = ex.getRequestBody()) {
            byte[] data = in.readNBytes(20_001);
            if (data.length > 20_000) throw new Auth.ApiError(413, "Request is too large.");
            return new String(data, StandardCharsets.UTF_8);
        }
    }

    /** The MariaDB driver adds "(conn=12) " in front of messages. Remove it so the user sees a clean sentence. */
    static String cleanSql(String message) {
        return String.valueOf(message).replaceFirst("^\\(conn[=:]\\d+\\)\\s*", "");
    }

    static void send(HttpExchange ex, int code, String body) throws IOException {
        send(ex, code, body, "application/json; charset=utf-8");
    }

    static void send(HttpExchange ex, int code, String body, String type) throws IOException {
        sendBytes(ex, code, body.getBytes(StandardCharsets.UTF_8), type);
    }

    static void sendBytes(HttpExchange ex, int code, byte[] bytes, String type) throws IOException {
        var h = ex.getResponseHeaders();
        h.set("Content-Type", type);
        h.set("X-Content-Type-Options", "nosniff");
        h.set("X-Frame-Options", "DENY");
        h.set("Referrer-Policy", "same-origin");
        if (type.startsWith("application/json")) h.set("Cache-Control", "no-store");
        ex.sendResponseHeaders(code, code == 204 ? -1 : bytes.length);
        if (code != 204) try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
        ex.close();
    }
}
