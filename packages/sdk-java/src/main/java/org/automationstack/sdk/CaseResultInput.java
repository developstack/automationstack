package org.automationstack.sdk;

/**
 * SDK 的**公开输入结构**。这是本包唯一认识的「一条结果长什么样」。
 *
 * <p>刻意**不掺任何测试框架的类型**：JUnit 的 {@code TestExecutionResult}、TestNG 的
 * {@code ITestResult} 都是它们随时会改的东西，让它们出现在这里等于把本包的大版本
 * 焊死在框架版本上。用户（或者 {@code org.automationstack.sdk.junit5} 那层薄壳）
 * 把框架给的对象搬成下面这个形状，那十几行搬运代码在**薄壳里或用户的仓库里**——
 * 框架升级时改的是那几行，不用等核心包发版。
 *
 * <p>这也是为什么本包的运行时依赖是零：不装 JUnit 也能用它上报。
 *
 * @param sourceRef  用例上的 {@code sourceRef}，归属**唯一**的输入（§3.7）。
 *                   没有任何办法指定「写进哪个测试任务」，那是刻意的（D31）。
 * @param result     结论。
 * @param durationMs ⚠️ 服务端收下但本期不落库。照填不误。
 * @param message    失败时的一行说明，落进 {@code test_run_cases.comment}。
 *                   超过 {@link ContractLimits#MAX_INGEST_COMMENT_LENGTH} 会被截断——
 *                   完整堆栈请作为 {@code log} 附件传，{@code comment} 是给人在失败清单上
 *                   一眼扫的，不是日志容器。
 */
public record CaseResultInput(String sourceRef, AutomationCaseResult result, Long durationMs, String message) {

    public CaseResultInput {
        if (sourceRef == null || sourceRef.isEmpty()) {
            // 空 sourceRef 发过去必然掉进对账单的「未匹配」里，把真正该看的那几条淹掉。
            throw new IllegalArgumentException("CaseResultInput 需要一个非空的 sourceRef");
        }
        if (result == null) {
            throw new IllegalArgumentException("CaseResultInput 需要一个结论（" + sourceRef + "）");
        }
    }

    /** 最常见的那种：只有 sourceRef 和结论。 */
    public static CaseResultInput of(String sourceRef, AutomationCaseResult result) {
        return new CaseResultInput(sourceRef, result, null, null);
    }

    public static CaseResultInput of(String sourceRef, AutomationCaseResult result, String message) {
        return new CaseResultInput(sourceRef, result, null, message);
    }

    public CaseResultInput withDurationMs(Long value) {
        return new CaseResultInput(sourceRef, result, value, message);
    }

    public CaseResultInput withMessage(String value) {
        return new CaseResultInput(sourceRef, result, durationMs, value);
    }
}
