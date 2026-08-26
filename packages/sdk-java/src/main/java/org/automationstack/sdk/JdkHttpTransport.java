package org.automationstack.sdk;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse.BodyHandlers;
import java.util.Map;

/**
 * 默认的 {@link Transport}，用 JDK 内置的 {@link HttpClient}。
 *
 * <p>**没有 OkHttp、没有 Apache HttpClient、没有 AWS SDK**（§7.3 / D28）。附件走预签名
 * PUT，三种语言的 SDK 都只需要一个 HTTP 客户端；引一个 S3 SDK 会给用户的构建加几十兆、
 * 还会跟他自己那份撞版本，而它换来的能力这里一样都用不上。JDK 11 起 HttpClient 就在
 * 标准库里，本包的下限是 Java 21，没有任何理由再引一个。
 *
 * <p>⚠️ 4xx/5xx 在这里**不抛**，而是照常返回 {@link HttpResponse}：让「服务端明确拒了」
 * 和「根本没连上」变成同一种异常的话，两件事的重试策略正好相反那一点就没法表达了
 * （见 {@link IngestHttpClient}）。
 *
 * <p>整个进程共用一个 {@link HttpClient} 实例：它内部带连接池，每次请求新建一个
 * 等于每次都重新握手，一轮几百个附件时那笔开销很可观。
 */
public final class JdkHttpTransport implements Transport {

    public static final JdkHttpTransport INSTANCE = new JdkHttpTransport();

    private final HttpClient client = newClient();

    /**
     * ⚠️ **必须钉死 HTTP/1.1。**
     *
     * <p>JDK 的 {@link HttpClient} 默认版本是 {@code HTTP_2}。对 {@code https://} 那是好事——
     * 版本由 TLS 的 ALPN 协商，谈不拢就干净地退回 1.1。但对 {@code http://} 它走的是 **h2c
     * 明文升级**：先发一个带 {@code Connection: Upgrade, HTTP2-Settings} 的请求，然后**等**
     * 对面回 101。很多服务端（Node 的 {@code http} 模块、一批老代理）既不回 101 也不按 1.1
     * 正常应答，于是这个请求就一直挂到超时。
     *
     * <p>这不是假想：本仓库 {@code examples/jdk} 对着自家开发服务器（Hono on Node，
     * {@code http://localhost:3000}）跑第一次真实上报时，每个请求都挂满 30 秒然后
     * {@code HttpTimeoutException}，重试三轮全挂——而同一个地址 {@code curl} 秒回 200。
     * 探针结果：{@code HTTP_2 → 超时 8107ms}，{@code HTTP_1_1 → 200，22ms}。
     *
     * <p>自建/内网部署用 {@code http://} 是常态，也就是说默认值会让这批用户**每一次上报
     * 全部超时**。而 HTTP/2 在这里换来的东西是零：ingest 一轮就是几个顺序请求，多路复用
     * 没有用武之地，keep-alive 连接池 1.1 一样有。拿「一整类用户完全用不了」换一个用不上的
     * 特性，是明显亏的买卖，所以这里不做协商，直接钉死。
     */
    static HttpClient newClient() {
        return HttpClient.newBuilder()
                // 见上：绝不能让它默认去谈 HTTP/2。
                .version(HttpClient.Version.HTTP_1_1)
                // 跟随重定向会把 Authorization 头带到别的主机上去，那是泄露 token 的经典方式。
                // baseUrl 末尾斜杠已经在 ReporterConfig 里削掉了，正常路径上不该有 301。
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    private JdkHttpTransport() {
    }

    @Override
    public HttpResponse send(HttpRequest request) throws Exception {
        java.net.http.HttpRequest.Builder builder = java.net.http.HttpRequest.newBuilder()
                .uri(URI.create(request.url()))
                .timeout(request.timeout())
                .method(request.method(), request.body() == null
                        ? BodyPublishers.noBody()
                        : BodyPublishers.ofByteArray(request.body()));
        for (Map.Entry<String, String> header : request.headers().entrySet()) {
            builder.header(header.getKey(), header.getValue());
        }
        java.net.http.HttpResponse<byte[]> response =
                client.send(builder.build(), BodyHandlers.ofByteArray());
        return new HttpResponse(response.statusCode(), response.body());
    }
}
