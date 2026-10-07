package org.automationstack.example;

import java.util.List;
import org.automationstack.sdk.AutomationCaseResult;
import org.automationstack.sdk.AutomationStackReporter;
import org.automationstack.sdk.CaseResultInput;
import org.automationstack.sdk.ExitSignal;
import org.automationstack.sdk.IngestEmptyWriteError;

public final class ReportEmptyWriteMain {

    private ReportEmptyWriteMain() {
    }

    public static void main(String[] args) {
        AutomationStackReporter reporter = AutomationStackReporter.builder()
                .env(EnvFile.load())
                .build();
        reporter.addResults(List.of(
                CaseResultInput.of("AUTO-DOES-NOT-EXIST-901", AutomationCaseResult.PASSED),
                CaseResultInput.of("AUTO-DOES-NOT-EXIST-902", AutomationCaseResult.FAILED, "boom")));

        try {
            reporter.finish();
            System.out.println("这一轮写进去了——换几条真不存在的 sourceRef 再试。");
        } catch (IngestEmptyWriteError error) {
            System.err.println(error.getMessage());
        }

        System.exit(ExitSignal.exitCode());
    }
}
