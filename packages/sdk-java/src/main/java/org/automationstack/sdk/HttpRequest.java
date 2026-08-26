package org.automationstack.sdk;

import java.time.Duration;
import java.util.Map;

/**
 * 一次请求。故意**不叫** {@code java.net.http.HttpRequest} 的别名：{@link Transport}
 * 那层抽象的整个意义就是让测试不依赖 JDK 的 HttpClient，把 JDK 的类型摆在接口上
 * 就等于把它焊回去了。
 */
public record HttpRequest(
        String url, String method, Map<String, String> headers, byte[] body, Duration timeout) {
}
