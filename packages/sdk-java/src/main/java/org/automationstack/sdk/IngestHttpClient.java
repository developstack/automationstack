package org.automationstack.sdk;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

public final class IngestHttpClient {

    private static final int DEFAULT_MAX_ATTEMPTS = 3;
    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);
    private static final long RETRY_BASE_DELAY_MS = 500;
    private static final int HTTP_TOO_MANY_REQUESTS = 429;
    private static final int HTTP_SERVER_ERROR_FLOOR = 500;

    @FunctionalInterface
    public interface Sleeper {
        void sleep(long millis) throws InterruptedException;
    }

    private final String baseUrl;
    private final int maxAttempts;
    private final Sleeper sleeper;
    private final Duration timeout;
    private final String token;
    private final Transport transport;

    public IngestHttpClient(
            String baseUrl, String token, Transport transport,
            Integer maxAttempts, Duration timeout, Sleeper sleeper) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.transport = transport == null ? JdkHttpTransport.INSTANCE : transport;
        this.maxAttempts = maxAttempts == null ? DEFAULT_MAX_ATTEMPTS : maxAttempts;
        this.timeout = timeout == null ? DEFAULT_TIMEOUT : timeout;
        this.sleeper = sleeper == null ? Thread::sleep : sleeper;
    }

    public Map<String, Object> postJson(String path, Map<String, Object> body) {
        String url = baseUrl + path;
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("authorization", "Bearer " + token);
        headers.put("content-type", "application/json");
        HttpResponse response = send(new HttpRequest(
                url, "POST", headers, Json.encode(body).getBytes(StandardCharsets.UTF_8), timeout));
        return JsonParser.parseObject(new String(response.body(), StandardCharsets.UTF_8));
    }

    public void putBinary(String url, String contentType, byte[] body) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("content-type", contentType);
        send(new HttpRequest(url, "PUT", headers, body, timeout));
    }

    private static boolean isRetriableStatus(int status) {
        return status == HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR_FLOOR;
    }

    private HttpResponse send(HttpRequest request) {
        RuntimeException lastError = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            Attempt outcome = attempt(request);
            if (outcome.response() != null) {
                return outcome.response();
            }
            lastError = outcome.error();
            if (!outcome.retriable() || attempt == maxAttempts) {
                throw lastError;
            }
            backoff(RETRY_BASE_DELAY_MS << (attempt - 1));
        }
        throw lastError == null
                ? new IllegalStateException(request.url() + " 一次都没有尝试（maxAttempts 配成了 0？）")
                : lastError;
    }

    private void backoff(long millis) {
        try {
            sleeper.sleep(millis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("重试退避期间被中断", interrupted);
        }
    }

    private record Attempt(HttpResponse response, RuntimeException error, boolean retriable) {
    }

    private Attempt attempt(HttpRequest request) {
        HttpResponse response;
        try {
            response = transport.send(request);
        } catch (Exception error) {
            return new Attempt(null, new IllegalStateException(
                    request.url() + " 没连上：" + error, error), true);
        }
        if (response.status() >= 200 && response.status() < 300) {
            return new Attempt(response, null, false);
        }
        IngestHttpError error = new IngestHttpError(
                response.status(), readServerMessage(response.body()), request.url());
        return new Attempt(null, error, isRetriableStatus(response.status()));
    }

    private static String readServerMessage(byte[] body) {
        if (body == null || body.length == 0) {
            return null;
        }
        try {
            Object parsed = JsonParser.parse(new String(body, StandardCharsets.UTF_8));
            if (parsed instanceof Map<?, ?> map && map.get("message") instanceof String message) {
                return message;
            }
        } catch (RuntimeException notJson) {
            return null;
        }
        return null;
    }
}
