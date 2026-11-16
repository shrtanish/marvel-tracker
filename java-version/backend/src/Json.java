import java.util.*;
import java.util.regex.*;

/** Tiny JSON helper (no libraries needed): writes lists/maps as JSON and reads flat JSON objects. */
public class Json {

    static String write(Object o) {
        StringBuilder sb = new StringBuilder();
        write(o, sb);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void write(Object o, StringBuilder sb) {
        if (o == null) sb.append("null");
        else if (o instanceof Number || o instanceof Boolean) sb.append(o);
        else if (o instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) o).entrySet()) {
                if (!first) sb.append(',');
                first = false;
                sb.append(quote(e.getKey())).append(':');
                write(e.getValue(), sb);
            }
            sb.append('}');
        } else if (o instanceof Collection) {
            sb.append('[');
            boolean first = true;
            for (Object x : (Collection<Object>) o) {
                if (!first) sb.append(',');
                first = false;
                write(x, sb);
            }
            sb.append(']');
        } else sb.append(quote(o.toString()));
    }

    private static String quote(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default: if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }

    /** Reads a flat object like {"user_id":1,"review_text":"hi"} into a Map. */
    static Map<String, String> readFlat(String body) {
        Map<String, String> map = new HashMap<>();
        Pattern p = Pattern.compile("\"([^\"]+)\"\\s*:\\s*(?:\"((?:[^\"\\\\]|\\\\.)*)\"|(-?[0-9.]+|true|false|null))");
        Matcher m = p.matcher(body);
        while (m.find()) {
            String v = m.group(2) != null ? unescape(m.group(2)) : m.group(3);
            map.put(m.group(1), v);
        }
        return map;
    }

    /** Turns JSON escapes (backslash-n, backslash-quote, double backslash, unicode escapes ...) back into
     *  real characters, in one pass from left to right.
     *  (Important for passwords: a password that contains a backslash must come back exactly as typed.) */
    private static String unescape(String s) {
        if (s.indexOf('\\') < 0) return s;
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c != '\\' || i + 1 >= s.length()) { sb.append(c); continue; }
            char n = s.charAt(++i);
            switch (n) {
                case 'n': sb.append('\n'); break;
                case 'r': sb.append('\r'); break;
                case 't': sb.append('\t'); break;
                case 'b': sb.append('\b'); break;
                case 'f': sb.append('\f'); break;
                case 'u':
                    if (i + 4 < s.length()) {
                        try {
                            sb.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16));
                            i += 4;
                            break;
                        } catch (NumberFormatException ignored) { /* fall through: keep the text as it is */ }
                    }
                    sb.append("\\u");
                    break;
                default: sb.append(n);          // \\  \"  \/
            }
        }
        return sb.toString();
    }
}
