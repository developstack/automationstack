package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 手写编码器。它写出来的每一个字节都要能被服务端的 zod 收下。 */
class JsonEncoderTest {

    @Test
    void encodesPrimitives() {
        assertEquals("null", Json.encode(null));
        assertEquals("true", Json.encode(true));
        assertEquals("42", Json.encode(42));
        assertEquals("42", Json.encode(42L));
        assertEquals("\"hi\"", Json.encode("hi"));
    }

    @Test
    void keepsObjectKeyOrder() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("b", 1);
        body.put("a", 2);
        // 顺序不是为了好看：请求体在日志里要能与 Node 版逐字比对。
        assertEquals("{\"b\":1,\"a\":2}", Json.encode(body));
    }

    @Test
    void escapesControlCharactersAndQuotes() {
        assertEquals("\"a\\\"b\"", Json.encode("a\"b"));
        assertEquals("\"a\\\\b\"", Json.encode("a\\b"));
        assertEquals("\"a\\nb\"", Json.encode("a\nb"));
        assertEquals("\"a\\tb\"", Json.encode("a\tb"));
        assertEquals("\"\\u0000\"", Json.encode("\u0000"));
        assertEquals("\"\\u001f\"", Json.encode("\u001f").toLowerCase(java.util.Locale.ROOT));
    }

    @Test
    void emitsCjkRaw() {
        // 不转成 \\uXXXX：请求头写死了 UTF-8，转义只会让请求体大三倍、让人读不懂。
        assertEquals("\"用例\"", Json.encode("用例"));
    }

    @Test
    void escapesLoneSurrogate() {
        // 消息被按 char 截断时可能劈开一对代理项。转义掉，别产生非法 UTF-8。
        assertEquals("\"\\ud83d\"", Json.encode("\ud83d").toLowerCase(java.util.Locale.ROOT));
        assertEquals("\"\uD83D\uDE00\"", Json.encode("\uD83D\uDE00"));
    }

    @Test
    void encodesNestedStructures() {
        Map<String, Object> inner = new LinkedHashMap<>();
        inner.put("sourceRef", "PAY-1");
        assertEquals("{\"results\":[{\"sourceRef\":\"PAY-1\"}]}",
                Json.encode(Map.of("results", List.of(inner))));
    }

    @Test
    void rejectsUnsupportedType() {
        assertThrows(IllegalArgumentException.class, () -> Json.encode(new Object()));
    }

    @Test
    void rejectsRunawayNesting() {
        // 自引用的结构在这里必须炸，而不是把栈耗光。
        List<Object> self = new ArrayList<>();
        self.add(self);
        assertThrows(IllegalArgumentException.class, () -> Json.encode(self));
    }
}
