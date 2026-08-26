package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 从 {@link JsonParser} 吐出来的裸 Map 里取字段的几个小工具。**包内可见。**
 *
 * <p>存在的理由和 Python 那边写 {@code from_wire} 是同一条：一个拼错的键名如果只在
 * 取值的那一行悄悄变成 null，它炸的时机恰好是**测试全跑完之后**——最不该出错的那一刻。
 * 这里把「必填」和「可缺」分成两个方法，必填缺了立刻抛，缺了也无所谓的走带兜底的那个。
 */
final class Wire {

    private Wire() {
    }

    /** 必填字符串。缺了或不是字符串就抛——那说明契约漂移了，不该静默当空串用。 */
    static String requiredString(Map<String, Object> raw, String key) {
        Object value = raw.get(key);
        if (value instanceof String text) {
            return text;
        }
        throw new IllegalArgumentException("对账单里缺少字符串字段 " + key + "（拿到的是 " + value + "）");
    }

    /** 可缺字符串，缺了给空串。用在那些「服务端本期一定给、以后可能不给」的字段上。 */
    static String stringOrEmpty(Map<String, Object> raw, String key) {
        Object value = raw.get(key);
        return value instanceof String text ? text : "";
    }

    /** 语义上真的可以是 null 的字段（比如 outOfScope 的 runName）。 */
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

    /**
     * 取一个「对象数组」字段。字段缺失或为 null 时返回空列表——四个数组里任何一个
     * 为空都是完全正常的一轮，没必要为它抛。
     */
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
