package org.automationstack.sdk.junit5;

import java.io.PrintWriter;
import java.io.StringWriter;
import org.automationstack.sdk.AutomationCaseResult;

/**
 * 把 JUnit 说的那件事搬成核心包的结论。
 *
 * <p>**这里是整个薄壳唯一有判断的地方，而它判断的只有「JUnit 说的这件事对应哪个结论」。**
 * 分批、幂等、重试、对账单、退出码一律在核心包里——换成 TestNG / Cucumber 的壳时
 * 重写的只有这个文件。这条边界与 {@code pytest-automationstack} 那边是同一条。
 *
 * <table>
 *   <caption>对应表</caption>
 *   <tr><th>JUnit 的情况</th><th>上报的结论</th><th>为什么</th></tr>
 *   <tr><td>通过</td><td>{@code passed}</td><td></td></tr>
 *   <tr><td>断言失败 / 抛异常</td><td>{@code failed}</td><td></td></tr>
 *   <tr><td>{@code @BeforeEach} / {@code @BeforeAll} 炸了</td><td>{@code blocked}</td>
 *       <td>用例**没跑起来**，被测功能既没通过也没失败；报 {@code failed} 会让失败清单上
 *           多出一条查不动的假失败</td></tr>
 *   <tr><td>{@code Assumptions.assumeTrue(false)}</td><td>{@code skipped}</td>
 *       <td>前置条件不成立，这一轮没验它——与 pytest 的 {@code pytest.skip()} 同义</td></tr>
 *   <tr><td>{@code @Disabled}</td><td>{@code skipped}</td><td></td></tr>
 *   <tr><td>{@code @AfterEach} 炸了</td><td>**不改结论**</td>
 *       <td>断言已经跑完了，被测功能的结论已经有了；teardown 崩了是脚本自己的问题，
 *           它在 JUnit 自己的输出里一目了然，不该把一条通过的用例说成没通过</td></tr>
 * </table>
 */
public final class ReportMapping {

    private ReportMapping() {
    }

    public static AutomationCaseResult failedResult(boolean blockedBySetup) {
        return blockedBySetup ? AutomationCaseResult.BLOCKED : AutomationCaseResult.FAILED;
    }

    /**
     * 失败时的原始输出。**截断由核心包统一做**（§5.1.1「SDK 侧负责截断」）。
     *
     * <p>薄壳这里不截：截两次意味着上限有两处定义，而
     * {@code MAX_INGEST_COMMENT_LENGTH} 只该有一处。这里只负责把 Throwable
     * 变成字符串——带上完整堆栈，超长的那部分会由核心包转成 log 附件。
     */
    /**
     * 前置条件不成立（{@code Assumptions.assumeTrue(false)}）时的说明——**只要那句话，不要堆栈**。
     *
     * <p>与 {@link #failureText} 的区别不是风格，是这两件事的诊断价值本来就不同：
     * 断言失败时堆栈**就是**证据，指着被测代码里出事的那一行；而 assumption 抛出的位置
     * 永远是 {@code assumeTrue} 那一行本身，后面几十帧全是 JUnit 自己的反射调用，
     * 被测代码一行都没跑过——那份堆栈里没有任何人需要的信息。
     *
     * <p>照 {@code failureText} 走会实际造成两处损失，不是洁癖：
     * <ol>
     *   <li>comment 里那句「搜索索引未就绪」被埋进 2KB 的 JUnit 帧里，人得翻着找；</li>
     *   <li>那 2KB **超过** {@code MAX_INGEST_COMMENT_LENGTH}，于是每一条因前置条件跳过的
     *       用例都会额外传一个 log 附件。附件按任务计配额（500 条/任务），
     *       一个动辄几百条 skip 的回归轮次能把配额吃光，把真正需要附件的失败挡在外面。</li>
     * </ol>
     *
     * <p>这不是与 pytest 那边分家，恰恰是**对齐**：两边的规则都是「超长才转附件」，
     * 只是 pytest 的 skip longrepr 本来就是一行短字符串，永远够不着那个上限；
     * JUnit 把同一件事包成了带完整堆栈的异常，照搬就会触发上面那条本不该触发的分支。
     * {@code @Disabled} 那条路径走的是 JUnit 直接给的 reason 字符串，本来就只有一句话——
     * 同样是「跳过」，两条路径不该一个一句话、一个 2KB。
     */
    public static String abortedText(Throwable error) {
        if (error == null) {
            return null;
        }
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.toString() : message.strip();
    }

    public static String failureText(Throwable error) {
        if (error == null) {
            return null;
        }
        StringWriter buffer = new StringWriter();
        try (PrintWriter writer = new PrintWriter(buffer)) {
            error.printStackTrace(writer);
        }
        String text = buffer.toString().strip();
        return text.isEmpty() ? error.toString() : text;
    }
}
