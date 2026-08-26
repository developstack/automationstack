package org.automationstack.sdk;

import java.util.Locale;

/**
 * 自动化能报出来的结论。**不含 {@code untested}**——「跑了但没结论」不是一件能表达的事。
 *
 * <p>Node / Python 那边是字符串联合类型，Java 这边用 enum：拼错的字符串在那两家是
 * 运行时的一条 400，在 Java 里可以在编译期就没了。线上值取 {@link #wire()}，
 * 与另外两家**逐字**一致（全小写）。
 */
public enum AutomationCaseResult {
    BLOCKED,
    FAILED,
    PASSED,
    SKIPPED;

    /** 发到线上的值。与服务端 {@code automationCaseResultSchema} 同一份词汇表。 */
    public String wire() {
        return name().toLowerCase(Locale.ROOT);
    }
}
