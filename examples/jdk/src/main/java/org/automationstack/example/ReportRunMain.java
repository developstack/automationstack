package org.automationstack.example;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.automationstack.sdk.AttachmentInput;
import org.automationstack.sdk.AttachmentKind;
import org.automationstack.sdk.AutomationCaseResult;
import org.automationstack.sdk.AutomationStackReporter;
import org.automationstack.sdk.CaseResultInput;
import org.automationstack.sdk.ExitSignal;
import org.automationstack.sdk.IngestEmptyWriteError;
import org.automationstack.sdk.RunOutcome;

/**
 * 第一入口：**不带任何测试框架**地上报一轮结论。
 *
 * <pre>{@code
 * mvn -q exec:java -Dexec.mainClass=org.automationstack.example.ReportRunMain
 * }</pre>
 *
 * <p>它要证明的是「SDK 不绑测试框架」这句话不是修辞：这个文件里没有 JUnit，
 * 结果是硬编码的。你手上无论是什么在产结论——TestNG、Cucumber、一个 shell 脚本的
 * 输出、甚至一份 CSV——搬进 {@link CaseResultInput} 的那几行代码留在你自己的仓库里，
 * 换框架时改的是那几行，不用等 SDK 发版。
 *
 * <h2>退出码</h2>
 *
 * 最后那句 {@code System.exit(ExitSignal.exitCode())} 是这份示例的重点之一。
 * **库里一行 exit 都没有**（那会把宿主的测试框架整个掐掉），进程该怎么结束由入口决定——
 * 这里就是入口，所以这里调它是正当的。
 */
public final class ReportRunMain {

    private ReportRunMain() {
    }

    public static void main(String[] args) {
        AutomationStackReporter reporter = AutomationStackReporter.builder()
                // 唯一的配置来源：三个 AS_* 变量。没有「上报目标」，也没有 runId——
                // 归属由用例的 sourceRef 自己解析。
                .env(EnvFile.load())
                .build();
        System.out.println("本轮幂等键：" + reporter.idempotencyKey());

        // 一整轮的结论**先攒着**。跑一条报一条既慢又碎，而且没法在一份对账单里
        // 把这一轮讲清楚。
        reporter.addResults(List.of(
                CaseResultInput.of("AUTO-LOGIN-001", AutomationCaseResult.PASSED)
                        .withDurationMs(1_240L),
                CaseResultInput.of("AUTO-CART-002", AutomationCaseResult.PASSED)
                        .withDurationMs(880L),
                CaseResultInput.of("AUTO-PAY-003", AutomationCaseResult.FAILED,
                        "断言失败：期望订单总额 ¥128.00，实际 ¥118.00")
                        .withDurationMs(2_010L),
                CaseResultInput.of("AUTO-REPORT-004", AutomationCaseResult.SKIPPED,
                        "依赖的导出服务未部署，本轮跳过"),
                // 平台上没有这条用例：留着它是为了让对账单的「未匹配」那一行有内容。
                CaseResultInput.of("AUTO-NOT-ON-PLATFORM-999", AutomationCaseResult.PASSED)));

        attachFailureEvidence(reporter);

        try {
            RunOutcome outcome = reporter.finish();
            System.out.println("执行记录 id：" + outcome.receipt().executionId());
        } catch (IngestEmptyWriteError error) {
            // finish() 在抛之前已经把对账单原样打出来了；这里只补一句人该做什么。
            System.err.println(error.getMessage());
            System.err.println("下一步：确认平台上有未提交的测试任务收着这些 sourceRef。");
        }

        // ⚠️ 这一句必须留在最后。没有它，「一条都没写进去」在 CI 上表现为绿色——
        // 那是最危险的失败方式。
        System.exit(ExitSignal.exitCode());
    }

    /**
     * 失败现场随本轮一起上报。
     *
     * <p>附件是**降级**而不是失败：R2 没配置时服务端回 {@code storageConfigured: false}，
     * 结论照常写进去，对账单里会说明这次降级。示例默认就跑在这种状态下。
     */
    private static void attachFailureEvidence(AutomationStackReporter reporter) {
        Path screenshot = Path.of("artifacts", "AUTO-PAY-003.png");
        if (Files.isReadable(screenshot)) {
            reporter.addAttachment(AttachmentInput.ofFile(
                    "AUTO-PAY-003", AttachmentKind.SCREENSHOT, screenshot.toString()));
        }
        reporter.addAttachment(AttachmentInput.builder("AUTO-PAY-003", AttachmentKind.LOG)
                .body("""
                        [12:03:41] 打开结算页
                        [12:03:43] 选择优惠券「新人立减 10 元」
                        [12:03:44] 断言订单总额
                        AssertionError: 期望 ¥128.00，实际 ¥118.00
                        """.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                .fileName("AUTO-PAY-003.log")
                .build());
    }
}
