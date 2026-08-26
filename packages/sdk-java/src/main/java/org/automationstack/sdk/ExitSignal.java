package org.automationstack.sdk;

/**
 * 「让这个进程带着非零退出码结束」这件事，在 Java 上的落法。
 *
 * <h2>问题</h2>
 *
 * §7.2 第 4 条要的是：{@code writtenTo} 为空时**既抛异常又让退出码非零**。两条通道都要，
 * 因为异常在测试框架的钩子里常常被吞掉，而静默成功是最坏的情况——QA 以为结果进去了，
 * 实际一条都没写。
 *
 * <p>Node 那边有 {@code process.exitCode = 1}：一个「软」标记，不打断任何东西，
 * 进程自然跑完时带着它退出。Python 那边没有这个东西，只能用
 * {@code atexit} + {@code os._exit(1)}，代价是跳过之后注册的钩子。
 *
 * <p>**Java 两样都没有。** 没有可写的 exitCode 变量；能真正决定退出码的只有
 * {@link System#exit(int)} 和 {@link Runtime#halt(int)}，而这两个在库里调都是错的：
 *
 * <ul>
 *   <li>{@code System.exit()} 会立刻开始关闭流程。跑在 Surefire / Gradle 里时，
 *       它把测试框架**整个掐掉**：Surefire 的 XML 报告没写完、JaCoCo 的覆盖率没 dump、
 *       用户自己的 {@code @AfterAll} 没跑。人拿到的是一个「没有测试报告」的构建，
 *       而真正的原因（一条结果都没写进去）恰恰印在被掐掉的那段输出里。</li>
 *   <li>{@code Runtime.halt()} 更狠，连关闭钩子都不跑。</li>
 *   <li>在关闭钩子里 {@code halt(1)} 能强行改掉退出码，但那会打断**别的**关闭钩子——
 *       Python 那边的 docstring 已经把这条路的代价写清楚了，也正因为如此，
 *       它的 pytest 插件明确**不走**那条通道，改用 {@code session.exitstatus}。</li>
 * </ul>
 *
 * <h2>做法</h2>
 *
 * 库只负责**记录**，退出由**入口**负责：
 *
 * <ul>
 *   <li>{@code finish()} 发现 {@code writtenTo} 为空时调 {@link #markFailure()}，
 *       然后抛 {@link IngestEmptyWriteError}。</li>
 *   <li>写 {@code main()} 的人（比如 {@code examples/} 里那份）在最后
 *       {@code System.exit(ExitSignal.exitCode())}——**在自己的进程里**调 exit 是完全
 *       正当的，那是他自己的进程。</li>
 *   <li>跑在 JUnit 下的人不用管这件事：{@code AutomationStackExtension} 会把它翻译成
 *       一次**测试失败**，Surefire / Gradle 自然会让构建非零退出。那是这两个工具
 *       自己的、干净的机制，和 Python 插件用 {@code session.exitstatus} 是同一个思路。</li>
 * </ul>
 *
 * <p>记号是**进程级**的（静态字段），和 Node 的 {@code process.exitCode}、Python 的
 * 模块级开关同构：一个进程里建两个 reporter 时，任何一个失败都该让整个进程判失败。
 * 想让某个 reporter 不参与这个记号的，构造时传 {@code markExitSignal(false)}。
 */
public final class ExitSignal {

    /** volatile：结果可能是在框架的某个工作线程上收的，退出码在主线程上读。 */
    private static volatile boolean pendingFailure;

    private ExitSignal() {
    }

    /** 记一笔「这一轮有结果没写进去」。**不打断任何东西。** */
    public static void markFailure() {
        pendingFailure = true;
    }

    public static boolean pendingFailure() {
        return pendingFailure;
    }

    /** 入口处该用的退出码。给 {@code System.exit()} 用，别在库里调。 */
    public static int exitCode() {
        return pendingFailure ? 1 : 0;
    }

    /** 只给测试用：一个 JVM 里跑很多条用例，记号得能清干净。 */
    static void reset() {
        pendingFailure = false;
    }
}
