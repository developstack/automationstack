package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 手写的递归下降 JSON 解析器。**包内可见，不是公开 API。**
 *
 * 不引 Jackson / Gson 的理由写在 {@link Json} 顶部，一个字都不重复。这里只补一句
 * 解析侧独有的：服务端的对账单是**一小块形状完全已知的 JSON**，四个数组加几个标量，
 * 深度不超过三层。为它引一个反射驱动的通用绑定框架，除了版本冲突之外什么也没换来。
 *
 * <p>解析结果用最朴素的 Java 类型表达，与 {@link Json} 的编码侧对称：
 * <ul>
 *   <li>对象 → {@link LinkedHashMap}（保留服务端给的键序，方便人读日志）</li>
 *   <li>数组 → {@link ArrayList}</li>
 *   <li>字符串 → {@link String}；true/false → {@link Boolean}；null → {@code null}</li>
 *   <li>整数 → {@link Long}（溢出时退回 {@link Double}）；带小数点或指数 → {@link Double}</li>
 * </ul>
 * 不做 POJO 绑定：契约类各自的 {@code fromWire} 从这张 Map 里逐个取字段，
 * 拼错的键名在**解析这一步**就露出来，而不是等到用户机器上炸成一个空对账单。
 */
final class JsonParser {

    private static final int MAX_DEPTH = 64;

    private final String text;
    private int cursor;

    private JsonParser(String text) {
        this.text = text;
    }

    static Object parse(String text) {
        JsonParser parser = new JsonParser(text);
        parser.skipWhitespace();
        Object value = parser.readValue(0);
        parser.skipWhitespace();
        if (parser.cursor != text.length()) {
            throw parser.fail("JSON 解析完之后还有多余的内容");
        }
        return value;
    }

    /**
     * 顶层必须是对象时用这个。ingest 的四条路由全都返回对象；
     * 拿到数组或字符串说明打到了反代的错误页，那时候一句「不是 JSON 对象」
     * 比 ClassCastException 有用得多。
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> parseObject(String text) {
        Object parsed = parse(text);
        if (parsed instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        throw new IllegalArgumentException(
                "期望一个 JSON 对象，实际拿到的是 " + (parsed == null ? "null" : parsed.getClass().getSimpleName()));
    }

    private Object readValue(int depth) {
        if (depth > MAX_DEPTH) {
            throw fail("JSON 嵌套超过 " + MAX_DEPTH + " 层");
        }
        char current = peek();
        return switch (current) {
            case '{' -> readObject(depth);
            case '[' -> readArray(depth);
            case '"' -> readString();
            case 't' -> readLiteral("true", Boolean.TRUE);
            case 'f' -> readLiteral("false", Boolean.FALSE);
            case 'n' -> readLiteral("null", null);
            default -> readNumber();
        };
    }

    private Map<String, Object> readObject(int depth) {
        expect('{');
        Map<String, Object> result = new LinkedHashMap<>();
        skipWhitespace();
        if (peek() == '}') {
            cursor++;
            return result;
        }
        while (true) {
            skipWhitespace();
            String key = readString();
            skipWhitespace();
            expect(':');
            skipWhitespace();
            result.put(key, readValue(depth + 1));
            skipWhitespace();
            char separator = next();
            if (separator == '}') {
                return result;
            }
            if (separator != ',') {
                throw fail("对象里期望 , 或 }，实际是 " + separator);
            }
        }
    }

    private List<Object> readArray(int depth) {
        expect('[');
        List<Object> result = new ArrayList<>();
        skipWhitespace();
        if (peek() == ']') {
            cursor++;
            return result;
        }
        while (true) {
            skipWhitespace();
            result.add(readValue(depth + 1));
            skipWhitespace();
            char separator = next();
            if (separator == ']') {
                return result;
            }
            if (separator != ',') {
                throw fail("数组里期望 , 或 ]，实际是 " + separator);
            }
        }
    }

    private String readString() {
        expect('"');
        StringBuilder out = new StringBuilder();
        while (true) {
            char current = next();
            if (current == '"') {
                return out.toString();
            }
            if (current != '\\') {
                out.append(current);
                continue;
            }
            char escape = next();
            switch (escape) {
                case '"' -> out.append('"');
                case '\\' -> out.append('\\');
                case '/' -> out.append('/');
                case 'b' -> out.append('\b');
                case 'f' -> out.append('\f');
                case 'n' -> out.append('\n');
                case 'r' -> out.append('\r');
                case 't' -> out.append('\t');
                case 'u' -> out.append(readUnicodeEscape());
                default -> throw fail("不认识的转义 \\" + escape);
            }
        }
    }

    /**
     * {@code \\uXXXX} 直接按 UTF-16 码元 append。代理对不用特殊处理：
     * 高低两个码元各来一次，拼在 StringBuilder 里天然就是一个完整的码点。
     */
    private char readUnicodeEscape() {
        if (cursor + 4 > text.length()) {
            throw fail("\\u 后面不足四位");
        }
        String hex = text.substring(cursor, cursor + 4);
        cursor += 4;
        try {
            return (char) Integer.parseInt(hex, 16);
        } catch (NumberFormatException error) {
            throw fail("\\u 后面不是十六进制：" + hex);
        }
    }

    private Object readLiteral(String literal, Object value) {
        if (!text.startsWith(literal, cursor)) {
            throw fail("期望字面量 " + literal);
        }
        cursor += literal.length();
        return value;
    }

    private Object readNumber() {
        int start = cursor;
        if (peek() == '-') {
            cursor++;
        }
        boolean fractional = false;
        while (cursor < text.length()) {
            char current = text.charAt(cursor);
            if (current >= '0' && current <= '9') {
                cursor++;
            } else if (current == '.' || current == 'e' || current == 'E'
                    || current == '+' || current == '-') {
                fractional = true;
                cursor++;
            } else {
                break;
            }
        }
        String token = text.substring(start, cursor);
        if (token.isEmpty() || "-".equals(token)) {
            throw fail("期望一个数字");
        }
        if (!fractional) {
            try {
                // 整数优先给 Long：durationMs / updated / sizeBytes 都是整数，
                // 走 Double 会让 9007199254740993 这种值悄悄变形。
                return Long.valueOf(token);
            } catch (NumberFormatException overflow) {
                return Double.valueOf(token);
            }
        }
        try {
            return Double.valueOf(token);
        } catch (NumberFormatException error) {
            throw fail("不是合法的数字：" + token);
        }
    }

    private void skipWhitespace() {
        while (cursor < text.length()) {
            char current = text.charAt(cursor);
            if (current == ' ' || current == '\t' || current == '\n' || current == '\r') {
                cursor++;
            } else {
                return;
            }
        }
    }

    private char peek() {
        if (cursor >= text.length()) {
            throw fail("JSON 提前结束");
        }
        return text.charAt(cursor);
    }

    private char next() {
        char current = peek();
        cursor++;
        return current;
    }

    private void expect(char expected) {
        char current = next();
        if (current != expected) {
            throw fail("期望 " + expected + "，实际是 " + current);
        }
    }

    private IllegalArgumentException fail(String reason) {
        return new IllegalArgumentException("JSON 第 " + cursor + " 个字符处：" + reason);
    }
}
