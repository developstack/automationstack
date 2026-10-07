package org.automationstack.sdk;

import java.time.Instant;

public record ExecutionWindow(Instant startedAt, Instant finishedAt) {
}
