package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 手写解析器。它只需要读懂服务端会回的那点东西，但读错一个字节就是一次假成功。 */
class JsonParserTest {

    @Test
    void parsesReceiptShape() {
        Map<String, Object> parsed = JsonParser.parseObject(
                "{\"executionId\":\"e1\",\"writtenTo\":[{\"runId\":\"r1\",\"updated\":3}]}");
        assertEquals("e1", parsed.get("executionId"));
        List<?> writtenTo = (List<?>) parsed.get("writtenTo");
        assertEquals(3L, ((Map<?, ?>) writtenTo.get(0)).get("updated"));
    }

    @Test
    void prefersLongForIntegers() {
        // 浮点会让 updated 打成 "3.0"，对账单上那是明显的错字。
        assertInstanceOf(Long.class, JsonParser.parse("7"));
        assertInstanceOf(Double.class, JsonParser.parse("7.5"));
        assertEquals(-12L, JsonParser.parse("-12"));
        assertEquals(1500.0, JsonParser.parse("1.5e3"));
    }

    @Test
    void parsesLiterals() {
        assertEquals(Boolean.TRUE, JsonParser.parse("true"));
        assertEquals(Boolean.FALSE, JsonParser.parse("false"));
        assertNull(JsonParser.parse("null"));
    }

    @Test
    void parsesEscapesAndSurrogatePairs() {
        assertEquals("a\"b", JsonParser.parse("\"a\\\"b\""));
        assertEquals("a\nb", JsonParser.parse("\"a\\nb\""));
        assertEquals("用例", JsonParser.parse("\"\\u7528\\u4f8b\""));
        assertEquals("\uD83D\uDE00", JsonParser.parse("\"\\ud83d\\ude00\""));
    }

    @Test
    void ignoresWhitespace() {
        assertEquals(Map.of(), JsonParser.parseObject("  {  }  "));
        assertEquals(List.of(), JsonParser.parse(" [\n\t] "));
    }

    @Test
    void roundTripsThroughEncoder() {
        String encoded = Json.encode(Map.of("a", List.of(1, "二", true)));
        assertEquals(List.of(1L, "二", true), ((Map<?, ?>) JsonParser.parse(encoded)).get("a"));
    }

    @Test
    void rejectsTrailingGarbage() {
        // 半截响应体（连接被掐断）必须炸，不能当成一份「什么都没写」的对账单。
        assertThrows(IllegalArgumentException.class, () -> JsonParser.parse("{} {}"));
        assertThrows(IllegalArgumentException.class, () -> JsonParser.parse("{\"a\":1"));
    }

    @Test
    void rejectsNonObjectForParseObject() {
        IllegalArgumentException error =
                assertThrows(IllegalArgumentException.class, () -> JsonParser.parseObject("[]"));
        assertTrue(error.getMessage() != null && !error.getMessage().isEmpty());
    }
}
