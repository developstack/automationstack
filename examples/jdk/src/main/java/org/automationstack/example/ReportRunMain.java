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

public final class ReportRunMain {

    private ReportRunMain() {
    }

    public static void main(String[] args) {
        AutomationStackReporter reporter = AutomationStackReporter.builder()
                .env(EnvFile.load())
                .build();
        System.out.println("本轮幂等键：" + reporter.idempotencyKey());

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
                CaseResultInput.of("AUTO-NOT-ON-PLATFORM-999", AutomationCaseResult.PASSED)));

        attachFailureEvidence(reporter);

        try {
            RunOutcome outcome = reporter.finish();
            System.out.println("执行记录 id：" + outcome.receipt().executionId());
        } catch (IngestEmptyWriteError error) {
            System.err.println(error.getMessage());
            System.err.println("下一步：确认平台上有未提交的测试任务收着这些 sourceRef。");
        }

        System.exit(ExitSignal.exitCode());
    }

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
