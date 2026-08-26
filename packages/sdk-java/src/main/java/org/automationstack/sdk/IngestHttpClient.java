package org.automationstack.sdk;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 唯一的网络层：加鉴权头、编解 JSON、重试。
 *
 * <p>**只有一个 HTTP 客户端，没有 S3 SDK**（§7.3 / D28）：附件走预签名 PUT，
 * 三种语言的 SDK 都只需要发个 POST 和一个 PUT。
 */
public final class IngestHttpClient {

    private static final int DEFAULT_MAX_ATTEMPTS = 3;
    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);
    private static final long RETRY_BASE_DELAY_MS = 500;
    private static final int HTTP_TOO_MANY_REQUESTS = 429;
    private static final int HTTP_SERVER_ERROR_FLOOR = 500;

    /** 退避期间怎么等。抽出来是为了让测试不用真的睡 1.5 秒。 */
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

    /** ingest 端点。返回体由调用方按契约当成对应的对账单类型用。 */
    public Map<String, Object> postJson(String path, Map<String, Object> body) {
        String url = baseUrl + path;
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("authorization", "Bearer " + token);
        headers.put("content-type", "application/json");
        HttpResponse response = send(new HttpRequest(
                url, "POST", headers, Json.encode(body).getBytes(StandardCharsets.UTF_8), timeout));
        return JsonParser.parseObject(new String(response.body(), StandardCharsets.UTF_8));
    }

    /**
     * 直传 R2 的那一步。
     *
     * <p>**不带 Authorization**：签名已经在 URL 里，多带一个 Authorization 头会让部分
     * S3 兼容实现按「双重鉴权」直接 400。{@code contentType} 必须逐字用 presign 回来的值
     * （它进了签名的 {@code SignedHeaders}）。
     */
    public void putBinary(String url, String contentType, byte[] body) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("content-type", contentType);
        send(new HttpRequest(url, "PUT", headers, body, timeout));
    }

    /**
     * 只重试「再试一次可能就好了」的那些：网络层异常、429、5xx。
     *
     * <p>4xx **一律不重试**——请求体本身有问题，重发一百次还是同一条 400，而重试会把
     * 「SDK 发错了」伪装成「网络不稳」，人在日志里看到的是超时。重试之所以安全，
     * 是因为幂等键在请求体里、跨重试是同一个（§5.2）：服务端要么整轮重跑
     * （{@code completedAt is null}），要么直接返回缓存的对账单。
     */
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
        // 循环至少跑一次且每条分支都 return/throw，这里不可达；写出来是为了让
        // 「maxAttempts 被配成 0」这种配置错误有一句能读懂的话，而不是 NPE。
        throw lastError == null
                ? new IllegalStateException(request.url() + " 一次都没有尝试（maxAttempts 配成了 0？）")
                : lastError;
    }

    private void backoff(long millis) {
        try {
            sleeper.sleep(millis);
        } catch (InterruptedException interrupted) {
            // 别把中断吞掉：调用方（比如被 Ctrl-C 的构建）要能看见它。
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
            // 连不上、DNS 失败、超时。这些正是重试存在的理由。
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

    /**
     * 服务端的错误体固定是 {@code { error, message }}；取不出来就返回 null，
     * **绝不自己编一句**——编一句会让人以为那是平台说的话。
     */
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
            // 体不是 JSON（反代返回的 HTML 错误页之类）。这时没有服务端原文可透传，
            // 宁可只报状态码。
            return null;
        }
        return null;
    }
}
