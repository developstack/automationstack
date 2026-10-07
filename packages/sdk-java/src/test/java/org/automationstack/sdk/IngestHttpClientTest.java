package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class IngestHttpClientTest {

    private final List<Long> slept = new ArrayList<>();

    private IngestHttpClient client(TestFixtures.RecordingTransport transport) {
        return new IngestHttpClient(TestFixtures.BASE_URL, TestFixtures.TOKEN, transport,
                3, Duration.ofSeconds(1), slept::add);
    }

    @Test
    void sendsBearerTokenAndJsonContentType() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson("{\"ok\":true}");
        client(transport).postJson("/ingest/executions", Map.of("a", 1));
        HttpRequest request = transport.requests.get(0);
        assertEquals("https://qa.example.com/ingest/executions", request.url());
        assertEquals("POST", request.method());
        assertEquals("Bearer " + TestFixtures.TOKEN, request.headers().get("authorization"));
        assertEquals("application/json", request.headers().get("content-type"));
        assertEquals("{\"a\":1}", new String(request.body(), StandardCharsets.UTF_8));
    }

    @Test
    void retriesNetworkFailuresThenSucceeds() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueFailure(new IOException("connection reset"))
                .queueJson("{\"ok\":true}");
        assertEquals(Boolean.TRUE, client(transport).postJson("/ingest/executions", Map.of()).get("ok"));
        assertEquals(2, transport.requests.size());
        assertEquals(List.of(500L), slept, "退避从 500ms 起，指数增长");
    }

    @Test
    void retriesFiveHundredsAndTooManyRequests() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queue(TestFixtures.json(503, "upstream down"))
                .queue(TestFixtures.json(429, "slow down"))
                .queueJson("{\"ok\":true}");
        client(transport).postJson("/ingest/executions", Map.of());
        assertEquals(3, transport.requests.size());
        assertEquals(List.of(500L, 1000L), slept);
    }

    @Test
    void neverRetriesFourHundreds() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queue(TestFixtures.json(400, "{\"message\":\"idempotencyKey 不是合法的 uuid\"}"));
        IngestHttpError error = assertThrows(IngestHttpError.class,
                () -> client(transport).postJson("/ingest/executions", Map.of()));
        assertEquals(1, transport.requests.size(), "4xx 重发一百次还是同一条 400");
        assertTrue(slept.isEmpty());
        assertTrue(error.getMessage().contains("idempotencyKey 不是合法的 uuid"));
    }

    @Test
    void givesUpAfterMaxAttempts() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queue(TestFixtures.json(500, "boom"))
                .queue(TestFixtures.json(500, "boom"))
                .queue(TestFixtures.json(500, "boom"));
        assertThrows(IngestHttpError.class, () -> client(transport).postJson("/ingest/executions", Map.of()));
        assertEquals(3, transport.requests.size());
        assertEquals(2, slept.size(), "最后一次尝试之后不再退避");
    }

    @Test
    void survivesNonJsonErrorBodies() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queue(TestFixtures.json(502, "<html>Bad Gateway</html>"))
                .queue(TestFixtures.json(502, "<html>Bad Gateway</html>"))
                .queue(TestFixtures.json(502, "<html>Bad Gateway</html>"));
        IngestHttpError error = assertThrows(IngestHttpError.class,
                () -> client(transport).postJson("/ingest/executions", Map.of()));
        assertTrue(error.getMessage().contains("502"));
    }

    @Test
    void putBinaryCarriesNoAuthorizationHeader() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queue(TestFixtures.json(200, ""));
        client(transport).putBinary("https://r2.example.com/obj?sig=x", "image/png", new byte[] {1, 2});
        HttpRequest request = transport.requests.get(0);
        assertEquals("PUT", request.method());
        assertFalse(request.headers().containsKey("authorization"));
        assertEquals("image/png", request.headers().get("content-type"));
    }
}
