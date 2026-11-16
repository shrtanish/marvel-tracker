import java.io.FileInputStream;
import java.io.IOException;
import java.sql.*;
import java.util.*;

/** Database helper: opens JDBC connections and turns query results into plain Java lists/maps. */
public class Db {
    static final Properties config = new Properties();

    static void load(String file) throws IOException {
        try (FileInputStream in = new FileInputStream(file)) {
            config.load(in);
        }
    }

    static Connection connect() throws SQLException {
        return DriverManager.getConnection(
                config.getProperty("url"), config.getProperty("user"), config.getProperty("password"));
    }

    /** Runs a SELECT and returns every row as a Map(columnName -> value). */
    static List<Map<String, Object>> query(String sql, Object... params) throws SQLException {
        try (Connection c = connect(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            try (ResultSet rs = ps.executeQuery()) {
                return rows(rs);
            }
        }
    }

    /** Runs a stored procedure:  CALL name(?, ?, ...) */
    static void call(String procedure, Object... params) throws SQLException {
        String marks = String.join(",", Collections.nCopies(params.length, "?"));
        try (Connection c = connect(); CallableStatement cs = c.prepareCall("{CALL " + procedure + "(" + marks + ")}")) {
            for (int i = 0; i < params.length; i++) cs.setObject(i + 1, params[i]);
            cs.execute();
        }
    }

    /** Runs INSERT / UPDATE / DELETE. */
    static int update(String sql, Object... params) throws SQLException {
        try (Connection c = connect(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            return ps.executeUpdate();
        }
    }

    private static List<Map<String, Object>> rows(ResultSet rs) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int n = md.getColumnCount();
        List<Map<String, Object>> out = new ArrayList<>();
        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= n; i++) {
                Object v = rs.getObject(i);
                if (v instanceof java.math.BigDecimal) v = ((java.math.BigDecimal) v).doubleValue();
                else if (v instanceof java.sql.Date || v instanceof java.sql.Timestamp || v instanceof java.time.temporal.TemporalAccessor)
                    v = v.toString();
                row.put(md.getColumnLabel(i), v);
            }
            out.add(row);
        }
        return out;
    }
}
