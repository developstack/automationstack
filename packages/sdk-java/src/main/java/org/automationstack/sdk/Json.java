package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

final class Json {

    private static final int MAX_DEPTH = 64;

    private Json() {
    }

    static String encode(Object value) {
        StringBuilder out = new StringBuilder();
        write(out, value, 0);
        return out.toString();
    }

    private static void write(StringBuilder out, Object value, int depth) {
        if (depth > MAX_DEPTH) {
            throw new IllegalArgumentException("JSON 嵌套超过 " + MAX_DEPTH + " 层，多半是自引用");
        }
        switch (value) {
            case null -> out.append("null");
            case String text -> writeString(out, text);
            case Boolean flag -> out.append(flag.booleanValue() ? "true" : "false");
            case Integer number -> out.append(number.intValue());
            case Long number -> out.append(number.longValue());
            case Double number -> writeDouble(out, number.doubleValue());
            case Map<?, ?> map -> writeObject(out, map, depth);
            case List<?> list -> writeArray(out, list, depth);
            default -> throw new IllegalArgumentException(
                    "不认识的 JSON 值类型：" + value.getClass().getName()
                            + "——本包只发字符串/整数/布尔/数组/对象/null 六种");
        }
    }

    private static void writeObject(StringBuilder out, Map<?, ?> map, int depth) {
        out.append('{');
        boolean first = true;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (!first) {
                out.append(',');
            }
            first = false;
            if (!(entry.getKey() instanceof String key)) {
                throw new IllegalArgumentException("JSON 对象的键必须是字符串：" + entry.getKey());
            }
            writeString(out, key);
            out.append(':');
            write(out, entry.getValue(), depth + 1);
        }
        out.append('}');
    }

    private static void writeArray(StringBuilder out, List<?> list, int depth) {
        out.append('[');
        for (int index = 0; index < list.size(); index++) {
            if (index > 0) {
                out.append(',');
            }
            write(out, list.get(index), depth + 1);
        }
        out.append(']');
    }

    private static void writeDouble(StringBuilder out, double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            throw new IllegalArgumentException("JSON 里没有 NaN / Infinity 的写法：" + value);
        }
        if (value == Math.rint(value) && Math.abs(value) < 1e15) {
            out.append((long) value);
            return;
        }
        out.append(value);
    }

    private static void writeString(StringBuilder out, String value) {
        out.append('"');
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            switch (current) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                default -> {
                    if (current < 0x20 || isLoneSurrogate(value, index)) {
                        out.append(String.format("\\u%04x", (int) current));
                    } else {
                        out.append(current);
                    }
                }
            }
        }
        out.append('"');
    }

    private static boolean isLoneSurrogate(String value, int index) {
        char current = value.charAt(index);
        if (Character.isHighSurrogate(current)) {
            return index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1));
        }
        if (Character.isLowSurrogate(current)) {
            return index == 0 || !Character.isHighSurrogate(value.charAt(index - 1));
        }
        return false;
    }
}
