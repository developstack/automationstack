package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

final class Wire {

    private Wire() {
    }

    static String requiredString(Map<String, Object> raw, String key) {
        Object value = raw.get(key);
        if (value instanceof String text) {
            return text;
        }
        throw new IllegalArgumentException("对账单里缺少字符串字段 " + key + "（拿到的是 " + value + "）");
    }

    static String stringOrEmpty(Map<String, Object> raw, String key) {
        Object value = raw.get(key);
        return value instanceof String text ? text : "";
    }

    static String nullableString(Map<String, Object> raw, String key) {
        Object value = raw.get(key);
        return value instanceof String text ? text : null;
    }

    static int intOrDefault(Map<String, Object> raw, String key, int fallback) {
        Object value = raw.get(key);
        return value instanceof Number number ? number.intValue() : fallback;
    }

    static boolean boolOrDefault(Map<String, Object> raw, String key, boolean fallback) {
        Object value = raw.get(key);
        return value instanceof Boolean flag ? flag.booleanValue() : fallback;
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> objectList(Map<String, Object> raw, String key) {
        Object value = raw.get(key);
        List<Map<String, Object>> result = new ArrayList<>();
        if (!(value instanceof List<?> list)) {
            return result;
        }
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                result.add((Map<String, Object>) map);
            }
        }
        return result;
    }
}
