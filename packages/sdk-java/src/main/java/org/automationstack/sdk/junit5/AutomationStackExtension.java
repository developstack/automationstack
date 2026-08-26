package org.automationstack.sdk.junit5;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.automationstack.sdk.AttachmentInput;
import org.automationstack.sdk.AttachmentKind;
import org.automationstack.sdk.AutomationCaseResult;
import org.automationstack.sdk.AutomationStackReporter;
import org.automationstack.sdk.CaseResultInput;
import org.automationstack.sdk.ContractLimits;
import org.automationstack.sdk.ReporterConfigError;
import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.LifecycleMethodExecutionExceptionHandler;
import org.junit.jupiter.api.extension.TestWatcher;

/**
 * JUnit 5 薄壳：**只做注册与收集，不做任何业务判断**。
 *
 * <p>它做的事只有三件：从 {@link AutomationStack} 上取 sourceRef、把 JUnit 的结论
 * 搬成 {@link CaseResultInput}、在整个测试计划结束时调一次 {@code finish()}。
 * 分批、幂等键、重试、对账单、退出码——一行都不在这里，全在核心包。
 * 换成 TestNG 的壳时要重写的只有这个文件和 {@link ReportMapping}。
 *
 * <p>用法：
 * <pre>{@code
 * @ExtendWith(AutomationStackExtension.class)
 * class CheckoutTest {
 *     @Test
 *     @AutomationStack("PAY-CART-031")
 *     void addsItemToCart() { ... }
 * }
 * }</pre>
 *
 * <h2>为什么不是一个单独的 Maven 模块</h2>
 *
 * pytest 那边必须拆成独立发行包，因为 pytest 用 entry point **自动注册**插件——
 * 装上就生效，不拆开就等于强迫所有人装 pytest。JUnit 没有这回事：
 * {@code @ExtendWith} 是显式的，不写这行注解，这个类连加载都不会加载。
 * 所以这里同一个 artifact、单独一个包就够了，用户少配一个坐标、少一个版本要对齐。
 * {@code junit-jupiter-api} 在 pom 里是 {@code provided} 作用域——不传递，
 * 「运行时依赖为零」这句话对纯核心包的用户仍然成立。
 *
 * <h2>退出码</h2>
 *
 * 这里**不碰** {@code ExitSignal}（构造 reporter 时传的是 {@code markExitSignal(false)}）。
 * 一条都没写进去时抛出去的异常会由 JUnit 记成一次测试计划级失败，Surefire / Gradle
 * 自己就会让构建非零退出。和 Python 插件用 {@code session.exitstatus} 而不是
 * {@code os._exit(1)} 是同一个思路：用宿主自己的机制，别在别人的进程里动刀。
 */
public final class AutomationStackExtension
        implements BeforeAllCallback, LifecycleMethodExecutionExceptionHandler, TestWatcher {

    /** 关掉上报又不想删注解时用：{@code -Dautomationstack.enabled=false}。 */
    public static final String ENABLED_PROPERTY = "automationstack.enabled";

    private static final ExtensionContext.Namespace NAMESPACE =
            ExtensionContext.Namespace.create(AutomationStackExtension.class);

    private static final String SESSION_KEY = "session";

    @Override
    public void beforeAll(ExtensionContext context) {
        session(context);
    }

    /**
     * setup 炸了的用例记 {@code blocked} 而不是 {@code failed}（见 {@link ReportMapping}）。
     *
     * <p>JUnit 把 {@code @BeforeEach} 的异常照样报成这条用例失败，光看
     * {@link #testFailed} 分不出来，只能在这里先记一笔再原样抛回去。
     * **必须重新抛出**，否则等于把 setup 的失败吞了。
     */
    @Override
    public void handleBeforeEachMethodExecutionException(
            ExtensionContext context, Throwable throwable) throws Throwable {
        session(context).blockedBySetup.add(context.getUniqueId());
        throw throwable;
    }

    @Override
    public void handleBeforeAllMethodExecutionException(
            ExtensionContext context, Throwable throwable) throws Throwable {
        session(context).blockedBySetup.add(context.getUniqueId());
        throw throwable;
    }

    /**
     * {@code @AfterEach} 炸了**不改结论**：断言已经跑完，被测功能的结论已经有了。
     * 原样抛回去，让它出现在 JUnit 自己的输出里。
     */
    @Override
    public void handleAfterEachMethodExecutionException(
            ExtensionContext context, Throwable throwable) throws Throwable {
        throw throwable;
    }

    @Override
    public void testSuccessful(ExtensionContext context) {
        record(context, AutomationCaseResult.PASSED, null);
    }

    @Override
    public void testFailed(ExtensionContext context, Throwable cause) {
        Session session = session(context);
        boolean blocked = session.blockedBySetup.contains(context.getUniqueId())
                || parentBlocked(session, context);
        record(context, ReportMapping.failedResult(blocked), ReportMapping.failureText(cause));
    }

    /**
     * {@code Assumptions.assumeTrue(false)}：前置条件不成立，这一轮没验它。
     *
     * <p>⚠️ 这里用 {@link ReportMapping#abortedText} 而不是 {@code failureText}：
     * assumption 的堆栈永远只指向 {@code assumeTrue} 那一行加几十帧 JUnit 反射，
     * 被测代码一行都没跑过。理由写在 {@code abortedText} 上，不重复。
     */
    @Override
    public void testAborted(ExtensionContext context, Throwable cause) {
        record(context, AutomationCaseResult.SKIPPED, ReportMapping.abortedText(cause));
    }

    @Override
    public void testDisabled(ExtensionContext context, Optional<String> reason) {
        record(context, AutomationCaseResult.SKIPPED, reason.orElse(null));
    }

    private static boolean parentBlocked(Session session, ExtensionContext context) {
        Optional<ExtensionContext> parent = context.getParent();
        while (parent.isPresent()) {
            if (session.blockedBySetup.contains(parent.get().getUniqueId())) {
                return true;
            }
            parent = parent.get().getParent();
        }
        return false;
    }

    private void record(ExtensionContext context, AutomationCaseResult result, String message) {
        Session session = session(context);
        String sourceRef = sourceRef(context);
        if (sourceRef == null) {
            // 没标注解的用例**不上报**，但也不静默：收工时统一说一句有几条没标。
            session.unmarked++;
            return;
        }
        if (session.reporter == null) {
            return;
        }
        session.reporter.addResult(new CaseResultInput(sourceRef, result, null, message));
        // 超长的原始输出转成 log 附件：正文里留截断后的那一段，完整堆栈进附件。
        // 判断阈值用的是核心包的常量，薄壳这里不自己定义上限。
        if (message != null && message.length() > ContractLimits.MAX_INGEST_COMMENT_LENGTH) {
            session.reporter.addAttachment(AttachmentInput.ofBytes(
                    sourceRef, AttachmentKind.LOG, message.getBytes(StandardCharsets.UTF_8)));
        }
    }

    private static String sourceRef(ExtensionContext context) {
        return sourceRefOf(context.getTestMethod().orElse(null), context.getTestClass().orElse(null));
    }

    /**
     * 方法上的优先于类上的。
     *
     * <p>拆成一个不认识 {@link ExtensionContext} 的静态方法，是为了让它能被直接测——
     * 否则要验「注解怎么找」就得造一个 {@code ExtensionContext} 的替身，那个接口
     * 每个小版本都在加方法，替身会在升 JUnit 时莫名其妙地编译不过。
     *
     * <p>用的是 {@code getAnnotation} 而不是 platform 的 {@code AnnotationSupport}：
     * {@link AutomationStack} 上标了 {@code @Inherited}，父类上标的自然能拿到，
     * 而少引一个 API 就少一处会随 JUnit 版本动的东西。
     */
    static String sourceRefOf(Method method, Class<?> testClass) {
        if (method != null) {
            AutomationStack onMethod = method.getAnnotation(AutomationStack.class);
            if (onMethod != null) {
                return onMethod.value();
            }
        }
        if (testClass != null) {
            AutomationStack onClass = testClass.getAnnotation(AutomationStack.class);
            if (onClass != null) {
                return onClass.value();
            }
        }
        return null;
    }

    private static Session session(ExtensionContext context) {
        // 挂在**根** context 的 store 上：那份 store 在整个测试计划结束时才关闭，
        // 于是 finish() 一轮只会调一次，哪怕有几十个测试类都注册了这个扩展。
        return context.getRoot()
                .getStore(NAMESPACE)
                .getOrComputeIfAbsent(SESSION_KEY, key -> new Session(), Session.class);
    }

    /**
     * 一整轮共用的那一个 reporter。{@code CloseableResource#close()} 由 JUnit 在
     * 根 context 关闭时调用——也就是整个测试计划的收尾，等价于 pytest 的
     * {@code pytest_sessionfinish}。
     */
    static final class Session implements ExtensionContext.Store.CloseableResource {

        final Set<String> blockedBySetup = ConcurrentHashMap.newKeySet();
        final List<String> notes = new ArrayList<>();
        final AutomationStackReporter reporter;
        int unmarked;

        Session() {
            this.reporter = createReporter(notes);
        }

        @Override
        public void close() {
            for (String note : notes) {
                System.out.println(note);
            }
            if (unmarked > 0) {
                System.out.println(
                        "automationstack：有 " + unmarked + " 条用例没标 @AutomationStack，未上报");
            }
            if (reporter == null) {
                return;
            }
            if (reporter.pendingResultCount() == 0) {
                // 一条都没收到就别发空请求：那只会在平台上多出一次「什么都没写」的执行记录。
                System.out.println("automationstack：这一轮没有已标注的用例结果，未上报");
                return;
            }
            // finish() 里的 IngestEmptyWriteError 故意**不接**：让它冒出去。
            // JUnit 会把它记成测试计划级失败，Surefire / Gradle 自然让构建非零退出。
            reporter.finish();
        }

        private static AutomationStackReporter createReporter(List<String> notes) {
            if ("false".equalsIgnoreCase(System.getProperty(ENABLED_PROPERTY))) {
                notes.add("automationstack：已被 -D" + ENABLED_PROPERTY + "=false 关闭，未上报");
                return null;
            }
            try {
                return AutomationStackReporter.builder().markExitSignal(false).build();
            } catch (ReporterConfigError error) {
                // 本机跑测试的人没配 AS_TOKEN 是常态，不该因此让他的构建红掉；
                // 但也不能一声不吭——CI 上真配漏了时，这一行就是唯一的线索。
                notes.add("automationstack：未上报（" + error.getMessage() + "）");
                return null;
            }
        }
    }
}
