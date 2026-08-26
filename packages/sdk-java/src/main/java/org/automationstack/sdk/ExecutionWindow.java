package org.automationstack.sdk;

import java.time.Instant;

/** 这一轮什么时候开始、什么时候结束。两个都可以是 null。 */
public record ExecutionWindow(Instant startedAt, Instant finishedAt) {
}
