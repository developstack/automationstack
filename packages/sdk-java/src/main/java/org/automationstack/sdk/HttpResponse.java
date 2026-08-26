package org.automationstack.sdk;

/** 一次响应。4xx/5xx 也走这里，**不抛异常**——理由见 {@link JdkHttpTransport}。 */
public record HttpResponse(int status, byte[] body) {
}
