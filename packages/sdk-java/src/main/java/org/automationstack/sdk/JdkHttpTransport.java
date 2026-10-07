package org.automationstack.sdk;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse.BodyHandlers;
import java.util.Map;

public final class JdkHttpTransport implements Transport {

    public static final JdkHttpTransport INSTANCE = new JdkHttpTransport();

    private final HttpClient client = newClient();

    static HttpClient newClient() {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
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
