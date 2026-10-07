package org.automationstack.sdk;

import java.time.Duration;
import java.util.Map;

public record HttpRequest(
        String url, String method, Map<String, String> headers, byte[] body, Duration timeout) {
}
