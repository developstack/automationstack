package org.automationstack.example;

import java.util.List;
import org.automationstack.sdk.AutomationCaseResult;
import org.automationstack.sdk.AutomationStackReporter;
import org.automationstack.sdk.CaseResultInput;
import org.automationstack.sdk.ExitSignal;
import org.automationstack.sdk.IngestEmptyWriteError;

/**
 * 第二入口：专门演示**「一条都没写进去」时进程非零退出**这条路径。
 *
 * <pre>{@code
 * mvn -q exec:java -Dexec.mainClass=org.automationstack.example.ReportEmptyWriteMain
 * echo $?   # 期望：1
 * }</pre>
 *
 * <p>CI 里最危险的失败不是红，是**绿着但什么都没写**：QA 以为结论进去了，
 * 报告页上却一条没变，而流水线一路绿灯。这份入口把那条路径显式跑一遍，
 * 让你能亲眼看见退出码是 1、并且对账单逐条说清了为什么。
 *
 * <p>做法：上报一批平台上根本不存在的 sourceRef。服务端会返回 **200** 加一份
 * {@code writtenTo} 为空、{@code unmatchedCases} 逐条列出的对账单——
 * 状态码表达「请求本身有没有问题」，对账单表达「业务上发生了什么」，两件事不混为一谈。
 *
 * <p>⚠️ 这个类**不 import 任何测试框架**。「非零退出」这件事跟 JUnit 无关，
 * 用 JUnit 演示它只会让人以为那是 JUnit 的功劳。
 */
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
            // 对账单在 finish() 里已经原样打出来了。异常的 message 里带的是
            // 服务端逐条给出的理由，一个字都没被 SDK 概括。
            System.err.println(error.getMessage());
        }

        // 两条通道：上面的异常可能被某个框架的钩子吞掉，而这个进程级记号不会。
        System.exit(ExitSignal.exitCode());
    }
}
